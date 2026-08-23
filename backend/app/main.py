import sys
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send
from app.core.limiter import limiter
from app.core.config import settings, PROJECT_ROOT
from app.services.mongo_service import mongo_db
from app.api.v1.endpoints import documents, auth, resources, attendance, erp, admin_erp, portals, transport
from app.api.v1 import timetable
from app.api.v1 import alerts
from app.api.v1 import knowledge

# Setup logging
logging.basicConfig(level=settings.LOG_LEVEL)
logger = logging.getLogger(__name__)

# Maximum accepted request body size: 10 MB
MAX_UPLOAD_SIZE = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024


class ContentSizeLimitMiddleware:
    """
    Pure ASGI middleware that enforces a hard 10 MB request body limit.

    Dual-layer enforcement strategy:
    1. Fast-path: Reject immediately if Content-Length header declares > MAX_UPLOAD_SIZE.
       Handles well-behaved clients with zero body buffering.
    2. Stream-path: Wrap the `receive` callable to accumulate actual body bytes chunk
       by chunk. This defeats Transfer-Encoding: chunked bypass where no Content-Length
       header is sent. The moment the running byte total exceeds MAX_UPLOAD_SIZE the
       middleware fires a raw ASGI 413 response and drains remaining body chunks so the
       upstream TCP connection closes cleanly without hanging.

    Positioned outermost (added last, LIFO stack) so it intercepts every inbound
    HTTP request before CORS, routing, or body parsing begins.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Fast-path: Content-Length header present and already oversized.
        headers = dict(scope.get("headers", []))
        content_length_raw = headers.get(b"content-length")
        if content_length_raw is not None:
            try:
                content_length = int(content_length_raw)
            except ValueError:
                content_length = 0
            if content_length > MAX_UPLOAD_SIZE:
                await self._send_413(scope, receive, send)
                return

        # Stream-path: wrap receive() to count bytes as they arrive.
        # Catches chunked transfers that omit Content-Length entirely.
        bytes_received: int = 0
        limit_exceeded: bool = False

        async def limited_receive() -> dict:
            nonlocal bytes_received, limit_exceeded
            message = await receive()
            if limit_exceeded:
                # Body already rejected — keep draining to avoid TCP hang.
                return {"type": "http.disconnect"}
            chunk = message.get("body", b"")
            bytes_received += len(chunk)
            if bytes_received > MAX_UPLOAD_SIZE:
                limit_exceeded = True
                return {"type": "http.disconnect"}
            return message

        # Wrap the app call; if limit was hit mid-stream, send 413 directly.
        # We use a send wrapper to intercept the response only if needed.
        _response_started: list[bool] = [False]

        async def tracking_send(event: dict) -> None:
            if event.get("type") == "http.response.start":
                _response_started[0] = True
            await send(event)

        await self.app(scope, limited_receive, tracking_send)

        if limit_exceeded and not _response_started[0]:
            await self._send_413(scope, receive, send)

    @staticmethod
    async def _send_413(scope: Scope, receive: Receive, send: Send) -> None:
        """Emit a raw ASGI 413 JSON response."""
        body = (
            b'{"detail":"Payload Too Large. Maximum allowed size is '
            + str(MAX_UPLOAD_SIZE // (1024 * 1024)).encode()
            + b' MB."}'
        )
        await send({
            "type": "http.response.start",
            "status": 413,
            "headers": [
                [b"content-type", b"application/json"],
                [b"content-length", str(len(body)).encode()],
            ],
        })
        await send({"type": "http.response.body", "body": body, "more_body": False})


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan hook — runs once on startup before accepting requests.
    Creates all MongoDB indexes in the background so queries hitting these fields
    use index scans (IXSCAN) instead of full collection scans (COLLSCAN).
    background=True lets the server accept requests while indexes build on large collections.
    """
    try:
        logger.info("Creating MongoDB indexes...")

        # institutions — unique by university_id
        await mongo_db.institutions_collection.create_index("university_id", unique=True, background=True)

        # users — queried on every authenticated request via JWT validation in deps.py
        await mongo_db.users_collection.create_index("id", unique=True, background=True)
        await mongo_db.users_collection.create_index("email", unique=True, background=True)
        await mongo_db.users_collection.create_index("university_id", background=True)

        # students / teachers — duplicate-ID guards scoped by tenant
        await mongo_db.students_collection.create_index([("university_id", 1), ("student_id", 1)], unique=True, background=True)
        await mongo_db.teachers_collection.create_index([("university_id", 1), ("teacher_id", 1)], unique=True, background=True)

        # classes — queried by teacher portal (teacher_id) and student portal (grade + section)
        await mongo_db.classes_collection.create_index([("university_id", 1), ("class_id", 1)], unique=True, background=True)
        await mongo_db.classes_collection.create_index([("university_id", 1), ("teacher_id", 1)], background=True)
        await mongo_db.classes_collection.create_index([("university_id", 1), ("grade", 1), ("section", 1)], background=True)

        # substitutions — conflict-check queries filter on tenant + date + time_slot
        await mongo_db.substitutions_collection.create_index([("university_id", 1), ("date", 1), ("time_slot", 1)], background=True)

        # attendance — bulk upsert filter and reporting queries use tenant + student_id + date
        await mongo_db.student_attendance_collection.create_index([("university_id", 1), ("student_id", 1), ("date", 1)], background=True)

        # faculty attendance — reporting queries filter by tenant + teacher_id
        await mongo_db.faculty_attendance_collection.create_index([("university_id", 1), ("teacher_id", 1), ("date", 1)], background=True)

        # timetable jobs & active timetable
        await mongo_db.timetable_jobs_collection.create_index([("university_id", 1), ("job_id", 1)], unique=True, background=True)
        await mongo_db.active_timetable_collection.create_index([("university_id", 1), ("is_active", 1)], background=True)

        # knowledge documents — SHA-256 deduplication and ID lookup scoped by tenant
        await mongo_db.knowledge_collection.create_index([("university_id", 1), ("id", 1)], background=True)
        await mongo_db.knowledge_collection.create_index([("university_id", 1), ("sha256_hash", 1)], background=True)

        logger.info("MongoDB indexes created successfully.")

        # Always auto-seed core demo admin credentials so demo login works out-of-the-box
        try:
            from app.services.auth_service import create_user
            admin_users = [
                {
                    "email": "admin@campusnova.edu",
                    "password": "AdminPassword123!",
                    "full_name": "CampusNova System Admin",
                    "role": "admin",
                    "university_id": settings.DEMO_UNIVERSITY_ID,
                    "university_name": "CampusNova Demo University",
                    "is_demo": True,
                    "is_setup_complete": True,
                },
                {
                    "email": "demo-judge@campusnova.com",
                    "password": "judge123",
                    "full_name": "Hackathon Judge",
                    "role": "admin",
                    "university_id": settings.DEMO_UNIVERSITY_ID,
                    "university_name": "CampusNova Demo University",
                    "is_demo": True,
                    "is_setup_complete": True,
                }
            ]
            for u in admin_users:
                existing = await mongo_db.users_collection.find_one({"email": u["email"]})
                if not existing:
                    await create_user(u.copy())
                    logger.info(f"Auto-seeded admin user: {u['email']}")

            teachers_count = await mongo_db.teachers_collection.count_documents({"university_id": settings.DEMO_UNIVERSITY_ID})
            if teachers_count < 1:
                from app.services.seed_demo_service import seed_canonical_demo_data
                await seed_canonical_demo_data()
                logger.info("Auto-seeded canonical demo data successfully.")
        except Exception as seed_err:
            logger.warning("Admin accounts auto-seeding skipped/deferred: %s", seed_err)

        if settings.SEED_DEMO_DATA:
            try:
                # Auto-seed canonical demo knowledge if missing
                from app.services.seed_demo_knowledge import seed_canonical_demo_knowledge
                demo_doc_count = await mongo_db.knowledge_collection.count_documents({
                    "university_id": settings.DEMO_UNIVERSITY_ID,
                    "document_type": "INSTITUTIONAL_POLICY",
                })
                if demo_doc_count < 3:
                    await seed_canonical_demo_knowledge(settings.DEMO_UNIVERSITY_ID)
            except Exception as seed_err:
                logger.warning("Demo knowledge auto-seeding skipped/deferred: %s", seed_err)
    except Exception as e:
        logger.warning(f"Non-critical: MongoDB index creation skipped/delayed: {e}")
    yield
    # Shutdown: nothing to clean up — Motor client lifecycle is managed by MongoManager


app = FastAPI(title="CampusNova API", lifespan=lifespan)

# Attach rate limiter state and 429 exception handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ContentSizeLimitMiddleware — rejects payloads > 10 MB before body is consumed.
# Must be added AFTER CORS so the middleware stack order (LIFO) places it outermost.
app.add_middleware(CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(ContentSizeLimitMiddleware)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"message": "Internal Server Error"},
    )


@app.get("/health", tags=["health"])
async def health_check():
    return {"status": "ok", "environment": settings.ENVIRONMENT}


@app.get("/ready", tags=["health"])
async def readiness_check(response: Response):
    """Report whether the API can reach its required database."""
    try:
        await mongo_db.client.admin.command("ping")
    except Exception:
        logger.exception("Readiness check failed: MongoDB is unavailable")
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "unavailable", "dependency": "mongodb"}
    return {"status": "ready"}


app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(documents.router, prefix="/api/v1/documents", tags=["documents"])
app.include_router(timetable.router, prefix="/api/v1/timetable", tags=["Timetable"])
app.include_router(alerts.router, prefix="/api/v1/alerts", tags=["Alerts"])
app.include_router(knowledge.router, prefix="/api/v1/knowledge", tags=["Knowledge"])
app.include_router(resources.router, prefix="/api/v1/resources", tags=["Resources"])
app.include_router(attendance.router, prefix="/api/v1/attendance", tags=["Attendance"])
app.include_router(erp.router, prefix="/api/v1/erp", tags=["ERP"])
app.include_router(admin_erp.router, prefix="/api/v1/admin", tags=["Admin ERP"])
app.include_router(portals.router, prefix="/api/v1/portals", tags=["Portals"])
app.include_router(transport.router, prefix="/api/v1/transport", tags=["Transport"])

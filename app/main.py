import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send
from app.core.limiter import limiter
from app.core.config import settings
from app.services.mongo_service import mongo_db
from app.api.v1.endpoints import documents, auth, resources, attendance, erp, admin_erp, portals, transport
from app.api.v1 import timetable
from app.api.v1 import alerts
from app.api.v1 import knowledge

# Setup logging
logging.basicConfig(level=settings.LOG_LEVEL)
logger = logging.getLogger(__name__)

# Maximum accepted request body size: 10 MB
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10,485,760 bytes


class ContentSizeLimitMiddleware:
    """
    Pure ASGI middleware that rejects requests with a Content-Length header
    exceeding MAX_UPLOAD_SIZE (10 MB) before the body is ever consumed.
    This prevents memory exhaustion from oversized uploads (e.g., >10 MB base64 images).
    Positioned before CORSMiddleware so it fires on every inbound request first.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            headers = dict(scope.get("headers", []))
            content_length_raw = headers.get(b"content-length")
            if content_length_raw is not None:
                try:
                    content_length = int(content_length_raw)
                except ValueError:
                    content_length = 0
                if content_length > MAX_UPLOAD_SIZE:
                    response = JSONResponse(
                        status_code=413,
                        content={
                            "detail": f"Payload Too Large. Maximum allowed size is {MAX_UPLOAD_SIZE // (1024 * 1024)} MB."
                        },
                    )
                    await response(scope, receive, send)
                    return
        await self.app(scope, receive, send)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan hook — runs once on startup before accepting requests.
    Creates all MongoDB indexes in the background so queries hitting these fields
    use index scans (IXSCAN) instead of full collection scans (COLLSCAN).
    background=True lets the server accept requests while indexes build on large collections.
    """
    logger.info("Creating MongoDB indexes...")

    # users — queried on every authenticated request via JWT validation in deps.py
    await mongo_db.users_collection.create_index("id", unique=True, background=True)

    # students / teachers — duplicate-ID guards + portal lookups
    await mongo_db.students_collection.create_index("student_id", unique=True, background=True)
    await mongo_db.teachers_collection.create_index("teacher_id", unique=True, background=True)

    # classes — queried by teacher portal (teacher_id) and student portal (grade + section)
    await mongo_db.classes_collection.create_index("teacher_id", background=True)
    await mongo_db.classes_collection.create_index(
        [("grade", 1), ("section", 1)], background=True
    )

    # substitutions — conflict-check queries filter on date + time_slot
    await mongo_db.substitutions_collection.create_index(
        [("date", 1), ("time_slot", 1)], background=True
    )

    # attendance — bulk upsert filter and reporting queries use student_id + date
    await mongo_db.student_attendance_collection.create_index(
        [("student_id", 1), ("date", 1)], background=True
    )

    # faculty attendance — future reporting queries filter by teacher_id
    await mongo_db.faculty_attendance_collection.create_index("teacher_id", background=True)

    # knowledge documents — SHA-256 deduplication lookup
    await mongo_db.knowledge_collection.create_index("sha256_hash", unique=True, background=True)

    logger.info("MongoDB indexes created successfully.")
    yield
    # Shutdown: nothing to clean up — Motor client lifecycle is managed by MongoManager


app = FastAPI(title="CampusNova API", lifespan=lifespan)

# Attach rate limiter state and 429 exception handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ContentSizeLimitMiddleware — rejects payloads > 10 MB before body is consumed.
# Must be added AFTER CORS so the middleware stack order (LIFO) places it outermost.
app.add_middleware(CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # Must be False when allow_origins=["*"]; CORS spec rejects the combination
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
    return {"status": "ok", "message": "CampusNova API is running."}


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

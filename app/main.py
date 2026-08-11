import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.limiter import limiter
from app.core.config import settings
from app.services.mongo_service import mongo_db
from app.api.v1.endpoints import documents, auth, resources, attendance, erp, admin_erp, portals
from app.api.v1 import timetable
from app.api.v1 import alerts
from app.api.v1 import knowledge

# Setup logging
logging.basicConfig(level=settings.LOG_LEVEL)
logger = logging.getLogger(__name__)


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

# CORS — allow_credentials must be False when allow_origins=["*"] (CORS spec requirement)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # Must be False when allow_origins=["*"]; CORS spec rejects the combination
    allow_methods=["*"],
    allow_headers=["*"],
)


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

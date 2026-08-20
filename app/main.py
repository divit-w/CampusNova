import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.api.v1.endpoints import documents, auth, resources, attendance, erp, admin_erp, portals
from app.api.v1 import timetable
from app.api.v1 import alerts
from app.api.v1 import knowledge

# Setup logging
logging.basicConfig(level=settings.LOG_LEVEL)
logger = logging.getLogger(__name__)

app = FastAPI(title="CampusNova API")

# Set all CORS enabled origins
if settings.CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
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

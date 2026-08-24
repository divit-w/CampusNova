import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

class MongoManager:
    def __init__(self):
        self._client = None
        self._collections = {}

    @property
    def client(self) -> AsyncIOMotorClient:
        try:
            loop = asyncio.get_running_loop()
            if self._client is None or self._client.get_io_loop().is_closed() or self._client.get_io_loop() != loop:
                self._client = AsyncIOMotorClient(
                    settings.MONGO_URI,
                    maxPoolSize=settings.MONGO_MAX_POOL_SIZE,
                    minPoolSize=settings.MONGO_MIN_POOL_SIZE,
                    serverSelectionTimeoutMS=3000,
                )
                self._collections.clear()
        except Exception:
            if self._client is None:
                self._client = AsyncIOMotorClient(
                    settings.MONGO_URI,
                    maxPoolSize=settings.MONGO_MAX_POOL_SIZE,
                    minPoolSize=settings.MONGO_MIN_POOL_SIZE,
                    serverSelectionTimeoutMS=3000,
                )
                self._collections.clear()
        return self._client

    @client.setter
    def client(self, value):
        self._client = value
        self._collections.clear()

    @property
    def db(self):
        return self.client[settings.MONGO_DB_NAME]

    def _get_coll(self, name: str):
        if name not in self._collections:
            self._collections[name] = self.db.get_collection(name)
        return self._collections[name]

    _COLLECTION_MAP = {
        "knowledge_collection": "knowledge_documents",
        "users_collection": "users",
        "teachers_collection": "teachers",
        "substitutions_collection": "substitutions",
        "faculty_attendance_collection": "faculty_attendance",
        "student_attendance_collection": "student_attendance",
        "students_collection": "students",
        "rooms_collection": "rooms",
        "subjects_collection": "subjects",
        "classes_collection": "classes",
        "transport_routes_collection": "transport_routes",
        "timetable_jobs_collection": "timetable_jobs",
        "active_timetable_collection": "active_timetable",
        "document_audit_collection": "document_audits",
        "institutions_collection": "institutions",
        "alerts_collection": "alerts",
        "attendance_audit_collection": "attendance_audits",
    }

    def __getattr__(self, name: str):
        if name in self._COLLECTION_MAP:
            return self._get_coll(self._COLLECTION_MAP[name])
        raise AttributeError(f"'MongoManager' object has no attribute '{name}'")

mongo_db = MongoManager()

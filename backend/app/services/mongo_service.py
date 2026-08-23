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

    @property
    def knowledge_collection(self):
        return self._get_coll("knowledge_documents")

    @property
    def users_collection(self):
        return self._get_coll("users")

    @property
    def teachers_collection(self):
        return self._get_coll("teachers")

    @property
    def substitutions_collection(self):
        return self._get_coll("substitutions")

    @property
    def faculty_attendance_collection(self):
        return self._get_coll("faculty_attendance")

    @property
    def student_attendance_collection(self):
        return self._get_coll("student_attendance")

    @property
    def students_collection(self):
        return self._get_coll("students")

    @property
    def rooms_collection(self):
        return self._get_coll("rooms")

    @property
    def subjects_collection(self):
        return self._get_coll("subjects")

    @property
    def classes_collection(self):
        return self._get_coll("classes")

    @property
    def transport_routes_collection(self):
        return self._get_coll("transport_routes")

    @property
    def timetable_jobs_collection(self):
        return self._get_coll("timetable_jobs")

    @property
    def active_timetable_collection(self):
        return self._get_coll("active_timetable")

    @property
    def document_audit_collection(self):
        return self._get_coll("document_audits")

    @property
    def institutions_collection(self):
        return self._get_coll("institutions")

    @property
    def alerts_collection(self):
        return self._get_coll("alerts")

    @property
    def attendance_audit_collection(self):
        return self._get_coll("attendance_audits")

mongo_db = MongoManager()

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
    @knowledge_collection.setter
    def knowledge_collection(self, value):
        self._collections["knowledge_documents"] = value
    @knowledge_collection.deleter
    def knowledge_collection(self):
        self._collections.pop("knowledge_documents", None)

    @property
    def users_collection(self):
        return self._get_coll("users")
    @users_collection.setter
    def users_collection(self, value):
        self._collections["users"] = value
    @users_collection.deleter
    def users_collection(self):
        self._collections.pop("users", None)

    @property
    def teachers_collection(self):
        return self._get_coll("teachers")
    @teachers_collection.setter
    def teachers_collection(self, value):
        self._collections["teachers"] = value
    @teachers_collection.deleter
    def teachers_collection(self):
        self._collections.pop("teachers", None)

    @property
    def substitutions_collection(self):
        return self._get_coll("substitutions")
    @substitutions_collection.setter
    def substitutions_collection(self, value):
        self._collections["substitutions"] = value
    @substitutions_collection.deleter
    def substitutions_collection(self):
        self._collections.pop("substitutions", None)

    @property
    def faculty_attendance_collection(self):
        return self._get_coll("faculty_attendance")
    @faculty_attendance_collection.setter
    def faculty_attendance_collection(self, value):
        self._collections["faculty_attendance"] = value
    @faculty_attendance_collection.deleter
    def faculty_attendance_collection(self):
        self._collections.pop("faculty_attendance", None)

    @property
    def student_attendance_collection(self):
        return self._get_coll("student_attendance")
    @student_attendance_collection.setter
    def student_attendance_collection(self, value):
        self._collections["student_attendance"] = value
    @student_attendance_collection.deleter
    def student_attendance_collection(self):
        self._collections.pop("student_attendance", None)

    @property
    def students_collection(self):
        return self._get_coll("students")
    @students_collection.setter
    def students_collection(self, value):
        self._collections["students"] = value
    @students_collection.deleter
    def students_collection(self):
        self._collections.pop("students", None)

    @property
    def rooms_collection(self):
        return self._get_coll("rooms")
    @rooms_collection.setter
    def rooms_collection(self, value):
        self._collections["rooms"] = value
    @rooms_collection.deleter
    def rooms_collection(self):
        self._collections.pop("rooms", None)

    @property
    def subjects_collection(self):
        return self._get_coll("subjects")
    @subjects_collection.setter
    def subjects_collection(self, value):
        self._collections["subjects"] = value
    @subjects_collection.deleter
    def subjects_collection(self):
        self._collections.pop("subjects", None)

    @property
    def classes_collection(self):
        return self._get_coll("classes")
    @classes_collection.setter
    def classes_collection(self, value):
        self._collections["classes"] = value
    @classes_collection.deleter
    def classes_collection(self):
        self._collections.pop("classes", None)

    @property
    def transport_routes_collection(self):
        return self._get_coll("transport_routes")
    @transport_routes_collection.setter
    def transport_routes_collection(self, value):
        self._collections["transport_routes"] = value
    @transport_routes_collection.deleter
    def transport_routes_collection(self):
        self._collections.pop("transport_routes", None)

    @property
    def timetable_jobs_collection(self):
        return self._get_coll("timetable_jobs")
    @timetable_jobs_collection.setter
    def timetable_jobs_collection(self, value):
        self._collections["timetable_jobs"] = value
    @timetable_jobs_collection.deleter
    def timetable_jobs_collection(self):
        self._collections.pop("timetable_jobs", None)

    @property
    def active_timetable_collection(self):
        return self._get_coll("active_timetable")
    @active_timetable_collection.setter
    def active_timetable_collection(self, value):
        self._collections["active_timetable"] = value
    @active_timetable_collection.deleter
    def active_timetable_collection(self):
        self._collections.pop("active_timetable", None)

    @property
    def document_audit_collection(self):
        return self._get_coll("document_audits")
    @document_audit_collection.setter
    def document_audit_collection(self, value):
        self._collections["document_audits"] = value
    @document_audit_collection.deleter
    def document_audit_collection(self):
        self._collections.pop("document_audits", None)

    @property
    def institutions_collection(self):
        return self._get_coll("institutions")
    @institutions_collection.setter
    def institutions_collection(self, value):
        self._collections["institutions"] = value
    @institutions_collection.deleter
    def institutions_collection(self):
        self._collections.pop("institutions", None)

    @property
    def alerts_collection(self):
        return self._get_coll("alerts")
    @alerts_collection.setter
    def alerts_collection(self, value):
        self._collections["alerts"] = value
    @alerts_collection.deleter
    def alerts_collection(self):
        self._collections.pop("alerts", None)

    @property
    def attendance_audit_collection(self):
        return self._get_coll("attendance_audits")
    @attendance_audit_collection.setter
    def attendance_audit_collection(self, value):
        self._collections["attendance_audits"] = value
    @attendance_audit_collection.deleter
    def attendance_audit_collection(self):
        self._collections.pop("attendance_audits", None)

mongo_db = MongoManager()

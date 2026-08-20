from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

class MongoManager:
    def __init__(self):
        self.client = AsyncIOMotorClient(
            settings.MONGO_URI,
            maxPoolSize=200,           # Sustain up to 200 concurrent MongoDB operations before queuing
            minPoolSize=10,            # Pre-warm 10 connections — eliminates cold-connect latency
            serverSelectionTimeoutMS=3000,  # Fail fast (3s) if MongoDB is unreachable
        )
        self.db = self.client[settings.MONGO_DB_NAME]
        self.knowledge_collection = self.db.get_collection("knowledge_documents")
        self.users_collection = self.db.get_collection("users")
        self.teachers_collection = self.db.get_collection("teachers")
        self.substitutions_collection = self.db.get_collection("substitutions")
        self.faculty_attendance_collection = self.db.get_collection("faculty_attendance")
        self.student_attendance_collection = self.db.get_collection("student_attendance")
        self.students_collection = self.db.get_collection("students")
        self.rooms_collection = self.db.get_collection("rooms")
        self.subjects_collection = self.db.get_collection("subjects")
        self.classes_collection = self.db.get_collection("classes")
        self.transport_routes_collection = self.db.get_collection("transport_routes")
        # Timetable background job state — persists job status and result across the
        # 10s solver window. Allows the endpoint to return 202 immediately.
        self.timetable_jobs_collection = self.db.get_collection("timetable_jobs")

mongo_db = MongoManager()

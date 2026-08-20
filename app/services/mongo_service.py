from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

class MongoManager:
    def __init__(self):
        self.client = AsyncIOMotorClient(settings.MONGO_URI)
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

mongo_db = MongoManager()

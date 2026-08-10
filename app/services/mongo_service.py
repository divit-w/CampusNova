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

mongo_db = MongoManager()

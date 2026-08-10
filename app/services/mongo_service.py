from motor.motor_asyncio import AsyncIOMotorClient
from pydantic_settings import BaseSettings

class MongoSettings(BaseSettings):
    MONGO_URI: str = "mongodb://localhost:27017"
    MONGO_DB_NAME: str = "campusnova"

settings = MongoSettings()

class MongoManager:
    def __init__(self):
        self.client = AsyncIOMotorClient(settings.MONGO_URI)
        self.db = self.client[settings.MONGO_DB_NAME]
        self.knowledge_collection = self.db.get_collection("knowledge_documents")

mongo_db = MongoManager()

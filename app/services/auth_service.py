import uuid
from app.services.mongo_service import mongo_db
from app.core.security import get_password_hash, verify_password

async def get_user_by_email(email: str):
    return await mongo_db.users_collection.find_one({"email": email})

async def create_user(user_data: dict) -> dict:
    hashed_pw = get_password_hash(user_data.pop("password"))
    user_data["hashed_password"] = hashed_pw
    user_data["id"] = str(uuid.uuid4())
    
    await mongo_db.users_collection.insert_one(user_data.copy())
    return user_data

async def authenticate_user(email: str, password: str):
    user = await get_user_by_email(email)
    if not user:
        return None
    if not verify_password(password, user["hashed_password"]):
        return None
    return user

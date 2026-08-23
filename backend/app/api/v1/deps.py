from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from typing import List
from app.core.config import settings
from app.core.security import ALGORITHM
from app.services.mongo_service import mongo_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

async def _enrich_user_tenant_context(user: dict) -> dict:
    if "university_id" not in user or not user["university_id"]:
        user["university_id"] = settings.DEMO_UNIVERSITY_ID
    
    try:
        inst = await mongo_db.institutions_collection.find_one({"university_id": user["university_id"]})
        if inst:
            user["university_name"] = inst.get("name")
            user["is_setup_complete"] = inst.get("is_setup_complete", False)
        else:
            user["university_name"] = user.get("university_name")
            user["is_setup_complete"] = user.get("is_setup_complete", False)
    except Exception:
        user["university_name"] = user.get("university_name")
        user["is_setup_complete"] = user.get("is_setup_complete", False)
    return user

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.signing_key, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise credentials_exception
        
    user = await mongo_db.users_collection.find_one({"$or": [{"id": user_id}, {"email": user_id}]})
    if user is None:
        if payload.get("role"):
            user = {
                "id": user_id,
                "email": user_id,
                "role": payload.get("role"),
                "university_id": payload.get("university_id", settings.DEMO_UNIVERSITY_ID),
                "name": user_id.split("@")[0]
            }
        else:
            raise credentials_exception
    return await _enrich_user_tenant_context(user)

from fastapi import Query
def require_roles(allowed_roles: List[str]):
    def role_checker(current_user: dict = Depends(get_current_user)):
        if current_user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        return current_user
    return role_checker

async def get_current_user_ws(token: str = Query(...)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    try:
        payload = jwt.decode(token, settings.signing_key, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
        )
    except jwt.InvalidTokenError:
        raise credentials_exception
        
    user = await mongo_db.users_collection.find_one({"id": user_id})
    if user is None:
        raise credentials_exception
    return await _enrich_user_tenant_context(user)

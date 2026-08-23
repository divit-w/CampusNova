from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from app.schemas.auth import UserCreate, UserResponse, Token, GoogleAuthRequest
from app.services.auth_service import (
    get_user_by_email,
    create_user,
    authenticate_user,
    verify_google_credential,
    authenticate_or_create_google_user,
)
from app.core.security import create_access_token
from app.api.v1.deps import get_current_user, require_roles

router = APIRouter()

@router.post("/register", response_model=UserResponse)
async def register(
    user_in: UserCreate,
    current_user: dict = Depends(require_roles(["admin"]))
):
    existing = await get_user_by_email(user_in.email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
        
    doc = user_in.model_dump()
    if "university_id" not in doc or not doc["university_id"]:
        doc["university_id"] = current_user.get("university_id")
    user = await create_user(doc)
    return user

@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = await authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    access_token = create_access_token(
        subject=user["id"],
        role=user["role"],
        university_id=user.get("university_id")
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/google", response_model=Token)
async def google_login(body: GoogleAuthRequest):
    """
    Authenticates a user via Google OAuth Identity Token.
    Automatically provisions a unique, empty university tenant for new administrators.
    """
    verified_payload = await verify_google_credential(body.credential)
    user = await authenticate_or_create_google_user(verified_payload)
    
    access_token = create_access_token(
        subject=user["id"],
        role=user["role"],
        university_id=user.get("university_id")
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: dict = Depends(get_current_user)):
    return current_user


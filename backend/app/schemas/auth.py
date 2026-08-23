from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Literal, Optional

class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str
    full_name: str
    role: Literal["admin", "teacher", "student"]
    university_id: Optional[str] = None

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    full_name: str
    role: str
    university_id: Optional[str] = None
    university_name: Optional[str] = None
    is_demo: bool = False
    is_setup_complete: bool = False

class Token(BaseModel):
    access_token: str
    token_type: str

class GoogleAuthRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    credential: str

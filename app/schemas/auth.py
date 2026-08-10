from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Literal

class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str
    full_name: str
    role: Literal["admin", "teacher", "student"]

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    full_name: str
    role: str

class Token(BaseModel):
    access_token: str
    token_type: str

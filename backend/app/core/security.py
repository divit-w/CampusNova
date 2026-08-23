from datetime import datetime, timedelta, timezone
import bcrypt
import jwt
from app.core.config import settings

class PwdContext:
    def hash(self, password: str) -> str:
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
        return hashed.decode('utf-8')

    def verify(self, plain_password: str, hashed_password: str) -> bool:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

pwd_context = PwdContext()
ALGORITHM = "HS256"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(subject: str, role: str, expires_delta: timedelta = None, university_id: str = None) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {"sub": subject, "role": role, "exp": expire}
    if university_id:
        to_encode["university_id"] = university_id
    encoded_jwt = jwt.encode(to_encode, settings.signing_key, algorithm=ALGORITHM)
    return encoded_jwt

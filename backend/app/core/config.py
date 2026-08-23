import json
import secrets
from pathlib import Path
from typing import List, Literal, Optional, Union

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_DIR.parent
DEFAULT_CORS_ORIGINS = ["http://localhost:3000", "http://localhost:8000"]
DEVELOPMENT_SIGNING_KEY = secrets.token_urlsafe(48)


class Settings(BaseSettings):
    """Application configuration with production validation."""

    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    MONGO_URI: str = "mongodb://localhost:27017"
    MONGO_DB_NAME: str = "campusnova"
    MONGO_MAX_POOL_SIZE: int = Field(default=50, ge=1)
    MONGO_MIN_POOL_SIZE: int = Field(default=0, ge=0)

    # Production must set this to a stable secret in the hosting environment.
    SECRET_KEY: Optional[str] = None
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=60 * 24 * 8, ge=1)

    GEMINI_API_KEY: Optional[str] = None
    OPENROUTER_API_KEY: Optional[str] = None
    EMBEDDING_MODEL: str = "openai/text-embedding-3-small"
    LOG_LEVEL: str = "INFO"
    CHROMA_PERSIST_DIR: str = str(BACKEND_DIR / "runtime" / "chroma")
    UPLOADS_DIR: str = str(BACKEND_DIR / "runtime" / "uploads")
    MAX_UPLOAD_SIZE_MB: int = Field(default=10, ge=1, le=100)

    CORS_ORIGINS: Union[List[str], str] = DEFAULT_CORS_ORIGINS
    SEED_DEMO_DATA: bool = False
    CAMPUS_LAT: float = 28.6304
    CAMPUS_LON: float = 77.3711
    GEOFENCE_RADIUS_METERS: float = Field(default=500.0, gt=0)
    GOOGLE_CLIENT_ID: Optional[str] = None
    DEMO_UNIVERSITY_ID: str = "demo-university"

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Union[str, List[str]]) -> List[str]:
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return DEFAULT_CORS_ORIGINS
            if value.startswith("[") and value.endswith("]"):
                try:
                    parsed = json.loads(value)
                    if isinstance(parsed, list):
                        return [str(origin).strip() for origin in parsed if str(origin).strip()]
                except json.JSONDecodeError:
                    pass
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        if isinstance(value, list):
            return [str(origin).strip() for origin in value if str(origin).strip()]
        return DEFAULT_CORS_ORIGINS

    @model_validator(mode="after")
    def validate_production_settings(self) -> "Settings":
        if self.ENVIRONMENT == "production":
            if not self.SECRET_KEY or len(self.SECRET_KEY) < 32:
                raise ValueError("SECRET_KEY must be set to at least 32 characters in production.")
            if not self.CORS_ORIGINS or "*" in self.CORS_ORIGINS:
                raise ValueError("CORS_ORIGINS must contain explicit frontend origins in production.")
            if any(origin.startswith("http://localhost") for origin in self.CORS_ORIGINS):
                raise ValueError("CORS_ORIGINS must not include localhost in production.")
            if self.SEED_DEMO_DATA:
                raise ValueError("SEED_DEMO_DATA must be false in production.")
        return self

    @property
    def signing_key(self) -> str:
        return self.SECRET_KEY or DEVELOPMENT_SIGNING_KEY

    model_config = SettingsConfigDict(
        env_file=(PROJECT_ROOT / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

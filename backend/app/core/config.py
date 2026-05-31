from dataclasses import dataclass
import os
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DATABASE_PATH = BACKEND_DIR / "data" / "campusmind.db"
DEFAULT_CORS_ALLOW_ORIGINS = (
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:5179",
    "http://localhost:5179",
)


def get_cors_allow_origins() -> tuple[str, ...]:
    configured = os.getenv("CORS_ALLOW_ORIGINS")
    if not configured:
        return DEFAULT_CORS_ALLOW_ORIGINS
    return tuple(origin.strip() for origin in configured.split(",") if origin.strip())


@dataclass(frozen=True)
class Settings:
    app_name: str = "智行 CampusMind API"
    database_url: str = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{DEFAULT_DATABASE_PATH.as_posix()}",
    )
    jwt_secret_key: str = os.getenv(
        "JWT_SECRET_KEY",
        "dev-only-change-me-before-production",
    )
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = int(
        os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60")
    )
    cors_allow_origins: tuple[str, ...] = get_cors_allow_origins()


settings = Settings()

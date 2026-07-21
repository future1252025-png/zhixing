from dataclasses import dataclass
import os
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DATABASE_PATH = BACKEND_DIR / "data" / "campusmind.db"
DEFAULT_JWT_SECRET = "dev-only-change-me-before-production"
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
    app_env: str = os.getenv("APP_ENV", "development").strip().lower()
    database_url: str = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{DEFAULT_DATABASE_PATH.as_posix()}",
    )
    jwt_secret_key: str = os.getenv("JWT_SECRET_KEY", DEFAULT_JWT_SECRET)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = int(
        os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60")
    )
    cors_allow_origins: tuple[str, ...] = get_cors_allow_origins()

    @property
    def is_production(self) -> bool:
        return self.app_env in {"prod", "production"}

    @property
    def uses_insecure_jwt_secret(self) -> bool:
        return self.jwt_secret_key == DEFAULT_JWT_SECRET


settings = Settings()


def validate_settings() -> None:
    """Fail fast on unsafe production configuration."""
    if settings.is_production and settings.uses_insecure_jwt_secret:
        raise RuntimeError(
            "APP_ENV is production but JWT_SECRET_KEY is still the default. "
            "Set a strong JWT_SECRET_KEY before starting the API."
        )
    if settings.is_production and not settings.cors_allow_origins:
        raise RuntimeError("CORS_ALLOW_ORIGINS must be configured in production.")

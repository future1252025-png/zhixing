from collections.abc import Mapping
from dataclasses import dataclass
import os
from pathlib import Path
from typing import Final
from urllib.parse import urlsplit


BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DATABASE_PATH = BACKEND_DIR / "data" / "campusmind.db"
DEFAULT_JWT_SECRET = "dev-only-change-me-before-production"
DEFAULT_CORS_ALLOW_ORIGINS = (
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:5179",
    "http://localhost:5179",
)
MIN_JWT_SECRET_BYTES: Final = 32
# One day is intentionally the maximum bearer-token lifetime. This limits stale
# credential exposure and catches the common seconds-vs-minutes configuration error.
MAX_ACCESS_TOKEN_EXPIRE_MINUTES: Final = 24 * 60
_UNSET: Final = object()


def _parse_cors_allow_origins(configured: str | None) -> tuple[str, ...]:
    if configured is None:
        return DEFAULT_CORS_ALLOW_ORIGINS
    return tuple(origin.strip() for origin in configured.split(",") if origin.strip())


def get_cors_allow_origins(
    environ: Mapping[str, str] | None = None,
) -> tuple[str, ...]:
    source = os.environ if environ is None else environ
    return _parse_cors_allow_origins(source.get("CORS_ALLOW_ORIGINS"))


@dataclass(frozen=True, init=False)
class Settings:
    """Runtime settings read when an instance is created, not at import definition."""

    app_name: str
    app_env: str
    database_url: str
    jwt_secret_key: str
    jwt_secret_key_explicit: bool
    jwt_algorithm: str
    access_token_expire_minutes: int
    cors_allow_origins: tuple[str, ...]
    cors_allow_origins_explicit: bool

    def __init__(
        self,
        app_name: str = "智行 CampusMind API",
        app_env: str | object = _UNSET,
        database_url: str | object = _UNSET,
        jwt_secret_key: str | object = _UNSET,
        jwt_algorithm: str = "HS256",
        access_token_expire_minutes: int | object = _UNSET,
        cors_allow_origins: tuple[str, ...] | object = _UNSET,
        *,
        environ: Mapping[str, str] | None = None,
    ) -> None:
        source = os.environ if environ is None else environ

        resolved_app_env = (
            source.get("APP_ENV", "development") if app_env is _UNSET else app_env
        )
        resolved_database_url = (
            source.get(
                "DATABASE_URL",
                f"sqlite:///{DEFAULT_DATABASE_PATH.as_posix()}",
            )
            if database_url is _UNSET
            else database_url
        )
        secret_explicit = (
            "JWT_SECRET_KEY" in source if jwt_secret_key is _UNSET else True
        )
        resolved_secret = (
            source.get("JWT_SECRET_KEY", DEFAULT_JWT_SECRET)
            if jwt_secret_key is _UNSET
            else jwt_secret_key
        )
        resolved_expire_minutes = (
            int(source.get("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
            if access_token_expire_minutes is _UNSET
            else access_token_expire_minutes
        )
        cors_explicit = (
            "CORS_ALLOW_ORIGINS" in source if cors_allow_origins is _UNSET else True
        )
        resolved_cors = (
            _parse_cors_allow_origins(source.get("CORS_ALLOW_ORIGINS"))
            if cors_allow_origins is _UNSET
            else tuple(str(origin).strip() for origin in cors_allow_origins if str(origin).strip())
        )

        object.__setattr__(self, "app_name", app_name)
        object.__setattr__(self, "app_env", str(resolved_app_env).strip().lower())
        object.__setattr__(self, "database_url", str(resolved_database_url))
        object.__setattr__(self, "jwt_secret_key", str(resolved_secret).strip())
        object.__setattr__(self, "jwt_secret_key_explicit", secret_explicit)
        object.__setattr__(self, "jwt_algorithm", jwt_algorithm)
        object.__setattr__(
            self,
            "access_token_expire_minutes",
            int(resolved_expire_minutes),
        )
        object.__setattr__(self, "cors_allow_origins", resolved_cors)
        object.__setattr__(self, "cors_allow_origins_explicit", cors_explicit)

    @property
    def is_production(self) -> bool:
        return self.app_env in {"prod", "production"}

    @property
    def uses_insecure_jwt_secret(self) -> bool:
        return self.jwt_secret_key == DEFAULT_JWT_SECRET


settings = Settings()


def _is_loopback_origin(origin: str) -> bool:
    hostname = urlsplit(origin).hostname
    return hostname is not None and hostname.lower() in {"localhost", "127.0.0.1"}


def validate_settings(config: Settings | None = None) -> None:
    """Fail fast on unsafe or unusable runtime configuration."""
    current = settings if config is None else config

    if not 1 <= current.access_token_expire_minutes <= MAX_ACCESS_TOKEN_EXPIRE_MINUTES:
        raise RuntimeError(
            "ACCESS_TOKEN_EXPIRE_MINUTES must be between 1 and 1440 minutes."
        )

    if not current.is_production:
        return

    secret_length = len(current.jwt_secret_key.encode("utf-8"))
    if (
        not current.jwt_secret_key_explicit
        or current.uses_insecure_jwt_secret
        or secret_length < MIN_JWT_SECRET_BYTES
    ):
        raise RuntimeError(
            "Production JWT_SECRET_KEY must be explicitly configured and contain "
            "at least 32 UTF-8 bytes after trimming."
        )

    if (
        not current.cors_allow_origins_explicit
        or not current.cors_allow_origins
        or all(_is_loopback_origin(origin) for origin in current.cors_allow_origins)
    ):
        raise RuntimeError(
            "CORS_ALLOW_ORIGINS must be explicitly configured with at least one "
            "non-loopback origin in production."
        )

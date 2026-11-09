from collections.abc import Mapping
from dataclasses import dataclass
from ipaddress import IPv4Address, IPv6Address, ip_address
import logging
import os
from pathlib import Path
import re
import secrets
from typing import Final
from urllib.parse import urlsplit


logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DATABASE_PATH = BACKEND_DIR / "data" / "campusmind.db"
DEFAULT_DEV_JWT_SECRET_PATH = BACKEND_DIR / "data" / ".jwt-secret"
# Retained only so production validation can reject the historical public
# default value; it is never used as an actual signing key anymore.
DEFAULT_JWT_SECRET = "dev-only-change-me-before-production"
DEFAULT_CORS_ALLOW_ORIGINS = (
    "http://localhost",
    "https://localhost",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:5179",
    "http://localhost:5179",
)
MIN_JWT_SECRET_BYTES: Final = 32
# One day is intentionally the maximum bearer-token lifetime. This limits stale
# credential exposure and catches the common seconds-vs-minutes configuration error.
MAX_ACCESS_TOKEN_EXPIRE_MINUTES: Final = 24 * 60
MAX_REFRESH_TOKEN_EXPIRE_DAYS: Final = 90
MAX_REFRESH_SESSION_ABSOLUTE_DAYS: Final = 365
ALLOWED_APP_ENVS: Final = frozenset(
    {"development", "dev", "test", "testing", "production", "prod"}
)
_UNSET: Final = object()
_DOMAIN_LABEL = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
_generated_dev_jwt_secret: str | None = None


def _dev_fallback_jwt_secret() -> str:
    """Load or create a private local key so development sessions survive restarts."""
    global _generated_dev_jwt_secret
    if _generated_dev_jwt_secret is None:
        secret_path = Path(
            os.environ.get("JWT_SECRET_FILE", str(DEFAULT_DEV_JWT_SECRET_PATH))
        )
        secret_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            secret = secret_path.read_text(encoding="utf-8").strip()
        except FileNotFoundError:
            secret = secrets.token_urlsafe(48)
            try:
                descriptor = os.open(
                    secret_path,
                    os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                    0o600,
                )
            except FileExistsError:
                # Another worker won the creation race.
                secret = secret_path.read_text(encoding="utf-8").strip()
            else:
                with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                    handle.write(secret)
        if len(secret.encode("utf-8")) < MIN_JWT_SECRET_BYTES:
            raise RuntimeError(
                f"Development JWT secret file is invalid: {secret_path}"
            )
        _generated_dev_jwt_secret = secret
        logger.warning(
            "JWT_SECRET_KEY 未设置，开发模式使用本地持久密钥 %s；生产环境仍必须显式配置环境变量。",
            secret_path,
        )
    return _generated_dev_jwt_secret


def _parse_cors_allow_origins(configured: str | None) -> tuple[str, ...]:
    if configured is None:
        return DEFAULT_CORS_ALLOW_ORIGINS
    return tuple(origin.strip() for origin in configured.split(",") if origin.strip())


def _parse_legacy_ipv4(hostname: str) -> IPv4Address | None:
    """Parse browser-compatible decimal/octal/hex IPv4 forms safely."""
    raw_parts = hostname.split(".")
    if not 1 <= len(raw_parts) <= 4:
        return None
    parts: list[int] = []
    for raw_part in raw_parts:
        lowered = raw_part.casefold()
        if lowered.startswith("0x"):
            digits, base = lowered[2:], 16
        elif len(lowered) > 1 and lowered.startswith("0"):
            digits, base = lowered[1:], 8
        else:
            digits, base = lowered, 10
        if not digits:
            digits = "0"
        valid_digits = {
            8: r"[0-7]+",
            10: r"\d+",
            16: r"[0-9a-f]+",
        }[base]
        if not re.fullmatch(valid_digits, digits):
            return None
        parts.append(int(digits, base))

    limits = {
        1: (0xFFFFFFFF,),
        2: (0xFF, 0xFFFFFF),
        3: (0xFF, 0xFF, 0xFFFF),
        4: (0xFF, 0xFF, 0xFF, 0xFF),
    }[len(parts)]
    if any(part > limit for part, limit in zip(parts, limits, strict=True)):
        return None
    if len(parts) == 1:
        value = parts[0]
    elif len(parts) == 2:
        value = (parts[0] << 24) | parts[1]
    elif len(parts) == 3:
        value = (parts[0] << 24) | (parts[1] << 16) | parts[2]
    else:
        value = (
            (parts[0] << 24)
            | (parts[1] << 16)
            | (parts[2] << 8)
            | parts[3]
        )
    return IPv4Address(value)


def _normalize_hostname(
    hostname: str,
) -> tuple[str, IPv4Address | IPv6Address | None] | None:
    hostname = hostname.casefold().rstrip(".")
    if not hostname or "%" in hostname:
        return None
    try:
        address = ip_address(hostname)
    except ValueError:
        address = _parse_legacy_ipv4(hostname)
    if address is not None:
        return str(address), address
    if re.fullmatch(r"[\d.]+", hostname):
        return None
    try:
        ascii_hostname = hostname.encode("idna").decode("ascii").casefold()
    except UnicodeError:
        return None
    labels = ascii_hostname.split(".")
    if (
        len(ascii_hostname) > 253
        or any(not label or not _DOMAIN_LABEL.fullmatch(label) for label in labels)
    ):
        return None
    return ascii_hostname, None


def _normalize_cors_origin(origin: str) -> str | None:
    origin = origin.strip()
    if not origin or origin == "*":
        return None
    try:
        parsed = urlsplit(origin)
        port = parsed.port
    except ValueError:
        return None
    scheme = parsed.scheme.casefold()
    if scheme not in {"http", "https"} or parsed.hostname is None:
        return None
    if parsed.username is not None or parsed.password is not None:
        return None
    if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        return None
    authority = parsed.netloc.rsplit("@", 1)[-1]
    if authority.endswith(":"):
        return None

    normalized_host = _normalize_hostname(parsed.hostname)
    if normalized_host is None:
        return None
    hostname, address = normalized_host
    rendered_host = f"[{hostname}]" if isinstance(address, IPv6Address) else hostname
    if port is not None and not (
        (scheme == "http" and port == 80) or (scheme == "https" and port == 443)
    ):
        rendered_host = f"{rendered_host}:{port}"
    return f"{scheme}://{rendered_host}"


def _normalize_configured_origins(origins: tuple[str, ...]) -> tuple[str, ...]:
    """Keep only origins that normalize cleanly; wildcards and junk are dropped."""
    normalized = (_normalize_cors_origin(origin) for origin in origins)
    return tuple(origin for origin in normalized if origin is not None)


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
    refresh_token_expire_days: int
    refresh_session_absolute_days: int
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
        refresh_token_expire_days: int | object = _UNSET,
        refresh_session_absolute_days: int | object = _UNSET,
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
            source.get("JWT_SECRET_KEY") if jwt_secret_key is _UNSET else jwt_secret_key
        )
        if resolved_secret is None:
            resolved_secret = _dev_fallback_jwt_secret()
        resolved_expire_minutes = (
            int(source.get("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
            if access_token_expire_minutes is _UNSET
            else access_token_expire_minutes
        )
        resolved_refresh_days = (
            int(source.get("REFRESH_TOKEN_EXPIRE_DAYS", "30"))
            if refresh_token_expire_days is _UNSET
            else refresh_token_expire_days
        )
        resolved_absolute_days = (
            int(source.get("REFRESH_SESSION_ABSOLUTE_DAYS", "90"))
            if refresh_session_absolute_days is _UNSET
            else refresh_session_absolute_days
        )
        cors_explicit = (
            "CORS_ALLOW_ORIGINS" in source if cors_allow_origins is _UNSET else True
        )
        resolved_cors = (
            _parse_cors_allow_origins(source.get("CORS_ALLOW_ORIGINS"))
            if cors_allow_origins is _UNSET
            else tuple(str(origin).strip() for origin in cors_allow_origins if str(origin).strip())
        )
        resolved_cors = _normalize_configured_origins(resolved_cors)

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
        object.__setattr__(
            self,
            "refresh_token_expire_days",
            int(resolved_refresh_days),
        )
        object.__setattr__(
            self,
            "refresh_session_absolute_days",
            int(resolved_absolute_days),
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


def _is_remote_https_origin(origin: str) -> bool:
    normalized = _normalize_cors_origin(origin)
    if normalized is None:
        return False
    parsed = urlsplit(normalized)
    if parsed.scheme != "https" or parsed.hostname is None:
        return False
    normalized_host = _normalize_hostname(parsed.hostname)
    if normalized_host is None:
        return False
    hostname, address = normalized_host
    if address is not None:
        if isinstance(address, IPv6Address) and address.ipv4_mapped is not None:
            address = address.ipv4_mapped
        return not (address.is_loopback or address.is_unspecified)
    return hostname != "localhost" and not hostname.endswith(".localhost")


def validate_settings(config: Settings | None = None) -> None:
    """Fail fast on unsafe or unusable runtime configuration."""
    current = settings if config is None else config

    if current.app_env not in ALLOWED_APP_ENVS:
        allowed = ", ".join(sorted(ALLOWED_APP_ENVS))
        raise RuntimeError(f"APP_ENV must be one of: {allowed}.")

    if not 1 <= current.access_token_expire_minutes <= MAX_ACCESS_TOKEN_EXPIRE_MINUTES:
        raise RuntimeError(
            "ACCESS_TOKEN_EXPIRE_MINUTES must be between 1 and 1440 minutes."
        )

    if not 1 <= current.refresh_token_expire_days <= MAX_REFRESH_TOKEN_EXPIRE_DAYS:
        raise RuntimeError(
            "REFRESH_TOKEN_EXPIRE_DAYS must be between 1 and 90 days."
        )
    if not (
        current.refresh_token_expire_days
        <= current.refresh_session_absolute_days
        <= MAX_REFRESH_SESSION_ABSOLUTE_DAYS
    ):
        raise RuntimeError(
            "REFRESH_SESSION_ABSOLUTE_DAYS must be at least the refresh-token "
            "lifetime and no more than 365 days."
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
        or any(
            not _is_remote_https_origin(origin)
            for origin in current.cors_allow_origins
        )
    ):
        raise RuntimeError(
            "CORS_ALLOW_ORIGINS must contain only explicit, valid, remote HTTPS "
            "origins in production."
        )

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import re
import secrets

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import ExpiredSignatureError, InvalidTokenError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import errors
from app.core.config import settings
from app.db.database import get_session
from app.models import User

# HTTPBearer fits our JSON login flow better than OAuth2 password form.
# auto_error=False so missing Authorization stays 401 (not Starlette's 403).
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Return False for missing/invalid hashes instead of raising."""
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(
            password.encode("utf-8"),
            password_hash.encode("utf-8"),
        )
    except (ValueError, TypeError):
        return False


_ACCOUNT_SUBJECT = re.compile(r"^account:([0-9a-f]{32})$")


@dataclass(frozen=True)
class AccessTokenIdentity:
    token_subject: str | None = None
    legacy_username: str | None = None


def create_access_token(token_subject: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{32}", token_subject):
        raise ValueError("token_subject must be a 32-character lowercase hex value")
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": f"account:{token_subject}",
        "sub_kind": "account",
        "typ": "access",
        "iss": "campusmind-api",
        "aud": "campusmind-client",
        "jti": secrets.token_urlsafe(16),
        "iat": now,
        "exp": expires_at,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def _credentials_exception(detail: str = errors.TOKEN_INVALID) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def decode_access_token(token: str) -> AccessTokenIdentity:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            audience="campusmind-client",
            issuer="campusmind-api",
            options={"require": ["sub", "typ", "iat", "exp", "jti"]},
        )
    except ExpiredSignatureError as exc:
        raise _credentials_exception(errors.TOKEN_EXPIRED) from exc
    except InvalidTokenError as exc:
        raise _credentials_exception() from exc

    subject = payload.get("sub")
    if payload.get("typ") != "access" or not isinstance(subject, str) or not subject:
        raise _credentials_exception()

    subject_kind = payload.get("sub_kind")
    if subject_kind is None:
        # Tokens issued before account subjects stored the old login identity
        # directly in ``sub``. Preserve them when it still matches the
        # canonical student ID; refresh remains the recovery path otherwise.
        return AccessTokenIdentity(legacy_username=subject)
    if subject_kind != "account":
        raise _credentials_exception()
    match = _ACCOUNT_SUBJECT.fullmatch(subject)
    if match is None:
        raise _credentials_exception()
    return AccessTokenIdentity(token_subject=match.group(1))


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _credentials_exception()
    identity = decode_access_token(credentials.credentials)
    if identity.token_subject is not None:
        user = session.scalar(
            select(User).where(User.token_subject == identity.token_subject)
        )
    else:
        user = session.scalar(
            select(User).where(User.username == identity.legacy_username)
        )
    if user is None:
        raise _credentials_exception()
    return user

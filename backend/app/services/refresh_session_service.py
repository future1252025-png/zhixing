from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import secrets
import uuid

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import RefreshSession, User


class RefreshSessionError(ValueError):
    """The presented refresh token cannot issue another access token."""


class RefreshTokenReplayError(RefreshSessionError):
    """A consumed refresh token was presented again."""


MAX_ACTIVE_REFRESH_FAMILIES_PER_USER = 10


def _token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _new_token() -> str:
    return secrets.token_urlsafe(48)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def issue_refresh_session(
    session: Session,
    user: User,
    *,
    now: datetime | None = None,
) -> str:
    issued_at = now or _now()
    # Consumed generations must remain until the family can no longer be used
    # so replay is detectable. Once the absolute lifetime passes, retaining
    # them adds no security value and would grow the table indefinitely.
    session.execute(
        delete(RefreshSession).where(
            RefreshSession.absolute_expires_at <= issued_at
        )
    )
    _limit_active_families_before_issue(session, user.id, issued_at)
    token = _new_token()
    absolute_expires_at = issued_at + timedelta(
        days=settings.refresh_session_absolute_days
    )
    refresh_session = RefreshSession(
        user_id=user.id,
        family_id=str(uuid.uuid4()),
        token_hash=_token_digest(token),
        created_at=issued_at,
        expires_at=min(
            issued_at + timedelta(days=settings.refresh_token_expire_days),
            absolute_expires_at,
        ),
        absolute_expires_at=absolute_expires_at,
    )
    session.add(refresh_session)
    session.commit()
    return token


def _limit_active_families_before_issue(
    session: Session,
    user_id: int,
    issued_at: datetime,
) -> None:
    first_created = func.min(RefreshSession.created_at)
    active_families = session.execute(
        select(RefreshSession.family_id, first_created.label("first_created"))
        .where(
            RefreshSession.user_id == user_id,
            RefreshSession.revoked_at.is_(None),
            RefreshSession.absolute_expires_at > issued_at,
        )
        .group_by(RefreshSession.family_id)
        .order_by(first_created.desc(), RefreshSession.family_id.desc())
    ).all()
    keep_existing = MAX_ACTIVE_REFRESH_FAMILIES_PER_USER - 1
    for family_id, _ in active_families[keep_existing:]:
        _revoke_family(session, family_id, issued_at)


def _revoke_family(session: Session, family_id: str, revoked_at: datetime) -> None:
    session.execute(
        update(RefreshSession)
        .where(
            RefreshSession.family_id == family_id,
            RefreshSession.revoked_at.is_(None),
        )
        .values(revoked_at=revoked_at)
    )


def rotate_refresh_session(
    session: Session,
    token: str,
    *,
    now: datetime | None = None,
) -> tuple[str, User]:
    rotated_at = now or _now()
    current = session.scalar(
        select(RefreshSession).where(
            RefreshSession.token_hash == _token_digest(token)
        )
    )
    if current is None:
        raise RefreshSessionError()

    if current.consumed_at is not None:
        _revoke_family(session, current.family_id, rotated_at)
        session.commit()
        raise RefreshTokenReplayError()
    if current.revoked_at is not None:
        raise RefreshSessionError()
    if current.expires_at <= rotated_at or current.absolute_expires_at <= rotated_at:
        current.revoked_at = rotated_at
        session.add(current)
        session.commit()
        raise RefreshSessionError()

    # Claim this generation atomically. This prevents two concurrent refresh
    # requests from both creating a valid successor.
    claimed = session.execute(
        update(RefreshSession)
        .where(
            RefreshSession.id == current.id,
            RefreshSession.consumed_at.is_(None),
            RefreshSession.revoked_at.is_(None),
        )
        .values(consumed_at=rotated_at)
    )
    if claimed.rowcount != 1:
        session.rollback()
        _revoke_family(session, current.family_id, rotated_at)
        session.commit()
        raise RefreshTokenReplayError()

    next_token = _new_token()
    successor = RefreshSession(
        user_id=current.user_id,
        family_id=current.family_id,
        token_hash=_token_digest(next_token),
        created_at=rotated_at,
        expires_at=min(
            rotated_at + timedelta(days=settings.refresh_token_expire_days),
            current.absolute_expires_at,
        ),
        absolute_expires_at=current.absolute_expires_at,
    )
    session.add(successor)
    session.flush()
    current.replaced_by_id = successor.id
    session.add(current)
    user = session.get(User, current.user_id)
    if user is None:
        session.rollback()
        raise RefreshSessionError()
    session.commit()
    return next_token, user


def revoke_refresh_session(session: Session, token: str) -> None:
    current = session.scalar(
        select(RefreshSession).where(
            RefreshSession.token_hash == _token_digest(token)
        )
    )
    if current is None:
        return
    _revoke_family(session, current.family_id, _now())
    session.commit()

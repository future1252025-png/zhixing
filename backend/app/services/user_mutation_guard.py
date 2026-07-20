"""Low-level serialization primitive shared by user-owned mutations."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.errors import BusinessError
from app.models import SemesterSetting


@dataclass(frozen=True)
class UserMutationGuard:
    _session_identity: int
    user_id: int


def acquire_user_mutation_guard(session: Session, user_id: int) -> UserMutationGuard:
    result = session.execute(
        update(SemesterSetting)
        .where(SemesterSetting.user_id == user_id)
        .values(updated_at=SemesterSetting.updated_at)
    )
    if result.rowcount != 1:
        raise BusinessError(409, "semester_unconfigured", "Semester is not configured")
    return UserMutationGuard(_session_identity=id(session), user_id=user_id)


def require_user_mutation_guard(
    session: Session,
    user_id: int,
    guard: UserMutationGuard,
) -> None:
    if guard._session_identity != id(session) or guard.user_id != user_id:
        raise RuntimeError("user mutation guard belongs to a different session or user")

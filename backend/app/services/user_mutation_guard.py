"""Low-level serialization primitive shared by user-owned mutations."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import update
from sqlalchemy.orm import Session, SessionTransaction

from app.core import errors
from app.core.errors import BusinessError
from app.models import SemesterSetting, User


@dataclass(frozen=True)
class UserMutationGuard:
    _session_identity: int
    _transaction: SessionTransaction
    user_id: int


def _current_transaction(session: Session) -> SessionTransaction | None:
    return session.get_nested_transaction() or session.get_transaction()


def acquire_user_mutation_guard(session: Session, user_id: int) -> UserMutationGuard:
    result = session.execute(
        update(SemesterSetting)
        .where(SemesterSetting.user_id == user_id)
        .values(updated_at=SemesterSetting.updated_at)
    )
    if result.rowcount != 1:
        # A user can import a timetable before configuring the semester. Keep a
        # stable row-level lock for that case without inventing a semester date.
        result = session.execute(
            update(User)
            .where(User.id == user_id)
            .values(username=User.username)
        )
        if result.rowcount != 1:
            raise BusinessError(404, "user_not_found", errors.USER_NOT_FOUND)
    transaction = _current_transaction(session)
    if transaction is None or not transaction.is_active:
        raise RuntimeError("user mutation guard requires an active transaction")
    return UserMutationGuard(
        _session_identity=id(session),
        _transaction=transaction,
        user_id=user_id,
    )


def require_user_mutation_guard(
    session: Session,
    user_id: int,
    guard: UserMutationGuard,
) -> None:
    transaction = _current_transaction(session)
    if (
        guard._session_identity != id(session)
        or guard.user_id != user_id
        or transaction is None
        or transaction is not guard._transaction
        or not transaction.is_active
    ):
        raise RuntimeError(
            "user mutation guard belongs to a different session, user, or transaction"
        )

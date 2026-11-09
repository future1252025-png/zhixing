import re

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models import (
    Course,
    CourseImportSource,
    Message,
    RefreshSession,
    SemesterSetting,
    User,
)
from app.schemas.auth import RegisterRequest
from app.schemas.user import UserProfileUpdate
from app.services.user_mutation_guard import acquire_user_mutation_guard


class DuplicateUserError(ValueError):
    """Raised when the unique student identity collides on insert."""


_IDENTITY_CONSTRAINT_NAMES = frozenset(
    {
        "ix_users_username",
        "ix_users_student_id",
        "users_username_key",
        "users_student_id_key",
    }
)
_SQLITE_IDENTITY_UNIQUE_ERROR = re.compile(
    r"^UNIQUE constraint failed:\s*users\.(?:username|student_id)$",
    re.IGNORECASE,
)

# Verifying against this dummy hash keeps the unknown-username path roughly as
# slow as a real password check, so login response timing does not reveal
# whether a username exists.
_TIMING_EQUALIZATION_HASH = hash_password("campusmind-timing-equalization")


def _is_identity_unique_collision(error: IntegrityError) -> bool:
    original = error.orig
    diagnostic = getattr(original, "diag", None)
    constraint_name = getattr(diagnostic, "constraint_name", None)
    if isinstance(constraint_name, str):
        return constraint_name.casefold() in _IDENTITY_CONSTRAINT_NAMES
    return bool(_SQLITE_IDENTITY_UNIQUE_ERROR.fullmatch(str(original).strip()))


def get_user_by_username(session: Session, username: str) -> User | None:
    return session.scalar(select(User).where(User.username == username))


def get_user_by_student_id(session: Session, student_id: str) -> User | None:
    return session.scalar(select(User).where(User.student_id == student_id))


def create_user(session: Session, payload: RegisterRequest) -> User:
    user = User(
        # Keep the legacy column as an internal mirror until old clients and
        # access tokens no longer need it.  It is not a second public identity.
        username=payload.student_id,
        student_id=payload.student_id,
        nickname=payload.nickname,
        avatar_text=payload.nickname[:1],
        avatar_color="#0b766f",
        password_hash=hash_password(payload.password),
        role="student",
    )
    session.add(user)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        if _is_identity_unique_collision(exc):
            raise DuplicateUserError() from exc
        raise
    session.refresh(user)
    return user


def authenticate_user(
    session: Session,
    student_id: str,
    password: str,
) -> User | None:
    user = get_user_by_student_id(session, student_id)
    if user is None:
        verify_password(password, _TIMING_EQUALIZATION_HASH)
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def update_user_profile(
    session: Session,
    user: User,
    payload: UserProfileUpdate,
) -> User:
    user.nickname = payload.nickname.strip()
    user.avatar_text = payload.avatar_text.strip() if payload.avatar_text else None
    user.avatar_color = payload.avatar_color or None
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def delete_user_account(session: Session, user: User) -> None:
    """Permanently remove a user's account and every user-owned record."""

    acquire_user_mutation_guard(session, user.id)
    course_ids = select(Course.id).where(Course.user_id == user.id)
    session.execute(
        delete(CourseImportSource).where(CourseImportSource.course_id.in_(course_ids))
    )
    session.execute(delete(Message).where(Message.user_id == user.id))
    session.execute(delete(Course).where(Course.user_id == user.id))
    session.execute(delete(SemesterSetting).where(SemesterSetting.user_id == user.id))
    session.execute(delete(RefreshSession).where(RefreshSession.user_id == user.id))
    session.delete(user)
    session.commit()

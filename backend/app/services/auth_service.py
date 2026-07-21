from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models import User
from app.schemas.auth import RegisterRequest
from app.schemas.user import UserProfileUpdate


class DuplicateUserError(ValueError):
    """Raised when username or student_id collides on insert."""


def get_user_by_username(session: Session, username: str) -> User | None:
    return session.scalar(select(User).where(User.username == username))


def get_user_by_student_id(session: Session, student_id: str) -> User | None:
    return session.scalar(select(User).where(User.student_id == student_id))


def create_user(session: Session, payload: RegisterRequest) -> User:
    user = User(
        username=payload.username,
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
        raise DuplicateUserError() from exc
    session.refresh(user)
    return user


def authenticate_user(
    session: Session,
    username: str,
    password: str,
) -> User | None:
    user = get_user_by_username(session, username)
    if user is None:
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

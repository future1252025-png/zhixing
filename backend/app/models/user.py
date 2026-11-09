from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import CheckConstraint, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base
from app.db.types import TZDateTime


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "username = student_id",
            name="ck_users_username_matches_student_id",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    student_id: Mapped[str] = mapped_column(
        String(32),
        unique=True,
        index=True,
        nullable=False,
    )
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    token_subject: Mapped[str] = mapped_column(
        String(32),
        unique=True,
        index=True,
        nullable=False,
        default=lambda: uuid4().hex,
    )
    password_hash: Mapped[str] = mapped_column(String(255))
    nickname: Mapped[str] = mapped_column(String(64))
    avatar_text: Mapped[str | None] = mapped_column(String(4), nullable=True)
    avatar_color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    role: Mapped[str] = mapped_column(String(32), default="student")
    created_at: Mapped[datetime] = mapped_column(
        TZDateTime(),
        default=lambda: datetime.now(timezone.utc),
    )

    courses = relationship("Course", back_populates="user")
    messages = relationship("Message", back_populates="user")
    semester_setting = relationship(
        "SemesterSetting",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    refresh_sessions = relationship(
        "RefreshSession",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
        foreign_keys="RefreshSession.user_id",
    )

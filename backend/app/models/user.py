from datetime import datetime, timezone

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    student_id: Mapped[str | None] = mapped_column(
        String(32),
        unique=True,
        index=True,
        nullable=True,
    )
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    nickname: Mapped[str] = mapped_column(String(64))
    avatar_text: Mapped[str | None] = mapped_column(String(4), nullable=True)
    avatar_color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    role: Mapped[str] = mapped_column(String(32), default="student")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
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

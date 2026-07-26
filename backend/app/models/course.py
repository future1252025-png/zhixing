from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base
from app.db.types import TZDateTime


class Course(Base):
    __tablename__ = "courses"
    __table_args__ = (
        CheckConstraint("source_kind IN ('manual', 'import')", name="ck_courses_source_kind"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    course_name: Mapped[str] = mapped_column(String(100), index=True)
    weekday: Mapped[int] = mapped_column(Integer, index=True)
    start_time: Mapped[str] = mapped_column(String(5))
    end_time: Mapped[str] = mapped_column(String(5))
    building_id: Mapped[int] = mapped_column(ForeignKey("buildings.id"), index=True)
    room_name: Mapped[str] = mapped_column(String(120))
    teacher: Mapped[str | None] = mapped_column(String(64), nullable=True)
    weeks: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default="1-20",
        server_default="1-20",
    )
    source_kind: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="manual",
        server_default="manual",
    )
    created_at: Mapped[datetime] = mapped_column(
        TZDateTime(),
        default=lambda: datetime.now(timezone.utc),
    )

    user = relationship("User", back_populates="courses")
    building = relationship("Building", back_populates="courses")
    import_source = relationship(
        "CourseImportSource",
        back_populates="course",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

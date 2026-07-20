from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class CourseImportSource(Base):
    __tablename__ = "course_import_sources"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_sha256: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    source_row: Mapped[str | None] = mapped_column(String(80), nullable=True)
    raw_course_name: Mapped[str] = mapped_column(Text)
    raw_weekday: Mapped[str] = mapped_column(Text)
    raw_time_or_section: Mapped[str] = mapped_column(Text)
    raw_teacher: Mapped[str] = mapped_column(Text)
    raw_weeks: Mapped[str] = mapped_column(Text)
    raw_location: Mapped[str] = mapped_column(Text)

    course = relationship("Course", back_populates="import_source")

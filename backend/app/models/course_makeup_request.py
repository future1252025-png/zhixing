from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class CourseMakeupRequest(Base):
    """Retain retry receipts even after a user cancels a makeup batch."""

    __tablename__ = "course_makeup_requests"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    request_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    payload_hash: Mapped[str] = mapped_column(String(64))
    course_ids: Mapped[list[int]] = mapped_column(JSON)

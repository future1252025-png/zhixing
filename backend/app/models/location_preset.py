from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class LocationPreset(Base):
    __tablename__ = "location_presets"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    building_id: Mapped[int | None] = mapped_column(
        ForeignKey("buildings.id"),
        nullable=True,
        index=True,
    )
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    building = relationship("Building", back_populates="location_presets")

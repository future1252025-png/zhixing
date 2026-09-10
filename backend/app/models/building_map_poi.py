from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class BuildingMapPoi(Base):
    __tablename__ = "building_map_pois"
    __table_args__ = (UniqueConstraint("provider", "poi_id", name="uq_building_map_poi_identity"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    building_id: Mapped[int] = mapped_column(ForeignKey("buildings.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(16))
    poi_id: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(150))
    building = relationship("Building", back_populates="map_pois")

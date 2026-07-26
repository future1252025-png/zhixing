from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Building, LocationPreset
from app.schemas.location_preset import LocationPresetRead


def list_buildings(session: Session) -> list[Building]:
    return list(session.scalars(select(Building).order_by(Building.id)).all())


def get_building(session: Session, building_id: int) -> Building | None:
    return session.get(Building, building_id)


def list_location_presets(session: Session) -> list[LocationPresetRead]:
    presets = session.scalars(
        select(LocationPreset)
        .options(selectinload(LocationPreset.building))
        .order_by(LocationPreset.id)
    ).all()
    return [
        LocationPresetRead(
            id=preset.id,
            name=preset.name,
            building_id=preset.building_id,
            building_name=preset.building.name if preset.building is not None else None,
            latitude=preset.latitude,
            longitude=preset.longitude,
            description=preset.description,
        )
        for preset in presets
    ]

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core import errors
from app.core.errors import BusinessError
from app.db.database import get_session
from app.schemas.building import BuildingRead
from app.schemas.error import BusinessErrorResponse
from app.schemas.location_preset import LocationPresetRead
from app.services.building_service import (
    get_building,
    list_buildings,
    list_location_presets,
)

router = APIRouter(tags=["buildings"])


@router.get("/api/buildings", response_model=list[BuildingRead])
def read_buildings(session: Session = Depends(get_session)) -> list[BuildingRead]:
    return list_buildings(session)


@router.get(
    "/api/buildings/{building_id}",
    response_model=BuildingRead,
    responses={404: {"model": BusinessErrorResponse}},
)
def read_building(
    building_id: int,
    session: Session = Depends(get_session),
) -> BuildingRead:
    building = get_building(session, building_id)
    if building is None:
        raise BusinessError(404, "building_not_found", errors.BUILDING_NOT_FOUND)
    return building


@router.get("/api/location-presets", response_model=list[LocationPresetRead])
def read_location_presets(
    session: Session = Depends(get_session),
) -> list[LocationPresetRead]:
    return list_location_presets(session)

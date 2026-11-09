from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core import errors
from app.core.errors import BusinessError
from app.db.database import get_session
from app.schemas.building import BuildingRead, BuildingMapPoiBind, BuildingMapPoiRead
from app.core.security import get_current_user
from app.models import BuildingMapPoi, User
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


@router.put("/api/buildings/{building_id}/map-pois", response_model=BuildingMapPoiRead)
def bind_map_poi(
    building_id: int,
    payload: BuildingMapPoiBind,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> BuildingMapPoi:
    # Registration always creates a student; only an operator-assigned admin can
    # change shared POI identity. Clicking/searching must never create bindings.
    if current_user.role != "admin":
        raise BusinessError(403, "map_binding_forbidden", "只有管理员可以关联地图地点")
    if get_building(session, building_id) is None:
        raise BusinessError(404, "building_not_found", errors.BUILDING_NOT_FOUND)
    existing = session.scalar(select(BuildingMapPoi).where(
        BuildingMapPoi.provider == payload.provider, BuildingMapPoi.poi_id == payload.poi_id,
    ))
    if existing:
        if existing.building_id != building_id:
            raise BusinessError(409, "map_poi_already_bound", "该地图地点已关联其他建筑，请先核对现有关系")
        return existing
    binding = BuildingMapPoi(building_id=building_id, **payload.model_dump())
    session.add(binding)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise BusinessError(409, "map_poi_already_bound", "该地图地点已被关联，请刷新后核对") from None
    session.refresh(binding)
    return binding


@router.get("/api/location-presets", response_model=list[LocationPresetRead])
def read_location_presets(
    session: Session = Depends(get_session),
) -> list[LocationPresetRead]:
    return list_location_presets(session)

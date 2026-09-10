from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class BuildingMapPoiRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    provider: Literal["amap"]
    poi_id: str
    name: str


class BuildingMapPoiBind(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    provider: Literal["amap"] = "amap"
    poi_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,80}$")
    name: str = Field(min_length=1, max_length=150)


class BuildingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: str
    description: str
    latitude: float
    longitude: float
    map_x: float
    map_y: float
    walk_hint: str | None = None
    map_pois: list[BuildingMapPoiRead] = Field(default_factory=list)

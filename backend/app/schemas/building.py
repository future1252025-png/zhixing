from pydantic import BaseModel, ConfigDict


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

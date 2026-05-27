from pydantic import BaseModel


class LocationPresetRead(BaseModel):
    id: int
    name: str
    building_id: int | None
    building_name: str | None
    latitude: float
    longitude: float
    description: str | None = None

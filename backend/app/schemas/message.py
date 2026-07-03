from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


ANONYMOUS_DISPLAY_NAME = "匿名同学"


class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=200)
    room_name: str | None = Field(default=None, max_length=64)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    location_source: Literal["browser", "manual"] = "browser"

    @field_validator("content")
    @classmethod
    def normalize_content(cls, value: str) -> str:
        content = value.strip()
        if not content:
            raise ValueError("Message content cannot be empty")
        return content

    @field_validator("room_name")
    @classmethod
    def normalize_room_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        room_name = value.strip()
        return room_name or None


class MessageRead(BaseModel):
    id: int
    building_id: int
    content: str
    display_name: str
    room_name: str | None = None
    created_at: datetime
    latitude: float | None = None
    longitude: float | None = None
    location_source: str | None = None
    distance_to_building_meters: float | None = None


class ChatRoomRead(BaseModel):
    name: str
    room_name: str | None = None
    message_count: int = 0
    is_general: bool = False

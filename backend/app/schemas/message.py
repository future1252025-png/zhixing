from datetime import datetime

from pydantic import BaseModel, Field, field_validator


ANONYMOUS_DISPLAY_NAME = "匿名同学"


class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=200)

    @field_validator("content")
    @classmethod
    def normalize_content(cls, value: str) -> str:
        content = value.strip()
        if not content:
            raise ValueError("Message content cannot be empty")
        return content


class MessageRead(BaseModel):
    id: int
    building_id: int
    content: str
    display_name: str
    created_at: datetime

from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from app.schemas.course import ensure_end_after_start, parse_course_time


class MakeupTiming(BaseModel):
    model_config = ConfigDict(extra="forbid")
    date: date
    start_time: str
    end_time: str
    location: str | None = Field(default=None, max_length=120)

    @field_validator("start_time", "end_time")
    @classmethod
    def valid_time(cls, value: str) -> str:
        parse_course_time(value)
        return value

    @field_validator("location")
    @classmethod
    def valid_location(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("请填写上课地点，或沿用原地点")
        return value.strip() if value is not None else None

    @model_validator(mode="after")
    def valid_range(self):
        ensure_end_after_start(self.start_time, self.end_time)
        return self


class MakeupEntry(MakeupTiming):
    source_course_id: int = Field(gt=0)
    source_date: date | None = None
    cancel_source: bool = False


class MakeupCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: UUID
    entries: list[MakeupEntry] = Field(min_length=1, max_length=30)

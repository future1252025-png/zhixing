from datetime import datetime, time
from typing import Literal
import re

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    computed_field,
    field_validator,
    model_validator,
)

from app.services.course_policy import location_requires_review
from app.services.week_rule import normalize_weeks


TIME_PATTERN = re.compile(r"^\d{2}:\d{2}$")
def parse_course_time(value: str) -> time:
    if not TIME_PATTERN.match(value):
        raise ValueError("Time must use HH:MM format")
    hour_text, minute_text = value.split(":")
    hour = int(hour_text)
    minute = int(minute_text)
    if hour > 23 or minute > 59:
        raise ValueError("Time must use HH:MM format")
    return time(hour=hour, minute=minute)


def ensure_end_after_start(start_time: str, end_time: str) -> None:
    if parse_course_time(end_time) <= parse_course_time(start_time):
        raise ValueError("end_time must be later than start_time")


def normalize_required_text(value: str) -> str:
    text = value.strip()
    if not text:
        raise ValueError("Field cannot be empty")
    return text


def normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text or None


class CourseBuildingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: str


class CourseBase(BaseModel):
    course_name: str = Field(min_length=1, max_length=100)
    weekday: int = Field(ge=1, le=7)
    start_time: str
    end_time: str
    building_id: int
    room_name: str = Field(min_length=1, max_length=120)
    teacher: str | None = Field(default=None, max_length=64)
    weeks: str = Field(min_length=1, max_length=64)

    @field_validator("course_name", "room_name")
    @classmethod
    def normalize_required_fields(cls, value: str) -> str:
        return normalize_required_text(value)

    @field_validator("teacher")
    @classmethod
    def normalize_optional_fields(cls, value: str | None) -> str | None:
        return normalize_optional_text(value)

    @field_validator("weeks")
    @classmethod
    def normalize_weeks_field(cls, value: str) -> str:
        return normalize_weeks(value, max_week=30)

    @field_validator("start_time", "end_time")
    @classmethod
    def validate_time_fields(cls, value: str) -> str:
        parse_course_time(value)
        return value

    @model_validator(mode="after")
    def validate_time_range(self) -> "CourseBase":
        ensure_end_after_start(self.start_time, self.end_time)
        return self


class CourseCreate(CourseBase):
    pass


class CourseUpdate(BaseModel):
    course_name: str | None = Field(default=None, min_length=1, max_length=100)
    weekday: int | None = Field(default=None, ge=1, le=7)
    start_time: str | None = None
    end_time: str | None = None
    building_id: int | None = None
    room_name: str | None = Field(default=None, min_length=1, max_length=120)
    teacher: str | None = Field(default=None, max_length=64)
    weeks: str | None = Field(default=None, max_length=64)

    @field_validator("course_name", "room_name", mode="before")
    @classmethod
    def reject_required_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("Field cannot be null")
        return value

    @field_validator("weekday", "building_id", mode="before")
    @classmethod
    def reject_required_int_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("Field cannot be null")
        return value

    @field_validator("course_name", "room_name")
    @classmethod
    def normalize_required_fields(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_required_text(value)

    @field_validator("teacher")
    @classmethod
    def normalize_optional_fields(cls, value: str | None) -> str | None:
        return normalize_optional_text(value)

    @field_validator("weeks", mode="before")
    @classmethod
    def reject_null_weeks(cls, value: object) -> object:
        if value is None:
            raise ValueError("Field cannot be null")
        return value

    @field_validator("weeks")
    @classmethod
    def normalize_weeks_field(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("Field cannot be null")
        return normalize_weeks(value, max_week=30)

    @field_validator("start_time", "end_time")
    @classmethod
    def validate_time_fields(cls, value: str | None) -> str | None:
        if value is not None:
            parse_course_time(value)
        return value

    @model_validator(mode="after")
    def validate_time_range(self) -> "CourseUpdate":
        if self.start_time is not None and self.end_time is not None:
            ensure_end_after_start(self.start_time, self.end_time)
        return self


class CourseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    course_name: str
    weekday: int
    start_time: str
    end_time: str
    building_id: int
    room_name: str
    teacher: str | None = None
    weeks: str
    source_kind: Literal["manual", "import"]
    created_at: datetime
    building: CourseBuildingRead

    @computed_field(return_type=bool)
    @property
    def needs_location_review(self) -> bool:
        return location_requires_review(self.room_name)

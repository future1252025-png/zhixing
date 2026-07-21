from typing import Literal

from pydantic import BaseModel, Field, model_validator


SuggestionStatus = Literal["normal", "tight", "likely_late"]


class ScheduleSuggestionRequest(BaseModel):
    current_building_id: int | None = Field(default=None, gt=0)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    # Optional explicit teaching week for "now" (1-based). Overrides SEMESTER_START_DATE.
    current_week: int | None = Field(default=None, ge=1, le=30)

    @model_validator(mode="after")
    def validate_location_source(self) -> "ScheduleSuggestionRequest":
        has_building = self.current_building_id is not None
        has_latitude = self.latitude is not None
        has_longitude = self.longitude is not None
        has_coordinates = has_latitude and has_longitude
        if not has_building and not has_coordinates:
            raise ValueError("current_building_id or latitude and longitude are required")
        if has_latitude != has_longitude:
            raise ValueError("latitude and longitude must be provided together")
        return self


class NextCourseInfo(BaseModel):
    id: int
    course_name: str
    weekday: int
    start_time: str
    end_time: str
    room_name: str
    teacher: str | None = None
    weeks: str | None = None
    teaching_week: int | None = None


class LocationInfo(BaseModel):
    name: str
    latitude: float
    longitude: float
    building_id: int | None = None


class BuildingInfo(BaseModel):
    id: int
    name: str
    latitude: float
    longitude: float


class ScheduleSuggestionResponse(BaseModel):
    next_course: NextCourseInfo
    from_location: LocationInfo
    target_building: BuildingInfo
    distance_meters: int
    walk_minutes: int
    buffer_minutes: int
    suggest_departure_time: str
    status: SuggestionStatus
    text: str
    warning: str | None = None
    current_week: int | None = None

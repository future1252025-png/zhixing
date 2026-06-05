from pydantic import BaseModel


class CourseImportPreviewItem(BaseModel):
    course_name: str
    weekday: int
    start_time: str
    end_time: str
    room_name: str
    teacher: str | None = None
    weeks: str | None = None
    raw_weeks: str | None = None
    raw_location: str | None = None
    building_id: int | None = None
    building_name: str | None = None
    confidence: str
    needs_building: bool


class CourseImportPreviewResponse(BaseModel):
    total: int
    matched_count: int
    needs_review_count: int
    items: list[CourseImportPreviewItem]

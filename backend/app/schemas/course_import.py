from pydantic import BaseModel, Field


class ImportFileInfo(BaseModel):
    filename: str
    sha256: str
    candidate_count: int = Field(ge=0)


class RawCourseSourceResponse(BaseModel):
    raw_course_name: str
    raw_weekday: str
    raw_time_or_section: str
    raw_teacher: str
    raw_weeks: str
    raw_location: str


class ImportIssueResponse(BaseModel):
    code: str
    field: str
    message: str


class ImportCandidateResponse(BaseModel):
    row_ref: str
    source: RawCourseSourceResponse
    course_name: str | None = None
    weekday: int | None = Field(default=None, ge=1, le=7)
    start_time: str | None = None
    end_time: str | None = None
    teacher: str | None = None
    weeks: str | None = None
    suggested_building_id: int | None = None
    suggested_building_name: str | None = None
    suggested_room_name: str | None = None
    errors: list[ImportIssueResponse] = Field(default_factory=list)


class CourseImportPreviewResponse(BaseModel):
    file: ImportFileInfo
    candidates: list[ImportCandidateResponse]
    can_commit: bool

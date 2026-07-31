from pydantic import BaseModel, ConfigDict, Field, field_validator


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


class ImportResolution(BaseModel):
    model_config = ConfigDict(extra="forbid")

    row_ref: str = Field(min_length=1, max_length=80)
    building_id: int = Field(gt=0)
    room_name: str = Field(min_length=1, max_length=120)

    @field_validator("row_ref", "room_name")
    @classmethod
    def trim_required_text(cls, value: str) -> str:
        result = value.strip()
        if not result:
            raise ValueError("value must not be blank")
        return result


class ImportCommitManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    # Optional compatibility path for older app builds. New clients omit this;
    # legacy values only override internal map routing fields, never source text.
    resolutions: list[ImportResolution] = Field(default_factory=list)


class ImportCommitResponse(BaseModel):
    created_count: int = Field(ge=0)
    course_ids: list[int]

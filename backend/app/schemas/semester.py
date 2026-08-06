from datetime import date, datetime
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator, model_validator

from app.core.semester import validate_semester_setting


ISO_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class SemesterUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start_date: date
    total_weeks: StrictInt = Field(ge=1, le=30)

    @field_validator("start_date", mode="before")
    @classmethod
    def parse_exact_date(cls, value: object) -> date:
        if isinstance(value, datetime):
            raise ValueError("start_date must be a date, not a datetime")
        if isinstance(value, date):
            return value
        if isinstance(value, str) and ISO_DATE_PATTERN.fullmatch(value):
            try:
                return date.fromisoformat(value)
            except ValueError as error:
                raise ValueError("start_date must be YYYY-MM-DD") from error
        raise ValueError("start_date must be YYYY-MM-DD")

    @model_validator(mode="after")
    def validate_domain_values(self) -> "SemesterUpdate":
        validate_semester_setting(self.start_date, self.total_weeks)
        return self


class SemesterResponse(BaseModel):
    status: Literal["unconfigured", "before_term", "active", "after_term"]
    start_date: date | None
    total_weeks: int | None
    current_week: int | None

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SemesterUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start_date: date
    total_weeks: int = Field(ge=1, le=30)

    @field_validator("start_date")
    @classmethod
    def require_monday(cls, value: date) -> date:
        if value.weekday() != 0:
            raise ValueError("start_date must be a Monday")
        return value


class SemesterResponse(BaseModel):
    status: Literal["unconfigured", "before_term", "active", "after_term"]
    start_date: date | None
    total_weeks: int | None
    current_week: int | None

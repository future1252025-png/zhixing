from datetime import date, datetime
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator, model_validator

from app.core.semester import validate_semester_setting
from app.schemas.course_time_rule import CourseTimeRule, validate_time_rules


ISO_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class SemesterUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start_date: date
    total_weeks: StrictInt = Field(ge=1, le=30)
    # Omitted by older clients: keep existing rules rather than erasing them.
    time_rules: list[CourseTimeRule] | None = Field(default=None, max_length=40)

    @field_validator("time_rules")
    @classmethod
    def validate_rules(cls, rules):
        return validate_time_rules(rules) if rules is not None else None

    @field_validator("start_date", mode="before")
    @classmethod
    def parse_exact_date(cls, value: object) -> date:
        if isinstance(value, datetime):
            raise ValueError("学期开始日期不能包含具体时间")
        if isinstance(value, date):
            return value
        if isinstance(value, str) and ISO_DATE_PATTERN.fullmatch(value):
            try:
                return date.fromisoformat(value)
            except ValueError as error:
                raise ValueError("学期开始日期必须使用 YYYY-MM-DD 格式") from error
        raise ValueError("学期开始日期必须使用 YYYY-MM-DD 格式")

    @model_validator(mode="after")
    def validate_domain_values(self) -> "SemesterUpdate":
        validate_semester_setting(self.start_date, self.total_weeks)
        return self


class SemesterResponse(BaseModel):
    status: Literal["unconfigured", "before_term", "active", "after_term"]
    start_date: date | None
    total_weeks: int | None
    current_week: int | None
    time_rules: list[CourseTimeRule] = Field(default_factory=list)

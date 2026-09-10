from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, field_validator, model_validator

from app.schemas.course import parse_course_time
from app.schemas.semester import SemesterUpdate


class ReminderItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,64}$")
    title: str = Field(min_length=1, max_length=100)
    note: str = Field(default="", max_length=300)
    date: date
    time: str = Field(pattern=r"^\d{2}:\d{2}$")
    repeat: Literal["once", "daily", "weekly"] = "once"
    weekdays: list[StrictInt] = Field(default_factory=list, max_length=7)
    end_date: date | None = None
    mode: Literal["sound", "vibrate", "silent"] = "vibrate"
    enabled: StrictBool = True
    completed_dates: list[date] = Field(default_factory=list, max_length=367)

    @field_validator("title", "note")
    @classmethod
    def trim_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("date", "end_date", mode="before")
    @classmethod
    def exact_date(cls, value):
        return None if value is None else SemesterUpdate.parse_exact_date(value)

    @field_validator("time")
    @classmethod
    def valid_time(cls, value: str) -> str:
        parse_course_time(value)
        return value

    @field_validator("completed_dates", mode="before")
    @classmethod
    def exact_completed_dates(cls, value):
        if not isinstance(value, list):
            raise ValueError("完成日期必须是日期列表")
        return [SemesterUpdate.parse_exact_date(item) for item in value]

    @model_validator(mode="after")
    def valid_recurrence(self) -> "ReminderItem":
        if not self.title:
            raise ValueError("请填写提醒事项")
        if len(set(self.weekdays)) != len(self.weekdays) or any(day < 1 or day > 7 for day in self.weekdays):
            raise ValueError("重复星期必须在 1–7 之间且不能重复")
        if self.repeat == "weekly" and not self.weekdays:
            raise ValueError("请选择重复星期")
        if self.repeat != "once" and (
            self.end_date is None or not 0 <= (self.end_date - self.date).days <= 366
        ):
            raise ValueError("重复提醒必须设置结束日期，最长一年")
        if self.repeat == "once" and self.end_date is not None:
            raise ValueError("单次提醒不需要结束日期")
        if len(set(self.completed_dates)) != len(self.completed_dates):
            raise ValueError("完成日期不能重复")
        return self


class CourseReminderSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: StrictBool = False
    lead_minutes: StrictInt = Field(default=10, ge=0, le=120)
    mode: Literal["sound", "vibrate", "silent"] = "vibrate"


class ReminderPlanData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: StrictInt = Field(default=0, ge=0)
    course_settings: CourseReminderSettings = Field(default_factory=CourseReminderSettings)
    items: list[ReminderItem] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def unique_ids(self) -> "ReminderPlanData":
        if len({item.id for item in self.items}) != len(self.items):
            raise ValueError("提醒编号不能重复")
        return self

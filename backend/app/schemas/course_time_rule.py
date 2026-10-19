"""Dated changes to recurring course clocks; original import data stays intact."""
from datetime import date, datetime
import re

from pydantic import BaseModel, ConfigDict, field_validator, model_validator


class CourseTimeRule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start_date: date
    end_date: date | None = None
    from_start: str
    from_end: str
    start_time: str
    end_time: str

    @field_validator("start_date", "end_date", mode="before")
    @classmethod
    def exact_date(cls, value):
        if value is None or (isinstance(value, date) and not isinstance(value, datetime)):
            return value
        if isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            return date.fromisoformat(value)
        raise ValueError("生效日期须使用 YYYY-MM-DD 格式")

    @field_validator("from_start", "from_end", "start_time", "end_time")
    @classmethod
    def exact_time(cls, value):
        if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value):
            raise ValueError("上课时间须使用 HH:MM 格式")
        return value

    @model_validator(mode="after")
    def valid_range(self):
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("结束日期不能早于开始日期")
        if self.from_start >= self.from_end or self.start_time >= self.end_time:
            raise ValueError("下课时间必须晚于上课时间")
        return self


def validate_time_rules(rules: list[CourseTimeRule]):
    for index, rule in enumerate(rules):
        for other in rules[index + 1:]:
            if (rule.from_start, rule.from_end) == (other.from_start, other.from_end) and (
                rule.start_date <= (other.end_date or date.max)
                and other.start_date <= (rule.end_date or date.max)
            ):
                raise ValueError("同一原时段的生效日期不能重叠")
    return rules

from datetime import date, datetime


def validate_semester_setting(start_date: date, total_weeks: int) -> None:
    if isinstance(start_date, datetime) or not isinstance(start_date, date):
        raise ValueError("start_date must be a date")
    if start_date.weekday() != 0:
        raise ValueError("start_date must be a Monday")
    if isinstance(total_weeks, bool) or not isinstance(total_weeks, int):
        raise ValueError("total_weeks must be an integer")
    if not 1 <= total_weeks <= 30:
        raise ValueError("total_weeks must be between 1 and 30")

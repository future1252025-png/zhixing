from datetime import date, datetime


def validate_semester_setting(start_date: date, total_weeks: int) -> None:
    if isinstance(start_date, datetime) or not isinstance(start_date, date):
        raise ValueError("学期开始日期必须是日期")
    if start_date.weekday() != 0:
        raise ValueError("第一周周一必须选择星期一")
    if isinstance(total_weeks, bool) or not isinstance(total_weeks, int):
        raise ValueError("学期总周数必须是整数")
    if not 1 <= total_weeks <= 30:
        raise ValueError("学期总周数必须在 1 至 30 周之间")

from datetime import date, datetime
from zoneinfo import ZoneInfo


SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")


def get_current_time() -> datetime:
    return datetime.now(SHANGHAI_TZ)


def shanghai_today(now: datetime) -> date:
    if now.tzinfo is None:
        return now.replace(tzinfo=SHANGHAI_TZ).date()
    return now.astimezone(SHANGHAI_TZ).date()

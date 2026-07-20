from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Literal

from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session

from app.core.clock import shanghai_today
from app.core.semester import validate_semester_setting
from app.models import SemesterSetting
from app.schemas.semester import SemesterResponse


SemesterStatus = Literal["unconfigured", "before_term", "active", "after_term"]


@dataclass(frozen=True)
class SemesterState:
    status: SemesterStatus
    current_week: int | None


def resolve_semester_state(
    start_date: date,
    total_weeks: int,
    today: date,
) -> SemesterState:
    if today < start_date:
        return SemesterState(status="before_term", current_week=None)

    current_week = (today - start_date).days // 7 + 1
    if current_week > total_weeks:
        return SemesterState(status="after_term", current_week=None)
    return SemesterState(status="active", current_week=current_week)


def get_setting(session: Session, user_id: int) -> SemesterSetting | None:
    return session.scalar(
        select(SemesterSetting).where(SemesterSetting.user_id == user_id)
    )


def get_semester_response(
    session: Session,
    user_id: int,
    now: datetime,
) -> SemesterResponse:
    setting = get_setting(session, user_id)
    if setting is None:
        return SemesterResponse(
            status="unconfigured",
            start_date=None,
            total_weeks=None,
            current_week=None,
        )

    state = resolve_semester_state(
        setting.start_date,
        setting.total_weeks,
        shanghai_today(now),
    )
    return SemesterResponse(
        status=state.status,
        start_date=setting.start_date,
        total_weeks=setting.total_weeks,
        current_week=state.current_week,
    )


def upsert_setting(
    session: Session,
    user_id: int,
    start_date: date,
    total_weeks: int,
) -> SemesterSetting:
    validate_semester_setting(start_date, total_weeks)
    now = datetime.now(timezone.utc)
    statement = (
        insert(SemesterSetting)
        .values(
            user_id=user_id,
            start_date=start_date,
            total_weeks=total_weeks,
            created_at=now,
            updated_at=now,
        )
        .on_conflict_do_update(
            index_elements=[SemesterSetting.user_id],
            set_={
                "start_date": start_date,
                "total_weeks": total_weeks,
                "updated_at": now,
            },
        )
    )

    session.execute(statement)
    session.flush()

    session.expire_all()
    setting = get_setting(session, user_id)
    if setting is None:
        raise RuntimeError("semester setting upsert did not return a row")
    return setting

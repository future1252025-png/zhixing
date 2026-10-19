from datetime import date, timedelta
from hashlib import sha256
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import BusinessError
from app.models import Course, CourseMakeupRequest
from app.schemas.course_makeup import MakeupCreate, MakeupTiming
from app.services.course_calendar import occurs_on, course_times_on
from app.services.semester_service import get_setting
from app.services.user_mutation_guard import acquire_user_mutation_guard
from app.services.week_rule import WeekExpressionError


def _courses(session: Session, user_id: int) -> list[Course]:
    return list(session.scalars(select(Course).where(Course.user_id == user_id)).all())


def _check_date(setting, day: date) -> None:
    if setting is None:
        raise BusinessError(409, "semester_unconfigured", "请先设置学期，再安排补课")
    if not setting.start_date <= day < setting.start_date + timedelta(weeks=setting.total_weeks):
        raise BusinessError(422, "makeup_out_of_term", "补课日期需在当前学期内")


def validate_dates(courses: list[Course], setting, dates: set[date]) -> None:
    for day in sorted(dates):
        try:
            active = [course for course in courses if occurs_on(course, day, setting, courses)
                      and course.start_time and course.end_time and course.start_time < course.end_time]
        except WeekExpressionError as exc:
            raise BusinessError(409, "course_data_invalid", "课表中有无效周次，请先修正") from exc
        timed = sorted([(course, *course_times_on(course, day, setting)) for course in active], key=lambda item: (item[1], item[2]))
        for index, (left, start, end) in enumerate(timed):
            for right, right_start, _ in timed[index + 1:]:
                if right_start >= end:
                    break
                raise BusinessError(409, "course_conflict",
                    f"{day.isoformat()} {start}–{end}「{left.course_name}」与「{right.course_name}」时间冲突，请调整后重试",
                    details={"date": day.isoformat(), "course_ids": [left.id, right.id]})


def add_makeups(session: Session, user_id: int, payload: MakeupCreate) -> list[Course]:
    acquire_user_mutation_guard(session, user_id)
    request_id = str(payload.request_id)
    digest = sha256(json.dumps(payload.model_dump(mode="json"), sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    receipt = session.get(CourseMakeupRequest, (user_id, request_id))
    if receipt:
        if receipt.payload_hash != digest:
            raise BusinessError(409, "makeup_request_changed", "这次提交内容已变化，请重新确认补课")
        rows = list(session.scalars(select(Course).where(Course.user_id == user_id, Course.id.in_(receipt.course_ids))).all())
        if len(rows) != len(receipt.course_ids) or any(not row.makeup or row.makeup.get("batch_id") != request_id for row in rows):
            raise BusinessError(409, "makeup_already_cancelled", "这次补课已被取消，请重新选择课程")
        return rows
    setting = get_setting(session, user_id)
    existing = _courses(session, user_id)
    if sum(bool(course.makeup) for course in existing) + len(payload.entries) > 500:
        raise BusinessError(422, "makeup_limit", "最多保留 500 门补课，请先清理不再需要的安排")
    sources = {course.id: course for course in existing if not course.makeup}
    created: list[Course] = []
    for entry in payload.entries:
        _check_date(setting, entry.date)
        source = sources.get(entry.source_course_id)
        if source is None:
            raise BusinessError(404, "course_not_found", "原课程已不存在，请刷新后重新选择")
        if entry.source_date:
            try:
                active = occurs_on(source, entry.source_date, setting, existing + created)
            except WeekExpressionError:
                active = False
            if not active:
                raise BusinessError(409, "makeup_source_changed", "原日期没有这门课程，或已调课，请重新选择")
        if entry.cancel_source and not entry.source_date:
            raise BusinessError(422, "invalid_makeup_source", "请先选择要停课的原上课日期")
        location = entry.location if entry.location is not None else source.source_location
        changed_location = entry.location is not None
        row = Course(user_id=user_id, course_name=source.course_name, teacher=source.teacher,
            weekday=entry.date.isoweekday(), start_time=entry.start_time, end_time=entry.end_time,
            building_id=None if changed_location else source.building_id,
            room_name=entry.location if changed_location else source.room_name,
            source_kind="manual", weeks="1", makeup={
                "date": entry.date.isoformat(), "source_course_id": source.id,
                "source_date": entry.source_date.isoformat() if entry.source_date else None,
                "cancel_source": entry.cancel_source, "batch_id": request_id, "location": location,
            })
        created.append(row)
    validate_dates(existing + created, setting, {entry.date for entry in payload.entries})
    session.add_all(created)
    session.flush()
    session.add(CourseMakeupRequest(user_id=user_id, request_id=request_id, payload_hash=digest,
                                   course_ids=[row.id for row in created]))
    session.flush()
    return created


def update_makeup(session: Session, user_id: int, course_id: int, payload: MakeupTiming) -> Course:
    acquire_user_mutation_guard(session, user_id)
    rows = _courses(session, user_id)
    row = next((course for course in rows if course.id == course_id and course.makeup), None)
    if row is None:
        raise BusinessError(404, "course_not_found", "这门补课已不存在")
    setting = get_setting(session, user_id)
    _check_date(setting, payload.date)
    row.makeup = {**row.makeup, "date": payload.date.isoformat()}
    row.weekday = payload.date.isoweekday()
    row.start_time, row.end_time = payload.start_time, payload.end_time
    if payload.location is not None:
        row.makeup = {**row.makeup, "location": payload.location}
        row.room_name, row.building_id = payload.location, None
    validate_dates(rows, setting, {payload.date})
    session.flush()
    return row


def validate_makeup_removal(session: Session, user_id: int, removed: list[Course]) -> None:
    ids = {course.id for course in removed}
    dates = {date.fromisoformat(course.makeup["source_date"]) for course in removed
             if course.makeup and course.makeup.get("cancel_source") and course.makeup.get("source_date")}
    if dates:
        validate_dates([course for course in _courses(session, user_id) if course.id not in ids],
                       get_setting(session, user_id), dates)


def remove_batch(session: Session, user_id: int, batch_id: str) -> None:
    acquire_user_mutation_guard(session, user_id)
    if session.get(CourseMakeupRequest, (user_id, batch_id)) is None:
        raise BusinessError(404, "makeup_not_found", "这次补课安排不存在")
    rows = [course for course in _courses(session, user_id) if course.makeup and course.makeup["batch_id"] == batch_id]
    validate_makeup_removal(session, user_id, rows)
    for row in rows:
        session.delete(row)
    session.flush()

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.courses import _write_with_retry
from app.core.errors import BusinessError
from app.core.security import get_current_user
from app.db.database import get_session
from app.models import ReminderPlan, User
from app.schemas.reminder import ReminderPlanData
from app.services.user_mutation_guard import acquire_user_mutation_guard

router = APIRouter(prefix="/api/reminders", tags=["reminders"])


@router.get("", response_model=ReminderPlanData)
def read_reminders(
    session: Session = Depends(get_session), user: User = Depends(get_current_user),
) -> ReminderPlanData:
    record = session.get(ReminderPlan, user.id)
    return ReminderPlanData.model_validate_json(record.payload) if record else ReminderPlanData()


@router.put("", response_model=ReminderPlanData)
def save_reminders(
    payload: ReminderPlanData, session: Session = Depends(get_session), user: User = Depends(get_current_user),
) -> ReminderPlanData:
    user_id = user.id

    def persist() -> ReminderPlanData:
        acquire_user_mutation_guard(session, user_id)
        record = session.get(ReminderPlan, user_id, populate_existing=True)
        revision = record.revision if record else 0
        if payload.revision != revision:
            raise BusinessError(
                409, "reminder_revision_conflict", "提醒已在其他页面或设备修改，请刷新后再保存", fields=["revision"],
            )
        result = payload.model_copy(update={"revision": revision + 1})
        if record is None:
            record = ReminderPlan(user_id=user_id)
            session.add(record)
        record.revision = result.revision
        record.payload = result.model_dump_json()
        return result

    return _write_with_retry(session, persist)

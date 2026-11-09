"""Optional authenticated startup data, read together in one SQLite snapshot."""
import logging
from time import time

from sqlalchemy.orm import Session

from app.core.clock import get_current_time
from app.schemas.auth import StartupSnapshot
from app.schemas.course import CourseRead
from app.services.course_service import list_courses
from app.services.semester_service import get_semester_response

logger = logging.getLogger(__name__)


def read_startup_snapshot(auth_session: Session, user_id: int) -> StartupSnapshot | None:
    try:
        # Explicit BEGIN makes both reads consistent even with sqlite3 legacy
        # transaction control, where SELECT alone does not begin a transaction.
        connection = auth_session.connection()
        if not connection.connection.driver_connection.in_transaction:
            connection.exec_driver_sql("BEGIN")
        return StartupSnapshot(
            version=1, userId=user_id, savedAt=int(time() * 1000),
            courses=[CourseRead.model_validate(c) for c in list_courses(auth_session, user_id)],
            semester=get_semester_response(auth_session, user_id, get_current_time()),
        )
    except Exception:
        # A transient snapshot failure must not discard a successfully rotated
        # refresh credential. Clients can fall back to normal authenticated GETs.
        logger.exception("Optional startup snapshot unavailable")
        auth_session.rollback()
        return None

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import BusinessError
from app.db.database import get_session

router = APIRouter()


@router.get("/health")
def health_check() -> dict[str, str]:
    return {
        "status": "ok",
        "app": settings.app_name,
    }


@router.get("/ready")
def readiness_check(session: Session = Depends(get_session)) -> dict[str, str]:
    """Report whether the process can execute a database query."""
    try:
        session.execute(text("SELECT 1"))
    except SQLAlchemyError as error:
        raise BusinessError(
            503,
            "database_unavailable",
            "数据库暂时不可用，请稍后重试",
        ) from error
    return {
        "status": "ready",
        "app": settings.app_name,
    }

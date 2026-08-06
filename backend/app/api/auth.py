from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core import errors, rate_limit
from app.core.security import create_access_token, get_current_user
from app.db.database import get_session
from app.models import User
from app.schemas.auth import LoginRequest, LoginResponse, RegisterRequest
from app.schemas.user import UserProfileUpdate, UserRead
from app.services.auth_service import (
    DuplicateUserError,
    authenticate_user,
    create_user,
    get_user_by_student_id,
    get_user_by_username,
    update_user_profile,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _client_ip(request: Request) -> str:
    return request.client.host if request.client is not None else "unknown"


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    request: Request,
    session: Session = Depends(get_session),
) -> User:
    client_ip = _client_ip(request)
    if rate_limit.register_ip_limiter.is_limited(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=rate_limit.REGISTER_RATE_LIMITED,
        )
    # Single generic detail for both identity fields so the response cannot be
    # used to enumerate which one collided.
    duplicate = get_user_by_username(session, payload.username) is not None or (
        payload.student_id is not None
        and get_user_by_student_id(session, payload.student_id) is not None
    )
    if duplicate:
        rate_limit.register_ip_limiter.record_failure(client_ip)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=errors.DUPLICATE_USER,
        )
    try:
        return create_user(session, payload)
    except DuplicateUserError as exc:
        rate_limit.register_ip_limiter.record_failure(client_ip)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=errors.DUPLICATE_USER,
        ) from exc


@router.post("/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    request: Request,
    session: Session = Depends(get_session),
) -> LoginResponse:
    client_ip = _client_ip(request)
    if rate_limit.login_ip_limiter.is_limited(
        client_ip
    ) or rate_limit.login_username_limiter.is_limited(payload.username):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=rate_limit.LOGIN_RATE_LIMITED,
        )
    user = authenticate_user(session, payload.username, payload.password)
    if user is None:
        rate_limit.login_ip_limiter.record_failure(client_ip)
        rate_limit.login_username_limiter.record_failure(payload.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=errors.INVALID_CREDENTIALS,
            headers={"WWW-Authenticate": "Bearer"},
        )
    rate_limit.login_username_limiter.clear(payload.username)
    return LoginResponse(
        access_token=create_access_token(user.username),
        token_type="bearer",
        user=UserRead.model_validate(user),
    )


@router.get("/me", response_model=UserRead)
def read_current_user(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.patch("/me", response_model=UserRead)
def update_current_user_profile(
    payload: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> User:
    return update_user_profile(session, current_user, payload)

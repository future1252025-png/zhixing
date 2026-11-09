from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core import errors, rate_limit
from app.core.config import settings
from app.core.security import create_access_token, get_current_user
from app.db.database import get_session
from app.models import User
from app.schemas.auth import (
    DeleteAccountRequest,
    LoginRequest,
    LoginResponse,
    LogoutRequest,
    RefreshRequest,
    RefreshResponse,
    RegisterRequest,
)
from app.schemas.user import UserProfileUpdate, UserRead
from app.services.startup_service import read_startup_snapshot
from app.services.auth_service import (
    DuplicateUserError,
    authenticate_user,
    create_user,
    delete_user_account,
    get_user_by_student_id,
    update_user_profile,
)
from app.services.refresh_session_service import (
    RefreshSessionError,
    issue_refresh_session,
    revoke_refresh_session,
    rotate_refresh_session,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
REFRESH_COOKIE_NAME = "campusmind_refresh"


def _client_ip(request: Request) -> str:
    return request.client.host if request.client is not None else "unknown"


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.is_production,
        samesite="strict",
        path="/api/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        httponly=True,
        secure=settings.is_production,
        samesite="strict",
        path="/api/auth",
    )


def _presented_refresh_token(
    payload: RefreshRequest,
    request: Request,
) -> str | None:
    if payload.client_kind == "native":
        return payload.refresh_token
    return request.cookies.get(REFRESH_COOKIE_NAME)


def _validate_web_refresh_origin(payload: RefreshRequest, request: Request) -> None:
    if payload.client_kind == "native":
        return
    origin = request.headers.get("origin", "").strip()
    if origin not in settings.cors_allow_origins:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=errors.REFRESH_ORIGIN_INVALID,
        )


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
    duplicate = get_user_by_student_id(session, payload.student_id) is not None
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


@router.post(
    "/login",
    response_model=LoginResponse,
    response_model_exclude_none=True,
)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> LoginResponse:
    client_ip = _client_ip(request)
    if rate_limit.login_ip_limiter.is_limited(
        client_ip
    ) or rate_limit.login_username_limiter.is_limited(payload.student_id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=rate_limit.LOGIN_RATE_LIMITED,
        )
    user = authenticate_user(session, payload.student_id, payload.password)
    if user is None:
        rate_limit.login_ip_limiter.record_failure(client_ip)
        rate_limit.login_username_limiter.record_failure(payload.student_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=errors.INVALID_CREDENTIALS,
            headers={"WWW-Authenticate": "Bearer"},
        )
    rate_limit.login_username_limiter.clear(payload.student_id)
    refresh_token = issue_refresh_session(session, user)
    if payload.client_kind == "web":
        _set_refresh_cookie(response, refresh_token)
    return LoginResponse(
        access_token=create_access_token(user.token_subject),
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
        refresh_token=refresh_token if payload.client_kind == "native" else None,
        user=UserRead.model_validate(user),
        startup=read_startup_snapshot(session, user.id) if payload.include_startup else None,
    )


@router.post(
    "/refresh",
    response_model=RefreshResponse,
    response_model_exclude_none=True,
)
def refresh_access_token(
    payload: RefreshRequest,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> RefreshResponse:
    _validate_web_refresh_origin(payload, request)
    refresh_token = _presented_refresh_token(payload, request)
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=errors.REFRESH_TOKEN_INVALID,
        )
    try:
        next_refresh_token, user = rotate_refresh_session(session, refresh_token)
    except RefreshSessionError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=errors.REFRESH_TOKEN_INVALID,
        ) from exc

    if payload.client_kind == "web":
        _set_refresh_cookie(response, next_refresh_token)
    return RefreshResponse(
        access_token=create_access_token(user.token_subject),
        expires_in=settings.access_token_expire_minutes * 60,
        refresh_token=(
            next_refresh_token if payload.client_kind == "native" else None
        ),
        user=UserRead.model_validate(user),
        startup=read_startup_snapshot(session, user.id) if payload.include_startup else None,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    payload: LogoutRequest,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> None:
    _validate_web_refresh_origin(payload, request)
    refresh_token = _presented_refresh_token(payload, request)
    if refresh_token:
        revoke_refresh_session(session, refresh_token)
    _clear_refresh_cookie(response)


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


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_current_user_account(
    payload: DeleteAccountRequest,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    client_ip = _client_ip(request)
    if rate_limit.login_ip_limiter.is_limited(
        client_ip
    ) or rate_limit.login_username_limiter.is_limited(current_user.student_id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=rate_limit.LOGIN_RATE_LIMITED,
        )

    if authenticate_user(session, current_user.student_id, payload.password) is None:
        rate_limit.login_ip_limiter.record_failure(client_ip)
        rate_limit.login_username_limiter.record_failure(current_user.student_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=errors.INVALID_CREDENTIALS,
        )

    delete_user_account(session, current_user)
    _clear_refresh_cookie(response)

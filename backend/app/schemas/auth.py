from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.user import UserRead


def _normalize_student_id(value: str) -> str:
    text = value.strip()
    if len(text) < 3:
        raise ValueError("学号至少需要 3 个字符")
    return text


def _validate_password(value: str) -> str:
    if len(value.encode("utf-8")) > 72:
        # bcrypt only uses the first 72 bytes; reject instead of silently truncating
        raise ValueError("密码过长")
    return value


class StudentIdentityRequest(BaseModel):
    """Expose one student-ID identity while accepting old request payloads."""

    student_id: str = Field(min_length=3, max_length=32)

    @model_validator(mode="before")
    @classmethod
    def populate_student_id_from_legacy_username(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value

        normalized = dict(value)
        student_id = normalized.get("student_id")
        username = normalized.pop("username", None)
        student_id_text = (
            student_id.strip() if isinstance(student_id, str) else student_id
        )
        username_text = username.strip() if isinstance(username, str) else username

        if not student_id_text and username_text:
            normalized["student_id"] = username
        elif student_id_text and username_text and student_id_text != username_text:
            raise ValueError("身份信息不一致，请重新输入学号")
        return normalized

    @field_validator("student_id")
    @classmethod
    def normalize_student_id(cls, value: str) -> str:
        return _normalize_student_id(value)


class RegisterRequest(StudentIdentityRequest):
    password: str = Field(min_length=6, max_length=128)
    nickname: str = Field(min_length=1, max_length=64)

    @field_validator("nickname")
    @classmethod
    def normalize_nickname(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("昵称不能为空")
        return text

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return _validate_password(value)


class LoginRequest(StudentIdentityRequest):
    password: str = Field(min_length=6, max_length=128)
    client_kind: Literal["web", "native"] = "web"

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return _validate_password(value)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: str | None = None


class RefreshResponse(TokenResponse):
    user: UserRead


class RefreshRequest(BaseModel):
    client_kind: Literal["web", "native"] = "web"
    refresh_token: str | None = Field(default=None, min_length=32, max_length=512)


class LogoutRequest(RefreshRequest):
    pass


class DeleteAccountRequest(BaseModel):
    password: str = Field(min_length=6, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return _validate_password(value)


class LoginResponse(TokenResponse):
    user: UserRead

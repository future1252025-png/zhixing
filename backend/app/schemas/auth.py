from pydantic import BaseModel, Field, field_validator

from app.schemas.user import UserRead


def _normalize_username(value: str) -> str:
    text = value.strip()
    if len(text) < 3:
        raise ValueError("Username must be at least 3 characters")
    return text


def _validate_password(value: str) -> str:
    if len(value.encode("utf-8")) > 72:
        # bcrypt only uses the first 72 bytes; reject instead of silently truncating
        raise ValueError("Password is too long")
    return value


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    nickname: str = Field(min_length=1, max_length=64)
    student_id: str | None = Field(default=None, max_length=32)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return _normalize_username(value)

    @field_validator("nickname")
    @classmethod
    def normalize_nickname(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("Nickname cannot be empty")
        return text

    @field_validator("student_id")
    @classmethod
    def normalize_student_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        text = value.strip()
        return text or None

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return _validate_password(value)


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return _normalize_username(value)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return _validate_password(value)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginResponse(TokenResponse):
    user: UserRead

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: str | None = None
    username: str
    nickname: str
    avatar_text: str | None = None
    avatar_color: str | None = None
    role: str
    created_at: datetime


class UserProfileUpdate(BaseModel):
    nickname: str = Field(min_length=1, max_length=64)
    avatar_text: str | None = Field(default=None, max_length=4)
    avatar_color: str | None = Field(
        default=None,
        pattern=r"^#[0-9a-fA-F]{6}$",
    )

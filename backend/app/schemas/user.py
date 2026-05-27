from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: str | None = None
    username: str
    nickname: str
    role: str
    created_at: datetime

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any


class BusinessError(Exception):
    """A client-safe domain failure with a stable JSON contract."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        fields: Sequence[str] = (),
        details: Mapping[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.fields = list(fields)
        self.details = dict(details or {})

    def as_response(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "message": self.message,
            "fields": self.fields,
            "details": self.details,
        }


"""Stable API error details (Chinese, user-facing)."""

# Auth
USERNAME_EXISTS = "用户名已存在"
STUDENT_ID_EXISTS = "学号已存在"
DUPLICATE_USER = "用户名或学号已存在"
INVALID_CREDENTIALS = "用户名或密码错误"
TOKEN_EXPIRED = "登录已过期，请重新登录"
TOKEN_INVALID = "登录无效，请重新登录"

# Resources
BUILDING_NOT_FOUND = "建筑不存在"
COURSE_NOT_FOUND = "课程不存在"
CURRENT_BUILDING_NOT_FOUND = "当前位置建筑不存在"
NO_UPCOMING_COURSE = "暂无后续课程"
TARGET_BUILDING_NOT_FOUND = "课程目标建筑不存在"

# Messages / location
MESSAGE_LOCATION_TOO_FAR = "当前位置距离该建筑过远，不能在这里留言"

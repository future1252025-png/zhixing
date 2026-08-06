from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class BusinessErrorResponse(BaseModel):
    code: str
    message: str
    fields: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)

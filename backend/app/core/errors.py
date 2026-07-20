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

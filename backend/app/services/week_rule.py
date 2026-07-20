"""Parsing and normalization for course week expressions."""

from __future__ import annotations

from dataclasses import dataclass
import re


class WeekExpressionError(ValueError):
    """Raised when a course week expression cannot be parsed safely."""


_TOKEN_RE = re.compile(
    r"(?P<start>\d+)(?:-(?P<end>\d+))?(?:\((?P<parity>[单双])\))?"
)
_CHARACTER_NORMALIZATION = str.maketrans(
    {
        "，": ",",
        "、": ",",
        "（": "(",
        "）": ")",
        "－": "-",
        "–": "-",
        "—": "-",
    }
)


@dataclass(frozen=True)
class _WeekToken:
    weeks: frozenset[int]
    normalized: str


def _validate_max_week(max_week: int) -> None:
    if isinstance(max_week, bool) or not isinstance(max_week, int) or max_week <= 0:
        raise WeekExpressionError("max_week must be a positive integer")


def _prepare_expression(value: str) -> list[str]:
    if not isinstance(value, str):
        raise WeekExpressionError("Week expression must be a string")

    text = re.sub(r"\s+", "", value.translate(_CHARACTER_NORMALIZATION))
    if text.startswith("第"):
        text = text[1:]
    if text.endswith("周"):
        text = text[:-1]
    if not text:
        raise WeekExpressionError("Week expression cannot be empty")

    tokens = text.split(",")
    if any(not token for token in tokens):
        raise WeekExpressionError("Week expression contains an empty token")
    return tokens


def _parse_token(token: str, max_week: int) -> _WeekToken:
    match = _TOKEN_RE.fullmatch(token)
    if match is None:
        raise WeekExpressionError(f"Invalid week token: {token}")

    start = int(match.group("start"))
    end_text = match.group("end")
    parity = match.group("parity")
    if parity is not None and end_text is None:
        raise WeekExpressionError("Parity is only allowed on a week range")

    end = int(end_text) if end_text is not None else start
    if start < 1 or end < 1 or start > max_week or end > max_week:
        raise WeekExpressionError(f"Week must be between 1 and {max_week}")
    if start > end:
        raise WeekExpressionError("Week range start must not exceed end")

    if parity is None:
        weeks = frozenset(range(start, end + 1))
        normalized = str(start) if end_text is None else f"{start}-{end}"
        return _WeekToken(weeks=weeks, normalized=normalized)

    expected_parity = 1 if parity == "单" else 0
    weeks = frozenset(week for week in range(start, end + 1) if week % 2 == expected_parity)
    if not weeks:
        raise WeekExpressionError("Parity range does not include any matching week")
    normalized = f"{min(weeks)}-{max(weeks)}({parity})"
    return _WeekToken(weeks=weeks, normalized=normalized)


def _parse_expression(value: str, max_week: int) -> list[_WeekToken]:
    _validate_max_week(max_week)
    return [_parse_token(token, max_week) for token in _prepare_expression(value)]


def parse_weeks(value: str, *, max_week: int) -> set[int]:
    """Return every week selected by a valid week expression."""

    return set().union(*(token.weeks for token in _parse_expression(value, max_week)))


def normalize_weeks(value: str, *, max_week: int) -> str:
    """Return a stable, parse-equivalent canonical week expression."""

    normalized_tokens: list[str] = []
    seen: set[str] = set()
    for token in _parse_expression(value, max_week):
        if token.normalized not in seen:
            seen.add(token.normalized)
            normalized_tokens.append(token.normalized)
    return ",".join(normalized_tokens)


def weeks_overlap(left: str, right: str, *, max_week: int) -> set[int]:
    """Return the weeks selected by both expressions."""

    return parse_weeks(left, max_week=max_week) & parse_weeks(right, max_week=max_week)

"""Parsing and normalization for course week expressions."""

from __future__ import annotations

from dataclasses import dataclass
import re


class WeekExpressionError(ValueError):
    """Raised when a course week expression cannot be parsed safely."""


_TOKEN_RE = re.compile(
    r"(?P<start>[0-9]{1,2})(?:-(?P<end>[0-9]{1,2}))?(?:\((?P<parity>[单双])\))?"
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
    parity: str | None


def _validate_max_week(max_week: int) -> None:
    if isinstance(max_week, bool) or not isinstance(max_week, int) or max_week <= 0:
        raise WeekExpressionError("最大学期周数必须是正整数")


def _prepare_expression(value: str) -> list[str]:
    if not isinstance(value, str):
        raise WeekExpressionError("上课周次必须是文字")

    text = value.translate(_CHARACTER_NORMALIZATION).strip()
    if text.startswith("第"):
        text = text[1:].lstrip()
    if text.endswith("周"):
        text = text[:-1].rstrip()
    text = re.sub(r"\s*(?=[,()\-])|(?<=[,()\-])\s*", "", text)
    if not text:
        raise WeekExpressionError("上课周次不能为空")

    tokens = text.split(",")
    if any(not token for token in tokens):
        raise WeekExpressionError("上课周次中存在空白项")
    return tokens


def _parse_token(token: str, max_week: int) -> _WeekToken:
    match = _TOKEN_RE.fullmatch(token)
    if match is None:
        raise WeekExpressionError(f"无法识别周次：{token}")

    start = int(match.group("start"))
    end_text = match.group("end")
    parity = match.group("parity")
    if parity is not None and end_text is None:
        raise WeekExpressionError("单双周只能用于周次范围")

    end = int(end_text) if end_text is not None else start
    if start < 1 or end < 1 or start > max_week or end > max_week:
        raise WeekExpressionError(f"周次必须在第 1 至 {max_week} 周之间")
    if start > end:
        raise WeekExpressionError("起始周不能晚于结束周")

    if parity is None:
        weeks = frozenset(range(start, end + 1))
        return _WeekToken(weeks=weeks, parity=None)

    expected_parity = 1 if parity == "单" else 0
    weeks = frozenset(week for week in range(start, end + 1) if week % 2 == expected_parity)
    if not weeks:
        raise WeekExpressionError("所选范围内没有符合单双周条件的周次")
    return _WeekToken(weeks=weeks, parity=parity)


def _parse_expression(value: str, max_week: int) -> list[_WeekToken]:
    _validate_max_week(max_week)
    return [_parse_token(token, max_week) for token in _prepare_expression(value)]


def parse_weeks(value: str, *, max_week: int) -> set[int]:
    """Return every week selected by a valid week expression."""

    return set().union(*(token.weeks for token in _parse_expression(value, max_week)))


def normalize_weeks(value: str, *, max_week: int) -> str:
    """Return a stable, parse-equivalent canonical week expression."""

    tokens = _parse_expression(value, max_week)
    weeks = set().union(*(token.weeks for token in tokens))
    if any(token.parity is not None for token in tokens) and _is_long_parity_progression(weeks):
        parity = "单" if min(weeks) % 2 else "双"
        return f"{min(weeks)}-{max(weeks)}({parity})"
    return _format_week_union(weeks)


def _is_long_parity_progression(weeks: set[int]) -> bool:
    ordered = sorted(weeks)
    return len(ordered) >= 3 and all(
        current == previous + 2 for previous, current in zip(ordered, ordered[1:])
    )


def _format_week_union(weeks: set[int]) -> str:
    ordered = sorted(weeks)
    pieces: list[str] = []
    run_start = ordered[0]
    previous = ordered[0]

    for week in ordered[1:]:
        if week == previous + 1:
            previous = week
            continue
        _append_run(pieces, run_start, previous)
        run_start = previous = week
    _append_run(pieces, run_start, previous)
    return ",".join(pieces)


def _append_run(pieces: list[str], start: int, end: int) -> None:
    if end - start >= 2:
        pieces.append(f"{start}-{end}")
    else:
        pieces.extend(str(week) for week in range(start, end + 1))


def weeks_overlap(left: str, right: str, *, max_week: int) -> set[int]:
    """Return the weeks selected by both expressions."""

    return parse_weeks(left, max_week=max_week) & parse_weeks(right, max_week=max_week)


def weeks_fit_max_week(value: str, *, max_week: int) -> bool:
    """Whether a stored expression is valid within a proposed semester length."""
    try:
        parse_weeks(value, max_week=max_week)
    except WeekExpressionError:
        return False
    return True

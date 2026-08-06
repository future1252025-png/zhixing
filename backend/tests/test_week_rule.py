import pytest

from app.services.week_rule import (
    WeekExpressionError,
    normalize_weeks,
    parse_weeks,
    weeks_overlap,
)


def test_parse_and_normalize_regular_range() -> None:
    assert parse_weeks("1-16", max_week=20) == set(range(1, 17))
    assert normalize_weeks("1-16", max_week=20) == "1-16"


def test_parse_and_normalize_explicit_week_list() -> None:
    assert parse_weeks("1,3,5", max_week=20) == {1, 3, 5}
    assert normalize_weeks("1,3,5", max_week=20) == "1,3,5"


@pytest.mark.parametrize(
    ("raw", "expected_weeks", "expected_normalized"),
    [
        ("1-16(单)", set(range(1, 17, 2)), "1-15(单)"),
        ("1-16（双）", set(range(2, 17, 2)), "2-16(双)"),
    ],
)
def test_parity_ranges_use_their_actual_matching_endpoints(
    raw: str,
    expected_weeks: set[int],
    expected_normalized: str,
) -> None:
    assert parse_weeks(raw, max_week=20) == expected_weeks
    assert normalize_weeks(raw, max_week=20) == expected_normalized


def test_normalization_accepts_chinese_delimiters_whitespace_and_week_affixes() -> None:
    assert normalize_weeks(" 1， 3、5 ", max_week=20) == "1,3,5"
    assert normalize_weeks("第1-4周", max_week=20) == "1-4"


@pytest.mark.parametrize("raw", ["", "0-3", "2-1", "1-21", "abc", "1,,3"])
def test_invalid_week_expression_is_rejected(raw: str) -> None:
    with pytest.raises(WeekExpressionError):
        parse_weeks(raw, max_week=20)


def test_normalization_is_idempotent_and_preserves_week_set() -> None:
    normalized = normalize_weeks("第 1， 3、5周", max_week=20)

    assert normalized == "1,3,5"
    assert normalize_weeks(normalized, max_week=20) == normalized
    assert parse_weeks(normalized, max_week=20) == parse_weeks("第 1， 3、5周", max_week=20)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("1,2,3", "1-3"),
        ("3,2,1", "1-3"),
        ("1-3,2-4", "1-4"),
        ("1,1,2,3", "1-3"),
        ("8,2,1,4,3,7", "1-4,7,8"),
    ],
)
def test_normalization_canonicalizes_the_sorted_week_union(raw: str, expected: str) -> None:
    assert normalize_weeks(raw, max_week=20) == expected


def test_normalization_does_not_invent_parity_for_explicit_week_lists() -> None:
    assert normalize_weeks("1,3,5", max_week=20) == "1,3,5"


def test_normalization_preserves_explicit_parity_for_a_long_same_parity_union() -> None:
    assert normalize_weeks("1-5(单),7", max_week=20) == "1-7(单)"


def test_normalization_does_not_emit_parity_for_a_gapped_same_parity_union() -> None:
    assert normalize_weeks("1-1(单),5,7", max_week=20) == "1,5,7"


def test_duplicate_and_overlapping_tokens_canonicalize_to_their_union() -> None:
    normalized = normalize_weeks("01,1,1-3,2-4", max_week=20)

    assert normalized == "1-4"
    assert parse_weeks(normalized, max_week=20) == {1, 2, 3, 4}


def test_parity_range_without_a_matching_week_is_rejected() -> None:
    with pytest.raises(WeekExpressionError):
        parse_weeks("2-2(单)", max_week=20)


@pytest.mark.parametrize("max_week", [0, -1])
def test_non_positive_max_week_is_rejected(max_week: int) -> None:
    with pytest.raises(WeekExpressionError):
        parse_weeks("1", max_week=max_week)


@pytest.mark.parametrize("raw", ["1 2", "1\n2", "1\u00a02", "1\u20032"])
def test_digit_internal_whitespace_is_rejected(raw: str) -> None:
    with pytest.raises(WeekExpressionError):
        parse_weeks(raw, max_week=20)


def test_whitespace_around_recognized_boundaries_is_accepted() -> None:
    assert normalize_weeks(" 第 1 - 4 （ 单 ） ， 7 周 ", max_week=20) == "1,3,7"


@pytest.mark.parametrize(
    "raw",
    ["001", "0" * 64, "١-٣", "１-３"],
)
def test_non_ascii_or_overlong_numeric_tokens_raise_week_expression_error(raw: str) -> None:
    with pytest.raises(WeekExpressionError):
        parse_weeks(raw, max_week=20)


def test_weeks_overlap_returns_common_weeks() -> None:
    assert weeks_overlap("1-16(单)", "10-12", max_week=20) == {11}

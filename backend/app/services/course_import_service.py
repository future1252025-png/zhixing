from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import time
from hashlib import sha256
from html.parser import HTMLParser
from io import BytesIO
from pathlib import PurePath
import re
from zipfile import BadZipFile, ZipFile

from openpyxl import load_workbook
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session
import xlrd

from app.core.errors import BusinessError
from app.models import Building, Course, CourseImportSource
from app.schemas.course import CourseImportCreate
from app.schemas.course_import import (
    CourseImportPreviewResponse,
    ImportCandidateResponse,
    ImportCommitManifest,
    ImportFileInfo,
    ImportIssueResponse,
    ImportResolution,
    RawCourseSourceResponse,
)
from app.services.course_policy import location_requires_review
from app.services.course_service import add_course, validate_course_batch
from app.services.user_mutation_guard import acquire_user_mutation_guard


WEEKDAY_LABELS = {
    "星期一": 1,
    "周一": 1,
    "星期二": 2,
    "周二": 2,
    "星期三": 3,
    "周三": 3,
    "星期四": 4,
    "周四": 4,
    "星期五": 5,
    "周五": 5,
    "星期六": 6,
    "周六": 6,
    "星期日": 7,
    "星期天": 7,
    "周日": 7,
    "周天": 7,
}

SECTION_TIMES = {
    "01-02": (time(8, 0), time(9, 40)),
    "03-04": (time(9, 55), time(11, 35)),
    "05-06": (time(14, 0), time(15, 40)),
    "07-08": (time(15, 55), time(17, 35)),
    "09-10": (time(19, 0), time(21, 35)),
}

TIME_RANGE_RE = re.compile(
    r"(?P<start>\d{1,2}:\d{2})\s*[-~—–至]\s*(?P<end>\d{1,2}:\d{2})"
)
SECTION_RE = re.compile(
    r"[\[【](?P<start>\d{1,2})\s*[-~—–]\s*(?P<end>\d{1,2})\s*节?[\]】]"
)
BRACKET_TOKEN_RE = re.compile(r"(?:\[[^\]]+\]|【[^】]+】)")
RAW_WEEKS_RE = re.compile(
    r"(?P<weeks>\d+(?:\s*[-,，]\s*\d+)*"
    r"(?:\s*(?:[（(]\s*(?:周|[单双]\s*周?)\s*[)）]|[单双]\s*周))?)"
)
DASH_RE = re.compile(r"^-{3,}$")
CONNECTOR_CHARS = " -—–·()（）"
MAX_XLSX_EXPANDED_BYTES = 50 * 1024 * 1024
TIMETABLE_AXIS_LABELS = frozenset({"节次", "时间", "上课时间", "课节", "节数"})
TIMETABLE_AXIS_RE = re.compile(
    r"(?:\d{1,2}:\d{2}\s*[-~—–至]\s*\d{1,2}:\d{2})"
    r"|(?:第?[\d一二三四五六七八九十]+(?:[-~—–、]?"
    r"[\d一二三四五六七八九十]+)?节)"
)
NON_BLOCKING_IMPORT_ISSUE_CODES = frozenset(
    {"building_unrecognized", "room_missing", "time_unrecognized"}
)
UNMAPPED_ROOM_FALLBACK = "待确认教室"


@dataclass(frozen=True)
class RawCourseRow:
    row_ref: str
    raw_course_name: str
    raw_weekday: str
    raw_time_or_section: str
    raw_teacher: str
    raw_weeks: str
    raw_location: str


@dataclass(frozen=True)
class ImportIssue:
    code: str
    field: str
    message: str


@dataclass(frozen=True)
class ImportCandidate:
    source: RawCourseRow
    course_name: str | None
    weekday: int | None
    start_time: time | None
    end_time: time | None
    teacher: str | None
    weeks: str | None
    suggested_building_id: int | None
    suggested_building_name: str | None
    suggested_room_name: str | None
    errors: tuple[ImportIssue, ...]


@dataclass(frozen=True)
class ResolvedImportCourse:
    source: RawCourseRow
    course: CourseImportCreate


@dataclass(frozen=True)
class ParsedCourseBlock:
    """Compatibility model for callers of the former cell parser."""

    course_name: str
    weekday: int
    start_time: str
    end_time: str
    room_name: str
    teacher: str | None
    weeks: str | None
    raw_weeks: str | None
    raw_location: str | None


@dataclass(frozen=True)
class _BuildingMatch:
    building: Building
    alias: str


class _TableTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self._current_row: list[str] | None = None
        self._current_cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        _ = attrs
        if tag.lower() == "tr":
            self._current_row = []
        elif tag.lower() in {"td", "th"} and self._current_row is not None:
            self._current_cell = []
        elif tag.lower() == "br" and self._current_cell is not None:
            self._current_cell.append("\n")

    def handle_data(self, data: str) -> None:
        if self._current_cell is not None:
            self._current_cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        normalized_tag = tag.lower()
        if (
            normalized_tag in {"td", "th"}
            and self._current_row is not None
            and self._current_cell is not None
        ):
            self._current_row.append(_clean_cell_text("".join(self._current_cell)))
            self._current_cell = None
        elif normalized_tag == "tr" and self._current_row is not None:
            if any(cell.strip() for cell in self._current_row):
                self.rows.append(self._current_row)
            self._current_row = None


def _clean_cell_text(value: object) -> str:
    text = "" if value is None else str(value)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"[ \t\f\v]+", " ", line).strip() for line in text.split("\n")]
    return "\n".join(line for line in lines if line)


def _split_course_blocks(cell_text: str) -> list[list[str]]:
    blocks: list[list[str]] = []
    current: list[str] = []
    for line in _clean_cell_text(cell_text).split("\n"):
        if DASH_RE.fullmatch(line):
            if current:
                blocks.append(current)
                current = []
            continue
        current.append(line)
    if current:
        blocks.append(current)
    return blocks


def _decode_html(content: bytes) -> str:
    for encoding in ("utf-8-sig", "gb18030"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise BusinessError(
        422,
        "invalid_import_file",
        "无法读取课表文件编码",
        fields=["file"],
    )


def _extract_html_rows(content: bytes) -> list[list[str]]:
    parser = _TableTextParser()
    parser.feed(_decode_html(content))
    return parser.rows


def _extract_xlsx_rows(content: bytes) -> list[list[str]]:
    try:
        with ZipFile(BytesIO(content)) as archive:
            expanded_size = sum(item.file_size for item in archive.infolist())
    except BadZipFile as exc:
        raise ValueError("invalid XLSX archive") from exc
    if expanded_size > MAX_XLSX_EXPANDED_BYTES:
        raise BusinessError(
            413,
            "import_file_too_large",
            "XLSX 解压后的内容过大",
            fields=["file"],
            details={"max_expanded_bytes": MAX_XLSX_EXPANDED_BYTES},
        )

    workbook = load_workbook(BytesIO(content), data_only=False, read_only=True)
    try:
        sheet = workbook.active
        return [
            [_clean_cell_text(value) for value in row]
            for row in sheet.iter_rows(values_only=True)
            if any(_clean_cell_text(value) for value in row)
        ]
    finally:
        workbook.close()


def _extract_xls_rows(content: bytes) -> list[list[str]]:
    workbook = xlrd.open_workbook(file_contents=content, on_demand=True)
    try:
        sheet = workbook.sheet_by_index(0)
        return [
            [_clean_cell_text(sheet.cell_value(row_index, column_index)) for column_index in range(sheet.ncols)]
            for row_index in range(sheet.nrows)
            if any(
                _clean_cell_text(sheet.cell_value(row_index, column_index))
                for column_index in range(sheet.ncols)
            )
        ]
    finally:
        workbook.release_resources()


def _read_rows(filename: str, content: bytes) -> list[list[str]]:
    suffix = PurePath(filename).suffix.lower()
    try:
        if suffix in {".htm", ".html"}:
            return _extract_html_rows(content)
        if suffix == ".xlsx":
            return _extract_xlsx_rows(content)
        if suffix == ".xls":
            if content.lstrip().startswith((b"<", b"<!")):
                return _extract_html_rows(content)
            return _extract_xls_rows(content)
    except BusinessError:
        raise
    except (OSError, ValueError, KeyError, EOFError, xlrd.XLRDError) as exc:
        raise BusinessError(
            422,
            "invalid_import_file",
            "课表文件已损坏或内容无法识别",
            fields=["file"],
            details={"filename": filename},
        ) from exc

    raise BusinessError(
        415,
        "unsupported_import_format",
        "仅支持 HTM、HTML、XLS、XLSX 课表文件",
        fields=["file"],
        details={"filename": filename},
    )


def _find_header_row(
    rows: Sequence[Sequence[str]],
) -> tuple[int, dict[int, tuple[int, str]]]:
    for row_index, row in enumerate(rows):
        weekday_columns: dict[int, tuple[int, str]] = {}
        for column_index, cell in enumerate(row):
            compact = re.sub(r"\s+", "", cell)
            weekday = WEEKDAY_LABELS.get(compact)
            if weekday is not None:
                weekday_columns[column_index] = (weekday, cell)
        if weekday_columns:
            _require_timetable_structure(rows, row_index, weekday_columns)
            return row_index, weekday_columns
    raise BusinessError(
        422,
        "weekday_header_missing",
        "未在课表中找到星期表头",
        fields=["file"],
    )


def _require_timetable_structure(
    rows: Sequence[Sequence[str]],
    header_index: int,
    weekday_columns: dict[int, tuple[int, str]],
) -> None:
    """Reject generic tables before they can enter the destructive import flow.

    A supported timetable has a leading time/section axis followed by exact
    weekday headers. Requiring that independent structural signal prevents an
    events/news table containing text such as "周一活动" from being treated as a
    full timetable snapshot.
    """

    first_weekday_column = min(weekday_columns)
    if first_weekday_column <= 0:
        _raise_low_timetable_confidence()

    header = rows[header_index]
    leading_header_cells = [
        re.sub(r"\s+", "", cell)
        for cell in header[:first_weekday_column]
    ]
    has_named_axis = any(cell in TIMETABLE_AXIS_LABELS for cell in leading_header_cells)
    has_timed_axis_row = any(
        row
        and bool(TIMETABLE_AXIS_RE.search(_clean_cell_text(row[0])))
        for row in rows[header_index + 1 :]
    )
    has_full_week_shape = len(set(weekday for weekday, _ in weekday_columns.values())) >= 3
    if not (has_full_week_shape and (has_named_axis or has_timed_axis_row)):
        _raise_low_timetable_confidence()


def _raise_low_timetable_confidence() -> None:
    raise BusinessError(
        422,
        "timetable_confidence_low",
        "文件结构不像完整课表，已终止导入以保护原课表",
        fields=["file"],
    )


def _extract_source_fields(
    lines: Sequence[str],
    *,
    row_ref: str,
    raw_weekday: str,
    row_time_text: str,
) -> RawCourseRow:
    course_name = lines[0].strip() if lines else ""
    detail_lines = list(lines[1:])
    week_index = next(
        (
            index
            for index, line in enumerate(detail_lines)
            if RAW_WEEKS_RE.search(line)
            and ("周" in line or BRACKET_TOKEN_RE.search(line) or TIME_RANGE_RE.search(line))
        ),
        -1,
    )

    if week_index >= 0:
        schedule_line = detail_lines[week_index]
        teacher_lines = detail_lines[:week_index]
        location_lines = detail_lines[week_index + 1 :]
    else:
        schedule_line = ""
        teacher_lines = detail_lines[:1]
        location_lines = detail_lines[1:]

    raw_weeks_match = RAW_WEEKS_RE.search(schedule_line)
    raw_weeks = raw_weeks_match.group("weeks").strip() if raw_weeks_match else ""
    time_or_section_match = BRACKET_TOKEN_RE.search(schedule_line)
    if time_or_section_match is None:
        time_or_section_match = TIME_RANGE_RE.search(schedule_line)
    if time_or_section_match is None:
        time_or_section_match = TIME_RANGE_RE.search(row_time_text)

    return RawCourseRow(
        row_ref=row_ref,
        raw_course_name=course_name,
        raw_weekday=raw_weekday,
        raw_time_or_section=time_or_section_match.group(0) if time_or_section_match else "",
        raw_teacher="\n".join(teacher_lines).strip(),
        raw_weeks=raw_weeks,
        raw_location="\n".join(location_lines).strip(),
    )


def _rows_to_raw_courses(rows: Sequence[Sequence[str]]) -> list[RawCourseRow]:
    header_index, weekday_columns = _find_header_row(rows)
    raw_courses: list[RawCourseRow] = []
    for row in rows[header_index + 1 :]:
        row_time_text = row[0] if row else ""
        for column_index, (_weekday, raw_weekday) in weekday_columns.items():
            if column_index >= len(row) or not row[column_index].strip():
                continue
            for lines in _split_course_blocks(row[column_index]):
                raw_courses.append(
                    _extract_source_fields(
                        lines,
                        row_ref=f"row-{len(raw_courses) + 1}",
                        raw_weekday=raw_weekday,
                        row_time_text=row_time_text,
                    )
                )
    return raw_courses


def normalize_weeks(raw_weeks: str) -> str:
    normalized = raw_weeks.translate(
        str.maketrans({"（": "(", "）": ")", "，": ","})
    )
    normalized = re.sub(r"\s+", "", normalized)
    normalized = re.sub(r"\(([单双])周\)", r"(\1)", normalized)
    normalized = re.sub(r"([单双])周$", r"(\1)", normalized)
    return normalized.replace("(周)", "").strip()


def _parse_time(raw_time_or_section: str) -> tuple[time | None, time | None]:
    range_match = TIME_RANGE_RE.search(raw_time_or_section)
    if range_match is not None:
        try:
            start = time.fromisoformat(range_match.group("start"))
            end = time.fromisoformat(range_match.group("end"))
        except ValueError:
            return None, None
        return (start, end) if start < end else (None, None)

    section_match = SECTION_RE.search(raw_time_or_section)
    if section_match is None:
        return None, None
    section_key = f"{int(section_match.group('start')):02d}-{int(section_match.group('end')):02d}"
    return SECTION_TIMES.get(section_key, (None, None))


def _normalized_location(value: str) -> str:
    return re.sub(r"\s+", "", value.strip())


def _building_aliases(building: Building) -> set[str]:
    compact_name = _normalized_location(building.name)
    aliases = {compact_name}
    aliases.update(re.findall(r"教\d+", compact_name))

    teaching_number = re.search(r"(\d+)号教学楼", compact_name)
    if teaching_number:
        number = teaching_number.group(1)
        aliases.update({f"教{number}", f"{number}号教学楼"})

    if "综合实训大楼" in compact_name:
        aliases.update({"综合实训大楼", "实训大楼"})
    elif "实训大楼" in compact_name:
        aliases.add("实训大楼")
    if "风雨操场" in compact_name:
        aliases.add("风雨操场")

    description = building.description or ""
    for alias in re.findall(r"别名\s*[:：]\s*([^,，。；;\s]+)", description):
        aliases.add(_normalized_location(alias))
    return {alias for alias in aliases if alias}


def _find_longest_building_match(
    normalized_location: str,
    buildings: Sequence[Building],
) -> _BuildingMatch | None:
    matches = [
        _BuildingMatch(building=building, alias=alias)
        for building in buildings
        for alias in _building_aliases(building)
        if normalized_location.startswith(alias)
    ]
    if not matches:
        return None
    return max(matches, key=lambda match: (len(match.alias), -match.building.id))


def suggest_location(
    raw_location: str,
    buildings: Sequence[Building],
) -> tuple[int | None, str | None, tuple[ImportIssue, ...]]:
    normalized = _normalized_location(raw_location)
    match = _find_longest_building_match(normalized, buildings)
    if match is None:
        return None, None, (
            ImportIssue(
                code="building_unrecognized",
                field="building_id",
                message="无法从原始地点识别建筑",
            ),
        )
    room_name = normalized[len(match.alias) :].strip(CONNECTOR_CHARS)
    if not room_name:
        return match.building.id, None, (
            ImportIssue(
                code="room_missing",
                field="room_name",
                message="原始地点缺少教室信息",
            ),
        )
    return match.building.id, room_name, ()


def _candidate_from_raw(
    raw: RawCourseRow,
    buildings: Sequence[Building],
) -> ImportCandidate:
    issues: list[ImportIssue] = []
    course_name = raw.raw_course_name.strip() or None
    if course_name is None:
        issues.append(ImportIssue("course_name_missing", "course_name", "课程名为空"))

    compact_weekday = re.sub(r"\s+", "", raw.raw_weekday)
    weekday = next(
        (value for label, value in WEEKDAY_LABELS.items() if label in compact_weekday),
        None,
    )
    if weekday is None:
        issues.append(ImportIssue("weekday_unrecognized", "weekday", "无法识别星期"))

    start_time, end_time = _parse_time(raw.raw_time_or_section)
    if start_time is None or end_time is None:
        issues.append(ImportIssue("time_unrecognized", "start_time", "无法识别上课时间"))

    weeks = normalize_weeks(raw.raw_weeks) or None
    if weeks is None:
        issues.append(ImportIssue("weeks_unrecognized", "weeks", "无法识别上课周次"))

    building_id, room_name, location_issues = suggest_location(raw.raw_location, buildings)
    issues.extend(location_issues)
    building_name = next(
        (building.name for building in buildings if building.id == building_id),
        None,
    )
    return ImportCandidate(
        source=raw,
        course_name=course_name,
        weekday=weekday,
        start_time=start_time,
        end_time=end_time,
        teacher=raw.raw_teacher.strip() or None,
        weeks=weeks,
        suggested_building_id=building_id,
        suggested_building_name=building_name,
        suggested_room_name=room_name,
        errors=tuple(issues),
    )


def _candidate_response(candidate: ImportCandidate) -> ImportCandidateResponse:
    source = candidate.source
    return ImportCandidateResponse(
        row_ref=source.row_ref,
        source=RawCourseSourceResponse(
            raw_course_name=source.raw_course_name,
            raw_weekday=source.raw_weekday,
            raw_time_or_section=source.raw_time_or_section,
            raw_teacher=source.raw_teacher,
            raw_weeks=source.raw_weeks,
            raw_location=source.raw_location,
        ),
        course_name=candidate.course_name,
        weekday=candidate.weekday,
        start_time=candidate.start_time.strftime("%H:%M") if candidate.start_time else None,
        end_time=candidate.end_time.strftime("%H:%M") if candidate.end_time else None,
        teacher=candidate.teacher,
        weeks=candidate.weeks,
        suggested_building_id=candidate.suggested_building_id,
        suggested_building_name=candidate.suggested_building_name,
        suggested_room_name=candidate.suggested_room_name,
        errors=[
            ImportIssueResponse(code=issue.code, field=issue.field, message=issue.message)
            for issue in candidate.errors
        ],
    )


def build_course_import_preview(
    session: Session,
    filename: str,
    content: bytes,
) -> CourseImportPreviewResponse:
    candidates = _parse_import_candidates(session, filename, content)
    return CourseImportPreviewResponse(
        file=ImportFileInfo(
            filename=filename,
            sha256=sha256(content).hexdigest(),
            candidate_count=len(candidates),
        ),
        candidates=[_candidate_response(candidate) for candidate in candidates],
        can_commit=bool(candidates)
        and all(
            all(issue.code in NON_BLOCKING_IMPORT_ISSUE_CODES for issue in candidate.errors)
            for candidate in candidates
        ),
    )


def _parse_import_candidates(
    session: Session,
    filename: str,
    content: bytes,
) -> list[ImportCandidate]:
    rows = _read_rows(filename, content)
    raw_courses = _rows_to_raw_courses(rows)
    buildings = list(session.scalars(select(Building).order_by(Building.id.asc())).all())
    return [_candidate_from_raw(raw, buildings) for raw in raw_courses]


def _match_optional_resolutions(
    candidates: Sequence[ImportCandidate],
    resolutions: Sequence[ImportResolution],
) -> dict[str, ImportResolution]:
    """Validate legacy per-row mappings when an older client still sends them."""

    if not resolutions:
        return {}
    expected = [candidate.source.row_ref for candidate in candidates]
    actual = [resolution.row_ref for resolution in resolutions]
    counts = Counter(actual)
    duplicates = sorted(row_ref for row_ref, count in counts.items() if count > 1)
    expected_set = set(expected)
    actual_set = set(actual)
    missing = sorted(expected_set - actual_set)
    extra = sorted(actual_set - expected_set)
    if duplicates or missing or extra or len(actual) != len(expected):
        raise BusinessError(
            409,
            "import_resolution_mismatch",
            "导入确认项与文件中的课程行不一致，请重新预览",
            fields=["resolutions"],
            details={
                "missing_row_refs": missing,
                "extra_row_refs": extra,
                "duplicate_row_refs": duplicates,
            },
        )
    return {resolution.row_ref: resolution for resolution in resolutions}


def _select_import_candidates(
    candidates: Sequence[ImportCandidate],
    excluded_row_refs: Sequence[str],
) -> list[ImportCandidate]:
    known_row_refs = {candidate.source.row_ref for candidate in candidates}
    excluded = set(excluded_row_refs)
    unknown = sorted(excluded - known_row_refs)
    if unknown:
        raise BusinessError(
            409,
            "import_exclusion_mismatch",
            "排除的课程与当前文件不一致，请重新预览",
            fields=["excluded_row_refs"],
            details={"unknown_row_refs": unknown},
        )

    explicitly_selected = [
        candidate
        for candidate in candidates
        if candidate.source.row_ref not in excluded
    ]
    selected = [
        candidate
        for candidate in explicitly_selected
        if not (
            candidate.start_time is None
            and candidate.end_time is None
            and not candidate.source.raw_location.strip()
        )
    ]
    if not selected:
        raise BusinessError(
            422,
            "import_empty_selection",
            "当前课表没有可导入的有效课程",
            fields=["excluded_row_refs"],
        )
    return selected


def _resolve_import_candidates(
    session: Session,
    candidates: Sequence[ImportCandidate],
    resolutions: dict[str, ImportResolution],
) -> list[ResolvedImportCourse]:
    resolved: list[ResolvedImportCourse] = []
    unresolved: list[dict[str, object]] = []

    for candidate in candidates:
        source = candidate.source
        resolution = resolutions.get(source.row_ref)
        issues = [
            {
                "code": issue.code,
                "field": issue.field,
                "message": issue.message,
            }
            for issue in candidate.errors
            if issue.code not in NON_BLOCKING_IMPORT_ISSUE_CODES
        ]
        if resolution is not None:
            building = session.get(Building, resolution.building_id)
            if building is None:
                issues.append(
                    {
                        "code": "building_not_found",
                        "field": "building_id",
                        "message": "确认的建筑不存在",
                    }
                )
            if location_requires_review(resolution.room_name):
                issues.append(
                    {
                        "code": "room_unresolved",
                        "field": "room_name",
                        "message": "教室仍未确认",
                    }
                )

        required_values = {
            "course_name": candidate.course_name,
            "weekday": candidate.weekday,
            "weeks": candidate.weeks,
        }
        missing_fields = [field for field, value in required_values.items() if value is None]
        for field in missing_fields:
            if not any(issue["field"] == field for issue in issues):
                issues.append(
                    {
                        "code": f"{field}_unresolved",
                        "field": field,
                        "message": "该字段无法从原文件确认",
                    }
                )

        if not issues:
            try:
                has_missing_room = any(
                    issue.code == "room_missing" for issue in candidate.errors
                )
                mapped_room = (
                    UNMAPPED_ROOM_FALLBACK
                    if has_missing_room
                    else (
                        candidate.suggested_room_name
                        or source.raw_location.strip()
                        or UNMAPPED_ROOM_FALLBACK
                    )[:120]
                )
                building_id = candidate.suggested_building_id
                if resolution is not None:
                    building_id = resolution.building_id
                    mapped_room = resolution.room_name
                course = CourseImportCreate(
                    course_name=candidate.course_name,
                    weekday=candidate.weekday,
                    start_time=(
                        candidate.start_time.strftime("%H:%M")
                        if candidate.start_time
                        else None
                    ),
                    end_time=(
                        candidate.end_time.strftime("%H:%M")
                        if candidate.end_time
                        else None
                    ),
                    building_id=building_id,
                    room_name=mapped_room,
                    teacher=candidate.teacher,
                    weeks=candidate.weeks,
                )
            except (ValidationError, ValueError) as exc:
                if isinstance(exc, ValidationError):
                    validation_errors = exc.errors(include_context=False)
                else:
                    validation_errors = [{"msg": str(exc)}]
                issues.append(
                    {
                        "code": "course_values_invalid",
                        "field": "course",
                        "message": "课程字段无法通过校验",
                        "details": validation_errors,
                    }
                )
            else:
                resolved.append(ResolvedImportCourse(source=source, course=course))

        if issues:
            unresolved.append({"row_ref": source.row_ref, "issues": issues})

    if unresolved or not candidates:
        raise BusinessError(
            422,
            "import_unresolved",
            "导入文件仍有未解决的课程字段",
            fields=["file"],
            details={
                "row_refs": [item["row_ref"] for item in unresolved],
                "rows": unresolved,
            },
        )
    return resolved


def commit_course_import(
    session: Session,
    *,
    user_id: int,
    filename: str,
    content: bytes,
    manifest: ImportCommitManifest,
) -> list[Course]:
    actual_sha = sha256(content).hexdigest()
    if actual_sha != manifest.sha256:
        raise BusinessError(
            409,
            "import_file_changed",
            "提交的文件与预览时不同，请重新预览",
            fields=["file", "sha256"],
            details={"expected_sha256": manifest.sha256, "actual_sha256": actual_sha},
        )
    if not filename or len(filename) > 255:
        raise BusinessError(
            422,
            "invalid_import_filename",
            "导入文件名无效",
            fields=["file"],
        )

    candidates = _select_import_candidates(
        _parse_import_candidates(session, filename, content),
        manifest.excluded_row_refs,
    )
    resolution_map = _match_optional_resolutions(candidates, manifest.resolutions)
    guard = acquire_user_mutation_guard(session, user_id)
    resolved = _resolve_import_candidates(session, candidates, resolution_map)
    validated_entries = validate_course_batch(
        session,
        user_id=user_id,
        entries=[(item.source.row_ref, item.course) for item in resolved],
        guard=guard,
        require_location=False,
        replace_existing=True,
    )

    # A timetable import is a full snapshot, not an append. Validation happens
    # before deletion, and the API commits the whole operation atomically, so a
    # failed replacement leaves the previous timetable untouched.
    existing_courses = list(
        session.scalars(select(Course).where(Course.user_id == user_id)).all()
    )
    for existing_course in existing_courses:
        session.delete(existing_course)
    session.flush()

    created: list[Course] = []
    for item, (row_ref, payload) in zip(resolved, validated_entries, strict=True):
        if row_ref != item.source.row_ref:
            raise RuntimeError("validated import rows changed order")
        course = add_course(
            session,
            user_id=user_id,
            payload=payload,
            source_kind="import",
            guard=guard,
        )
        source = item.source
        session.add(
            CourseImportSource(
                course_id=course.id,
                filename=filename,
                file_sha256=actual_sha,
                source_row=source.row_ref,
                raw_course_name=source.raw_course_name,
                raw_weekday=source.raw_weekday,
                raw_time_or_section=source.raw_time_or_section,
                raw_teacher=source.raw_teacher,
                raw_weeks=source.raw_weeks,
                raw_location=source.raw_location,
            )
        )
        created.append(course)
    session.flush()
    return created


def parse_course_cell(
    cell_text: str,
    weekday: int,
    fallback_start_time: str,
    fallback_end_time: str,
) -> list[ParsedCourseBlock]:
    """Parse a legacy course cell without silently changing its raw text."""

    raw_weekday = next(
        (label for label, value in WEEKDAY_LABELS.items() if value == weekday and label.startswith("星期")),
        str(weekday),
    )
    results: list[ParsedCourseBlock] = []
    row_time_text = f"{fallback_start_time}-{fallback_end_time}"
    for index, lines in enumerate(_split_course_blocks(cell_text), start=1):
        raw = _extract_source_fields(
            lines,
            row_ref=f"row-{index}",
            raw_weekday=raw_weekday,
            row_time_text=row_time_text,
        )
        start, end = _parse_time(raw.raw_time_or_section)
        if start is None or end is None or not raw.raw_course_name:
            continue
        results.append(
            ParsedCourseBlock(
                course_name=raw.raw_course_name,
                weekday=weekday,
                start_time=start.strftime("%H:%M"),
                end_time=end.strftime("%H:%M"),
                room_name=raw.raw_location or "待确认教室",
                teacher=raw.raw_teacher or None,
                weeks=normalize_weeks(raw.raw_weeks) or None,
                raw_weeks=(raw.raw_weeks + raw.raw_time_or_section) or None,
                raw_location=raw.raw_location or None,
            )
        )
    return results

from __future__ import annotations

from dataclasses import dataclass
from html.parser import HTMLParser
from io import BytesIO
import re

from openpyxl import load_workbook
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Building
from app.schemas.course_import import CourseImportPreviewItem, CourseImportPreviewResponse


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
    "01-02": ("08:00", "09:40"),
    "03-04": ("09:55", "11:35"),
    "05-06": ("14:00", "15:40"),
    "07-08": ("15:55", "17:35"),
    "09-10": ("19:00", "21:35"),
}

TIME_RANGE_RE = re.compile(r"(?P<start>\d{2}:\d{2})\s*[-~—–]\s*(?P<end>\d{2}:\d{2})")
SECTION_RE = re.compile(
    r"(?P<weeks>[\d,\-]+(?:\((?:周|单|双)\))?)\s*\[(?P<section>\d{2}-\d{2})节\]"
)
DASH_RE = re.compile(r"^-{3,}$")


@dataclass
class ParsedCourseBlock:
    course_name: str
    weekday: int
    start_time: str
    end_time: str
    room_name: str
    teacher: str | None
    weeks: str | None
    raw_weeks: str | None
    raw_location: str | None


class _TableTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self._current_row: list[str] | None = None
        self._current_cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "tr":
            self._current_row = []
        elif tag in {"td", "th"} and self._current_row is not None:
            self._current_cell = []
        elif tag == "br" and self._current_cell is not None:
            self._current_cell.append("\n")

    def handle_data(self, data: str) -> None:
        if self._current_cell is not None:
            self._current_cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"td", "th"} and self._current_row is not None and self._current_cell is not None:
            self._current_row.append(_clean_cell_text("".join(self._current_cell)))
            self._current_cell = None
        elif tag == "tr" and self._current_row is not None:
            if any(cell.strip() for cell in self._current_row):
                self.rows.append(self._current_row)
            self._current_row = None


def _clean_cell_text(value: object) -> str:
    text = "" if value is None else str(value)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.split("\n")]
    return "\n".join(line for line in lines if line)


def _split_course_blocks(cell_text: str) -> list[list[str]]:
    blocks: list[list[str]] = []
    current: list[str] = []
    for line in _clean_cell_text(cell_text).split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        if DASH_RE.match(stripped):
            if current:
                blocks.append(current)
                current = []
            continue
        current.append(stripped)
    if current:
        blocks.append(current)
    return blocks


def normalize_weeks(raw_weeks: str) -> str:
    return raw_weeks.replace("(周)", "").strip()


def parse_course_cell(
    cell_text: str,
    weekday: int,
    fallback_start_time: str,
    fallback_end_time: str,
) -> list[ParsedCourseBlock]:
    parsed: list[ParsedCourseBlock] = []
    for lines in _split_course_blocks(cell_text):
        week_index = next((index for index, line in enumerate(lines) if SECTION_RE.search(line)), -1)
        if week_index <= 0:
            continue
        section_match = SECTION_RE.search(lines[week_index])
        if section_match is None:
            continue

        raw_weeks = section_match.group(0)
        weeks = normalize_weeks(section_match.group("weeks"))
        section = section_match.group("section")
        start_time, end_time = SECTION_TIMES.get(
            section,
            (fallback_start_time, fallback_end_time),
        )
        course_name = lines[0].strip()
        teacher_lines = [line for line in lines[1:week_index] if line.strip()]
        location_lines = [line for line in lines[week_index + 1 :] if line.strip()]
        raw_location = " ".join(location_lines).strip() or None

        parsed.append(
            ParsedCourseBlock(
                course_name=course_name,
                weekday=weekday,
                start_time=start_time,
                end_time=end_time,
                room_name=raw_location or "待确认教室",
                teacher=teacher_lines[0] if teacher_lines else None,
                weeks=weeks,
                raw_weeks=raw_weeks,
                raw_location=raw_location,
            )
        )
    return parsed


def _extract_html_rows(content: bytes) -> list[list[str]]:
    parser = _TableTextParser()
    parser.feed(content.decode("utf-8", errors="ignore"))
    return parser.rows


def _extract_xlsx_rows(content: bytes) -> list[list[str]]:
    workbook = load_workbook(BytesIO(content), data_only=True)
    sheet = workbook.active
    rows: list[list[str]] = []
    for row in sheet.iter_rows(values_only=True):
        values = [_clean_cell_text(value) for value in row]
        if any(values):
            rows.append(values)
    return rows


def _find_weekday_columns(header: list[str]) -> dict[int, int]:
    columns: dict[int, int] = {}
    for index, cell in enumerate(header):
        for label, weekday in WEEKDAY_LABELS.items():
            if label in cell:
                columns[index] = weekday
                break
    return columns


def _find_header_row(rows: list[list[str]]) -> tuple[int, dict[int, int]]:
    for index, row in enumerate(rows):
        columns = _find_weekday_columns(row)
        if columns:
            return index, columns
    raise ValueError("未找到星期表头")


def _row_time(row: list[str]) -> tuple[str, str]:
    first_cell = row[0] if row else ""
    match = TIME_RANGE_RE.search(first_cell)
    if match:
        return match.group("start"), match.group("end")
    return "08:00", "09:40"


def _parse_rows(rows: list[list[str]]) -> list[ParsedCourseBlock]:
    header_index, weekday_columns = _find_header_row(rows)
    blocks: list[ParsedCourseBlock] = []
    for row in rows[header_index + 1 :]:
        fallback_start_time, fallback_end_time = _row_time(row)
        for column_index, weekday in weekday_columns.items():
            if column_index >= len(row) or not row[column_index].strip():
                continue
            blocks.extend(
                parse_course_cell(
                    row[column_index],
                    weekday=weekday,
                    fallback_start_time=fallback_start_time,
                    fallback_end_time=fallback_end_time,
                )
            )
    return blocks


def _building_aliases(building: Building) -> set[str]:
    name = building.name.replace(" ", "")
    aliases = {name}
    aliases.update(re.findall(r"教\d+", name))

    teaching_number = re.search(r"(\d+)号教学楼", name)
    if teaching_number:
        aliases.add(f"教{teaching_number.group(1)}")
        aliases.add(f"{teaching_number.group(1)}号教学楼")

    description = (building.description or "").replace(" ", "")
    aliases.update(re.findall(r"教\d+", description))
    if "实训大楼" in name or "综合实训大楼" in name or "实训大楼" in description:
        aliases.update({"实训大楼", "综合实训大楼"})
    if "双创大楼" in name or "双创大楼" in description:
        aliases.add("双创大楼")
    return {alias for alias in aliases if alias}


def _match_building(buildings: list[Building], location: str | None) -> Building | None:
    if not location:
        return None
    normalized = location.replace(" ", "")
    for building in buildings:
        aliases = _building_aliases(building)
        if any(alias in normalized or normalized in alias for alias in aliases):
            return building
    return None


def build_course_import_preview(
    session: Session,
    filename: str,
    content: bytes,
) -> CourseImportPreviewResponse:
    lower_name = filename.lower()
    if lower_name.endswith((".html", ".htm")):
        rows = _extract_html_rows(content)
    elif lower_name.endswith(".xlsx"):
        rows = _extract_xlsx_rows(content)
    else:
        raise ValueError("仅支持 HTML 或 .xlsx 课表文件")

    parsed_blocks = _parse_rows(rows)
    buildings = list(session.scalars(select(Building).order_by(Building.id.asc())).all())
    items: list[CourseImportPreviewItem] = []
    for block in parsed_blocks:
        building = _match_building(buildings, block.raw_location)
        items.append(
            CourseImportPreviewItem(
                course_name=block.course_name,
                weekday=block.weekday,
                start_time=block.start_time,
                end_time=block.end_time,
                room_name=block.room_name,
                teacher=block.teacher,
                weeks=block.weeks,
                raw_weeks=block.raw_weeks,
                raw_location=block.raw_location,
                building_id=building.id if building else None,
                building_name=building.name if building else None,
                confidence="matched" if building else "needs_review",
                needs_building=building is None,
            )
        )

    matched_count = sum(1 for item in items if not item.needs_building)
    return CourseImportPreviewResponse(
        total=len(items),
        matched_count=matched_count,
        needs_review_count=len(items) - matched_count,
        items=items,
    )

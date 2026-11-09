import type { Course, CourseForm, CoursePayload } from '@/types/course'
import type { SemesterState } from '@/types/semester'
import { campusTime } from '@/utils/campusTime'
import { courseAtDate } from '@/utils/courseTimeRules'

export const WEEKDAYS = [
  { value: 1, label: '星期一' },
  { value: 2, label: '星期二' },
  { value: 3, label: '星期三' },
  { value: 4, label: '星期四' },
  { value: 5, label: '星期五' },
  { value: 6, label: '星期六' },
  { value: 7, label: '星期日' }
]

export type WeekdayCourseGroup = {
  weekday: number
  label: string
  courses: Course[]
}

export type GroupCoursesOptions = {
  includeEmpty?: boolean
}

export type CourseTimeSlot = {
  label: string
  section: string
  start_time: string
  end_time: string
  isReference?: boolean
}

export type WeeksRangePickerValue = {
  startWeek: number
  endWeek: number
}

export const MAX_TEACHING_WEEK = 20

const COURSE_TIME_SLOTS: CourseTimeSlot[] = [
  { label: '第一二节', section: '1-2', start_time: '08:00', end_time: '09:40' },
  { label: '第三四节', section: '3-4', start_time: '09:55', end_time: '11:35' },
  { label: '第五六节', section: '5-6', start_time: '14:00', end_time: '15:40' },
  { label: '第七八节', section: '7-8', start_time: '15:55', end_time: '17:35' },
  { label: '第九十一节', section: '9-11', start_time: '19:00', end_time: '21:35' }
]

export function getCourseTimeSlots(courses: Course[] = []): CourseTimeSlot[] {
  return COURSE_TIME_SLOTS.map((reference) => {
    const counts = new Map<string, { count: number; start_time: string; end_time: string }>()
    for (const course of courses) {
      if (getCourseDisplaySlot(course)?.section !== reference.section || !course.start_time || !course.end_time) continue
      const start = parseTimeValue(course.start_time)
      const end = parseTimeValue(course.end_time)
      if (start === null || end === null || start >= end) continue
      const key = `${course.start_time}-${course.end_time}`
      counts.set(key, { count: (counts.get(key)?.count ?? 0) + 1, start_time: course.start_time, end_time: course.end_time })
    }
    const preferred = [...counts.values()].sort((a, b) => b.count - a.count || a.start_time.localeCompare(b.start_time))[0]
    return preferred ? { ...reference, start_time: preferred.start_time, end_time: preferred.end_time } : { ...reference }
  })
}

/** Timetable axes describe saved clocks, not a hard-coded school's bell schedule. */
export function getTimetableTimeSlots(courses: Course[]): CourseTimeSlot[] {
  return COURSE_TIME_SLOTS.flatMap((reference) => {
    const times = new Map<string, CourseTimeSlot>()
    for (const course of courses) {
      if (getCourseDisplaySlot(course)?.section !== reference.section || !course.start_time || !course.end_time) continue
      const start = parseTimeValue(course.start_time)
      const end = parseTimeValue(course.end_time)
      if (start === null || end === null || start >= end) continue
      const exact = courseUsesStandardSlotTime(course, reference)
      times.set(`${course.start_time}-${course.end_time}`, {
        label: exact ? reference.label : '自定义时段',
        section: exact ? reference.section : '自定',
        start_time: course.start_time, end_time: course.end_time
      })
    }
    return times.size ? [...times.values()] : [{ ...reference, isReference: true }]
  }).sort((left, right) => left.start_time.localeCompare(right.start_time) || left.end_time.localeCompare(right.end_time))
}

export function formatCourseLocation(
  course: {
    building: { name: string } | null
    room_name: string
    source_location?: string | null
  }
): string {
  const sourceLocation = course.source_location?.trim()
  if (sourceLocation) return sourceLocation

  const building = course.building?.name.trim() ?? ''
  const room = course.room_name.trim()
  if (building && room) return `${building} · ${room}`
  return building || room || '地点待补充'
}

function compactBuildingName(name: string): string {
  const compact = name
    .trim()
    .replace(/^湖北大学(?:[（(][^）)]+[）)]|武昌主校区|武昌校区|阳逻校区)?\s*[-—·]?\s*/u, '')
  return compact || name.trim()
}

function normalizeLocationPart(value: string): string {
  return value.replace(/[\s·()（）\-—_]/g, '').toLocaleLowerCase('zh-Hans-CN')
}

function formatTimetableRoomName(room: string): string {
  return room
    .trim()
    .replace(/([\p{Script=Han}])(?=\d{2,4}\s*[-—]\s*\d{2,4})/gu, '$1 ')
    .replace(/(\d{2,4}\s*[-—]\s*\d{2,4})(?=\p{Script=Han})/gu, '$1 · ')
    .replace(/(实验室|教室|体育馆|体育场|球场)(?=\d)/gu, '$1 ')
    .replace(/\s{2,}/g, ' ')
}

function roomNamesTeachingBuilding(building: string, room: string): boolean {
  const buildingNumber = building.match(/(?:^|\D)(\d+)\s*号?\s*教学楼/u)?.[1]
  if (!buildingNumber) return false

  const roomBuildingPattern = new RegExp(
    `^教\\s*${buildingNumber}(?:\\s*[-—·]\\s*|\\s+|\\s*$)`,
    'u'
  )
  return roomBuildingPattern.test(room)
}

export function formatTimetableCourseLocation(
  course: {
    building: { name: string } | null
    room_name: string
    source_location?: string | null
  }
): string {
  const sourceLocation = course.source_location?.trim()
  if (sourceLocation) return sourceLocation

  if (!course.building) return course.room_name.trim() || '地点待补充'
  const building = compactBuildingName(course.building.name)
  const rawRoom = course.room_name.trim()
  const room = formatTimetableRoomName(rawRoom)
  const normalizedBuilding = normalizeLocationPart(building)
  const normalizedRoom = normalizeLocationPart(rawRoom)
  const normalizedBuildingWithoutGeneralPrefix = normalizeLocationPart(
    building.replace(/^综合(?=.{4,}$)/u, '')
  )

  if (
    (normalizedBuilding && normalizedRoom.includes(normalizedBuilding)) ||
    (
      normalizedBuildingWithoutGeneralPrefix &&
      normalizedBuildingWithoutGeneralPrefix !== normalizedBuilding &&
      normalizedRoom.includes(normalizedBuildingWithoutGeneralPrefix)
    ) ||
    roomNamesTeachingBuilding(building, rawRoom)
  ) {
    return room
  }
  return `${building} · ${room}`
}

export function getCourseDisplaySlot(
  course: Pick<Course, 'start_time' | 'end_time'>
): CourseTimeSlot | null {
  const start = parseTimeValue(course.start_time)
  if (start === null) {
    return null
  }

  const containingSlot = COURSE_TIME_SLOTS.find((slot) => {
    const slotStart = parseTimeValue(slot.start_time)
    const slotEnd = parseTimeValue(slot.end_time)
    return slotStart !== null && slotEnd !== null && start >= slotStart && start < slotEnd
  })
  if (containingSlot) {
    return { ...containingSlot }
  }

  const nearestSlot = [...COURSE_TIME_SLOTS].sort((left, right) => {
    const leftStart = parseTimeValue(left.start_time) ?? 0
    const rightStart = parseTimeValue(right.start_time) ?? 0
    return Math.abs(leftStart - start) - Math.abs(rightStart - start)
  })[0]
  return nearestSlot ? { ...nearestSlot } : null
}

export function courseUsesStandardSlotTime(
  course: Pick<Course, 'start_time' | 'end_time'>,
  slot: Pick<CourseTimeSlot, 'start_time' | 'end_time'>
): boolean {
  return course.start_time === slot.start_time && course.end_time === slot.end_time
}

export function getTeachingWeekOptions(maxWeek = MAX_TEACHING_WEEK): number[] {
  const safeMaxWeek = Number.isInteger(maxWeek)
    ? Math.min(Math.max(maxWeek, 1), 30)
    : MAX_TEACHING_WEEK
  return Array.from({ length: safeMaxWeek }, (_, index) => index + 1)
}

export function getQuickWeekOptions(
  selectedWeek: number,
  visibleCount = 5,
  maxWeek = MAX_TEACHING_WEEK
): number[] {
  const safeCount = Math.max(1, Math.min(visibleCount, maxWeek))
  const week = Number.isInteger(selectedWeek)
    ? Math.min(Math.max(selectedWeek, 1), maxWeek)
    : 1
  const half = Math.floor(safeCount / 2)
  let start = week - half
  let end = start + safeCount - 1

  if (start < 1) {
    start = 1
    end = safeCount
  }
  if (end > maxWeek) {
    end = maxWeek
    start = Math.max(1, end - safeCount + 1)
  }

  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

export function buildWeeksRange(startWeek: number, endWeek: number): string {
  const start = Math.min(startWeek, endWeek)
  const end = Math.max(startWeek, endWeek)
  if (start === end) {
    return String(start)
  }
  return `${start}-${end}`
}

export function parseWeeksRangeToPicker(weeks: string | null | undefined): WeeksRangePickerValue | null {
  const normalized = normalizeWeeksExpression(weeks)
  const range = normalized.match(/(\d{1,2})\s*-\s*(\d{1,2})/)
  if (range) {
    const start = Number(range[1])
    const end = Number(range[2])
    if (start >= 1 && end >= 1 && start <= MAX_TEACHING_WEEK && end <= MAX_TEACHING_WEEK) {
      return {
        startWeek: Math.min(start, end),
        endWeek: Math.max(start, end)
      }
    }
  }

  const single = normalized.match(/\d{1,2}/)
  if (single) {
    const week = Number(single[0])
    if (week >= 1 && week <= MAX_TEACHING_WEEK) {
      return { startWeek: week, endWeek: week }
    }
  }

  return null
}

export function buildCourseCreateQuery(
  weekday: number,
  slot: Pick<CourseTimeSlot, 'start_time' | 'end_time'>,
  selectedWeek?: number
): Record<string, string> {
  const query: Record<string, string> = {
    weekday: String(weekday),
    start_time: slot.start_time,
    end_time: slot.end_time
  }

  if (
    selectedWeek !== undefined &&
    Number.isInteger(selectedWeek) &&
    selectedWeek >= 1 &&
    selectedWeek <= MAX_TEACHING_WEEK
  ) {
    query.weeks = String(selectedWeek)
  }

  return query
}

/**
 * 课程色策展调色板：保留自然感，同时拉开蓝、绿、橙、紫、红等色相。
 * 色值需要有足够饱和度，经过课表卡片的白色混合后仍可快速区分科目。
 */
export const COURSE_ACCENT_PALETTE = [
  '#2f78d0', // 湖蓝
  '#249b75', // 翡翠
  '#d38a24', // 琥珀
  '#9a5bc4', // 紫藤
  '#d15f68', // 山茶红
  '#258ca6', // 青蓝
  '#72a33c', // 新叶绿
  '#c44f8a', // 木槿
  '#665fc2', // 鸢尾蓝
  '#d06e3f', // 陶橙
  '#4f6dad', // 远山蓝
  '#3d9250' // 森林绿
] as const

function hashSubjectName(subject: string): number {
  let hash = 5381
  for (const ch of subject) {
    hash = ((hash << 5) + hash + (ch.codePointAt(0) ?? 0)) >>> 0
  }
  return hash
}

/**
 * 按课程名哈希取色：同名课程跨周、跨会话、跨增删稳定拿到同一个色，
 * 保住「颜色=科目」的记忆。哈希撞车时在调色板内线性探测，
 * 科目数不超过调色板长度时保证互不相同。
 */
export function buildCourseColorMap(
  courses: Pick<Course, 'id' | 'course_name'>[]
): Record<number, string> {
  const subjectNames = Array.from(
    new Set(courses.map((course) => course.course_name.trim() || `课程 ${course.id}`))
  ).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))

  const taken = new Set<number>()
  const subjectColors: Record<string, string> = {}
  for (const subject of subjectNames) {
    const start = hashSubjectName(subject) % COURSE_ACCENT_PALETTE.length
    let slot = start
    if (taken.size < COURSE_ACCENT_PALETTE.length) {
      while (taken.has(slot)) {
        slot = (slot + 1) % COURSE_ACCENT_PALETTE.length
      }
      taken.add(slot)
    }
    subjectColors[subject] = COURSE_ACCENT_PALETTE[slot]
  }

  return courses.reduce<Record<number, string>>((colorMap, course) => {
    const subject = course.course_name.trim() || `课程 ${course.id}`
    colorMap[course.id] = subjectColors[subject]
    return colorMap
  }, {})
}

export function buildEmptyCourseForm(): CourseForm {
  return {
    course_name: '',
    weekday: 1,
    start_time: '08:00',
    end_time: '09:40',
    building_id: 0,
    room_name: '',
    teacher: '',
    weeks: '1-16'
  }
}

export function courseToForm(course: Course): CourseForm {
  return {
    course_name: course.course_name,
    weekday: course.weekday,
    start_time: course.start_time ?? '',
    end_time: course.end_time ?? '',
    building_id: course.building_id ?? 0,
    room_name: course.room_name,
    teacher: course.teacher ?? '',
    weeks: course.weeks
  }
}

export function formToPayload(form: CourseForm): CoursePayload {
  return {
    course_name: form.course_name.trim(),
    weekday: Number(form.weekday),
    start_time: form.start_time,
    end_time: form.end_time,
    building_id: Number(form.building_id),
    room_name: form.room_name.trim(),
    teacher: form.teacher.trim() || null,
    weeks: form.weeks.trim()
  }
}

function parseTimeValue(value: string | null | undefined): number | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) {
    return null
  }
  const [hourText, minuteText] = value.split(':')
  const hour = Number(hourText)
  const minute = Number(minuteText)
  if (hour > 23 || minute > 59) {
    return null
  }
  return hour * 60 + minute
}

export function validateCourseForm(form: CourseForm | CoursePayload): string | null {
  const courseName = form.course_name.trim()
  const roomName = form.room_name.trim()
  const teacher = form.teacher?.trim() ?? ''
  const weeks = form.weeks?.trim() ?? ''
  const weekday = Number(form.weekday)
  const buildingId = Number(form.building_id)
  const start = parseTimeValue(form.start_time)
  const end = parseTimeValue(form.end_time)

  if (!courseName) {
    return '课程名称不能为空'
  }
  if (courseName.length > 100) {
    return '课程名称不能超过 100 字'
  }
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    return '星期必须在 1-7 之间'
  }
  if (start === null || end === null) {
    return '时间格式应为 HH:MM'
  }
  if (end <= start) {
    return '下课时间必须晚于上课时间'
  }
  if (!Number.isInteger(buildingId) || buildingId <= 0) {
    return '请选择上课建筑'
  }
  if (!roomName) {
    return '请输入完整教室'
  }
  if (roomName.length > 120) {
    return '教室不能超过 120 字'
  }
  if (teacher.length > 64) {
    return '教师不能超过 64 字'
  }
  if (weeks.length > 64) {
    return '周次不能超过 64 字'
  }
  if (!weeks) {
    return '请输入上课周次'
  }
  return null
}

export function getWeekdayLabel(weekday: number): string {
  return WEEKDAYS.find((item) => item.value === weekday)?.label ?? `星期${weekday}`
}

function normalizeWeeksExpression(weeks: string | null | undefined): string {
  return (weeks ?? '')
    .replace(/\[[^\]]+节\]/g, '')
    .replace(/\(周\)/g, '')
    .replace(/周/g, '')
    .trim()
}

function parseWeekNumbers(weeks: string): Set<number> {
  const values = new Set<number>()
  for (const part of weeks.split(',')) {
    const text = part.trim()
    if (!text) {
      continue
    }
    const range = text.match(/^(\d{1,2})-(\d{1,2})$/)
    if (range) {
      const start = Number(range[1])
      const end = Number(range[2])
      for (let week = start; week <= end; week += 1) {
        values.add(week)
      }
      continue
    }
    const single = Number(text)
    if (Number.isInteger(single)) {
      values.add(single)
    }
  }
  return values
}

export function isCourseActiveInWeek(
  weeks: string | null | undefined,
  selectedWeek: number
): boolean {
  const week = Number(selectedWeek)
  if (!Number.isInteger(week) || week <= 0) {
    return false
  }

  const normalized = normalizeWeeksExpression(weeks)
  if (!normalized) {
    return true
  }

  const oddOnly = normalized.includes('(单)')
  const evenOnly = normalized.includes('(双)')
  const weekText = normalized.replace(/\((单|双)\)/g, '')
  const weekNumbers = parseWeekNumbers(weekText)
  if (weekNumbers.size === 0) {
    return true
  }
  if (!weekNumbers.has(week)) {
    return false
  }
  if (oddOnly && week % 2 === 0) {
    return false
  }
  if (evenOnly && week % 2 !== 0) {
    return false
  }
  return true
}

/** One occurrence rule for timetable, home and today's notifications. */
export function coursesOnDate(courses: Course[], date: string, semester: SemesterState | null): Course[] {
  const stamp = Date.parse(`${date}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== date) return []
  const weekday = new Date(stamp).getUTCDay() || 7
  const week = semester?.start_date ? Math.floor((stamp - Date.parse(semester.start_date)) / 604_800_000) + 1 : 0
  const cancelled = new Set(courses.filter(course => course.makeup?.cancel_source && course.makeup.source_date === date)
    .map(course => course.makeup!.source_course_id))
  return courses.filter(course => course.makeup ? course.makeup.date === date
    : Boolean(semester?.total_weeks && week >= 1 && week <= semester.total_weeks && course.weekday === weekday
      && !cancelled.has(course.id) && isCourseActiveInWeek(course.weeks, week)))
    .map(course => courseAtDate(course, date, semester))
    .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? '') || a.id - b.id)
}

export function filterCoursesByWeek(courses: Course[], selectedWeek: number, semester?: SemesterState | null): Course[] {
  if (!semester?.start_date) return courses.filter(course => !course.makeup && isCourseActiveInWeek(course.weeks, selectedWeek))
  const monday = Date.parse(semester.start_date) + (selectedWeek - 1) * 604_800_000
  return WEEKDAYS.flatMap(({ value }) => coursesOnDate(courses,
    new Date(monday + (value - 1) * 86_400_000).toISOString().slice(0, 10), semester))
}

export function isCourseOngoing(course: Course, now = new Date()): boolean {
  const current = campusTime(now)
  const start = parseTimeValue(course.start_time)
  const end = parseTimeValue(course.end_time)
  return (!course.makeup || course.makeup.date === current.date) && course.weekday === current.weekday && start !== null && end !== null
    && start <= current.minutes && current.minutes < end
}

/** Upcoming means strictly before its start. At the bell, move on; never wrap weeks. */
export function findNextCourse(courses: Course[], now = new Date()): Course | null {
  const { weekday: currentWeekday, minutes: currentMinutes } = campusTime(now)

  return (
    courses
      .filter(course => !course.makeup || course.makeup.date >= campusTime(now).date)
      .map((course) => {
        const dayOffset = course.weekday - currentWeekday
        const startMinutes = parseTimeValue(course.start_time)
        const endMinutes = parseTimeValue(course.end_time)
        return { course, dayOffset, startMinutes, endMinutes }
      })
      .filter(({ dayOffset, startMinutes, endMinutes }) => {
        if (dayOffset < 0 || startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
          return false
        }
        return dayOffset > 0 || startMinutes > currentMinutes
      })
      .sort((left, right) => {
        if (left.dayOffset !== right.dayOffset) {
          return left.dayOffset - right.dayOffset
        }
        if (left.startMinutes !== right.startMinutes) {
          return (left.startMinutes ?? 0) - (right.startMinutes ?? 0)
        }
        return left.course.id - right.course.id
      })[0]?.course ?? null
  )
}

export function groupCoursesByWeekday(
  courses: Course[],
  options: GroupCoursesOptions = {}
): WeekdayCourseGroup[] {
  const groups = WEEKDAYS.map((weekday) => ({
    weekday: weekday.value,
    label: weekday.label,
    courses: courses
      .filter((course) => course.weekday === weekday.value)
      .sort((left, right) => {
        if (left.start_time === right.start_time) {
          return left.id - right.id
        }
        return (left.start_time ?? '').localeCompare(right.start_time ?? '')
      })
  }))

  if (options.includeEmpty) {
    return groups
  }
  return groups.filter((group) => group.courses.length > 0)
}

export function findCourseTimeOverlap(
  form: CourseForm | CoursePayload,
  courses: Course[],
  editingCourseId?: number
): Course | null {
  const start = parseTimeValue(form.start_time)
  const end = parseTimeValue(form.end_time)
  if (start === null || end === null) {
    return null
  }

  return (
    courses.find((course) => {
      if (course.id === editingCourseId || course.weekday !== Number(form.weekday)) {
        return false
      }
      const courseStart = parseTimeValue(course.start_time)
      const courseEnd = parseTimeValue(course.end_time)
      if (courseStart === null || courseEnd === null) {
        return false
      }
      return start < courseEnd && end > courseStart
    }) ?? null
  )
}

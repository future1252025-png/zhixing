import type { Course, CourseForm, CoursePayload } from '@/types/course'

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

export function getCourseTimeSlots(): CourseTimeSlot[] {
  return [...COURSE_TIME_SLOTS]
}

export function formatCourseLocation(
  course: Pick<Course, 'building' | 'room_name'>
): string {
  return `${course.building.name.trim()} · ${course.room_name.trim()}`
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
  course: Pick<Course, 'building' | 'room_name'>
): string {
  const building = compactBuildingName(course.building.name)
  const room = course.room_name.trim()
  const normalizedBuilding = normalizeLocationPart(building)
  const normalizedRoom = normalizeLocationPart(room)

  if (
    (normalizedBuilding && normalizedRoom.includes(normalizedBuilding)) ||
    roomNamesTeachingBuilding(building, room)
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
 * 课程色策展调色板：从「清新自然」体系派生的 12 个中等明度低饱和色。
 * 消费端（CourseCard）会用 color-mix 与白/墨混出底色与文字色，
 * 因此这里保持中等深度、色相拉开即可。
 */
export const COURSE_ACCENT_PALETTE = [
  '#4f7d58', // 松绿
  '#7ca06b', // 叶绿
  '#8a9a4e', // 橄榄
  '#b8863e', // 赭金
  '#bf7a55', // 陶土
  '#b56d76', // 玫瑰
  '#9784b5', // 丁香
  '#6f9faa', // 雾蓝
  '#4f8577', // 湖绿
  '#6d84b0', // 远山蓝
  '#7d8a97', // 青灰
  '#8c7a5b' // 麦茶棕
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
    start_time: course.start_time,
    end_time: course.end_time,
    building_id: course.building_id,
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

function parseTimeValue(value: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(value)) {
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

export function filterCoursesByWeek(courses: Course[], selectedWeek: number): Course[] {
  return courses.filter((course) => isCourseActiveInWeek(course.weeks, selectedWeek))
}

export function findNextCourse(courses: Course[], now = new Date()): Course | null {
  const currentWeekday = now.getDay() === 0 ? 7 : now.getDay()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  return (
    courses
      .map((course) => {
        const dayOffset = (course.weekday - currentWeekday + 7) % 7
        const startMinutes = parseTimeValue(course.start_time)
        return { course, dayOffset, startMinutes }
      })
      .filter(({ dayOffset, startMinutes }) => {
        if (startMinutes === null) {
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
        return left.start_time.localeCompare(right.start_time)
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

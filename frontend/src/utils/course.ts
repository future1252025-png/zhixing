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
    weeks: course.weeks ?? ''
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
    weeks: form.weeks.trim() || null
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
    return '教室不能为空'
  }
  if (roomName.length > 64) {
    return '教室不能超过 64 字'
  }
  if (teacher.length > 64) {
    return '教师不能超过 64 字'
  }
  if (weeks.length > 64) {
    return '周次不能超过 64 字'
  }
  return null
}

export function getWeekdayLabel(weekday: number): string {
  return WEEKDAYS.find((item) => item.value === weekday)?.label ?? `星期${weekday}`
}

export function groupCoursesByWeekday(courses: Course[]): WeekdayCourseGroup[] {
  return WEEKDAYS.map((weekday) => ({
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
  })).filter((group) => group.courses.length > 0)
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

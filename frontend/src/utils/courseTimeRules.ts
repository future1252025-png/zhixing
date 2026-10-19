import type { Course } from '@/types/course'
import type { CourseTimeRule, SemesterState } from '@/types/semester'

const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/
function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
export function validateCourseTimeRules(value: unknown): string {
  if (!Array.isArray(value) || value.length > 40) return '最多设置 40 条时间调整'
  for (let index = 0; index < value.length; index++) {
    const rule = value[index] as CourseTimeRule
    if (!rule || !validDate(rule.start_date) || (rule.end_date !== null && !validDate(rule.end_date))) return '请选择正确的生效日期'
    if (rule.end_date && rule.end_date < rule.start_date) return '结束日期不能早于开始日期'
    if (![rule.from_start, rule.from_end, rule.start_time, rule.end_time].every(time => typeof time === 'string' && clock.test(time))) return '请补全上课和下课时间'
    if (rule.from_start >= rule.from_end || rule.start_time >= rule.end_time) return '下课时间必须晚于上课时间'
    if (value.slice(index + 1).some(other => other && other.from_start === rule.from_start && other.from_end === rule.from_end
      && rule.start_date <= (other.end_date || '9999-12-31') && other.start_date <= (rule.end_date || '9999-12-31'))) return '同一原时段的生效日期不能重叠'
  }
  return ''
}

/** Resolve a single dated occurrence. Never rewrite imported clocks or fixed makeup times. */
export function courseAtDate(course: Course, date: string, semester: SemesterState | null): Course {
  if (course.makeup) return course
  const rule = semester?.time_rules?.find(rule => rule.start_date <= date && (!rule.end_date || date <= rule.end_date)
    && rule.from_start === course.start_time && rule.from_end === course.end_time)
  return rule ? { ...course, start_time: rule.start_time, end_time: rule.end_time } : course
}

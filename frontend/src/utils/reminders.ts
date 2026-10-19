import type { Course } from '@/types/course'
import type { SemesterState } from '@/types/semester'
import type { ReminderItem, ReminderOccurrence, ReminderPlan } from '@/types/reminder'
import { campusTime } from './campusTime'
import { coursesOnDate, formatCourseLocation } from './course'

export const MAX_DEVICE_REMINDERS = 400
export const DEVICE_COURSE_DAYS = 30
export const emptyReminderPlan = (): ReminderPlan => ({
  revision: 0, course_settings: { enabled: false, lead_minutes: 10, mode: 'vibrate' }, items: []
})
export function addCalendarDays(date: string, days: number): string {
  if (!Number.isFinite(Date.parse(`${date}T00:00:00Z`))) return ''
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}
export function reminderInstant(date: string, time: string): string {
  return `${date}T${time}:00+08:00`
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function validateReminder(item: ReminderItem): string {
  if (!item.title.trim() || item.title.trim().length > 100) return '请填写 1–100 字的提醒事项'
  if (item.note.length > 300) return '备注不能超过 300 字'
  if (!validDate(item.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time)) return '请选择正确的日期和时间'
  if (item.repeat !== 'once') {
    if (!item.end_date || !validDate(item.end_date)) return '请设置重复提醒的结束日期'
    const days = (Date.parse(item.end_date) - Date.parse(item.date)) / 86_400_000
    if (days < 0 || days > 366) return '结束日期不能早于开始日期，重复提醒最长一年'
    if (item.repeat === 'weekly' && !item.weekdays.length) return '请至少选择一个重复星期'
  }
  return ''
}
/** Stored data is untrusted: reject a corrupt cache instead of crashing the notification runtime. */
export function isReminderPlan(value: unknown): value is ReminderPlan {
  if (!value || typeof value !== 'object') return false
  const plan = value as ReminderPlan
  const settings = plan.course_settings
  const modes = ['sound', 'vibrate', 'silent']
  if (!Number.isSafeInteger(plan.revision) || plan.revision < 0 || !settings
    || typeof settings.enabled !== 'boolean' || !Number.isInteger(settings.lead_minutes)
    || settings.lead_minutes < 0 || settings.lead_minutes > 120 || !modes.includes(settings.mode)
    || !Array.isArray(plan.items) || plan.items.length > 100) return false
  const ids = new Set<string>()
  return plan.items.every((item) => {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) || ids.has(item.id)
      || typeof item.title !== 'string' || typeof item.note !== 'string' || typeof item.enabled !== 'boolean'
      || !modes.includes(item.mode) || !['once', 'daily', 'weekly'].includes(item.repeat)
      || !Array.isArray(item.weekdays) || item.weekdays.length > 7 || new Set(item.weekdays).size !== item.weekdays.length
      || !item.weekdays.every((day) => Number.isInteger(day) && day >= 1 && day <= 7)
      || !Array.isArray(item.completed_dates) || item.completed_dates.length > 367
      || !item.completed_dates.every(validDate) || new Set(item.completed_dates).size !== item.completed_dates.length
      || (item.repeat === 'once' && item.end_date !== null) || validateReminder(item)) return false
    ids.add(item.id)
    return true
  })
}
export function customOccurrences(item: ReminderItem): ReminderOccurrence[] {
  if (!item.enabled || validateReminder(item)) return []
  const end = item.repeat === 'once' ? item.date : item.end_date!
  const result: ReminderOccurrence[] = []
  for (let date = item.date, count = 0; date <= end && count <= 366; date = addCalendarDays(date, 1), count++) {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7
    if (item.completed_dates.includes(date) || (item.repeat === 'weekly' && !item.weekdays.includes(weekday))) continue
    result.push({ key: `item-${item.id}-${date}`, item_id: item.id, kind: 'custom', title: item.title,
      body: item.note || '到时间了，记得完成这件事。', at: reminderInstant(date, item.time),
      event_at: reminderInstant(date, item.time), date, mode: item.mode })
  }
  return result
}
export function buildReminderOccurrences(plan: ReminderPlan, courses: Course[], semester: SemesterState | null,
  date = campusTime(new Date()).date): ReminderOccurrence[] {
  const occurrences = plan.items.flatMap(customOccurrences)
  if (plan.course_settings.enabled && validDate(date)) {
    for (const course of coursesOnDate(courses, date, semester)) {
      if (!course.start_time || !course.end_time || course.end_time <= course.start_time) continue
      const event_at = reminderInstant(date, course.start_time)
      // Today's course reminders never fire on the previous calendar day.
      const at = new Date(Math.max(Date.parse(reminderInstant(date, '00:00')),
        Date.parse(event_at) - plan.course_settings.lead_minutes * 60_000)).toISOString()
      const lead = (Date.parse(event_at) - Date.parse(at)) / 60_000
      occurrences.push({ key: `course-${course.id}-${date}`, course_id: course.id, kind: 'course', date,
        title: `${lead ? `${lead} 分钟后上课` : '上课时间到了'} · ${course.course_name}`,
        body: `${course.start_time}–${course.end_time} · ${formatCourseLocation(course)}`,
        event_at, at, mode: plan.course_settings.mode })
    }
  }
  return occurrences.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.key.localeCompare(b.key))
}
export function nextCustomOccurrence(item: ReminderItem, now: Date): ReminderOccurrence | null {
  const occurrences = customOccurrences(item)
  if (item.repeat === 'once') return occurrences[0] ?? null
  return occurrences.find((occurrence) => occurrence.date >= campusTime(now).date) ?? null
}
/** The UI stays daily. Native alarms are registered ahead so closing the WebView cannot stop tomorrow's reminders. */
export function buildDeviceReminderOccurrences(plan: ReminderPlan, courses: Course[], semester: SemesterState | null,
  date = campusTime(new Date()).date): ReminderOccurrence[] {
  const occurrences = plan.items.flatMap(customOccurrences)
  if (plan.course_settings.enabled && validDate(date)) {
    for (let offset = 0; offset < DEVICE_COURSE_DAYS; offset++) {
      occurrences.push(...buildReminderOccurrences({ ...plan, items: [] }, courses, semester, addCalendarDays(date, offset)))
    }
  }
  return occurrences.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.key.localeCompare(b.key))
}
export function notificationId(key: string): number {
  let hash = 2166136261
  for (const character of key) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  return (hash >>> 0) % 2_000_000_000 + 1
}
export function allocateNotificationIds(userId: number, occurrences: ReminderOccurrence[], reserved: number[] = []) {
  const used = new Set<number>(reserved)
  return occurrences.map((occurrence) => {
    let id = notificationId(`${userId}:${occurrence.key}`)
    while (used.has(id)) id = id % 2_000_000_000 + 1
    used.add(id)
    return { id, occurrence }
  })
}
export function formatReminderAt(at: string): string {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at))
}

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Course } from '@/types/course'
import type { SemesterState } from '@/types/semester'
import type { ReminderItem } from '@/types/reminder'
import { addCalendarDays, allocateNotificationIds, buildReminderOccurrences, customOccurrences,
  emptyReminderPlan, isReminderPlan, nextCustomOccurrence, validateReminder } from './reminders'

const item = (overrides: Partial<ReminderItem> = {}): ReminderItem => ({ id: 'one', title: '交作业', note: '',
  date: '2026-09-07', time: '14:30', repeat: 'once', weekdays: [], end_date: null,
  enabled: true, mode: 'vibrate', completed_dates: [], ...overrides })
const course = (overrides: Partial<Course> = {}): Course => ({ id: 1, course_name: '思想概论', weekday: 1,
  start_time: '14:30', end_time: '16:10', building_id: null, building: null, room_name: '',
  source_location: '教4-409', teacher: '杨老师', weeks: '1-16', source_kind: 'import',
  needs_location_review: true, created_at: '', ...overrides })
const semester = { start_date: '2026-08-31', total_weeks: 20, current_week: 2, status: 'active' } as SemesterState

describe('reminder calendar engine', () => {
  afterEach(() => vi.useRealTimers())
  it('uses saved 14:30 clocks and actual semester weeks, not standard 14:00 or browsing week', () => {
    const plan = emptyReminderPlan()
    plan.course_settings.enabled = true
    const result = buildReminderOccurrences(plan, [course()], semester, '2026-09-07')
    const monday = result.find(value => value.date === '2026-09-07')!
    expect(monday.at).toBe('2026-09-07T06:20:00.000Z')
    expect(monday.event_at).toBe('2026-09-07T14:30:00+08:00')
    expect(monday.body).toContain('14:30–16:10')
    expect(result).toHaveLength(1)
    expect(buildReminderOccurrences(plan, [course()], { ...semester, current_week: 9 }, '2026-09-07')).toEqual(result)
  })
  it('respects odd/even weeks and excludes missing time without guessing', () => {
    const plan = emptyReminderPlan()
    plan.course_settings.enabled = true
    const courses = [course({ weeks: '1-4(单)' }), course({ id: 2, start_time: null, end_time: null })]
    expect(buildReminderOccurrences(plan, courses, semester, '2026-09-07')).toEqual([])
    expect(buildReminderOccurrences(plan, courses, semester, '2026-09-14').map(value => value.date)).toEqual(['2026-09-14'])
    expect(buildReminderOccurrences(plan, courses, semester, '2026-08-24')).toEqual([])
    expect(buildReminderOccurrences(plan, courses, semester, '2027-02-01')).toEqual([])
  })
  it('keeps early course notifications within today and reports the actual lead time across a year', () => {
    const plan = emptyReminderPlan()
    plan.course_settings = { enabled: true, lead_minutes: 120, mode: 'silent' }
    const result = buildReminderOccurrences(plan, [course({ weekday: 7, start_time: '00:30', end_time: '02:00', weeks: '1' })],
      { ...semester, start_date: '2026-12-28' }, '2027-01-03')
    expect(result[0]!.date).toBe('2027-01-03')
    expect(result[0]!.at).toBe('2027-01-02T16:00:00.000Z')
    expect(result[0]!.title).toContain('30 分钟后上课')
  })
  it('takes today in Beijing, never the rest of the week or semester, and switches after midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-07T15:59:59Z'))
    const plan = emptyReminderPlan()
    plan.course_settings.enabled = true
    plan.items = [item({ id: 'future-custom', date: '2026-09-10' })]
    const courses = [course(), course({ id: 2, weekday: 2 }), course({ id: 3, weekday: 3 })]
    const monday = buildReminderOccurrences(plan, courses, semester)
    expect(monday.filter(value => value.kind === 'course').map(value => value.key)).toEqual(['course-1-2026-09-07'])
    expect(monday.find(value => value.kind === 'custom')?.date).toBe('2026-09-10')
    vi.setSystemTime(new Date('2026-09-07T16:00:00Z'))
    expect(buildReminderOccurrences(plan, courses, semester).filter(value => value.kind === 'course')
      .map(value => value.key)).toEqual(['course-2-2026-09-08'])
    expect(buildReminderOccurrences(plan, courses, semester, '2026-09-12').filter(value => value.kind === 'course')).toEqual([])
  })
  it('daily/weekly repeats are inclusive, bounded and skip only the completed occurrence', () => {
    const weekly = item({ repeat: 'weekly', weekdays: [1, 3], end_date: '2026-09-16', completed_dates: ['2026-09-07'] })
    expect(customOccurrences(weekly).map(value => value.date)).toEqual(['2026-09-09', '2026-09-14', '2026-09-16'])
    expect(customOccurrences(item({ repeat: 'daily', end_date: '2026-09-09' }))).toHaveLength(3)
    expect(customOccurrences(item({ enabled: false }))).toEqual([])
    expect(customOccurrences(item({ completed_dates: ['2026-09-07'] }))).toEqual([])
    expect(nextCustomOccurrence(weekly, new Date('2026-09-09T15:00:00+08:00'))?.date).toBe('2026-09-09')
  })
  it('rejects bad input and corrupt cache; clearing a date never throws', () => {
    expect(addCalendarDays('', 30)).toBe('')
    expect(validateReminder(item({ time: '24:00' }))).not.toBe('')
    expect(validateReminder(item({ date: '2026-02-30' }))).not.toBe('')
    expect(validateReminder(item({ repeat: 'weekly', end_date: '2027-10-01' }))).not.toBe('')
    expect(isReminderPlan(emptyReminderPlan())).toBe(true)
    expect(isReminderPlan({ ...emptyReminderPlan(), items: [item()] })).toBe(true)
    for (const invalid of [null, {}, { ...emptyReminderPlan(), items: [null] },
      { ...emptyReminderPlan(), items: [{ ...item(), completed_dates: 'bad' }] },
      { ...emptyReminderPlan(), items: [item(), item()] }]) expect(isReminderPlan(invalid)).toBe(false)
  })
  it('allocates stable user-scoped IDs and resolves collisions with preserved alarms', () => {
    const occurrences = customOccurrences(item())
    const first = allocateNotificationIds(1, occurrences)
    expect(allocateNotificationIds(1, occurrences)).toEqual(first)
    expect(allocateNotificationIds(2, occurrences)[0]!.id).not.toBe(first[0]!.id)
    const conflict = allocateNotificationIds(1, occurrences, [first[0]!.id])
    expect(conflict[0]!.id).not.toBe(first[0]!.id)
    expect(first[0]!.id).toBeGreaterThan(0)
    expect(first[0]!.id).toBeLessThanOrEqual(2_000_000_000)
  })
})

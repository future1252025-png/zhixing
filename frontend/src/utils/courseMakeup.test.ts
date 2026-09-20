import { expect, it } from 'vitest'
import type { Course } from '@/types/course'
import type { SemesterState } from '@/types/semester'
import { coursesOnDate, filterCoursesByWeek, findNextCourse, isCourseOngoing } from './course'
import { buildReminderOccurrences, emptyReminderPlan } from './reminders'

const semester: SemesterState = { start_date: '2026-08-31', total_weeks: 20, current_week: 3, status: 'active' }
const monday = { id: 1, course_name: '思想概论', weekday: 1, start_time: '14:30', end_time: '16:10', weeks: '1-16',
  source_kind: 'import', source_location: '教4-409', building_id: null, building: null, room_name: '教4-409', teacher: '老师', needs_location_review: true, created_at: '' } satisfies Course
const makeup: Course = { ...monday, id: 2, weekday: 6, weeks: '1', makeup: { date: '2026-09-19', source_course_id: 1,
  source_date: '2026-09-14', cancel_source: true, batch_id: 'test-batch', location: '教4-409' } }

it('uses the exact makeup date and cancels only the source occurrence', () => {
  const courses = [monday, makeup]
  expect(coursesOnDate(courses, '2026-09-14', semester)).toEqual([])
  expect(coursesOnDate(courses, '2026-09-19', semester)).toEqual([makeup])
  expect(coursesOnDate(courses, '2026-09-21', semester)).toEqual([monday])
  expect(coursesOnDate(courses, '2026-09-26', semester)).toEqual([])
  expect(filterCoursesByWeek(courses, 3, semester)).toEqual([makeup])
  expect(filterCoursesByWeek(courses, 4, semester)).toEqual([monday])
  expect(filterCoursesByWeek(courses, 1)).toEqual([monday])
})

it('preserves original clocks and agrees across home, timetable and daily reminders', () => {
  const courses = [monday, makeup]
  const actualWeek = filterCoursesByWeek(courses, 3, semester)
  const now = new Date('2026-09-19T14:09:00+08:00')
  expect(findNextCourse(actualWeek, now)).toEqual(makeup)
  expect(isCourseOngoing(makeup, now)).toBe(false)
  expect(isCourseOngoing(makeup, new Date('2026-09-19T14:30:00+08:00'))).toBe(true)
  expect(isCourseOngoing(makeup, new Date('2026-09-26T14:30:00+08:00'))).toBe(false)
  expect(isCourseOngoing(makeup, new Date('2026-09-19T16:10:00+08:00'))).toBe(false)
  const plan = emptyReminderPlan()
  plan.course_settings.enabled = true
  expect(buildReminderOccurrences(plan, courses, semester, '2026-09-14')).toEqual([])
  const reminders = buildReminderOccurrences(plan, courses, semester, '2026-09-19')
  expect(reminders).toHaveLength(1)
  expect(reminders[0]?.course_id).toBe(makeup.id)
  expect(reminders[0]?.event_at).toBe('2026-09-19T14:30:00+08:00')
  expect(new Date(reminders[0]!.at).getTime()).toBe(Date.parse('2026-09-19T14:20:00+08:00'))
  expect(buildReminderOccurrences(plan, courses, semester, '2026-09-26')).toEqual([])
  expect(buildReminderOccurrences(plan, [monday], semester, '2026-09-14')).toHaveLength(1)
})

it('keeps an extra lesson separate from odd/even rules and preserves source unless explicitly cancelled', () => {
  const even: Course = { ...monday, weeks: '1-16(双)' }
  const extra = { ...makeup, makeup: { ...makeup.makeup!, cancel_source: false } }
  expect(coursesOnDate([even, extra], '2026-09-14', semester)).toEqual([])
  expect(coursesOnDate([even, extra], '2026-09-19', semester)).toEqual([extra])
  expect(coursesOnDate([monday, extra], '2026-09-14', semester)).toEqual([monday])
})

it('does not move actual dates when semester settings change or disappear', () => {
  const changed = { ...semester, start_date: '2026-08-24' }
  expect(filterCoursesByWeek([monday, makeup], 4, changed)).toEqual([makeup])
  expect(coursesOnDate([makeup], '2026-09-19', null)).toEqual([makeup])
  expect(coursesOnDate([makeup], '2026-02-30', semester)).toEqual([])
})

import { describe, expect, it } from 'vitest'
import type { Course } from '@/types/course'
import type { SemesterState } from '@/types/semester'
import { courseAtDate, validateCourseTimeRules } from './courseTimeRules'
import { coursesOnDate, filterCoursesByWeek, findNextCourse, getTimetableTimeSlots } from './course'
import { buildDeviceReminderOccurrences, buildReminderOccurrences, emptyReminderPlan } from './reminders'

const course = { id: 1, course_name: '下午课', weekday: 5, weeks: '1-16', start_time: '14:00', end_time: '15:40',
  building: null, room_name: '教4-409' } as Course
const rule = { start_date: '2026-05-01', end_date: '2026-09-30', from_start: '14:00', from_end: '15:40', start_time: '14:30', end_time: '16:10' }
const semester: SemesterState = { status: 'active', start_date: '2026-04-27', total_weeks: 16, current_week: 1, time_rules: [rule] }
describe('dated course clocks', () => {
  it('is inclusive at both dates, leaves the source intact and never compounds a shift', () => {
    expect(courseAtDate(course, '2026-04-30', semester)).toBe(course)
    const shifted = courseAtDate(course, '2026-05-01', semester)
    expect(shifted.start_time).toBe('14:30')
    expect(course.start_time).toBe('14:00')
    expect(courseAtDate(shifted, '2026-05-01', semester).start_time).toBe('14:30')
    expect(courseAtDate(course, '2026-09-30', semester).start_time).toBe('14:30')
    expect(courseAtDate(course, '2026-10-01', semester)).toBe(course)
  })
  it('preserves fixed makeup and individually edited time pairs', () => {
    const makeup = { ...course, makeup: { date: '2026-05-01' } } as Course
    expect(courseAtDate(makeup, '2026-05-01', semester)).toBe(makeup)
    expect(courseAtDate({ ...course, end_time: '15:00' }, '2026-05-01', semester).start_time).toBe('14:00')
  })
  it('uses one occurrence clock for a split week, timetable, upcoming card and notifications', () => {
    const monday = { ...course, id: 2, weekday: 1 }
    const visible = filterCoursesByWeek([course, monday], 1, semester)
    expect(visible.map(row => row.start_time)).toEqual(['14:00', '14:30'])
    expect(getTimetableTimeSlots(visible)).toContainEqual(expect.objectContaining({ start_time: '14:30', end_time: '16:10' }))
    expect(findNextCourse(visible, new Date('2026-05-01T14:09:00+08:00'))?.id).toBe(1)
    expect(findNextCourse(visible, new Date('2026-05-01T14:30:00+08:00'))).toBeNull()
    const plan = emptyReminderPlan(); plan.course_settings.enabled = true
    const reminders = buildReminderOccurrences(plan, [course, monday], semester, '2026-05-01')
    expect(reminders[0]?.event_at).toBe('2026-05-01T14:30:00+08:00')
    expect(reminders[0]?.at).toBe('2026-05-01T06:20:00.000Z')
    expect(coursesOnDate([course], '2026-05-01', { ...semester, current_week: 12 })).toEqual([visible[1]])
  })
  it('prepares native future alarms but keeps the page daily and skips cancelled source dates', () => {
    const plan = emptyReminderPlan(); plan.course_settings.enabled = true
    const rows = [course, { ...course, id: 3, weekday: 6, makeup: { date: '2026-05-02', cancel_source: true, source_date: '2026-05-01', source_course_id: 1 } } as Course]
    expect(buildReminderOccurrences(plan, rows, semester, '2026-05-01')).toEqual([])
    const device = buildDeviceReminderOccurrences(plan, rows, semester, '2026-05-01')
    expect(device[0]?.date).toBe('2026-05-02')
    expect(device[0]?.event_at).toBe('2026-05-02T14:00:00+08:00')
    expect(device.every(row => row.date >= '2026-05-01' && row.date <= '2026-05-30')).toBe(true)
    expect(device.find(row => row.date === '2026-05-08')?.event_at).toBe('2026-05-08T14:30:00+08:00')
  })
  it('rejects invalid clocks, dates and overlapping rules but allows a later winter period', () => {
    expect(validateCourseTimeRules([rule])).toBe('')
    expect(validateCourseTimeRules([rule, { ...rule }])).toContain('重叠')
    expect(validateCourseTimeRules([{ ...rule, start_time: '25:00' }])).toBeTruthy()
    expect(validateCourseTimeRules([{ ...rule, start_date: '2026-02-30' }])).toBeTruthy()
    expect(validateCourseTimeRules([{ ...rule, end_time: '13:00' }])).toBeTruthy()
    expect(validateCourseTimeRules([rule, { ...rule, start_date: '2026-10-01', end_date: null }])).toBe('')
  })
})

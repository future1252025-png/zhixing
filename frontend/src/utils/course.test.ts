import { describe, expect, it } from 'vitest'

import {
  buildEmptyCourseForm,
  filterCoursesByWeek,
  findCourseTimeOverlap,
  groupCoursesByWeekday,
  isCourseActiveInWeek,
  validateCourseForm
} from './course'
import type { Course } from '@/types/course'

const baseForm = {
  course_name: 'Mobile App Design',
  weekday: 1,
  start_time: '08:00',
  end_time: '09:40',
  building_id: 1,
  room_name: 'A101',
  teacher: 'Teacher Li',
  weeks: '1-16'
}

const baseCourse: Course = {
  id: 1,
  course_name: 'Mobile App Design',
  weekday: 1,
  start_time: '08:00',
  end_time: '09:40',
  building_id: 1,
  building: {
    id: 1,
    name: 'Library',
    type: 'Study'
  },
  room_name: 'A101',
  teacher: 'Teacher Li',
  weeks: '1-16',
  created_at: '2026-05-29T08:00:00'
}

describe('course helpers', () => {
  it('creates an empty form with sensible defaults', () => {
    const form = buildEmptyCourseForm()

    expect(form.weekday).toBe(1)
    expect(form.start_time).toBe('08:00')
    expect(form.end_time).toBe('09:40')
  })

  it('validates required fields, length limits, and time range', () => {
    expect(validateCourseForm({ ...baseForm, course_name: '   ' })).toBe(
      '课程名称不能为空'
    )
    expect(validateCourseForm({ ...baseForm, room_name: '' })).toBe(
      '教室不能为空'
    )
    expect(validateCourseForm({ ...baseForm, teacher: 'a'.repeat(65) })).toBe(
      '教师不能超过 64 字'
    )
    expect(validateCourseForm({ ...baseForm, weeks: 'a'.repeat(65) })).toBe(
      '周次不能超过 64 字'
    )
    expect(validateCourseForm({ ...baseForm, weekday: 8 })).toBe(
      '星期必须在 1-7 之间'
    )
    expect(validateCourseForm({ ...baseForm, building_id: 0 })).toBe(
      '请选择上课建筑'
    )
    expect(validateCourseForm({ ...baseForm, start_time: '09:40', end_time: '08:00' })).toBe(
      '下课时间必须晚于上课时间'
    )
  })

  it('accepts a valid course form', () => {
    expect(validateCourseForm(baseForm)).toBeNull()
  })

  it('groups courses by weekday and sorts by start time', () => {
    const grouped = groupCoursesByWeekday([
      { ...baseCourse, id: 2, weekday: 2, start_time: '14:00' },
      { ...baseCourse, id: 3, weekday: 1, start_time: '10:00' },
      baseCourse
    ])

    expect(grouped[0].weekday).toBe(1)
    expect(grouped[0].courses.map((course) => course.id)).toEqual([1, 3])
    expect(grouped[1].weekday).toBe(2)
  })

  it('can include Saturday and Sunday even when a week has no courses on those days', () => {
    const grouped = groupCoursesByWeekday([baseCourse], { includeEmpty: true })

    expect(grouped).toHaveLength(7)
    expect(grouped.map((group) => group.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(grouped.find((group) => group.weekday === 6)?.courses).toEqual([])
    expect(grouped.find((group) => group.weekday === 7)?.courses).toEqual([])
  })

  it('detects active courses for plain, comma, odd, and even week expressions', () => {
    expect(isCourseActiveInWeek('1-16', 9)).toBe(true)
    expect(isCourseActiveInWeek('1-16(周)[01-02节]', 17)).toBe(false)
    expect(isCourseActiveInWeek('2,4,6,8,10,12,14,16', 10)).toBe(true)
    expect(isCourseActiveInWeek('2,4,6,8,10,12,14,16', 11)).toBe(false)
    expect(isCourseActiveInWeek('1-16(单)', 5)).toBe(true)
    expect(isCourseActiveInWeek('1-16(单)', 6)).toBe(false)
    expect(isCourseActiveInWeek('1-16(双)', 6)).toBe(true)
    expect(isCourseActiveInWeek('', 20)).toBe(true)
  })

  it('filters courses by selected teaching week', () => {
    const filtered = filterCoursesByWeek(
      [
        baseCourse,
        { ...baseCourse, id: 2, weeks: '2,4,6' },
        { ...baseCourse, id: 3, weeks: '9-16' }
      ],
      6
    )

    expect(filtered.map((course) => course.id)).toEqual([1, 2])
  })

  it('finds same-day time overlaps without blocking save', () => {
    const overlap = findCourseTimeOverlap(
      {
        ...baseForm,
        start_time: '09:00',
        end_time: '10:20'
      },
      [baseCourse]
    )

    expect(overlap?.id).toBe(1)
    expect(findCourseTimeOverlap(baseForm, [baseCourse], 1)).toBeNull()
  })
})

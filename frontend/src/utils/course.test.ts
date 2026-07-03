import { describe, expect, it } from 'vitest'

import {
  buildEmptyCourseForm,
  buildCourseCreateQuery,
  parseWeeksRangeToPicker,
  buildWeeksRange,
  filterCoursesByWeek,
  findNextCourse,
  findCourseTimeOverlap,
  getCourseTimeSlots,
  getTeachingWeekOptions,
  groupCoursesByWeekday,
  isCourseActiveInWeek,
  readSelectedWeek,
  writeSelectedWeek,
  validateCourseForm
} from './course'
import type { Course } from '@/types/course'

const baseForm = {
  course_name: '移动应用设计',
  weekday: 1,
  start_time: '08:00',
  end_time: '09:40',
  building_id: 1,
  room_name: 'A101',
  teacher: '李老师',
  weeks: '1-16'
}

const baseCourse: Course = {
  id: 1,
  course_name: '移动应用设计',
  weekday: 1,
  start_time: '08:00',
  end_time: '09:40',
  building_id: 1,
  building: {
    id: 1,
    name: '图书馆',
    type: '学习'
  },
  room_name: 'A101',
  teacher: '李老师',
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

  it('reads and writes selected teaching week safely', () => {
    const storage = new Map<string, string>()
    const localStorageLike = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value)
    }

    expect(readSelectedWeek(localStorageLike)).toBe(1)
    writeSelectedWeek(localStorageLike, 13)
    expect(readSelectedWeek(localStorageLike)).toBe(13)
    writeSelectedWeek(localStorageLike, 16)
    expect(readSelectedWeek(localStorageLike)).toBe(16)
    writeSelectedWeek(localStorageLike, 99)
    expect(readSelectedWeek(localStorageLike)).toBe(1)
  })

  it('provides all teaching week options including week 16', () => {
    const options = getTeachingWeekOptions()

    expect(options).toHaveLength(20)
    expect(options[0]).toBe(1)
    expect(options[15]).toBe(16)
    expect(options[19]).toBe(20)
  })

  it('builds teaching week ranges from picker values', () => {
    expect(buildWeeksRange(1, 16)).toBe('1-16')
    expect(buildWeeksRange(16, 16)).toBe('16')
    expect(buildWeeksRange(16, 1)).toBe('1-16')
  })

  it('parses existing weeks text back into picker values', () => {
    expect(parseWeeksRangeToPicker('16')).toEqual({ startWeek: 16, endWeek: 16 })
    expect(parseWeeksRangeToPicker('9-16(双)')).toEqual({ startWeek: 9, endWeek: 16 })
    expect(parseWeeksRangeToPicker('1-16(周)[01-02节]')).toEqual({
      startWeek: 1,
      endWeek: 16
    })
    expect(parseWeeksRangeToPicker('')).toBeNull()
  })

  it('builds create-course query with selected week, weekday, and time', () => {
    expect(
      buildCourseCreateQuery(5, { start_time: '14:00', end_time: '15:40' }, 16)
    ).toEqual({
      weekday: '5',
      start_time: '14:00',
      end_time: '15:40',
      weeks: '16'
    })
  })

  it('provides table time slots for timetable layout', () => {
    const slots = getCourseTimeSlots()

    expect(slots[0]).toMatchObject({
      label: '第一二节',
      start_time: '08:00',
      end_time: '09:40'
    })
    expect(slots).toHaveLength(5)
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

  it('finds the nearest future course across the next seven days', () => {
    const now = new Date('2026-06-15T10:00:00')
    const result = findNextCourse(
      [
        { ...baseCourse, id: 2, weekday: 1, start_time: '09:00' },
        { ...baseCourse, id: 3, weekday: 2, start_time: '08:00' },
        { ...baseCourse, id: 4, weekday: 1, start_time: '14:00' }
      ],
      now
    )

    expect(result?.id).toBe(4)
  })
})

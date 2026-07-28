import { describe, expect, it } from 'vitest'

import {
  COURSE_ACCENT_PALETTE,
  buildEmptyCourseForm,
  buildCourseCreateQuery,
  buildCourseColorMap,
  courseUsesStandardSlotTime,
  formatCourseLocation,
  formatTimetableCourseLocation,
  getCourseDisplaySlot,
  parseWeeksRangeToPicker,
  buildWeeksRange,
  filterCoursesByWeek,
  findNextCourse,
  findCourseTimeOverlap,
  getCourseTimeSlots,
  getQuickWeekOptions,
  getTeachingWeekOptions,
  groupCoursesByWeekday,
  isCourseActiveInWeek,
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
  source_kind: 'manual',
  needs_location_review: false,
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
      '请输入完整教室'
    )
    expect(validateCourseForm({ ...baseForm, room_name: '教'.repeat(120) })).toBeNull()
    expect(validateCourseForm({ ...baseForm, room_name: '教'.repeat(121) })).toBe(
      '教室不能超过 120 字'
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

  it('provides all teaching week options including week 16', () => {
    const options = getTeachingWeekOptions()

    expect(options).toHaveLength(20)
    expect(options[0]).toBe(1)
    expect(options[15]).toBe(16)
    expect(options[19]).toBe(20)
    expect(getTeachingWeekOptions(8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('provides compact quick week options around the selected week', () => {
    expect(getQuickWeekOptions(1)).toEqual([1, 2, 3, 4, 5])
    expect(getQuickWeekOptions(10)).toEqual([8, 9, 10, 11, 12])
    expect(getQuickWeekOptions(19)).toEqual([16, 17, 18, 19, 20])
  })

  it('assigns the same color to courses with the same subject name', () => {
    const colorMap = buildCourseColorMap([
      { ...baseCourse, id: 1, course_name: '数据结构' },
      { ...baseCourse, id: 2, course_name: '数据结构' },
      { ...baseCourse, id: 3, course_name: '计算机组成原理' }
    ])

    expect(colorMap[1]).toBe(colorMap[2])
    expect(colorMap[1]).not.toBe(colorMap[3])
  })

  it('assigns a unique curated color to each subject name up to the palette size', () => {
    const courses = Array.from({ length: COURSE_ACCENT_PALETTE.length }, (_, index) => ({
      ...baseCourse,
      course_name: `课程 ${index + 1}`,
      id: index + 1
    }))
    const colorMap = buildCourseColorMap(courses)
    const colors = [...new Set(Object.values(colorMap))]

    expect(colors).toHaveLength(courses.length)
    expect(colors.every((color) => COURSE_ACCENT_PALETTE.includes(color as never))).toBe(true)
  })

  it('keeps a subject color stable across sessions and unrelated set changes', () => {
    const alone = buildCourseColorMap([{ ...baseCourse, id: 1, course_name: '数据结构' }])
    const withOthers = buildCourseColorMap([
      { ...baseCourse, id: 1, course_name: '数据结构' },
      { ...baseCourse, id: 2, course_name: '大学英语' },
      { ...baseCourse, id: 3, course_name: '高等数学' }
    ])

    expect(withOthers[1]).toBe(alone[1])
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

  it('assigns every course to one display slot and preserves exceptional times', () => {
    const standardSlot = getCourseDisplaySlot(baseCourse)
    const exceptionalCourse = { ...baseCourse, start_time: '09:00', end_time: '10:40' }
    const exceptionalSlot = getCourseDisplaySlot(exceptionalCourse)

    expect(standardSlot?.section).toBe('1-2')
    expect(courseUsesStandardSlotTime(baseCourse, standardSlot!)).toBe(true)
    expect(exceptionalSlot?.section).toBe('1-2')
    expect(courseUsesStandardSlotTime(exceptionalCourse, exceptionalSlot!)).toBe(false)
  })

  it('keeps full locations while removing timetable-only campus and building repetition', () => {
    const course = {
      ...baseCourse,
      building: { ...baseCourse.building, name: '湖北大学(武昌主校区)-教4' },
      room_name: '教4-211'
    }
    const detailedCourse = {
      ...baseCourse,
      building: { ...baseCourse.building, name: '湖北大学武昌校区国际教育学院' },
      room_name: '东区三层 A101 交互设计实验室'
    }
    const numberedTeachingBuildingCourse = {
      ...course,
      building: { ...baseCourse.building, name: '3号教学楼' },
      room_name: '教3-205'
    }
    const mismatchedTeachingBuildingCourse = {
      ...numberedTeachingBuildingCourse,
      building: { ...baseCourse.building, name: '4号教学楼' }
    }
    const longTrainingRoomCourse = {
      ...baseCourse,
      building: { ...baseCourse.building, name: '综合实训大楼' },
      room_name: '实训大楼413-418数据中国实验室2-3'
    }

    expect(formatCourseLocation(course)).toBe('湖北大学(武昌主校区)-教4 · 教4-211')
    expect(formatTimetableCourseLocation(course)).toBe('教4-211')
    expect(formatTimetableCourseLocation(detailedCourse)).toBe(
      '国际教育学院 · 东区三层 A101 交互设计实验室'
    )
    expect(formatTimetableCourseLocation(numberedTeachingBuildingCourse)).toBe('教3-205')
    expect(formatTimetableCourseLocation(mismatchedTeachingBuildingCourse)).toBe(
      '4号教学楼 · 教3-205'
    )
    expect(formatTimetableCourseLocation(longTrainingRoomCourse)).toBe(
      '实训大楼 413-418 · 数据中国实验室 2-3'
    )
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

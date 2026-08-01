import { describe, expect, it } from 'vitest'

import {
  filterScheduleLocations,
  formatDistance,
  getLocationDisplayInfo,
  getRouteVisualPoints,
  getStatusMeta,
  toSchedulePageError
} from './schedule'

describe('schedule helpers', () => {
  it('formats distance for mobile display', () => {
    expect(formatDistance(680)).toBe('680 米')
    expect(formatDistance(1280)).toBe('1.3 公里')
  })

  it('maps suggestion status to display metadata', () => {
    expect(getStatusMeta('normal')).toEqual({
      label: '时间充足',
      className: 'status-normal'
    })
    expect(getStatusMeta('tight')).toEqual({
      label: '时间紧张',
      className: 'status-tight'
    })
    expect(getStatusMeta('likely_late')).toEqual({
      label: '可能迟到',
      className: 'status-late'
    })
  })

  it('branches schedule recovery only by structured error code', () => {
    expect(toSchedulePageError({
      status: 404,
      code: 'no_upcoming_course',
      message: 'arbitrary server wording',
      fields: [],
      details: {}
    }).title).toBe('本周暂无后续课程')

    expect(toSchedulePageError({
      status: 409,
      code: 'semester_not_active',
      message: 'same code, unrelated wording',
      fields: [],
      details: { semester_status: 'before_term' }
    })).toMatchObject({
      title: '学期尚未开始',
      semesterStatus: 'before_term'
    })
  })

  it('keeps the exact course identity for incomplete locations', () => {
    expect(toSchedulePageError({
      status: 409,
      code: 'course_location_incomplete',
      message: 'location missing',
      fields: ['building_id', 'room_name'],
      details: {
        course_id: 18,
        course_name: '软件工程',
        missing_fields: ['building_id', 'room_name']
      }
    })).toMatchObject({
      courseId: 18,
      courseName: '软件工程',
      title: '“软件工程”地点不完整'
    })
  })

  it('explains exactly which imported location field is needed for routing', () => {
    expect(toSchedulePageError({
      status: 409,
      code: 'course_location_incomplete',
      message: 'location missing',
      fields: ['building_id'],
      details: {
        course_id: 18,
        course_name: '软件工程',
        missing_fields: ['building_id']
      }
    })).toMatchObject({
      title: '“软件工程”地图地点未匹配',
      message: '请为这门课选择地图上的上课建筑，再重新生成出发建议。'
    })

    expect(toSchedulePageError({
      status: 409,
      code: 'course_location_incomplete',
      message: 'room missing',
      fields: ['room_name'],
      details: {
        course_id: 18,
        course_name: '软件工程',
        missing_fields: ['room_name']
      }
    })).toMatchObject({
      title: '“软件工程”教室信息不完整',
      message: '请补全这门课的教室信息，再重新生成出发建议。'
    })
  })

  it('builds stable route visual points from two coordinates', () => {
    const points = getRouteVisualPoints(
      { latitude: 30.58, longitude: 114.32 },
      { latitude: 30.59, longitude: 114.34 }
    )

    expect(points.from.left).toBeLessThan(points.to.left)
    expect(points.from.top).toBeGreaterThan(points.to.top)
    expect(points.lineWidth).toBeGreaterThan(0)
    expect(points.lineAngle).toBeLessThan(0)
  })

  it('filters schedule locations by name and type', () => {
    const locations = [
      { id: 1, name: '3号教学楼', type: '教学楼', latitude: 30, longitude: 114 },
      { id: 2, name: '风华园食堂', type: '食堂', latitude: 30, longitude: 114 }
    ]

    expect(filterScheduleLocations(locations, '教3')[0].name).toBe('3号教学楼')
    expect(filterScheduleLocations(locations, '食堂')[0].name).toBe('风华园食堂')
  })

  it('highlights the distinctive part of long campus place names', () => {
    expect(getLocationDisplayInfo({
      name: '湖北大学武昌校区生命科学学院',
      type: '校园地点'
    })).toEqual({
      title: '生命科学学院',
      subtitle: '校园地点'
    })

    expect(getLocationDisplayInfo({
      name: '湖北大学(武昌校区)图书馆',
      type: '校园地点'
    }).title).toBe('图书馆')
  })
})

import { describe, expect, it } from 'vitest'

import {
  formatDistance,
  getStatusMeta,
  getRouteVisualPoints
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
})

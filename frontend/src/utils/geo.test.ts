import { describe, expect, it } from 'vitest'

import { gcj02ToWgs84, isPointInPolygon, wgs84ToGcj02 } from './geo'

describe('geo utils', () => {
  it('converts Hubei University Wuchang coordinates for AMap display', () => {
    const [longitude, latitude] = wgs84ToGcj02(30.58122, 114.32917)

    expect(latitude).toBeGreaterThan(30.578)
    expect(latitude).toBeLessThan(30.584)
    expect(longitude).toBeGreaterThan(114.333)
    expect(longitude).toBeLessThan(114.337)
  })

  it('keeps non-China coordinates unchanged', () => {
    expect(wgs84ToGcj02(40.7128, -74.006)).toEqual([-74.006, 40.7128])
  })

  it('converts GCJ-02 coordinates back near the original WGS84 point', () => {
    const original = { latitude: 30.58122, longitude: 114.32917 }
    const [gcjLongitude, gcjLatitude] = wgs84ToGcj02(original.latitude, original.longitude)
    const [wgsLongitude, wgsLatitude] = gcj02ToWgs84(gcjLatitude, gcjLongitude)

    expect(wgsLatitude).toBeCloseTo(original.latitude, 4)
    expect(wgsLongitude).toBeCloseTo(original.longitude, 4)
  })

  it('checks whether a point is inside a polygon', () => {
    const polygon = [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 2 },
      { latitude: 2, longitude: 2 },
      { latitude: 2, longitude: 0 }
    ]

    expect(isPointInPolygon({ latitude: 1, longitude: 1 }, polygon)).toBe(true)
    expect(isPointInPolygon({ latitude: 3, longitude: 1 }, polygon)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'

import { wgs84ToGcj02 } from './geo'

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
})

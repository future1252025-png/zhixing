import { describe, expect, it } from 'vitest'

import {
  getBuildingHitZoneSize,
  getMapInteractionLevel,
  shouldShowBuildingHighlight
} from './mapInteraction'

describe('map interaction helpers', () => {
  it('uses smaller building hit zones when zoomed out and larger zones when zoomed in', () => {
    expect(getBuildingHitZoneSize(14)).toBe(10)
    expect(getBuildingHitZoneSize(16)).toBe(22)
    expect(getBuildingHitZoneSize(18)).toBe(38)
  })

  it('keeps selected search targets easy to tap at any zoom level', () => {
    expect(getBuildingHitZoneSize(14, true)).toBe(32)
    expect(getBuildingHitZoneSize(18, true)).toBe(46)
  })

  it('classifies map zoom levels for layered interaction', () => {
    expect(getMapInteractionLevel(14)).toBe('area')
    expect(getMapInteractionLevel(16)).toBe('mixed')
    expect(getMapInteractionLevel(18)).toBe('building')
  })

  it('only shows visible building highlight for selected points', () => {
    expect(shouldShowBuildingHighlight(false)).toBe(false)
    expect(shouldShowBuildingHighlight(true)).toBe(true)
  })
})

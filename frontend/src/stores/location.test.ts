import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Building, LocationPreset } from '@/api/buildings'
import { useLocationStore } from './location'

const amapMock = vi.hoisted(() => ({
  requestAMapCurrentPosition: vi.fn()
}))

vi.mock('@/utils/amap', () => ({
  requestAMapCurrentPosition: amapMock.requestAMapCurrentPosition
}))

const preset: LocationPreset = {
  id: 1,
  name: 'Library preset',
  building_id: 3,
  building_name: 'Library',
  latitude: 30.5812,
  longitude: 114.3221,
  description: 'Demo start point'
}

const building: Building = {
  id: 2,
  name: 'Teaching Building 1',
  type: 'Teaching',
  description: 'Main teaching building',
  latitude: 30.5821,
  longitude: 114.324,
  map_x: 60,
  map_y: 42,
  walk_hint: null
}

describe('location store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    amapMock.requestAMapCurrentPosition.mockReset()
    Object.defineProperty(navigator, 'geolocation', {
      value: undefined,
      configurable: true
    })
  })

  it('selects a preset and prefers current_building_id when available', () => {
    const store = useLocationStore()

    store.selectPreset(preset)

    expect(store.selectedLocation?.name).toBe('Library preset')
    expect(store.suggestionPayload).toEqual({ current_building_id: 3 })
  })

  it('selects any building as current location', () => {
    const store = useLocationStore()

    store.selectBuilding(building)

    expect(store.selectedLocation?.source).toBe('building')
    expect(store.suggestionPayload).toEqual({ current_building_id: 2 })
  })

  it('uses coordinates for browser location', () => {
    const store = useLocationStore()

    store.setBrowserLocation(30.58, 114.32)

    expect(store.selectedLocation?.name).toBe('当前位置')
    expect(store.suggestionPayload).toEqual({
      latitude: 30.58,
      longitude: 114.32
    })
  })

  it('falls back to AMap location when browser geolocation is unavailable', async () => {
    amapMock.requestAMapCurrentPosition.mockResolvedValue({
      latitude: 30.581,
      longitude: 114.329,
      description: '来自高德定位'
    })
    const store = useLocationStore()

    await store.requestBrowserLocation()

    expect(amapMock.requestAMapCurrentPosition).toHaveBeenCalled()
    expect(store.selectedLocation).toMatchObject({
      source: 'browser',
      name: '当前位置',
      latitude: 30.581,
      longitude: 114.329,
      description: '定位得到的当前位置'
    })
  })

  it('does not request AMap location again when browser geolocation is denied', async () => {
    const getCurrentPosition = vi.fn(
      (_resolve: PositionCallback, reject: PositionErrorCallback) => {
        reject({
          code: 1,
          message: 'denied',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3
        } as GeolocationPositionError)
      }
    )
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true
    })
    const store = useLocationStore()

    await store.requestBrowserLocation()

    expect(getCurrentPosition).toHaveBeenCalled()
    expect(amapMock.requestAMapCurrentPosition).not.toHaveBeenCalled()
    expect(store.selectedLocation).toMatchObject({
      source: 'fallback',
      name: '校园中心',
      building_id: null
    })
    expect(store.browserError).toContain('定位权限被拒绝')
  })

  it('does not request AMap location again when browser geolocation times out', async () => {
    const getCurrentPosition = vi.fn(
      (_resolve: PositionCallback, reject: PositionErrorCallback) => {
        reject({
          code: 3,
          message: 'timeout',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3
        } as GeolocationPositionError)
      }
    )
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true
    })
    const store = useLocationStore()

    await store.requestBrowserLocation()

    expect(getCurrentPosition).toHaveBeenCalled()
    expect(amapMock.requestAMapCurrentPosition).not.toHaveBeenCalled()
    expect(store.suggestionPayload).toEqual({
      latitude: expect.any(Number),
      longitude: expect.any(Number)
    })
    expect(store.browserError).toContain('定位超时')
  })

  it('uses campus center when all geolocation providers fail', async () => {
    amapMock.requestAMapCurrentPosition.mockRejectedValue(
      new Error('Get ipLocation failed.Get geolocation timeout.')
    )
    const store = useLocationStore()

    await store.requestBrowserLocation()

    expect(store.selectedLocation).toMatchObject({
      source: 'fallback',
      name: '校园中心',
      building_id: null
    })
    expect(store.suggestionPayload).toEqual({
      latitude: expect.any(Number),
      longitude: expect.any(Number)
    })
    expect(store.browserError).toContain('定位失败')
  })

  it('can clear the selected location', () => {
    const store = useLocationStore()

    store.selectPreset(preset)
    store.clearLocation()

    expect(store.selectedLocation).toBeNull()
    expect(store.suggestionPayload).toBeNull()
  })
})

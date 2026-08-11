import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  getCurrentPosition: vi.fn()
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: mocks.isNativePlatform
  }
}))

vi.mock('@capacitor/geolocation', () => ({
  Geolocation: {
    checkPermissions: mocks.checkPermissions,
    requestPermissions: mocks.requestPermissions,
    getCurrentPosition: mocks.getCurrentPosition
  }
}))

import {
  getDeviceGeolocationErrorMessage,
  hasDeviceGeolocationProvider,
  requestDeviceCurrentPosition
} from './deviceGeolocation'

describe('device geolocation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isNativePlatform.mockReturnValue(false)
    Object.defineProperty(navigator, 'geolocation', {
      value: undefined,
      configurable: true
    })
  })

  it('requests Android permission before reading the native position', async () => {
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.checkPermissions.mockResolvedValue({
      location: 'prompt',
      coarseLocation: 'prompt'
    })
    mocks.requestPermissions.mockResolvedValue({
      location: 'granted',
      coarseLocation: 'granted'
    })
    mocks.getCurrentPosition.mockResolvedValue({
      timestamp: Date.parse('2026-07-07T08:00:00.000Z'),
      coords: {
        latitude: 30.58,
        longitude: 114.32,
        accuracy: 9
      }
    })

    await expect(requestDeviceCurrentPosition()).resolves.toEqual({
      latitude: 30.58,
      longitude: 114.32,
      accuracy: 9,
      locatedAt: '2026-07-07T08:00:00.000Z',
      source: 'native'
    })
    expect(mocks.requestPermissions).toHaveBeenCalledWith({
      permissions: ['location']
    })
    expect(mocks.getCurrentPosition).toHaveBeenCalledWith(expect.objectContaining({
      enableHighAccuracy: true,
      enableLocationFallback: true,
      maximumAge: 0
    }))
  })

  it('accepts approximate Android location permission', async () => {
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.checkPermissions.mockResolvedValue({
      location: 'denied',
      coarseLocation: 'granted'
    })
    mocks.getCurrentPosition.mockResolvedValue({
      coords: {
        latitude: 30.581,
        longitude: 114.321,
        accuracy: 80
      }
    })

    await expect(requestDeviceCurrentPosition()).resolves.toMatchObject({
      source: 'native',
      accuracy: 80
    })
    expect(mocks.requestPermissions).not.toHaveBeenCalled()
  })

  it('uses browser geolocation on the web', async () => {
    const getCurrentPosition = vi.fn((resolve: PositionCallback) => resolve({
      timestamp: Date.parse('2026-07-07T08:30:00.000Z'),
      coords: {
        latitude: 30.582,
        longitude: 114.322,
        accuracy: 16
      }
    } as GeolocationPosition))
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true
    })

    expect(hasDeviceGeolocationProvider()).toBe(true)
    await expect(requestDeviceCurrentPosition()).resolves.toEqual({
      latitude: 30.582,
      longitude: 114.322,
      accuracy: 16,
      locatedAt: '2026-07-07T08:30:00.000Z',
      source: 'browser'
    })
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({ maximumAge: 0 })
    )
  })

  it('explains when Android location services are disabled', () => {
    mocks.isNativePlatform.mockReturnValue(true)

    expect(getDeviceGeolocationErrorMessage({ code: 'OS-PLUG-GLOC-0007' }))
      .toBe('定位服务未开启，请打开定位开关后重试')
  })
})

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestDeviceCurrentPosition } from '@/utils/deviceGeolocation'
import { MAP_LOCATION_FRESH_MS, useCampusMapStore } from './campusMap'
vi.mock('@/utils/deviceGeolocation', () => ({ requestDeviceCurrentPosition: vi.fn(), getDeviceGeolocationErrorMessage: () => '定位失败，请重试' }))
const position = { latitude: 30.58, longitude: 114.32, accuracy: 10, source: 'browser' as const, locatedAt: '2026-09-10T06:00:00Z' }
beforeEach(() => { setActivePinia(createPinia()); vi.useFakeTimers(); vi.setSystemTime(new Date(position.locatedAt)); vi.resetAllMocks() })
afterEach(() => { vi.useRealTimers() })
describe('map session', () => {
  it('does not request location automatically and preserves the camera for the same user', () => {
    const store = useCampusMapStore(); store.attachUser(1)
    store.rememberCamera({ center: [114.3, 30.5], zoom: 19 }); store.attachUser(1)
    expect(store.camera?.zoom).toBe(19); expect(requestDeviceCurrentPosition).not.toHaveBeenCalled()
    store.attachUser(2); expect(store.camera).toBeNull(); expect(store.position).toBeNull()
  })
  it('deduplicates location requests and bounds a stalled permission prompt', async () => {
    vi.mocked(requestDeviceCurrentPosition).mockImplementation(() => new Promise(() => {}))
    const store = useCampusMapStore(); store.attachUser(1)
    const pending = store.locate(); const shared = store.locate()
    await vi.advanceTimersByTimeAsync(22_000)
    expect(await pending).toBeNull(); expect(await shared).toBeNull(); expect(store.locating).toBe(false)
    expect(store.locationError).toContain('定位失败'); expect(requestDeviceCurrentPosition).toHaveBeenCalledTimes(1)
    vi.mocked(requestDeviceCurrentPosition).mockResolvedValue(position)
    expect(await store.locate()).toEqual(position); expect(store.locationError).toBe('')
  })
  it('shares an automatic fix with both maps and refreshes stale positions without prompting again', async () => {
    vi.mocked(requestDeviceCurrentPosition).mockResolvedValue(position)
    const store = useCampusMapStore(); store.attachUser(1)
    expect(await store.ensurePosition()).toEqual(position)
    expect(await store.ensurePosition()).toEqual(position)
    expect(requestDeviceCurrentPosition).toHaveBeenCalledTimes(1)
    expect(requestDeviceCurrentPosition).toHaveBeenLastCalledWith({ requestPermission: true })
    await vi.advanceTimersByTimeAsync(MAP_LOCATION_FRESH_MS)
    await store.ensurePosition()
    expect(requestDeviceCurrentPosition).toHaveBeenLastCalledWith({ requestPermission: false })
    expect(requestDeviceCurrentPosition).toHaveBeenCalledTimes(2)
  })
  it('shares a pending automatic request with manual locate instead of dropping the result', async () => {
    let resolve!: (p: typeof position) => void
    vi.mocked(requestDeviceCurrentPosition).mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const store = useCampusMapStore()
    const automatic = store.ensurePosition(); const manual = store.locate()
    resolve(position)
    expect(await automatic).toEqual(position); expect(await manual).toEqual(position)
    expect(requestDeviceCurrentPosition).toHaveBeenCalledTimes(1)
  })
  it('backs off after failure and permits an explicit retry without clearing the last fix', async () => {
    const store = useCampusMapStore(); store.position = position
    vi.mocked(requestDeviceCurrentPosition).mockRejectedValueOnce({ code: 1 })
    expect(await store.locate()).toBeNull()
    expect(await store.ensurePosition()).toBeNull()
    expect(store.position).toEqual(position)
    expect(requestDeviceCurrentPosition).toHaveBeenCalledTimes(1)
    vi.mocked(requestDeviceCurrentPosition).mockResolvedValue(position)
    expect(await store.locate()).toEqual(position)
    expect(requestDeviceCurrentPosition).toHaveBeenLastCalledWith({ requestPermission: true })
  })
  it('discards a late location result after logout and login even as the same user', async () => {
    let resolve!: (p: typeof position) => void
    vi.mocked(requestDeviceCurrentPosition).mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const store = useCampusMapStore(); store.attachUser(1)
    const pending = store.locate(); store.attachUser(null); store.attachUser(1)
    resolve(position); expect(await pending).toBeNull(); expect(store.position).toBeNull()
  })
})

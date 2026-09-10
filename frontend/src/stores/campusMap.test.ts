import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestDeviceCurrentPosition } from '@/utils/deviceGeolocation'
import { useCampusMapStore } from './campusMap'
vi.mock('@/utils/deviceGeolocation', () => ({ requestDeviceCurrentPosition: vi.fn(), getDeviceGeolocationErrorMessage: () => '定位失败，请重试' }))
const position = { latitude: 30.58, longitude: 114.32, accuracy: 10, source: 'browser' as const, locatedAt: '2026-09-10T06:00:00Z' }
beforeEach(() => { setActivePinia(createPinia()); vi.useFakeTimers(); vi.clearAllMocks() })
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
    const pending = store.locate(); expect(await store.locate()).toBeNull()
    await vi.advanceTimersByTimeAsync(22_000)
    expect(await pending).toBeNull(); expect(store.locating).toBe(false)
    expect(store.locationError).toContain('定位失败'); expect(requestDeviceCurrentPosition).toHaveBeenCalledTimes(1)
    vi.mocked(requestDeviceCurrentPosition).mockResolvedValue(position)
    expect(await store.locate()).toEqual(position); expect(store.locationError).toBe('')
  })
  it('discards a late location result after logout and login even as the same user', async () => {
    let resolve!: (p: typeof position) => void
    vi.mocked(requestDeviceCurrentPosition).mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const store = useCampusMapStore(); store.attachUser(1)
    const pending = store.locate(); store.attachUser(null); store.attachUser(1)
    resolve(position); expect(await pending).toBeNull(); expect(store.position).toBeNull()
  })
})

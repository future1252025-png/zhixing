import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { load, reset } from '@amap/amap-jsapi-loader'
vi.mock('@amap/amap-jsapi-loader', () => ({ load: vi.fn(), reset: vi.fn() }))
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers()
  vi.stubEnv('VITE_AMAP_KEY', 'test-key'); vi.stubEnv('VITE_AMAP_SERVICE_HOST', 'https://test.invalid/amap')
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
describe('map SDK loading', () => {
  it('clears the provider cached failure so retry can actually succeed', async () => {
    vi.mocked(load).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ Map: 'ready' })
    const { loadAMapSdk } = await import('./amap')
    await expect(loadAMapSdk()).rejects.toThrow('offline')
    expect(reset).toHaveBeenCalledTimes(1)
    expect(await loadAMapSdk()).toEqual({ Map: 'ready' })
  })
  it('bounds a stalled load without resetting maps that later become available', async () => {
    let resolve!: (v: any) => void
    vi.mocked(load).mockImplementation(() => new Promise(r => { resolve = r }))
    const { loadAMapSdk } = await import('./amap')
    const pending = expect(loadAMapSdk()).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(12_000); await pending
    resolve({ Map: 'late-ready' })
    expect(await loadAMapSdk()).toEqual({ Map: 'late-ready' })
    expect(reset).not.toHaveBeenCalled(); expect(load).toHaveBeenCalledTimes(1)
  })
  it('looks up native POI details without passing a map or rendering search pins', async () => {
    const PlaceSearch = vi.fn(function (this: any, _options: Record<string, unknown>) { this.getDetails = (id: string, callback: any) => callback('complete', { poiList: { pois: [{ id, name: '教4', location: { lng: 114.3, lat: 30.5 } }] } }) })
    vi.mocked(load).mockResolvedValue({ PlaceSearch } as any)
    const { getAMapPoiDetails } = await import('./amap')
    expect(await getAMapPoiDetails('B_TEST')).toEqual({ name: '教4', location: { lng: 114.3, lat: 30.5 } })
    expect(PlaceSearch.mock.calls[0]?.[0]).not.toHaveProperty('map')
  })
})

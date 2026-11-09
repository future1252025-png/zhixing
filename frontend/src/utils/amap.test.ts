import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { load, reset } from '@amap/amap-jsapi-loader'
vi.mock('@amap/amap-jsapi-loader', () => ({ load: vi.fn(), reset: vi.fn() }))
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers()
  vi.stubEnv('VITE_AMAP_KEY', 'test-key'); vi.stubEnv('VITE_AMAP_SERVICE_HOST', 'https://test.invalid/amap')
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
describe('map SDK loading', () => {
  it('reports missing browser configuration without contacting the SDK', async () => {
    vi.stubEnv('VITE_AMAP_KEY', '')
    const sdk = await import('./amap')
    expect(sdk.isAMapConfigured()).toBe(false)
    sdk.preloadAMapSdk()
    await expect(sdk.loadAMapSdk()).rejects.toThrow('missing')
    expect(load).not.toHaveBeenCalled()
  })
  it('uses the production proxy instead of exposing a legacy security code', async () => {
    vi.stubEnv('VITE_AMAP_SECURITY_CODE', 'legacy-test-secret')
    vi.mocked(load).mockResolvedValue({ Map: 'ready' })
    const sdk = await import('./amap')
    expect(sdk.isAMapConfigured()).toBe(true)
    await sdk.loadAMapSdk()
    expect(window._AMapSecurityConfig).toEqual({ serviceHost: 'https://test.invalid/amap' })
  })
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
  it.each([
    ['error', null], ['complete', { poiList: { pois: [{ id: 'other' }] } }], ['complete', {}]
  ])('does not match the wrong building when POI lookup fails: %s', async (status, result) => {
    const PlaceSearch = class { getDetails(_id: string, callback: any) { callback(status, result) } }
    vi.mocked(load).mockResolvedValue({ PlaceSearch } as any)
    expect(await (await import('./amap')).getAMapPoiDetails('expected')).toBeNull()
  })
  it('bounds a stalled POI search', async () => {
    vi.mocked(load).mockResolvedValue({ PlaceSearch: class { getDetails() {} } } as any)
    const pending = (await import('./amap')).getAMapPoiDetails('expected')
    await vi.advanceTimersByTimeAsync(6000)
    expect(await pending).toBeNull()
  })
  it('loads missing SDK plugins and reuses them for later calls', async () => {
    const sdk: any = { plugin: vi.fn((_name, callback) => { sdk.PlaceSearch = class {}; callback() }) }
    vi.mocked(load).mockResolvedValue(sdk)
    const { loadAMapPlugin } = await import('./amap')
    expect(await loadAMapPlugin('AMap.PlaceSearch')).toBe(sdk)
    expect(await loadAMapPlugin('AMap.PlaceSearch')).toBe(sdk)
    expect(sdk.plugin).toHaveBeenCalledOnce()
  })
  it('allows retry after a plugin callback fails to supply its constructor', async () => {
    const sdk: any = { plugin: vi.fn((_name, callback) => callback()) }
    vi.mocked(load).mockResolvedValue(sdk)
    const { loadAMapPlugin } = await import('./amap')
    await expect(loadAMapPlugin('AMap.PlaceSearch')).rejects.toThrow('unavailable')
    sdk.plugin.mockImplementation((_name: string, callback: () => void) => { sdk.PlaceSearch = class {}; callback() })
    expect(await loadAMapPlugin('AMap.PlaceSearch')).toBe(sdk)
  })
  it('bounds a plugin request that never calls back', async () => {
    vi.mocked(load).mockResolvedValue({ plugin: vi.fn() } as any)
    const pending = expect((await import('./amap')).loadAMapPlugin('AMap.PlaceSearch')).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(10_000)
    await pending
  })
  it('recovers an optional preload failure on the next visible map request', async () => {
    vi.mocked(load).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ Map: 'ready' })
    const sdk = await import('./amap')
    sdk.preloadAMapSdk()
    await vi.advanceTimersByTimeAsync(450)
    expect(await sdk.loadAMapSdk()).toEqual({ Map: 'ready' })
  })
  it.each([
    ['error', { message: '定位未授权' }, '定位未授权'],
    ['error', { info: '服务不可用' }, '服务不可用'],
    ['error', null, '高德定位失败'],
    ['complete', { position: null }, '缺少坐标'],
    ['complete', { position: { lng: NaN, lat: 30 } }, '缺少坐标']
  ])('handles denied, failed or invalid web locations: %s', async (status, result, message) => {
    const Geolocation = class { getCurrentPosition(callback: any) { callback(status, result) } }
    vi.mocked(load).mockResolvedValue({ Geolocation } as any)
    await expect((await import('./amap')).requestAMapCurrentPosition()).rejects.toThrow(message)
  })
  it.each([{ lng: 114.3, lat: 30.5 }, { getLng: () => 114.3, getLat: () => 30.5 }])('normalizes both SDK coordinate representations', async position => {
    const Geolocation = class { getCurrentPosition(callback: any) { callback('complete', { position }) } }
    vi.mocked(load).mockResolvedValue({ Geolocation } as any)
    const result = await (await import('./amap')).requestAMapCurrentPosition()
    expect(result.longitude).toBeGreaterThan(114)
    expect(result.latitude).toBeGreaterThan(30)
    expect(result.description).toBe('来自高德定位')
  })
})

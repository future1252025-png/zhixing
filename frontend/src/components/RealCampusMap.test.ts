import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { isAMapConfigured, loadAMapPlugin, loadAMapSdk } from '@/utils/amap'
import { wgs84ToGcj02 } from '@/utils/geo'
import RealCampusMap from './RealCampusMap.vue'

vi.mock('@/utils/amap', () => ({ isAMapConfigured: vi.fn(), loadAMapSdk: vi.fn(), loadAMapPlugin: vi.fn() }))
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
const events: Record<string, (event?: any) => void> = {}
const instance = { on: vi.fn((name, cb) => { events[name] = cb }), off: vi.fn(),
  add: vi.fn(), remove: vi.fn(), addControl: vi.fn(), destroy: vi.fn(),
  getCenter: vi.fn(() => ({ lng: 114.33, lat: 30.58 })), getZoom: vi.fn(() => 18),
  setZoomAndCenter: vi.fn(), setFitView: vi.fn() }
const sdk = { Map: vi.fn(function () { return instance }), Marker: vi.fn(),
  CircleMarker: vi.fn(function (options) { return { kind: 'position', options } }),
  Circle: vi.fn(function (options) { return { kind: 'accuracy', options } }),
  Scale: vi.fn(function () {}), ToolBar: vi.fn(function () {}) }
let wrapper: VueWrapper | undefined

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks()
  Object.keys(events).forEach(key => { delete events[key] })
  vi.mocked(isAMapConfigured).mockReturnValue(true)
  vi.mocked(loadAMapSdk).mockResolvedValue(sdk)
  vi.mocked(loadAMapPlugin).mockResolvedValue(sdk)
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.useRealTimers(); vi.unstubAllGlobals() })
async function render(props = {}) { wrapper = mount(RealCampusMap, { props }); await flushPromises(); return wrapper }

describe('native campus map', () => {
  it('uses the original map style and hotspot system with no building overlays', async () => {
    await render({ buildings: [{ id: 1, latitude: 30.58, longitude: 114.32 }] })
    expect(sdk.Map).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
      isHotspot: true, resizeEnable: true, mapStyle: 'amap://styles/normal', rotateEnable: false
    }))
    expect(sdk.Marker).not.toHaveBeenCalled(); expect(instance.add).not.toHaveBeenCalled()
  })
  it('uses the POI identity from the native event and suppresses the duplicate generic click', async () => {
    await render()
    events.click({ lnglat: { lng: 114.3, lat: 30.5 } })
    events.hotspotclick({ id: 'B000TEST', name: '四号教学楼', lnglat: { lng: 114.3, lat: 30.5 } })
    await vi.advanceTimersByTimeAsync(500)
    expect(wrapper!.emitted('poiClick')).toEqual([[{ id: 'B000TEST', name: '四号教学楼', coordinate: { longitude: 114.3, latitude: 30.5 } }]])
    expect(wrapper!.emitted('mapClick')).toBeUndefined()
  })
  it('also suppresses click when the hotspot event arrives first', async () => {
    await render()
    events.hotspotclick({ id: 'B000TEST', name: 'Library' })
    events.click({ lnglat: { lng: 114.3, lat: 30.5 } })
    await vi.advanceTimersByTimeAsync(300)
    expect(wrapper!.emitted('poiClick')).toHaveLength(1)
    expect(wrapper!.emitted('mapClick')).toBeUndefined()
  })
  it('passes plain SDK coordinates unchanged for explicit building candidates', async () => {
    await render()
    events.click({ lnglat: { getLng: () => 114.3, getLat: () => 30.5 } })
    await vi.advanceTimersByTimeAsync(250)
    expect(wrapper!.emitted('mapClick')).toEqual([[{ longitude: 114.3, latitude: 30.5 }]])
    expect(wrapper!.emitted('poiClick')).toBeUndefined()
  })
  it('ignores drag and pinch completion taps without refitting or recreating the map', async () => {
    await render()
    for (let i = 0; i < 5; i++) {
      events.zoomstart()
      events.hotspotclick({ id: 'B000TEST' })
      events.zoomend()
      events.click({ lnglat: { lng: 114.3, lat: 30.5 } })
      await vi.advanceTimersByTimeAsync(300)
    }
    await wrapper!.setProps({ buildings: [{ id: 3, latitude: 30.5, longitude: 114.3 }] as any, activeBuildingId: 3, camera: { center: [114.3, 30.5], zoom: 10 } })
    expect(wrapper!.emitted('poiClick')).toBeUndefined()
    expect(wrapper!.emitted('mapClick')).toBeUndefined()
    expect(instance.setFitView).not.toHaveBeenCalled()
    expect(instance.setZoomAndCenter).not.toHaveBeenCalled()
    expect(sdk.Map).toHaveBeenCalledTimes(1)
    expect(wrapper!.emitted('cameraChange')).toHaveLength(6)
  })
  it('restores a saved camera without adding a selection marker', async () => {
    await render({ camera: { center: [114.31, 30.57], zoom: 19 } })
    expect(sdk.Map).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ center: [114.31, 30.57], zoom: 19 }))
    expect(sdk.Marker).not.toHaveBeenCalled()
  })
  it('draws only user location, converting GPS once, and does not recenter on a location update', async () => {
    await render()
    await wrapper!.setProps({ position: { latitude: 30.58, longitude: 114.32, accuracy: 15, locatedAt: new Date().toISOString(), source: 'browser' } })
    expect(sdk.CircleMarker).toHaveBeenCalledWith(expect.objectContaining({ center: wgs84ToGcj02(30.58, 114.32) }))
    expect(sdk.Circle).toHaveBeenCalledTimes(1)
    expect(sdk.Marker).not.toHaveBeenCalled()
    expect(instance.setZoomAndCenter).not.toHaveBeenCalled()
    await wrapper!.setProps({ position: null })
    expect(instance.remove).toHaveBeenCalled()
  })
  it('makes the mini map non-draggable and still emits tap-to-expand', async () => {
    await render({ interactive: false })
    expect(sdk.Map).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ isHotspot: false, dragEnable: false, zoomEnable: false, scrollWheel: false }))
    expect(loadAMapPlugin).not.toHaveBeenCalled()
    events.click({ lnglat: { lng: 114.3, lat: 30.5 } })
    await vi.advanceTimersByTimeAsync(250)
    expect(wrapper!.emitted('mapClick')).toHaveLength(1)
  })
  it('does not construct after unmount while the SDK is pending', async () => {
    const pending = deferred<any>(); vi.mocked(loadAMapSdk).mockReturnValue(pending.promise)
    wrapper = mount(RealCampusMap); wrapper.unmount(); wrapper = undefined
    pending.resolve(sdk); await flushPromises()
    expect(sdk.Map).not.toHaveBeenCalled()
  })
  it('remembers a building selected while the SDK is still loading', async () => {
    const pending = deferred<any>(); vi.mocked(loadAMapSdk).mockReturnValue(pending.promise)
    await render({ camera: { center: [114.31, 30.57], zoom: 16 } })
    ;(wrapper!.vm as any).focusCoordinate({ longitude: 114.3346, latitude: 30.579 }, 18)
    pending.resolve(sdk); await flushPromises()
    expect(sdk.Map).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ center: [114.3346, 30.579], zoom: 18 }))
  })
  it('cleans events and ignores late controls and pending taps after unmount', async () => {
    const pending = deferred<any>(); vi.mocked(loadAMapPlugin).mockReturnValue(pending.promise)
    await render(); events.click({ lnglat: { lng: 114.3, lat: 30.5 } })
    const mounted = wrapper!; mounted.unmount(); wrapper = undefined
    pending.resolve(sdk); await flushPromises(); await vi.advanceTimersByTimeAsync(500)
    expect(instance.destroy).toHaveBeenCalledTimes(1); expect(instance.off).toHaveBeenCalled()
    expect(instance.addControl).not.toHaveBeenCalled(); expect(mounted.emitted('mapClick')).toBeUndefined()
  })
  it('offers retry when loading fails and recovers', async () => {
    vi.mocked(loadAMapSdk).mockRejectedValueOnce(new Error('offline'))
    await render()
    expect(wrapper!.text()).toContain('地图暂时打不开')
    await wrapper!.get('button').trigger('click'); await flushPromises()
    expect(wrapper!.text()).not.toContain('地图暂时打不开')
    expect(sdk.Map).toHaveBeenCalledTimes(1)
  })
  it('defers the home mini map until it is near the viewport', async () => {
    let intersect!: (entries: any[]) => void
    const disconnect = vi.fn()
    vi.stubGlobal('IntersectionObserver', class { constructor(cb: any) { intersect = cb } observe() {} disconnect = disconnect })
    await render({ lazy: true })
    expect(loadAMapSdk).not.toHaveBeenCalled()
    intersect([{ isIntersecting: true }]); await flushPromises()
    expect(loadAMapSdk).toHaveBeenCalledTimes(1); expect(disconnect).toHaveBeenCalled()
  })
})

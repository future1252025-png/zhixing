import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useMapAutoLocation } from './useMapAutoLocation'

const mocks = vi.hoisted(() => ({ ensure: vi.fn(), remove: vi.fn(), callback: null as null | ((event: { isActive: boolean }) => void) }))
vi.mock('@/stores/campusMap', () => ({ MAP_LOCATION_FRESH_MS: 60_000, useCampusMapStore: () => ({ ensurePosition: mocks.ensure }) }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(async (_name, callback) => {
  mocks.callback = callback
  return { remove: mocks.remove }
}) } }))
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks() })
afterEach(() => { vi.useRealTimers() })

it('locates on entry and foreground resume, refreshes while visible, and stops on exit', async () => {
  const wrapper = mount(defineComponent({ setup() { useMapAutoLocation(); return {} }, template: '<div />' }))
  await flushPromises()
  expect(mocks.ensure).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(mocks.ensure).toHaveBeenCalledTimes(2)
  mocks.callback!({ isActive: false })
  await vi.advanceTimersByTimeAsync(60_000)
  expect(mocks.ensure).toHaveBeenCalledTimes(2)
  mocks.callback!({ isActive: true })
  expect(mocks.ensure).toHaveBeenCalledTimes(3)
  document.dispatchEvent(new Event('visibilitychange'))
  expect(mocks.ensure).toHaveBeenCalledTimes(4)
  wrapper.unmount()
  await vi.advanceTimersByTimeAsync(120_000)
  document.dispatchEvent(new Event('visibilitychange'))
  expect(mocks.ensure).toHaveBeenCalledTimes(4)
  expect(mocks.remove).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})

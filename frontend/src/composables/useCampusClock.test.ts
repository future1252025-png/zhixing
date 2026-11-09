import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCampusClock } from './useCampusClock'

const native = vi.hoisted(() => ({ callback: null as null | ((event: { isActive: boolean }) => void), remove: vi.fn() }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(async (_name, callback) => {
  native.callback = callback
  return { remove: native.remove }
}) } }))

describe('useCampusClock', () => {
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })
  it('ticks at the exact minute, updates on native/browser resume, and cleans up', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-07T06:09:59Z'))
    const wrapper = mount(defineComponent({ setup: () => ({ now: useCampusClock() }), template: '<time>{{ now.toISOString() }}</time>' }))
    await flushPromises()
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.text()).toBe('2026-09-07T06:10:00.000Z')
    vi.setSystemTime(new Date('2026-09-07T07:40:00Z'))
    native.callback!({ isActive: true })
    await flushPromises()
    expect(wrapper.text()).toBe('2026-09-07T07:40:00.000Z')
    vi.setSystemTime(new Date('2026-09-14T06:09:00Z'))
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(wrapper.text()).toBe('2026-09-14T06:09:00.000Z')
    wrapper.unmount()
    expect(native.remove).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
})

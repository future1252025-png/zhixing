import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import WebUpdateNotice from './WebUpdateNotice.vue'

const mocks = vi.hoisted(() => ({ native: false, remove: vi.fn(), onError: vi.fn() }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => mocks.native } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ onError: mocks.onError }) }))
beforeEach(() => { mocks.native = false; mocks.onError.mockReturnValue(mocks.remove) })
afterEach(() => vi.clearAllMocks())

it('offers a recoverable refresh without automatically discarding the current form', async () => {
  const wrapper = mount(WebUpdateNotice)
  const failure = new Event('vite:preloadError', { cancelable: true })
  window.dispatchEvent(failure)
  await wrapper.vm.$nextTick()
  expect(failure.defaultPrevented).toBe(true)
  expect(wrapper.get('[role="alert"]').text()).toContain('未保存的内容会丢失')
  expect(wrapper.text()).toContain('刷新页面')
  await wrapper.findAll('button')[1]!.trigger('click')
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  wrapper.unmount()
  expect(mocks.remove).toHaveBeenCalledOnce()
})

it('handles Safari module loading errors but not unrelated route errors', async () => {
  const wrapper = mount(WebUpdateNotice)
  const handler = mocks.onError.mock.calls[0]![0]
  handler(new Error('unrelated'))
  await wrapper.vm.$nextTick()
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  handler(new Error('Importing a module script failed'))
  await wrapper.vm.$nextTick()
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  wrapper.unmount()
})

it('does not install website update handling in the native app', async () => {
  mocks.native = true
  const wrapper = mount(WebUpdateNotice)
  window.dispatchEvent(new Event('vite:preloadError'))
  await wrapper.vm.$nextTick()
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  expect(mocks.onError).not.toHaveBeenCalled()
  wrapper.unmount()
})

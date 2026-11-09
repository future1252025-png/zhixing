import { flushPromises, mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import NotificationSettingsPage from './NotificationSettingsPage.vue'

const mocks = vi.hoisted(() => ({ store: {} as any, auth: {} as any, ready: {} as any,
  status: vi.fn(), open: vi.fn(), load: vi.fn(), check: vi.fn(), enable: vi.fn(), exact: vi.fn(),
  test: vi.fn(), fail: vi.fn(), success: vi.fn(), pause: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ back: vi.fn(), replace: vi.fn() }) }))
vi.mock('vant', () => ({ showFailToast: mocks.fail, showSuccessToast: mocks.success }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('@/stores/reminders', () => ({ useRemindersStore: () => mocks.store }))
vi.mock('@/native/reminderSettings', () => ({ reminderBackgroundStatus: mocks.status, openReminderBackgroundSettings: mocks.open }))
vi.mock('@/services/reminderNotifications', () => ({ openExactReminderSettings: mocks.exact, testReminderNotification: mocks.test }))
vi.mock('@/composables/useReminderDevice', () => ({ useReminderDevice: () => ({ capabilityReady: mocks.ready,
  permissionBusy: ref(false), permissionError: ref(''), enableDevice: mocks.enable, checkCapability: mocks.check }) }))

const wrappers: ReturnType<typeof mount>[] = []
const page = () => { const wrapper = mount(NotificationSettingsPage, { global: { stubs: { VanNavBar: true } } }); wrappers.push(wrapper); return wrapper }
const click = async (wrapper: ReturnType<typeof mount>, name: string) => {
  await wrapper.findAll('button').find(button => button.text() === name)!.trigger('click')
  await flushPromises()
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth = { currentUser: { id: 12 } }; mocks.ready = ref(true)
  mocks.store = reactive({ capability: { platform: 'web', permission: 'granted', exact: false }, deviceEnabled: true,
    scheduleError: '', scheduling: false, scheduledCount: 2, coverageUntil: '', truncated: false, loading: false,
    saving: false, error: '', load: mocks.load, setDeviceEnabled: mocks.pause })
  mocks.status.mockResolvedValue(null); mocks.load.mockResolvedValue(undefined)
  mocks.check.mockResolvedValue(undefined); mocks.test.mockResolvedValue(undefined); mocks.exact.mockResolvedValue(undefined)
})
afterEach(() => { for (const wrapper of wrappers.splice(0)) wrapper.unmount() })

it.each([
  ['unsupported', false, '当前浏览器不支持通知'], ['denied', false, '通知权限尚未允许'],
  ['granted', false, '本机通知已暂停'], ['granted', true, '网页通知已开启']
])('reports browser permission %s / enabled %s without offering Android controls', async (permission, enabled, label) => {
  mocks.store.capability.permission = permission; mocks.store.deviceEnabled = enabled
  const wrapper = page(); await flushPromises()
  expect(wrapper.get('h1').text()).toBe(label)
  expect(wrapper.text()).toContain('关闭后无法提醒')
  expect(wrapper.find('[aria-label="后台提醒检查"]').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('退出后台测试 · 1 分钟')
})

it('shows loading, scheduling and errors as state changes, then allows resync', async () => {
  mocks.ready.value = false
  const wrapper = page(); await flushPromises()
  expect(wrapper.get('h1').text()).toBe('正在检查通知权限')
  mocks.ready.value = true; mocks.store.scheduling = true
  await flushPromises(); expect(wrapper.get('h1').text()).toBe('正在安排本机通知')
  mocks.store.scheduling = false; mocks.store.scheduleError = '重试安排'; mocks.store.error = '网络断开'
  await flushPromises(); expect(wrapper.get('h1').text()).toBe('本机通知需要检查')
  expect(wrapper.findAll('[role="alert"]').map(item => item.text())).toContain('网络断开')
  await click(wrapper, '重新同步')
  expect(mocks.load).toHaveBeenCalledWith(12, true)
  expect(mocks.check).toHaveBeenCalled()
})

it('delegates enable and pause to the existing permission flow', async () => {
  mocks.store.deviceEnabled = false
  const wrapper = page(); await flushPromises()
  await click(wrapper, '开启本机通知'); expect(mocks.enable).toHaveBeenCalledOnce()
  mocks.store.deviceEnabled = true; await flushPromises()
  await click(wrapper, '暂停本机通知'); expect(mocks.pause).toHaveBeenCalledWith(false)
  await click(wrapper, '发送测试提醒'); expect(mocks.test).toHaveBeenCalledWith(5)
  expect(mocks.success).toHaveBeenCalledWith('已发送测试提醒')
})

it('diagnoses Android restrictions and preserves separate exact-alarm permission', async () => {
  mocks.store.capability.platform = 'android'; mocks.store.coverageUntil = '2026-10-20T09:00:00+08:00'
  mocks.status.mockResolvedValue({ manufacturer: 'Xiaomi', batteryOptimized: true, backgroundRestricted: true })
  const wrapper = page(); await flushPromises()
  expect(wrapper.get('h1').text()).toBe('已开启 · 时间可能延迟')
  expect(wrapper.text()).toContain('系统已限制智行后台运行')
  expect(wrapper.text()).toContain('省电策略设为“不限制”')
  await click(wrapper, '设置准时提醒'); expect(mocks.exact).toHaveBeenCalledOnce()
  await click(wrapper, '退出后台测试 · 1 分钟'); expect(mocks.test).toHaveBeenCalledWith(60)
  await click(wrapper, '发送测试提醒'); expect(mocks.test).toHaveBeenCalledWith(5)
  await click(wrapper, '打开应用设置'); expect(mocks.open).toHaveBeenCalledWith('app')
  await click(wrapper, '检查省电设置'); expect(mocks.open).toHaveBeenCalledWith('battery')
  mocks.store.capability.exact = true; await flushPromises()
  expect(wrapper.get('h1').text()).toBe('本机提醒已开启')
  expect(wrapper.text()).not.toContain('设置准时提醒')
})

it('recovers background status after returning from settings and reports setting failures', async () => {
  mocks.store.capability.platform = 'android'
  mocks.status.mockRejectedValueOnce(new Error('unavailable'))
  const wrapper = page(); await flushPromises()
  expect(wrapper.text()).toContain('暂时无法读取后台设置')
  mocks.status.mockResolvedValue({ manufacturer: 'test', batteryOptimized: false, backgroundRestricted: false })
  window.dispatchEvent(new Event('focus')); await flushPromises()
  expect(wrapper.text()).not.toContain('暂时无法读取后台设置')
  mocks.open.mockRejectedValue(new Error('unavailable'))
  await click(wrapper, '打开应用设置')
  expect(mocks.fail).toHaveBeenCalledWith('请在系统设置中打开智行的应用信息')
  mocks.exact.mockRejectedValue(new Error('unavailable'))
  await click(wrapper, '设置准时提醒')
  expect(mocks.fail).toHaveBeenCalledWith('请到系统设置 → 智行 → 闹钟和提醒中开启')
  mocks.test.mockRejectedValue(new Error('通知不可用'))
  await click(wrapper, '发送测试提醒'); expect(mocks.fail).toHaveBeenCalledWith('通知不可用')
  mocks.test.mockRejectedValue('unknown')
  await click(wrapper, '发送测试提醒'); expect(mocks.fail).toHaveBeenCalledWith('测试提醒失败')
})

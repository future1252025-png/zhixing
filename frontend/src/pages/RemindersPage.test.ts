import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import { Dialog } from 'vant'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Course } from '@/types/course'
import { emptyReminderPlan } from '@/utils/reminders'
import RemindersPage from './RemindersPage.vue'
import NotificationSettingsPage from './NotificationSettingsPage.vue'
import ReminderRuntime from '@/components/ReminderRuntime.vue'

const mock = vi.hoisted(() => ({ auth: null as any, courses: null as any, semester: null as any,
  reminders: null as any, capability: vi.fn(), sync: vi.fn(), tick: vi.fn() }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => mock.auth }))
vi.mock('@/stores/courses', () => ({ useCoursesStore: () => mock.courses }))
vi.mock('@/stores/semester', () => ({ useSemesterStore: () => mock.semester }))
vi.mock('@/stores/reminders', () => ({ useRemindersStore: () => mock.reminders }))
vi.mock('vue-router', () => ({ useRoute: () => ({ fullPath: '/reminders', query: {} }), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } }))
vi.mock('@/utils/keyboardInset', () => ({ useKeyboardAwarePage: () => ({ pageStyle: {}, onFieldFocus: vi.fn() }) }))
vi.mock('@/native/reminderSettings', () => ({ reminderBackgroundStatus: vi.fn(async () => null), openReminderBackgroundSettings: vi.fn() }))
vi.mock('@/services/reminderNotifications', () => ({
  reminderCapability: mock.capability, syncDeviceReminders: mock.sync, tickWebReminders: mock.tick,
  openExactReminderSettings: vi.fn(), testReminderNotification: vi.fn(), listenNativeReminderClicks: vi.fn()
}))
const capability = { platform: 'web', permission: 'granted', exact: false }
const courses = [
  { id: 1, course_name: '今天的思想概论', weekday: 1, weeks: '1-16', start_time: '14:30', end_time: '16:10',
    source_location: '教4-409', building: null, room_name: '' },
  { id: 2, course_name: '明天的 JAVA', weekday: 2, weeks: '1-16', start_time: '15:55', end_time: '17:35',
    source_location: '教4-503', building: null, room_name: '' },
  { id: 3, course_name: '周三的算法', weekday: 3, weeks: '1-16', start_time: '08:00', end_time: '09:40',
    source_location: '教4-410', building: null, room_name: '' }
] as Course[]
let page: VueWrapper | undefined
let runtime: VueWrapper | undefined
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-07T14:09:00+08:00'))
  const plan = emptyReminderPlan()
  plan.course_settings.enabled = true
  mock.auth = reactive({ currentUser: { id: 1 } })
  mock.courses = reactive({ courses: [...courses], loaded: true, errorMessage: '', invalidate: vi.fn(),
    ensureLoaded: vi.fn(async () => { mock.courses.courses = [...courses] }) })
  mock.semester = reactive({ semester: { start_date: '2026-08-31', total_weeks: 20, current_week: 19 },
    loadedForUserId: 1, load: vi.fn(async () => {}) })
  mock.reminders = reactive({ plan, userId: 1, loaded: true, loading: false, saving: false, error: '',
    capability: { ...capability, permission: 'prompt' }, deviceEnabled: false, devicePreferenceSet: true,
    permissionPromptDismissed: false, scheduling: false,
    scheduleError: '', truncated: false, scheduledCount: 0, coverageUntil: '',
    load: vi.fn(async () => {}), reset: vi.fn(),
    setDeviceEnabled: vi.fn((value: boolean) => { mock.reminders.deviceEnabled = value; mock.reminders.devicePreferenceSet = true }) })
  mock.capability.mockResolvedValue({ ...capability })
  mock.sync.mockResolvedValue({ capability, count: 0, until: '', truncated: false })
})
afterEach(() => {
  page?.unmount(); runtime?.unmount()
  page = undefined; runtime = undefined
  vi.useRealTimers()
})
async function mountPage() {
  page = mount(RemindersPage, { global: { components: { 'van-dialog': Dialog },
    stubs: { teleport: true, 'van-nav-bar': true, RouterLink: { template: '<a><slot /></a>' } } } })
  await flushPromises()
  return page
}
it('keeps entrance surfaces mounted while reminders load and refresh', async () => {
  mock.reminders.loaded = false
  mock.reminders.loading = true
  mock.reminders.load.mockImplementation(() => new Promise(() => {}))
  const wrapper = await mountPage()
  const surfaces = wrapper.findAll('.reminder-arrive').map(node => node.element)
  expect(surfaces).toHaveLength(4)
  expect(wrapper.get('.bell-art').attributes('aria-hidden')).toBe('true')
  mock.reminders.loaded = true
  mock.reminders.loading = false
  mock.reminders.plan.course_settings.enabled = false
  await flushPromises()
  expect(wrapper.findAll('.reminder-arrive').map(node => node.element)).toEqual(surfaces)
})
it.each([false, true])('opens the editor without waiting for entrance motion (reduced motion: %s)', async reduceMotion => {
  const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
  const scroll = vi.fn()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll })
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  const preference = vi.spyOn(window, 'matchMedia').mockReturnValue({ ...media, matches: reduceMotion })
  try {
    const wrapper = await mountPage()
    await wrapper.get('[data-testid="new-reminder"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('form[aria-label="编辑提醒"]').exists()).toBe(true)
    expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: 'start', behavior: reduceMotion ? 'instant' : 'smooth' })
    await wrapper.get('[aria-label="关闭提醒编辑"]').trigger('click')
    expect(wrapper.find('.reminder-editor').exists()).toBe(false)
  } finally {
    preference.mockRestore()
    if (originalScroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScroll)
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  }
})
it('removes the device card and keeps only the daily course tip for authorized users', async () => {
  const wrapper = await mountPage()
  expect(wrapper.find('.device-notice').exists()).toBe(false)
  expect(wrapper.find('.reminder-help').exists()).toBe(false)
  expect(wrapper.getComponent(Dialog).props('show')).toBe(false)
  expect(wrapper.get('.course-daily-tip').text()).toBe('保持网页打开，接收今天的课程提醒。')
  expect(wrapper.findAll('.course-reminder-panel .panel-tip')).toHaveLength(1)
  mock.reminders.plan.course_settings.enabled = false
  await flushPromises()
  expect(wrapper.find('.course-daily-tip').exists()).toBe(false)
})
it.each([
  { permission: 'granted', exact: false, prompt: false },
  { permission: 'granted', exact: true, prompt: false },
  { permission: 'prompt', exact: false, prompt: true },
  { permission: 'denied', exact: false, prompt: true },
  { permission: 'unsupported', exact: false, prompt: false }
])('only offers permission for $permission / exact=$exact', async ({ permission, exact, prompt }) => {
  mock.capability.mockResolvedValue({ platform: 'android', permission, exact })
  const wrapper = await mountPage()
  expect(wrapper.get('.course-daily-tip').text()).toBe('列表只看今天；已安排的通知由手机系统执行。')
  expect(wrapper.getComponent(Dialog).props('show')).toBe(prompt)
  expect(mock.capability).not.toHaveBeenCalledWith(true)
  expect(wrapper.find('.device-notice').exists()).toBe(false)
})
it('waits for the actual permission result before prompting, and keeps explicit pauses', async () => {
  let resolve!: (value: unknown) => void
  mock.capability.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const wrapper = await mountPage()
  expect(wrapper.getComponent(Dialog).props('show')).toBe(false)
  resolve(capability)
  await flushPromises()
  expect(wrapper.getComponent(Dialog).props('show')).toBe(false)
  expect(mock.reminders.deviceEnabled).toBe(false)
  expect(wrapper.text()).toContain('本机通知已暂停')
})
it('uses an existing OS grant on first use without overriding an explicit local preference', async () => {
  mock.reminders.devicePreferenceSet = false
  const wrapper = await mountPage()
  expect(mock.reminders.deviceEnabled).toBe(true)
  expect(wrapper.getComponent(Dialog).props('show')).toBe(false)
  expect(mock.capability).not.toHaveBeenCalledWith(true)
})
it('does not keep prompting after dismissal during the same session', async () => {
  mock.capability.mockResolvedValue({ ...capability, permission: 'prompt' })
  const wrapper = await mountPage()
  expect(wrapper.getComponent(Dialog).props('show')).toBe(true)
  expect(await wrapper.getComponent(Dialog).props('beforeClose')!('cancel')).toBe(true)
  wrapper.unmount(); page = undefined
  const reopened = await mountPage()
  expect(reopened.getComponent(Dialog).props('show')).toBe(false)
  expect(mock.capability).not.toHaveBeenCalledWith(true)
})
it('keeps scheduling errors and partial-coverage warnings without restoring the card', async () => {
  mock.reminders.scheduleError = '本机通知安排失败，请重试'
  mock.reminders.truncated = true
  mock.reminders.deviceEnabled = true
  mock.reminders.scheduledCount = 400
  mock.reminders.coverageUntil = '2026-09-08T12:00:00+08:00'
  const wrapper = await mountPage()
  const alerts = wrapper.findAll('[role="alert"]')
  expect(alerts).toHaveLength(2)
  expect(alerts[0]!.text()).toContain('安排失败')
  expect(alerts[1]!.text()).toContain('最近 400 条')
  expect(alerts.every(alert => !alert.element.closest('details'))).toBe(true)
  expect(alerts[1]!.text()).toContain('9/8')
})

it('shows only today’s actual course time despite a different browsing/current-week snapshot', async () => {
  const wrapper = await mountPage()
  const list = wrapper.get('.next-reminders')
  expect(list.text()).toContain('今天的思想概论')
  expect(list.text()).toContain('14:20')
  expect(list.text()).toContain('14:30–16:10')
  expect(list.text()).not.toContain('明天的 JAVA')
  expect(list.text()).not.toContain('周三的算法')
  vi.setSystemTime(new Date('2026-09-07T18:00:00+08:00'))
  window.dispatchEvent(new Event('focus'))
  await flushPromises()
  expect(wrapper.findAll('.next-reminders li')).toHaveLength(0)
})
it('switches both the visible list and device reconciliation at Beijing midnight', async () => {
  vi.setSystemTime(new Date('2026-09-07T23:59:00+08:00'))
  runtime = mount(ReminderRuntime)
  const wrapper = await mountPage()
  expect(wrapper.findAll('.next-reminders li')).toHaveLength(0)
  mock.sync.mockClear()
  await vi.advanceTimersByTimeAsync(60_000)
  await flushPromises()
  expect(wrapper.get('.next-reminders').text()).toContain('明天的 JAVA')
  expect(wrapper.get('.next-reminders').text()).not.toContain('周三的算法')
  expect(mock.sync).toHaveBeenCalled()
  const dates = mock.sync.mock.calls.at(-1)![1].map((item: any) => item.date)
  expect(dates).toEqual(['2026-09-08'])
})
it('only warns about missing clocks on today’s active courses', async () => {
  mock.courses.courses = [
    { ...courses[0], start_time: null, end_time: null },
    { ...courses[1], start_time: null, end_time: null }
  ]
  mock.courses.ensureLoaded.mockResolvedValue(undefined)
  const wrapper = await mountPage()
  expect(wrapper.get('.course-reminder-panel').text()).toContain('今天有 1 门课程需要补全')
  expect(wrapper.get('.course-reminder-panel').text()).not.toContain('今天有 2 门课程')
})
it('refreshes cached daily alarms after background suspension without waiting for the server', async () => {
  runtime = mount(ReminderRuntime)
  await flushPromises()
  mock.sync.mockClear()
  mock.reminders.load.mockImplementation(() => new Promise(() => {}))
  vi.setSystemTime(new Date('2026-09-09T07:00:00+08:00'))
  document.dispatchEvent(new Event('visibilitychange'))
  await flushPromises()
  expect(mock.sync).toHaveBeenCalled()
  expect(mock.sync.mock.calls.at(-1)![1].map((item: any) => item.date)).toEqual(['2026-09-09'])
})
it('releases the permission button on failure, keeps an error visible, and allows retry', async () => {
  mock.capability.mockResolvedValueOnce({ ...capability, permission: 'prompt' })
  const wrapper = await mountPage()
  mock.capability.mockRejectedValueOnce(new Error('通知授权尚未完成，请重试'))
  expect(await wrapper.getComponent(Dialog).props('beforeClose')!('confirm')).toBe(false)
  await flushPromises()
  expect(wrapper.getComponent(Dialog).props('confirmButtonDisabled')).toBe(false)
  expect(wrapper.get('[role="alert"]').text()).toContain('通知授权尚未完成')
  expect(mock.reminders.deviceEnabled).toBe(false)
  expect(await wrapper.getComponent(Dialog).props('beforeClose')!('confirm')).toBe(true)
  await flushPromises()
  expect(mock.reminders.deviceEnabled).toBe(true)
  expect(wrapper.getComponent(Dialog).props('show')).toBe(false)
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
})
it('allows notification authorization even while loading rules offline and handles denial', async () => {
  mock.reminders.loaded = false
  mock.reminders.load.mockImplementation(() => new Promise(() => {}))
  mock.capability.mockResolvedValueOnce({ ...capability, permission: 'prompt' })
  const wrapper = await mountPage()
  expect(wrapper.getComponent(Dialog).props('confirmButtonDisabled')).toBe(false)
  mock.capability.mockResolvedValueOnce({ ...capability, permission: 'denied' })
  expect(await wrapper.getComponent(Dialog).props('beforeClose')!('confirm')).toBe(false)
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('尚未获得通知权限')
  expect(mock.reminders.deviceEnabled).toBe(false)
})
it('does not enable notifications for another account if the user changes during authorization', async () => {
  mock.capability.mockResolvedValueOnce({ ...capability, permission: 'prompt' })
  const wrapper = await mountPage()
  let grant!: (value: unknown) => void
  mock.capability.mockImplementationOnce(() => new Promise(resolve => { grant = resolve }))
  const request = wrapper.getComponent(Dialog).props('beforeClose')!('confirm')
  await flushPromises()
  expect(wrapper.getComponent(Dialog).props('confirmButtonDisabled')).toBe(true)
  mock.reminders.userId = 2
  grant(capability)
  await request
  await flushPromises()
  expect(mock.reminders.deviceEnabled).toBe(false)
  expect(wrapper.getComponent(Dialog).props('confirmButtonDisabled')).toBe(false)
})

it('keeps advanced controls in the separate notification settings page', async () => {
  mock.capability.mockResolvedValue({ platform: 'android', permission: 'granted', exact: false })
  mock.reminders.deviceEnabled = true
  page = mount(NotificationSettingsPage, { global: { stubs: { 'van-nav-bar': true } } })
  await flushPromises()
  expect(page.get('.device-actions').text()).toContain('设置准时提醒')
  expect(page.get('details').attributes('open')).toBeUndefined()
  expect(page.text()).toContain('Android 8')
  await page.get('.device-actions button').trigger('click')
  expect(mock.reminders.deviceEnabled).toBe(false)
  await page.get('.device-actions button').trigger('click')
  await flushPromises()
  expect(mock.reminders.deviceEnabled).toBe(true)
})

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Course } from '@/types/course'
import { emptyReminderPlan } from '@/utils/reminders'
import RemindersPage from './RemindersPage.vue'
import ReminderRuntime from '@/components/ReminderRuntime.vue'

const mock = vi.hoisted(() => ({ auth: null as any, courses: null as any, semester: null as any,
  reminders: null as any, capability: vi.fn(), sync: vi.fn(), tick: vi.fn() }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => mock.auth }))
vi.mock('@/stores/courses', () => ({ useCoursesStore: () => mock.courses }))
vi.mock('@/stores/semester', () => ({ useSemesterStore: () => mock.semester }))
vi.mock('@/stores/reminders', () => ({ useRemindersStore: () => mock.reminders }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } }))
vi.mock('@/utils/keyboardInset', () => ({ useKeyboardAwarePage: () => ({ pageStyle: {}, onFieldFocus: vi.fn() }) }))
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
    capability: { ...capability, permission: 'prompt' }, deviceEnabled: false, scheduling: false,
    scheduleError: '', truncated: false, scheduledCount: 0, coverageUntil: '',
    load: vi.fn(async () => {}), reset: vi.fn(),
    setDeviceEnabled: vi.fn((value: boolean) => { mock.reminders.deviceEnabled = value }) })
  mock.capability.mockResolvedValue({ ...capability })
  mock.sync.mockResolvedValue({ capability, count: 0, until: '', truncated: false })
})
afterEach(() => {
  page?.unmount(); runtime?.unmount()
  page = undefined; runtime = undefined
  vi.useRealTimers()
})
async function mountPage() {
  page = mount(RemindersPage, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
  await flushPromises()
  return page
}
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
  const wrapper = await mountPage()
  mock.capability.mockRejectedValueOnce(new Error('通知授权尚未完成，请重试'))
  await wrapper.get('.device-actions button').trigger('click')
  await flushPromises()
  expect(wrapper.get('.device-actions button').attributes('disabled')).toBeUndefined()
  expect(wrapper.get('.device-notice [role="alert"]').text()).toContain('通知授权尚未完成')
  expect(mock.reminders.deviceEnabled).toBe(false)
  await wrapper.get('.device-actions button').trigger('click')
  await flushPromises()
  expect(mock.reminders.deviceEnabled).toBe(true)
  expect(wrapper.find('.device-notice [role="alert"]').exists()).toBe(false)
})
it('allows notification authorization even while loading rules offline and handles denial', async () => {
  mock.reminders.loaded = false
  mock.reminders.load.mockImplementation(() => new Promise(() => {}))
  const wrapper = await mountPage()
  expect(wrapper.get('.device-actions button').attributes('disabled')).toBeUndefined()
  mock.capability.mockResolvedValueOnce({ ...capability, permission: 'denied' })
  await wrapper.get('.device-actions button').trigger('click')
  await flushPromises()
  expect(wrapper.get('.device-notice [role="alert"]').text()).toContain('尚未获得通知权限')
  expect(mock.reminders.deviceEnabled).toBe(false)
})
it('does not enable notifications for another account if the user changes during authorization', async () => {
  const wrapper = await mountPage()
  let grant!: (value: unknown) => void
  mock.capability.mockImplementationOnce(() => new Promise(resolve => { grant = resolve }))
  await wrapper.get('.device-actions button').trigger('click')
  expect(wrapper.get('.device-actions button').attributes('disabled')).toBeDefined()
  mock.reminders.userId = 2
  grant(capability)
  await flushPromises()
  expect(mock.reminders.deviceEnabled).toBe(false)
  expect(wrapper.get('.device-actions button').attributes('disabled')).toBeUndefined()
})

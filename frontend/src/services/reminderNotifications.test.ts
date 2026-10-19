import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ReminderOccurrence } from '@/types/reminder'

const mock = vi.hoisted(() => ({ platform: 'android', permission: 'granted', exact: 'granted',
  pending: [] as any[], delivered: [] as any[],
  schedule: vi.fn(), cancel: vi.fn(), removeDelivered: vi.fn(), requestPermissions: vi.fn(),
  checkPermissions: vi.fn(), checkExact: vi.fn(), pluginThen: vi.fn(), addListener: vi.fn() }))
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => mock.platform } }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: new Proxy({
  checkPermissions: mock.checkPermissions, requestPermissions: mock.requestPermissions,
  checkExactNotificationSetting: mock.checkExact,
  getPending: async () => ({ notifications: mock.pending }), schedule: mock.schedule, cancel: mock.cancel,
  getDeliveredNotifications: async () => ({ notifications: mock.delivered }), removeDeliveredNotifications: mock.removeDelivered,
  addListener: mock.addListener
}, { get: (target, key) => key === 'then' ? mock.pluginThen : Reflect.get(target, key) }) }))
const OWNER = 'campusmind-reminders'
const occurrence = (changes: Partial<ReminderOccurrence> = {}): ReminderOccurrence => ({
  key: 'item-one-2026-09-07', item_id: 'one', kind: 'custom', title: '交作业', body: '请检查附件',
  at: '2026-09-07T14:30:00+08:00', event_at: '2026-09-07T14:30:00+08:00', date: '2026-09-07', mode: 'vibrate', ...changes
})
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-07T14:00:00+08:00'))
  localStorage.clear()
  mock.platform = 'android'; mock.permission = 'granted'; mock.exact = 'granted'; mock.pending = []; mock.delivered = []
  mock.checkPermissions.mockImplementation(async () => ({ display: mock.permission }))
  mock.checkExact.mockImplementation(async () => ({ exact_alarm: mock.exact }))
  mock.requestPermissions.mockImplementation(async () => ({ display: mock.permission }))
  mock.addListener.mockResolvedValue({ remove: vi.fn() })
  mock.schedule.mockImplementation(async ({ notifications }) => {
    // AlarmManager replaces a PendingIntent with the same ID, rather than
    // accumulating a second alarm when the app rearms a persisted record.
    const ids = new Set(notifications.map((value: { id: number }) => value.id))
    mock.pending = [...mock.pending.filter(value => !ids.has(value.id)), ...notifications]
  })
  mock.cancel.mockImplementation(async ({ notifications }) => {
    const ids = new Set(notifications.map((value: { id: number }) => value.id))
    mock.pending = mock.pending.filter(value => !ids.has(value.id))
  })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it('never returns the Capacitor proxy through an async promise (its synthetic then hangs forever)', async () => {
  const { reminderCapability } = await import('./reminderNotifications')
  const result = Promise.race([reminderCapability(true),
    new Promise(resolve => setTimeout(() => resolve('plugin loading stuck'), 100))])
  await vi.advanceTimersByTimeAsync(100)
  expect(await result).toMatchObject({ platform: 'android', permission: 'granted' })
  expect(mock.pluginThen).not.toHaveBeenCalled()
}, 1000)

it('requests Android permission once for overlapping taps and registers native click listeners', async () => {
  mock.permission = 'prompt'
  let resolvePermission!: (value: { display: string }) => void
  mock.requestPermissions.mockImplementation(() => new Promise(resolve => { resolvePermission = resolve }))
  const { reminderCapability, listenNativeReminderClicks } = await import('./reminderNotifications')
  const first = reminderCapability(true)
  const second = reminderCapability(true)
  await vi.advanceTimersByTimeAsync(0)
  expect(mock.requestPermissions).toHaveBeenCalledTimes(1)
  resolvePermission({ display: 'granted' })
  expect(await first).toMatchObject({ permission: 'granted' })
  expect(await second).toMatchObject({ permission: 'granted' })
  await listenNativeReminderClicks(vi.fn())
  expect(mock.addListener).toHaveBeenCalledWith('localNotificationActionPerformed', expect.any(Function))
  expect(mock.pluginThen).not.toHaveBeenCalled()
})
it('recovers from a permission request that never responds and allows retry without blocking reconciliation', async () => {
  mock.permission = 'prompt'
  mock.requestPermissions.mockImplementationOnce(() => new Promise(() => {}))
  const { reminderCapability, syncDeviceReminders } = await import('./reminderNotifications')
  const first = expect(reminderCapability(true)).rejects.toThrow('通知授权尚未完成')
  await vi.advanceTimersByTimeAsync(15_000)
  await first
  mock.permission = 'granted'
  expect(await reminderCapability(true)).toMatchObject({ permission: 'granted' })
  expect(await syncDeviceReminders(1, [occurrence()], true)).toMatchObject({ count: 1 })
})
it('bounds permission checks and treats unavailable exact-alarm status as optional', async () => {
  const { reminderCapability } = await import('./reminderNotifications')
  mock.checkPermissions.mockImplementationOnce(() => new Promise(() => {}))
  const check = expect(reminderCapability()).rejects.toThrow('通知服务暂未响应')
  await vi.advanceTimersByTimeAsync(8000)
  await check
  mock.checkExact.mockImplementationOnce(() => new Promise(() => {}))
  const capability = reminderCapability(true)
  await vi.advanceTimersByTimeAsync(2000)
  expect(await capability).toMatchObject({ permission: 'granted', exact: false })
  expect(mock.requestPermissions).not.toHaveBeenCalled()
})
it('denying notifications completes promptly and does not ask for exact alarms', async () => {
  mock.permission = 'prompt'
  mock.requestPermissions.mockResolvedValue({ display: 'denied' })
  const { reminderCapability } = await import('./reminderNotifications')
  expect(await reminderCapability(true)).toMatchObject({ permission: 'denied', exact: false })
  expect(mock.checkExact).not.toHaveBeenCalled()
})

it('registers exact Android alarms once, and reschedules changed clocks or permission without duplicates', async () => {
  const { syncDeviceReminders } = await import('./reminderNotifications')
  await syncDeviceReminders(1, [occurrence()], true)
  expect(mock.schedule).toHaveBeenCalledTimes(1)
  expect(mock.pending[0]).toMatchObject({ isExactNotification: true, channelId: 'campusmind-reminder-vibrate-v1',
    extra: { userId: 1, owner: OWNER }, schedule: { at: new Date('2026-09-07T06:30:00Z'), allowWhileIdle: true } })
  await syncDeviceReminders(1, [occurrence()], true)
  expect(mock.schedule).toHaveBeenCalledTimes(1)
  const moved = occurrence({ at: '2026-09-07T14:40:00+08:00', mode: 'silent' })
  await syncDeviceReminders(1, [moved], true)
  expect(mock.pending).toHaveLength(1)
  expect(mock.pending[0].channelId).toBe('campusmind-reminder-silent-v1')
  mock.exact = 'denied'
  await syncDeviceReminders(1, [moved], true)
  expect(mock.pending[0].isExactNotification).toBe(false)
  expect(mock.requestPermissions).not.toHaveBeenCalled()
})
it('completion, deletion and pausing remove pending and delivered managed notifications only', async () => {
  const { syncDeviceReminders } = await import('./reminderNotifications')
  await syncDeviceReminders(1, [occurrence()], true)
  mock.delivered = [{ ...mock.pending[0] }, { id: 7, extra: { owner: 'another-feature' } }]
  mock.pending.push({ id: 7, extra: { owner: 'another-feature' } })
  await syncDeviceReminders(1, [], true)
  expect(mock.pending.map(value => value.id)).toEqual([7])
  expect(mock.removeDelivered).toHaveBeenCalledWith({ notifications: [mock.delivered[0]] })
})
it('preserves course alarms on offline cold start but removes them on explicit disable', async () => {
  const { syncDeviceReminders } = await import('./reminderNotifications')
  const course = occurrence({ key: 'course-1-2026-09-07', kind: 'course', course_id: 1 })
  await syncDeviceReminders(1, [course, occurrence()], true)
  await syncDeviceReminders(1, [occurrence()], true, true)
  expect(mock.pending).toHaveLength(2)
  expect(mock.schedule).toHaveBeenCalledTimes(1)
  await syncDeviceReminders(1, [occurrence()], true, false)
  expect(mock.pending).toHaveLength(1)
  expect(mock.pending[0].extra.kind).toBe('custom')
})
it('does not preserve a previous account’s course alarms', async () => {
  const { syncDeviceReminders } = await import('./reminderNotifications')
  await syncDeviceReminders(1, [occurrence({ kind: 'course' })], true)
  await syncDeviceReminders(2, [], true, true)
  expect(mock.pending).toHaveLength(0)
})
it('preserves future course alarms offline within the native horizon', async () => {
  const { syncDeviceReminders } = await import('./reminderNotifications')
  mock.pending = [
    { id: 101, extra: { owner: OWNER, userId: 1, kind: 'course', key: 'course-1-2026-09-07' } },
    { id: 102, extra: { owner: OWNER, userId: 1, kind: 'course', key: 'course-2-2026-09-08' } }
  ]
  const custom = occurrence({ date: '2026-09-10', at: '2026-09-10T14:30:00+08:00' })
  await syncDeviceReminders(1, [custom], true, true)
  expect(mock.pending.some(value => value.id === 101)).toBe(true)
  expect(mock.pending.some(value => value.id === 102)).toBe(true)
  expect(mock.pending.some(value => value.extra.kind === 'custom')).toBe(true)
  vi.setSystemTime(new Date('2026-09-08T00:00:00+08:00'))
  await syncDeviceReminders(1, [custom], true, true)
  expect(mock.pending).toHaveLength(2)
  expect(mock.pending.some(value => value.id === 101)).toBe(false)
})
it('registers upcoming native courses so tomorrow works without an open app', async () => {
  const { syncDeviceReminders } = await import('./reminderNotifications')
  const today = occurrence({ key: 'course-1-2026-09-07', kind: 'course' })
  const tomorrow = occurrence({ key: 'course-2-2026-09-08', kind: 'course', date: '2026-09-08', at: '2026-09-08T14:30:00+08:00' })
  const result = await syncDeviceReminders(1, [today, tomorrow], true)
  expect(result?.count).toBe(2)
  expect(mock.pending[0].extra.date).toBe('2026-09-07')
})
it('rearms unchanged IDs after resume even when saved plugin records still exist', async () => {
  const { syncDeviceReminders } = await import('./reminderNotifications')
  await syncDeviceReminders(1, [occurrence()], true)
  const id = mock.pending[0].id
  await syncDeviceReminders(1, [occurrence()], true, false, true)
  expect(mock.schedule).toHaveBeenCalledTimes(2)
  expect(mock.schedule.mock.calls[1]![0].notifications[0].id).toBe(id)
  expect(mock.pending).toHaveLength(1)
  expect(mock.cancel).not.toHaveBeenCalled()
})
it('rearms after a cold JS restart while retaining the saved native records', async () => {
  const first = await import('./reminderNotifications')
  await first.syncDeviceReminders(1, [occurrence()], true)
  const id = mock.pending[0].id
  vi.resetModules()
  const restarted = await import('./reminderNotifications')
  await restarted.syncDeviceReminders(1, [occurrence()], true)
  expect(mock.schedule).toHaveBeenCalledTimes(2)
  expect(mock.pending).toHaveLength(1)
  expect(mock.pending[0].id).toBe(id)
})
it('rearms retained offline courses from their saved payload, using the same ID', async () => {
  const { syncDeviceReminders } = await import('./reminderNotifications')
  const course = occurrence({ kind: 'course', key: 'course-1-2026-09-08', date: '2026-09-08', at: '2026-09-08T14:30:00+08:00' })
  await syncDeviceReminders(1, [course], true)
  const id = mock.pending[0].id
  await syncDeviceReminders(1, [], true, true, true)
  expect(mock.schedule).toHaveBeenCalledTimes(2)
  expect(mock.schedule.mock.calls[1]![0].notifications[0]).toMatchObject({ id, channelId: 'campusmind-reminder-vibrate-v1' })
})
it('limits large plans to 400 and reports coverage, never marking all as registered', async () => {
  const { syncDeviceReminders } = await import('./reminderNotifications')
  const many = Array.from({ length: 405 }, (_, i) => occurrence({ key: `item-${i}`, at: new Date(Date.now() + (i + 1) * 60_000).toISOString() }))
  const result = await syncDeviceReminders(1, many, true)
  expect(result).toMatchObject({ count: 400, truncated: true, until: many[399]!.at })
  expect(mock.pending).toHaveLength(400)
  expect(new Set(mock.pending.map(value => value.id)).size).toBe(400)
})
it('revoked permissions cancel existing alarms and never prompt in the background', async () => {
  const { syncDeviceReminders } = await import('./reminderNotifications')
  await syncDeviceReminders(1, [occurrence()], true)
  mock.permission = 'denied'
  expect(await syncDeviceReminders(1, [occurrence()], true)).toMatchObject({ count: 0 })
  expect(mock.pending).toHaveLength(0)
  expect(mock.requestPermissions).not.toHaveBeenCalled()
})
it('logout invalidates queued work and cancels already registered alarms', async () => {
  const { syncDeviceReminders, cancelDeviceReminders } = await import('./reminderNotifications')
  await syncDeviceReminders(1, [occurrence()], true)
  const queued = syncDeviceReminders(1, [occurrence()], true)
  await cancelDeviceReminders()
  expect(await queued).toBeNull()
  expect(mock.pending).toHaveLength(0)
})
it('a native error is observable and does not poison the next retry', async () => {
  const { syncDeviceReminders } = await import('./reminderNotifications')
  mock.schedule.mockRejectedValueOnce(new Error('OS failure'))
  await expect(syncDeviceReminders(1, [occurrence()], true)).rejects.toThrow('OS failure')
  expect(await syncDeviceReminders(1, [occurrence()], true)).toMatchObject({ count: 1 })
})
it('background plan reconciliation leaves the five-second test notification alone', async () => {
  const { syncDeviceReminders, testReminderNotification } = await import('./reminderNotifications')
  await testReminderNotification()
  await syncDeviceReminders(1, [], true)
  expect(mock.pending).toHaveLength(1)
  expect(mock.pending[0].extra.test).toBe(true)
})
it('schedules the background test for one minute with a native idle-capable alarm', async () => {
  const { testReminderNotification } = await import('./reminderNotifications')
  await testReminderNotification(60)
  expect(mock.pending[0]).toMatchObject({
    schedule: { at: new Date(Date.now() + 60_000), allowWhileIdle: true },
    isExactNotification: true, extra: { test: true }
  })
})
it('web reminders notify/vibrate once, keep silent mode silent and cancel on logout', async () => {
  mock.platform = 'web'
  const notification = vi.fn(function () { return { close: vi.fn() } })
  Object.assign(notification, { permission: 'granted' })
  vi.stubGlobal('Notification', notification); vi.stubGlobal('isSecureContext', true)
  const vibrate = vi.fn()
  Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate })
  const { syncDeviceReminders, tickWebReminders, cancelDeviceReminders } = await import('./reminderNotifications')
  await syncDeviceReminders(1, [occurrence()], true)
  vi.setSystemTime(new Date('2026-09-07T14:30:00+08:00'))
  await tickWebReminders(); await tickWebReminders()
  expect(notification).toHaveBeenCalledTimes(1)
  expect(vibrate).toHaveBeenCalledTimes(1)
  await syncDeviceReminders(1, [occurrence({ key: 'silent', mode: 'silent', at: '2026-09-07T14:31:00+08:00' })], true)
  vi.setSystemTime(new Date('2026-09-07T14:31:00+08:00'))
  await tickWebReminders()
  expect(notification).toHaveBeenCalledTimes(2)
  expect(notification).toHaveBeenLastCalledWith('交作业', expect.objectContaining({ silent: true }))
  expect(vibrate).toHaveBeenCalledTimes(1)
  await cancelDeviceReminders(); await tickWebReminders()
  expect(notification).toHaveBeenCalledTimes(2)
})
it('web resume does not burst obsolete reminders; insecure web reports unsupported', async () => {
  mock.platform = 'web'
  const notification = vi.fn(function () {})
  Object.assign(notification, { permission: 'granted' })
  vi.stubGlobal('Notification', notification); vi.stubGlobal('isSecureContext', true)
  const { syncDeviceReminders, tickWebReminders, reminderCapability } = await import('./reminderNotifications')
  await syncDeviceReminders(1, [occurrence()], true)
  vi.setSystemTime(new Date('2026-09-07T16:30:00+08:00'))
  await tickWebReminders()
  expect(notification).not.toHaveBeenCalled()
  vi.stubGlobal('isSecureContext', false)
  expect(await reminderCapability()).toMatchObject({ permission: 'unsupported', platform: 'web' })
})

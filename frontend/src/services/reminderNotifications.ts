import { Capacitor } from '@capacitor/core'
import type { ReminderCapability, ReminderOccurrence } from '@/types/reminder'
import { addCalendarDays, allocateNotificationIds, DEVICE_COURSE_DAYS, MAX_DEVICE_REMINDERS } from '@/utils/reminders'
import { campusTime } from '@/utils/campusTime'

const OWNER = 'campusmind-reminders'
let queue: Promise<unknown> = Promise.resolve()
let epoch = 0
let rearmedUser: number | null = null
let webItems: ReminderOccurrence[] = []
let webUser: number | null = null
let webStarted = Date.now()
const memoryDelivered = new Set<string>()
const isAndroid = () => Capacitor.getPlatform() === 'android'
// Capacitor proxies synthesize a `then` method. Resolving a Promise with the
// proxy itself invokes that method and never settles; await the module instead.
const native = () => withTimeout(import('@capacitor/local-notifications'))
let permissionRequest: Promise<ReminderCapability> | null = null
function withTimeout<T>(task: Promise<T>, milliseconds = 8000,
  message = '通知服务暂未响应，请返回应用后重试'): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), milliseconds)
    task.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
  })
}
const serialize = <T>(work: () => Promise<T>): Promise<T> => {
  const task = queue.then(work, work)
  queue = task.catch(() => {})
  return task
}

export function reminderCapability(requestPermission = false): Promise<ReminderCapability> {
  if (!requestPermission) return readCapability(false)
  // Repeated taps must not launch overlapping Android permission requests.
  if (!permissionRequest) permissionRequest = readCapability(true).finally(() => { permissionRequest = null })
  return permissionRequest
}
async function readCapability(requestPermission: boolean): Promise<ReminderCapability> {
  if (isAndroid()) {
    const { LocalNotifications: plugin } = await native()
    const current = await withTimeout(plugin.checkPermissions())
    const status = requestPermission && current.display !== 'granted'
      ? await withTimeout(plugin.requestPermissions(), 15_000, '通知授权尚未完成，请在系统弹窗中选择；返回应用后可重试') : current
    // Exact alarms are a separate, optional permission, not a gate on enabling notifications.
    const exact = status.display === 'granted'
      ? await withTimeout(plugin.checkExactNotificationSetting(), 2000).catch(() => ({ exact_alarm: 'denied' }))
      : { exact_alarm: 'denied' }
    return { platform: 'android', permission: status.display === 'granted' ? 'granted'
      : status.display === 'denied' ? 'denied' : 'prompt', exact: exact.exact_alarm === 'granted' }
  }
  if (!window.isSecureContext || !('Notification' in window)) return { platform: 'web', permission: 'unsupported', exact: false }
  const permission = requestPermission ? await withTimeout(Notification.requestPermission(), 15_000,
    '通知授权尚未完成，请检查浏览器权限后重试') : Notification.permission
  return { platform: 'web', permission: permission === 'default' ? 'prompt' : permission, exact: false }
}
export async function openExactReminderSettings() {
  if (isAndroid()) await (await native()).LocalNotifications.changeExactNotificationSetting()
}
async function cancelNativeManaged() {
  const { LocalNotifications: plugin } = await native()
  const pending = (await plugin.getPending()).notifications.filter((item) => item.extra?.owner === OWNER)
  if (pending.length) await plugin.cancel({ notifications: pending.map(({ id }) => ({ id })) })
  const delivered = (await plugin.getDeliveredNotifications()).notifications.filter((item) => item.extra?.owner === OWNER)
  if (delivered.length) await plugin.removeDeliveredNotifications({ notifications: delivered })
}
export function cancelDeviceReminders(): Promise<void> {
  epoch++
  rearmedUser = null
  webItems = []
  webUser = null
  memoryDelivered.clear()
  return serialize(async () => { if (isAndroid()) await cancelNativeManaged() })
}
export function syncDeviceReminders(userId: number, occurrences: ReminderOccurrence[], enabled: boolean, preserveCourses = false, rearm = false) {
  const generation = epoch
  return serialize(async () => {
    if (generation !== epoch) return null
    const capability = await reminderCapability()
    if (generation !== epoch) return null
    if (!enabled || capability.permission !== 'granted') {
      rearmedUser = null
      webItems = []
      if (isAndroid()) await cancelNativeManaged()
      return { capability, count: 0, until: '', truncated: false }
    }
    const today = campusTime(new Date()).date
    const lastCourseDay = addCalendarDays(today, isAndroid() ? DEVICE_COURSE_DAYS - 1 : 0)
    const inCourseWindow = (date: string) => date >= today && date <= lastCourseDay
    const currentOccurrences = occurrences.filter((item) => item.kind !== 'course' || inCourseWindow(item.date))
    const upcoming = currentOccurrences.filter((item) => Date.parse(item.at) > Date.now())
    if (!isAndroid()) {
      const retained = preserveCourses && webUser === userId
        ? webItems.filter((item) => item.kind === 'course' && item.date === today && Date.parse(item.at) > Date.now()) : []
      if (webUser !== userId) webStarted = Date.now()
      webUser = userId
      webItems = [...currentOccurrences, ...retained]
      return { capability, count: upcoming.length, until: upcoming.at(-1)?.at || '', truncated: false }
    }
    const { LocalNotifications: plugin } = await native()
    const pending = (await plugin.getPending()).notifications.filter((item) => item.extra?.owner === OWNER && !item.extra?.test)
    const isCourseInWindow = (extra: Record<string, any> | undefined) => extra?.kind === 'course'
      && inCourseWindow(extra.date || /^course-\d+-(\d{4}-\d{2}-\d{2})$/.exec(extra.key || '')?.[1] || '')
    const preserved = pending.filter((item) => preserveCourses && item.extra?.userId === userId && isCourseInWindow(item.extra)).slice(0, MAX_DEVICE_REMINDERS)
    const limited = upcoming.slice(0, Math.max(0, MAX_DEVICE_REMINDERS - preserved.length))
    const notification = (id: number, occurrence: ReminderOccurrence) => ({
      id, title: occurrence.title, body: occurrence.body, smallIcon: 'ic_stat_reminder', iconColor: '#496E52',
      schedule: { at: new Date(occurrence.at), allowWhileIdle: true },
      channelId: `campusmind-reminder-${occurrence.mode}-v1`, autoCancel: true,
      isExactNotification: capability.exact,
      extra: { owner: OWNER, userId, key: occurrence.key, date: occurrence.date,
        signature: JSON.stringify([occurrence, capability.exact]), kind: occurrence.kind }
    })
    const desired = allocateNotificationIds(userId, limited, preserved.map((item) => item.id)).map(({ id, occurrence }) => notification(id, occurrence))
    const wanted = new Map(desired.map((item) => [item.id, item]))
    const keepIds = new Set(preserved.map((item) => item.id))
    const existing = new Map(pending.map((item) => [item.id, item]))
    const removed = pending.filter((item) => !keepIds.has(item.id) && (!wanted.has(item.id) || wanted.get(item.id)!.extra.signature !== item.extra?.signature
      || item.extra?.userId !== userId))
    if (removed.length) await plugin.cancel({ notifications: removed.map(({ id }) => ({ id })) })
    if (generation !== epoch) return null
    // getPending reads persisted plugin records, not AlarmManager. Re-register
    // on cold start/resume in case Android removed alarms but left these records.
    const shouldRearm = rearm || rearmedUser !== userId
    const added = desired.filter((item) => shouldRearm || existing.get(item.id)?.extra?.signature !== item.extra.signature
      || existing.get(item.id)?.extra?.userId !== userId)
    if (shouldRearm) for (const item of preserved) {
      try {
        const [occurrence] = JSON.parse(item.extra?.signature ?? '[]') as [ReminderOccurrence]
        if (occurrence?.kind === 'course' && occurrence.key === item.extra?.key && inCourseWindow(occurrence.date)
          && Date.parse(occurrence.at) > Date.now() && ['sound', 'vibrate', 'silent'].includes(occurrence.mode)) {
          added.push(notification(item.id, occurrence))
        }
      } catch { /* A damaged legacy record must not prevent all other alarms. */ }
    }
    if (added.length) await plugin.schedule({ notifications: added })
    const activeKeys = new Set(currentOccurrences.map((item) => item.key))
    const obsolete = (await plugin.getDeliveredNotifications()).notifications.filter((item) =>
      item.extra?.owner === OWNER && !item.extra?.test && (item.extra?.userId !== userId
        || (!activeKeys.has(item.extra?.key) && !(preserveCourses && isCourseInWindow(item.extra)))))
    if (obsolete.length) await plugin.removeDeliveredNotifications({ notifications: obsolete })
    rearmedUser = userId
    return { capability, count: desired.length + preserved.length, until: limited.at(-1)?.at || '', truncated: upcoming.length > limited.length }
  })
}

export function clearReminderCache(userId: number) {
  try {
    const prefix = `campusmind:${userId}:reminder-`
    for (const key of Object.keys(localStorage)) if (key.startsWith(prefix)) localStorage.removeItem(key)
  } catch { /* storage can be unavailable; server deletion remains authoritative */ }
}

export function dispatchInAppReminder(occurrence: Pick<ReminderOccurrence, 'title' | 'body'>) {
  window.dispatchEvent(new CustomEvent('campusmind:reminder', { detail: occurrence }))
}
export async function tickWebReminders(now = Date.now()) {
  const userId = webUser
  if (isAndroid() || !userId) return
  for (const occurrence of webItems) {
    const at = Date.parse(occurrence.at)
    if (at < webStarted || now < at || now - at > 60_000) continue
    const key = `campusmind:${userId}:reminder-delivered:${occurrence.key}:${at}`
    const deliver = async () => {
      if (webUser !== userId || memoryDelivered.has(key)) return
      try { if (localStorage.getItem(key)) return; localStorage.setItem(key, String(now)) } catch { /* in-memory dedup still applies */ }
      memoryDelivered.add(key)
      dispatchInAppReminder(occurrence)
      if (occurrence.mode !== 'silent') navigator.vibrate?.([180, 90, 180])
      try {
        if (Notification.permission === 'granted') {
          const notification = new Notification(occurrence.title, { body: occurrence.body, tag: key, silent: occurrence.mode !== 'sound' })
          notification.onclick = () => { window.focus(); window.dispatchEvent(new Event('campusmind:open-reminders')); notification.close() }
        }
      } catch { /* some mobile browsers only support service-worker notifications; in-app notice remains */ }
    }
    if (navigator.locks) await navigator.locks.request(key, deliver)
    else await deliver()
  }
}
export async function testReminderNotification(delaySeconds = 5) {
  const capability = await reminderCapability()
  if (capability.permission !== 'granted') throw new Error('请先开启本机通知')
  if (isAndroid()) {
    await (await native()).LocalNotifications.schedule({ notifications: [{ id: 2_100_000_001, title: '智行提醒已就绪',
      body: '这是一条测试提醒，实际震动与声音遵循系统设置。', smallIcon: 'ic_stat_reminder',
      schedule: { at: new Date(Date.now() + Math.max(5, Math.min(120, delaySeconds)) * 1000), allowWhileIdle: true }, isExactNotification: capability.exact,
      channelId: 'campusmind-reminder-vibrate-v1', extra: { owner: OWNER, test: true } }] })
  } else {
    dispatchInAppReminder({ title: '智行提醒已就绪', body: '请保持网页打开，关闭网页后的提醒不能保证。' })
    navigator.vibrate?.([180, 90, 180])
    new Notification('智行提醒测试', { body: '网页通知已开启，请保持网页打开。', silent: true })
  }
}
export async function listenNativeReminderClicks(open: (userId: number) => void) {
  if (!isAndroid()) return null
  return (await native()).LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    if (event.notification.extra?.owner === OWNER) open(event.notification.extra.userId)
  })
}

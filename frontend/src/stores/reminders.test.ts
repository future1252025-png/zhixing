import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { getReminders, saveReminders } from '@/api/reminders'
import { emptyReminderPlan } from '@/utils/reminders'
import { useRemindersStore } from './reminders'

vi.mock('@/api/reminders', () => ({ getReminders: vi.fn(), saveReminders: vi.fn() }))
beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); vi.resetAllMocks() })
it('keeps plans account-scoped and notification opt-in device-local', async () => {
  vi.mocked(getReminders).mockResolvedValue(emptyReminderPlan())
  const store = useRemindersStore()
  await store.load(1)
  store.setDeviceEnabled(true)
  await store.load(2)
  expect(store.deviceEnabled).toBe(false)
  await store.load(1)
  expect(store.deviceEnabled).toBe(true)
})
it('distinguishes an explicit pause from first use and resets prompt dismissal between accounts', () => {
  const store = useRemindersStore()
  store.reset(1)
  expect(store.devicePreferenceSet).toBe(false)
  store.setDeviceEnabled(false)
  store.permissionPromptDismissed = true
  store.reset(2)
  expect(store.devicePreferenceSet).toBe(false)
  expect(store.permissionPromptDismissed).toBe(false)
  store.reset(1)
  expect(store.devicePreferenceSet).toBe(true)
  expect(store.deviceEnabled).toBe(false)
})
it('uses a valid offline cache, ignoring malformed records', async () => {
  localStorage.setItem('campusmind:1:reminder-plan', JSON.stringify({ ...emptyReminderPlan(), revision: 3 }))
  vi.mocked(getReminders).mockRejectedValue(new Error('offline'))
  const store = useRemindersStore()
  await store.load(1)
  expect(store.loaded).toBe(true)
  expect(store.offline).toBe(true)
  expect(store.plan.revision).toBe(3)
  localStorage.setItem('campusmind:2:reminder-plan', JSON.stringify({ ...emptyReminderPlan(), items: [null] }))
  await store.load(2)
  expect(store.loaded).toBe(false)
})
it('rejects stale network data after a save and keeps the newest cached revision', async () => {
  const store = useRemindersStore()
  vi.mocked(getReminders).mockResolvedValue(emptyReminderPlan())
  await store.load(1)
  let complete!: (plan: ReturnType<typeof emptyReminderPlan>) => void
  vi.mocked(getReminders).mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
  const loading = store.load(1, true)
  vi.mocked(saveReminders).mockResolvedValue({ ...emptyReminderPlan(), revision: 2 })
  await store.save(emptyReminderPlan())
  complete({ ...emptyReminderPlan(), revision: 1 })
  await loading
  expect(store.plan.revision).toBe(2)
  expect(JSON.parse(localStorage.getItem('campusmind:1:reminder-plan')!).revision).toBe(2)
})
it('does not install a response into the next logged-in account', async () => {
  const store = useRemindersStore()
  let complete!: (plan: ReturnType<typeof emptyReminderPlan>) => void
  vi.mocked(getReminders).mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
  const loading = store.load(1)
  store.reset(2)
  complete({ ...emptyReminderPlan(), revision: 8 })
  await loading
  expect(store.userId).toBe(2)
  expect(store.plan.revision).toBe(0)
  expect(store.loaded).toBe(false)
})
it('leaves the current plan untouched on conflict or failed save', async () => {
  const store = useRemindersStore()
  vi.mocked(getReminders).mockResolvedValue(emptyReminderPlan())
  await store.load(1)
  vi.mocked(saveReminders).mockRejectedValue(new Error('conflict'))
  const draft = { ...emptyReminderPlan(), course_settings: { enabled: true, lead_minutes: 30, mode: 'silent' as const } }
  await expect(store.save(draft)).rejects.toThrow('conflict')
  expect(store.plan.course_settings.enabled).toBe(false)
  expect(store.saving).toBe(false)
})

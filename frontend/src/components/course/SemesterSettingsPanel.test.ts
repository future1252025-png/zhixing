import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fetchSemester, saveSemester } from '@/api/semester'
import { SEMESTER_FRESH_MS, useSemesterStore } from '@/stores/semester'
import SemesterSettingsPanel from './SemesterSettingsPanel.vue'

vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ currentUser: { id: 1 } }) }))
vi.mock('@/api/semester', () => ({ fetchSemester: vi.fn(), saveSemester: vi.fn() }))
const semester = { status: 'active' as const, start_date: '2026-08-31', total_weeks: 20, current_week: 4 }
let wrapper: VueWrapper | undefined
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); vi.mocked(fetchSemester).mockResolvedValue(semester) })
afterEach(() => { wrapper?.unmount(); wrapper = undefined })
it('loads and saves the shared import/profile semester settings and requests reminder reconciliation', async () => {
  vi.mocked(fetchSemester).mockResolvedValue({ status: 'unconfigured', start_date: null, total_weeks: null, current_week: null })
  vi.mocked(saveSemester).mockResolvedValue(semester)
  const pinia = createPinia()
  wrapper = mount(SemesterSettingsPanel, { global: { plugins: [pinia] } })
  await flushPromises()
  await wrapper.get('[name="start_date"]').setValue('2026-08-31')
  const sync = vi.fn()
  window.addEventListener('campusmind:sync-reminders', sync)
  try {
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(saveSemester).toHaveBeenCalledWith({ start_date: '2026-08-31', total_weeks: 20 })
    expect(useSemesterStore(pinia).semester).toEqual(semester)
    expect(wrapper.get('.semester-facts').text()).toContain('20 周')
    expect(sync).toHaveBeenCalledOnce()
  } finally { window.removeEventListener('campusmind:sync-reminders', sync) }
})
it('keeps unsaved edits and an actionable error when saving fails', async () => {
  vi.mocked(saveSemester).mockRejectedValue(new Error('offline'))
  wrapper = mount(SemesterSettingsPanel, { global: { plugins: [createPinia()] } })
  await flushPromises()
  await wrapper.get('[data-testid="edit-semester"]').trigger('click')
  await wrapper.get('[name="total_weeks"]').setValue('18')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  expect((wrapper.get('[name="total_weeks"]').element as HTMLInputElement).value).toBe('18')
})
it('offers retry when semester loading fails', async () => {
  vi.mocked(fetchSemester).mockRejectedValueOnce(new Error('offline'))
  wrapper = mount(SemesterSettingsPanel, { global: { plugins: [createPinia()] } })
  await flushPromises()
  expect(wrapper.find('.semester-card').exists()).toBe(false)
  await wrapper.get('[role="alert"] button').trigger('click')
  await flushPromises()
  expect(wrapper.find('.semester-card').exists()).toBe(true)
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
})

it('does not discard in-progress edits when unchanged settings finish refreshing', async () => {
  const pinia = createPinia()
  const store = useSemesterStore(pinia)
  await store.load(1)
  store.lastFetchedAt = Date.now() - SEMESTER_FRESH_MS
  let finishRefresh!: (value: typeof semester) => void
  vi.mocked(fetchSemester).mockReturnValueOnce(new Promise(resolve => { finishRefresh = resolve }))
  wrapper = mount(SemesterSettingsPanel, { global: { plugins: [pinia] } })
  await flushPromises()
  await wrapper.get('[data-testid="edit-semester"]').trigger('click')
  await wrapper.get('[name="total_weeks"]').setValue('18')
  finishRefresh({ ...semester })
  await flushPromises()
  expect((wrapper.get('[name="total_weeks"]').element as HTMLInputElement).value).toBe('18')
  expect(store.totalWeeks).toBe(20)
})

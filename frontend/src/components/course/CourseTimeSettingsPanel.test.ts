import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, expect, it, vi } from 'vitest'
import { useSemesterStore } from '@/stores/semester'
import { useCoursesStore } from '@/stores/courses'
import { saveSemester } from '@/api/semester'
import type { Course } from '@/types/course'
import CourseTimeSettingsPanel from './CourseTimeSettingsPanel.vue'

vi.mock('@/api/semester', () => ({ fetchSemester: vi.fn(), saveSemester: vi.fn() }))
vi.mock('vant', () => ({ showSuccessToast: vi.fn(), showConfirmDialog: vi.fn(async () => {}) }))
beforeEach(() => {
  vi.clearAllMocks(); setActivePinia(createPinia())
  const semester = useSemesterStore()
  semester.loadedForUserId = 1
  semester.semester = { start_date: '2026-04-27', total_weeks: 16, current_week: 1, status: 'active', time_rules: [] }
  const courses = useCoursesStore()
  courses.courses = [{ id: 1, start_time: '14:00', end_time: '15:40' }, { id: 2, start_time: '15:55', end_time: '17:35' }] as Course[]
  vi.spyOn(courses, 'ensureLoaded').mockResolvedValue(courses.courses)
  vi.mocked(saveSemester).mockImplementation(async payload => ({ ...payload, status: 'active', current_week: 1 }))
})
it('saves a dated afternoon shift without rewriting course records', async () => {
  const wrapper = mount(CourseTimeSettingsPanel)
  await wrapper.get('header button').trigger('click')
  await wrapper.get('input[type="date"]').setValue('2026-05-01')
  await wrapper.get('.quick-shift').trigger('click')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(saveSemester).toHaveBeenCalledWith({ start_date: '2026-04-27', total_weeks: 16, time_rules: [
    { start_date: '2026-05-01', end_date: null, from_start: '14:00', from_end: '15:40', start_time: '14:30', end_time: '16:10' },
    { start_date: '2026-05-01', end_date: null, from_start: '15:55', from_end: '17:35', start_time: '16:25', end_time: '18:05' }
  ] })
  expect(useCoursesStore().courses[0]?.start_time).toBe('14:00')
  expect(wrapper.find('form').exists()).toBe(false)
  expect(wrapper.text()).toContain('14:30–16:10')
  wrapper.unmount()
})
it('blocks invalid input and keeps the editor open for a server conflict', async () => {
  const wrapper = mount(CourseTimeSettingsPanel)
  await wrapper.get('header button').trigger('click')
  await wrapper.get('[aria-label="时段 1 新下课时间"]').setValue('13:00')
  await wrapper.get('form').trigger('submit')
  expect(saveSemester).not.toHaveBeenCalled()
  expect(wrapper.get('[role="alert"]').text()).toContain('下课时间')
  await wrapper.get('.quick-shift').trigger('click')
  vi.mocked(saveSemester).mockRejectedValueOnce(new Error('conflict'))
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(wrapper.find('form').exists()).toBe(true)
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  wrapper.unmount()
})

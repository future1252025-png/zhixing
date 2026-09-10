import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCoursesStore } from '@/stores/courses'
import type { Course } from '@/types/course'

import CourseFormPage from './CourseFormPage.vue'

const mocks = vi.hoisted(() => ({
  route: { params: {} as Record<string, string>, query: {} as Record<string, string> },
  push: vi.fn(),
  getBuildings: vi.fn(),
  getCourses: vi.fn(),
  createCourse: vi.fn(),
  updateCourse: vi.fn(),
  showFailToast: vi.fn(),
  showSuccessToast: vi.fn()
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.push })
}))

vi.mock('@/api/buildings', () => ({
  getBuildings: mocks.getBuildings
}))

vi.mock('@/api/courses', () => ({
  getCourses: mocks.getCourses,
  createCourse: mocks.createCourse,
  updateCourse: mocks.updateCourse
}))

vi.mock('@/utils/keyboardInset', () => ({
  useKeyboardAwarePage: () => ({ pageStyle: {}, onFieldFocus: vi.fn() })
}))

vi.mock('vant', () => ({
  showFailToast: mocks.showFailToast,
  showSuccessToast: mocks.showSuccessToast
}))

const existingCourse: Course = {
  id: 7,
  course_name: '数据结构',
  weekday: 2,
  start_time: '10:00',
  end_time: '11:40',
  building_id: 2,
  building: { id: 2, name: '逸夫楼', type: '教学楼' },
  room_name: '三层东侧联合实验室 301',
  source_location: null,
  teacher: '周老师',
  weeks: '1-16',
  source_kind: 'manual',
  needs_location_review: false,
  created_at: '2026-07-21T08:00:00'
}

const stubs = {
  'van-nav-bar': { template: '<header><slot /></header>' },
  'van-cell-group': { template: '<div><slot /></div>' },
  'van-field': { template: '<label><slot name="input" /></label>' },
  'van-form': {
    emits: ['submit'],
    template: '<form @submit.prevent="$emit(\'submit\')"><slot /></form>'
  },
  'van-button': {
    props: ['nativeType'],
    emits: ['click'],
    template:
      '<button :type="nativeType === \'submit\' ? \'submit\' : \'button\'" @click="$emit(\'click\')"><slot /></button>'
  }
}

function businessError(code: string, message: string, details: Record<string, unknown> = {}) {
  return {
    response: {
      status: 409,
      data: { code, message, fields: [], details }
    }
  }
}

let pinia: Pinia

async function mountPage() {
  const wrapper = mount(CourseFormPage, {
    global: {
      plugins: [pinia],
      stubs,
      directives: { reveal: {} }
    }
  })
  await flushPromises()
  return wrapper
}

describe('CourseFormPage', () => {
  beforeEach(() => {
    // 每个用例重置 Pinia，避免 buildings/courses store 缓存跨用例泄漏。
    pinia = createPinia()
    setActivePinia(pinia)
    mocks.route.params = {}
    mocks.route.query = {}
    mocks.getBuildings.mockResolvedValue([
      { id: 2, name: '逸夫楼', type: '教学楼', description: '', latitude: 0, longitude: 0 }
    ])
    mocks.getCourses.mockResolvedValue([])
    mocks.createCourse.mockResolvedValue(existingCourse)
    mocks.updateCourse.mockResolvedValue(existingCourse)
  })

  it('shows both mandatory location errors without sending an incomplete course', async () => {
    const wrapper = await mountPage()

    await wrapper.get('form').trigger('submit')

    expect(wrapper.text()).toContain('请选择上课建筑')
    expect(wrapper.text()).toContain('请输入完整教室')
    expect(mocks.createCourse).not.toHaveBeenCalled()
  })

  it('uses the backend conflict as authority and names every conflicting course and week', async () => {
    mocks.route.params = { id: '7' }
    mocks.getCourses.mockResolvedValue([existingCourse])
    mocks.updateCourse.mockRejectedValue(
      businessError('course_conflict', '该时间与已有课程冲突', {
        conflicts: [
          { course_id: 9, course_name: '高等数学', overlap_weeks: [2, 4, 6] },
          { course_id: 10, course_name: '大学物理', overlap_weeks: [8] }
        ]
      })
    )
    const wrapper = await mountPage()

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(mocks.updateCourse).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('高等数学')
    expect(wrapper.text()).toContain('第 2、4、6 周')
    expect(wrapper.text()).toContain('大学物理')
    expect(wrapper.text()).toContain('第 8 周')
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('links an unconfigured semester back to timetable settings and preserves the form', async () => {
    mocks.route.params = { id: '7' }
    mocks.getCourses.mockResolvedValue([existingCourse])
    mocks.updateCourse.mockRejectedValue(
      businessError('semester_unconfigured', 'Semester is not configured')
    )
    const wrapper = await mountPage()

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('请先设置学期')
    expect(wrapper.find('a[href="/courses#semester-settings"]').exists()).toBe(true)
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('reuses the cached lists and invalidates the course cache after saving', async () => {
    mocks.route.params = { id: '7' }
    mocks.getCourses.mockResolvedValue([existingCourse])
    const wrapper = await mountPage()

    const coursesStore = useCoursesStore(pinia)
    expect(mocks.getBuildings).toHaveBeenCalledTimes(1)
    expect(mocks.getCourses).toHaveBeenCalledTimes(1)
    expect(coursesStore.loaded).toBe(true)

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(mocks.updateCourse).toHaveBeenCalledOnce()
    expect(coursesStore.loaded).toBe(false)
    expect(mocks.push).toHaveBeenCalledWith('/courses')
  })

  it('saves manually corrected imported clocks without snapping back to a section preset', async () => {
    mocks.route.params = { id: '7' }
    mocks.getCourses.mockResolvedValue([{ ...existingCourse, source_kind: 'import' }])
    const wrapper = await mountPage()
    await wrapper.get('[name="start_time"]').setValue('14:30')
    await wrapper.get('[name="end_time"]').setValue('16:10')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(mocks.updateCourse).toHaveBeenCalledWith(7,
      expect.objectContaining({ start_time: '14:30', end_time: '16:10' }))
  })

  it('uses existing actual afternoon times as a quick preset for a new course', async () => {
    mocks.getCourses.mockResolvedValue([{ ...existingCourse, start_time: '14:30', end_time: '16:10' }])
    const wrapper = await mountPage()
    await wrapper.get('[data-testid="time-slot-5-6"]').trigger('click')
    expect((wrapper.get('[name="start_time"]').element as HTMLInputElement).value).toBe('14:30')
    expect((wrapper.get('[name="end_time"]').element as HTMLInputElement).value).toBe('16:10')
  })

  it('keeps saving text outside the spinner so neither can cover the other', async () => {
    mocks.route.params = { id: '7' }
    mocks.getCourses.mockResolvedValue([existingCourse])
    mocks.updateCourse.mockReturnValue(new Promise(() => undefined))
    const wrapper = await mountPage()

    await wrapper.get('form').trigger('submit')

    expect(wrapper.get('.course-save__label').text()).toBe('正在保存课程')
    expect(wrapper.find('.course-save__spinner').exists()).toBe(true)
    expect(wrapper.get('.course-save__label').find('.course-save__spinner').exists()).toBe(false)
  })

  it('offers polished slot presets when an imported course needs its time completed', async () => {
    mocks.route.params = { id: '7' }
    mocks.getCourses.mockResolvedValue([
      {
        ...existingCourse,
        start_time: null,
        end_time: null,
        source_kind: 'import'
      }
    ])
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('补全导入课程')
    expect(wrapper.text()).toContain('给这门课补上准确时间')
    expect(wrapper.get('[data-testid="course-time-planner"]').classes()).toContain(
      'time-planner--pending'
    )

    await wrapper.get('[data-testid="time-slot-5-6"]').trigger('click')

    expect((wrapper.get('[name="start_time"]').element as HTMLInputElement).value).toBe('14:00')
    expect((wrapper.get('[name="end_time"]').element as HTMLInputElement).value).toBe('15:40')
    expect(wrapper.get('[data-testid="time-slot-5-6"]').classes()).toContain('active')
    expect(wrapper.text()).toContain('5-6 节 · 课程时长 1 小时 40 分钟')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(mocks.updateCourse).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ start_time: '14:00', end_time: '15:40' })
    )
  })

  it('shows an inline correction when a manually entered time range runs backwards', async () => {
    const wrapper = await mountPage()

    await wrapper.get('[name="start_time"]').setValue('15:40')
    await wrapper.get('[name="end_time"]').setValue('14:00')

    expect(wrapper.get('[data-testid="course-time-planner"]').classes()).toContain(
      'time-planner--error'
    )
    expect(wrapper.get('.time-range-feedback').attributes('role')).toBe('alert')
    expect(wrapper.text()).toContain('结束时间需要晚于开始时间')
  })
})

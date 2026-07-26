import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useCoursesStore } from '@/stores/courses'
import type { ImportPreviewResponse } from '@/types/courseImport'

import CourseImportPage from './CourseImportPage.vue'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  getBuildings: vi.fn(),
  getCourses: vi.fn(),
  previewCourseImport: vi.fn(),
  commitCourseImport: vi.fn(),
  createCourse: vi.fn(),
  showFailToast: vi.fn(),
  showSuccessToast: vi.fn()
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push })
}))

vi.mock('@/api/buildings', () => ({
  getBuildings: mocks.getBuildings
}))

vi.mock('@/api/courses', () => ({
  getCourses: mocks.getCourses,
  previewCourseImport: mocks.previewCourseImport,
  commitCourseImport: mocks.commitCourseImport,
  createCourse: mocks.createCourse
}))

vi.mock('@/utils/keyboardInset', () => ({
  useKeyboardAwarePage: () => ({ pageStyle: {}, onFieldFocus: vi.fn() })
}))

vi.mock('vant', () => ({
  showFailToast: mocks.showFailToast,
  showSuccessToast: mocks.showSuccessToast
}))

const source = (overrides: Partial<Record<string, string>> = {}) => ({
  raw_course_name: '数据分析',
  raw_weekday: '星期二',
  raw_time_or_section: '第1-2节 08:00-09:40',
  raw_teacher: '陈老师',
  raw_weeks: '1-16周',
  raw_location: '实训大楼423-425数据中国实验室1',
  ...overrides
})

const preview: ImportPreviewResponse = {
  file: {
    filename: '完整课表.xlsx',
    sha256: 'a'.repeat(64),
    candidate_count: 2
  },
  candidates: [
    {
      row_ref: 'row-1',
      source: source(),
      course_name: '数据分析',
      weekday: 2,
      start_time: '08:00',
      end_time: '09:40',
      teacher: '陈老师',
      weeks: '1-16',
      suggested_building_id: 3,
      suggested_building_name: '实训大楼',
      suggested_room_name: '423-425数据中国实验室1',
      errors: []
    },
    {
      row_ref: 'row-2',
      source: source({
        raw_course_name: '大学英语',
        raw_location: '实训大楼'
      }),
      course_name: '大学英语',
      weekday: 2,
      start_time: '10:00',
      end_time: '11:40',
      teacher: '李老师',
      weeks: '1-16',
      suggested_building_id: 3,
      suggested_building_name: '实训大楼',
      suggested_room_name: null,
      errors: [
        { code: 'room_missing', field: 'room_name', message: '原始地点缺少教室信息' }
      ]
    }
  ],
  can_commit: false
}

function businessError(code: string, message: string, details: Record<string, unknown>) {
  return {
    response: {
      status: 409,
      data: { code, message, fields: [], details }
    }
  }
}

let pinia: Pinia

async function mountPage() {
  const wrapper = mount(CourseImportPage, {
    attachTo: document.body,
    global: {
      plugins: [pinia],
      stubs: {
        'van-nav-bar': { template: '<header />' },
        'van-button': {
          props: ['disabled'],
          emits: ['click'],
          template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
        },
        'van-field': { template: '<label><slot name="input" /></label>' }
      },
      directives: { reveal: {} }
    }
  })
  await flushPromises()
  return wrapper
}

async function chooseAndPreview(wrapper: Awaited<ReturnType<typeof mountPage>>) {
  const file = new File(['binary schedule'], '完整课表.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await wrapper.get('[data-testid="preview-import"]').trigger('click')
  await flushPromises()
  return file
}

describe('CourseImportPage', () => {
  beforeEach(() => {
    // 每个用例重置 Pinia，避免 buildings/courses store 缓存跨用例泄漏。
    pinia = createPinia()
    setActivePinia(pinia)
    mocks.getBuildings.mockResolvedValue([
      {
        id: 3,
        name: '实训大楼',
        type: '实训楼',
        description: '',
        latitude: 30,
        longitude: 114,
        map_x: 0,
        map_y: 0,
        walk_hint: null
      }
    ])
    mocks.previewCourseImport.mockResolvedValue(preview)
    mocks.commitCourseImport.mockResolvedValue({ created_count: 2, course_ids: [31, 32] })
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      value: vi.fn(),
      configurable: true
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('states all four supported formats and blocks commit while a row is unresolved', async () => {
    const wrapper = await mountPage()
    await chooseAndPreview(wrapper)

    expect(wrapper.text()).toContain('HTM / HTML / XLS / XLSX')
    expect(wrapper.get('[data-testid="commit-import"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('还有 1 门课程需要处理')
  })

  it('submits the unchanged original file once with every explicit resolution', async () => {
    const wrapper = await mountPage()
    const file = await chooseAndPreview(wrapper)
    await wrapper
      .get('[data-row-ref="row-2"] [name="room_name"]')
      .setValue('北区三层完整语言实验教室 301')

    const coursesStore = useCoursesStore(pinia)
    coursesStore.loaded = true

    expect(wrapper.get('[data-testid="commit-import"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('[data-testid="commit-import"]').trigger('click')
    await flushPromises()

    expect(mocks.commitCourseImport).toHaveBeenCalledTimes(1)
    expect(coursesStore.loaded).toBe(false)
    expect(mocks.commitCourseImport).toHaveBeenCalledWith(file, 'a'.repeat(64), [
      {
        row_ref: 'row-1',
        building_id: 3,
        room_name: '423-425数据中国实验室1'
      },
      {
        row_ref: 'row-2',
        building_id: 3,
        room_name: '北区三层完整语言实验教室 301'
      }
    ])
    expect(mocks.createCourse).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('2 门课程已完整导入')

    await wrapper.get('[data-testid="view-courses"]').trigger('click')
    expect(mocks.push).toHaveBeenCalledWith('/courses')
  })

  it('locates a structured server conflict on its source row', async () => {
    const readyPreview: ImportPreviewResponse = {
      ...preview,
      candidates: preview.candidates.map((candidate) => ({
        ...candidate,
        suggested_room_name: candidate.suggested_room_name ?? '301',
        errors: []
      })),
      can_commit: true
    }
    mocks.previewCourseImport.mockResolvedValue(readyPreview)
    mocks.commitCourseImport.mockRejectedValue(
      businessError('course_conflict', '导入课程存在时间冲突', {
        conflicts: [
          {
            row_ref: 'row-2',
            course_name: '大学英语',
            conflicting_course_name: '数据分析',
            overlap_weeks: [2, 3]
          }
        ]
      })
    )
    const wrapper = await mountPage()
    await chooseAndPreview(wrapper)

    await wrapper.get('[data-testid="commit-import"]').trigger('click')
    await flushPromises()

    const row = wrapper.get('[data-row-ref="row-2"]')
    expect(row.classes()).toContain('is-highlighted')
    expect(row.text()).toContain('与「数据分析」在第 2、3 周冲突')
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
  })
})

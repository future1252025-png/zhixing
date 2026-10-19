import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useCoursesStore } from '@/stores/courses'
import { useAuthStore } from '@/stores/auth'
import { useSemesterStore } from '@/stores/semester'
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
  showSuccessToast: vi.fn(),
  nativeHubuImportAvailable: vi.fn(),
  captureHubuCourseTable: vi.fn(),
  captureToHtmlFile: vi.fn()
}))

vi.mock('@capacitor/core', async (importOriginal) => ({ ...await importOriginal<typeof import('@capacitor/core')>(),
  Capacitor: { isNativePlatform: () => mocks.nativeHubuImportAvailable(), getPlatform: () => mocks.nativeHubuImportAvailable() ? 'android' : 'web' } }))

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

vi.mock('@/native/hubuCourseImport', () => ({
  HUBU_ACADEMIC_SYSTEM_URL: 'https://jwxt.hubu.edu.cn/jsxsd/',
  supportsNativeHubuCourseImport: mocks.nativeHubuImportAvailable,
  captureHubuCourseTable: mocks.captureHubuCourseTable,
  captureToHtmlFile: mocks.captureToHtmlFile
}))

vi.mock('vant', () => ({
  showConfirmDialog: vi.fn(),
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
    useAuthStore(pinia).currentUser = { id: 1, student_id: '20240001', nickname: '测试同学',
      avatar_text: null, avatar_color: null, role: 'student', created_at: '2026-01-01T00:00:00Z' }
    const semester = useSemesterStore(pinia)
    semester.loadedForUserId = 1
    semester.lastFetchedAt = Date.now()
    semester.semester = { status: 'active', start_date: '2026-08-31', total_weeks: 20, current_week: 4 }
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
    mocks.getCourses.mockResolvedValue([])
    mocks.commitCourseImport.mockResolvedValue({ created_count: 2, course_ids: [31, 32] })
    mocks.nativeHubuImportAvailable.mockReturnValue(false)
    mocks.captureHubuCourseTable.mockResolvedValue({ cancelled: true })
    mocks.captureToHtmlFile.mockImplementation((capture: { html: string; filename?: string }) =>
      new File([capture.html], capture.filename ?? '湖北大学教务系统课表.html', {
        type: 'text/html'
      })
    )
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      value: vi.fn(),
      configurable: true
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('allows import when only the map location is unresolved', async () => {
    const wrapper = await mountPage()
    await chooseAndPreview(wrapper)

    expect(wrapper.text()).toContain('HTM / HTML / XLS / XLSX')
    expect(wrapper.get('[data-testid="commit-import"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).toContain('地点会照原文导入')
    expect(wrapper.text()).toContain('全部课程都可按原文导入')
    expect(wrapper.find('[name="room_name"]').exists()).toBe(false)
  })

  it('makes the Android-only boundary explicit without exposing a fake web capture action', async () => {
    const wrapper = await mountPage()

    expect(wrapper.text()).toContain('选择课表文件')
    expect(wrapper.find('[data-testid="hubu-native-import"]').exists()).toBe(false)
    expect(wrapper.get('.hubu-browser-link').attributes('href')).toBe(
      'https://jwxt.hubu.edu.cn/jsxsd/'
    )
    expect(wrapper.text()).toContain('先在学校教务系统导出课表')
  })

  it('waits for time review before committing a table returned by the native Hubu browser', async () => {
    mocks.nativeHubuImportAvailable.mockReturnValue(true)
    const capture = {
      cancelled: false,
      filename: '2026-2027-1-湖北大学课表.html',
      html: '<table><tr><th>星期一</th></tr></table>',
      sourceUrl: 'https://jwxt.hubu.edu.cn/jsxsd/xskb/xskb_list.do'
    }
    const capturedFile = new File([capture.html], capture.filename, { type: 'text/html' })
    mocks.captureHubuCourseTable.mockResolvedValue(capture)
    mocks.captureToHtmlFile.mockReturnValue(capturedFile)

    const wrapper = await mountPage()
    await wrapper.get('[data-testid="hubu-native-import"]').trigger('click')
    await flushPromises()

    expect(mocks.captureHubuCourseTable).toHaveBeenCalledTimes(1)
    expect(wrapper.find('input[type="file"]').exists()).toBe(false)
    expect(wrapper.find('.upload-sheet').exists()).toBe(false)
    expect(mocks.captureToHtmlFile).toHaveBeenCalledWith(capture)
    expect(mocks.previewCourseImport).toHaveBeenCalledWith(capturedFile)
    expect(mocks.commitCourseImport).not.toHaveBeenCalled()
    expect((wrapper.get('[data-testid="start-row-1"]').element as HTMLInputElement).value).toBe('08:00')
    await wrapper.get('[data-testid="commit-import"]').trigger('click')
    await flushPromises()
    expect(mocks.commitCourseImport).toHaveBeenCalledWith(capturedFile, 'a'.repeat(64), [], [])
    expect(wrapper.text()).toContain('已从湖北大学教务系统安全采集')
    expect(wrapper.get('.capture-source').attributes('href')).toBe(capture.sourceUrl)
    expect(wrapper.text()).toContain('2 门课程已覆盖导入')
  })

  it('submits the unchanged original file without per-row location resolutions', async () => {
    const wrapper = await mountPage()
    const file = await chooseAndPreview(wrapper)

    const coursesStore = useCoursesStore(pinia)
    coursesStore.loaded = true

    expect(wrapper.get('[data-testid="commit-import"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('[data-testid="commit-import"]').trigger('click')
    await flushPromises()

    expect(mocks.commitCourseImport).toHaveBeenCalledTimes(1)
    expect(coursesStore.loaded).toBe(false)
    expect(mocks.commitCourseImport).toHaveBeenCalledWith(file, 'a'.repeat(64), [], [])
    expect(mocks.createCourse).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('2 门课程已覆盖导入')

    await wrapper.get('[data-testid="view-courses"]').trigger('click')
    expect(mocks.push).toHaveBeenCalledWith('/courses')
  })

  it('lets users correct imported clocks without modifying the original file or source text', async () => {
    const wrapper = await mountPage()
    const file = await chooseAndPreview(wrapper)
    expect(wrapper.get('.import-time-editor').attributes('disabled')).toBeUndefined()
    await wrapper.get('[data-testid="start-row-1"]').setValue('14:30')
    await wrapper.get('[data-testid="end-row-1"]').setValue('16:10')
    await wrapper.get('[data-testid="commit-import"]').trigger('click')
    await flushPromises()
    expect(mocks.commitCourseImport).toHaveBeenCalledWith(file, 'a'.repeat(64), [], [
      { row_ref: 'row-1', start_time: '14:30', end_time: '16:10' }
    ])
    expect(preview.candidates[0]!.start_time).toBe('08:00')
    expect(preview.candidates[0]!.source.raw_time_or_section).toBe('第1-2节 08:00-09:40')
  })

  it('requires a complete increasing time range when a user edits a clock', async () => {
    const wrapper = await mountPage()
    await chooseAndPreview(wrapper)
    await wrapper.get('[data-testid="start-row-1"]').setValue('14:30')
    expect(wrapper.get('[data-testid="commit-import"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('结束时间必须晚于开始时间')
    await wrapper.get('[data-testid="end-row-1"]').setValue('')
    expect(wrapper.text()).toContain('请填写完整的开始和结束时间')
    expect(mocks.commitCourseImport).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="end-row-1"]').setValue('16:10')
    expect(wrapper.get('[data-testid="commit-import"]').attributes('disabled')).toBeUndefined()
  })

  it('fills an unrecognized clock in preview and removes its pending-time notice', async () => {
    mocks.previewCourseImport.mockResolvedValue({
      ...preview,
      candidates: [{ ...preview.candidates[0]!, start_time: null, end_time: null,
        errors: [{ code: 'time_unrecognized', field: 'time', message: '无法识别上课时间' }] }]
    })
    const wrapper = await mountPage()
    const file = await chooseAndPreview(wrapper)
    expect((wrapper.get('[data-testid="start-row-1"]').element as HTMLInputElement).value).toBe('')
    await wrapper.get('[data-testid="start-row-1"]').setValue('14:30')
    expect(wrapper.get('[data-testid="commit-import"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="end-row-1"]').setValue('16:10')
    expect(wrapper.text()).not.toContain('1 门课程之后可继续补全')
    await wrapper.get('[data-testid="commit-import"]').trigger('click')
    await flushPromises()
    expect(mocks.commitCourseImport).toHaveBeenCalledWith(file, 'a'.repeat(64), [], [
      { row_ref: 'row-1', start_time: '14:30', end_time: '16:10' }
    ])
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

  it('keeps a course importable when its schedule still needs completion', async () => {
    mocks.previewCourseImport.mockResolvedValue({
      ...preview,
      candidates: [
        {
          ...preview.candidates[0]!,
          start_time: null,
          end_time: null,
          errors: [{ code: 'time_unrecognized', field: 'time', message: '无法识别上课时间' }]
        }
      ]
    })
    const wrapper = await mountPage()
    await chooseAndPreview(wrapper)

    expect(wrapper.get('[data-testid="commit-import"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).toContain('待补全课程')
    expect(wrapper.text()).toContain('1 门课程之后可继续补全')

    await wrapper.get('[data-testid="commit-import"]').trigger('click')
    await flushPromises()

    expect(mocks.commitCourseImport).toHaveBeenCalledTimes(1)
  })

  it('automatically excludes a blocking row and imports the remaining courses', async () => {
    mocks.previewCourseImport.mockResolvedValue({
      ...preview,
      candidates: [
        preview.candidates[0]!,
        {
          ...preview.candidates[1]!,
          weeks: null,
          errors: [
            { code: 'weeks_unrecognized', field: 'weeks', message: '无法识别上课周次' }
          ]
        }
      ],
      can_commit: false
    })
    mocks.commitCourseImport.mockResolvedValue({ created_count: 1, course_ids: [31] })
    const wrapper = await mountPage()
    const file = await chooseAndPreview(wrapper)

    expect(wrapper.get('[data-row-ref="row-2"]').classes()).toContain('is-excluded')
    expect(wrapper.text()).toContain('这门课程已从本次导入中排除')
    expect(wrapper.text()).toContain('已排除 1 门，本次导入 1 门')
    expect(wrapper.get('[data-testid="commit-import"]').attributes('disabled')).toBeUndefined()

    await wrapper.get('[data-testid="commit-import"]').trigger('click')
    await flushPromises()

    expect(mocks.commitCourseImport).toHaveBeenCalledWith(
      file,
      'a'.repeat(64),
      ['row-2'],
      []
    )
    expect(wrapper.text()).toContain('1 门课程已覆盖导入')
    expect(wrapper.text()).toContain('另有 1 门课程未导入')
    expect(wrapper.text()).toContain('大学英语')
    expect(wrapper.text()).toContain('无法识别上课周次')
  })

  it('auto-skips invalid and empty-schedule rows returned by the native browser', async () => {
    mocks.nativeHubuImportAvailable.mockReturnValue(true)
    const capture = {
      cancelled: false,
      filename: '湖北大学课表.html',
      html: '<table></table>',
      sourceUrl: 'https://jwxt.hubu.edu.cn/jsxsd/xskb/xskb_list.do'
    }
    const capturedFile = new File([capture.html], capture.filename, { type: 'text/html' })
    mocks.captureHubuCourseTable.mockResolvedValue(capture)
    mocks.captureToHtmlFile.mockReturnValue(capturedFile)
    mocks.previewCourseImport.mockResolvedValue({
      ...preview,
      candidates: [
        preview.candidates[0]!,
        {
          ...preview.candidates[1]!,
          source: source({
            raw_course_name: '课程设计',
            raw_time_or_section: '',
            raw_location: ''
          }),
          course_name: '课程设计',
          start_time: null,
          end_time: null,
          weeks: null,
          suggested_building_id: null,
          suggested_building_name: null,
          suggested_room_name: null,
          errors: [
            { code: 'weeks_unrecognized', field: 'weeks', message: '无法识别上课周次' },
            { code: 'time_unrecognized', field: 'time', message: '无法识别上课时间' },
            { code: 'room_missing', field: 'room_name', message: '缺少上课地点' }
          ]
        }
      ],
      can_commit: false
    })
    mocks.commitCourseImport.mockResolvedValue({ created_count: 1, course_ids: [41] })

    const wrapper = await mountPage()
    await wrapper.get('[data-testid="hubu-native-import"]').trigger('click')
    await flushPromises()

    expect(mocks.commitCourseImport).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="commit-import"]').trigger('click')
    await flushPromises()
    expect(mocks.commitCourseImport).toHaveBeenCalledWith(
      capturedFile,
      'a'.repeat(64),
      ['row-2'],
      []
    )
    expect(wrapper.text()).toContain('1 门课程已覆盖导入')
    expect(wrapper.text()).toContain('另有 1 门课程未导入')
    expect(wrapper.text()).toContain('课程设计')
    expect(wrapper.text()).toContain('无法识别上课周次')
    expect(wrapper.text()).toContain('没有可用的上课时间和地点')
  })
})

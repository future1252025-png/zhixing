import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import { getBuildings } from '@/api/buildings'
import { getCourses } from '@/api/courses'
import { fetchSemester } from '@/api/semester'
import { useAuthStore } from '@/stores/auth'
import { useSemesterStore, SEMESTER_FRESH_MS } from '@/stores/semester'
import { useCoursesStore } from '@/stores/courses'
import { rememberRecentChatEntry } from '@/utils/chat'
import { createScopedStorage } from '@/utils/scopedStorage'
import type { Course } from '@/types/course'
import HomePage from './HomePage.vue'
import selectionFixture from '../../../tests/fixtures/course-selection.json'

vi.mock('@/api/buildings', () => ({ getBuildings: vi.fn() }))
vi.mock('@/api/courses', () => ({ getCourses: vi.fn() }))
vi.mock('@/api/semester', () => ({
  fetchSemester: vi.fn(),
  saveSemester: vi.fn()
}))
vi.mock('@/components/RealCampusMap.vue', () => ({
  default: defineComponent({ template: '<div data-testid="campus-map">map</div>' })
}))

function course(overrides: Partial<Course>): Course {
  const { building, ...rest } = overrides
  return {
    id: 1,
    course_name: '课程',
    weekday: 1,
    start_time: '09:00',
    end_time: '10:40',
    building_id: 2,
    room_name: '东区三层 A101',
    source_location: null,
    teacher: null,
    weeks: '4',
    source_kind: 'manual',
    needs_location_review: false,
    created_at: '2026-09-01T00:00:00Z',
    ...rest,
    building: Object.prototype.hasOwnProperty.call(overrides, 'building')
      ? building ?? null
      : { id: 2, name: '综合教学楼', type: '教学楼' }
  }
}

async function mountHome(pinia = createPinia()) {
  useAuthStore(pinia).currentUser = {
    id: 7,
    student_id: '20240001',
    nickname: '同学',
    avatar_text: null,
    avatar_color: null,
    role: 'user',
    created_at: '2026-01-01T00:00:00Z'
  }
  const EmptyRoute = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: EmptyRoute },
      { path: '/map', component: EmptyRoute },
      { path: '/courses', component: EmptyRoute },
      { path: '/courses/import', component: EmptyRoute },
      { path: '/schedule', component: EmptyRoute },
      { path: '/buildings/:id/chats', component: EmptyRoute },
      { path: '/buildings/:id/messages', component: EmptyRoute },
      { path: '/courses/:id/edit', component: EmptyRoute }
    ]
  })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(HomePage, {
    global: {
      plugins: [pinia, router],
      directives: { reveal: {} }
    }
  })
  await flushPromises()
  return wrapper
}

describe('HomePage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-21T07:00:00+08:00'))
    localStorage.clear()
    sessionStorage.clear()
    localStorage.setItem('campusmind:7:browsing-week', '9')
    vi.mocked(getBuildings).mockResolvedValue([
      {
        id: 2,
        name: '综合教学楼',
        type: '教学楼',
        description: '上课地点',
        latitude: 30.59,
        longitude: 114.33,
        map_x: 0,
        map_y: 0,
        walk_hint: null
      }
    ])
    vi.mocked(fetchSemester).mockResolvedValue({
      status: 'active',
      start_date: '2026-08-31',
      total_weeks: 20,
      current_week: 4
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('shows courses before a slow building request finishes', async () => {
    let finishBuildings!: (value: Awaited<ReturnType<typeof getBuildings>>) => void
    vi.mocked(getBuildings).mockReturnValueOnce(new Promise(resolve => { finishBuildings = resolve }))
    vi.mocked(getCourses).mockResolvedValue([course({ course_name: '无需等地图的课程' })])
    const wrapper = await mountHome()
    expect(wrapper.get('.today-card').text()).toContain('无需等地图的课程')
    expect(wrapper.find('.home-semester-loading').exists()).toBe(false)
    finishBuildings([])
    await flushPromises()
    wrapper.unmount()
  })

  it('isolates building failures from courses and locally saved recent chats', async () => {
    vi.mocked(getBuildings).mockRejectedValueOnce(new Error('map offline'))
    vi.mocked(getCourses).mockResolvedValue([course({ course_name: '正常课程' })])
    rememberRecentChatEntry(createScopedStorage(7), { buildingId: 2, buildingName: '综合教学楼', roomName: '410' })
    const wrapper = await mountHome()
    expect(wrapper.get('.today-card').text()).toContain('正常课程')
    expect(wrapper.get('.recent-section').text()).toContain('410')
    expect(wrapper.get('.search-sheet').text()).toContain('地点暂未加载')
    wrapper.unmount()
  })

  it('does not show a loading card or refetch on a warm revisit, even with a slow stale refresh', async () => {
    const pinia = createPinia()
    vi.mocked(getCourses).mockResolvedValue([course({ course_name: '缓存课程' })])
    const first = await mountHome(pinia)
    first.unmount()
    const second = await mountHome(pinia)
    expect(second.get('.today-card').text()).toContain('缓存课程')
    expect(fetchSemester).toHaveBeenCalledTimes(1)
    expect(getCourses).toHaveBeenCalledTimes(1)
    second.unmount()
    vi.advanceTimersByTime(SEMESTER_FRESH_MS)
    let rejectRefresh!: (reason: unknown) => void
    vi.mocked(fetchSemester).mockReturnValueOnce(new Promise((_, reject) => { rejectRefresh = reject }))
    const third = await mountHome(pinia)
    expect(useSemesterStore(pinia).loading).toBe(true)
    expect(third.find('.home-semester-loading').exists()).toBe(false)
    expect(third.get('.today-card').text()).toContain('缓存课程')
    rejectRefresh(new Error('offline'))
    await flushPromises()
    expect(third.get('.today-card').text()).toContain('缓存课程')
    expect(third.text()).toContain('当前按已保存设置显示')
    // Store updates remain visible without remounting after import/edit or background sync.
    useCoursesStore(pinia).courses = [course({ course_name: '更新后的课程' })]
    await flushPromises()
    expect(third.get('.today-card').text()).toContain('更新后的课程')
    third.unmount()
  })

  it('removes popular places and opens the map from the channel shortcut when there is no history', async () => {
    vi.mocked(getCourses).mockResolvedValue([])
    const wrapper = await mountHome()
    expect(wrapper.find('.places-section').exists()).toBe(false)
    expect(wrapper.find('.place-grid').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('校园里的常去处')
    expect(wrapper.find('[data-testid="campus-map"]').exists()).toBe(true)
    await wrapper.get('.note-lilac').trigger('click')
    await flushPromises()
    expect(wrapper.vm.$router.currentRoute.value.path).toBe('/map')
    wrapper.unmount()
  })

  it('opens the current-week shortcut at the week selector rather than the page header', async () => {
    vi.mocked(getCourses).mockResolvedValue([])
    const wrapper = await mountHome()
    await wrapper.get('.note-yellow').trigger('click')
    await flushPromises()
    expect(wrapper.vm.$router.currentRoute.value.fullPath).toBe('/courses#current-week')
    wrapper.unmount()
  })

  it('preserves recent places and the shortcut to the last chat', async () => {
    vi.mocked(getCourses).mockResolvedValue([])
    rememberRecentChatEntry(createScopedStorage(7), {
      buildingId: 2, buildingName: '综合教学楼', roomName: '410'
    })
    const wrapper = await mountHome()
    expect(wrapper.get('.recent-section').text()).toContain('最近去过')
    expect(wrapper.get('.recent-row button').text()).toContain('410')
    await wrapper.get('.recent-row button').trigger('click')
    await flushPromises()
    expect(wrapper.vm.$router.currentRoute.value.fullPath).toBe('/buildings/2/messages?room_name=410')
    await wrapper.vm.$router.push('/')
    await wrapper.get('.note-lilac').trigger('click')
    await flushPromises()
    expect(wrapper.vm.$router.currentRoute.value.fullPath).toBe('/buildings/2/messages?room_name=410')
    wrapper.unmount()
  })

  it('uses the semester current week and ignores the timetable browsing week', async () => {
    vi.mocked(getCourses).mockResolvedValue([
      course({ id: 4, course_name: '真实周课程', weeks: '4' }),
      course({ id: 9, course_name: '浏览周课程', weeks: '9' })
    ])

    const wrapper = await mountHome()

    expect(wrapper.text()).toContain('真实第 4 周')
    expect(wrapper.text()).toContain('真实周课程')
    expect(wrapper.text()).toContain('综合教学楼 · 东区三层 A101')
    expect(wrapper.text()).not.toContain('浏览周课程')
    wrapper.unmount()
  })

  it('shows Tuesday once the final Monday course has started', async () => {
    vi.setSystemTime(new Date('2026-08-31T14:00:45+08:00'))
    vi.mocked(fetchSemester).mockResolvedValue({
      status: 'active',
      start_date: '2026-08-31',
      total_weeks: 20,
      current_week: 1
    })
    vi.mocked(getCourses).mockResolvedValue([
      course({
        id: 1,
        course_name: '周一下午课',
        weekday: 1,
        start_time: '14:00',
        end_time: '15:40',
        weeks: '1'
      }),
      course({ id: 2, course_name: '周二第一节', weekday: 2, start_time: '08:00', weeks: '1' })
    ])

    const wrapper = await mountHome()

    expect(wrapper.text()).not.toContain('周一下午课')
    expect(wrapper.text()).toContain('周二第一节')
    wrapper.unmount()
  })

  it('opens course editing instead of an invalid building route for an unmapped location', async () => {
    vi.mocked(getCourses).mockResolvedValue([
      course({
        id: 5,
        course_name: '地图未收录课程',
        building_id: null,
        building: null,
        source_location: '创新创业中心西区 302',
        needs_location_review: true
      })
    ])

    const wrapper = await mountHome()
    const router = wrapper.vm.$router
    await wrapper.get('.home-next-course .course-card__main').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/courses/5/edit')
    wrapper.unmount()
  })

  it.each(['2026-09-07T14:09:00+08:00', '2026-09-07T14:30:00+08:00'])('shows Java after the preceding course has started at %s', async (time) => {
    vi.setSystemTime(new Date(time))
    vi.mocked(getCourses).mockResolvedValue(selectionFixture.courses.map(course))
    const wrapper = await mountHome()
    expect(wrapper.get('.today-copy').text()).not.toContain('习近平新时代中国特色社会主义思想概论')
    expect(wrapper.get('.today-copy').text()).toContain('接下来的课程')
    expect(wrapper.get('.today-copy').text()).toContain('JAVA应用开发')
    expect(wrapper.text()).toContain('真实第 2 周')
    wrapper.unmount()
  })

  it('switches at the start boundary while staying on the page, without reloading', async () => {
    vi.setSystemTime(new Date('2026-09-07T13:59:59+08:00'))
    vi.mocked(getCourses).mockResolvedValue(selectionFixture.courses.map(course))
    const wrapper = await mountHome()
    expect(wrapper.get('.today-copy').text()).toContain('习近平新时代中国特色社会主义思想概论')
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.get('.today-copy').text()).toContain('JAVA应用开发')
    expect(wrapper.get('.today-copy').text()).not.toContain('正在上课')
    expect(getCourses).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('recomputes date and teaching week on resume without using the cached week', async () => {
    vi.setSystemTime(new Date('2026-09-13T23:59:59+08:00'))
    vi.mocked(getCourses).mockResolvedValue(selectionFixture.courses.map(course))
    const wrapper = await mountHome()
    expect(wrapper.find('.home-next-course').exists()).toBe(false)
    vi.setSystemTime(new Date('2026-09-14T14:09:00+08:00'))
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(wrapper.text()).toContain('真实第 3 周')
    expect(wrapper.get('.today-copy').text()).toContain('JAVA应用开发')
    expect(wrapper.get('.home-top time').text()).toContain('9月14日')
    wrapper.unmount()
  })

  it('shows a semester setup path instead of guessing week one', async () => {
    vi.mocked(getCourses).mockResolvedValue([])
    vi.mocked(fetchSemester).mockResolvedValue({
      status: 'unconfigured',
      start_date: null,
      total_weeks: null,
      current_week: null
    })

    const wrapper = await mountHome()

    expect(wrapper.text()).toContain('请先设置学期')
    expect(wrapper.text()).not.toContain('真实第 1 周')
    wrapper.unmount()
  })

  it('plays the saved login handoff without covering the page actions', async () => {
    vi.mocked(getCourses).mockResolvedValue([
      course({ id: 4, course_name: '真实周课程', weeks: '4' })
    ])
    sessionStorage.setItem('campusmind-login-intro-pending', '1')
    sessionStorage.setItem('campusmind-login-intro-snapshot', JSON.stringify({
      courseName: '真实周课程',
      startTime: '09:00',
      buildingName: '综合教学楼',
      roomName: '东区三层 A101'
    }))

    const wrapper = await mountHome()

    expect(wrapper.get('.login-welcome').text()).toContain('真实周课程')
    expect(wrapper.get('.login-welcome').text()).toContain('综合教学楼 · 东区三层 A101')
    vi.advanceTimersByTime(3600)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.login-welcome').exists()).toBe(false)
    wrapper.unmount()
  })

  it('jumps to the timetable when the welcome card with a course snapshot is tapped', async () => {
    vi.mocked(getCourses).mockResolvedValue([
      course({ id: 4, course_name: '真实周课程', weeks: '4' })
    ])
    sessionStorage.setItem('campusmind-login-intro-pending', '1')
    sessionStorage.setItem('campusmind-login-intro-snapshot', JSON.stringify({
      courseName: '真实周课程',
      startTime: '09:00',
      buildingName: '综合教学楼',
      roomName: '东区三层 A101'
    }))

    const wrapper = await mountHome()
    const router = wrapper.vm.$router

    await wrapper.get('.login-welcome').trigger('click')
    await flushPromises()
    expect(wrapper.find('.login-welcome').exists()).toBe(false)
    expect(router.currentRoute.value.path).toBe('/courses')
    wrapper.unmount()
  })
})

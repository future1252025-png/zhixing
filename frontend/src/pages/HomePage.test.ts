import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import { getBuildings } from '@/api/buildings'
import { getCourses } from '@/api/courses'
import { fetchSemester } from '@/api/semester'
import { useAuthStore } from '@/stores/auth'
import type { Course } from '@/types/course'
import HomePage from './HomePage.vue'

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
    teacher: null,
    weeks: '4',
    source_kind: 'manual',
    needs_location_review: false,
    created_at: '2026-09-01T00:00:00Z',
    ...rest,
    building: building ?? { id: 2, name: '综合教学楼', type: '教学楼' }
  }
}

async function mountHome() {
  const pinia = createPinia()
  useAuthStore(pinia).currentUser = {
    id: 7,
    student_id: null,
    username: 'student',
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

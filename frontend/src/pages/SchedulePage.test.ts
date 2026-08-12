import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import { getBuildings } from '@/api/buildings'
import { getScheduleSuggestion } from '@/api/schedule'
import { fetchSemester } from '@/api/semester'
import { useAuthStore } from '@/stores/auth'
import type { SemesterState } from '@/types/semester'
import SchedulePage from './SchedulePage.vue'

vi.mock('@/api/buildings', () => ({ getBuildings: vi.fn() }))
vi.mock('@/api/schedule', () => ({ getScheduleSuggestion: vi.fn() }))
vi.mock('@/api/semester', () => ({
  fetchSemester: vi.fn(),
  saveSemester: vi.fn()
}))
vi.mock('@/components/RealCampusMap.vue', () => ({
  default: defineComponent({
    name: 'RealCampusMap',
    template: '<div data-testid="real-campus-map">map</div>'
  })
}))

const buildings = [
  {
    id: 1,
    name: '图书馆',
    type: '校园地点',
    description: '起点',
    latitude: 30.58,
    longitude: 114.32,
    map_x: 0,
    map_y: 0,
    walk_hint: null
  },
  {
    id: 2,
    name: '综合教学楼',
    type: '教学楼',
    description: '终点',
    latitude: 30.59,
    longitude: 114.33,
    map_x: 0,
    map_y: 0,
    walk_hint: null
  }
]

const activeSemester: SemesterState = {
  status: 'active',
  start_date: '2026-08-31',
  total_weeks: 20,
  current_week: 2
}

const suggestion = {
  next_course: {
    id: 1,
    course_name: '数据库原理',
    weekday: 3,
    start_time: '09:00',
    end_time: '10:40',
    room_name: '东区三层 A101',
    teacher: '张老师',
    weeks: '1-16',
    teaching_week: 2,
    start_at: '2026-09-09T09:00:00+08:00'
  },
  from_location: {
    building_id: 1,
    name: '图书馆',
    latitude: 30.58,
    longitude: 114.32
  },
  target_building: {
    id: 2,
    name: '综合教学楼',
    latitude: 30.59,
    longitude: 114.33
  },
  distance_meters: 600,
  walk_minutes: 8,
  buffer_minutes: 10,
  suggest_departure_time: '08:42',
  status: 'normal' as const,
  text: '建议 08:42 出发',
  warning: null
}

function businessError(code: string, details: Record<string, unknown> = {}) {
  return {
    response: {
      status: 409,
      data: {
        code,
        message: 'server wording must not drive the UI',
        fields: [],
        details
      }
    }
  }
}

async function mountSchedule(
  semester: SemesterState = activeSemester
): Promise<{ wrapper: VueWrapper; router: Router }> {
  vi.mocked(fetchSemester).mockResolvedValue(semester)
  const pinia = createPinia()
  const authStore = useAuthStore(pinia)
  authStore.currentUser = {
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
      { path: '/courses', component: EmptyRoute },
      { path: '/courses/:id/edit', component: EmptyRoute }
    ]
  })
  await router.push('/')
  await router.isReady()

  const wrapper = mount(SchedulePage, {
    global: {
      plugins: [pinia, router],
      directives: { reveal: {} }
    }
  })
  await flushPromises()
  await nextTick()
  return { wrapper, router }
}

describe('SchedulePage', () => {
  beforeEach(() => {
    vi.mocked(getBuildings).mockResolvedValue(buildings)
    vi.mocked(getScheduleSuggestion).mockResolvedValue(suggestion)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('does not offer or request departure advice before semester setup', async () => {
    const { wrapper } = await mountSchedule({
      status: 'unconfigured',
      start_date: null,
      total_weeks: null,
      current_week: null
    })

    expect(wrapper.text()).toContain('请先设置学期')
    expect(wrapper.find('.generate-button').exists()).toBe(false)
    expect(getScheduleSuggestion).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it.each([
    ['before_term' as const, '学期尚未开始'],
    ['after_term' as const, '本学期已结束']
  ])('shows the %s semester state distinctly', async (status, label) => {
    const { wrapper } = await mountSchedule({
      status,
      start_date: '2026-08-31',
      total_weeks: 20,
      current_week: null
    })

    expect(wrapper.text()).toContain(label)
    expect(wrapper.find('.generate-button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders the complete building and classroom from the backend suggestion', async () => {
    const { wrapper } = await mountSchedule()

    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(getScheduleSuggestion).toHaveBeenCalledWith({ current_building_id: 1 })
    expect(wrapper.text()).toContain('综合教学楼 · 东区三层 A101')
    wrapper.unmount()
  })

  it('shows the exact no-upcoming state instead of guessing from a course preload', async () => {
    vi.mocked(getScheduleSuggestion).mockRejectedValue(businessError('no_upcoming_course'))
    const { wrapper } = await mountSchedule()

    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('本周暂无后续课程')
    expect(wrapper.find('[data-error-code="no_upcoming_course"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('identifies the exact course with an incomplete location and opens its editor', async () => {
    vi.mocked(getScheduleSuggestion).mockRejectedValue(businessError(
      'course_location_incomplete',
      { course_id: 18, course_name: '软件工程' }
    ))
    const { wrapper, router } = await mountSchedule()

    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('“软件工程”地点不完整')
    await wrapper.get('[data-testid="schedule-recovery-action"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/courses/18/edit')
    wrapper.unmount()
  })

  it('mounts the route map only after expanding a generated suggestion', async () => {
    const { wrapper } = await mountSchedule()

    await wrapper.get('.generate-button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="real-campus-map"]').exists()).toBe(false)

    const toggle = wrapper.get('.map-toggle')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(wrapper.find('[data-testid="real-campus-map"]').exists()).toBe(true)
    wrapper.unmount()
  })
})

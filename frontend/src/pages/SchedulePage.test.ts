import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import { createApp, defineComponent, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import { getBuildings } from '@/api/buildings'
import { getCourses } from '@/api/courses'
import { getScheduleSuggestion } from '@/api/schedule'
import SchedulePage from './SchedulePage.vue'


vi.mock('@/api/buildings', () => ({
  getBuildings: vi.fn()
}))

vi.mock('@/api/courses', () => ({
  getCourses: vi.fn()
}))

vi.mock('@/api/schedule', () => ({
  getScheduleSuggestion: vi.fn()
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
    name: '教学楼',
    type: '教学楼',
    description: '终点',
    latitude: 30.59,
    longitude: 114.33,
    map_x: 0,
    map_y: 0,
    walk_hint: null
  }
]

const courses = [
  {
    id: 1,
    course_name: '数据库原理',
    weekday: 3,
    start_time: '09:00',
    end_time: '10:40',
    building_id: 2,
    building: { id: 2, name: '教学楼', type: '教学楼' },
    room_name: 'A101',
    teacher: '张老师',
    weeks: '1-16',
    created_at: '2026-09-01T00:00:00Z'
  }
]

const suggestion = {
  next_course: {
    id: 1,
    course_name: '数据库原理',
    weekday: 3,
    start_time: '09:00',
    end_time: '10:40',
    room_name: 'A101',
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
    name: '教学楼',
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


async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}


describe('SchedulePage route map lifecycle', () => {
  let host: HTMLDivElement

  beforeEach(() => {
    vi.mocked(getBuildings).mockResolvedValue(buildings)
    vi.mocked(getCourses).mockResolvedValue(courses)
    vi.mocked(getScheduleSuggestion).mockResolvedValue(suggestion)
    host = document.createElement('div')
    document.body.append(host)
  })

  afterEach(() => {
    host.remove()
    vi.clearAllMocks()
  })

  it('mounts the real map only after the collapsed route card is expanded', async () => {
    const EmptyRoute = { template: '<div />' }
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: EmptyRoute },
        { path: '/courses/new', component: EmptyRoute }
      ]
    })
    await router.push('/')
    await router.isReady()

    const application = createApp(SchedulePage)
    application.use(createPinia())
    application.use(router)
    application.directive('reveal', {})
    application.mount(host)
    await settle()

    const generateButton = host.querySelector<HTMLButtonElement>('.generate-button')
    expect(generateButton).not.toBeNull()
    generateButton?.click()
    await settle()

    expect(getScheduleSuggestion).toHaveBeenCalledWith({ current_building_id: 1 })
    expect(host.querySelector('[data-testid="real-campus-map"]')).toBeNull()

    const toggle = host.querySelector<HTMLButtonElement>('.map-toggle')
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    toggle?.click()
    await nextTick()

    expect(host.querySelector('[data-testid="real-campus-map"]')).not.toBeNull()
    application.unmount()
  })

  it('asks the backend for the authoritative schedule state when preload finds no courses', async () => {
    vi.mocked(getCourses).mockResolvedValue([])
    const EmptyRoute = { template: '<div />' }
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: EmptyRoute },
        { path: '/courses/new', component: EmptyRoute }
      ]
    })
    await router.push('/')
    await router.isReady()

    const application = createApp(SchedulePage)
    application.use(createPinia())
    application.use(router)
    application.directive('reveal', {})
    application.mount(host)
    await settle()

    const generateButton = host.querySelector<HTMLButtonElement>('.generate-button')
    expect(generateButton).not.toBeNull()
    generateButton?.click()
    await settle()

    expect(getScheduleSuggestion).toHaveBeenCalledWith({ current_building_id: 1 })
    application.unmount()
  })

  it('still asks the backend when the optional course-count preload fails', async () => {
    vi.mocked(getCourses).mockRejectedValue(new Error('course count unavailable'))
    const EmptyRoute = { template: '<div />' }
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: EmptyRoute },
        { path: '/courses/new', component: EmptyRoute }
      ]
    })
    await router.push('/')
    await router.isReady()

    const application = createApp(SchedulePage)
    application.use(createPinia())
    application.use(router)
    application.directive('reveal', {})
    application.mount(host)
    await settle()

    const generateButton = host.querySelector<HTMLButtonElement>('.generate-button')
    expect(generateButton).not.toBeNull()
    generateButton?.click()
    await settle()

    expect(getScheduleSuggestion).toHaveBeenCalledWith({ current_building_id: 1 })
    application.unmount()
  })
})

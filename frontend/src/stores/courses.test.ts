import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getCourses } from '@/api/courses'
import type { Course } from '@/types/course'
import { useCoursesStore } from './courses'

vi.mock('@/api/courses', () => ({
  getCourses: vi.fn()
}))

const courses: Course[] = [
  {
    id: 4,
    course_name: '数据库原理',
    weekday: 3,
    start_time: '09:00',
    end_time: '10:40',
    building_id: 2,
    building: { id: 2, name: '综合教学楼', type: '教学楼' },
    room_name: '东区三层 A101',
    source_location: null,
    teacher: '张老师',
    weeks: '1-16',
    source_kind: 'manual',
    needs_location_review: false,
    created_at: '2026-09-01T00:00:00Z'
  }
]

describe('courses store', () => {
  it('preserves the last course snapshot when a background refresh goes offline', async () => {
    setActivePinia(createPinia())
    vi.mocked(getCourses).mockResolvedValueOnce(courses)
    const store = useCoursesStore()
    await store.ensureLoaded()
    vi.mocked(getCourses).mockRejectedValueOnce(new Error('offline'))
    await expect(store.ensureLoaded(true)).rejects.toThrow('offline')
    expect(store.loaded).toBe(true)
    expect(store.courses).toEqual(courses)
  })
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(getCourses).mockResolvedValue(courses)
  })

  it('requests courses once and serves later calls from the cache', async () => {
    const store = useCoursesStore()

    const first = await store.ensureLoaded()
    const second = await store.ensureLoaded()

    expect(first).toEqual(courses)
    expect(second).toEqual(courses)
    expect(getCourses).toHaveBeenCalledTimes(1)
    expect(store.loaded).toBe(true)
  })

  it('shares one in-flight request between concurrent callers', async () => {
    const store = useCoursesStore()

    await Promise.all([store.ensureLoaded(), store.ensureLoaded()])

    expect(getCourses).toHaveBeenCalledTimes(1)
  })

  it('refetches after a course change invalidates the cache', async () => {
    const store = useCoursesStore()
    await store.ensureLoaded()

    store.invalidate()
    expect(store.loaded).toBe(false)
    await store.ensureLoaded()

    expect(getCourses).toHaveBeenCalledTimes(2)
  })

  it('records the failure and retries on the next call', async () => {
    vi.mocked(getCourses).mockRejectedValueOnce({
      response: {
        status: 500,
        data: { detail: '课程数据暂时不可用' }
      }
    })
    const store = useCoursesStore()

    await expect(store.ensureLoaded()).rejects.toBeTruthy()
    expect(store.errorMessage).toBe('课程数据暂时不可用')
    expect(store.loaded).toBe(false)
    expect(store.loading).toBe(false)

    await expect(store.ensureLoaded()).resolves.toEqual(courses)
    expect(store.errorMessage).toBe('')
    expect(getCourses).toHaveBeenCalledTimes(2)
  })
})

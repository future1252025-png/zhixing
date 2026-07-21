import { beforeEach, describe, expect, it, vi } from 'vitest'

import request from './request'
import {
  createCourse,
  deleteCourse,
  getCourses,
  previewCourseImport,
  updateCourse
} from './courses'

vi.mock('./request', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}))

const course = {
  id: 1,
  course_name: 'Mobile App Design',
  weekday: 1,
  start_time: '08:00',
  end_time: '09:40',
  building_id: 1,
  building: {
    id: 1,
    name: 'Library',
    type: 'Study'
  },
  room_name: 'A101',
  teacher: 'Teacher Li',
  weeks: '1-16',
  source_kind: 'import',
  needs_location_review: false,
  created_at: '2026-05-29T08:00:00'
}

const payload = {
  course_name: 'Mobile App Design',
  weekday: 1,
  start_time: '08:00',
  end_time: '09:40',
  building_id: 1,
  room_name: 'A101',
  teacher: 'Teacher Li',
  weeks: '1-16'
}

describe('courses api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches current user courses', async () => {
    vi.mocked(request.get).mockResolvedValue({ data: [course] })

    const result = await getCourses()

    expect(request.get).toHaveBeenCalledWith('/api/courses')
    expect(result[0].course_name).toBe('Mobile App Design')
    expect(result[0].source_kind).toBe('import')
    expect(result[0].needs_location_review).toBe(false)
  })

  it('creates a course', async () => {
    vi.mocked(request.post).mockResolvedValue({ data: course })

    const result = await createCourse(payload)

    expect(request.post).toHaveBeenCalledWith('/api/courses', payload)
    expect(result.id).toBe(1)
  })

  it('updates a course', async () => {
    vi.mocked(request.put).mockResolvedValue({ data: course })

    const result = await updateCourse(1, { room_name: 'B201' })

    expect(request.put).toHaveBeenCalledWith('/api/courses/1', { room_name: 'B201' })
    expect(result.id).toBe(1)
  })

  it('deletes a course', async () => {
    vi.mocked(request.delete).mockResolvedValue({})

    await deleteCourse(1)

    expect(request.delete).toHaveBeenCalledWith('/api/courses/1')
  })

  it('uploads an HTML or Excel course table for preview', async () => {
    const file = new File(['<table></table>'], 'schedule.html', { type: 'text/html' })
    vi.mocked(request.post).mockResolvedValue({
      data: {
        total: 0,
        matched_count: 0,
        needs_review_count: 0,
        items: []
      }
    })

    const result = await previewCourseImport(file)

    expect(request.post).toHaveBeenCalledWith(
      '/api/courses/import/preview',
      expect.any(FormData),
      expect.objectContaining({
        headers: { 'Content-Type': 'multipart/form-data' }
      })
    )
    expect(result.total).toBe(0)
  })
})

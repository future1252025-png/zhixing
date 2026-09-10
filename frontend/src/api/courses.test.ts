import { beforeEach, describe, expect, it, vi } from 'vitest'

import request from './request'
import {
  commitCourseImport,
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
  source_location: 'Library A101',
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
        file: { filename: 'schedule.html', sha256: 'a'.repeat(64), candidate_count: 0 },
        candidates: [],
        can_commit: false
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
    expect(result.file.filename).toBe('schedule.html')
  })

  it('commits the original file with only its verified digest', async () => {
    const file = new File(['original'], 'schedule.xlsx')
    vi.mocked(request.post).mockResolvedValue({
      data: { created_count: 1, course_ids: [17] }
    })

    const result = await commitCourseImport(file, 'b'.repeat(64))

    expect(request.post).toHaveBeenCalledTimes(1)
    const [path, body] = vi.mocked(request.post).mock.calls[0]!
    expect(path).toBe('/api/courses/import')
    expect(body).toBeInstanceOf(FormData)
    const form = body as FormData
    expect(form.get('file')).toBe(file)
    expect(JSON.parse(String(form.get('manifest')))).toEqual({ sha256: 'b'.repeat(64) })
    expect(result).toEqual({ created_count: 1, course_ids: [17] })
  })

  it('sends explicitly excluded preview rows in the verified manifest', async () => {
    const file = new File(['original'], 'schedule.xlsx')
    vi.mocked(request.post).mockResolvedValue({
      data: { created_count: 1, course_ids: [17] }
    })

    await commitCourseImport(file, 'c'.repeat(64), ['row-14'])

    const [, body] = vi.mocked(request.post).mock.calls[0]!
    const form = body as FormData
    expect(JSON.parse(String(form.get('manifest')))).toEqual({
      sha256: 'c'.repeat(64),
      excluded_row_refs: ['row-14']
    })
  })

  it('sends user-confirmed clocks alongside the untouched original file', async () => {
    const file = new File(['original'], 'schedule.html')
    vi.mocked(request.post).mockResolvedValue({ data: { created_count: 1, course_ids: [17] } })
    const times = [{ row_ref: 'row-1', start_time: '14:30', end_time: '16:10' }]
    await commitCourseImport(file, 'd'.repeat(64), [], times)
    const form = vi.mocked(request.post).mock.calls[0]![1] as FormData
    expect(form.get('file')).toBe(file)
    expect(JSON.parse(String(form.get('manifest')))).toEqual({ sha256: 'd'.repeat(64), time_resolutions: times })
  })
})

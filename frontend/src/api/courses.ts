import request from './request'
import type {
  Course,
  CourseImportPreviewResponse,
  CoursePayload,
  CourseUpdatePayload
} from '@/types/course'

export async function getCourses(): Promise<Course[]> {
  const response = await request.get<Course[]>('/api/courses')
  return response.data
}

export async function createCourse(payload: CoursePayload): Promise<Course> {
  const response = await request.post<Course>('/api/courses', payload)
  return response.data
}

export async function updateCourse(
  courseId: number,
  payload: CourseUpdatePayload
): Promise<Course> {
  const response = await request.put<Course>(`/api/courses/${courseId}`, payload)
  return response.data
}

export async function deleteCourse(courseId: number): Promise<void> {
  await request.delete(`/api/courses/${courseId}`)
}

export async function previewCourseImport(
  file: File
): Promise<CourseImportPreviewResponse> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await request.post<CourseImportPreviewResponse>(
    '/api/courses/import/preview',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' }
    }
  )
  return response.data
}

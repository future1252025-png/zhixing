import request from './request'
import type { Course, CoursePayload, CourseUpdatePayload } from '@/types/course'

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

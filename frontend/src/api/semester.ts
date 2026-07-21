import type { SemesterState, SemesterUpdate } from '@/types/semester'
import request from './request'

export async function fetchSemester(): Promise<SemesterState> {
  const response = await request.get<SemesterState>('/api/semester')
  return response.data
}

export async function saveSemester(payload: SemesterUpdate): Promise<SemesterState> {
  const response = await request.put<SemesterState>('/api/semester', payload)
  return response.data
}

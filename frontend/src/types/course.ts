export type CourseBuilding = {
  id: number
  name: string
  type: string
}

export type CourseSourceKind = 'manual' | 'import'

export type CourseMakeup = {
  date: string
  source_course_id: number
  source_date: string | null
  cancel_source: boolean
  batch_id: string
  location: string | null
}

export type Course = {
  id: number
  course_name: string
  weekday: number
  start_time: string | null
  end_time: string | null
  building_id: number | null
  building: CourseBuilding | null
  room_name: string
  source_location: string | null
  teacher: string | null
  weeks: string
  source_kind: CourseSourceKind
  needs_location_review: boolean
  created_at: string
  makeup?: CourseMakeup | null
}

export type MakeupTiming = { date: string; start_time: string; end_time: string; location?: string | null }
export type MakeupEntry = MakeupTiming & { source_course_id: number; source_date?: string | null; cancel_source?: boolean }
export type MakeupPayload = { request_id: string; entries: MakeupEntry[] }

export type CoursePayload = {
  course_name: string
  weekday: number
  start_time: string
  end_time: string
  building_id: number
  room_name: string
  teacher?: string | null
  weeks: string
}

export type CourseUpdatePayload = Partial<CoursePayload>

export type CourseForm = {
  course_name: string
  weekday: number
  start_time: string
  end_time: string
  building_id: number
  room_name: string
  teacher: string
  weeks: string
}

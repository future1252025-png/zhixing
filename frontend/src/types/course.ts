export type CourseBuilding = {
  id: number
  name: string
  type: string
}

export type CourseSourceKind = 'manual' | 'import'

export type Course = {
  id: number
  course_name: string
  weekday: number
  start_time: string
  end_time: string
  building_id: number | null
  building: CourseBuilding | null
  room_name: string
  source_location: string | null
  teacher: string | null
  weeks: string
  source_kind: CourseSourceKind
  needs_location_review: boolean
  created_at: string
}

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

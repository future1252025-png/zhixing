export type CourseBuilding = {
  id: number
  name: string
  type: string
}

export type Course = {
  id: number
  course_name: string
  weekday: number
  start_time: string
  end_time: string
  building_id: number
  building: CourseBuilding
  room_name: string
  teacher: string | null
  weeks: string | null
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
  weeks?: string | null
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

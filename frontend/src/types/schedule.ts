export type ScheduleSuggestionPayload = (
  | {
      current_building_id: number
      latitude?: never
      longitude?: never
    }
  | {
      current_building_id?: never
      latitude: number
      longitude: number
    }
)

export type ScheduleStatus = 'normal' | 'tight' | 'likely_late'

export type SchedulePageErrorCode =
  | 'semester_unconfigured'
  | 'semester_not_active'
  | 'no_upcoming_course'
  | 'course_location_incomplete'
  | 'schedule_conflict'
  | 'course_data_invalid'
  | 'unexpected_error'

export type SchedulePageError = {
  code: SchedulePageErrorCode
  title: string
  message: string
  semesterStatus: 'before_term' | 'after_term' | null
  courseId: number | null
  courseName: string | null
}

export type NextCourseInfo = {
  id: number
  course_name: string
  weekday: number
  start_time: string
  end_time: string
  room_name: string
  teacher: string | null
  weeks: string
  teaching_week: number
  start_at: string
}

export type ScheduleLocationInfo = {
  name: string
  latitude: number
  longitude: number
  building_id: number | null
}

export type ScheduleBuildingInfo = {
  id: number
  name: string
  latitude: number
  longitude: number
}

export type ScheduleSuggestion = {
  next_course: NextCourseInfo
  from_location: ScheduleLocationInfo
  target_building: ScheduleBuildingInfo
  distance_meters: number
  walk_minutes: number
  buffer_minutes: number
  suggest_departure_time: string
  status: ScheduleStatus
  text: string
  warning: string | null
}

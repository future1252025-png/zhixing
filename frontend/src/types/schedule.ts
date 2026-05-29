export type ScheduleSuggestionPayload =
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

export type ScheduleStatus = 'normal' | 'tight' | 'likely_late'

export type NextCourseInfo = {
  id: number
  course_name: string
  weekday: number
  start_time: string
  end_time: string
  room_name: string
  teacher: string | null
  weeks: string | null
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

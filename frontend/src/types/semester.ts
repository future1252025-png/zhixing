export type SemesterStatus =
  | 'unconfigured'
  | 'before_term'
  | 'active'
  | 'after_term'

export interface SemesterState {
  status: SemesterStatus
  start_date: string | null
  total_weeks: number | null
  current_week: number | null
  time_rules?: CourseTimeRule[]
}

export interface CourseTimeRule {
  start_date: string
  end_date: string | null
  from_start: string
  from_end: string
  start_time: string
  end_time: string
}

export interface SemesterUpdate {
  start_date: string
  total_weeks: number
  time_rules?: CourseTimeRule[]
}

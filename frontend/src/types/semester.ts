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
}

export interface SemesterUpdate {
  start_date: string
  total_weeks: number
}

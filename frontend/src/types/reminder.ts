export type ReminderMode = 'sound' | 'vibrate' | 'silent'
export type ReminderItem = {
  id: string
  title: string
  note: string
  date: string
  time: string
  repeat: 'once' | 'daily' | 'weekly'
  weekdays: number[]
  end_date: string | null
  mode: ReminderMode
  enabled: boolean
  completed_dates: string[]
}
export type CourseReminderSettings = { enabled: boolean; lead_minutes: number; mode: ReminderMode }
export type ReminderPlan = { revision: number; course_settings: CourseReminderSettings; items: ReminderItem[] }
export type ReminderOccurrence = {
  key: string
  title: string
  body: string
  at: string
  event_at: string
  date: string
  mode: ReminderMode
  kind: 'course' | 'custom'
  item_id?: string
  course_id?: number
}
export type ReminderCapability = {
  platform: 'android' | 'web'
  permission: 'granted' | 'denied' | 'prompt' | 'unsupported'
  exact: boolean
}

import type { SemesterState } from '@/types/semester'

export const CAMPUS_TIME_ZONE = 'Asia/Shanghai'
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CAMPUS_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
})

/** All schedule decisions use the campus timezone, just like the API. */
export function campusTime(now: Date) {
  const parts = Object.fromEntries(formatter.formatToParts(now).map(({ type, value }) => [type, value]))
  const date = `${parts.year}-${parts.month}-${parts.day}`
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return { date, weekday: day || 7, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}

/** Cached current_week/status are snapshots, not a clock (especially after midnight). */
export function semesterAt(semester: SemesterState | null, now: Date): SemesterState {
  if (!semester?.start_date || !semester.total_weeks) {
    return { status: 'unconfigured', start_date: null, total_weeks: null, current_week: null }
  }
  const days = (Date.parse(campusTime(now).date) - Date.parse(semester.start_date)) / 86_400_000
  const week = Math.floor(days / 7) + 1
  const status = week < 1 ? 'before_term' : week > semester.total_weeks ? 'after_term' : 'active'
  return { ...semester, status, current_week: status === 'active' ? week : null }
}

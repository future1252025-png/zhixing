import type { AuthUser } from '@/api/auth'
import type { Course } from '@/types/course'
import type { SemesterState } from '@/types/semester'
import { semesterAt } from './campusTime'
import { validateCourseTimeRules } from './courseTimeRules'
import { createScopedStorage } from './scopedStorage'

export const COURSE_SNAPSHOT_KEY = 'course-snapshot-v1'
const SESSION_KEY = 'campusmind-course-preview-session-v1'
export type CourseSnapshot = {
  version: 1; userId: number; savedAt: number; courses: Course[]; semester: SemesterState
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v
const nullableText = (v: unknown) => v == null || typeof v === 'string'

/** Validate persisted and optional server data before it reaches course/date calculations. */
export function parseCourseSnapshot(value: unknown, userId: number): CourseSnapshot | null {
  if (!record(value) || value.version !== 1 || value.userId !== userId
    || !Number.isSafeInteger(userId) || userId <= 0 || typeof value.savedAt !== 'number'
    || !Number.isFinite(value.savedAt) || value.savedAt <= 0 || value.savedAt > Date.now() + 60_000
    || !Array.isArray(value.courses) || value.courses.length > 5000 || !record(value.semester)) return null
  const s = { ...value.semester }
  // Auth responses omit null fields for compatibility with older clients.
  s.start_date ??= null
  s.total_weeks ??= null
  if (Array.isArray(s.time_rules)) s.time_rules = s.time_rules.map(r => record(r) ? { ...r, end_date: r.end_date ?? null } : r)
  if (!(s.start_date === null && s.total_weeks === null)) {
    if (!date(s.start_date) || new Date(`${s.start_date}T00:00:00Z`).getUTCDay() !== 1
      || !Number.isInteger(s.total_weeks) || Number(s.total_weeks) < 1 || Number(s.total_weeks) > 30) return null
  }
  if (validateCourseTimeRules(s.time_rules ?? [])) return null
  const ids = new Set<number>()
  const courses: Course[] = []
  for (const c of value.courses) {
    if (!record(c) || !Number.isSafeInteger(c.id) || Number(c.id) <= 0 || ids.has(Number(c.id))
      || typeof c.course_name !== 'string' || !Number.isInteger(c.weekday) || Number(c.weekday) < 1 || Number(c.weekday) > 7
      || typeof c.weeks !== 'string' || !/^\d{1,2}(?:-\d{1,2})?(?:,\d{1,2}(?:-\d{1,2})?)*(?:\((?:单|双)\))?$/.test(c.weeks) || typeof c.room_name !== 'string'
      || !['manual', 'import'].includes(String(c.source_kind)) || typeof c.needs_location_review !== 'boolean'
      || typeof c.created_at !== 'string' || !nullableText(c.teacher) || !nullableText(c.source_location)) return null
    for (const time of [c.start_time, c.end_time]) {
      if (time != null && (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return null
    }
    if (c.start_time && c.end_time && String(c.start_time) >= String(c.end_time)) return null
    if (c.building_id != null && (!Number.isSafeInteger(c.building_id) || Number(c.building_id) <= 0)) return null
    if (c.building != null && (!record(c.building) || c.building.id !== c.building_id
      || typeof c.building.name !== 'string' || typeof c.building.type !== 'string')) return null
    if (c.makeup != null && (!record(c.makeup) || !date(c.makeup.date) || !Number.isSafeInteger(c.makeup.source_course_id)
      || (c.makeup.source_date != null && !date(c.makeup.source_date)) || typeof c.makeup.cancel_source !== 'boolean'
      || typeof c.makeup.batch_id !== 'string' || !nullableText(c.makeup.location))) return null
    ids.add(Number(c.id))
    courses.push({ ...c, start_time: c.start_time ?? null, end_time: c.end_time ?? null,
      building_id: c.building_id ?? null, building: c.building ?? null, teacher: c.teacher ?? null,
      source_location: c.source_location ?? null, makeup: c.makeup ? { ...c.makeup,
        source_date: c.makeup.source_date ?? null, location: c.makeup.location ?? null } : null } as Course)
  }
  return { version: 1, userId, savedAt: value.savedAt, courses,
    semester: semesterAt(s as unknown as SemesterState, new Date()) }
}

export function readCourseSnapshot(userId: number): CourseSnapshot | null {
  try { return parseCourseSnapshot(JSON.parse(createScopedStorage(userId).get(COURSE_SNAPSHOT_KEY) ?? 'null'), userId) }
  catch { return null }
}
export function saveCourseSnapshot(value: CourseSnapshot): void {
  try {
    const valid = parseCourseSnapshot(value, value.userId)
    if (valid) createScopedStorage(value.userId).set(COURSE_SNAPSHOT_KEY, JSON.stringify({ ...valid, semester: {
      start_date: valid.semester.start_date, total_weeks: valid.semester.total_weeks, time_rules: valid.semester.time_rules
    } }))
  } catch { /* Storage failure cannot fail an online operation. */ }
}
export function clearCourseSnapshot(userId: number): void {
  try { createScopedStorage(userId).remove(COURSE_SNAPSHOT_KEY) } catch { /* best effort */ }
}

export async function sessionFingerprint(token: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')
}
export function bindCoursePreview(user: Pick<AuthUser, 'id'>, fingerprint: string): void {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, fingerprint })) } catch { /* best effort */ }
}
export function readCoursePreview(fingerprint: string): CourseSnapshot | null {
  try {
    const binding = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null')
    return binding?.fingerprint === fingerprint ? readCourseSnapshot(binding.userId) : null
  } catch { return null }
}
export function clearCoursePreview(): void {
  try { localStorage.removeItem(SESSION_KEY) } catch { /* best effort */ }
}

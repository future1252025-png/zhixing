import type { Course } from '@/types/course'
import { filterCoursesByWeek, findNextCourse, readSelectedWeek } from './course'

export const APP_LAUNCH_INTRO_STORAGE_KEY = 'campusmind-launch-intro-seen-v1'
export const LOGIN_INTRO_STORAGE_KEY = 'campusmind-login-intro-pending'
export const LOGIN_INTRO_SNAPSHOT_STORAGE_KEY = 'campusmind-login-intro-snapshot'

export type LoginIntroSnapshot = {
  courseName: string
  startTime: string
  buildingName: string
  roomName: string
}

type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

type WeekStorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

type PrepareLoginIntroOptions = {
  introStorage?: StorageLike
  weekStorage?: WeekStorageLike
  now?: Date
}

function isLoginIntroSnapshot(value: unknown): value is LoginIntroSnapshot {
  if (!value || typeof value !== 'object') {
    return false
  }
  const snapshot = value as Record<string, unknown>
  return (
    typeof snapshot.courseName === 'string' &&
    typeof snapshot.startTime === 'string' &&
    typeof snapshot.buildingName === 'string' &&
    typeof snapshot.roomName === 'string'
  )
}

export function shouldPlayAppLaunchIntro(storage: StorageLike = localStorage): boolean {
  if (storage.getItem(APP_LAUNCH_INTRO_STORAGE_KEY) === '1') {
    return false
  }
  storage.setItem(APP_LAUNCH_INTRO_STORAGE_KEY, '1')
  return true
}

export function buildLoginIntroSnapshot(course: Course | null): LoginIntroSnapshot | null {
  if (!course) {
    return null
  }
  return {
    courseName: course.course_name,
    startTime: course.start_time,
    buildingName: course.building.name,
    roomName: course.room_name
  }
}

export function markLoginIntroPending(
  storage: StorageLike = sessionStorage,
  snapshot: LoginIntroSnapshot | null = null
): void {
  storage.setItem(LOGIN_INTRO_STORAGE_KEY, '1')
  if (snapshot) {
    storage.setItem(LOGIN_INTRO_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot))
  } else {
    storage.removeItem(LOGIN_INTRO_SNAPSHOT_STORAGE_KEY)
  }
}

export function consumeLoginIntroFlag(storage: StorageLike = sessionStorage): boolean {
  const pending = storage.getItem(LOGIN_INTRO_STORAGE_KEY) === '1'
  if (pending) {
    storage.removeItem(LOGIN_INTRO_STORAGE_KEY)
  }
  return pending
}

export function consumeLoginIntroSnapshot(
  storage: StorageLike = sessionStorage
): LoginIntroSnapshot | null {
  const rawSnapshot = storage.getItem(LOGIN_INTRO_SNAPSHOT_STORAGE_KEY)
  storage.removeItem(LOGIN_INTRO_SNAPSHOT_STORAGE_KEY)
  if (!rawSnapshot) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(rawSnapshot)
    return isLoginIntroSnapshot(parsed) ? parsed : null
  } catch {
    return null
  }
}

export async function prepareLoginIntro(
  loadCourses: () => Promise<Course[]>,
  options: PrepareLoginIntroOptions = {}
): Promise<void> {
  const introStorage = options.introStorage ?? sessionStorage
  const weekStorage = options.weekStorage ?? localStorage

  try {
    const selectedWeek = readSelectedWeek(weekStorage)
    const courses = await loadCourses()
    const nextCourse = findNextCourse(
      filterCoursesByWeek(courses, selectedWeek),
      options.now ?? new Date()
    )
    markLoginIntroPending(introStorage, buildLoginIntroSnapshot(nextCourse))
  } catch {
    markLoginIntroPending(introStorage)
  }
}

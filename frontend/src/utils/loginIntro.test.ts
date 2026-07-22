import { describe, expect, it, vi } from 'vitest'

import {
  APP_LAUNCH_INTRO_STORAGE_KEY,
  LOGIN_INTRO_STORAGE_KEY,
  LOGIN_INTRO_SNAPSHOT_STORAGE_KEY,
  buildLoginIntroSnapshot,
  consumeLoginIntroFlag,
  consumeLoginIntroSnapshot,
  markLoginIntroPending,
  prepareLoginIntro,
  shouldPlayAppLaunchIntro
} from './loginIntro'
import type { Course } from '@/types/course'
import type { SemesterState } from '@/types/semester'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  }
}

function createCourse(overrides: Partial<Course>): Course {
  const { building, ...restOverrides } = overrides
  return {
    id: 1,
    course_name: '课程',
    weekday: 1,
    start_time: '08:00',
    end_time: '09:40',
    building_id: 1,
    room_name: '101',
    teacher: null,
    weeks: '1-16',
    source_kind: 'manual',
    needs_location_review: false,
    created_at: '2026-06-01T00:00:00',
    ...restOverrides,
    building: {
      id: building?.id ?? overrides.building_id ?? 1,
      name: building?.name ?? '教1',
      type: building?.type ?? '教学楼'
    }
  }
}

function activeSemester(currentWeek = 4): SemesterState {
  return {
    status: 'active',
    start_date: '2026-08-31',
    total_weeks: 20,
    current_week: currentWeek
  }
}

describe('login intro flag', () => {
  it('marks the next app screen to play the login intro once', () => {
    const storage = createStorage()

    markLoginIntroPending(storage)

    expect(storage.getItem(LOGIN_INTRO_STORAGE_KEY)).toBe('1')
    expect(consumeLoginIntroFlag(storage)).toBe(true)
    expect(consumeLoginIntroFlag(storage)).toBe(false)
  })

  it('plays the app launch intro only once per browser version', () => {
    const storage = createStorage()

    expect(shouldPlayAppLaunchIntro(storage)).toBe(true)
    expect(storage.getItem(APP_LAUNCH_INTRO_STORAGE_KEY)).toBe('1')
    expect(shouldPlayAppLaunchIntro(storage)).toBe(false)
  })

  it('stores and consumes the login course snapshot once', () => {
    const storage = createStorage()
    const snapshot = buildLoginIntroSnapshot({
      id: 7,
      course_name: '数据库系统原理',
      weekday: 1,
      start_time: '15:55',
      end_time: '17:35',
      building_id: 3,
      building: {
        id: 3,
        name: '教4',
        type: '教学楼'
      },
      room_name: '102',
      teacher: '曾星',
      weeks: '1-16',
      source_kind: 'import',
      needs_location_review: false,
      created_at: '2026-06-01T00:00:00'
    })

    markLoginIntroPending(storage, snapshot)

    expect(storage.getItem(LOGIN_INTRO_STORAGE_KEY)).toBe('1')
    expect(storage.getItem(LOGIN_INTRO_SNAPSHOT_STORAGE_KEY)).toContain('数据库系统原理')
    expect(consumeLoginIntroSnapshot(storage)).toEqual({
      courseName: '数据库系统原理',
      startTime: '15:55',
      buildingName: '教4',
      roomName: '102'
    })
    expect(consumeLoginIntroSnapshot(storage)).toBeNull()
  })

  it('ignores invalid login snapshot data', () => {
    const storage = createStorage()
    storage.setItem(LOGIN_INTRO_SNAPSHOT_STORAGE_KEY, '{"courseName":1}')

    expect(consumeLoginIntroSnapshot(storage)).toBeNull()
    expect(storage.getItem(LOGIN_INTRO_SNAPSHOT_STORAGE_KEY)).toBeNull()
  })

  it('prepares a snapshot from the next course for the login intro', async () => {
    const introStorage = createStorage()
    const courses = [
      createCourse({
        id: 1,
        course_name: '上午已结束课程',
        weekday: 1,
        start_time: '08:00',
        end_time: '09:40',
        building_id: 2,
        building: {
          id: 2,
          name: '教3',
          type: '教学楼'
        },
        room_name: '504',
        teacher: null,
        weeks: '1-16'
      }),
      createCourse({
        id: 2,
        course_name: '软件工程',
        weekday: 1,
        start_time: '15:55',
        end_time: '17:35',
        building_id: 4,
        building: {
          id: 4,
          name: '教4',
          type: '教学楼'
        },
        room_name: '205',
        teacher: '刘昕',
        weeks: '1-16'
      })
    ]

    await prepareLoginIntro(
      async () => courses,
      async () => activeSemester(13),
      {
        introStorage,
        now: new Date('2026-06-01T12:00:00')
      }
    )

    expect(consumeLoginIntroFlag(introStorage)).toBe(true)
    expect(consumeLoginIntroSnapshot(introStorage)).toEqual({
      courseName: '软件工程',
      startTime: '15:55',
      buildingName: '教4',
      roomName: '205'
    })
  })

  it('still marks the login intro pending when loading courses fails', async () => {
    const introStorage = createStorage()

    await prepareLoginIntro(
      async () => {
        throw new Error('network')
      },
      async () => activeSemester(),
      { introStorage }
    )

    expect(consumeLoginIntroFlag(introStorage)).toBe(true)
    expect(consumeLoginIntroSnapshot(introStorage)).toBeNull()
  })

  it('builds the login snapshot from the real current week', async () => {
    const introStorage = createStorage()
    await prepareLoginIntro(
      async () => [
        createCourse({ course_name: '真实周课程', weeks: '4' }),
        createCourse({ id: 9, course_name: '浏览周课程', weeks: '9' })
      ],
      async () => activeSemester(4),
      {
        introStorage,
        now: new Date('2026-09-21T07:00:00+08:00')
      }
    )

    expect(consumeLoginIntroSnapshot(introStorage)?.courseName).toBe('真实周课程')
  })

  it('uses a generic intro outside an active semester without loading courses', async () => {
    const introStorage = createStorage()
    const loadCourses = vi.fn<() => Promise<Course[]>>().mockResolvedValue([])

    await prepareLoginIntro(
      loadCourses,
      async () => ({
        status: 'before_term',
        start_date: '2026-08-31',
        total_weeks: 20,
        current_week: null
      }),
      { introStorage }
    )

    expect(loadCourses).not.toHaveBeenCalled()
    expect(consumeLoginIntroFlag(introStorage)).toBe(true)
    expect(consumeLoginIntroSnapshot(introStorage)).toBeNull()
  })
})

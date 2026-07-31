import { describe, expect, it } from 'vitest'

import type { Building } from '@/api/buildings'
import type { Course } from '@/types/course'
import {
  buildChatSearchResults,
  buildNextCourseChatTarget,
  readRecentChatEntries,
  rememberRecentChatEntry
} from './chat'

const buildings: Building[] = [
  {
    id: 1,
    name: '湖北大学(武昌校区)-教4',
    type: '教学楼',
    description: '教4 教学楼',
    latitude: 30.58,
    longitude: 114.32,
    map_x: 50,
    map_y: 50,
    walk_hint: null
  },
  {
    id: 2,
    name: '湖北大学武昌校区图书馆',
    type: '学习空间',
    description: '图书馆',
    latitude: 30.581,
    longitude: 114.321,
    map_x: 52,
    map_y: 52,
    walk_hint: null
  }
]

const course: Course = {
  id: 11,
  course_name: '计算机组成原理',
  weekday: 1,
  start_time: '08:00',
  end_time: '09:40',
  building_id: 1,
  building: {
    id: 1,
    name: '湖北大学(武昌校区)-教4',
    type: '教学楼'
  },
  room_name: '教4-211',
  source_location: null,
  teacher: '罗益辉',
  weeks: '1-16',
  source_kind: 'import',
  needs_location_review: false,
  created_at: '2026-06-01T08:00:00'
}

function createMemoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    getItem(key: string) {
      return data[key] ?? null
    },
    setItem(key: string, value: string) {
      data[key] = value
    }
  }
}

describe('chat utilities', () => {
  it('builds a next course chat target with room name', () => {
    expect(buildNextCourseChatTarget(course)).toEqual({
      buildingId: 1,
      buildingName: '湖北大学(武昌校区)-教4',
      roomName: '教4-211',
      title: '计算机组成原理',
      subtitle: '湖北大学(武昌校区)-教4 · 教4-211'
    })
  })

  it('keeps an unmapped imported location readable without inventing a building id', () => {
    expect(buildNextCourseChatTarget({
      ...course,
      building_id: null,
      building: null,
      room_name: '待确认教室',
      source_location: '创新创业中心西区 302',
      needs_location_review: true
    })).toEqual({
      buildingId: null,
      buildingName: null,
      roomName: '待确认教室',
      title: '计算机组成原理',
      subtitle: '创新创业中心西区 302'
    })
  })

  it('searches buildings and carries a room query into chat results', () => {
    const results = buildChatSearchResults(buildings, '教4-203')

    expect(results[0]).toMatchObject({
      building: buildings[0],
      roomName: '教4-203'
    })
  })

  it('keeps recent chats newest first without duplicates', () => {
    const storage = createMemoryStorage()

    rememberRecentChatEntry(storage, {
      buildingId: 1,
      buildingName: '教4',
      roomName: '教4-203'
    })
    rememberRecentChatEntry(storage, {
      buildingId: 2,
      buildingName: '图书馆',
      roomName: null
    })
    rememberRecentChatEntry(storage, {
      buildingId: 1,
      buildingName: '教4',
      roomName: '教4-203'
    })

    expect(readRecentChatEntries(storage)).toEqual([
      {
        buildingId: 1,
        buildingName: '教4',
        roomName: '教4-203'
      },
      {
        buildingId: 2,
        buildingName: '图书馆',
        roomName: null
      }
    ])
  })
})

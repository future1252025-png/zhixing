import { beforeEach, describe, expect, it, vi } from 'vitest'

import request from './request'
import { getScheduleSuggestion } from './schedule'
import type { ScheduleSuggestion } from '@/types/schedule'

vi.mock('./request', () => ({
  default: {
    post: vi.fn()
  }
}))

const suggestion: ScheduleSuggestion = {
  next_course: {
    id: 1,
    course_name: 'Database',
    weekday: 1,
    start_time: '14:00',
    end_time: '15:40',
    room_name: '302',
    teacher: 'Teacher Zhang',
    weeks: '1-16'
  },
  from_location: {
    name: 'Library',
    latitude: 30.5812,
    longitude: 114.3221,
    building_id: 1
  },
  target_building: {
    id: 2,
    name: 'Teaching Building 1',
    latitude: 30.5821,
    longitude: 114.324
  },
  distance_meters: 680,
  walk_minutes: 9,
  buffer_minutes: 10,
  suggest_departure_time: '13:41',
  status: 'normal',
  text: 'Leave at 13:41.',
  warning: null
}

describe('schedule api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requests a suggestion by current building id', async () => {
    vi.mocked(request.post).mockResolvedValue({ data: suggestion })

    const result = await getScheduleSuggestion({ current_building_id: 1 })

    expect(request.post).toHaveBeenCalledWith('/api/schedule/suggestion', {
      current_building_id: 1
    })
    expect(result.next_course.course_name).toBe('Database')
  })

  it('requests a suggestion by browser coordinates', async () => {
    vi.mocked(request.post).mockResolvedValue({ data: suggestion })

    const result = await getScheduleSuggestion({
      latitude: 30.58,
      longitude: 114.32
    })

    expect(request.post).toHaveBeenCalledWith('/api/schedule/suggestion', {
      latitude: 30.58,
      longitude: 114.32
    })
    expect(result.status).toBe('normal')
  })
})

import { describe, expect, it } from 'vitest'

import type { BuildingMessage } from '@/api/messages'
import {
  MESSAGE_PAGE_SIZE,
  hasMoreMessagePages,
  mergeOlderMessages
} from './messagePagination'

function message(id: number): BuildingMessage {
  return {
    id,
    building_id: 1,
    content: `message-${id}`,
    display_name: '匿名同学',
    room_name: null,
    created_at: `2026-07-07T08:${String(id).padStart(2, '0')}:00`,
    distance_to_building_meters: null
  }
}

describe('message pagination utilities', () => {
  it('uses a 50 message default page size', () => {
    expect(MESSAGE_PAGE_SIZE).toBe(50)
  })

  it('prepends older messages without duplicating existing rows', () => {
    const current = [message(3), message(4), message(5)]
    const older = [message(1), message(2), message(3)]

    expect(mergeOlderMessages(current, older).map((item) => item.id)).toEqual([
      1,
      2,
      3,
      4,
      5
    ])
  })

  it('reports more pages only when a full page was returned', () => {
    expect(hasMoreMessagePages(Array.from({ length: 50 }, (_, index) => message(index)))).toBe(true)
    expect(hasMoreMessagePages(Array.from({ length: 49 }, (_, index) => message(index)))).toBe(false)
  })
})

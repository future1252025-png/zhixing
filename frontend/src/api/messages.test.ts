import { beforeEach, describe, expect, it, vi } from 'vitest'

import request from './request'
import {
  createBuildingMessage,
  getBuildingChatrooms,
  getBuildingMessages,
  validateMessageContent
} from './messages'

vi.mock('./request', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}))

const message = {
  id: 1,
  building_id: 1,
  content: '今天这里很安静',
  display_name: '匿名同学',
  created_at: '2026-05-29T08:00:00'
}

describe('message api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches building messages', async () => {
    vi.mocked(request.get).mockResolvedValue({ data: [message] })

    const result = await getBuildingMessages(1)

    expect(request.get).toHaveBeenCalledWith('/api/buildings/1/messages')
    expect(result[0].display_name).toBe('匿名同学')
  })

  it('fetches building messages with pagination params', async () => {
    vi.mocked(request.get).mockResolvedValue({ data: [message] })

    await getBuildingMessages(1, { limit: 50, offset: 100 })

    expect(request.get).toHaveBeenCalledWith('/api/buildings/1/messages', {
      params: { limit: 50, offset: 100 }
    })
  })

  it('fetches building messages by room name', async () => {
    vi.mocked(request.get).mockResolvedValue({ data: [message] })

    await getBuildingMessages(1, { roomName: '教4-203' })

    expect(request.get).toHaveBeenCalledWith('/api/buildings/1/messages', {
      params: { room_name: '教4-203' }
    })
  })

  it('fetches room messages with pagination params', async () => {
    vi.mocked(request.get).mockResolvedValue({ data: [message] })

    await getBuildingMessages(1, { roomName: '教4-203', limit: 50, offset: 50 })

    expect(request.get).toHaveBeenCalledWith('/api/buildings/1/messages', {
      params: { room_name: '教4-203', limit: 50, offset: 50 }
    })
  })

  it('fetches older messages with the before_id cursor', async () => {
    vi.mocked(request.get).mockResolvedValue({ data: [message] })

    await getBuildingMessages(1, { roomName: '教4-203', limit: 50, before_id: 120 })

    expect(request.get).toHaveBeenCalledWith('/api/buildings/1/messages', {
      params: { room_name: '教4-203', limit: 50, before_id: 120 }
    })
  })

  it('fetches building chatrooms', async () => {
    vi.mocked(request.get).mockResolvedValue({
      data: [{ name: '教4-203', room_name: '教4-203', message_count: 2, is_general: false }]
    })

    const result = await getBuildingChatrooms(1)

    expect(request.get).toHaveBeenCalledWith('/api/buildings/1/chatrooms')
    expect(result[0].room_name).toBe('教4-203')
  })

  it('creates a building message with location payload', async () => {
    vi.mocked(request.post).mockResolvedValue({ data: message })

    const result = await createBuildingMessage(1, {
      content: '今天这里很安静',
      room_name: '教4-203',
      latitude: 30.581,
      longitude: 114.329,
      location_source: 'browser',
      located_at: '2026-05-29T08:00:00.000Z',
      location_accuracy_meters: 16
    })

    expect(request.post).toHaveBeenCalledWith('/api/buildings/1/messages', {
      content: '今天这里很安静',
      room_name: '教4-203',
      latitude: 30.581,
      longitude: 114.329,
      location_source: 'browser',
      located_at: '2026-05-29T08:00:00.000Z',
      location_accuracy_meters: 16
    })
    expect(result.content).toBe('今天这里很安静')
  })

  it('validates empty and overlong content before submit', () => {
    expect(validateMessageContent('   ')).toBe('留言内容不能为空')
    expect(validateMessageContent('a'.repeat(201))).toBe('留言内容不能超过 200 字')
    expect(validateMessageContent('正常留言')).toBeNull()
  })
})

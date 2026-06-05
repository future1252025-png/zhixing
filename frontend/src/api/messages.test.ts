import { beforeEach, describe, expect, it, vi } from 'vitest'

import request from './request'
import {
  createBuildingMessage,
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

  it('creates a building message with location payload', async () => {
    vi.mocked(request.post).mockResolvedValue({ data: message })

    const result = await createBuildingMessage(1, {
      content: '今天这里很安静',
      latitude: 30.581,
      longitude: 114.329,
      location_source: 'browser'
    })

    expect(request.post).toHaveBeenCalledWith('/api/buildings/1/messages', {
      content: '今天这里很安静',
      latitude: 30.581,
      longitude: 114.329,
      location_source: 'browser'
    })
    expect(result.content).toBe('今天这里很安静')
  })

  it('validates empty and overlong content before submit', () => {
    expect(validateMessageContent('   ')).toBe('留言内容不能为空')
    expect(validateMessageContent('a'.repeat(201))).toBe('留言内容不能超过 200 字')
    expect(validateMessageContent('正常留言')).toBeNull()
  })
})

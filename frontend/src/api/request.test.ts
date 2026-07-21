import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  resetUnauthorizedState,
  setUnauthorizedHandler
} from './errors'
import request, { TOKEN_STORAGE_KEY } from './request'

describe('request session handling', () => {
  beforeEach(() => {
    localStorage.clear()
    resetUnauthorizedState()
  })

  it('attaches the saved bearer token', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'saved-token')
    const adapter = vi.fn(async (config) => ({
      data: {},
      status: 200,
      statusText: 'OK',
      headers: {},
      config
    }))

    await request.get('/test', { adapter })

    expect(adapter.mock.calls[0]?.[0].headers.get('Authorization')).toBe(
      'Bearer saved-token'
    )
  })

  it('coordinates concurrent 401 responses and preserves original errors', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    setUnauthorizedHandler(handler)
    const unauthorized = { response: { status: 401 }, marker: 'original' }
    const adapter = vi.fn().mockRejectedValue(unauthorized)

    const results = await Promise.allSettled([
      request.get('/first', { adapter }),
      request.get('/second', { adapter }),
      request.get('/third', { adapter })
    ])

    expect(handler).toHaveBeenCalledTimes(1)
    expect(results.every((result) => result.status === 'rejected')).toBe(true)
    expect((results[0] as PromiseRejectedResult).reason).toBe(unauthorized)
  })
})

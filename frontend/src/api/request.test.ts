import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  resetUnauthorizedState,
  setUnauthorizedHandler
} from './errors'
import request, { TOKEN_STORAGE_KEY, resolveApiBaseURL } from './request'

describe('resolveApiBaseURL', () => {
  it('uses the explicitly configured base URL', () => {
    expect(
      resolveApiBaseURL({ VITE_API_BASE_URL: 'https://api.example.com', DEV: false })
    ).toBe('https://api.example.com')
  })

  it('falls back to localhost in development', () => {
    expect(resolveApiBaseURL({ DEV: true })).toBe('http://127.0.0.1:8000')
  })

  it('falls back to same-origin relative paths in production and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(resolveApiBaseURL({ DEV: false })).toBe('')
    expect(warn).toHaveBeenCalledWith(
      '未显式配置 VITE_API_BASE_URL，生产构建将使用同源相对路径访问后端接口'
    )

    warn.mockRestore()
  })
})

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

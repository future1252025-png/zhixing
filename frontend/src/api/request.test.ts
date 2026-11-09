import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  resetUnauthorizedState,
  setUnauthorizedHandler
} from './errors'
import request, {
  revokeSession,
  restoreSession,
  sessionRequest,
  TOKEN_STORAGE_KEY,
  resolveApiBaseURL
} from './request'
import {
  clearPendingWebLogout,
  getAccessToken,
  hasPendingWebLogout,
  markPendingWebLogout,
  setAccessToken
} from '@/auth/sessionTokens'

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
    clearPendingWebLogout()
    setAccessToken(null)
    resetUnauthorizedState()
  })

  it('attaches the in-memory bearer token without persisting it', async () => {
    setAccessToken('saved-token')
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
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
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

  it('uses one refresh request to replay concurrent authenticated requests', async () => {
    setAccessToken('expired-access')
    const originalSessionAdapter = sessionRequest.defaults.adapter
    const refreshAdapter = vi.fn(async (config) => ({
      data: {
        access_token: 'rotated-access',
        token_type: 'bearer',
        expires_in: 900
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config
    }))
    sessionRequest.defaults.adapter = refreshAdapter

    const attempts = new Map<string, number>()
    const protectedAdapter = vi.fn(async (config) => {
      const url = config.url ?? ''
      const attempt = attempts.get(url) ?? 0
      attempts.set(url, attempt + 1)
      if (attempt === 0) {
        return Promise.reject({
          config,
          response: { status: 401 },
          marker: url
        })
      }
      return {
        data: { authorization: config.headers.get('Authorization') },
        status: 200,
        statusText: 'OK',
        headers: {},
        config
      }
    })

    try {
      const responses = await Promise.all([
        request.get('/protected/first', { adapter: protectedAdapter }),
        request.get('/protected/second', { adapter: protectedAdapter }),
        request.get('/protected/third', { adapter: protectedAdapter })
      ])

      expect(refreshAdapter).toHaveBeenCalledOnce()
      expect(protectedAdapter).toHaveBeenCalledTimes(6)
      expect(responses.map(({ data }) => data.authorization)).toEqual([
        'Bearer rotated-access',
        'Bearer rotated-access',
        'Bearer rotated-access'
      ])
      expect(getAccessToken()).toBe('rotated-access')
    } finally {
      sessionRequest.defaults.adapter = originalSessionAdapter
    }
  })

  it('preserves the session during a temporary refresh failure', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    setUnauthorizedHandler(handler)
    setAccessToken('expired-access')
    const originalSessionAdapter = sessionRequest.defaults.adapter
    const refreshFailure = {
      isAxiosError: true,
      response: { status: 503 },
      message: 'service unavailable'
    }
    sessionRequest.defaults.adapter = vi.fn().mockRejectedValue(refreshFailure)
    const protectedAdapter = vi.fn(async (config) => Promise.reject({
      config,
      response: { status: 401 }
    }))

    try {
      await expect(
        request.get('/protected/offline', { adapter: protectedAdapter })
      ).rejects.toBe(refreshFailure)
    } finally {
      sessionRequest.defaults.adapter = originalSessionAdapter
    }

    expect(handler).not.toHaveBeenCalled()
    expect(getAccessToken()).toBeNull()
  })

  it('clears the session and notifies once when the refresh credential is rejected', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    setUnauthorizedHandler(handler)
    setAccessToken('expired-access')
    const originalSessionAdapter = sessionRequest.defaults.adapter
    sessionRequest.defaults.adapter = vi.fn().mockRejectedValue({
      isAxiosError: true,
      response: { status: 401 },
      message: 'refresh rejected'
    })
    const originalFailure = { marker: 'protected request' } as {
      marker: string
      config?: unknown
      response?: { status: number }
    }
    const protectedAdapter = vi.fn(async (config) => {
      originalFailure.config = config
      originalFailure.response = { status: 401 }
      return Promise.reject(originalFailure)
    })

    try {
      await expect(
        request.get('/protected/rejected', { adapter: protectedAdapter })
      ).rejects.toBe(originalFailure)
    } finally {
      sessionRequest.defaults.adapter = originalSessionAdapter
    }

    expect(handler).toHaveBeenCalledOnce()
    expect(getAccessToken()).toBeNull()
  })

  it('clears local credentials even when server logout is offline', async () => {
    setAccessToken('access-before-logout')
    const originalAdapter = sessionRequest.defaults.adapter
    sessionRequest.defaults.adapter = vi.fn().mockRejectedValue(new Error('offline'))

    try {
      await expect(revokeSession()).rejects.toThrow('offline')
    } finally {
      sessionRequest.defaults.adapter = originalAdapter
    }

    expect(getAccessToken()).toBeNull()
    expect(hasPendingWebLogout()).toBe(true)
  })

  it('keeps a pending web logout signed out and retries revocation on startup', async () => {
    markPendingWebLogout()
    setAccessToken('stale-access')
    const originalAdapter = sessionRequest.defaults.adapter
    const adapter = vi.fn(async (config) => ({
      data: null,
      status: 204,
      statusText: 'No Content',
      headers: {},
      config
    }))
    sessionRequest.defaults.adapter = adapter

    try {
      await expect(restoreSession()).resolves.toEqual({
        restored: false,
        user: null
      })
    } finally {
      sessionRequest.defaults.adapter = originalAdapter
    }

    expect(adapter).toHaveBeenCalledTimes(1)
    expect(adapter.mock.calls[0]?.[0].url).toBe('/api/auth/logout')
    expect(getAccessToken()).toBeNull()
    expect(hasPendingWebLogout()).toBe(false)
  })

  it('restores the current user together with the refreshed access token', async () => {
    const originalAdapter = sessionRequest.defaults.adapter
    const restoredUser = {
      id: 7,
      student_id: '20260007',
      nickname: '小智',
      avatar_text: '智',
      avatar_color: '#4f7d58',
      role: 'student',
      created_at: '2026-09-01T00:00:00Z'
    }
    sessionRequest.defaults.adapter = vi.fn(async (config) => ({
      data: {
        access_token: 'startup-access',
        token_type: 'bearer',
        expires_in: 900,
        user: restoredUser
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config
    }))

    try {
      await expect(restoreSession()).resolves.toEqual({
        restored: true,
        user: restoredUser
      })
    } finally {
      sessionRequest.defaults.adapter = originalAdapter
    }

    expect(getAccessToken()).toBe('startup-access')
  })
})

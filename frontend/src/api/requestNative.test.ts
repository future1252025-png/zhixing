import { beforeEach, describe, expect, it, vi } from 'vitest'

const session = vi.hoisted(() => ({
  accessToken: null as string | null,
  refreshToken: 'refresh-before-rotation' as string | null,
  setAccessToken: vi.fn((value: string | null) => {
    session.accessToken = value
  }),
  setRefreshToken: vi.fn(async (value: string | null) => {
    session.refreshToken = value
  })
}))

vi.mock('@/auth/sessionTokens', () => ({
  clearPendingWebLogout: vi.fn(),
  clearSessionTokens: vi.fn(),
  getAccessToken: () => session.accessToken,
  getRefreshToken: vi.fn(async () => session.refreshToken),
  hasPendingWebLogout: vi.fn(() => false),
  isNativeAuthClient: vi.fn(() => true),
  markPendingWebLogout: vi.fn(),
  setAccessToken: session.setAccessToken,
  setRefreshToken: session.setRefreshToken
}))

import { refreshAccessToken, sessionRequest } from './request'

describe('native session refresh', () => {
  beforeEach(() => {
    session.accessToken = null
    session.refreshToken = 'refresh-before-rotation'
    session.setAccessToken.mockClear()
    session.setRefreshToken.mockClear()
  })

  it('rotates the refresh token before exposing the new access token', async () => {
    const originalAdapter = sessionRequest.defaults.adapter
    const adapter = vi.fn(async (config) => ({
      data: {
        access_token: 'access-after-rotation',
        token_type: 'bearer',
        expires_in: 900,
        refresh_token: 'refresh-after-rotation'
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config
    }))
    sessionRequest.defaults.adapter = adapter

    try {
      await expect(refreshAccessToken()).resolves.toBe('access-after-rotation')
    } finally {
      sessionRequest.defaults.adapter = originalAdapter
    }

    expect(adapter.mock.calls[0]?.[0].data).toBe(
      JSON.stringify({
        client_kind: 'native',
        refresh_token: 'refresh-before-rotation'
      })
    )
    expect(session.setRefreshToken).toHaveBeenCalledWith('refresh-after-rotation')
    expect(session.setAccessToken).toHaveBeenCalledWith('access-after-rotation')
  })

  it('rejects a native response that does not rotate the refresh token', async () => {
    const originalAdapter = sessionRequest.defaults.adapter
    sessionRequest.defaults.adapter = vi.fn(async (config) => ({
      data: {
        access_token: 'unsafe-access',
        token_type: 'bearer',
        expires_in: 900
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config
    }))

    try {
      await expect(refreshAccessToken()).rejects.toThrow(
        'The backend did not rotate the native refresh token'
      )
    } finally {
      sessionRequest.defaults.adapter = originalAdapter
    }

    expect(session.setRefreshToken).not.toHaveBeenCalled()
    expect(session.setAccessToken).not.toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const nativeSession = vi.hoisted(() => ({
  enabled: true,
  value: null as string | null,
  get: vi.fn(async () => ({ value: nativeSession.value })),
  remove: vi.fn(async () => {
    nativeSession.value = null
  }),
  set: vi.fn(async ({ value }: { value: string }) => {
    nativeSession.value = value
  })
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => nativeSession.enabled
  },
  registerPlugin: () => ({
    get: nativeSession.get,
    remove: nativeSession.remove,
    set: nativeSession.set
  })
}))

import {
  clearSessionTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken
} from './sessionTokens'

describe('session token storage', () => {
  beforeEach(() => {
    localStorage.clear()
    nativeSession.enabled = true
    nativeSession.value = null
    nativeSession.get.mockClear()
    nativeSession.remove.mockClear()
    nativeSession.set.mockClear()
    setAccessToken(null)
  })

  it('keeps access tokens in memory and removes legacy Web Storage data', () => {
    localStorage.setItem('campusmind_token', 'legacy-token')

    setAccessToken('memory-only')

    expect(getAccessToken()).toBe('memory-only')
    expect(localStorage.getItem('campusmind_token')).toBeNull()
  })

  it('stores and removes the native refresh token through SecureSession', async () => {
    await setRefreshToken('rotated-refresh')

    expect(nativeSession.set).toHaveBeenCalledWith({ value: 'rotated-refresh' })
    await expect(getRefreshToken()).resolves.toBe('rotated-refresh')

    await clearSessionTokens()

    expect(nativeSession.remove).toHaveBeenCalledOnce()
    expect(getAccessToken()).toBeNull()
    await expect(getRefreshToken()).resolves.toBeNull()
  })

  it('never exposes native refresh storage to the browser client', async () => {
    nativeSession.enabled = false
    nativeSession.value = 'native-secret'

    await expect(getRefreshToken()).resolves.toBeNull()
    await setRefreshToken('ignored')

    expect(nativeSession.get).not.toHaveBeenCalled()
    expect(nativeSession.set).not.toHaveBeenCalled()
  })
})

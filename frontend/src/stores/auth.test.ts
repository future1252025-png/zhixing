import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TOKEN_STORAGE_KEY } from '@/api/request'
import { getAccessToken, setAccessToken } from '@/auth/sessionTokens'
import * as authApi from '@/api/auth'
import * as apiErrors from '@/api/errors'
import * as requestApi from '@/api/request'
import { useAuthStore } from './auth'

vi.mock('@/api/auth', () => ({
  deleteAccount: vi.fn(),
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  updateProfile: vi.fn()
}))

vi.mock('@/api/errors', () => ({
  resetUnauthorizedState: vi.fn(),
  extractBusinessError: vi.fn((error: { response?: { status?: number } }) => ({
    status: error.response?.status ?? 0,
    code: 'test_error',
    message: 'test',
    fields: [],
    details: {}
  }))
}))

const user = {
  id: 1,
  student_id: '20240001',
  nickname: 'Alice',
  avatar_text: 'A',
  avatar_color: '#0b766f',
  role: 'student',
  created_at: '2026-05-27T00:00:00Z'
}

describe('auth store', () => {
  beforeEach(() => {
    localStorage.clear()
    setAccessToken(null)
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('stores token and current user after login', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      access_token: 'token-123',
      token_type: 'bearer',
      expires_in: 1800,
      user
    })

    const store = useAuthStore()

    await store.login({ student_id: '20240001', password: 'secret123' })

    expect(store.token).toBe('token-123')
    expect(store.currentUser?.student_id).toBe('20240001')
    expect(getAccessToken()).toBe('token-123')
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
    expect(store.isAuthenticated).toBe(true)
    expect(apiErrors.resetUnauthorizedState).toHaveBeenCalledTimes(1)
  })

  it('loads current user when token exists', async () => {
    setAccessToken('saved-token')
    vi.mocked(authApi.getCurrentUser).mockResolvedValue(user)

    const store = useAuthStore()

    await store.loadCurrentUser()

    expect(store.currentUser?.nickname).toBe('Alice')
  })

  it('uses the user returned by session restore without a second profile request', async () => {
    const restore = vi.spyOn(requestApi, 'restoreSession').mockResolvedValue({
      restored: true,
      user
    })
    setAccessToken('restored-token')
    const store = useAuthStore()

    try {
      await expect(store.restoreSession()).resolves.toBe(true)
    } finally {
      restore.mockRestore()
    }

    expect(store.currentUser).toEqual(user)
    expect(authApi.getCurrentUser).not.toHaveBeenCalled()
  })

  it('keeps the saved session on a transient profile load failure', async () => {
    setAccessToken('saved-token')
    vi.mocked(authApi.getCurrentUser).mockRejectedValue({
      response: { status: 503 }
    })
    const store = useAuthStore()

    await expect(store.loadCurrentUser()).rejects.toBeTruthy()

    expect(store.token).toBe('saved-token')
    expect(getAccessToken()).toBe('saved-token')
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('clears the saved session when the profile request is unauthorized', async () => {
    setAccessToken('expired-token')
    vi.mocked(authApi.getCurrentUser).mockRejectedValue({
      response: { status: 401 }
    })
    const store = useAuthStore()

    await expect(store.loadCurrentUser()).rejects.toBeTruthy()

    expect(store.token).toBeNull()
    expect(getAccessToken()).toBeNull()
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('clears token and user on logout', () => {
    const store = useAuthStore()

    store.setToken('token-123')
    store.setCurrentUser(user)
    store.clearSession()

    expect(store.token).toBeNull()
    expect(store.currentUser).toBeNull()
    expect(getAccessToken()).toBeNull()
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('clears local state even when server-side logout fails', async () => {
    const revoke = vi.spyOn(requestApi, 'revokeSession').mockRejectedValue(new Error('offline'))
    const store = useAuthStore()
    store.setToken('token-123')
    store.setCurrentUser(user)

    await expect(store.logout()).rejects.toThrow('offline')

    expect(store.token).toBeNull()
    expect(store.currentUser).toBeNull()
    expect(getAccessToken()).toBeNull()
    revoke.mockRestore()
  })

  it('updates current user profile after saving profile changes', async () => {
    const updatedUser = {
      ...user,
      nickname: '小智同学',
      avatar_text: '智',
      avatar_color: '#2b6fbe'
    }
    vi.mocked(authApi.updateProfile).mockResolvedValue(updatedUser)

    const store = useAuthStore()
    store.setCurrentUser(user)

    await store.updateProfile({
      nickname: '小智同学',
      avatar_text: '智',
      avatar_color: '#2b6fbe'
    })

    expect(authApi.updateProfile).toHaveBeenCalledWith({
      nickname: '小智同学',
      avatar_text: '智',
      avatar_color: '#2b6fbe'
    })
    expect(store.currentUser?.nickname).toBe('小智同学')
    expect(store.currentUser?.avatar_text).toBe('智')
    expect(store.currentUser?.avatar_color).toBe('#2b6fbe')
  })

  it('permanently deletes the account only after the server confirms it', async () => {
    vi.mocked(authApi.deleteAccount).mockResolvedValue(undefined)
    const store = useAuthStore()
    store.setToken('token-123')
    store.setCurrentUser(user)

    await store.deleteAccount({ password: 'secret123' })

    expect(authApi.deleteAccount).toHaveBeenCalledWith({ password: 'secret123' })
    expect(store.token).toBeNull()
    expect(store.currentUser).toBeNull()
  })

  it('keeps the local account session when deletion is rejected', async () => {
    vi.mocked(authApi.deleteAccount).mockRejectedValue(new Error('wrong password'))
    const store = useAuthStore()
    store.setToken('token-123')
    store.setCurrentUser(user)

    await expect(store.deleteAccount({ password: 'wrong-pass' })).rejects.toThrow()

    expect(store.token).toBe('token-123')
    expect(store.currentUser).toEqual(user)
  })
})

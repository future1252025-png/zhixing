import { defineStore } from 'pinia'

import {
  getCurrentUser,
  login as loginRequest,
  register as registerRequest,
  updateProfile as updateProfileRequest,
  type AuthUser,
  type LoginPayload,
  type ProfileUpdatePayload,
  type RegisterPayload
} from '@/api/auth'
import { restoreSession, revokeSession } from '@/api/request'
import {
  getAccessToken,
  setAccessToken,
  setRefreshToken
} from '@/auth/sessionTokens'
import { extractBusinessError, resetUnauthorizedState } from '@/api/errors'
import { useSemesterStore } from '@/stores/semester'

type AuthState = {
  token: string | null
  currentUser: AuthUser | null
  loadingUser: boolean
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: getAccessToken(),
    currentUser: null,
    loadingUser: false
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token),
    displayName: (state) =>
      state.currentUser?.nickname || state.currentUser?.username || '未登录'
  },
  actions: {
    setToken(token: string) {
      this.token = token
      setAccessToken(token)
    },
    setCurrentUser(user: AuthUser | null) {
      this.currentUser = user
    },
    async register(payload: RegisterPayload) {
      return registerRequest(payload)
    },
    async updateProfile(payload: ProfileUpdatePayload) {
      const user = await updateProfileRequest(payload)
      this.setCurrentUser(user)
      return user
    },
    async login(payload: LoginPayload) {
      const result = await loginRequest(payload)
      if (result.refresh_token) {
        await setRefreshToken(result.refresh_token)
      }
      this.setToken(result.access_token)
      this.setCurrentUser(result.user)
      resetUnauthorizedState()
      return result.user
    },
    async restoreSession() {
      const restored = await restoreSession()
      this.token = getAccessToken()
      if (!restored) {
        this.setCurrentUser(null)
      }
      return restored
    },
    async loadCurrentUser() {
      if (!this.token) {
        this.setCurrentUser(null)
        return null
      }
      this.loadingUser = true
      try {
        const user = await getCurrentUser()
        this.setCurrentUser(user)
        return user
      } catch (error) {
        if (extractBusinessError(error).status === 401) {
          this.clearSession()
        }
        throw error
      } finally {
        this.loadingUser = false
      }
    },
    clearSession() {
      this.token = null
      this.currentUser = null
      setAccessToken(null)
      void setRefreshToken(null)
      useSemesterStore().reset()
    },
    async logout() {
      await revokeSession()
      this.clearSession()
    }
  }
})

import { defineStore } from 'pinia'

import {
  deleteAccount as deleteAccountRequest,
  getCurrentUser,
  login as loginRequest,
  register as registerRequest,
  updateProfile as updateProfileRequest,
  type AuthUser,
  type DeleteAccountPayload,
  type LoginPayload,
  type ProfileUpdatePayload,
  type RegisterPayload
} from '@/api/auth'
import { restoreSession, revokeSession } from '@/api/request'
import {
  clearPendingWebLogout,
  getAccessToken,
  setAccessToken,
  setRefreshToken
} from '@/auth/sessionTokens'
import { extractBusinessError, resetUnauthorizedState } from '@/api/errors'
import { SEMESTER_CACHE_KEY, useSemesterStore } from '@/stores/semester'
import { createScopedStorage } from '@/utils/scopedStorage'
import { useCampusMapStore } from '@/stores/campusMap'
import { clearRouteScrollMemory } from '@/utils/routeScroll'
import { cancelDeviceReminders, clearReminderCache } from '@/services/reminderNotifications'

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
      state.currentUser?.nickname || state.currentUser?.student_id || '未登录'
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
      clearPendingWebLogout()
      if (result.refresh_token) {
        await setRefreshToken(result.refresh_token)
      }
      this.setToken(result.access_token)
      this.setCurrentUser(result.user)
      resetUnauthorizedState()
      return result.user
    },
    async deleteAccount(payload: DeleteAccountPayload) {
      await deleteAccountRequest(payload)
      if (this.currentUser) {
        clearReminderCache(this.currentUser.id)
        try { createScopedStorage(this.currentUser.id).remove(SEMESTER_CACHE_KEY) } catch { /* storage unavailable */ }
      }
      this.clearSession()
    },
    async restoreSession() {
      const result = await restoreSession()
      this.token = getAccessToken()
      this.setCurrentUser(result.user)
      return result.restored
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
      clearRouteScrollMemory()
      void cancelDeviceReminders().catch(() => {})
      this.token = null
      this.currentUser = null
      setAccessToken(null)
      void setRefreshToken(null).catch(() => {})
      useSemesterStore().reset()
      useCampusMapStore().attachUser(null)
    },
    async logout() {
      try {
        await revokeSession()
      } finally {
        this.clearSession()
      }
    }
  }
})

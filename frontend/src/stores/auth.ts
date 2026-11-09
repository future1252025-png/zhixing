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
import { invalidateSessionRequests, restoreSession, revokeSession } from '@/api/request'
import {
  clearPendingWebLogout,
  getAccessToken,
  getRefreshToken,
  isNativeAuthClient,
  setAccessToken,
  setRefreshToken
} from '@/auth/sessionTokens'
import { extractBusinessError, resetUnauthorizedState } from '@/api/errors'
import { SEMESTER_CACHE_KEY, useSemesterStore } from '@/stores/semester'
import { createScopedStorage } from '@/utils/scopedStorage'
import { useCampusMapStore } from '@/stores/campusMap'
import { clearRouteScrollMemory } from '@/utils/routeScroll'
import { cancelDeviceReminders, clearReminderCache } from '@/services/reminderNotifications'
import { useCoursesStore } from '@/stores/courses'
import { bindCoursePreview, clearCoursePreview, clearCourseSnapshot, parseCourseSnapshot,
  readCoursePreview, readCourseSnapshot, sessionFingerprint, type CourseSnapshot } from '@/utils/courseSnapshot'

type AuthState = {
  token: string | null
  currentUser: AuthUser | null
  loadingUser: boolean
  restoring: boolean
  restorePending: Promise<boolean> | null
  preview: CourseSnapshot | null
  sessionRevision: number
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: getAccessToken(),
    currentUser: null,
    loadingUser: false,
    restoring: false,
    restorePending: null,
    preview: null,
    sessionRevision: 0
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token),
    displayName: (state) =>
      state.currentUser?.nickname || state.currentUser?.student_id || '未登录'
  },
  actions: {
    async prepareLocalPreview() {
      const revision = this.sessionRevision
      try {
        if (!isNativeAuthClient()) return
        const token = await getRefreshToken()
        if (!token) { clearCoursePreview(); return }
        const fingerprint = await sessionFingerprint(token)
        if (revision === this.sessionRevision) this.preview = readCoursePreview(fingerprint)
      } catch { /* A local preview is optional; online restoration still works. */ }
    },
    async bindLocalPreview(user: AuthUser) {
      const revision = this.sessionRevision
      try {
        if (!isNativeAuthClient()) return
        const token = await getRefreshToken()
        if (token) {
          const fingerprint = await sessionFingerprint(token)
          if (revision === this.sessionRevision && this.currentUser?.id === user.id) bindCoursePreview(user, fingerprint)
        }
      } catch { /* Secure storage failure cannot fail an otherwise successful login. */ }
    },
    applyStartup(user: AuthUser, data?: CourseSnapshot) {
      const live = parseCourseSnapshot(data, user.id)
      const cached = live ?? (this.preview?.userId === user.id ? this.preview : readCourseSnapshot(user.id))
      useCoursesStore().attachUser(user.id)
      useSemesterStore().attachUser(user.id)
      if (cached) {
        useCoursesStore().hydrate(user.id, cached.courses, !!live)
        useSemesterStore().hydrate(user.id, cached.semester, !!live)
        if (live) performance.mark('campusmind:server-snapshot-applied')
      }
      this.preview = null
    },
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
      const revision = ++this.sessionRevision
      invalidateSessionRequests()
      const result = await loginRequest(payload)
      if (revision !== this.sessionRevision) throw new Error('登录流程已取消')
      clearPendingWebLogout()
      if (result.refresh_token) {
        await setRefreshToken(result.refresh_token)
      }
      if (revision !== this.sessionRevision) throw new Error('登录流程已取消')
      this.setToken(result.access_token)
      this.setCurrentUser(result.user)
      this.applyStartup(result.user, result.startup)
      await this.bindLocalPreview(result.user)
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
    restoreSession(): Promise<boolean> {
      if (this.restorePending) return this.restorePending
      const revision = this.sessionRevision
      this.restoring = true
      const pending = restoreSession().then(async (result) => {
        performance.mark('campusmind:refresh-done')
        if (revision !== this.sessionRevision) return false
        this.token = getAccessToken()
        this.setCurrentUser(result.user)
        if (result.restored && result.user) {
          this.applyStartup(result.user, result.startup)
          await this.bindLocalPreview(result.user)
        } else if (result.rejected) {
          this.clearSession()
        }
        return result.restored
      }).finally(() => {
        if (this.restorePending === pending) {
          this.restoring = false
          this.restorePending = null
        }
      })
      this.restorePending = pending
      return pending
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
      this.sessionRevision++
      invalidateSessionRequests()
      const userId = this.currentUser?.id ?? this.preview?.userId
      if (userId) clearCourseSnapshot(userId)
      clearCoursePreview()
      this.preview = null
      this.restoring = false
      this.restorePending = null
      clearRouteScrollMemory()
      void cancelDeviceReminders().catch(() => {})
      this.token = null
      this.currentUser = null
      setAccessToken(null)
      void setRefreshToken(null).catch(() => {})
      useSemesterStore().reset()
      useCoursesStore().attachUser(null)
      useCampusMapStore().attachUser(null)
    },
    async logout() {
      const revocation = revokeSession()
      this.clearSession()
      await revocation
    }
  }
})

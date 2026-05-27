import { defineStore } from 'pinia'

import {
  getCurrentUser,
  login as loginRequest,
  register as registerRequest,
  type AuthUser,
  type LoginPayload,
  type RegisterPayload
} from '@/api/auth'
import { TOKEN_STORAGE_KEY } from '@/api/request'

type AuthState = {
  token: string | null
  currentUser: AuthUser | null
  loadingUser: boolean
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: localStorage.getItem(TOKEN_STORAGE_KEY),
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
      localStorage.setItem(TOKEN_STORAGE_KEY, token)
    },
    setCurrentUser(user: AuthUser | null) {
      this.currentUser = user
    },
    async register(payload: RegisterPayload) {
      return registerRequest(payload)
    },
    async login(payload: LoginPayload) {
      const result = await loginRequest(payload)
      this.setToken(result.access_token)
      this.setCurrentUser(result.user)
      return result.user
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
        this.logout()
        throw error
      } finally {
        this.loadingUser = false
      }
    },
    logout() {
      this.token = null
      this.currentUser = null
      localStorage.removeItem(TOKEN_STORAGE_KEY)
    }
  }
})

import { defineStore } from 'pinia'

import { TOKEN_STORAGE_KEY } from '@/api/request'

type AuthState = {
  token: string | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: localStorage.getItem(TOKEN_STORAGE_KEY)
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token)
  },
  actions: {
    setToken(token: string) {
      this.token = token
      localStorage.setItem(TOKEN_STORAGE_KEY, token)
    },
    logout() {
      this.token = null
      localStorage.removeItem(TOKEN_STORAGE_KEY)
    }
  }
})

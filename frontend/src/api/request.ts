import axios from 'axios'

import { notifyUnauthorizedOnce } from './errors'

export const TOKEN_STORAGE_KEY = 'campusmind_token'

export function resolveApiBaseURL(
  env: { VITE_API_BASE_URL?: string; DEV?: boolean } = import.meta.env
): string {
  const configured = env.VITE_API_BASE_URL?.trim()
  if (configured) {
    return configured
  }
  if (env.DEV) {
    return 'http://127.0.0.1:8000'
  }
  console.warn(
    '未显式配置 VITE_API_BASE_URL，生产构建将使用同源相对路径访问后端接口'
  )
  return ''
}

const apiBaseURL = resolveApiBaseURL()

const request = axios.create({
  baseURL: apiBaseURL,
  timeout: 10000
})

request.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY)
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

request.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const response =
      error && typeof error === 'object' && 'response' in error
        ? error.response
        : null
    if (
      response &&
      typeof response === 'object' &&
      'status' in response &&
      response.status === 401
    ) {
      try {
        await notifyUnauthorizedOnce()
      } catch {
        // Session cleanup/navigation is best-effort; callers still receive the
        // original API error so page-level handling remains deterministic.
      }
    }
    return Promise.reject(error)
  }
)

export default request

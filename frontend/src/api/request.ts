import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'

import {
  clearSessionTokens,
  getAccessToken,
  getRefreshToken,
  isNativeAuthClient,
  setAccessToken,
  setRefreshToken
} from '@/auth/sessionTokens'
import { notifyUnauthorizedOnce } from './errors'

// Kept as an export for one release so old installations and tests can remove
// the previous localStorage credential. New access tokens are memory-only.
export const TOKEN_STORAGE_KEY = 'campusmind_token'

type RefreshResponse = {
  access_token: string
  token_type: 'bearer'
  expires_in: number
  refresh_token?: string
}

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retriedAfterRefresh?: boolean
}

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
const sessionRequest = axios.create({
  baseURL: apiBaseURL,
  timeout: 10000,
  withCredentials: true
})

const request = axios.create({
  baseURL: apiBaseURL,
  timeout: 10000,
  withCredentials: true
})

let refreshPromise: Promise<string> | null = null

function isAuthBootstrapRequest(url: string | undefined): boolean {
  return Boolean(
    url?.includes('/api/auth/login') ||
      url?.includes('/api/auth/register') ||
      url?.includes('/api/auth/refresh')
  )
}

async function performRefresh(): Promise<string> {
  const native = isNativeAuthClient()
  const storedRefreshToken = native ? await getRefreshToken() : null
  if (native && !storedRefreshToken) {
    throw new Error('No native refresh token is available')
  }

  const response = await sessionRequest.post<RefreshResponse>('/api/auth/refresh', {
    client_kind: native ? 'native' : 'web',
    refresh_token: storedRefreshToken
  })
  if (native) {
    if (!response.data.refresh_token) {
      throw new Error('The backend did not rotate the native refresh token')
    }
    await setRefreshToken(response.data.refresh_token)
  }
  setAccessToken(response.data.access_token)
  return response.data.access_token
}

export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    const pending = performRefresh()
    refreshPromise = pending.finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

function isRejectedRefreshCredential(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401
}

export async function restoreSession(): Promise<boolean> {
  try {
    await refreshAccessToken()
    return true
  } catch (error) {
    setAccessToken(null)
    if (isRejectedRefreshCredential(error)) {
      await clearSessionTokens()
    }
    return false
  }
}

export async function revokeSession(): Promise<void> {
  const native = isNativeAuthClient()
  const refreshToken = native ? await getRefreshToken() : null
  await sessionRequest.post('/api/auth/logout', {
    client_kind: native ? 'native' : 'web',
    refresh_token: refreshToken
  })
  await clearSessionTokens()
}

request.interceptors.request.use((config) => {
  const token = getAccessToken()
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
    const config =
      error && typeof error === 'object' && 'config' in error
        ? (error.config as RetryableRequestConfig | undefined)
        : undefined
    const unauthorized = Boolean(
      response &&
        typeof response === 'object' &&
        'status' in response &&
        response.status === 401
    )

    if (
      unauthorized &&
      config &&
      !config._retriedAfterRefresh &&
      !isAuthBootstrapRequest(config.url)
    ) {
      config._retriedAfterRefresh = true
      try {
        const token = await refreshAccessToken()
        config.headers = AxiosHeaders.from(config.headers)
        config.headers.set('Authorization', `Bearer ${token}`)
        return await request(config)
      } catch (refreshError) {
        if (!isRejectedRefreshCredential(refreshError)) {
          // Preserve the refresh credential during an offline/5xx failure. A
          // later request or app restart can retry without forcing a login.
          setAccessToken(null)
          return Promise.reject(refreshError)
        }
        await clearSessionTokens()
        try {
          await notifyUnauthorizedOnce()
        } catch {
          // Cleanup/navigation is best-effort. The original request error is
          // still returned so page-level behavior stays deterministic.
        }
        return Promise.reject(error)
      }
    }
    if (
      unauthorized &&
      (!config ||
        (config._retriedAfterRefresh && !isAuthBootstrapRequest(config.url)))
    ) {
      await clearSessionTokens()
      try {
        await notifyUnauthorizedOnce()
      } catch {
        // Preserve the original API failure if route cleanup also fails.
      }
    }
    return Promise.reject(error)
  }
)

export default request

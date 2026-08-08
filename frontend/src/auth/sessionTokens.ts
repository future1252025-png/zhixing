import { Capacitor, registerPlugin } from '@capacitor/core'

interface SecureSessionPlugin {
  set(options: { value: string }): Promise<void>
  get(): Promise<{ value: string | null }>
  remove(): Promise<void>
}

const SecureSession = registerPlugin<SecureSessionPlugin>('SecureSession')
const PENDING_WEB_LOGOUT_KEY = 'campusmind_pending_web_logout'

// Access tokens deliberately live only in memory. A page/app restart restores
// the session with the revocable refresh credential instead of persisting a
// long-lived bearer token in Web Storage.
let accessToken: string | null = null

export function isNativeAuthClient(): boolean {
  return Capacitor.isNativePlatform()
}

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
  // Remove the legacy persisted access token during the auth migration.
  localStorage.removeItem('campusmind_token')
}

export async function getRefreshToken(): Promise<string | null> {
  if (!isNativeAuthClient()) return null
  const result = await SecureSession.get()
  return result.value
}

export async function setRefreshToken(token: string | null): Promise<void> {
  if (!isNativeAuthClient()) return
  if (token) {
    await SecureSession.set({ value: token })
  } else {
    await SecureSession.remove()
  }
}

export async function clearSessionTokens(): Promise<void> {
  setAccessToken(null)
  await setRefreshToken(null)
}

export function hasPendingWebLogout(): boolean {
  try {
    return localStorage.getItem(PENDING_WEB_LOGOUT_KEY) === '1'
  } catch {
    return false
  }
}

export function markPendingWebLogout(): void {
  try {
    localStorage.setItem(PENDING_WEB_LOGOUT_KEY, '1')
  } catch {
    // Access tokens are already memory-only. If Web Storage is unavailable,
    // the best remaining protection is clearing memory and attempting logout.
  }
}

export function clearPendingWebLogout(): void {
  try {
    localStorage.removeItem(PENDING_WEB_LOGOUT_KEY)
  } catch {
    // Best-effort cleanup for restricted WebView/browser storage modes.
  }
}

import { Capacitor, registerPlugin } from '@capacitor/core'

interface SecureSessionPlugin {
  set(options: { value: string }): Promise<void>
  get(): Promise<{ value: string | null }>
  remove(): Promise<void>
}

const SecureSession = registerPlugin<SecureSessionPlugin>('SecureSession')

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

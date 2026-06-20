export const LOGIN_INTRO_STORAGE_KEY = 'campusmind-login-intro-pending'

type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function markLoginIntroPending(storage: StorageLike = sessionStorage): void {
  storage.setItem(LOGIN_INTRO_STORAGE_KEY, '1')
}

export function consumeLoginIntroFlag(storage: StorageLike = sessionStorage): boolean {
  const pending = storage.getItem(LOGIN_INTRO_STORAGE_KEY) === '1'
  if (pending) {
    storage.removeItem(LOGIN_INTRO_STORAGE_KEY)
  }
  return pending
}

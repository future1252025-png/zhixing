type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const SCOPED_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/

export function scopedStorageKey(userId: number, key: string): string {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new TypeError('userId must be a positive safe integer')
  }
  if (!SCOPED_KEY_PATTERN.test(key)) {
    throw new TypeError('storage key contains unsupported characters')
  }
  return `campusmind:${userId}:${key}`
}

export function createScopedStorage(
  userId: number,
  storage: StorageLike = localStorage
) {
  const get = (key: string): string | null =>
    storage.getItem(scopedStorageKey(userId, key))
  const set = (key: string, value: string): void => {
    storage.setItem(scopedStorageKey(userId, key), value)
  }
  const remove = (key: string): void => {
    storage.removeItem(scopedStorageKey(userId, key))
  }
  return {
    get,
    set,
    remove,
    getItem: get,
    setItem: set,
    removeItem: remove
  }
}

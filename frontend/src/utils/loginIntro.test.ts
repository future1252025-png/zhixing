import { describe, expect, it } from 'vitest'

import {
  LOGIN_INTRO_STORAGE_KEY,
  consumeLoginIntroFlag,
  markLoginIntroPending
} from './loginIntro'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  }
}

describe('login intro flag', () => {
  it('marks the next app screen to play the login intro once', () => {
    const storage = createStorage()

    markLoginIntroPending(storage)

    expect(storage.getItem(LOGIN_INTRO_STORAGE_KEY)).toBe('1')
    expect(consumeLoginIntroFlag(storage)).toBe(true)
    expect(consumeLoginIntroFlag(storage)).toBe(false)
  })
})

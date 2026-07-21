import { beforeEach, describe, expect, it } from 'vitest'

import { createScopedStorage, scopedStorageKey } from './scopedStorage'
import { readRecentChatEntries, rememberRecentChatEntry } from './chat'

describe('user-scoped storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('isolates the same key between users', () => {
    const first = createScopedStorage(10)
    const second = createScopedStorage(11)

    first.set('selected-week', '3')
    second.set('selected-week', '8')

    expect(first.get('selected-week')).toBe('3')
    expect(second.get('selected-week')).toBe('8')
    expect(localStorage.getItem('campusmind:10:selected-week')).toBe('3')
  })

  it('removes only the current user key', () => {
    const first = createScopedStorage(10)
    const second = createScopedStorage(11)
    first.set('draft', 'first')
    second.set('draft', 'second')

    first.remove('draft')

    expect(first.get('draft')).toBeNull()
    expect(second.get('draft')).toBe('second')
  })

  it('rejects invalid user ids and unsafe keys', () => {
    expect(() => scopedStorageKey(0, 'week')).toThrow()
    expect(() => scopedStorageKey(Number.NaN, 'week')).toThrow()
    expect(() => scopedStorageKey(1, '')).toThrow()
    expect(() => scopedStorageKey(1, ':week')).toThrow()
  })

  it('keeps recent chat history private to each account', () => {
    const first = createScopedStorage(10)
    const second = createScopedStorage(11)

    rememberRecentChatEntry(first, {
      buildingId: 1,
      buildingName: '教4',
      roomName: '203'
    })

    expect(readRecentChatEntries(first)).toHaveLength(1)
    expect(readRecentChatEntries(second)).toEqual([])
  })
})

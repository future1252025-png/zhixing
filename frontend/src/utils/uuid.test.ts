import { afterEach, expect, it, vi } from 'vitest'
import { createUuid } from './uuid'

afterEach(() => vi.restoreAllMocks())
it('uses the native UUID implementation when available', () => {
  const value = '12345678-1234-4234-9234-123456789abc'
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(value)
  expect(createUuid()).toBe(value)
})
it('creates distinct version 4 UUIDs without randomUUID', () => {
  vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) })
  try {
    const values = Array.from({ length: 20 }, createUuid)
    expect(new Set(values).size).toBe(20)
    for (const value of values) expect(value).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/)
  } finally { vi.unstubAllGlobals() }
})

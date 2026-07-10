import { describe, expect, it } from 'vitest'

import { parseApiDateTime } from './dateTime'

describe('API date time parsing', () => {
  it('treats timezone-less backend timestamps as UTC', () => {
    expect(parseApiDateTime('2026-07-10T13:16:00').toISOString()).toBe(
      '2026-07-10T13:16:00.000Z'
    )
  })

  it('preserves timestamps that already include a timezone', () => {
    expect(parseApiDateTime('2026-07-10T13:16:00+08:00').toISOString()).toBe(
      '2026-07-10T05:16:00.000Z'
    )
  })
})

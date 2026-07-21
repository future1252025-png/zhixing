import { describe, expect, it, vi } from 'vitest'

import { measureKeyboardInset, scrollFocusedFieldIntoView } from './keyboardInset'

describe('measureKeyboardInset', () => {
  it('returns 0 when visual viewport is missing', () => {
    expect(measureKeyboardInset(800, null)).toBe(0)
  })

  it('returns space covered by keyboard at the bottom', () => {
    expect(
      measureKeyboardInset(800, {
        height: 500,
        offsetTop: 0
      })
    ).toBe(300)
  })

  it('accounts for visualViewport offsetTop when scrolled', () => {
    expect(
      measureKeyboardInset(800, {
        height: 500,
        offsetTop: 40
      })
    ).toBe(260)
  })

  it('never returns negative inset', () => {
    expect(
      measureKeyboardInset(500, {
        height: 520,
        offsetTop: 0
      })
    ).toBe(0)
  })
})

describe('scrollFocusedFieldIntoView', () => {
  it('scrolls targets that support scrollIntoView', () => {
    vi.useFakeTimers()
    const scrollIntoView = vi.fn()
    const target = { scrollIntoView } as unknown as HTMLElement

    scrollFocusedFieldIntoView(target, { delayMs: 100 })
    expect(scrollIntoView).toHaveBeenCalled()

    vi.advanceTimersByTime(100)
    expect(scrollIntoView).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('ignores non-element targets', () => {
    expect(() => scrollFocusedFieldIntoView(null)).not.toThrow()
  })
})

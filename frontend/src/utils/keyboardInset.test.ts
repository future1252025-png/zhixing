import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'

import {
  isSoftwareKeyboardField,
  measureKeyboardInset,
  scrollFocusedFieldIntoView,
  useKeyboardAwarePage
} from './keyboardInset'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

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

  it('does not treat iOS page zoom as a keyboard inset', () => {
    expect(
      measureKeyboardInset(800, {
        height: 500,
        offsetTop: 0,
        scale: 1.6
      })
    ).toBe(0)
  })
})

describe('isSoftwareKeyboardField', () => {
  it.each(['text', 'search', 'email', 'password', 'tel', 'url', 'number'])(
    'accepts editable %s inputs',
    (type) => {
      const input = document.createElement('input')
      input.type = type
      expect(isSoftwareKeyboardField(input)).toBe(true)
    }
  )

  it('accepts textarea, select and contenteditable controls', () => {
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    expect(isSoftwareKeyboardField(document.createElement('textarea'))).toBe(true)
    expect(isSoftwareKeyboardField(document.createElement('select'))).toBe(true)
    expect(isSoftwareKeyboardField(editable)).toBe(true)
  })

  it.each(['button', 'file', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'hidden'])(
    'rejects %s inputs',
    (type) => {
      const input = document.createElement('input')
      input.type = type
      expect(isSoftwareKeyboardField(input)).toBe(false)
    }
  )

  it('rejects links and non-editable controls', () => {
    const input = document.createElement('input')
    input.readOnly = true
    const textarea = document.createElement('textarea')
    textarea.disabled = true
    expect(isSoftwareKeyboardField(document.createElement('a'))).toBe(false)
    expect(isSoftwareKeyboardField(input)).toBe(false)
    expect(isSoftwareKeyboardField(textarea)).toBe(false)
  })

  it('is safe when DOM constructors are unavailable', () => {
    vi.stubGlobal('HTMLElement', undefined)
    expect(() => isSoftwareKeyboardField(null)).not.toThrow()
    expect(isSoftwareKeyboardField(null)).toBe(false)
    vi.unstubAllGlobals()
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
  })

  it('returns a cleanup that cancels its delayed pass', () => {
    vi.useFakeTimers()
    const scrollIntoView = vi.fn()
    const target = { scrollIntoView } as unknown as HTMLElement

    const cancel = scrollFocusedFieldIntoView(target, { delayMs: 100 })
    cancel()
    vi.advanceTimersByTime(100)

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('ignores non-element targets', () => {
    expect(() => scrollFocusedFieldIntoView(null)).not.toThrow()
  })

  it('runs safely without window and does not schedule a delayed pass', () => {
    const scrollIntoView = vi.fn()
    const target = { scrollIntoView } as unknown as HTMLElement
    vi.stubGlobal('window', undefined)

    const cancel = scrollFocusedFieldIntoView(target)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(cancel).toBeTypeOf('function')
    expect(() => cancel()).not.toThrow()
  })
})

describe('useKeyboardAwarePage focus lifecycle', () => {
  function mountHarness() {
    const Harness = defineComponent({
      setup() {
        const { onFieldFocus } = useKeyboardAwarePage()
        return () => h('main', { onFocusin: onFieldFocus }, [
          h('input', { id: 'first', type: 'text' }),
          h('input', { id: 'second', type: 'text' }),
          h('button', { id: 'button' }, 'button'),
          h('a', { id: 'link', href: '#' }, 'link'),
          h('input', { id: 'file', type: 'file' })
        ])
      }
    })
    const host = document.createElement('div')
    document.body.append(host)
    const application = createApp(Harness)
    application.mount(host)
    return { application, host }
  }

  it('only scrolls fields that can invoke an on-screen keyboard', async () => {
    vi.useFakeTimers()
    const { application, host } = mountHarness()
    await nextTick()
    const editable = host.querySelector<HTMLInputElement>('#first')!
    const button = host.querySelector<HTMLButtonElement>('#button')!
    const link = host.querySelector<HTMLAnchorElement>('#link')!
    const file = host.querySelector<HTMLInputElement>('#file')!
    editable.scrollIntoView = vi.fn()
    button.scrollIntoView = vi.fn()
    link.scrollIntoView = vi.fn()
    file.scrollIntoView = vi.fn()

    editable.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    link.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    file.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    vi.runAllTimers()

    expect(editable.scrollIntoView).toHaveBeenCalledTimes(1)
    expect(button.scrollIntoView).not.toHaveBeenCalled()
    expect(link.scrollIntoView).not.toHaveBeenCalled()
    expect(file.scrollIntoView).not.toHaveBeenCalled()
    application.unmount()
  })

  it('replaces the previous delayed scroll when focus changes', async () => {
    vi.useFakeTimers()
    const { application, host } = mountHarness()
    await nextTick()
    const first = host.querySelector<HTMLInputElement>('#first')!
    const second = host.querySelector<HTMLInputElement>('#second')!
    first.scrollIntoView = vi.fn()
    second.scrollIntoView = vi.fn()

    first.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    second.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    vi.runAllTimers()

    expect(first.scrollIntoView).toHaveBeenCalledTimes(1)
    expect(second.scrollIntoView).toHaveBeenCalledTimes(2)
    application.unmount()
  })

  it('cancels delayed scrolling when the page unmounts', async () => {
    vi.useFakeTimers()
    const { application, host } = mountHarness()
    await nextTick()
    const editable = host.querySelector<HTMLInputElement>('#first')!
    editable.scrollIntoView = vi.fn()

    editable.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    application.unmount()
    vi.runAllTimers()

    expect(editable.scrollIntoView).toHaveBeenCalledTimes(1)
  })
})

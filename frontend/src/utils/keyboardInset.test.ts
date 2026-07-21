import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'

import {
  createKeyboardInsetTracker,
  isSoftwareKeyboardField,
  measureKeyboardInset,
  scrollFocusedFieldIntoView,
  useKeyboardAwarePage,
  useKeyboardInset
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

  it('does not subtract visualViewport offsetTop from keyboard height', () => {
    expect(
      measureKeyboardInset(800, {
        height: 500,
        offsetTop: 40
      })
    ).toBe(300)
  })

  it('never returns negative inset', () => {
    expect(
      measureKeyboardInset(500, {
        height: 520,
        offsetTop: 0
      })
    ).toBe(0)
  })

  it('does not treat pure iOS page zoom as a keyboard inset', () => {
    expect(
      measureKeyboardInset(800, {
        height: 500,
        offsetTop: 100,
        scale: 1.6
      })
    ).toBe(0)
  })

  it('still measures a keyboard while the iOS page is zoomed', () => {
    expect(
      measureKeyboardInset(800, {
        height: 300,
        offsetTop: 100,
        scale: 1.6
      })
    ).toBe(200)
    expect(
      measureKeyboardInset(800, {
        height: 300,
        offsetTop: 200,
        scale: 1.6
      })
    ).toBe(200)
  })
})

describe('keyboard viewport baseline', () => {
  it('keeps the same-scale no-keyboard baseline while offsetTop changes', () => {
    const tracker = createKeyboardInsetTracker()

    expect(tracker.measure(800, { height: 500, offsetTop: 100, scale: 1.6 })).toBe(0)
    expect(tracker.getBaseline()).toMatchObject({
      layoutHeight: 800,
      scale: 1.6,
      height: 500,
      offsetTop: 100,
      bottom: 600
    })
    expect(tracker.measure(800, { height: 300, offsetTop: 100, scale: 1.6 })).toBe(200)
    expect(tracker.measure(800, { height: 300, offsetTop: 200, scale: 1.6 })).toBe(200)
    expect(tracker.getBaseline()).toMatchObject({ height: 500, offsetTop: 100, bottom: 600 })
  })

  it('recovers its observed baseline when the keyboard closes', () => {
    const tracker = createKeyboardInsetTracker()
    expect(tracker.measure(800, { height: 500, offsetTop: 100, scale: 1.6 })).toBe(0)
    expect(tracker.measure(800, { height: 300, offsetTop: 200, scale: 1.6 })).toBe(200)

    expect(tracker.measure(800, { height: 500, offsetTop: 200, scale: 1.6 })).toBe(0)
    expect(tracker.getBaseline()).toMatchObject({ height: 500, offsetTop: 200, bottom: 700 })
  })

  it('does not capture an initially open keyboard as the no-keyboard baseline', () => {
    const tracker = createKeyboardInsetTracker()
    expect(tracker.measure(800, { height: 500, offsetTop: 100, scale: 1 })).toBe(300)
    expect(tracker.getBaseline()).toMatchObject({ height: 800, scale: 1 })
  })

  it('rebuilds for scale, rotation and layout resize changes', () => {
    const tracker = createKeyboardInsetTracker()
    expect(tracker.measure(800, { height: 800, offsetTop: 0, scale: 1 })).toBe(0)

    expect(tracker.measure(800, { height: 300, offsetTop: 100, scale: 1.6 })).toBe(200)
    expect(tracker.getBaseline()).toMatchObject({ height: 500, scale: 1.6 })

    expect(tracker.measure(600, { height: 400, offsetTop: 0, scale: 1.5 })).toBe(0)
    expect(tracker.getBaseline()).toMatchObject({ layoutHeight: 600, height: 400, scale: 1.5 })
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

  it('accepts plaintext-only and the browser isContentEditable signal', () => {
    const plaintext = document.createElement('div')
    plaintext.setAttribute('contenteditable', 'plaintext-only')
    const browserEditable = document.createElement('div')
    Object.defineProperty(browserEditable, 'isContentEditable', { value: true })

    expect(isSoftwareKeyboardField(plaintext)).toBe(true)
    expect(isSoftwareKeyboardField(browserEditable)).toBe(true)
  })

  it('honors the nearest contenteditable boundary, including false subtrees', () => {
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    const disabledRegion = document.createElement('div')
    disabledRegion.setAttribute('contenteditable', 'false')
    const disabledChild = document.createElement('span')
    disabledRegion.append(disabledChild)
    editor.append(disabledRegion)

    const reenabled = document.createElement('span')
    reenabled.setAttribute('contenteditable', 'plaintext-only')
    disabledRegion.append(reenabled)

    expect(isSoftwareKeyboardField(disabledChild)).toBe(false)
    expect(isSoftwareKeyboardField(reenabled)).toBe(true)
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
  function useViewport(height: number, options: { layoutHeight?: number; offsetTop?: number; scale?: number } = {}) {
    const viewport = {
      height,
      offsetTop: options.offsetTop ?? 0,
      scale: options.scale ?? 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }
    vi.stubGlobal('innerHeight', options.layoutHeight ?? 800)
    vi.stubGlobal('visualViewport', viewport)
    return viewport
  }

  function scrollTarget(bottom: number) {
    const target = document.createElement('input')
    target.scrollIntoView = vi.fn()
    target.getBoundingClientRect = vi.fn(() => ({
      top: bottom - 44,
      bottom,
      left: 0,
      right: 200,
      width: 200,
      height: 44,
      x: 0,
      y: bottom - 44,
      toJSON: () => ({})
    }))
    return target
  }

  it('does not scroll on desktop when there is no keyboard inset', () => {
    vi.useFakeTimers()
    useViewport(800)
    const target = scrollTarget(900)

    scrollFocusedFieldIntoView(target, { delayMs: 100 })
    vi.runAllTimers()
    expect(target.scrollIntoView).not.toHaveBeenCalled()
  })

  it('does not scroll a field already visible above the keyboard', () => {
    vi.useFakeTimers()
    useViewport(500)
    const target = scrollTarget(480)

    scrollFocusedFieldIntoView(target, { delayMs: 100 })
    vi.runAllTimers()
    expect(target.scrollIntoView).not.toHaveBeenCalled()
  })

  it('minimally scrolls an obscured field at most once', () => {
    vi.useFakeTimers()
    useViewport(500)
    const target = scrollTarget(560)

    scrollFocusedFieldIntoView(target, { delayMs: 100 })
    vi.runAllTimers()

    expect(target.scrollIntoView).toHaveBeenCalledTimes(1)
    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest'
    })
  })

  it('waits for keyboard animation and scrolls once only if still obscured', () => {
    vi.useFakeTimers()
    const viewport = useViewport(800)
    const target = scrollTarget(560)

    scrollFocusedFieldIntoView(target, { delayMs: 100 })
    expect(target.scrollIntoView).not.toHaveBeenCalled()
    viewport.height = 500
    vi.advanceTimersByTime(100)

    expect(target.scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('uses the same zoom baseline when offsetTop changes during keyboard animation', () => {
    vi.useFakeTimers()
    const tracker = createKeyboardInsetTracker()
    const viewport = useViewport(500, { layoutHeight: 800, offsetTop: 100, scale: 1.6 })
    const target = scrollTarget(560)

    scrollFocusedFieldIntoView(target, { delayMs: 100, tracker })
    expect(target.scrollIntoView).not.toHaveBeenCalled()
    viewport.height = 300
    viewport.offsetTop = 200
    vi.advanceTimersByTime(100)

    expect(target.scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('returns a cleanup that cancels its delayed visibility check', () => {
    vi.useFakeTimers()
    const viewport = useViewport(800)
    const target = scrollTarget(560)

    const cancel = scrollFocusedFieldIntoView(target, { delayMs: 100 })
    viewport.height = 500
    cancel()
    vi.advanceTimersByTime(100)

    expect(target.scrollIntoView).not.toHaveBeenCalled()
  })

  it('ignores non-element targets', () => {
    expect(() => scrollFocusedFieldIntoView(null)).not.toThrow()
  })

  it('runs safely without window and does not schedule a delayed pass', () => {
    const scrollIntoView = vi.fn()
    const target = { scrollIntoView } as unknown as HTMLElement
    vi.stubGlobal('window', undefined)

    const cancel = scrollFocusedFieldIntoView(target)
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(cancel).toBeTypeOf('function')
    expect(() => cancel()).not.toThrow()
  })
})

describe('useKeyboardInset lifecycle for the message composer', () => {
  it('tracks open, offset changes, close and scale reset, then disposes its baseline', async () => {
    const listeners = new Map<string, Set<EventListener>>()
    const viewport = {
      height: 500,
      offsetTop: 100,
      scale: 1.6,
      addEventListener: vi.fn((name: string, listener: EventListener) => {
        const group = listeners.get(name) ?? new Set<EventListener>()
        group.add(listener)
        listeners.set(name, group)
      }),
      removeEventListener: vi.fn((name: string, listener: EventListener) => {
        listeners.get(name)?.delete(listener)
      })
    }
    const dispatchViewport = (name: string) => {
      listeners.get(name)?.forEach((listener) => listener(new Event(name)))
    }
    vi.stubGlobal('innerHeight', 800)
    vi.stubGlobal('visualViewport', viewport)
    const tracker = createKeyboardInsetTracker()
    const Harness = defineComponent({
      setup() {
        const { keyboardInset } = useKeyboardInset(tracker)
        return () => h('output', { id: 'inset' }, String(keyboardInset.value))
      }
    })
    const host = document.createElement('div')
    document.body.append(host)
    const application = createApp(Harness)
    application.mount(host)
    await nextTick()
    expect(host.textContent).toBe('0')

    viewport.height = 300
    viewport.offsetTop = 200
    dispatchViewport('resize')
    await nextTick()
    expect(host.textContent).toBe('200')

    viewport.offsetTop = 100
    dispatchViewport('scroll')
    await nextTick()
    expect(host.textContent).toBe('200')

    viewport.height = 500
    dispatchViewport('resize')
    await nextTick()
    expect(host.textContent).toBe('0')

    viewport.scale = 2
    viewport.height = 400
    viewport.offsetTop = 0
    dispatchViewport('resize')
    await nextTick()
    expect(host.textContent).toBe('0')

    vi.stubGlobal('innerHeight', 600)
    viewport.scale = 1.5
    viewport.height = 400
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    expect(host.textContent).toBe('0')
    expect(tracker.getBaseline()).toMatchObject({ layoutHeight: 600, scale: 1.5, height: 400 })

    application.unmount()
    expect(viewport.removeEventListener).toHaveBeenCalledTimes(2)
    expect(tracker.getBaseline()).toBeNull()
  })
})

describe('useKeyboardAwarePage focus lifecycle', () => {
  function useViewport(height: number) {
    const viewport = {
      height,
      offsetTop: 0,
      scale: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }
    vi.stubGlobal('innerHeight', 800)
    vi.stubGlobal('visualViewport', viewport)
    return viewport
  }

  function obscure(element: HTMLElement, bottom = 560) {
    element.getBoundingClientRect = vi.fn(() => ({
      top: bottom - 44,
      bottom,
      left: 0,
      right: 200,
      width: 200,
      height: 44,
      x: 0,
      y: bottom - 44,
      toJSON: () => ({})
    }))
  }

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
    useViewport(500)
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
    obscure(editable)
    obscure(button)
    obscure(link)
    obscure(file)

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
    const viewport = useViewport(800)
    const { application, host } = mountHarness()
    await nextTick()
    const first = host.querySelector<HTMLInputElement>('#first')!
    const second = host.querySelector<HTMLInputElement>('#second')!
    first.scrollIntoView = vi.fn()
    second.scrollIntoView = vi.fn()
    obscure(first)
    obscure(second)

    first.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    second.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    viewport.height = 500
    vi.runAllTimers()

    expect(first.scrollIntoView).not.toHaveBeenCalled()
    expect(second.scrollIntoView).toHaveBeenCalledTimes(1)
    application.unmount()
  })

  it('cancels delayed scrolling when the page unmounts', async () => {
    vi.useFakeTimers()
    const viewport = useViewport(800)
    const { application, host } = mountHarness()
    await nextTick()
    const editable = host.querySelector<HTMLInputElement>('#first')!
    editable.scrollIntoView = vi.fn()
    obscure(editable)

    editable.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    application.unmount()
    viewport.height = 500
    vi.runAllTimers()

    expect(editable.scrollIntoView).not.toHaveBeenCalled()
  })
})

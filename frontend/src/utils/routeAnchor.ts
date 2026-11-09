export const CURRENT_WEEK_ANCHOR = '#current-week'

type AnchorPosition = { el: Element; top: number; behavior: 'instant' }

/** Wait for an async route's content, not a guessed animation/network delay. */
export function waitForRouteAnchor(selector: string, isCurrent: () => boolean, prepare?: () => void) {
  let finish!: (position: AnchorPosition | false) => void
  const position = new Promise<AnchorPosition | false>(resolve => { finish = resolve })
  let settled = false
  let frame: number | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  const observer = new MutationObserver(check)

  function settle(result: AnchorPosition | false) {
    if (settled) return
    settled = true
    observer.disconnect()
    if (frame !== undefined) cancelAnimationFrame(frame)
    clearTimeout(timeout)
    window.removeEventListener('touchstart', cancel)
    window.removeEventListener('wheel', cancel)
    window.removeEventListener('keydown', onKey)
    finish(result)
  }
  function cancel() { settle(false) }
  function onKey(event: KeyboardEvent) {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) cancel()
  }
  function check() {
    if (settled || frame !== undefined) return
    if (!isCurrent()) { cancel(); return }
    if (!document.querySelector(selector)) return
    prepare?.()
    // Let Vue's post-flush measurements finish before calculating the final position.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        frame = undefined
        if (!isCurrent()) { cancel(); return }
        const target = document.querySelector(selector)
        if (!target) return
        settle({ el: target, top: Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 12, behavior: 'instant' })
      })
    })
  }
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-scroll-ready'] })
  window.addEventListener('touchstart', cancel, { passive: true })
  window.addEventListener('wheel', cancel, { passive: true })
  window.addEventListener('keydown', onKey)
  timeout = setTimeout(cancel, 15_000)
  check()
  return { position, cancel }
}

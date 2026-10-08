export type ScrollPoint = { left: number; top: number }
export type RouteScrollSnapshot = {
  viewport: ScrollPoint
  regions: Record<string, ScrollPoint>
  view: Record<string, unknown>
}

export const SCROLL_TAB_PATHS = new Set(['/home', '/courses', '/reminders', '/profile'])
const entries = new Map<string, RouteScrollSnapshot>()
const tabs = new Map<string, RouteScrollSnapshot>()
let owner: number | null = null

export function historyEntryPosition(): number {
  const position = window.history.state?.position
  return typeof position === 'number' ? position : 0
}
const entryKey = (position: number, fullPath: string) => `${position}:${fullPath}`

export function clearRouteScrollMemory() { entries.clear(); tabs.clear() }
export function attachRouteScrollOwner(userId: number | null) {
  if (owner !== userId) { clearRouteScrollMemory(); owner = userId }
}

export function rememberRouteScroll(position: number, fullPath: string, snapshot: RouteScrollSnapshot) {
  const key = entryKey(position, fullPath)
  entries.delete(key)
  entries.set(key, snapshot)
  while (entries.size > 100) entries.delete(entries.keys().next().value!)
  const path = fullPath.split(/[?#]/)[0]!
  if (SCROLL_TAB_PATHS.has(path)) tabs.set(path, snapshot)
}

export function savedRouteScroll(fullPath: string, position = historyEntryPosition()) {
  return entries.get(entryKey(position, fullPath))
}
export function savedTabScroll(path: string) { return tabs.get(path) }
export function savedRouteView(fullPath: string): Record<string, unknown> {
  return (savedRouteScroll(fullPath) ?? (!fullPath.includes('#') ? tabs.get(fullPath) : undefined))?.view ?? {}
}

export function findRouteRoot(fullPath: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-route-scroll-key]'))
    .find(element => element.dataset.routeScrollKey === fullPath && !Array.from(element.classList).some(name => name.endsWith('-leave-active')))
}
export function captureRouteScroll(fullPath: string): RouteScrollSnapshot | null {
  const root = findRouteRoot(fullPath)
  if (!root || root.dataset.routeContentReady === 'false') return null
  const regions: Record<string, ScrollPoint> = Object.create(null)
  root.querySelectorAll<HTMLElement>('[data-scroll-region]').forEach(element => {
    const key = element.dataset.scrollRegion
    if (key) regions[key] = { left: element.scrollLeft, top: element.scrollTop }
  })
  let view: Record<string, unknown> = {}
  const encoded = root.dataset.routeViewState
  if (encoded && encoded.length < 8000) {
    try {
      const parsed: unknown = JSON.parse(encoded)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) view = parsed as Record<string, unknown>
    } catch { /* Scroll restoration must work even without optional list state. */ }
  }
  return { viewport: { left: window.scrollX, top: window.scrollY }, regions, view }
}

/** Wait for out-in transitions and asynchronous page content, then apply once.
 * Never fight a user's gesture or an abandoned navigation. No persistent data.
 */
export function waitForRouteContent(fullPath: string, isCurrent: () => boolean, apply: (root: HTMLElement) => void) {
  let finish!: (value: false) => void
  const position = new Promise<false>(resolve => { finish = resolve })
  let settled = false
  let frame: number | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  const observer = new MutationObserver(check)

  function readyRoot() {
    const root = findRouteRoot(fullPath)
    if (!root || root.dataset.routeContentReady === 'false') return null
    if (Array.from(root.classList).some(name => /-(enter|leave)-active$/.test(name))) return null
    return root
  }
  function cancel() {
    if (settled) return
    settled = true
    observer.disconnect()
    if (frame !== undefined) cancelAnimationFrame(frame)
    clearTimeout(timeout)
    window.removeEventListener('touchstart', cancel)
    window.removeEventListener('pointerdown', cancel)
    window.removeEventListener('wheel', cancel)
    window.removeEventListener('keydown', onKey)
    finish(false)
  }
  function onKey(event: KeyboardEvent) {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) cancel()
  }
  function check() {
    if (settled || frame !== undefined) return
    if (!isCurrent()) { cancel(); return }
    if (!readyRoot()) return
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        frame = undefined
        if (!isCurrent()) { cancel(); return }
        const root = readyRoot()
        if (!root) return
        cancel()
        apply(root)
      })
    })
  }
  observer.observe(document.body, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['data-route-scroll-key', 'data-route-content-ready', 'class'] })
  window.addEventListener('touchstart', cancel, { passive: true })
  window.addEventListener('pointerdown', cancel, { passive: true })
  window.addEventListener('wheel', cancel, { passive: true })
  window.addEventListener('keydown', onKey)
  timeout = setTimeout(cancel, 15_000)
  check()
  return { position, cancel }
}

export function applyRouteScroll(root: HTMLElement, snapshot: RouteScrollSnapshot) {
  for (const element of root.querySelectorAll<HTMLElement>('[data-scroll-region]')) {
    const point = snapshot.regions[element.dataset.scrollRegion ?? '']
    if (point) element.scrollTo({ ...point, behavior: 'instant' })
  }
  window.scrollTo({ ...snapshot.viewport, behavior: 'instant' })
}

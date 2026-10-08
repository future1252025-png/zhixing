import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { applyRouteScroll, attachRouteScrollOwner, captureRouteScroll, clearRouteScrollMemory,
  rememberRouteScroll, savedRouteScroll, savedTabScroll, waitForRouteContent } from './routeScroll'

beforeEach(() => { vi.useFakeTimers(); clearRouteScrollMemory(); document.body.replaceChildren(); vi.clearAllMocks() })
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren() })
const snapshot = (top: number) => ({ viewport: { left: 0, top }, regions: {}, view: {} })
function page(path: string, ready = true) {
  const root = document.createElement('section')
  root.dataset.routeScrollKey = path
  root.dataset.routeContentReady = String(ready)
  document.body.append(root)
  return root
}

it('keeps history entries and room query parameters separate, while remembering the latest tab', () => {
  rememberRouteScroll(1, '/profile', snapshot(900))
  rememberRouteScroll(3, '/profile', snapshot(450))
  rememberRouteScroll(4, '/buildings/1/messages?room_name=A', snapshot(240))
  rememberRouteScroll(5, '/buildings/1/messages?room_name=B', snapshot(800))
  expect(savedRouteScroll('/profile', 1)?.viewport.top).toBe(900)
  expect(savedRouteScroll('/profile', 3)?.viewport.top).toBe(450)
  expect(savedRouteScroll('/buildings/1/messages?room_name=B', 5)?.viewport.top).toBe(800)
  expect(savedRouteScroll('/buildings/1/messages?room_name=A', 5)).toBeUndefined()
  expect(savedTabScroll('/profile')?.viewport.top).toBe(450)
})

it('bounds history memory and clears it when the account changes', () => {
  attachRouteScrollOwner(7)
  for (let i = 0; i < 110; i++) rememberRouteScroll(i, '/profile', snapshot(i))
  expect(savedRouteScroll('/profile', 0)).toBeUndefined()
  expect(savedRouteScroll('/profile', 109)).toBeDefined()
  attachRouteScrollOwner(8)
  expect(savedRouteScroll('/profile', 109)).toBeUndefined()
  expect(savedTabScroll('/profile')).toBeUndefined()
})

it('captures independent scroll regions and only explicitly declared view state', () => {
  const root = page('/map')
  root.dataset.routeViewState = JSON.stringify({ query: '教学楼', visibleCount: 120 })
  const region = document.createElement('div'); region.dataset.scrollRegion = 'directory'
  region.scrollTop = 750; region.scrollLeft = 12
  root.append(region)
  expect(captureRouteScroll('/map')).toMatchObject({ regions: { directory: { top: 750, left: 12 } }, view: { query: '教学楼', visibleCount: 120 } })
  root.dataset.routeContentReady = 'false'
  expect(captureRouteScroll('/map')).toBeNull()
  expect(captureRouteScroll('/profile')).toBeNull()
})

it('waits for the target DOM, its route transition and its async content', async () => {
  const old = page('/profile/semester')
  const apply = vi.fn()
  const pending = waitForRouteContent('/profile', () => true, apply)
  await vi.advanceTimersByTimeAsync(50)
  expect(apply).not.toHaveBeenCalled()
  old.remove()
  const root = page('/profile', false)
  root.className = 'route-back-enter-active'
  root.dataset.routeContentReady = 'true'
  await vi.advanceTimersByTimeAsync(50)
  expect(apply).not.toHaveBeenCalled()
  root.className = ''
  await vi.advanceTimersByTimeAsync(50)
  expect(apply).toHaveBeenCalledExactlyOnceWith(root)
  await expect(pending.position).resolves.toBe(false)
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['touchstart', 'pointerdown', 'wheel'])('cancels delayed restoration on %s and never pulls back the user', async event => {
  const apply = vi.fn()
  const pending = waitForRouteContent('/profile', () => true, apply)
  window.dispatchEvent(new Event(event))
  page('/profile')
  await vi.advanceTimersByTimeAsync(100)
  await expect(pending.position).resolves.toBe(false)
  expect(apply).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('cancels queued frames on another navigation and stops waiting for stalled content', async () => {
  const apply = vi.fn()
  let current = true
  page('/profile')
  const first = waitForRouteContent('/profile', () => current, apply)
  current = false
  await vi.advanceTimersByTimeAsync(50)
  await expect(first.position).resolves.toBe(false)
  const second = waitForRouteContent('/map', () => true, apply)
  await vi.advanceTimersByTimeAsync(15_000)
  await expect(second.position).resolves.toBe(false)
  expect(apply).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('restores nested offsets and document position without smooth scrolling', () => {
  const root = page('/map')
  const region = document.createElement('div'); region.dataset.scrollRegion = 'directory'
  region.scrollTo = vi.fn(); root.append(region)
  applyRouteScroll(root, { ...snapshot(460), regions: { directory: { left: 0, top: 800 } } })
  expect(region.scrollTo).toHaveBeenCalledWith({ left: 0, top: 800, behavior: 'instant' })
  expect(window.scrollTo).toHaveBeenCalledWith({ left: 0, top: 460, behavior: 'instant' })
})

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { waitForRouteAnchor } from './routeAnchor'

beforeEach(() => { vi.useFakeTimers(); document.body.replaceChildren() })
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren() })

function mountTarget(ready = false) {
  const target = document.createElement('div')
  target.id = 'current-week'
  target.dataset.scrollReady = String(ready)
  target.style.scrollMarginTop = '44px'
  document.body.append(target)
  return target
}
const selector = '#current-week[data-scroll-ready="true"]'

it('waits for async content, prepares the selected week, then locates once without smooth scrolling', async () => {
  const prepare = vi.fn()
  const pending = waitForRouteAnchor(selector, () => true, prepare)
  const target = mountTarget()
  await vi.advanceTimersByTimeAsync(40)
  expect(prepare).not.toHaveBeenCalled()
  target.dataset.scrollReady = 'true'
  await vi.advanceTimersByTimeAsync(40)
  await expect(pending.position).resolves.toEqual({ el: target, top: 44, behavior: 'instant' })
  target.dataset.scrollReady = 'false'
  target.dataset.scrollReady = 'true'
  await vi.advanceTimersByTimeAsync(40)
  expect(prepare).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['touchstart', 'wheel'])('cancels delayed positioning after the user starts %s', async event => {
  const prepare = vi.fn()
  const pending = waitForRouteAnchor(selector, () => true, prepare)
  window.dispatchEvent(new Event(event))
  mountTarget(true)
  await vi.advanceTimersByTimeAsync(40)
  await expect(pending.position).resolves.toBe(false)
  expect(prepare).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('cancels a queued frame when navigating away or using the scroll keys', async () => {
  mountTarget(true)
  const first = waitForRouteAnchor(selector, () => true)
  first.cancel()
  await expect(first.position).resolves.toBe(false)
  const second = waitForRouteAnchor(selector, () => true)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown' }))
  await expect(second.position).resolves.toBe(false)
  expect(vi.getTimerCount()).toBe(0)
})

it('does not position a route that is no longer current', async () => {
  let current = true
  const prepare = vi.fn()
  const pending = waitForRouteAnchor(selector, () => current, prepare)
  current = false
  mountTarget(true)
  await vi.advanceTimersByTimeAsync(40)
  await expect(pending.position).resolves.toBe(false)
  expect(prepare).not.toHaveBeenCalled()
})

it('stops waiting when content cannot be loaded', async () => {
  const pending = waitForRouteAnchor(selector, () => true)
  await vi.advanceTimersByTimeAsync(15_000)
  await expect(pending.position).resolves.toBe(false)
  expect(vi.getTimerCount()).toBe(0)
})

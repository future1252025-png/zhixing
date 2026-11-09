import { describe, expect, it, vi } from 'vitest'

import { createScrollPositionGuard, type ScrollPositionViewport } from './scrollPositionGuard'

function createViewport() {
  let nextFrame = 1
  const frames = new Map<number, FrameRequestCallback>()
  const viewport = {
    scrollX: 0,
    scrollY: 420,
    scrollTo: vi.fn(),
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      const id = nextFrame++
      frames.set(id, callback)
      return id
    }),
    cancelAnimationFrame: vi.fn((id: number) => {
      frames.delete(id)
    })
  } satisfies ScrollPositionViewport

  return {
    viewport,
    flushFrames() {
      const pending = [...frames.entries()]
      frames.clear()
      for (const [, callback] of pending) callback(0)
    }
  }
}

describe('scroll position guard', () => {
  it('restores the captured position while a keyed view changes layout', () => {
    const { viewport, flushFrames } = createViewport()
    const guard = createScrollPositionGuard(viewport)

    guard.begin()
    guard.scheduleRestore()
    flushFrames()

    expect(viewport.scrollTo).toHaveBeenCalledWith({
      left: 0,
      top: 420,
      behavior: 'auto'
    })
    expect(guard.active).toBe(true)
  })

  it('never pulls the page back after the user starts scrolling', () => {
    const { viewport, flushFrames } = createViewport()
    const guard = createScrollPositionGuard(viewport)

    guard.begin()
    guard.scheduleRestore(true)
    guard.release()
    flushFrames()

    expect(viewport.cancelAnimationFrame).toHaveBeenCalledOnce()
    expect(viewport.scrollTo).not.toHaveBeenCalled()
    expect(guard.restore()).toBe(false)
    expect(guard.active).toBe(false)
  })

  it('can release itself after the final layout stabilization frame', () => {
    const { viewport, flushFrames } = createViewport()
    const guard = createScrollPositionGuard(viewport)

    guard.begin()
    guard.scheduleRestore(true)
    flushFrames()

    expect(viewport.scrollTo).toHaveBeenCalledOnce()
    expect(guard.active).toBe(false)
  })
})

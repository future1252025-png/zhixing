export type ScrollPositionViewport = {
  readonly scrollX: number
  readonly scrollY: number
  scrollTo(options: ScrollToOptions): void
  requestAnimationFrame(callback: FrameRequestCallback): number
  cancelAnimationFrame(handle: number): void
}

export type ScrollPositionGuard = {
  readonly active: boolean
  begin(): void
  restore(): boolean
  scheduleRestore(releaseAfterRestore?: boolean): void
  release(): void
}

/**
 * Keeps the document at its current position while a keyed view swaps DOM.
 * Calling release (for example on touchstart/wheel) guarantees that a delayed
 * animation callback can no longer pull the user back to the captured offset.
 */
export function createScrollPositionGuard(
  viewport: ScrollPositionViewport = window
): ScrollPositionGuard {
  let capturedTop: number | null = null
  let restoreFrame: number | undefined
  let releaseAfterFrame = false

  function cancelRestoreFrame() {
    if (restoreFrame === undefined) return
    viewport.cancelAnimationFrame(restoreFrame)
    restoreFrame = undefined
  }

  function release() {
    capturedTop = null
    releaseAfterFrame = false
    cancelRestoreFrame()
  }

  const guard: ScrollPositionGuard = {
    get active() {
      return capturedTop !== null
    },
    begin() {
      cancelRestoreFrame()
      releaseAfterFrame = false
      capturedTop = viewport.scrollY
    },
    restore() {
      if (capturedTop === null) return false
      viewport.scrollTo({
        left: viewport.scrollX,
        top: capturedTop,
        behavior: 'auto'
      })
      return true
    },
    scheduleRestore(shouldRelease = false) {
      if (capturedTop === null) return
      releaseAfterFrame ||= shouldRelease
      if (restoreFrame !== undefined) return
      restoreFrame = viewport.requestAnimationFrame(() => {
        restoreFrame = undefined
        const releaseWhenDone = releaseAfterFrame
        releaseAfterFrame = false
        guard.restore()
        if (releaseWhenDone) release()
      })
    },
    release
  }

  return guard
}

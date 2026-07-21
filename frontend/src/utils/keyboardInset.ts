import { computed, onMounted, onUnmounted, ref, type CSSProperties, type Ref } from 'vue'

type KeyboardVisualViewport = Pick<VisualViewport, 'height' | 'offsetTop'> & { scale?: number }

export type KeyboardViewportBaseline = {
  layoutHeight: number
  scale: number
  height: number
  offsetTop: number
  bottom: number
}

export type KeyboardMeasurementContext = {
  nowMs?: number
  keyboardExpected?: boolean
}

export type KeyboardInsetTracker = {
  measure: (
    layoutHeight: number,
    visualViewport: KeyboardVisualViewport | null,
    context?: KeyboardMeasurementContext
  ) => number
  getBaseline: () => KeyboardViewportBaseline | null
  hasPendingBaseline: () => boolean
  reset: () => void
}

const MIN_KEYBOARD_INSET_PX = 80
const BASELINE_STABILITY_MS = 160

function viewportScale(visualViewport: KeyboardVisualViewport): number {
  return visualViewport.scale && visualViewport.scale > 0
    ? visualViewport.scale
    : 1
}

/**
 * Track how much of the layout viewport is covered by the on-screen keyboard
 * (or other visualViewport shrink). Useful for fixed bottom composers.
 */
export function measureKeyboardInset(
  layoutHeight = typeof window !== 'undefined' ? window.innerHeight : 0,
  visualViewport: KeyboardVisualViewport | null = null,
  baselineHeight?: number
): number {
  if (!visualViewport || layoutHeight <= 0) {
    return 0
  }
  const effectiveLayoutHeight = layoutHeight / viewportScale(visualViewport)
  // offsetTop is the visual viewport's position inside the layout viewport;
  // panning a zoomed page does not change how much height the keyboard covers.
  const covered = (baselineHeight ?? effectiveLayoutHeight) - visualViewport.height
  return Math.max(0, Math.round(covered))
}

export function createKeyboardInsetTracker(): KeyboardInsetTracker {
  let baseline: KeyboardViewportBaseline | null = null
  let pendingBaseline: (KeyboardViewportBaseline & {
    startedAt: number
    acceptWhileFocused: boolean
  }) | null = null
  let lastHeight: number | null = null

  function reset() {
    baseline = null
    pendingBaseline = null
    lastHeight = null
  }

  function getBaseline(): KeyboardViewportBaseline | null {
    return baseline ? { ...baseline } : null
  }

  function setObservedBaseline(
    layoutHeight: number,
    visualViewport: KeyboardVisualViewport,
    scale: number
  ) {
    pendingBaseline = null
    baseline = {
      layoutHeight,
      scale,
      height: visualViewport.height,
      offsetTop: visualViewport.offsetTop,
      bottom: visualViewport.offsetTop + visualViewport.height
    }
  }

  function rebuildBaseline(
    layoutHeight: number,
    visualViewport: KeyboardVisualViewport,
    scale: number
  ) {
    pendingBaseline = null
    const effectiveLayoutHeight = layoutHeight / scale
    const inferredInset = effectiveLayoutHeight - visualViewport.height
    if (inferredInset < MIN_KEYBOARD_INSET_PX) {
      setObservedBaseline(layoutHeight, visualViewport, scale)
      return
    }

    // The first sample may already include an open keyboard. Seed its height
    // from the same-scale layout viewport instead of recording the shrunken
    // visual viewport as the no-keyboard baseline.
    baseline = {
      layoutHeight,
      scale,
      height: effectiveLayoutHeight,
      offsetTop: visualViewport.offsetTop,
      bottom: visualViewport.offsetTop + effectiveLayoutHeight
    }
  }

  function measure(
    layoutHeight: number,
    visualViewport: KeyboardVisualViewport | null,
    context: KeyboardMeasurementContext = {}
  ): number {
    if (!visualViewport || layoutHeight <= 0) {
      reset()
      return 0
    }

    const scale = viewportScale(visualViewport)
    const viewportStructureChanged = !baseline ||
      Math.abs(baseline.layoutHeight - layoutHeight) > 1 ||
      Math.abs(baseline.scale - scale) > 0.01
    const heightIncreased = !viewportStructureChanged &&
      lastHeight !== null &&
      visualViewport.height > lastHeight + 1
    lastHeight = visualViewport.height
    if (viewportStructureChanged) {
      rebuildBaseline(layoutHeight, visualViewport, scale)
    }

    if (!baseline) return 0
    if (visualViewport.height > baseline.height) {
      setObservedBaseline(layoutHeight, visualViewport, scale)
      return 0
    }

    const inset = measureKeyboardInset(layoutHeight, visualViewport, baseline.height)
    if (inset <= 1) {
      setObservedBaseline(layoutHeight, visualViewport, scale)
      return 0
    }
    if (inset < MIN_KEYBOARD_INSET_PX) {
      // A keyboard often starts with several small animation frames. Never
      // lower the baseline while a text control is focused; without a focus,
      // accept a browser-bar change only after the same geometry is stable.
      const canStabilizeWhileFocused = heightIncreased ||
        pendingBaseline?.acceptWhileFocused === true
      if (context.keyboardExpected && !canStabilizeWhileFocused) {
        pendingBaseline = null
        return 0
      }
      const nowMs = context.nowMs ?? Date.now()
      const bottom = visualViewport.offsetTop + visualViewport.height
      const candidate = pendingBaseline
      const sameCandidate = candidate !== null &&
        Math.abs(candidate.height - visualViewport.height) <= 1 &&
        Math.abs(candidate.offsetTop - visualViewport.offsetTop) <= 1 &&
        Math.abs(candidate.bottom - bottom) <= 1
      if (sameCandidate && nowMs - candidate.startedAt >= BASELINE_STABILITY_MS) {
        setObservedBaseline(layoutHeight, visualViewport, scale)
      } else if (!sameCandidate) {
        pendingBaseline = {
          layoutHeight,
          scale,
          height: visualViewport.height,
          offsetTop: visualViewport.offsetTop,
          bottom,
          startedAt: nowMs,
          acceptWhileFocused: heightIncreased
        }
      }
      return 0
    }
    pendingBaseline = null
    return inset
  }

  return {
    measure,
    getBaseline,
    hasPendingBaseline: () => pendingBaseline !== null,
    reset
  }
}

export function useKeyboardInset(
  tracker: KeyboardInsetTracker = createKeyboardInsetTracker()
): { keyboardInset: Ref<number> } {
  const keyboardInset = ref(0)
  let stabilityTimer: number | null = null

  function clearStabilityTimer() {
    if (typeof window !== 'undefined' && stabilityTimer !== null) {
      window.clearTimeout(stabilityTimer)
    }
    stabilityTimer = null
  }

  function updateInset() {
    clearStabilityTimer()
    if (typeof window === 'undefined') {
      keyboardInset.value = 0
      return
    }
    keyboardInset.value = tracker.measure(
      window.innerHeight,
      window.visualViewport,
      {
        keyboardExpected: typeof document !== 'undefined' &&
          isSoftwareKeyboardField(document.activeElement)
      }
    )
    if (tracker.hasPendingBaseline()) {
      stabilityTimer = window.setTimeout(updateInset, BASELINE_STABILITY_MS)
    }
  }

  onMounted(() => {
    if (typeof window === 'undefined') return
    updateInset()
    window.visualViewport?.addEventListener('resize', updateInset)
    window.visualViewport?.addEventListener('scroll', updateInset)
    window.addEventListener('resize', updateInset)
  })

  onUnmounted(() => {
    clearStabilityTimer()
    if (typeof window !== 'undefined') {
      window.visualViewport?.removeEventListener('resize', updateInset)
      window.visualViewport?.removeEventListener('scroll', updateInset)
      window.removeEventListener('resize', updateInset)
    }
    tracker.reset()
  })

  return { keyboardInset }
}

function canScrollIntoView(
  target: EventTarget | null
): target is HTMLElement {
  return Boolean(
    target &&
      typeof (target as HTMLElement).scrollIntoView === 'function'
  )
}

const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'password',
  'tel',
  'url',
  'number'
])

/** Return true only for editable controls that can invoke a software keyboard. */
export function isSoftwareKeyboardField(target: EventTarget | null): target is HTMLElement {
  if (typeof HTMLElement === 'undefined') return false
  if (!(target instanceof HTMLElement)) return false

  if (target instanceof HTMLInputElement) {
    return !target.disabled && !target.readOnly && TEXT_INPUT_TYPES.has(target.type.toLowerCase())
  }
  if (target instanceof HTMLTextAreaElement) {
    return !target.disabled && !target.readOnly
  }
  if (target instanceof HTMLSelectElement) {
    return !target.disabled
  }

  for (let current: HTMLElement | null = target; current; current = current.parentElement) {
    const attribute = current.getAttribute('contenteditable')
    if (attribute === null) continue
    const value = attribute.trim().toLowerCase()
    if (value === 'false') return false
    if (value === '' || value === 'true' || value === 'plaintext-only') return true
  }

  return target.isContentEditable === true
}

function isFieldObscuredByKeyboard(target: HTMLElement, tracker: KeyboardInsetTracker): boolean {
  if (typeof window === 'undefined') return false
  const viewport = window.visualViewport
  if (!viewport || tracker.measure(window.innerHeight, viewport, { keyboardExpected: true }) <= 0) {
    return false
  }
  if (typeof target.getBoundingClientRect !== 'function') return false

  const rectangle = target.getBoundingClientRect()
  const visibleBottom = viewport.offsetTop + viewport.height
  return rectangle.bottom > visibleBottom
}

export function scrollFocusedFieldIntoView(
  target: EventTarget | null,
  options?: {
    delayMs?: number
    block?: ScrollLogicalPosition
    tracker?: KeyboardInsetTracker
  }
): () => void {
  if (!canScrollIntoView(target)) {
    return () => undefined
  }
  const delayMs = options?.delayMs ?? 280
  const block = options?.block ?? 'nearest'
  const tracker = options?.tracker ?? createKeyboardInsetTracker()
  let hasScrolled = false
  const run = () => {
    if (hasScrolled || !isFieldObscuredByKeyboard(target, tracker)) return
    target.scrollIntoView({
      behavior: 'smooth',
      block,
      inline: 'nearest'
    })
    hasScrolled = true
  }
  // Check now if the keyboard is already open, and once after its animation.
  // Never move an already visible control or scroll the same focus twice.
  run()
  if (typeof window === 'undefined') return () => undefined
  const timer = window.setTimeout(run, delayMs)
  return () => window.clearTimeout(timer)
}

type KeyboardAwarePageOptions = {
  /** Extra bottom padding when keyboard is closed (matches page-content spacing). */
  basePaddingPx?: number
}

/**
 * Page-level keyboard avoidance for scrollable forms.
 * Apply `pageStyle` on the scrolling page root and `onFieldFocus` on inputs.
 */
export function useKeyboardAwarePage(options: KeyboardAwarePageOptions = {}): {
  keyboardInset: Ref<number>
  pageStyle: Ref<CSSProperties>
  onFieldFocus: (event: FocusEvent) => void
} {
  const basePaddingPx = options.basePaddingPx ?? 34
  const keyboardTracker = createKeyboardInsetTracker()
  const { keyboardInset } = useKeyboardInset(keyboardTracker)
  let cancelPendingScroll: (() => void) | null = null

  const pageStyle = computed<CSSProperties>(() => {
    const bottom = `calc(${basePaddingPx}px + env(safe-area-inset-bottom, 0px) + ${keyboardInset.value}px)`
    return {
      paddingBottom: bottom,
      scrollPaddingBottom: bottom
    }
  })

  function onFieldFocus(event: FocusEvent) {
    cancelPendingScroll?.()
    cancelPendingScroll = null
    if (!isSoftwareKeyboardField(event.target)) return
    cancelPendingScroll = scrollFocusedFieldIntoView(event.target, { tracker: keyboardTracker })
  }

  onUnmounted(() => {
    cancelPendingScroll?.()
    cancelPendingScroll = null
  })

  return {
    keyboardInset,
    pageStyle,
    onFieldFocus
  }
}

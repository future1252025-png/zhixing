import { computed, onMounted, onUnmounted, ref, type CSSProperties, type Ref } from 'vue'

/**
 * Track how much of the layout viewport is covered by the on-screen keyboard
 * (or other visualViewport shrink). Useful for fixed bottom composers.
 */
export function measureKeyboardInset(
  layoutHeight = typeof window !== 'undefined' ? window.innerHeight : 0,
  visualViewport: (Pick<VisualViewport, 'height' | 'offsetTop'> & { scale?: number }) | null = null
): number {
  if (!visualViewport || layoutHeight <= 0) {
    return 0
  }
  // On iOS, focusing a small input can zoom the page before the keyboard
  // animation settles. That viewport shrink is page zoom, not covered space;
  // treating it as both creates a second, exaggerated lift.
  if ((visualViewport.scale ?? 1) > 1.01) {
    return 0
  }
  const covered = layoutHeight - visualViewport.height - visualViewport.offsetTop
  return Math.max(0, Math.round(covered))
}

export function useKeyboardInset(): { keyboardInset: Ref<number> } {
  const keyboardInset = ref(0)

  function updateInset() {
    if (typeof window === 'undefined') {
      keyboardInset.value = 0
      return
    }
    keyboardInset.value = measureKeyboardInset(
      window.innerHeight,
      window.visualViewport
    )
  }

  onMounted(() => {
    if (typeof window === 'undefined') return
    updateInset()
    window.visualViewport?.addEventListener('resize', updateInset)
    window.visualViewport?.addEventListener('scroll', updateInset)
    window.addEventListener('resize', updateInset)
  })

  onUnmounted(() => {
    if (typeof window === 'undefined') return
    window.visualViewport?.removeEventListener('resize', updateInset)
    window.visualViewport?.removeEventListener('scroll', updateInset)
    window.removeEventListener('resize', updateInset)
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

  return Boolean(target.closest('[contenteditable="true"], [contenteditable=""]'))
}

export function scrollFocusedFieldIntoView(
  target: EventTarget | null,
  options?: { delayMs?: number; block?: ScrollLogicalPosition }
): () => void {
  if (!canScrollIntoView(target)) {
    return () => undefined
  }
  const delayMs = options?.delayMs ?? 280
  const block = options?.block ?? 'center'
  const run = () => {
    target.scrollIntoView({
      behavior: 'smooth',
      block,
      inline: 'nearest'
    })
  }
  // Immediate pass for already-visible fields; delayed pass after keyboard animation.
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
  const { keyboardInset } = useKeyboardInset()
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
    cancelPendingScroll = scrollFocusedFieldIntoView(event.target)
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

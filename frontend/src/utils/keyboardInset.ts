import { computed, onMounted, onUnmounted, ref, type CSSProperties, type Ref } from 'vue'

/**
 * Track how much of the layout viewport is covered by the on-screen keyboard
 * (or other visualViewport shrink). Useful for fixed bottom composers.
 */
export function measureKeyboardInset(
  layoutHeight = typeof window !== 'undefined' ? window.innerHeight : 0,
  visualViewport: Pick<VisualViewport, 'height' | 'offsetTop'> | null = null
): number {
  if (!visualViewport || layoutHeight <= 0) {
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
    updateInset()
    window.visualViewport?.addEventListener('resize', updateInset)
    window.visualViewport?.addEventListener('scroll', updateInset)
    window.addEventListener('resize', updateInset)
  })

  onUnmounted(() => {
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

export function scrollFocusedFieldIntoView(
  target: EventTarget | null,
  options?: { delayMs?: number; block?: ScrollLogicalPosition }
): void {
  if (!canScrollIntoView(target)) {
    return
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
  window.setTimeout(run, delayMs)
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

  const pageStyle = computed<CSSProperties>(() => {
    const bottom = `calc(${basePaddingPx}px + env(safe-area-inset-bottom, 0px) + ${keyboardInset.value}px)`
    return {
      paddingBottom: bottom,
      scrollPaddingBottom: bottom
    }
  })

  function onFieldFocus(event: FocusEvent) {
    scrollFocusedFieldIntoView(event.target)
  }

  return {
    keyboardInset,
    pageStyle,
    onFieldFocus
  }
}

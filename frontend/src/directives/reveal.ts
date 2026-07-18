import type { ObjectDirective } from 'vue'

type RevealOrigin = 'up' | 'down' | 'left' | 'right' | 'scale'

interface RevealOptions {
  delay?: number
  from?: RevealOrigin
  distance?: number
  stagger?: number
}

const observers = new WeakMap<HTMLElement, IntersectionObserver>()

function revealImmediately(element: HTMLElement) {
  element.classList.add('is-revealed')
}

const revealDirective: ObjectDirective<HTMLElement, RevealOptions | undefined> = {
  mounted(element, binding) {
    element.classList.add('cm-reveal')

    const delay = Math.max(0, binding.value?.delay ?? 0)
    const distance = Math.min(72, Math.max(12, binding.value?.distance ?? 32))
    const origin = binding.value?.from ?? 'up'
    const stagger = Math.min(120, Math.max(0, binding.value?.stagger ?? 0))
    const offsets: Record<RevealOrigin, { x: number; y: number; scale: number; rotate: number }> = {
      up: { x: 0, y: distance, scale: 0.985, rotate: 0.45 },
      down: { x: 0, y: -distance, scale: 0.985, rotate: -0.35 },
      left: { x: -distance, y: 7, scale: 0.99, rotate: -0.65 },
      right: { x: distance, y: 7, scale: 0.99, rotate: 0.65 },
      scale: { x: 0, y: 12, scale: 0.95, rotate: 0 }
    }
    const offset = offsets[origin]

    element.style.setProperty('--cm-reveal-delay', `${delay}ms`)
    element.style.setProperty('--cm-reveal-x', `${offset.x}px`)
    element.style.setProperty('--cm-reveal-y', `${offset.y}px`)
    element.style.setProperty('--cm-reveal-scale', String(offset.scale))
    element.style.setProperty('--cm-reveal-rotate', `${offset.rotate}deg`)

    if (stagger > 0) {
      const children = Array.from(element.children)
      children.forEach((child, index) => {
        if (!(child instanceof HTMLElement)) return
        child.style.setProperty('--cm-stagger-opacity', getComputedStyle(child).opacity)
        child.style.setProperty('--cm-stagger-delay', `${Math.min(index, 7) * stagger}ms`)
        child.style.setProperty(
          '--cm-stagger-x',
          `${origin === 'right' ? 18 : origin === 'left' ? -18 : 0}px`
        )
        child.style.setProperty(
          '--cm-stagger-rotate',
          `${origin === 'right' ? 0.45 : origin === 'left' ? -0.45 : 0}deg`
        )
      })
      element.classList.add('cm-reveal-stagger')
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion || typeof IntersectionObserver === 'undefined') {
      revealImmediately(element)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting) {
          return
        }

        revealImmediately(element)
        observer.disconnect()
        observers.delete(element)
      },
      {
        threshold: 0.01,
        rootMargin: '0px 0px -7% 0px'
      }
    )

    observers.set(element, observer)
    observer.observe(element)
  },
  unmounted(element) {
    observers.get(element)?.disconnect()
    observers.delete(element)
  }
}

export default revealDirective

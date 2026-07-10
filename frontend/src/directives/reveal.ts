import type { ObjectDirective } from 'vue'

interface RevealOptions {
  delay?: number
}

const observers = new WeakMap<HTMLElement, IntersectionObserver>()

function revealImmediately(element: HTMLElement) {
  element.classList.add('is-revealed')
}

const revealDirective: ObjectDirective<HTMLElement, RevealOptions | undefined> = {
  mounted(element, binding) {
    element.classList.add('cm-reveal')

    const delay = Math.max(0, binding.value?.delay ?? 0)
    element.style.setProperty('--cm-reveal-delay', `${delay}ms`)

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
        threshold: 0.12,
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

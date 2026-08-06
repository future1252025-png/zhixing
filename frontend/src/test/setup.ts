import { vi } from 'vitest'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, 'ResizeObserver', {
  value: ResizeObserverMock,
  configurable: true
})
Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  })),
  configurable: true
})
Object.defineProperty(window, 'scrollTo', {
  value: vi.fn(),
  configurable: true
})
Object.defineProperty(window, 'scrollBy', {
  value: vi.fn(),
  configurable: true
})

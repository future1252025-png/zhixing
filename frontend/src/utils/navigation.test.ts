import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Router } from 'vue-router'

import { goBack } from './navigation'

function createRouterMock(): Router {
  return { back: vi.fn(), replace: vi.fn() } as unknown as Router
}

describe('goBack', () => {
  afterEach(() => {
    // jsdom 的 history.state 跨用例共享，用 null 复位避免相互污染
    window.history.replaceState(null, '')
  })

  it('pops the stack via router.back when vue-router recorded an in-app origin', () => {
    window.history.replaceState({ back: '/home' }, '')
    const router = createRouterMock()

    goBack(router, '/home')

    expect(router.back).toHaveBeenCalledTimes(1)
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('replaces to the fallback path when there is no history state at all', () => {
    const router = createRouterMock()

    goBack(router, '/courses')

    expect(router.replace).toHaveBeenCalledWith('/courses')
    expect(router.back).not.toHaveBeenCalled()
  })

  it('replaces to the fallback location when back is null on the first in-app entry', () => {
    window.history.replaceState({ back: null }, '')
    const router = createRouterMock()

    goBack(router, { path: '/login', query: { redirect: '/home' } })

    expect(router.replace).toHaveBeenCalledWith({ path: '/login', query: { redirect: '/home' } })
    expect(router.back).not.toHaveBeenCalled()
  })
})

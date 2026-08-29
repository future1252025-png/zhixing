import { describe, expect, it, vi } from 'vitest'
import type { Router } from 'vue-router'

import {
  installAndroidBackButton,
  nativeBackFallback,
  resolveNativeBackAction
} from './nativeBackButton'

describe('native Android back navigation', () => {
  it('keeps tab and login pages as app roots', () => {
    expect(resolveNativeBackAction('/home', true, false)).toEqual({ kind: 'confirm-exit' })
    expect(resolveNativeBackAction('/courses', true, true)).toEqual({ kind: 'exit' })
    expect(resolveNativeBackAction('/login', false, false)).toEqual({ kind: 'confirm-exit' })
  })

  it('returns through browser history before using a hierarchy fallback', () => {
    expect(resolveNativeBackAction('/courses/import', true, false)).toEqual({ kind: 'back' })
    expect(resolveNativeBackAction('/courses/import', false, false)).toEqual({
      kind: 'fallback',
      target: '/courses'
    })
  })

  it('defines direct-entry fallbacks for nested course and building pages', () => {
    expect(nativeBackFallback('/courses/42/edit')).toBe('/courses')
    expect(nativeBackFallback('/buildings/7/messages')).toBe('/buildings/7/chats')
    expect(nativeBackFallback('/buildings/7/chats')).toBe('/buildings/7')
    expect(nativeBackFallback('/buildings/7')).toBe('/home')
  })

  it('requires a second root-page press within the confirmation window to exit', async () => {
    let listener: ((event: { canGoBack: boolean }) => void | Promise<void>) | undefined
    let currentTime = 10_000
    const notify = vi.fn()
    const exitApp = vi.fn().mockResolvedValue(undefined)
    const remove = vi.fn().mockResolvedValue(undefined)
    const removeAfterEach = vi.fn()
    const router = {
      currentRoute: { value: { path: '/home' } },
      back: vi.fn(),
      replace: vi.fn(),
      afterEach: vi.fn(() => removeAfterEach)
    } as unknown as Router

    const handle = await installAndroidBackButton(router, {
      isAndroid: true,
      now: () => currentTime,
      notify,
      app: {
        addListener: vi.fn(async (_eventName, callback) => {
          listener = callback
          return { remove }
        }),
        exitApp
      }
    })

    await listener?.({ canGoBack: false })
    expect(notify).toHaveBeenCalledWith('再次点击返回键回到桌面')
    expect(exitApp).not.toHaveBeenCalled()

    currentTime += 1_000
    await listener?.({ canGoBack: false })
    expect(exitApp).toHaveBeenCalledTimes(1)

    await handle?.remove()
    expect(removeAfterEach).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('navigates to the route fallback when a nested page has no history', async () => {
    let listener: ((event: { canGoBack: boolean }) => void | Promise<void>) | undefined
    const router = {
      currentRoute: { value: { path: '/courses/import' } },
      back: vi.fn(),
      replace: vi.fn().mockResolvedValue(undefined),
      afterEach: vi.fn(() => vi.fn())
    } as unknown as Router

    await installAndroidBackButton(router, {
      isAndroid: true,
      app: {
        addListener: vi.fn(async (_eventName, callback) => {
          listener = callback
          return { remove: vi.fn().mockResolvedValue(undefined) }
        }),
        exitApp: vi.fn().mockResolvedValue(undefined)
      }
    })

    await listener?.({ canGoBack: false })
    expect(router.replace).toHaveBeenCalledWith('/courses')
    expect(router.back).not.toHaveBeenCalled()
  })
})

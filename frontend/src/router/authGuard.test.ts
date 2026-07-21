import { describe, expect, it } from 'vitest'

import router, {
  resolveAuthRedirect,
  resolveRouteScrollPosition,
  sanitizeInternalRedirect,
  shouldLoadCurrentUser
} from './index'

describe('auth route guard decisions', () => {
  it('redirects anonymous users away from protected pages', () => {
    const redirect = resolveAuthRedirect(
      {
        path: '/profile',
        fullPath: '/profile',
        meta: { requiresAuth: true }
      },
      false
    )

    expect(redirect).toEqual({
      path: '/login',
      query: { redirect: '/profile' }
    })
  })

  it('redirects logged-in users away from auth pages', () => {
    const redirect = resolveAuthRedirect(
      {
        path: '/login',
        fullPath: '/login',
        meta: { publicOnly: true }
      },
      true
    )

    expect(redirect).toEqual({ path: '/home' })
  })

  it('allows logged-in users to open protected pages', () => {
    const redirect = resolveAuthRedirect(
      {
        path: '/home',
        fullPath: '/home',
        meta: { requiresAuth: true }
      },
      true
    )

    expect(redirect).toBeNull()
  })

  it('loads current user before opening protected pages with a saved token', () => {
    const shouldLoad = shouldLoadCurrentUser(
      {
        path: '/home',
        fullPath: '/home',
        meta: { requiresAuth: true }
      },
      true,
      false
    )

    expect(shouldLoad).toBe(true)
  })

  it('does not load current user for public pages', () => {
    const shouldLoad = shouldLoadCurrentUser(
      {
        path: '/login',
        fullPath: '/login',
        meta: { publicOnly: true }
      },
      true,
      false
    )

    expect(shouldLoad).toBe(false)
  })

  it('starts a newly opened route from the top', () => {
    expect(resolveRouteScrollPosition(null)).toEqual({ left: 0, top: 0 })
  })

  it('restores saved scroll position for browser history navigation', () => {
    expect(resolveRouteScrollPosition({ left: 0, top: 320 })).toEqual({
      left: 0,
      top: 320
    })
  })

  it('registers building detail as a protected route', () => {
    const match = router.resolve('/buildings/1')

    expect(match.name).toBe('building-detail')
    expect(match.meta.requiresAuth).toBe(true)
  })

  it('registers building messages as a protected route', () => {
    const match = router.resolve('/buildings/1/messages')

    expect(match.name).toBe('building-messages')
    expect(match.meta.requiresAuth).toBe(true)
  })

  it('registers building chatrooms as a protected route', () => {
    const match = router.resolve('/buildings/1/chats')

    expect(match.name).toBe('building-chatrooms')
    expect(match.meta.requiresAuth).toBe(true)
  })

  it('registers course form routes as protected routes', () => {
    const newMatch = router.resolve('/courses/new')
    const editMatch = router.resolve('/courses/1/edit')
    const importMatch = router.resolve('/courses/import')

    expect(newMatch.name).toBe('course-new')
    expect(newMatch.meta.requiresAuth).toBe(true)
    expect(importMatch.name).toBe('course-import')
    expect(importMatch.meta.requiresAuth).toBe(true)
    expect(editMatch.name).toBe('course-edit')
    expect(editMatch.meta.requiresAuth).toBe(true)
  })

  it('registers map collector as a public utility route', () => {
    const match = router.resolve('/map-collector')

    expect(match.name).toBe('map-collector')
    expect(match.meta.requiresAuth).toBeUndefined()
  })

  it.each([
    ['/courses?week=3', '/courses?week=3'],
    ['/home#today', '/home#today'],
    ['//evil.example/login', '/home'],
    ['https://evil.example/login', '/home'],
    ['/\\evil.example/login', '/home'],
    ['', '/home']
  ])('sanitizes login redirect %s', (input, expected) => {
    expect(sanitizeInternalRedirect(input)).toBe(expected)
  })
})

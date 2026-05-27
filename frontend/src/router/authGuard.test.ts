import { describe, expect, it } from 'vitest'

import { resolveAuthRedirect } from './index'

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
})

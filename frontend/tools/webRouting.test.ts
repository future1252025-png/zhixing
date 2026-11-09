import { expect, it, vi } from 'vitest'
import { onRequest } from '../functions/_middleware'

it.each(['www.campusmindapp.com','campusmind-web.pages.dev','abc.campusmind-web.pages.dev'])('canonicalizes %s and keeps the requested page and query', async host => {
  const next = vi.fn()
  const response = await onRequest({ request: new Request(`https://${host}/courses?week=3&from=home`), next })
  expect(response.status).toBe(308)
  expect(response.headers.get('location')).toBe('https://campusmindapp.com/courses?week=3&from=home')
  expect(next).not.toHaveBeenCalled()
})
it.each(['/api','/api/auth/refresh','/_AMapService'])('returns API 404 instead of a misleading SPA response: %s', async path => {
  const next = vi.fn()
  expect((await onRequest({ request: new Request('https://campusmindapp.com'+path), next })).status).toBe(404)
  expect(next).not.toHaveBeenCalled()
})
it('serves the canonical page with revalidation and preserves function response types', async () => {
  const page = await onRequest({ request: new Request('https://campusmindapp.com/courses'),
    next: async () => new Response('<html>app</html>', { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'max-age=999999' } }) })
  expect(page.headers.get('cache-control')).toBe('no-cache')
  expect(page.headers.get('x-frame-options')).toBe('DENY')
  const proxy = new Response('callback({})', { headers: { 'Content-Type': 'application/javascript' } })
  expect(await onRequest({ request: new Request('https://campusmindapp.com/_AMapService/v3/place/text'), next: async () => proxy })).toBe(proxy)
})

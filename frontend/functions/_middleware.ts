type Context = { request: Request; next: () => Promise<Response> }

export async function onRequest({ request, next }: Context): Promise<Response> {
  const url = new URL(request.url)
  if (url.hostname === 'www.campusmindapp.com' || url.hostname === 'campusmind-web.pages.dev'
    || url.hostname.endsWith('.campusmind-web.pages.dev')) {
    url.protocol = 'https:'; url.host = 'campusmindapp.com'; url.port = ''
    return new Response(null, { status: 308, headers: { Location: url.href, 'Cache-Control': 'no-store' } })
  }
  // Misconfigured clients must not receive a successful SPA page as API data.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/') || url.pathname === '/_AMapService') {
    return new Response(JSON.stringify({ error: '接口地址不存在' }), { status: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
  }
  const response = await next()
  if (!response.headers.get('content-type')?.includes('text/html')) return response
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'no-cache')
  headers.set('Content-Security-Policy', "frame-ancestors 'none'")
  headers.set('X-Frame-Options', 'DENY')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  return new Response(response.body, { status: response.status, headers })
}

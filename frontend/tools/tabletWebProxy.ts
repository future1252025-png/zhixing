import type { IncomingMessage } from 'node:http'
import type { Plugin, ProxyOptions } from 'vite'

export const TABLET_API_ORIGIN = 'https://api.campusmindapp.com'
export const TABLET_PROXY_PATH = '^/(?:api(?:/|\\?|$)|health(?:\\?|$)|openapi\\.json(?:\\?|$))'

/** Rewriting Origin is safe only after rejecting cross-site and non-loopback callers. */
export function allowTabletProxyRequest(request: Pick<IncomingMessage, 'headers' | 'method'> & {
  socket: { remoteAddress?: string }
}): boolean {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '')) return false
  const host = request.headers.host
  if (!host || !/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(host)) return false
  const origin = request.headers.origin
  if (origin !== undefined && origin !== `http://${host}`) return false
  const site = request.headers['sec-fetch-site']
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return false
  // Browser mutations must carry their real local Origin; never legitimize an
  // arbitrary/no-origin POST by blindly rewriting it to the production origin.
  return ['GET', 'HEAD'].includes(request.method ?? '') || origin === `http://${host}`
}

export function tabletProxyOptions(): ProxyOptions {
  return {
    target: TABLET_API_ORIGIN,
    changeOrigin: true,
    secure: true,
    timeout: 20_000,
    proxyTimeout: 20_000,
    configure(proxy) {
      proxy.on('proxyReq', request => {
        request.setHeader('Origin', TABLET_API_ORIGIN)
        request.removeHeader('Referer')
      })
      // Keep HttpOnly, SameSite=Strict and Secure cookies unchanged. Modern
      // Chromium accepts Secure cookies on loopback; nothing is relaxed upstream.
    }
  }
}

export function tabletProxyGuard(): Plugin {
  return {
    name: 'campusmind-loopback-tablet-proxy',
    apply: 'serve',
    configResolved(config) {
      if (config.server.host !== '127.0.0.1') {
        throw new Error('平板开发转发只能监听 127.0.0.1，不能暴露到局域网或公网')
      }
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!new RegExp(TABLET_PROXY_PATH).test(request.url ?? '')) return next()
        if (!allowTabletProxyRequest(request)) {
          response.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
          response.end(JSON.stringify({ message: '仅允许本机网页的同源请求' }))
          return
        }
        next()
      })
    }
  }
}

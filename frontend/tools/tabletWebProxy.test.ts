import { describe, expect, it, vi } from 'vitest'
import { allowTabletProxyRequest, TABLET_API_ORIGIN, TABLET_PROXY_PATH, tabletProxyOptions } from './tabletWebProxy'

const request = (changes: Record<string, unknown> = {}) => ({
  method: 'POST', socket: { remoteAddress: '127.0.0.1' },
  headers: { host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173', 'sec-fetch-site': 'same-origin' }, ...changes
})

describe('local tablet API proxy', () => {
  it('allows only loopback same-origin browser requests', () => {
    expect(allowTabletProxyRequest(request())).toBe(true)
    expect(allowTabletProxyRequest(request({ headers: { host: 'localhost:5173', origin: 'http://localhost:5173' } }))).toBe(true)
    expect(allowTabletProxyRequest(request({ method: 'GET', headers: { host: '127.0.0.1:5173' } }))).toBe(true)
    expect(allowTabletProxyRequest(request({ socket: { remoteAddress: '192.168.1.20' } }))).toBe(false)
  })
  it.each([
    { host: 'evil.example', origin: 'http://evil.example' },
    { host: 'localhost.evil.example:5173', origin: 'http://localhost.evil.example:5173' },
    { host: '127.0.0.1:5173', origin: 'https://evil.example' },
    { host: '127.0.0.1:5173', origin: 'null' },
    { host: '127.0.0.1:5173', origin: 'http://127.0.0.1:9999' },
    { host: '127.0.0.1:5173' },
    { host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173', 'sec-fetch-site': 'cross-site' }
  ])('rejects forged/rebound/cross-site requests before rewriting Origin: %j', headers => {
    expect(allowTabletProxyRequest(request({ headers }))).toBe(false)
  })
  it('proxies only explicit API and diagnostic paths', () => {
    const pattern = new RegExp(TABLET_PROXY_PATH)
    for (const path of ['/api/courses', '/api/auth/refresh', '/health', '/health?check=1', '/openapi.json']) expect(pattern.test(path)).toBe(true)
    for (const path of ['/apix', '/health-evil', '/openapi.json/x', '//evil.example', '/src/main.ts']) expect(pattern.test(path)).toBe(false)
  })
  it('uses verified HTTPS and leaves cookie security attributes untouched', () => {
    const options = tabletProxyOptions()
    expect(options).toMatchObject({ target: TABLET_API_ORIGIN, secure: true, changeOrigin: true })
    expect(options).not.toHaveProperty('cookieDomainRewrite')
    const on = vi.fn()
    options.configure!({ on } as never, options)
    expect(on).toHaveBeenCalledTimes(1)
    expect(on.mock.calls[0]![0]).toBe('proxyReq')
    const outgoing = { setHeader: vi.fn(), removeHeader: vi.fn() }
    on.mock.calls[0]![1](outgoing)
    expect(outgoing.setHeader).toHaveBeenCalledWith('Origin', TABLET_API_ORIGIN)
  })
})

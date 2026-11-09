import { describe, expect, it, vi } from 'vitest'
import { proxyMap } from '../functions/_AMapService/[[path]]'

const env = { AMAP_KEY: 'test_public_key_123456', AMAP_SECURITY_CODE: 'test_server_secret_12345' }
const request = (path = '/v3/place/detail', query = '', options: RequestInit = {}) =>
  new Request(`https://campusmindapp.com/_AMapService${path}?key=${env.AMAP_KEY}${query}`, options)

describe('Pages AMap proxy', () => {
  it('uses a fixed upstream and replaces jscode without forwarding user credentials', async () => {
    const upstream = vi.fn(async () => new Response('{"status":"1"}', { headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'bad=1' } }))
    const response = await proxyMap(request('/v3/place/detail', '&jscode=attacker&id=poi', {
      headers: { Cookie: 'session=private', Authorization: 'Bearer private', Origin: 'https://campusmindapp.com' }
    }), env, upstream)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: '1' })
    const [target, options] = upstream.mock.calls[0] as unknown as [string, RequestInit]
    const url = new URL(target)
    expect(url.origin).toBe('https://restapi.amap.com')
    expect(url.searchParams.getAll('jscode')).toEqual([env.AMAP_SECURITY_CODE])
    expect(options.redirect).toBe('manual')
    expect(new Headers(options.headers).has('authorization')).toBe(false)
    expect(new Headers(options.headers).has('cookie')).toBe(false)
    expect(response.headers.has('set-cookie')).toBe(false)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it.each([['/v4/map/styles','webapi.amap.com'], ['/v3/vectormap','fmap01.amap.com']])('routes documented SDK path %s', async (path, host) => {
    const upstream = vi.fn(async () => new Response('ok'))
    expect((await proxyMap(request(path), env, upstream)).status).toBe(200)
    expect(new URL((upstream.mock.calls[0] as unknown as [string])[0]).hostname).toBe(host)
  })
  it.each(['/https://evil.invalid/', '/v3/%2e%2e/private', '/v3//place', '/v3/place.js', '/evil'])('rejects unsafe paths %s', async path => {
    const upstream = vi.fn()
    expect((await proxyMap(request(path), env, upstream)).status).toBe(404)
    expect(upstream).not.toHaveBeenCalled()
  })
  it.each([
    { method: 'POST' }, { headers: { Origin: 'https://evil.invalid' } }, { headers: { 'Sec-Fetch-Site': 'cross-site' } }
  ])('blocks invalid methods and cross-site calls', async options => {
    const upstream = vi.fn()
    expect((await proxyMap(request('/v3/place/text', '', options), env, upstream)).status).toBeGreaterThanOrEqual(400)
    expect(upstream).not.toHaveBeenCalled()
  })
  it.each(['&key=other', '&callback=alert(1)', '&callback=a&callback=b', '&callback=a%3Balert(1)'])('rejects duplicate keys and executable JSONP callbacks', async query => {
    const upstream = vi.fn()
    expect((await proxyMap(request('/v3/place/detail', query), env, upstream)).status).toBeGreaterThanOrEqual(400)
    expect(upstream).not.toHaveBeenCalled()
  })
  it('permits SDK JSONP callbacks', async () => {
    const upstream = vi.fn(async () => new Response('_xdc_.callback({"status":"1"})', { headers: { 'Content-Type': 'application/json' } }))
    const response = await proxyMap(request('/v3/place/text', '&callback=_xdc_.callback'), env, upstream)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/javascript')
    expect(await response.text()).toBe('_xdc_.callback({"status":"1"});')
  })
  it.each(['other({})', '_xdc_.callback(alert(1))', '_xdc_.callback({});alert(1)', 'plain data'])('rejects invalid or executable upstream JSONP', async body => {
    expect((await proxyMap(request('/v3/place/text', '&callback=_xdc_.callback'), env, async () => new Response(body))).status).toBe(502)
  })
  it('fails closed when server configuration or credentials are absent', async () => {
    const upstream = vi.fn()
    expect((await proxyMap(request(), {}, upstream)).status).toBe(503)
    expect((await proxyMap(new Request('https://campusmindapp.com/_AMapService/v3/place/text?key=wrong'), env, upstream)).status).toBe(403)
    expect(upstream).not.toHaveBeenCalled()
  })
  it.each([302, 400, 500])('does not relay upstream errors, cookies, or redirects: %s', async status => {
    const response = await proxyMap(request(), env, async () => new Response(env.AMAP_SECURITY_CODE, { status, headers: { Location: 'https://evil.invalid' } }))
    expect(response.status).toBe(502)
    expect(response.headers.has('location')).toBe(false)
    expect(await response.text()).not.toContain(env.AMAP_SECURITY_CODE)
  })
  it('bounds response size and rejects HTML', async () => {
    expect((await proxyMap(request(), env, async () => new Response('x', { headers: { 'Content-Length': '99999999' } }))).status).toBe(502)
    expect((await proxyMap(request(), env, async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } }))).status).toBe(502)
    expect((await proxyMap(request(), env, async () => new Response(new Uint8Array(8 * 1024 * 1024 + 1)))).status).toBe(502)
  })
  it('does not expose upstream exception details or secrets', async () => {
    const response = await proxyMap(request(), env, async () => { throw new Error(env.AMAP_SECURITY_CODE) })
    expect(response.status).toBe(502)
    expect(await response.text()).not.toContain(env.AMAP_SECURITY_CODE)
  })
})

export type MapProxyEnv = { AMAP_KEY?: string; VITE_AMAP_KEY?: string; AMAP_SECURITY_CODE?: string }
type Context = { request: Request; env: MapProxyEnv }
type ProxyFetch = (input: string, init: RequestInit) => Promise<Response>
const PREFIX = '/_AMapService'
const LIMIT = 8 * 1024 * 1024
const HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin' }

function fail(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), { status,
    headers: { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8' } })
}

export async function proxyMap(request: Request, env: MapProxyEnv, upstreamFetch: ProxyFetch = fetch): Promise<Response> {
  if (request.method !== 'GET') return fail(405, '仅支持地图读取请求')
  const url = new URL(request.url)
  if (url.search.length > 8192 || !url.pathname.startsWith(`${PREFIX}/`)) return fail(400, '地图请求无效')
  const path = url.pathname.slice(PREFIX.length)
  // Fixed official upstreams; never accept a user-supplied URL, encoded path,
  // dot segment or automatic upstream redirect.
  if (!/^\/v[345]\/[-a-zA-Z0-9_/]+$/.test(path) || path.includes('//')) return fail(404, '不支持此地图接口')
  const key = env.AMAP_KEY?.trim() || env.VITE_AMAP_KEY?.trim()
  const secret = env.AMAP_SECURITY_CODE?.trim()
  if (!key || !secret) return fail(503, '地图服务暂未配置')
  if (url.searchParams.getAll('key').length !== 1 || url.searchParams.get('key') !== key) return fail(403, '地图凭据不匹配')
  const callbacks = url.searchParams.getAll('callback')
  if (callbacks.length > 1 || (callbacks.length === 1 && (callbacks[0].length > 128
    || !/^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)*$/.test(callbacks[0])))) return fail(400, '地图回调格式不正确')
  const site = request.headers.get('sec-fetch-site')
  if (site === 'cross-site') return fail(403, '不允许跨站地图请求')
  const origin = request.headers.get('origin')
  if (origin && origin !== url.origin) return fail(403, '地图来源不匹配')
  // Default restricted to official web-service versions. SDK-specific map
  // assets use the two documented exceptions below.
  const host = path === '/v4/map/styles' ? 'webapi.amap.com'
    : path === '/v3/vectormap' ? 'fmap01.amap.com' : 'restapi.amap.com'
  const upstream = new URL(path, `https://${host}`)
  upstream.search = url.search
  upstream.searchParams.set('jscode', secret)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const response = await upstreamFetch(upstream.href, { method: 'GET', redirect: 'manual', signal: controller.signal,
      // Do not forward the browser's cookies, bearer token or arbitrary headers.
      headers: { Accept: request.headers.get('accept') || '*/*', Referer: `${url.origin}/` } })
    if (!response.ok) { await response.body?.cancel(); return fail(502, '地图服务暂时不可用，请重试') }
    if (Number(response.headers.get('content-length')) > LIMIT) { await response.body?.cancel(); return fail(502, '地图响应过大') }
    const chunks: Uint8Array[] = []
    let length = 0
    reader = response.body?.getReader()
    if (reader) while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > LIMIT) { await reader.cancel(); return fail(502, '地图响应过大') }
      chunks.push(value)
    }
    const data = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length }
    let contentType = response.headers.get('content-type') || 'application/octet-stream'
    if (/text\/html/i.test(contentType)) return fail(502, '地图响应格式不正确')
    if (callbacks.length) {
      // AMap returns valid JSONP with JSON/octet-stream MIME types on some
      // endpoints. Under nosniff browsers refuse those scripts. Validate the
      // JSON envelope and rebuild only the requested callback as JavaScript.
      const source = new TextDecoder().decode(data).trim()
      const start = `${callbacks[0]}(`
      const end = source.endsWith(');') ? 2 : source.endsWith(')') ? 1 : 0
      if (!source.startsWith(start) || !end) return fail(502, '地图回调响应不正确')
      let payload: unknown
      try { payload = JSON.parse(source.slice(start.length, -end)) }
      catch { return fail(502, '地图回调数据不正确') }
      const javascript = `${callbacks[0]}(${JSON.stringify(payload).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')});`
      return new Response(javascript, { status: 200,
        headers: { ...HEADERS, 'Content-Type': 'application/javascript; charset=utf-8' } })
    }
    return new Response(data, { status: 200, headers: { ...HEADERS, 'Content-Type': contentType } })
  } catch {
    return fail(controller.signal.aborted ? 504 : 502, '地图连接暂时不可用，请重试')
  } finally { clearTimeout(timer); reader?.releaseLock() }
}

export const onRequest = (context: Context) => proxyMap(context.request, context.env)

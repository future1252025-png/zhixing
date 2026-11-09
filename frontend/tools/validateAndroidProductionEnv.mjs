import { existsSync, readFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { basename, resolve } from 'node:path'

const frontendRoot = process.cwd()
const envFiles = ['.env', '.env.local', '.env.android', '.env.android.local']

function parseEnvFile(path) {
  if (!existsSync(path)) return {}
  const values = {}
  for (const sourceLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = sourceLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }
  return values
}

export function loadAndroidEnv() {
  const fromFiles = Object.assign(
    {},
    ...envFiles.map((filename) => parseEnvFile(resolve(frontendRoot, filename)))
  )
  return { ...fromFiles, ...process.env }
}

function normalizedHostname(hostname) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
}

function isNonPublicHostname(hostname) {
  const normalized = normalizedHostname(hostname)
  // A production mobile build should use an owned DNS name. Rejecting every
  // IP literal also covers IPv4 shorthand, loopback ranges, CGNAT, benchmark
  // ranges, IPv6 ULA/link-local and future reserved address classes.
  if (isIP(normalized)) return true
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal') ||
    normalized.endsWith('.home.arpa') ||
    normalized.endsWith('.test')
  )
}

function isReservedExampleHostname(hostname) {
  const normalized = normalizedHostname(hostname)
  return ['example.com', 'example.net', 'example.org'].some(
    (domain) => normalized === domain || normalized.endsWith(`.${domain}`)
  ) || normalized.endsWith('.invalid')
}

function validatePublicHttpsUrl(value, label) {
  if (!value?.trim()) {
    throw new Error(`${label} 未配置；正式 Android 构建必须使用公网 HTTPS 地址。`)
  }
  let url
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error(`${label} 不是有效 URL。`)
  }
  if (url.protocol !== 'https:') {
    throw new Error(`${label} 禁止 HTTP；局域网调试请使用 android:sync:dev。`)
  }
  if (url.username || url.password || url.hash || url.search) {
    throw new Error(`${label} 不得包含账号、密码、查询参数或 URL 片段。`)
  }
  if (isNonPublicHostname(url.hostname)) {
    throw new Error(`${label} 必须使用公网 DNS 域名，不得使用 IP、本机或内部域名。`)
  }
  if (isReservedExampleHostname(url.hostname)) {
    throw new Error(`${label} 不能使用示例占位域名。`)
  }
  return url
}

export function validateProductionApiUrl(value) {
  return validatePublicHttpsUrl(value, 'VITE_API_BASE_URL').toString().replace(/\/$/, '')
}

export function validateProductionAmapKey(value) {
  const normalized = value?.trim() ?? ''
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(normalized)) {
    throw new Error('VITE_AMAP_KEY 必须配置为 16–64 位的有效高德 Web 端 Key。')
  }
  if (/^(.)\1+$/.test(normalized) || /^(changeme|placeholder|your[-_]?key)$/i.test(normalized)) {
    throw new Error('VITE_AMAP_KEY 不能使用示例占位值。')
  }
  return normalized
}

export function validateProductionAmapServiceHost(value) {
  const url = validatePublicHttpsUrl(value, 'VITE_AMAP_SERVICE_HOST')
  const normalizedPath = url.pathname.replace(/\/$/, '')
  if (!normalizedPath.endsWith('/_AMapService')) {
    throw new Error('VITE_AMAP_SERVICE_HOST 必须指向自有域名下的 /_AMapService 代理路径。')
  }
  return url.toString().replace(/\/$/, '')
}

export function validateProductionAndroidEnv(env) {
  if (env.VITE_AMAP_SECURITY_CODE?.trim()) {
    throw new Error(
      '正式 Android 构建禁止内置 VITE_AMAP_SECURITY_CODE；请使用 VITE_AMAP_SERVICE_HOST 代理。'
    )
  }
  return {
    apiUrl: validateProductionApiUrl(env.VITE_API_BASE_URL),
    amapKey: validateProductionAmapKey(env.VITE_AMAP_KEY),
    amapServiceHost: validateProductionAmapServiceHost(env.VITE_AMAP_SERVICE_HOST)
  }
}

if (process.argv[1] && basename(process.argv[1]) === 'validateAndroidProductionEnv.mjs') {
  try {
    const result = validateProductionAndroidEnv(loadAndroidEnv())
    process.stdout.write(
      `Android 正式配置已通过校验：API ${result.apiUrl}，高德代理 ${result.amapServiceHost}\n`
    )
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

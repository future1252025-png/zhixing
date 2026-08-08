import { existsSync, readFileSync } from 'node:fs'
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

function isPrivateHostname(hostname) {
  const normalized = hostname.toLowerCase()
  if (normalized === 'localhost' || normalized.endsWith('.local')) return true
  if (normalized === '127.0.0.1' || normalized === '0.0.0.0' || normalized === '::1') {
    return true
  }
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalized)
  if (!match) return false
  const octets = match.slice(1).map(Number)
  return (
    octets.some((value) => value > 255) ||
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 169 && octets[1] === 254)
  )
}

function isReservedExampleHostname(hostname) {
  const normalized = hostname.toLowerCase()
  return ['example.com', 'example.net', 'example.org'].some(
    (domain) => normalized === domain || normalized.endsWith(`.${domain}`)
  ) || normalized.endsWith('.invalid')
}

export function validateProductionApiUrl(value) {
  if (!value?.trim()) {
    throw new Error('VITE_API_BASE_URL 未配置；正式 Android 构建必须指向公网 HTTPS API。')
  }
  let url
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('VITE_API_BASE_URL 不是有效 URL。')
  }
  if (url.protocol !== 'https:') {
    throw new Error('正式 Android 构建禁止 HTTP API；请配置 HTTPS，局域网调试请使用 android:sync:dev。')
  }
  if (url.username || url.password || url.hash) {
    throw new Error('VITE_API_BASE_URL 不得包含账号、密码或 URL 片段。')
  }
  if (isPrivateHostname(url.hostname)) {
    throw new Error('正式 Android 构建禁止本机或私网 API；请配置公网 HTTPS 域名。')
  }
  if (isReservedExampleHostname(url.hostname)) {
    throw new Error('正式 Android 构建不能使用示例占位域名；请配置真实可访问的公网 API。')
  }
  return url.toString().replace(/\/$/, '')
}

if (process.argv[1] && basename(process.argv[1]) === 'validateAndroidProductionEnv.mjs') {
  try {
    const apiUrl = validateProductionApiUrl(loadAndroidEnv().VITE_API_BASE_URL)
    process.stdout.write(`Android 正式 API 配置已通过校验：${apiUrl}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

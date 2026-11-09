import { basename } from 'node:path'
import { loadEnv } from 'vite'
import { validateProductionAmapKey } from './validateAndroidProductionEnv.mjs'

export const WEB_ORIGIN = 'https://campusmindapp.com'
export const API_ORIGIN = 'https://api.campusmindapp.com'
export const AMAP_SERVICE_HOST = `${WEB_ORIGIN}/_AMapService`

export function loadWebEnv(root = process.cwd()) {
  return { ...loadEnv('web', root, ''), ...process.env }
}

export function validateWebProductionEnv(env) {
  // The current backend's CORS and Strict refresh cookie are paired with these
  // owned hosts. Reject preview, localhost, IP, HTTP and credential-bearing URLs.
  const apiUrl = env.VITE_API_BASE_URL?.trim().replace(/\/$/, '')
  const amapServiceHost = env.VITE_AMAP_SERVICE_HOST?.trim().replace(/\/$/, '')
  if (apiUrl !== API_ORIGIN) throw new Error('正式网页 API 必须为 https://api.campusmindapp.com')
  if (amapServiceHost !== AMAP_SERVICE_HOST) throw new Error('正式网页高德代理必须为 https://campusmindapp.com/_AMapService')
  if (env.VITE_AMAP_SECURITY_CODE?.trim()) throw new Error('高德安全密钥只能保存为服务端 Secret，请清空 VITE_AMAP_SECURITY_CODE')
  return { apiUrl, amapServiceHost, amapKey: validateProductionAmapKey(env.VITE_AMAP_KEY) }
}

export function publicWebEnv(config) {
  // An explicit allowlist also protects whole-object uses of import.meta.env.
  return { BASE_URL: '/', DEV: false, PROD: true, SSR: false, MODE: 'web',
    VITE_API_BASE_URL: config.apiUrl, VITE_AMAP_KEY: config.amapKey,
    VITE_AMAP_SERVICE_HOST: config.amapServiceHost, VITE_AMAP_SECURITY_CODE: '' }
}

if (process.argv[1] && basename(process.argv[1]) === 'validateWebProductionEnv.mjs') {
  try {
    validateWebProductionEnv(loadWebEnv())
    console.log('网页正式配置通过：域名 API + 同源地图代理；安全密钥不进入客户端。')
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}

import { load as loadAMap } from '@amap/amap-jsapi-loader'

declare global {
  interface Window {
    _AMapSecurityConfig?: {
      securityJsCode?: string
    }
  }
}

const amapKey = import.meta.env.VITE_AMAP_KEY?.trim()
const amapSecurityCode = import.meta.env.VITE_AMAP_SECURITY_CODE?.trim()

let amapPromise: Promise<any> | null = null

export function isAMapConfigured(): boolean {
  return Boolean(amapKey && amapSecurityCode)
}

export async function loadAMapSdk(): Promise<any> {
  if (!amapKey || !amapSecurityCode) {
    throw new Error('AMap key or security code is missing')
  }

  window._AMapSecurityConfig = {
    securityJsCode: amapSecurityCode
  }

  amapPromise ??= loadAMap({
    key: amapKey,
    version: '2.0',
    plugins: ['AMap.Scale', 'AMap.ToolBar', 'AMap.PlaceSearch']
  })

  return amapPromise
}

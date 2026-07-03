import { load as loadAMap } from '@amap/amap-jsapi-loader'
import { gcj02ToWgs84 } from '@/utils/geo'

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
    plugins: [
      'AMap.Scale',
      'AMap.ToolBar',
      'AMap.PlaceSearch',
      'AMap.Walking',
      'AMap.Geolocation'
    ]
  })

  return amapPromise
}

export type AMapCurrentPosition = {
  latitude: number
  longitude: number
  description: string
}

function readAMapPosition(position: any): { latitude: number; longitude: number } | null {
  const latitude = typeof position?.getLat === 'function'
    ? position.getLat()
    : position?.lat
  const longitude = typeof position?.getLng === 'function'
    ? position.getLng()
    : position?.lng

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null
  }
  return { latitude, longitude }
}

export async function requestAMapCurrentPosition(): Promise<AMapCurrentPosition> {
  const AMap = await loadAMapSdk()

  return new Promise((resolve, reject) => {
    const geolocation = new AMap.Geolocation({
      enableHighAccuracy: true,
      timeout: 8000,
      needAddress: false,
      convert: true,
      noIpLocate: 0,
      noGeoLocation: 0
    })

    geolocation.getCurrentPosition((status: string, result: any) => {
      if (status !== 'complete') {
        reject(new Error(result?.message || result?.info || '高德定位失败'))
        return
      }

      const position = readAMapPosition(result?.position)
      if (!position) {
        reject(new Error('高德定位结果缺少坐标'))
        return
      }

      const [longitude, latitude] = gcj02ToWgs84(position.latitude, position.longitude)
      resolve({
        latitude,
        longitude,
        description: '来自高德定位'
      })
    })
  })
}

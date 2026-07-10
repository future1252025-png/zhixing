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
const pluginPromises = new Map<string, Promise<void>>()

const pluginConstructors: Record<string, string> = {
  'AMap.Scale': 'Scale',
  'AMap.ToolBar': 'ToolBar',
  'AMap.PlaceSearch': 'PlaceSearch',
  'AMap.Walking': 'Walking',
  'AMap.Geolocation': 'Geolocation'
}

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
    plugins: []
  })

  return amapPromise
}

export function preloadAMapSdk(): void {
  if (!isAMapConfigured() || amapPromise) {
    return
  }

  window.setTimeout(() => {
    void loadAMapSdk().catch(() => {
      amapPromise = null
    })
  }, 450)
}

export async function loadAMapPlugin(pluginName: keyof typeof pluginConstructors): Promise<any> {
  const AMap = await loadAMapSdk()
  const constructorName = pluginConstructors[pluginName]

  if (typeof AMap[constructorName] === 'function') {
    return AMap
  }

  let pluginPromise = pluginPromises.get(pluginName)
  if (!pluginPromise) {
    pluginPromise = new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        reject(new Error(`${pluginName} plugin load timed out`))
      }, 10_000)

      AMap.plugin([pluginName], () => {
        window.clearTimeout(timeoutId)
        if (typeof AMap[constructorName] === 'function') {
          resolve()
          return
        }
        reject(new Error(`${pluginName} plugin is unavailable`))
      })
    }).catch((error) => {
      pluginPromises.delete(pluginName)
      throw error
    })
    pluginPromises.set(pluginName, pluginPromise)
  }

  await pluginPromise
  return AMap
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
  const AMap = await loadAMapPlugin('AMap.Geolocation')

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

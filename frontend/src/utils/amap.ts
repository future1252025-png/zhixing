import { load as loadAMap, reset as resetAMap } from '@amap/amap-jsapi-loader'
import { gcj02ToWgs84 } from '@/utils/geo'

declare global {
  interface Window {
    _AMapSecurityConfig?: {
      securityJsCode?: string
      serviceHost?: string
    }
  }
}

const amapKey = import.meta.env.VITE_AMAP_KEY?.trim()
const amapSecurityCode = import.meta.env.VITE_AMAP_SECURITY_CODE?.trim()
const amapServiceHost = import.meta.env.VITE_AMAP_SERVICE_HOST?.trim()

let amapPromise: Promise<any> | null = null
const pluginPromises = new Map<string, Promise<void>>()

const pluginConstructors: Record<string, string> = {
  'AMap.Scale': 'Scale',
  'AMap.ToolBar': 'ToolBar',
  'AMap.PlaceSearch': 'PlaceSearch',
  'AMap.Geolocation': 'Geolocation'
}

export function isAMapConfigured(): boolean {
  return Boolean(amapKey && (amapServiceHost || amapSecurityCode))
}

export async function loadAMapSdk(): Promise<any> {
  if (!amapKey || (!amapServiceHost && !amapSecurityCode)) {
    throw new Error('AMap key or security code is missing')
  }

  if (amapServiceHost) {
    // 生产推荐：安全密钥由 Nginx 代理附加，前端不暴露明文密钥。
    window._AMapSecurityConfig = {
      serviceHost: amapServiceHost
    }
  } else {
    if (import.meta.env.PROD) {
      console.warn(
        '生产环境建议配置 VITE_AMAP_SERVICE_HOST 代理模式，避免明文暴露安全密钥'
      )
    }
    window._AMapSecurityConfig = {
      securityJsCode: amapSecurityCode
    }
  }

  amapPromise ??= loadAMap({
    key: amapKey,
    version: '2.0',
    plugins: []
  }).catch((error: unknown) => {
    // The loader itself caches its failed state. Clear it only after initial
    // loading failed (there cannot be a successfully constructed map yet).
    amapPromise = null; pluginPromises.clear(); resetAMap(); throw error
  })

  // A blocked SDK request must not leave either map page permanently loading.
  // Keep the underlying loader promise: a retry can reuse its late success.
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([amapPromise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('AMap SDK load timed out')), 12_000)
    })])
  } finally { clearTimeout(timer) }
}

/** Fetch data only: supplying `map` to PlaceSearch would add unwanted result pins. */
export async function getAMapPoiDetails(poiId: string): Promise<{ name: string; location: unknown } | null> {
  const AMap = await loadAMapPlugin('AMap.PlaceSearch')
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 6000)
    const search = new AMap.PlaceSearch({ city: '武汉', citylimit: true, pageSize: 1 })
    search.getDetails(poiId, (status: string, result: any) => {
      clearTimeout(timer)
      const poi = status === 'complete' ? result?.poiList?.pois?.[0] : null
      resolve(poi && poi.id === poiId ? { name: String(poi.name || ''), location: poi.location } : null)
    })
  })
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

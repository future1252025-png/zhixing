import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

export type DeviceLocationSource = 'native' | 'browser'

export type DevicePosition = {
  latitude: number
  longitude: number
  accuracy: number | null
  /** 定位采样发生的时刻，而不是用户稍后点击发送的时刻。 */
  locatedAt: string
  source: DeviceLocationSource
}

type GeolocationErrorLike = {
  code?: number | string
  message?: string
}

export function hasDeviceGeolocationProvider(): boolean {
  return Capacitor.isNativePlatform() || (
    typeof navigator !== 'undefined' && Boolean(navigator.geolocation)
  )
}

function hasGrantedPermission(status: {
  location: string
  coarseLocation: string
}): boolean {
  return status.location === 'granted' || status.coarseLocation === 'granted'
}

function formatLocatedAt(timestamp: unknown): string {
  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    const sampledAt = new Date(timestamp)
    if (!Number.isNaN(sampledAt.getTime())) return sampledAt.toISOString()
  }
  // 某些原生实现不返回 timestamp；此处紧邻定位结果采集完成，仍能准确表示采样时刻。
  return new Date().toISOString()
}

async function requestNativePosition(requestPermission: boolean): Promise<DevicePosition> {
  let permission = await Geolocation.checkPermissions()
  if (!hasGrantedPermission(permission) && requestPermission) {
    permission = await Geolocation.requestPermissions({ permissions: ['location'] })
  }
  if (!hasGrantedPermission(permission)) {
    throw Object.assign(new Error('定位权限被拒绝'), {
      code: 'OS-PLUG-GLOC-0003'
    })
  }

  const position = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    enableLocationFallback: true,
    // 每次实际采样读取新位置；地图内的短期复用由独立 store 控制，
    // 不影响频道发布时必须重新定位的校验流程。
    maximumAge: 0,
    timeout: 15_000
  })
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: Number.isFinite(position.coords.accuracy)
      ? position.coords.accuracy
      : null,
    locatedAt: formatLocatedAt(position.timestamp),
    source: 'native'
  }
}

async function requestBrowserPosition(requestPermission: boolean): Promise<DevicePosition> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.reject(Object.assign(new Error('当前环境不支持定位'), {
      code: 'GEOLOCATION_UNAVAILABLE'
    }))
  }
  if (!requestPermission) {
    // Automatic refreshes must not reopen a dismissed permission prompt. If
    // permission queries are unavailable, the explicit retry remains usable.
    const permission = await navigator.permissions?.query({ name: 'geolocation' }).catch(() => null)
    if (permission?.state !== 'granted') throw Object.assign(new Error('定位尚未授权'), { code: 1 })
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy)
          ? position.coords.accuracy
          : null,
        locatedAt: formatLocatedAt(position.timestamp),
        source: 'browser'
      }),
      reject,
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10_000
      }
    )
  })
}

export function requestDeviceCurrentPosition(options: { requestPermission?: boolean } = {}): Promise<DevicePosition> {
  return Capacitor.isNativePlatform()
    ? requestNativePosition(options.requestPermission !== false)
    : requestBrowserPosition(options.requestPermission !== false)
}

export function getDeviceGeolocationErrorMessage(error: unknown): string {
  const geoError = error as GeolocationErrorLike | undefined
  const code = geoError?.code

  if (code === 1 || code === 'OS-PLUG-GLOC-0003') {
    return Capacitor.isNativePlatform()
      ? '定位权限被拒绝，请到系统设置中允许“智行”使用位置信息'
      : '定位权限被拒绝，请在设置中允许使用位置信息'
  }
  if (
    code === 'OS-PLUG-GLOC-0007' ||
    code === 'OS-PLUG-GLOC-0009' ||
    code === 'OS-PLUG-GLOC-0017'
  ) {
    return '定位服务未开启，请打开定位开关后重试'
  }
  if (code === 3 || code === 'OS-PLUG-GLOC-0010') {
    return '定位超时，请到室外或靠近窗口后重试'
  }
  if (code === 2 || code === 'OS-PLUG-GLOC-0002') {
    return '暂时无法获取当前位置，请确认定位和网络可用后重试'
  }
  if (code === 'GEOLOCATION_UNAVAILABLE') {
    return '当前环境不支持定位'
  }
  if (geoError?.message) {
    return `定位失败：${geoError.message}`
  }
  return '定位失败，请稍后重试'
}

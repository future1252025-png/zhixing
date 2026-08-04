import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

export type DeviceLocationSource = 'native' | 'browser'

export type DevicePosition = {
  latitude: number
  longitude: number
  accuracy: number | null
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

async function requestNativePosition(): Promise<DevicePosition> {
  let permission = await Geolocation.checkPermissions()
  if (!hasGrantedPermission(permission)) {
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
    maximumAge: 30_000,
    timeout: 15_000
  })
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: Number.isFinite(position.coords.accuracy)
      ? position.coords.accuracy
      : null,
    source: 'native'
  }
}

function requestBrowserPosition(): Promise<DevicePosition> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.reject(Object.assign(new Error('当前环境不支持定位'), {
      code: 'GEOLOCATION_UNAVAILABLE'
    }))
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy)
          ? position.coords.accuracy
          : null,
        source: 'browser'
      }),
      reject,
      {
        enableHighAccuracy: true,
        maximumAge: 60_000,
        timeout: 10_000
      }
    )
  })
}

export function requestDeviceCurrentPosition(): Promise<DevicePosition> {
  return Capacitor.isNativePlatform()
    ? requestNativePosition()
    : requestBrowserPosition()
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

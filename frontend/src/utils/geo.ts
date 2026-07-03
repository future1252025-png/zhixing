const PI = Math.PI
const AXIS = 6378245.0
const OFFSET = 0.00669342162296594323

export type LngLat = [number, number]
export type LatLngPoint = {
  latitude: number
  longitude: number
}

const EARTH_RADIUS_METERS = 6371000

function outOfChina(latitude: number, longitude: number): boolean {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271
}

function transformLatitude(x: number, y: number): number {
  let result = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y
  result += 0.2 * Math.sqrt(Math.abs(x))
  result += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0
  result += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0
  result += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0
  return result
}

function transformLongitude(x: number, y: number): number {
  let result = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y
  result += 0.1 * Math.sqrt(Math.abs(x))
  result += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0
  result += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0
  result += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0
  return result
}

export function wgs84ToGcj02(latitude: number, longitude: number): LngLat {
  if (outOfChina(latitude, longitude)) {
    return [longitude, latitude]
  }

  let deltaLat = transformLatitude(longitude - 105.0, latitude - 35.0)
  let deltaLng = transformLongitude(longitude - 105.0, latitude - 35.0)
  const radLat = (latitude / 180.0) * PI
  let magic = Math.sin(radLat)
  magic = 1 - OFFSET * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  deltaLat = (deltaLat * 180.0) / (((AXIS * (1 - OFFSET)) / (magic * sqrtMagic)) * PI)
  deltaLng = (deltaLng * 180.0) / ((AXIS / sqrtMagic) * Math.cos(radLat) * PI)

  return [longitude + deltaLng, latitude + deltaLat]
}

export function gcj02ToWgs84(latitude: number, longitude: number): LngLat {
  if (outOfChina(latitude, longitude)) {
    return [longitude, latitude]
  }

  const [convertedLongitude, convertedLatitude] = wgs84ToGcj02(latitude, longitude)
  return [
    longitude * 2 - convertedLongitude,
    latitude * 2 - convertedLatitude
  ]
}

function toRadians(value: number): number {
  return (value * PI) / 180
}

export function haversineDistanceMeters(from: LatLngPoint, to: LatLngPoint): number {
  if (from.latitude === to.latitude && from.longitude === to.longitude) {
    return 0
  }

  const deltaLatitude = toRadians(to.latitude - from.latitude)
  const deltaLongitude = toRadians(to.longitude - from.longitude)
  const fromLatitude = toRadians(from.latitude)
  const toLatitude = toRadians(to.latitude)
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(deltaLongitude / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return Math.round(EARTH_RADIUS_METERS * c)
}

export function isPointInPolygon(point: LatLngPoint, polygon: LatLngPoint[]): boolean {
  if (polygon.length < 3) {
    return false
  }

  let inside = false
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const currentPoint = polygon[current]
    const previousPoint = polygon[previous]
    const intersects = ((currentPoint.latitude > point.latitude) !== (previousPoint.latitude > point.latitude))
      && (
        point.longitude < ((previousPoint.longitude - currentPoint.longitude)
          * (point.latitude - currentPoint.latitude))
          / (previousPoint.latitude - currentPoint.latitude)
          + currentPoint.longitude
      )

    if (intersects) {
      inside = !inside
    }
  }

  return inside
}

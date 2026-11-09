import type { Building } from '@/api/buildings'
import type { MapCamera, MapCoordinate, NativeMapPoi } from '@/types/map'
import { formatBuildingDisplayName } from './buildings'
import { haversineDistanceMeters, wgs84ToGcj02 } from './geo'

export const CAMPUS_MAP_CENTER: [number, number] = wgs84ToGcj02(30.579833, 114.328253)

export function readMapCoordinate(value: any): MapCoordinate | null {
  const longitude = typeof value?.getLng === 'function' ? value.getLng() : value?.lng ?? value?.longitude ?? value?.[0]
  const latitude = typeof value?.getLat === 'function' ? value.getLat() : value?.lat ?? value?.latitude ?? value?.[1]
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return null
  return { longitude, latitude }
}
export function readNativeMapPoi(event: any): NativeMapPoi | null {
  const coordinate = readMapCoordinate(event?.lnglat ?? event?.location)
  if (typeof event?.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(event.id)) return null
  return { coordinate, id: event.id, name: typeof event.name === 'string' ? event.name.trim().slice(0, 150) || '地图地点' : '地图地点' }
}
export function validMapCamera(value: MapCamera | null): value is MapCamera {
  return Boolean(value && readMapCoordinate(value.center) && Number.isFinite(value.zoom) && value.zoom >= 3 && value.zoom <= 20)
}
export function buildingMapCoordinate(building: Pick<Building, 'latitude' | 'longitude'>): MapCoordinate {
  const [longitude, latitude] = wgs84ToGcj02(building.latitude, building.longitude)
  return { longitude, latitude }
}
export function normalizeCampusBuildingName(name: string): string {
  const numbers: Record<string, string> = { 一: '1', 二: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9' }
  return formatBuildingDisplayName(name).normalize('NFKC').toLowerCase()
    .replace(/第?([一二三四五六七八九\d])(?:号)?(?:教学楼|教学大楼)/g, (_, n: string) => `教${numbers[n] ?? n}`)
    .replace(/教学楼\s*([一二三四五六七八九\d])/g, (_, n: string) => `教${numbers[n] ?? n}`)
    .replace(/[\s()（）·—\-]/g, '')
}
export function searchCampusBuildings(buildings: Building[], query: string, limit = 30): Building[] {
  const keyword = normalizeCampusBuildingName(query)
  if (!keyword) return buildings.slice(0, limit)
  return buildings.map((building, index) => ({ building, index, name: normalizeCampusBuildingName(building.name) }))
    .filter(item => item.name.includes(keyword) || normalizeCampusBuildingName(item.building.type).includes(keyword))
    .sort((a, b) => Number(b.name === keyword) - Number(a.name === keyword) || a.index - b.index)
    .slice(0, limit).map(item => item.building)
}
/** Identity must be unique and explicitly bound. A nearby coordinate is never an identity. */
export function boundPoiBuilding(buildings: Building[], poiId: string): Building | null {
  const matches = buildings.filter(building => building.map_pois?.some(poi => poi.provider === 'amap' && poi.poi_id === poiId))
  return matches.length === 1 ? matches[0]! : null
}
export function nearbyBuildingCandidates(buildings: Building[], point: MapCoordinate, name = '', radius = 180) {
  const keyword = normalizeCampusBuildingName(name)
  return buildings.map(building => {
    const coordinate = buildingMapCoordinate(building)
    return { building, distance: haversineDistanceMeters(point, coordinate),
      exactName: Boolean(keyword && normalizeCampusBuildingName(building.name) === keyword) }
  }).filter(item => Number.isFinite(item.distance) && item.distance <= radius)
    .sort((a, b) => Number(b.exactName) - Number(a.exactName) || a.distance - b.distance).slice(0, 8)
}

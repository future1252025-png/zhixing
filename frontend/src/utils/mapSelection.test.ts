import { describe, expect, it } from 'vitest'
import type { Building } from '@/api/buildings'
import { boundPoiBuilding, buildingMapCoordinate, nearbyBuildingCandidates, readMapCoordinate, readNativeMapPoi, searchCampusBuildings, validMapCamera } from './mapSelection'

const building = (id: number, name: string, extra = {}): Building => ({ id, name, type: '教学楼', description: '', latitude: 30.58, longitude: 114.32, map_x: 0, map_y: 0, walk_hint: null, ...extra })
const buildings = [building(1, '湖北大学武昌校区4号教学楼', { map_pois: [{ provider: 'amap', poi_id: 'B_TEST_4', name: '四号教学楼' }] }), building(2, '3号教学楼')]
describe('map identity and coordinate selection', () => {
  it('resolves only a unique explicit provider ID, never a nearby building or same-name POI', () => {
    expect(boundPoiBuilding(buildings, 'B_TEST_4')?.id).toBe(1)
    expect(boundPoiBuilding(buildings, 'unknown')).toBeNull()
    expect(boundPoiBuilding([buildings[0]!, { ...buildings[0]!, id: 3 }], 'B_TEST_4')).toBeNull()
  })
  it('accepts SDK coordinates without applying GPS conversion a second time', () => {
    expect(readMapCoordinate({ getLng: () => 114.3, getLat: () => 30.5 })).toEqual({ longitude: 114.3, latitude: 30.5 })
    expect(readMapCoordinate([114.3, 30.5])).toEqual({ longitude: 114.3, latitude: 30.5 })
    for (const point of [null, {}, [NaN, 30], [114, 200]]) expect(readMapCoordinate(point)).toBeNull()
  })
  it('handles native POIs without coordinates safely and rejects invalid IDs', () => {
    expect(readNativeMapPoi({ id: 'B_TEST_4', name: '教4' })).toEqual({ id: 'B_TEST_4', name: '教4', coordinate: null })
    expect(readNativeMapPoi({ id: '<script>' })).toBeNull()
    expect(readNativeMapPoi({ name: '教4' })).toBeNull()
  })
  it('searches common teaching-building aliases independently of map POIs', () => {
    for (const name of ['教4', '第四教学楼', '4号教学楼', '教４']) expect(searchCampusBuildings(buildings, name).map(b => b.id)).toEqual([1])
  })
  it('returns nearby candidates in the same coordinate system, never an automatic selection', () => {
    const result = nearbyBuildingCandidates(buildings, buildingMapCoordinate(buildings[0]!), '教4')
    expect(result.map(item => item.building.id)).toEqual([1, 2])
    expect(result[0]!.distance).toBeLessThan(0.01)
    expect(nearbyBuildingCandidates(buildings, { longitude: 115, latitude: 31 })).toEqual([])
  })
  it('rejects malformed restored cameras', () => {
    expect(validMapCamera({ center: [114.3, 30.5], zoom: 18 })).toBe(true)
    expect(validMapCamera({ center: [114.3, 300], zoom: 18 })).toBe(false)
    expect(validMapCamera({ center: [114.3, 30.5], zoom: NaN })).toBe(false)
    expect(validMapCamera(null)).toBe(false)
  })
})

import request from './request'

export type Building = {
  id: number
  name: string
  type: string
  description: string
  latitude: number
  longitude: number
  map_x: number
  map_y: number
  walk_hint: string | null
}

export type LocationPreset = {
  id: number
  name: string
  building_id: number | null
  building_name: string | null
  latitude: number
  longitude: number
  description: string | null
}

export async function getBuildings(): Promise<Building[]> {
  const response = await request.get<Building[]>('/api/buildings')
  return response.data
}

export async function getBuildingDetail(buildingId: number): Promise<Building> {
  const response = await request.get<Building>(`/api/buildings/${buildingId}`)
  return response.data
}

export async function getLocationPresets(): Promise<LocationPreset[]> {
  const response = await request.get<LocationPreset[]>('/api/location-presets')
  return response.data
}

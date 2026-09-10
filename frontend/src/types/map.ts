export type CampusMapPoint = {
  id?: number
  name: string
  type?: string
  latitude: number
  longitude: number
  description?: string | null
}

/** Map SDK coordinates are GCJ-02. Do not pass these through the GPS converter again. */
export type MapCoordinate = { longitude: number; latitude: number }
export type MapCamera = { center: [number, number]; zoom: number }
export type NativeMapPoi = { id: string; name: string; coordinate: MapCoordinate | null }

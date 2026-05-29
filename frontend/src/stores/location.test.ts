import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useLocationStore } from './location'
import type { Building, LocationPreset } from '@/api/buildings'

const preset: LocationPreset = {
  id: 1,
  name: 'Library preset',
  building_id: 3,
  building_name: 'Library',
  latitude: 30.5812,
  longitude: 114.3221,
  description: 'Demo start point'
}

const building: Building = {
  id: 2,
  name: 'Teaching Building 1',
  type: 'Teaching',
  description: 'Main teaching building',
  latitude: 30.5821,
  longitude: 114.324,
  map_x: 60,
  map_y: 42,
  walk_hint: null
}

describe('location store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('selects a preset and prefers current_building_id when available', () => {
    const store = useLocationStore()

    store.selectPreset(preset)

    expect(store.selectedLocation?.name).toBe('Library preset')
    expect(store.suggestionPayload).toEqual({ current_building_id: 3 })
  })

  it('selects any building as current location', () => {
    const store = useLocationStore()

    store.selectBuilding(building)

    expect(store.selectedLocation?.source).toBe('building')
    expect(store.suggestionPayload).toEqual({ current_building_id: 2 })
  })

  it('uses coordinates for browser location', () => {
    const store = useLocationStore()

    store.setBrowserLocation(30.58, 114.32)

    expect(store.selectedLocation?.name).toBe('当前位置')
    expect(store.suggestionPayload).toEqual({
      latitude: 30.58,
      longitude: 114.32
    })
  })

  it('can clear the selected location', () => {
    const store = useLocationStore()

    store.selectPreset(preset)
    store.clearLocation()

    expect(store.selectedLocation).toBeNull()
    expect(store.suggestionPayload).toBeNull()
  })
})

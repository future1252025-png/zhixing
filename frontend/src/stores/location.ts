import { defineStore } from 'pinia'

import type { Building, LocationPreset } from '@/api/buildings'
import type { ScheduleSuggestionPayload } from '@/types/schedule'

export type SelectedLocationSource = 'preset' | 'building' | 'browser'

export type SelectedLocation = {
  source: SelectedLocationSource
  name: string
  latitude: number
  longitude: number
  building_id: number | null
  description?: string | null
}

type LocationState = {
  selectedLocation: SelectedLocation | null
  browserLoading: boolean
  browserError: string
}

export const useLocationStore = defineStore('location', {
  state: (): LocationState => ({
    selectedLocation: null,
    browserLoading: false,
    browserError: ''
  }),
  getters: {
    suggestionPayload: (state): ScheduleSuggestionPayload | null => {
      if (!state.selectedLocation) {
        return null
      }
      if (state.selectedLocation.building_id) {
        return { current_building_id: state.selectedLocation.building_id }
      }
      return {
        latitude: state.selectedLocation.latitude,
        longitude: state.selectedLocation.longitude
      }
    }
  },
  actions: {
    selectPreset(preset: LocationPreset) {
      this.selectedLocation = {
        source: 'preset',
        name: preset.name,
        latitude: preset.latitude,
        longitude: preset.longitude,
        building_id: preset.building_id,
        description: preset.description
      }
      this.browserError = ''
    },
    selectBuilding(building: Building) {
      this.selectedLocation = {
        source: 'building',
        name: building.name,
        latitude: building.latitude,
        longitude: building.longitude,
        building_id: building.id,
        description: building.walk_hint
      }
      this.browserError = ''
    },
    setBrowserLocation(latitude: number, longitude: number) {
      this.selectedLocation = {
        source: 'browser',
        name: '当前位置',
        latitude,
        longitude,
        building_id: null,
        description: '来自浏览器定位'
      }
      this.browserError = ''
    },
    async requestBrowserLocation(): Promise<SelectedLocation> {
      if (!navigator.geolocation) {
        this.browserError = '当前浏览器不支持定位，请手动选择当前位置'
        throw new Error(this.browserError)
      }

      this.browserLoading = true
      this.browserError = ''
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 6000,
            maximumAge: 300000
          })
        })
        this.setBrowserLocation(
          position.coords.latitude,
          position.coords.longitude
        )
        return this.selectedLocation as SelectedLocation
      } catch (error) {
        this.browserError = '浏览器定位失败，请手动选择当前位置'
        throw error
      } finally {
        this.browserLoading = false
      }
    },
    clearLocation() {
      this.selectedLocation = null
      this.browserError = ''
    }
  }
})

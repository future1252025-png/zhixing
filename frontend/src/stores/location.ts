import { defineStore } from 'pinia'

import type { Building, LocationPreset } from '@/api/buildings'
import type { ScheduleSuggestionPayload } from '@/types/schedule'
import { requestAMapCurrentPosition } from '@/utils/amap'
import {
  getDeviceGeolocationErrorMessage,
  hasDeviceGeolocationProvider,
  requestDeviceCurrentPosition
} from '@/utils/deviceGeolocation'

export type SelectedLocationSource = 'preset' | 'building' | 'browser' | 'fallback'

const CAMPUS_CENTER_LOCATION = {
  latitude: 30.579833,
  longitude: 114.328253
}

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
    setBrowserLocation(latitude: number, longitude: number, description = '定位得到的当前位置') {
      this.selectedLocation = {
        source: 'browser',
        name: '当前位置',
        latitude,
        longitude,
        building_id: null,
        description
      }
      this.browserError = ''
    },
    setCampusCenterFallback(reason = '') {
      this.selectedLocation = {
        source: 'fallback',
        name: '校园中心',
        latitude: CAMPUS_CENTER_LOCATION.latitude,
        longitude: CAMPUS_CENTER_LOCATION.longitude,
        building_id: null,
        description: '定位失败，已临时使用湖北大学武昌校区中心；可搜索选择更准确起点'
      }
      this.browserError = reason
        ? `定位失败，已使用校园中心兜底：${reason}`
        : '定位失败，已使用校园中心兜底'
    },
    async requestBrowserLocation(): Promise<SelectedLocation> {
      this.browserLoading = true
      this.browserError = ''
      try {
        if (hasDeviceGeolocationProvider()) {
          try {
            const position = await requestDeviceCurrentPosition()
            this.setBrowserLocation(
              position.latitude,
              position.longitude,
              '定位得到的当前位置'
            )
            return this.selectedLocation as SelectedLocation
          } catch (error) {
            this.setCampusCenterFallback(getDeviceGeolocationErrorMessage(error))
            return this.selectedLocation as SelectedLocation
          }
        }

        const amapPosition = await requestAMapCurrentPosition()
        this.setBrowserLocation(
          amapPosition.latitude,
          amapPosition.longitude,
          '定位得到的当前位置'
        )
        return this.selectedLocation as SelectedLocation
      } catch (error) {
        this.setCampusCenterFallback('暂时无法获取当前位置，请手动搜索选择起点')
        return this.selectedLocation as SelectedLocation
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

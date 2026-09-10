import { defineStore } from 'pinia'
import type { MapCamera, NativeMapPoi } from '@/types/map'
import { getDeviceGeolocationErrorMessage, requestDeviceCurrentPosition, type DevicePosition } from '@/utils/deviceGeolocation'
import { validMapCamera } from '@/utils/mapSelection'

export const useCampusMapStore = defineStore('campus-map', {
  state: () => ({ ownerId: null as number | null, camera: null as MapCamera | null,
    selectedBuildingId: null as number | null, selectedPoi: null as NativeMapPoi | null,
    position: null as DevicePosition | null, locating: false, locationError: '', generation: 0 }),
  actions: {
    attachUser(userId: number | null) {
      if (this.ownerId === userId) return
      const generation = this.generation + 1
      this.$reset()
      this.generation = generation
      this.ownerId = userId
    },
    rememberCamera(camera: MapCamera) {
      if (validMapCamera(camera)) this.camera = { zoom: camera.zoom, center: [...camera.center] }
    },
    async locate(): Promise<DevicePosition | null> {
      if (this.locating) return null
      const ownerId = this.ownerId
      const generation = ++this.generation
      this.locating = true; this.locationError = ''
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const position = await Promise.race([requestDeviceCurrentPosition(), new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject({ code: 3 }), 22_000)
        })])
        if (this.ownerId !== ownerId || this.generation !== generation) return null
        if (!Number.isFinite(position.latitude) || !Number.isFinite(position.longitude) || Math.abs(position.latitude) > 90 || Math.abs(position.longitude) > 180) throw new Error('设备未返回有效位置')
        this.position = position
        return position
      } catch (error) {
        if (this.ownerId === ownerId && this.generation === generation) this.locationError = getDeviceGeolocationErrorMessage(error)
        return null
      } finally {
        clearTimeout(timer)
        if (this.ownerId === ownerId && this.generation === generation) this.locating = false
      }
    }
  }
})

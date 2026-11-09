import { defineStore } from 'pinia'
import type { MapCamera, NativeMapPoi } from '@/types/map'
import { getDeviceGeolocationErrorMessage, requestDeviceCurrentPosition, type DevicePosition } from '@/utils/deviceGeolocation'
import { validMapCamera } from '@/utils/mapSelection'

export const MAP_LOCATION_FRESH_MS = 60_000

export const useCampusMapStore = defineStore('campus-map', {
  state: () => ({ ownerId: null as number | null, camera: null as MapCamera | null,
    selectedBuildingId: null as number | null, selectedPoi: null as NativeMapPoi | null,
    position: null as DevicePosition | null, locating: false, locationError: '', generation: 0,
    pendingLocation: null as Promise<DevicePosition | null> | null,
    lastLocationAttempt: null as number | null, permissionAttempted: false }),
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
    ensurePosition(): Promise<DevicePosition | null> {
      if (this.pendingLocation) return this.pendingLocation
      const age = this.position ? Date.now() - Date.parse(this.position.locatedAt) : Infinity
      if (!this.locationError && age >= 0 && age < MAP_LOCATION_FRESH_MS) return Promise.resolve(this.position)
      const attemptAge = this.lastLocationAttempt === null ? Infinity : Date.now() - this.lastLocationAttempt
      if (attemptAge >= 0 && attemptAge < MAP_LOCATION_FRESH_MS) return Promise.resolve(null)
      return this.locate(true)
    },
    locate(automatic = false): Promise<DevicePosition | null> {
      if (this.pendingLocation) return this.pendingLocation
      const ownerId = this.ownerId
      const generation = ++this.generation
      const requestPermission = !automatic || !this.permissionAttempted
      this.permissionAttempted = true
      this.lastLocationAttempt = Date.now()
      this.locating = true; this.locationError = ''
      const pending = this.readPosition(ownerId, generation, requestPermission)
      this.pendingLocation = pending
      return pending
    },
    async readPosition(ownerId: number | null, generation: number, requestPermission: boolean): Promise<DevicePosition | null> {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const position = await Promise.race([requestDeviceCurrentPosition({ requestPermission }), new Promise<never>((_, reject) => {
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
        if (this.ownerId === ownerId && this.generation === generation) {
          this.locating = false; this.pendingLocation = null
        }
      }
    }
  }
})

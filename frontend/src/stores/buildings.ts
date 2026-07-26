import { defineStore } from 'pinia'

import { getBuildings, type Building } from '@/api/buildings'
import { extractBusinessError } from '@/api/errors'

type BuildingsStoreState = {
  buildings: Building[]
  loaded: boolean
  loading: boolean
  errorMessage: string
  pendingRequest: Promise<Building[]> | null
}

export const useBuildingsStore = defineStore('buildings', {
  state: (): BuildingsStoreState => ({
    buildings: [],
    loaded: false,
    loading: false,
    errorMessage: '',
    pendingRequest: null
  }),
  actions: {
    /** Return the cached building list, requesting it only when missing. */
    async ensureLoaded(): Promise<Building[]> {
      if (this.loaded) return this.buildings
      if (this.pendingRequest) return this.pendingRequest
      this.loading = true
      this.errorMessage = ''
      const pending = getBuildings()
        .then((buildings) => {
          if (this.pendingRequest === pending) {
            this.buildings = buildings
            this.loaded = true
          }
          return buildings
        })
        .catch((error: unknown) => {
          if (this.pendingRequest === pending) {
            this.errorMessage = extractBusinessError(error).message
          }
          throw error
        })
        .finally(() => {
          if (this.pendingRequest === pending) {
            this.pendingRequest = null
            this.loading = false
          }
        })
      this.pendingRequest = pending
      return pending
    },
    /** Drop the cache so the next ensureLoaded refetches. */
    invalidate(): void {
      this.pendingRequest = null
      this.loaded = false
      this.loading = false
      this.errorMessage = ''
    }
  }
})

import { defineStore } from 'pinia'

import { getCourses } from '@/api/courses'
import { extractBusinessError } from '@/api/errors'
import type { Course } from '@/types/course'
import { clearCourseSnapshot } from '@/utils/courseSnapshot'

type CoursesStoreState = {
  courses: Course[]
  loaded: boolean
  loading: boolean
  errorMessage: string
  pendingRequest: Promise<Course[]> | null
  loadedForUserId: number | null
  lastFetchedAt: number | null
}

export const useCoursesStore = defineStore('courses', {
  state: (): CoursesStoreState => ({
    courses: [],
    loaded: false,
    loading: false,
    errorMessage: '',
    pendingRequest: null,
    loadedForUserId: null,
    lastFetchedAt: null
  }),
  actions: {
    attachUser(userId: number | null): void {
      if (this.loadedForUserId === userId) return
      this.courses = []
      this.invalidate()
      this.loadedForUserId = userId
    },
    hydrate(userId: number, courses: Course[], fresh = false): void {
      this.attachUser(userId)
      this.pendingRequest = null
      this.courses = courses
      this.loaded = true
      this.loading = false
      this.errorMessage = ''
      this.lastFetchedAt = fresh ? Date.now() : null
    },
    /** Return the cached course list, requesting it only when missing. */
    async ensureLoaded(force = false): Promise<Course[]> {
      if (this.loaded && !force && this.lastFetchedAt !== null) return this.courses
      if (this.loaded && !force) {
        void this.ensureLoaded(true).catch(() => {})
        return this.courses
      }
      if (this.pendingRequest) return this.pendingRequest
      this.loading = true
      this.errorMessage = ''
      const pending = getCourses()
        .then((courses) => {
          if (this.pendingRequest === pending) {
            this.courses = courses
            this.loaded = true
            this.lastFetchedAt = Date.now()
          }
          return courses
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
    /** Drop the cache so the next ensureLoaded refetches (call after create/update/delete/import). */
    invalidate(): void {
      if (this.loadedForUserId !== null) clearCourseSnapshot(this.loadedForUserId)
      this.pendingRequest = null
      this.loaded = false
      this.loading = false
      this.errorMessage = ''
      this.lastFetchedAt = null
    }
  }
})

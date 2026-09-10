import { defineStore } from 'pinia'

import { getCourses } from '@/api/courses'
import { extractBusinessError } from '@/api/errors'
import type { Course } from '@/types/course'

type CoursesStoreState = {
  courses: Course[]
  loaded: boolean
  loading: boolean
  errorMessage: string
  pendingRequest: Promise<Course[]> | null
}

export const useCoursesStore = defineStore('courses', {
  state: (): CoursesStoreState => ({
    courses: [],
    loaded: false,
    loading: false,
    errorMessage: '',
    pendingRequest: null
  }),
  actions: {
    /** Return the cached course list, requesting it only when missing. */
    async ensureLoaded(force = false): Promise<Course[]> {
      if (this.loaded && !force) return this.courses
      if (this.pendingRequest) return this.pendingRequest
      this.loading = true
      this.errorMessage = ''
      const pending = getCourses()
        .then((courses) => {
          if (this.pendingRequest === pending) {
            this.courses = courses
            this.loaded = true
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
      this.pendingRequest = null
      this.loaded = false
      this.loading = false
      this.errorMessage = ''
    }
  }
})

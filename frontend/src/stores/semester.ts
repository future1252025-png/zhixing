import { defineStore } from 'pinia'

import { fetchSemester, saveSemester } from '@/api/semester'
import type { SemesterState, SemesterUpdate } from '@/types/semester'
import { createScopedStorage } from '@/utils/scopedStorage'

const BROWSING_WEEK_KEY = 'browsing-week'
const DEFAULT_MAX_WEEKS = 20

type SemesterStoreState = {
  semester: SemesterState | null
  browsingWeek: number
  loading: boolean
  saving: boolean
  loadedForUserId: number | null
  requestRevision: number
}

function validWeek(value: unknown, maxWeek: number): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= maxWeek
}

function boundedWeek(value: number, maxWeek: number): number {
  return Math.min(Math.max(Math.trunc(value), 1), maxWeek)
}

export const useSemesterStore = defineStore('semester', {
  state: (): SemesterStoreState => ({
    semester: null,
    browsingWeek: 1,
    loading: false,
    saving: false,
    loadedForUserId: null,
    requestRevision: 0
  }),
  getters: {
    currentWeek: (state): number | null => state.semester?.current_week ?? null,
    totalWeeks: (state): number | null => state.semester?.total_weeks ?? null
  },
  actions: {
    async load(userId: number): Promise<SemesterState> {
      const revision = ++this.requestRevision
      if (this.loadedForUserId !== userId) {
        this.semester = null
        this.browsingWeek = 1
      }
      this.loadedForUserId = userId
      this.loading = true
      try {
        const semester = await fetchSemester()
        if (revision !== this.requestRevision || this.loadedForUserId !== userId) {
          return semester
        }
        this.semester = semester
        const maxWeek = semester.total_weeks ?? DEFAULT_MAX_WEEKS
        const cachedWeek = Number(createScopedStorage(userId).get(BROWSING_WEEK_KEY))
        const fallback = boundedWeek(semester.current_week ?? 1, maxWeek)
        this.browsingWeek = validWeek(cachedWeek, maxWeek) ? cachedWeek : fallback
        return semester
      } finally {
        if (revision === this.requestRevision) {
          this.loading = false
        }
      }
    },
    setBrowsingWeek(week: number): void {
      const maxWeek = this.semester?.total_weeks ?? DEFAULT_MAX_WEEKS
      const nextWeek = validWeek(week, maxWeek) ? week : boundedWeek(week, maxWeek)
      this.browsingWeek = nextWeek
      if (this.loadedForUserId !== null) {
        createScopedStorage(this.loadedForUserId).set(BROWSING_WEEK_KEY, String(nextWeek))
      }
    },
    async save(payload: SemesterUpdate): Promise<SemesterState> {
      const userId = this.loadedForUserId
      if (userId === null) {
        throw new Error('semester store has no active user')
      }
      const revision = ++this.requestRevision
      this.saving = true
      try {
        const semester = await saveSemester(payload)
        if (revision !== this.requestRevision || this.loadedForUserId !== userId) {
          return semester
        }
        this.semester = semester
        const maxWeek = semester.total_weeks ?? DEFAULT_MAX_WEEKS
        this.browsingWeek = boundedWeek(this.browsingWeek, maxWeek)
        createScopedStorage(userId).set(BROWSING_WEEK_KEY, String(this.browsingWeek))
        return semester
      } finally {
        if (revision === this.requestRevision) {
          this.saving = false
        }
      }
    },
    reset(): void {
      this.requestRevision += 1
      this.semester = null
      this.browsingWeek = 1
      this.loading = false
      this.saving = false
      this.loadedForUserId = null
    }
  }
})

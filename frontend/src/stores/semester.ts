import { defineStore } from 'pinia'

import { fetchSemester, saveSemester } from '@/api/semester'
import type { SemesterState, SemesterUpdate } from '@/types/semester'
import { createScopedStorage } from '@/utils/scopedStorage'
import { semesterAt } from '@/utils/campusTime'

const BROWSING_WEEK_KEY = 'browsing-week'
const DEFAULT_MAX_WEEKS = 20
export const SEMESTER_CACHE_KEY = 'semester-settings-v1'
export const SEMESTER_FRESH_MS = 5 * 60_000

// Persist settings, never the server's time-sensitive current_week/status snapshot.
function readCachedSemester(userId: number): SemesterState | null {
  try {
    const raw = createScopedStorage(userId).get(SEMESTER_CACHE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || data.version !== 1) return null
    if (data.start_date === null && data.total_weeks === null) return semesterAt(null, new Date())
    if (typeof data.start_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.start_date)
      || !Number.isInteger(data.total_weeks) || data.total_weeks < 1 || data.total_weeks > 30) return null
    const date = new Date(`${data.start_date}T00:00:00Z`)
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== data.start_date || date.getUTCDay() !== 1) return null
    return semesterAt({ start_date: data.start_date, total_weeks: data.total_weeks, status: 'active', current_week: null }, new Date())
  } catch { return null }
}

function persistSemester(userId: number, semester: SemesterState): void {
  try {
    createScopedStorage(userId).set(SEMESTER_CACHE_KEY, JSON.stringify({
      version: 1, start_date: semester.start_date, total_weeks: semester.total_weeks
    }))
  } catch { /* Storage restrictions must not turn a successful API response into a failure. */ }
}

type SemesterStoreState = {
  semester: SemesterState | null
  browsingWeek: number
  loading: boolean
  saving: boolean
  loadedForUserId: number | null
  requestRevision: number
  pendingRequest: Promise<SemesterState> | null
  pendingSave: Promise<SemesterState> | null
  lastFetchedAt: number | null
  errorMessage: string
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
    requestRevision: 0,
    pendingRequest: null,
    pendingSave: null,
    lastFetchedAt: null,
    errorMessage: ''
  }),
  getters: {
    // API snapshot for compatibility; live UI must use semesterAt + useCampusClock.
    currentWeek: (state): number | null => state.semester?.current_week ?? null,
    totalWeeks: (state): number | null => state.semester?.total_weeks ?? null
  },
  actions: {
    attachUser(userId: number): void {
      if (this.loadedForUserId === userId) return
      this.reset()
      this.loadedForUserId = userId
      this.semester = readCachedSemester(userId)
      this.restoreBrowsingWeek()
    },
    restoreBrowsingWeek(): void {
      const maxWeek = this.semester?.total_weeks ?? DEFAULT_MAX_WEEKS
      let cachedWeek = 0
      try { cachedWeek = Number(createScopedStorage(this.loadedForUserId!).get(BROWSING_WEEK_KEY)) } catch { /* memory-only */ }
      const fallback = boundedWeek(semesterAt(this.semester, new Date()).current_week ?? 1, maxWeek)
      this.browsingWeek = validWeek(cachedWeek, maxWeek) ? cachedWeek : fallback
    },
    async load(userId: number, force = false): Promise<SemesterState> {
      this.attachUser(userId)
      // A refresh cannot overtake a save and replace freshly edited settings.
      if (this.pendingSave) return !force && this.semester ? semesterAt(this.semester, new Date()) : this.pendingSave
      const age = this.lastFetchedAt === null ? Infinity : Date.now() - this.lastFetchedAt
      if (!force && this.semester && age >= 0 && age < SEMESTER_FRESH_MS) return semesterAt(this.semester, new Date())
      const pending = this.pendingRequest ?? this.fetch(userId)
      if (!force && this.semester) {
        void pending.catch(() => {}) // keep cached content; fetch records the background error
        return semesterAt(this.semester, new Date())
      }
      return pending
    },
    fetch(userId: number): Promise<SemesterState> {
      const revision = ++this.requestRevision
      this.loading = true
      this.errorMessage = ''
      const pending = fetchSemester().then((semester) => {
        if (revision !== this.requestRevision || this.loadedForUserId !== userId) return semester
        const hadSemester = this.semester !== null
        // An unchanged refresh must not reset an open settings editor.
        if (this.semester?.start_date === semester.start_date && this.semester.total_weeks === semester.total_weeks) {
          this.semester.status = semester.status
          this.semester.current_week = semester.current_week
        } else this.semester = semester
        this.lastFetchedAt = Date.now()
        if (hadSemester) this.browsingWeek = boundedWeek(this.browsingWeek, semester.total_weeks ?? DEFAULT_MAX_WEEKS)
        else this.restoreBrowsingWeek()
        persistSemester(userId, semester)
        return semester
      }).catch((error: unknown) => {
        if (revision === this.requestRevision) this.errorMessage = '学期暂未同步，请检查网络后重试'
        throw error
      }).finally(() => {
        if (revision === this.requestRevision) { this.loading = false; this.pendingRequest = null }
      })
      this.pendingRequest = pending
      return pending
    },
    setBrowsingWeek(week: number): void {
      const maxWeek = this.semester?.total_weeks ?? DEFAULT_MAX_WEEKS
      const nextWeek = validWeek(week, maxWeek) ? week : boundedWeek(week, maxWeek)
      this.browsingWeek = nextWeek
      if (this.loadedForUserId !== null) {
        try { createScopedStorage(this.loadedForUserId).set(BROWSING_WEEK_KEY, String(nextWeek)) } catch { /* memory-only */ }
      }
    },
    async save(payload: SemesterUpdate): Promise<SemesterState> {
      const userId = this.loadedForUserId
      if (userId === null) {
        throw new Error('semester store has no active user')
      }
      if (this.pendingSave) throw new Error('学期设置正在保存，请稍后重试')
      const revision = ++this.requestRevision
      this.pendingRequest = null
      this.loading = false
      this.saving = true
      const pending = saveSemester(payload).then((semester) => {
        if (revision !== this.requestRevision || this.loadedForUserId !== userId) {
          return semester
        }
        this.semester = semester
        this.lastFetchedAt = Date.now()
        this.errorMessage = ''
        const maxWeek = semester.total_weeks ?? DEFAULT_MAX_WEEKS
        this.browsingWeek = boundedWeek(this.browsingWeek, maxWeek)
        this.setBrowsingWeek(this.browsingWeek)
        persistSemester(userId, semester)
        return semester
      }).finally(() => {
        if (revision === this.requestRevision) {
          this.saving = false
          this.pendingSave = null
        }
      })
      this.pendingSave = pending
      return pending
    },
    reset(): void {
      this.requestRevision += 1
      this.semester = null
      this.browsingWeek = 1
      this.loading = false
      this.saving = false
      this.loadedForUserId = null
      this.pendingRequest = null
      this.pendingSave = null
      this.lastFetchedAt = null
      this.errorMessage = ''
    }
  }
})

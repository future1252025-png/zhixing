import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchSemester, saveSemester } from '@/api/semester'
import { SEMESTER_CACHE_KEY, SEMESTER_FRESH_MS, useSemesterStore } from './semester'

vi.mock('@/api/semester', () => ({
  fetchSemester: vi.fn(),
  saveSemester: vi.fn()
}))

const activeSemester = {
  status: 'active' as const,
  start_date: '2026-08-31',
  total_weeks: 20,
  current_week: 4
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolver, rejecter) => {
    resolve = resolver
    reject = rejecter
  })
  return { promise, resolve, reject }
}

describe('semester store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-21T07:00:00+08:00'))
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(fetchSemester).mockResolvedValue(activeSemester)
  })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('refreshes changed time rules even when semester dates are unchanged and restores them offline', async () => {
    const store = useSemesterStore()
    await store.load(12)
    const rules = [{ start_date: '2026-09-01', end_date: null, from_start: '14:00', from_end: '15:40', start_time: '14:30', end_time: '16:10' }]
    vi.mocked(fetchSemester).mockResolvedValue({ ...activeSemester, time_rules: rules })
    await store.load(12, true)
    expect(store.semester?.time_rules).toEqual(rules)
    store.reset(); store.attachUser(12)
    expect(store.semester?.time_rules).toEqual(rules)
  })

  it('coalesces simultaneous home, login and reminder requests, then reuses fresh data', async () => {
    const response = deferred<typeof activeSemester>()
    vi.mocked(fetchSemester).mockReturnValueOnce(response.promise)
    const store = useSemesterStore()
    const requests = [store.load(12), store.load(12), store.load(12, true)]
    expect(fetchSemester).toHaveBeenCalledTimes(1)
    response.resolve(activeSemester)
    await Promise.all(requests)
    await store.load(12)
    await store.load(12)
    expect(fetchSemester).toHaveBeenCalledTimes(1)
    expect(store.loading).toBe(false)
    await store.load(12, true)
    expect(fetchSemester).toHaveBeenCalledTimes(2)
  })

  it('returns stale content immediately and preserves browsing changes during background refresh', async () => {
    const store = useSemesterStore()
    await store.load(12)
    vi.advanceTimersByTime(SEMESTER_FRESH_MS)
    const response = deferred<typeof activeSemester>()
    vi.mocked(fetchSemester).mockReturnValueOnce(response.promise)
    await expect(store.load(12)).resolves.toEqual(activeSemester)
    expect(store.loading).toBe(true)
    await store.load(12)
    expect(fetchSemester).toHaveBeenCalledTimes(2)
    store.setBrowsingWeek(9)
    const refresh = store.load(12, true)
    response.resolve({ ...activeSemester, total_weeks: 18 })
    await refresh
    expect(store.totalWeeks).toBe(18)
    expect(store.browsingWeek).toBe(9)
    expect(store.loading).toBe(false)
  })

  it('keeps cached settings and exposes a retryable error when background refresh fails', async () => {
    const store = useSemesterStore()
    await store.load(12)
    vi.advanceTimersByTime(SEMESTER_FRESH_MS)
    const response = deferred<typeof activeSemester>()
    vi.mocked(fetchSemester).mockReturnValueOnce(response.promise)
    await store.load(12)
    // The network Promise is shared even with an explicit retry.
    const refresh = store.load(12, true)
    const failed = expect(refresh).rejects.toThrow('offline')
    response.reject(new Error('offline'))
    await failed
    expect(store.semester).toEqual(activeSemester)
    expect(store.errorMessage).toContain('学期暂未同步')
    expect(store.loading).toBe(false)
    await store.load(12, true)
    expect(store.errorMessage).toBe('')
  })

  it('hydrates account-scoped settings using today, without persisting a frozen week', async () => {
    const store = useSemesterStore()
    await store.load(12)
    const cached = JSON.parse(localStorage.getItem(`campusmind:12:${SEMESTER_CACHE_KEY}`)!)
    expect(cached).toEqual({ version: 1, start_date: '2026-08-31', total_weeks: 20 })
    store.reset()
    vi.setSystemTime(new Date('2026-09-28T00:00:01+08:00'))
    store.attachUser(12)
    expect(store.currentWeek).toBe(5)
    expect(store.browsingWeek).toBe(5)
    expect(store.lastFetchedAt).toBeNull()
    store.attachUser(13)
    expect(store.semester).toBeNull()
    expect(store.browsingWeek).toBe(1)
  })

  it.each([
    '{broken',
    JSON.stringify({ version: 1, start_date: '2026-02-30', total_weeks: 20 }),
    JSON.stringify({ version: 1, start_date: '2026-09-01', total_weeks: 20 }),
    JSON.stringify({ version: 1, start_date: '2026-08-31', total_weeks: 99 })
  ])('ignores invalid local settings: %s', async (raw) => {
    localStorage.setItem(`campusmind:12:${SEMESTER_CACHE_KEY}`, raw)
    const store = useSemesterStore()
    store.attachUser(12)
    expect(store.semester).toBeNull()
    await store.load(12)
    expect(store.semester).toEqual(activeSemester)
  })

  it('does not let an old read or a concurrent refresh overwrite a save', async () => {
    const store = useSemesterStore()
    await store.load(12)
    const oldRead = deferred<typeof activeSemester>()
    const saved = deferred<typeof activeSemester>()
    vi.mocked(fetchSemester).mockReturnValueOnce(oldRead.promise)
    vi.mocked(saveSemester).mockReturnValueOnce(saved.promise)
    const refresh = store.load(12, true)
    const save = store.save({ start_date: '2026-08-31', total_weeks: 18 })
    const refreshDuringSave = store.load(12, true)
    expect(fetchSemester).toHaveBeenCalledTimes(2)
    saved.resolve({ ...activeSemester, total_weeks: 18 })
    await Promise.all([save, refreshDuringSave])
    oldRead.resolve(activeSemester)
    await refresh
    expect(store.totalWeeks).toBe(18)
    expect(store.loading).toBe(false)
    expect(store.saving).toBe(false)
    await store.load(12)
    expect(fetchSemester).toHaveBeenCalledTimes(2)
  })

  it('does not refill state or local cache after logout while a read is pending', async () => {
    const response = deferred<typeof activeSemester>()
    vi.mocked(fetchSemester).mockReturnValueOnce(response.promise)
    const store = useSemesterStore()
    const loading = store.load(12)
    store.reset()
    response.resolve(activeSemester)
    await loading
    expect(store.semester).toBeNull()
    expect(localStorage.getItem(`campusmind:12:${SEMESTER_CACHE_KEY}`)).toBeNull()
  })

  it('clears a failed save and does not report concurrent edits as successfully saved', async () => {
    const store = useSemesterStore()
    await store.load(12)
    const response = deferred<typeof activeSemester>()
    vi.mocked(saveSemester).mockReturnValueOnce(response.promise)
    const save = store.save({ start_date: '2026-08-31', total_weeks: 18 })
    const failed = expect(save).rejects.toThrow('offline')
    await expect(store.save({ start_date: '2026-08-31', total_weeks: 16 })).rejects.toThrow('正在保存')
    expect(saveSemester).toHaveBeenCalledTimes(1)
    response.reject(new Error('offline'))
    await failed
    expect(store.saving).toBe(false)
    expect(store.pendingSave).toBeNull()
    expect(store.totalWeeks).toBe(20)
    await store.load(12, true)
    expect(fetchSemester).toHaveBeenCalledTimes(2)
  })

  it('works in memory when browser storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage full') })
    vi.mocked(saveSemester).mockResolvedValue({ ...activeSemester, total_weeks: 18 })
    const store = useSemesterStore()
    await store.load(12)
    store.setBrowsingWeek(7)
    await store.save({ start_date: '2026-08-31', total_weeks: 18 })
    expect(store.browsingWeek).toBe(7)
    expect(store.totalWeeks).toBe(18)
  })

  it('uses current week only as the initial browsing week', async () => {
    const store = useSemesterStore()

    await store.load(12)
    expect(store.currentWeek).toBe(4)
    expect(store.browsingWeek).toBe(4)

    store.setBrowsingWeek(7)

    expect(store.currentWeek).toBe(4)
    expect(store.browsingWeek).toBe(7)
  })

  it('restores browsing week only for the same user', async () => {
    localStorage.setItem('campusmind:12:browsing-week', '9')
    localStorage.setItem('campusmind:13:browsing-week', '2')
    const store = useSemesterStore()

    await store.load(12)
    expect(store.browsingWeek).toBe(9)

    await store.load(13)
    expect(store.browsingWeek).toBe(2)
  })

  it('ignores an out-of-range cached week', async () => {
    localStorage.setItem('campusmind:12:browsing-week', '29')
    const store = useSemesterStore()

    await store.load(12)

    expect(store.browsingWeek).toBe(4)
  })

  it('clamps the browsing week after saving a shorter semester', async () => {
    vi.mocked(saveSemester).mockResolvedValue({
      status: 'active',
      start_date: '2026-08-31',
      total_weeks: 8,
      current_week: 4
    })
    const store = useSemesterStore()
    await store.load(12)
    store.setBrowsingWeek(18)

    await store.save({ start_date: '2026-08-31', total_weeks: 8 })

    expect(store.browsingWeek).toBe(8)
    expect(localStorage.getItem('campusmind:12:browsing-week')).toBe('8')
  })

  it('resets in-memory user state without deleting the browsing preference', async () => {
    const store = useSemesterStore()
    await store.load(12)
    store.setBrowsingWeek(7)

    store.reset()

    expect(store.semester).toBeNull()
    expect(store.loadedForUserId).toBeNull()
    expect(store.browsingWeek).toBe(1)
    expect(localStorage.getItem('campusmind:12:browsing-week')).toBe('7')
  })

  it('does not let a slow previous account overwrite the active account', async () => {
    const first = deferred<typeof activeSemester>()
    const second = deferred<typeof activeSemester>()
    vi.mocked(fetchSemester)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    localStorage.setItem('campusmind:12:browsing-week', '9')
    localStorage.setItem('campusmind:13:browsing-week', '2')
    const store = useSemesterStore()

    const firstLoad = store.load(12)
    const secondLoad = store.load(13)
    second.resolve({ ...activeSemester, current_week: 5 })
    await secondLoad
    first.resolve(activeSemester)
    await firstLoad

    expect(store.loadedForUserId).toBe(13)
    expect(store.currentWeek).toBe(5)
    expect(store.browsingWeek).toBe(2)
  })
})

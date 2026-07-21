import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchSemester, saveSemester } from '@/api/semester'
import { useSemesterStore } from './semester'

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
  const promise = new Promise<T>((resolver) => {
    resolve = resolver
  })
  return { promise, resolve }
}

describe('semester store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(fetchSemester).mockResolvedValue(activeSemester)
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

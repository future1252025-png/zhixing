import { webcrypto } from 'node:crypto'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { snapshotFixture } from '@/test/courseSnapshotFixture'
import { bindCoursePreview, readCourseSnapshot, saveCourseSnapshot, sessionFingerprint } from '@/utils/courseSnapshot'
import { setAccessToken } from '@/auth/sessionTokens'
import * as requests from '@/api/request'
import { useAuthStore } from './auth'
import { useCoursesStore } from './courses'
import { useSemesterStore } from './semester'

vi.mock('@/auth/sessionTokens', async importOriginal => ({
  ...await importOriginal<typeof import('@/auth/sessionTokens')>(),
  isNativeAuthClient: () => true,
  getRefreshToken: vi.fn(async () => 'secure-refresh-token'),
  setRefreshToken: vi.fn(async () => {})
}))
const user = { id: 7, student_id: 'startup-test', nickname: '同学', role: 'student', avatar_text: null, avatar_color: null, created_at: '2026-01-01T00:00:00Z' }

describe('native startup session isolation', () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    vi.stubGlobal('crypto', webcrypto)
    localStorage.clear()
    setAccessToken(null)
    setActivePinia(createPinia())
    saveCourseSnapshot(snapshotFixture())
    bindCoursePreview(user, await sessionFingerprint('secure-refresh-token'))
  })
  it('can display courses before the network resolves without granting authentication', async () => {
    let finish!: (v: requests.SessionRestoreResult) => void
    const restore = vi.spyOn(requests, 'restoreSession').mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const auth = useAuthStore()
    await auth.prepareLocalPreview()
    const pending = auth.restoreSession()
    expect(auth.preview?.courses[0]?.course_name).toBe('启动测试课程')
    expect(auth.restoring).toBe(true)
    expect(auth.isAuthenticated).toBe(false)
    const shared = auth.restoreSession()
    expect(restore).toHaveBeenCalledTimes(1)
    finish({ restored: false, user: null })
    await Promise.all([pending, shared])
    expect(auth.preview).not.toBeNull()
    expect(auth.isAuthenticated).toBe(false)
  })
  it('hydrates server data atomically and does not erase it when the reminder runtime attaches', async () => {
    const data = snapshotFixture()
    vi.spyOn(requests, 'restoreSession').mockResolvedValue({ restored: true, user, startup: data })
    setAccessToken('online-access')
    const auth = useAuthStore()
    await auth.restoreSession()
    const courses = useCoursesStore()
    courses.attachUser(7)
    expect(courses.loaded).toBe(true)
    expect(courses.lastFetchedAt).not.toBeNull()
    expect(useSemesterStore().semester?.start_date).toBe('2026-08-31')
    courses.attachUser(8)
    expect(courses.courses).toEqual([])
    expect(courses.loaded).toBe(false)
  })
  it('clears the preview and its persisted snapshot on rejected credentials', async () => {
    vi.spyOn(requests, 'restoreSession').mockResolvedValue({ restored: false, user: null, rejected: true })
    const auth = useAuthStore()
    await auth.prepareLocalPreview()
    await auth.restoreSession()
    expect(auth.preview).toBeNull()
    expect(readCourseSnapshot(7)).toBeNull()
  })
  it('does not resurrect a logged-out account when an old restore completes', async () => {
    let finish!: (v: requests.SessionRestoreResult) => void
    vi.spyOn(requests, 'restoreSession').mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const auth = useAuthStore()
    await auth.prepareLocalPreview()
    const pending = auth.restoreSession()
    auth.clearSession()
    finish({ restored: true, user, startup: snapshotFixture() })
    await pending
    expect(auth.currentUser).toBeNull()
    expect(auth.preview).toBeNull()
    expect(readCourseSnapshot(7)).toBeNull()
  })
})

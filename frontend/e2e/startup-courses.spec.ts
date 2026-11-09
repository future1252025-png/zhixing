import { expect, test, type Page } from '@playwright/test'

const user = { id: 7, student_id: 'startup-test', nickname: '同学', role: 'student', avatar_text: null, avatar_color: null, created_at: '2026-01-01T00:00:00Z' }
const startup = { version: 1, userId: 7, savedAt: Date.parse('2026-09-07T07:59:00+08:00'),
  semester: { status: 'active', start_date: '2026-08-31', total_weeks: 20, current_week: 2 },
  courses: [{ id: 1, course_name: '启动测试课程', weekday: 1, start_time: '09:00', end_time: '10:40',
    building_id: 2, building: { id: 2, name: '教二', type: '教学楼' }, room_name: '101', source_location: null,
    teacher: null, weeks: '1-20', source_kind: 'manual', needs_location_review: false, created_at: '2026-09-01T00:00:00Z' }] }

async function nativeSession(page: Page) {
  await page.clock.install({ time: new Date('2026-09-07T08:00:00+08:00') })
  await page.addInitScript(() => {
    const win = window as unknown as Record<string, unknown>
    win.androidBridge = {}
    win.Capacitor = {
      PluginHeaders: [{ name: 'SecureSession', methods: ['get', 'set', 'remove'].map(name => ({ name, rtype: 'promise' })) }],
      nativePromise: async (plugin: string, method: string, options?: { value: string }) => {
        if (plugin !== 'SecureSession') throw new Error('Unavailable test plugin')
        if (method === 'get') return { value: sessionStorage.getItem('test-refresh') ?? 'initial-secure-test-refresh-token' }
        if (method === 'set') sessionStorage.setItem('test-refresh', options!.value)
        if (method === 'remove') sessionStorage.setItem('test-refresh', '')
        return {}
      }
    }
  })
  await page.route('**/webapi.amap.com/**', r => r.abort())
}

for (const outcome of ['slow-success', 'offline', 'rejected'] as const) {
  test(`native startup shows local courses before ${outcome} refresh completes`, async ({ page }, testInfo) => {
    await nativeSession(page)
    let secondLaunch = false
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    let secondaryReads = 0
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/api/auth/refresh') {
        expect(route.request().postDataJSON()).toMatchObject({ client_kind: 'native', include_startup: true })
        if (secondLaunch) {
          await gate
          if (outcome === 'offline') { await route.abort(); return }
          if (outcome === 'rejected') { await route.fulfill({ status: 401, json: { detail: 'expired' } }); return }
        }
        const snapshot = secondLaunch ? { ...startup, courses: startup.courses.map(c => ({ ...c, course_name: '最新课程' })) } : startup
        await route.fulfill({ json: { access_token: 'test-access', refresh_token: secondLaunch ? 'rotated-token-two' : 'rotated-token-one', user, startup: snapshot } })
      } else if (path === '/api/courses' || path === '/api/semester') {
        secondaryReads++
        await route.fulfill({ json: path === '/api/courses' ? startup.courses : startup.semester })
      } else if (path === '/api/buildings') await route.fulfill({ json: [] })
      else await route.fulfill({ status: 404, json: {} })
    })
    await page.goto('/home')
    await expect(page.locator('.today-copy')).toContainText('启动测试课程')
    expect(secondaryReads).toBe(0)
    await expect.poll(() => page.evaluate(() => !!localStorage.getItem('campusmind:7:course-snapshot-v1'))).toBe(true)
    secondLaunch = true
    await page.reload()
    const preview = page.getByTestId('startup-course-card')
    await expect(preview).toContainText('启动测试课程', { timeout: 1500 })
    await expect(page.getByRole('status')).toContainText('正在同步')
    await expect(page.getByRole('button', { name: '进入地点频道' })).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('local-course-before-refresh.png') })
    release()
    if (outcome === 'slow-success') {
      await expect(page.locator('.today-copy')).toContainText('最新课程')
      await expect(preview).toHaveCount(0)
      expect(secondaryReads).toBe(0)
    } else if (outcome === 'offline') {
      await expect(page.getByRole('status')).toContainText('暂时无法连接')
      await expect(preview).toContainText('启动测试课程')
      await expect(page.getByRole('button', { name: '重新同步' })).toBeVisible()
    } else {
      await expect(preview).toHaveCount(0)
      await expect(page).toHaveURL(/\/login/)
      expect(await page.evaluate(() => localStorage.getItem('campusmind:7:course-snapshot-v1'))).toBeNull()
    }
  })
}

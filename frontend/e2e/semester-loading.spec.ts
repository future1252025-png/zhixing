import { expect, test } from '@playwright/test'
import fixture from '../../tests/fixtures/course-selection.json' with { type: 'json' }

function gate() {
  let release!: () => void
  const promise = new Promise<void>(resolve => { release = resolve })
  return { promise, release }
}

test('cached courses do not wait for maps or semester refresh on tab switches and restart', async ({ page }, testInfo) => {
  // Keep the first lesson upcoming even after the six-minute cache expiry.
  // Class-start switching is covered by course-clock; this test isolates loading.
  await page.clock.install({ time: new Date('2026-09-07T13:40:00+08:00') })
  const user = { id: 7, student_id: 'loading-test', nickname: '同学', role: 'user', avatar_text: null, avatar_color: null, created_at: '2026-01-01T00:00:00Z' }
  const building = { id: 1, name: '教4', type: '教学楼', description: '', latitude: 30.59, longitude: 114.33, map_x: 0, map_y: 0, walk_hint: null }
  let semesterGate = gate()
  const buildingsGate = gate()
  let failSemester = false
  let semesterRequests = 0
  let courseRequests = 0
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    let body: unknown
    if (path === '/api/auth/refresh') body = { access_token: 'loading-test-token', token_type: 'bearer', expires_in: 3600, user }
    else if (path === '/api/auth/me') body = user
    else if (path === '/api/buildings') { await buildingsGate.promise; body = [building] }
    else if (path === '/api/semester') {
      semesterRequests++
      await semesterGate.promise
      if (failSemester) { await route.fulfill({ status: 503, json: { detail: 'temporarily offline' } }); return }
      body = { status: 'active', start_date: '2026-08-31', total_weeks: 20, current_week: 2 }
    } else if (path === '/api/courses') {
      courseRequests++
      body = fixture.courses.map(course => ({ ...course, building_id: 1, building, room_name: '409', teacher: null,
        source_kind: 'manual', source_location: null, needs_location_review: false, created_at: '2026-01-01T00:00:00Z' }))
    } else if (path === '/api/reminders') body = { revision: 0, course_settings: { enabled: false, lead_minutes: 10, mode: 'vibrate' }, items: [] }
    else { await route.fulfill({ status: 404, json: {} }); return }
    await route.fulfill({ json: body })
  })
  try {
    await page.goto('/home')
    await expect(page.locator('.home-semester-loading')).toBeVisible()
    await expect.poll(() => semesterRequests).toBe(1)
    semesterGate.release()
    // The building response is still blocked here; the actual course must already be visible.
    await expect(page.locator('.today-copy')).toContainText(fixture.courses[0].course_name)
    expect(courseRequests).toBe(1)
    for (let i = 0; i < 2; i++) {
      await page.getByRole('link', { name: '课表', exact: true }).click()
      await expect(page.locator('.timetable-course').first()).toBeVisible()
      await expect(page.locator('.semester-loading')).toHaveCount(0)
      await page.getByRole('link', { name: '校园', exact: true }).click()
      await expect(page.locator('.today-copy')).toContainText(fixture.courses[0].course_name)
      await expect(page.locator('.home-semester-loading')).toHaveCount(0)
    }
    expect(semesterRequests).toBe(1)
    expect(courseRequests).toBe(1)
    buildingsGate.release()

    await page.clock.fastForward(6 * 60_000)
    semesterGate = gate()
    failSemester = true
    await page.getByRole('link', { name: '课表', exact: true }).click()
    await expect.poll(() => semesterRequests).toBe(2)
    await expect(page.locator('.semester-loading')).toHaveCount(0)
    await expect(page.locator('.timetable-course').first()).toBeVisible()
    await page.getByRole('link', { name: '校园', exact: true }).click()
    await expect(page.locator('.today-copy')).toContainText(fixture.courses[0].course_name)
    expect(semesterRequests).toBe(2)
    semesterGate.release()
    await expect(page.getByText('学期暂未同步，当前按已保存设置显示。')).toBeVisible()
    await expect(page.locator('.today-copy')).toContainText(fixture.courses[0].course_name)
    failSemester = false
    await page.locator('.sync-hint').getByRole('button', { name: '重试' }).click()
    await expect(page.getByText('学期暂未同步，当前按已保存设置显示。')).toHaveCount(0)

    // Restart restores only settings; course data still loads normally and the remote
    // settings refresh remains blocked. This must not freeze the cached teaching week.
    semesterGate = gate()
    await page.reload()
    await expect(page.locator('.today-copy')).toContainText(fixture.courses[0].course_name)
    await expect(page.locator('.home-semester-loading')).toHaveCount(0)
    await page.clock.setSystemTime(new Date('2026-09-14T14:09:00+08:00'))
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.locator('.today-copy')).toContainText('真实第 3 周')
    await expect(page.locator('.today-copy')).toContainText('JAVA应用开发')
    await page.getByRole('link', { name: '课表', exact: true }).click()
    await page.locator('#courseWeekSelect').selectOption('3')
    await expect(page.locator('.weekday-head.is-today')).toContainText('9/14')
    await expect(page.locator('.semester-loading')).toHaveCount(0)
    semesterGate.release()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false)
    await page.screenshot({ path: testInfo.outputPath('cached-timetable.png'), animations: 'disabled' })
  } finally {
    buildingsGate.release()
    semesterGate.release()
    await page.unrouteAll({ behavior: 'wait' })
  }
})

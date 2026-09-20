import { expect, test } from '@playwright/test'
import fixture from '../../tests/fixtures/course-selection.json' with { type: 'json' }

test('home week shortcut opens the actual week at its selector and does not pull back manual scrolling', async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date('2026-09-15T08:16:00+08:00') })
  await page.addInitScript(() => localStorage.setItem('campusmind:7:browsing-week', '9'))
  const user = { id: 7, student_id: 'shortcut-test', nickname: '同学', role: 'user', avatar_text: null, avatar_color: null, created_at: '2026-01-01T00:00:00Z' }
  const building = { id: 1, name: '教4', type: '教学楼', description: '', latitude: 30.59, longitude: 114.33, map_x: 0, map_y: 0, walk_hint: null }
  let semesterRequests = 0
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    let body: unknown
    if (path === '/api/auth/refresh') body = { access_token: 'shortcut-test-token', token_type: 'bearer', expires_in: 3600, user }
    else if (path === '/api/auth/me') body = user
    else if (path === '/api/buildings') body = [building]
    else if (path === '/api/semester') { semesterRequests++; body = { status: 'active', start_date: '2026-08-31', total_weeks: 20, current_week: 3 } }
    else if (path === '/api/courses') body = fixture.courses.map(course => ({ ...course, weeks: '1-16', building_id: 1, building,
      room_name: '409', teacher: null, source_kind: 'manual', source_location: null, needs_location_review: false, created_at: '2026-01-01T00:00:00Z' }))
    else if (path === '/api/reminders') body = { revision: 0, course_settings: { enabled: false, lead_minutes: 10, mode: 'vibrate' }, items: [] }
    else { await route.fulfill({ status: 404, json: {} }); return }
    await route.fulfill({ json: body })
  })
  await page.goto('/home')
  if (testInfo.project.name.startsWith('mobile')) {
    // Apply after the document exists, so this really exercises the APK safe-area CSS.
    await page.evaluate(() => document.documentElement.classList.add('capacitor-android'))
  }
  await expect(page.locator('.today-copy')).toContainText('真实第 3 周')
  await page.getByRole('button', { name: /本周课表/ }).click()
  await expect(page).toHaveURL(/\/courses#current-week$/)
  await expect(page.locator('#courseWeekSelect')).toHaveValue('3')
  await expect.poll(() => page.locator('#current-week').evaluate(el => Math.abs(el.getBoundingClientRect().top - parseFloat(getComputedStyle(el).scrollMarginTop)))).toBeLessThan(3)
  if (testInfo.project.name.startsWith('mobile')) {
    await expect.poll(() => page.locator('#current-week').evaluate(el => parseFloat(getComputedStyle(el).scrollMarginTop))).toBe(12)
  }
  await expect(page.locator('.timetable-course').first()).toBeVisible()
  expect(semesterRequests).toBe(1)
  await page.screenshot({ path: testInfo.outputPath('home-week-shortcut.png'), animations: 'disabled' })

  await page.locator('#courseWeekSelect').selectOption('4')
  await page.evaluate(() => {
    window.dispatchEvent(new Event('touchstart'))
    window.scrollBy({ top: 160, behavior: 'instant' })
  })
  const manualTop = await page.evaluate(() => scrollY)
  await page.waitForTimeout(700)
  expect(Math.abs(await page.evaluate(() => scrollY) - manualTop)).toBeLessThan(3)
  await expect(page.locator('#courseWeekSelect')).toHaveValue('4')

  // Browser back restores a previously browsed week/position, not the home shortcut.
  await page.getByRole('link', { name: '我的', exact: true }).click()
  await expect(page.locator('.profile-page')).toBeVisible()
  await page.goBack()
  await expect(page.locator('#courseWeekSelect')).toHaveValue('4')
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100)
  await page.getByRole('link', { name: '校园', exact: true }).click()
  await page.getByRole('link', { name: '课表', exact: true }).click()
  await expect(page).toHaveURL(/\/courses$/)
  await expect(page.locator('#courseWeekSelect')).toHaveValue('4')
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(3)
})

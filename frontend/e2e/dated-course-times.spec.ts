import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('dated time editor, timetable and home bell boundary agree', async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date('2026-09-07T13:50:00+08:00') })
  const user = { id: 71, student_id: 'dated-clocks', nickname: '测试同学', role: 'user', avatar_text: null, avatar_color: null, created_at: '2026-01-01T00:00:00Z' }
  let semester: any = { status: 'active', start_date: '2026-08-31', total_weeks: 20, current_week: 2, time_rules: [] }
  const base = { weekday: 1, weeks: '1-16', teacher: null, building_id: null, building: null, room_name: '教4-409', source_kind: 'import', source_location: '教4-409', needs_location_review: true, created_at: '2026-01-01T00:00:00Z' }
  const courses = [{ ...base, id: 1, course_name: '下午第一门', start_time: '14:00', end_time: '15:40' },
    { ...base, id: 2, course_name: 'JAVA应用开发', start_time: '15:55', end_time: '17:35' }]
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    let body: unknown
    if (path === '/api/auth/refresh') body = { access_token: 'dated-test-token', token_type: 'bearer', expires_in: 3600, user }
    else if (path === '/api/auth/me') body = user
    else if (path === '/api/semester') {
      if (route.request().method() === 'PUT') semester = { ...semester, ...route.request().postDataJSON() }
      body = semester
    } else if (path === '/api/courses') body = courses
    else if (path === '/api/buildings') body = []
    else if (path === '/api/reminders') body = { revision: 0, course_settings: { enabled: true, lead_minutes: 10, mode: 'vibrate' }, items: [] }
    else { await route.fulfill({ status: 404, json: {} }); return }
    await route.fulfill({ json: body })
  })
  await page.goto('/profile/semester')
  await page.getByRole('button', { name: '添加调整' }).click()
  await page.getByLabel('从哪天起').fill('2026-09-07')
  await page.getByRole('button', { name: '下午整体推迟 30 分钟' }).click()
  await expect(page.getByLabel('时段 1 新上课时间')).toHaveValue('14:30')
  await expect(page.getByLabel('时段 2 新上课时间')).toHaveValue('16:25')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('dated-time-editor.png'), fullPage: true, animations: 'disabled' })
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
  await page.getByRole('button', { name: '保存时间调整' }).click()
  await expect(page.locator('.rule-list')).toContainText('14:30–16:10')
  expect(semester.time_rules).toHaveLength(2)
  expect(courses[0]!.start_time).toBe('14:00')
  // Settings is a detail page: return to the profile before using the tab bar.
  await page.locator('.van-nav-bar__left').click()
  await expect(page).toHaveURL(/\/profile$/)
  await page.getByRole('link', { name: '课表', exact: true }).click()
  await page.locator('#courseWeekSelect').selectOption('1')
  // Wait for the old week's transition-out before inspecting the single grid.
  await expect(page.locator('.timetable-grid')).toHaveCount(1)
  await expect(page.locator('.timetable-grid')).toContainText('14:00')
  await page.locator('#courseWeekSelect').selectOption('2')
  await expect(page.locator('.timetable-grid')).toHaveCount(1)
  await expect(page.locator('.timetable-grid')).toContainText('14:30')
  await expect(page.locator('.timetable-grid')).toContainText('16:25')
  await page.screenshot({ path: testInfo.outputPath('dated-timetable.png'), fullPage: true, animations: 'disabled' })
  await page.getByRole('link', { name: '校园', exact: true }).click()
  await expect(page.locator('.today-copy')).toContainText('下午第一门')
  await page.clock.setSystemTime(new Date('2026-09-07T14:29:59+08:00'))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.locator('.today-copy')).toContainText('下午第一门')
  await page.clock.runFor(1000)
  await expect(page.locator('.today-copy')).toContainText('JAVA应用开发')
  await expect(page.locator('.today-copy')).not.toContainText('下午第一门')
})

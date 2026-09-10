import { expect, test } from '@playwright/test'
import fixture from '../../tests/fixtures/course-selection.json' with { type: 'json' }

// Runs on desktop + mobile viewport projects. API selection is independently
// covered by the same fixture in backend/tests/test_schedule.py.
test('ongoing course survives 14:09 and switches at the actual end, without reloading', async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date('2026-09-07T14:09:00+08:00') })
  const user = { id: 7, student_id: 'clock-test', nickname: '同学', role: 'user', avatar_text: null, avatar_color: null, created_at: '2026-01-01T00:00:00Z' }
  const building = { id: 1, name: '教4', type: '教学楼', description: '', latitude: 30.59, longitude: 114.33, map_x: 0, map_y: 0, walk_hint: null }
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    let body: unknown
    if (path === '/api/auth/refresh') body = { access_token: 'clock-test-token', token_type: 'bearer', expires_in: 3600, user }
    else if (path === '/api/auth/me') body = user
    else if (path === '/api/buildings') body = [building]
    else if (path === '/api/semester') body = { status: 'active', start_date: '2026-08-31', total_weeks: 20, current_week: 2 }
    else if (path === '/api/courses') body = fixture.courses.map((course) => ({
      ...course, building_id: 1, building, room_name: course.id === 1 ? '409(曼城)' : '503', teacher: null,
      source_kind: 'manual', source_location: null, needs_location_review: false, created_at: '2026-01-01T00:00:00Z'
    }))
    else { await route.fulfill({ status: 404, json: {} }); return }
    await route.fulfill({ json: body })
  })
  await page.goto('/home')
  const card = page.locator('.today-copy')
  await expect(card).toContainText('正在上课')
  await expect(card).toContainText(fixture.courses[0].course_name)
  await expect(card).not.toContainText('JAVA应用开发')
  await page.clock.pauseAt(new Date('2026-09-07T14:09:05+08:00'))
  await page.screenshot({ path: testInfo.outputPath('ongoing-1409.png'), animations: 'disabled' })
  await page.clock.fastForward(90 * 60_000 + 54_000)
  await expect(card).toContainText(fixture.courses[0].course_name)
  await page.clock.fastForward(1000)
  await expect(card).toContainText('JAVA应用开发')
  await expect(card).not.toContainText('正在上课')
})

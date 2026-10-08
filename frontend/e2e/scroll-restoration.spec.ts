import { expect, test, type Page } from '@playwright/test'

test.setTimeout(40_000)

async function setup(page: Page) {
  const user = { id: 7, student_id: 'scroll-test', nickname: '同学', role: 'student', avatar_text: null, avatar_color: null, created_at: '2026-01-01T00:00:00Z' }
  const building = { id: 1, name: '教4', type: '教学楼', description: '', latitude: 30.59, longitude: 114.33, map_x: 0, map_y: 0, walk_hint: null }
  const state = { delayRooms: false }
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Notification', { configurable: true, value: class {
      static permission = 'granted'
      static async requestPermission() { return 'granted' }
    } })
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(_ok: unknown, failure: (error: { code: number }) => void) { failure({ code: 1 }) }
    } })
  })
  await page.route('https://webapi.amap.com/**', route => route.abort())
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    let body: unknown
    if (path === '/api/auth/refresh') body = { access_token: 'scroll-test-token', token_type: 'bearer', expires_in: 3600, user }
    else if (path === '/api/auth/me') body = user
    else if (path === '/api/buildings') body = [building]
    else if (path === '/api/buildings/1') body = building
    else if (path === '/api/buildings/1/chatrooms') {
      if (state.delayRooms) await new Promise(resolve => setTimeout(resolve, 900))
      body = Array.from({ length: 70 }, (_, i) => ({ name: `A${201 + i}`, room_name: `A${201 + i}`, message_count: 0, is_general: false }))
    }
    else if (path === '/api/buildings/1/messages') body = []
    else if (path === '/api/semester') body = { status: 'active', start_date: '2026-08-31', total_weeks: 20, current_week: 3 }
    else if (path === '/api/courses') body = []
    else if (path === '/api/reminders') body = { revision: 0, course_settings: { enabled: false, lead_minutes: 10, mode: 'vibrate' }, items: [] }
    else { await route.fulfill({ status: 404, json: {} }); return }
    await route.fulfill({ json: body })
  })
  return state
}

async function settled(page: Page, selector: string) {
  await expect(page.locator(selector)).toBeVisible()
  await expect(page.locator(selector)).not.toHaveClass(/-(enter|leave)-active/)
  // Give the two-frame layout confirmation time to finish before a gesture.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

test('profile settings, browser history and tabs preserve the reading position', async ({ page }) => {
  await setup(page)
  await page.goto('/profile')
  await settled(page, '.profile-page')

  for (const path of ['/profile/semester', '/profile/notifications', '/privacy']) {
    const entry = page.locator(`.privacy-entry[href="${path}"]`)
    await entry.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
    const previousTop = await page.evaluate(() => scrollY)
    expect(previousTop).toBeGreaterThan(100)
    await entry.click()
    await expect(page).toHaveURL(new RegExp(path + '$'))
    await settled(page, `[data-route-scroll-key="${path}"]`)
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
    await page.locator('.van-nav-bar__left').click()
    await expect(page).toHaveURL(/\/profile$/)
    await expect.poll(() => page.evaluate(top => Math.abs(scrollY - top), previousTop)).toBeLessThan(3)
  }

  // A repeated tab tap after a new manual scroll must not replay an older snapshot.
  await page.evaluate(() => window.scrollBy({ top: 60, behavior: 'instant' }))
  const profileTop = await page.evaluate(() => scrollY)
  await page.getByRole('link', { name: '我的', exact: true }).click()
  await expect.poll(() => page.evaluate(top => Math.abs(scrollY - top), profileTop)).toBeLessThan(3)
  await page.getByRole('link', { name: '提醒', exact: true }).click()
  await settled(page, '.reminders-page')
  await page.evaluate(() => window.scrollTo({ top: 450, behavior: 'instant' }))
  const remindersTop = await page.evaluate(() => scrollY)
  expect(remindersTop).toBeGreaterThan(100)
  await page.getByRole('link', { name: '我的', exact: true }).click()
  await expect.poll(() => page.evaluate(top => Math.abs(scrollY - top), profileTop)).toBeLessThan(3)
  await page.goBack()
  await expect(page).toHaveURL(/\/reminders$/)
  await expect.poll(() => page.evaluate(top => Math.abs(scrollY - top), remindersTop)).toBeLessThan(3)
  await page.goForward()
  await expect(page).toHaveURL(/\/profile$/)
  await expect.poll(() => page.evaluate(top => Math.abs(scrollY - top), profileTop)).toBeLessThan(3)
})

test('returning to a slow channel directory retains its search and waits for content; gestures cancel restoration', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/buildings/1/chats')
  await settled(page, '.chatrooms-page')
  await page.getByRole('searchbox', { name: '搜索教室频道' }).fill('A2')
  const room = page.locator('.room-list > button').filter({ hasText: 'A240' })
  await room.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
  const directoryTop = await page.evaluate(() => scrollY)
  expect(directoryTop).toBeGreaterThan(1000)
  await room.click()
  await settled(page, '.message-page')
  state.delayRooms = true
  await page.goBack()
  await expect(page.locator('.channel-loading')).toBeVisible()
  await expect(page.getByRole('searchbox', { name: '搜索教室频道' })).toHaveValue('A2')
  await expect.poll(() => page.evaluate(top => Math.abs(scrollY - top), directoryTop)).toBeLessThan(3)

  await room.click()
  await settled(page, '.message-page')
  await page.goBack()
  await expect(page.locator('.channel-loading')).toBeVisible()
  // Explicit touch/scroll intent must win over an outstanding slow restoration.
  await page.evaluate(() => {
    window.dispatchEvent(new Event('touchstart'))
    window.scrollTo({ top: 0, behavior: 'instant' })
  })
  await expect(page.getByRole('searchbox', { name: '搜索教室频道' })).toHaveValue('A2')
  await settled(page, '.chatrooms-page')
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
})

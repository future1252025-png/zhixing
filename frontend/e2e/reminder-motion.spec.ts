import { expect, test, type Page } from '@playwright/test'

async function setupReminderMotion(page: Page, holdPlan = false) {
  await page.clock.setFixedTime(new Date('2026-09-15T08:16:00+08:00'))
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Notification', { configurable: true, value: class { static permission = 'granted' } })
    const events: string[] = []
    Object.assign(window, { reminderMotionEvents: events })
    document.addEventListener('animationstart', event => {
      if ((event.target as Element)?.closest('.reminders-page')) events.push(event.animationName)
    })
  })
  let releasePlan!: () => void
  const planReady = new Promise<void>(resolve => { releasePlan = resolve })
  if (!holdPlan) releasePlan()
  const user = { id: 7, student_id: 'motion-test', nickname: '同学', role: 'user', avatar_text: null, avatar_color: null, created_at: '2026-01-01T00:00:00Z' }
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    let body: unknown
    if (path === '/api/auth/refresh') body = { access_token: 'motion-test-token', token_type: 'bearer', expires_in: 3600, user }
    else if (path === '/api/auth/me') body = user
    else if (path === '/api/semester') body = { status: 'active', start_date: '2026-08-31', total_weeks: 20, current_week: 3 }
    else if (path === '/api/courses' || path === '/api/buildings') body = []
    else if (path === '/api/reminders') {
      await planReady
      body = { revision: 1, course_settings: { enabled: true, lead_minutes: 10, mode: 'vibrate' }, items: [] }
    } else { await route.fulfill({ status: 404, json: {} }); return }
    await route.fulfill({ json: body })
  })
  return releasePlan
}

const entranceEvents = (page: Page) => page.evaluate(() =>
  ((window as any).reminderMotionEvents as string[]).filter(name => /reminder-(arrive|chime|ring)/.test(name)))

test('reminder entrance is immediate, finite and only replays on a new visit', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const releasePlan = await setupReminderMotion(page, true)
  await page.goto('/courses')
  if (testInfo.project.name.startsWith('mobile')) await page.evaluate(() => document.documentElement.classList.add('capacitor-android'))
  await page.locator('.courses-page').waitFor()
  await page.getByRole('link', { name: '提醒', exact: true }).click()
  await expect(page.locator('.reminder-arrive')).toHaveCount(4)
  await expect.poll(async () => (await entranceEvents(page)).length).toBe(6)
  await expect(page.getByTestId('new-reminder')).toBeDisabled()
  await expect(page.getByText('正在取回你的提醒…')).toBeVisible()
  const surfaces = await page.locator('.reminder-arrive').evaluateAll(elements => elements.map(el => {
    const style = getComputedStyle(el)
    return { duration: style.animationDuration, delay: style.animationDelay, iterations: style.animationIterationCount }
  }))
  expect(surfaces.map(surface => surface.delay)).toEqual(['0s', '0.06s', '0.12s', '0.18s'])
  expect(surfaces.every(surface => surface.duration === '0.52s' && surface.iterations === '1')).toBe(true)
  await expect.poll(() => page.locator('.reminders-page').evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0)
  releasePlan()
  await expect(page.getByTestId('new-reminder')).toBeEnabled()
  expect(await entranceEvents(page)).toHaveLength(6)

  await page.getByTestId('new-reminder').click()
  await expect(page.getByRole('form', { name: '编辑提醒' })).toBeVisible()
  expect(await page.locator('.reminder-editor').evaluate(el => getComputedStyle(el).transform)).toBe('none')
  await page.getByRole('button', { name: '关闭提醒编辑', exact: true }).click()
  await expect(page.locator('.reminder-editor')).toHaveCount(0)
  expect(await entranceEvents(page)).toHaveLength(6)

  await page.getByRole('link', { name: '课表', exact: true }).click()
  await page.locator('.courses-page').waitFor()
  await page.getByRole('link', { name: '提醒', exact: true }).click()
  await expect.poll(async () => (await entranceEvents(page)).length).toBe(12)
  await expect.poll(() => page.locator('.reminders-page').evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0)
  await page.evaluate(() => { window.dispatchEvent(new Event('touchstart')); window.scrollTo({ top: 180, behavior: 'instant' }) })
  const scrollTop = await page.evaluate(() => scrollY)
  await page.waitForTimeout(700)
  expect(Math.abs(await page.evaluate(() => scrollY) - scrollTop)).toBeLessThan(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.screenshot({ path: testInfo.outputPath('reminder-motion-settled.png'), animations: 'disabled' })
})

test('reduced motion shows all cards immediately and opens the editor without smooth scrolling', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setupReminderMotion(page)
  await page.goto('/reminders')
  if (testInfo.project.name.startsWith('mobile')) await page.evaluate(() => document.documentElement.classList.add('capacitor-android'))
  await expect(page.getByTestId('new-reminder')).toBeEnabled()
  const styles = await page.locator('.reminder-arrive, .bell-chime').evaluateAll(elements => elements.map(el => ({
    animation: getComputedStyle(el).animationName, opacity: getComputedStyle(el).opacity, transform: getComputedStyle(el).transform
  })))
  expect(styles).toHaveLength(5)
  expect(styles.every(style => style.animation === 'none' && style.opacity === '1' && style.transform === 'none')).toBe(true)
  expect(await page.locator('.bell-art').evaluate(el => getComputedStyle(el, '::after').animationName)).toBe('none')
  expect(await page.getByTestId('new-reminder').evaluate(el => getComputedStyle(el).transitionProperty)).toBe('none')
  await page.evaluate(() => {
    const scroll = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = function(options) {
      Object.assign(window, { reminderEditorScroll: options })
      scroll.call(this, options)
    }
  })
  await page.getByTestId('new-reminder').click()
  await expect(page.getByRole('form', { name: '编辑提醒' })).toBeVisible()
  expect(await page.evaluate(() => (window as any).reminderEditorScroll)).toEqual({ block: 'start', behavior: 'instant' })
  expect(await page.locator('.reminder-editor').evaluate(el => getComputedStyle(el).animationName)).toBe('none')
  expect(await entranceEvents(page)).toHaveLength(0)
  await page.screenshot({ path: testInfo.outputPath('reminder-motion-reduced.png'), animations: 'disabled' })
})

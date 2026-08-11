import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const fixturePath = resolve(currentDir, 'fixtures/import-schedule.html')
const password = 'e2e-pass-2026'
const fullManualRoom = '东区三层 A101 交互设计实验室'

async function settleMotion(page: Page): Promise<void> {
  await page.waitForTimeout(1100)
}

async function screenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await settleMotion(page)
  await page.screenshot({ path: testInfo.outputPath(name) })
}

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  expect(results.violations).toEqual([])
}

async function expectReadableControls(page: Page): Promise<void> {
  const problems = await page.locator('button:visible').evaluateAll((buttons) =>
    buttons.flatMap((button) => {
      const element = button as HTMLButtonElement
      const rect = element.getBoundingClientRect()
      const text = (element.innerText || element.getAttribute('aria-label') || '').trim()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      let centerIsClipped = false
      let ancestor = element.parentElement
      while (ancestor) {
        const style = getComputedStyle(ancestor)
        if (/(auto|scroll|hidden|clip)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`)) {
          const ancestorRect = ancestor.getBoundingClientRect()
          if (
            centerX < ancestorRect.left || centerX > ancestorRect.right ||
            centerY < ancestorRect.top || centerY > ancestorRect.bottom
          ) {
            centerIsClipped = true
            break
          }
        }
        ancestor = ancestor.parentElement
      }
      const controlIsFullyInViewport =
        rect.left >= 0 && rect.right <= window.innerWidth &&
        rect.top >= 0 && rect.bottom <= window.innerHeight
      const center = controlIsFullyInViewport && !centerIsClipped
        ? document.elementFromPoint(centerX, centerY)
        : null
      const coveringTabbar = center?.closest('.app-tabbar')
      const tabbarTop = coveringTabbar?.getBoundingClientRect().top ?? window.innerHeight
      const requiredScrollToClearTabbar = Math.max(0, centerY - tabbarTop + rect.height / 2 + 8)
      const documentHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      )
      const remainingScroll = Math.max(0, documentHeight - window.innerHeight - window.scrollY)
      const canScrollClearTabbar = Boolean(
        coveringTabbar && remainingScroll >= requiredScrollToClearTabbar
      )
      const issues: string[] = []
      if (!text) issues.push('缺少可读文字或 aria-label')
      if (rect.height < 40) issues.push(`高度只有 ${rect.height.toFixed(1)}px`)
      if (element.innerText.trim() && rect.width < 44) issues.push(`宽度只有 ${rect.width.toFixed(1)}px`)
      if (
        center
        && center !== element
        && !element.contains(center)
        && !center.closest('.van-nav-bar, .van-toast, .van-overlay')
        && !canScrollClearTabbar
      ) {
        issues.push('中心被其他元素遮挡')
      }
      return issues.map((issue) => `${text || element.outerHTML.slice(0, 60)}：${issue}`)
    })
  )
  expect(problems).toEqual([])
}

async function assertPageQuality(page: Page): Promise<void> {
  await settleMotion(page)
  await expectReadableControls(page)
  await expectAccessible(page)
}

async function fillCourseForm(page: Page, courseName: string): Promise<void> {
  await page.locator('.van-field').filter({ hasText: '课程名称' }).locator('input').fill(courseName)
  await page.getByLabel('星期', { exact: true }).selectOption('1')
  await page.locator('.van-field').filter({ hasText: '上课周次' }).locator('input').fill('1-16')
  await page.locator('.van-field').filter({ hasText: '开始时间' }).locator('input').fill('09:00')
  await page.locator('.van-field').filter({ hasText: '结束时间' }).locator('input').fill('10:40')
  await page.locator('.building-picker .picker-trigger').click()
  await page.locator('.picker-sheet .sheet-search input').fill('国际教育学院')
  await page.locator('.picker-sheet .sheet-option', { hasText: '国际教育学院' }).first().click()
  await page.locator('.van-field').filter({ hasText: /^教室/ }).locator('input').fill(fullManualRoom)
}

test('core journey keeps weeks, locations, sessions, text, and actions trustworthy', async ({ page }, testInfo) => {
  const projectSuffix = testInfo.project.name.startsWith('mobile') ? 'mobile' : 'desktop'
  const username = `e2e_student_${projectSuffix}`
  const studentId = `E2E2026${projectSuffix === 'mobile' ? '002' : '001'}`
  await page.clock.install({ time: new Date('2026-09-21T07:00:00+08:00') })
  await page.goto('/login')
  await screenshot(page, testInfo, 'login.png')
  await assertPageQuality(page)

  await page.getByRole('button', { name: /创建账号/ }).click()
  await page.waitForURL('**/register')
  await page.locator('input[name="nickname"]').fill('端到端同学')
  await page.locator('input[name="username"]').fill(username)
  await page.locator('input[name="student_id"]').fill(studentId)
  await page.locator('input[name="password"]').fill(password)
  await page.locator('input[name="confirm_password"]').fill(password)
  await page.getByRole('button', { name: /创建账号/ }).click()
  await page.waitForURL('**/home')

  await expect(page.getByText('请先设置学期')).toBeVisible()
  await screenshot(page, testInfo, 'semester-unconfigured.png')
  await assertPageQuality(page)

  await page.getByRole('link', { name: '课表', exact: true }).click()
  await page.waitForURL('**/courses')
  await page.locator('input[name="start_date"]').fill('2026-08-31')
  await page.locator('input[name="total_weeks"]').fill('20')
  await page.getByRole('button', { name: '保存学期设置' }).click()
  await expect(page.getByText('真实当前周：第 4 周')).toBeVisible()

  await page.goto('/courses/new')
  await fillCourseForm(page, '交互设计基础')
  const createResponse = page.waitForResponse((response) =>
    response.url().endsWith('/api/courses') && response.request().method() === 'POST'
  )
  await page.getByRole('button', { name: '添加到我的课表' }).click()
  expect((await createResponse).status()).toBe(201)
  await page.waitForURL('**/courses')
  await expect(page.getByText('交互设计基础').first()).toBeVisible()
  await expect(page.getByText(`国际教育学院 · ${fullManualRoom}`)).toBeVisible()

  await page.goto('/courses/new')
  await fillCourseForm(page, '不应写入的冲突课程')
  const conflictResponse = page.waitForResponse((response) =>
    response.url().endsWith('/api/courses') && response.request().method() === 'POST'
  )
  await page.getByRole('button', { name: '添加到我的课表' }).click()
  expect((await conflictResponse).status()).toBe(409)
  await expect(page.getByRole('alert')).toContainText('这段时间已有课程')
  await expect(page.getByRole('alert')).toContainText('交互设计基础')
  await page.goto('/courses')
  await expect(page.getByText('交互设计基础').first()).toBeVisible()
  await expect(page.getByText('不应写入的冲突课程')).toHaveCount(0)

  await page.goto('/courses/import')
  await expect(page.getByTestId('hubu-native-import')).toBeDisabled()
  await expect(page.locator('.hubu-import-sheet')).toContainText('需安卓 App')
  await expect(page.locator('.privacy-note')).toContainText('不读取密码，不导出登录 Cookie')
  await expect(page.locator('.hubu-browser-link')).toHaveAttribute(
    'href',
    'https://jwxt.hubu.edu.cn/jsxsd/'
  )
  await page.locator('input[type="file"]').setInputFiles(fixturePath)
  await page.getByTestId('preview-import').click()
  const importPreview = page.locator('.candidate-preview').filter({ hasText: '自然语言处理' })
  await expect(importPreview.getByText('教4', { exact: true })).toBeVisible()
  await expect(importPreview).toContainText('地点会照原文导入，不影响课表查看')
  await importPreview.scrollIntoViewIfNeeded()
  await screenshot(page, testInfo, 'import-direct-preview.png')
  await expect(page.getByTestId('commit-import')).toBeEnabled()
  await page.getByTestId('commit-import').click()
  await expect(page.getByText('1 门课程已覆盖导入')).toBeVisible()
  await page.getByTestId('view-courses').click()
  await page.waitForURL('**/courses')

  const manualCourseCard = page.locator('.timetable-course').filter({ hasText: '交互设计基础' })
  const importedCourseCard = page.locator('.timetable-course').filter({ hasText: '自然语言处理' })
  await expect(manualCourseCard).toHaveCount(0)
  await expect(importedCourseCard).toHaveCount(1)
  await expect(importedCourseCard.getByText('教4', { exact: true })).toBeVisible()
  await expect(importedCourseCard.locator('time')).toHaveCount(0)

  // 整批导入按产品规则覆盖原课表。覆盖行为确认后，再添加一门手工课，
  // 继续验证课程布局、首页摘要和出发建议这条完整用户链路。
  await page.goto('/courses/new')
  await fillCourseForm(page, '交互设计基础')
  const recreateResponse = page.waitForResponse((response) =>
    response.url().endsWith('/api/courses') && response.request().method() === 'POST'
  )
  await page.getByRole('button', { name: '添加到我的课表' }).click()
  expect((await recreateResponse).status()).toBe(201)
  await page.waitForURL('**/courses')
  await expect(manualCourseCard).toHaveCount(1)
  await expect(manualCourseCard.getByText(`国际教育学院 · ${fullManualRoom}`)).toBeVisible()
  await expect(manualCourseCard.locator('time')).toHaveText('09:00—10:40')
  await expect(page.locator('.course-place-index')).toHaveCount(0)
  await settleMotion(page)
  await expect(page.locator('.week-head .weekday-head')).toHaveCount(7)
  await expect(page.locator('.week-head time')).toHaveText([
    '8/31', '9/1', '9/2', '9/3', '9/4', '9/5', '9/6'
  ])
  await expect(page.locator('.timetable-slot').first().locator('.course-cell')).toHaveCount(7)
  await expect(page.locator('.week-head .weekday-head:visible')).toHaveCount(7)
  const timetableMetrics = await page.locator('.timetable-viewport').evaluate((viewport) => ({
    clientWidth: viewport.clientWidth,
    scrollWidth: viewport.scrollWidth,
    firstDayWidth: viewport.querySelector('.weekday-head')?.getBoundingClientRect().width ?? 0
  }))
  if (projectSuffix === 'mobile') {
    expect(timetableMetrics.scrollWidth).toBeGreaterThan(timetableMetrics.clientWidth + 100)
    expect(timetableMetrics.firstDayWidth).toBeGreaterThanOrEqual(90)
    await expect(page.locator('.timetable-scroll-hint')).toBeVisible()
    const sundayIsReachable = await page.locator('.timetable-viewport').evaluate((viewport) => {
      viewport.scrollLeft = viewport.scrollWidth
      const sunday = viewport.querySelectorAll('.weekday-head')[6]?.getBoundingClientRect()
      const bounds = viewport.getBoundingClientRect()
      return Boolean(sunday && sunday.left >= bounds.left - 1 && sunday.right <= bounds.right + 1)
    })
    expect(sundayIsReachable).toBe(true)
  } else {
    expect(timetableMetrics.scrollWidth).toBeLessThanOrEqual(timetableMetrics.clientWidth + 1)
    await expect(page.locator('.timetable-scroll-hint')).toBeHidden()
  }
  const timetableBounds = await page.locator('.timetable-shell').evaluate((timetable) => {
    const bounds = timetable.getBoundingClientRect()
    return { left: bounds.left, right: bounds.right, viewportWidth: window.innerWidth }
  })
  expect(timetableBounds.left).toBeGreaterThanOrEqual(-1)
  expect(timetableBounds.right).toBeLessThanOrEqual(timetableBounds.viewportWidth + 1)
  const coursePalette = await page.locator('.timetable-course').evaluateAll((cards) =>
    cards.map((card) => ({
      subject: card.querySelector('strong')?.textContent?.trim() ?? '',
      accent: getComputedStyle(card).getPropertyValue('--course-accent').trim(),
      background: getComputedStyle(card).backgroundImage
    }))
  )
  const subjectAccents = new Map<string, Set<string>>()
  for (const entry of coursePalette) {
    const accents = subjectAccents.get(entry.subject) ?? new Set<string>()
    accents.add(entry.accent)
    subjectAccents.set(entry.subject, accents)
  }
  expect([...subjectAccents.values()].every((accents) => accents.size === 1)).toBe(true)
  expect(new Set(coursePalette.map((entry) => entry.accent)).size).toBe(subjectAccents.size)
  expect(new Set(coursePalette.map((entry) => entry.background)).size).toBe(subjectAccents.size)
  const courseCardHeights = await page.locator('.timetable-course').evaluateAll((cards) =>
    cards.map((card) => Math.round(card.getBoundingClientRect().height))
  )
  expect(new Set(courseCardHeights).size).toBe(1)
  const overflowingCourseCards = await page.locator('.course-content').evaluateAll((cards) =>
    cards
      .filter((card) => card.scrollHeight > card.clientHeight + 2)
      .map((card) => card.getAttribute('aria-label'))
  )
  expect(overflowingCourseCards).toEqual([])
  await importedCourseCard.getByText('教4', { exact: true }).scrollIntoViewIfNeeded()
  await screenshot(page, testInfo, 'course-list.png')
  await assertPageQuality(page)

  await importedCourseCard.locator('.course-content').click()
  await expect(page.locator('.van-action-sheet__description')).toHaveText('教师：周老师 · 教4')
  await page.getByRole('button', { name: /查看地点/ }).click()
  await page.waitForURL('**/buildings/**')
  await page.goBack()
  await page.waitForURL('**/courses')

  await settleMotion(page)
  await page.evaluate(() => {
    document.querySelector('#courseWeekSelect')?.scrollIntoView({ block: 'center' })
  })
  const scrollBeforeWeekChange = await page.evaluate(() => window.scrollY)
  await page.locator('#courseWeekSelect').selectOption('9')
  await expect(page.locator('.week-forward-enter-active')).toHaveCount(1)
  const weekAnimationDuration = await page.locator('.week-forward-enter-active').evaluate((stage) =>
    Math.max(...getComputedStyle(stage).transitionDuration.split(',').map((duration) => {
      const value = Number.parseFloat(duration)
      return duration.trim().endsWith('ms') ? value : value * 1000
    }))
  )
  expect(weekAnimationDuration).toBeGreaterThanOrEqual(1100)
  await expect(page.locator('.timetable-week-stage[data-week="9"]')).toBeVisible()
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBeforeWeekChange)
  await settleMotion(page)
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBeforeWeekChange)
  await expect(page.getByText('浏览第 9 周').first()).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.getByRole('link', { name: /校园/ }).click()
  await page.waitForURL('**/home')
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await expect(page.getByText('真实第 4 周')).toBeVisible()
  await expect(page.getByText('交互设计基础').first()).toBeVisible()
  await expect(page.getByText('浏览周课程')).toHaveCount(0)
  await screenshot(page, testInfo, 'home-current-week.png')
  await assertPageQuality(page)

  const prefixedPlaceNames = await page.locator('.place-grid strong').allTextContents()
  expect(prefixedPlaceNames.filter((name) => name.trim().startsWith('湖北大学'))).toEqual([])
  const homeMap = page.locator('.map-section')
  await homeMap.scrollIntoViewIfNeeded()
  await homeMap.getByPlaceholder('搜索地点、学院、食堂、公寓').fill('国际教育学院')
  await expect(homeMap.locator('.map-search-results')).toContainText('国际教育学院')
  await expect(homeMap.locator('.map-search-results')).not.toContainText('湖北大学')
  await screenshot(page, testInfo, 'home-map-concise-names.png')

  await page.getByRole('link', { name: /出发/ }).click()
  await page.waitForURL('**/schedule')
  await page.getByRole('button', { name: /看看什么时候出发/ }).click()
  await expect(page.getByText(`国际教育学院 · ${fullManualRoom}`)).toBeVisible()
  await page.getByText(`国际教育学院 · ${fullManualRoom}`).scrollIntoViewIfNeeded()
  await screenshot(page, testInfo, 'departure-advice.png')
  await assertPageQuality(page)

  // Access tokens are memory-only; a reload must silently restore the session
  // from the rotating HttpOnly refresh cookie.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('campusmind_token')))
    .toBeNull()
  await page.reload()
  await page.waitForURL('**/schedule')
  await expect(page.getByRole('heading', { name: '你现在在哪里？' })).toBeVisible()

  // Revoke the refresh family through the cookie-authenticated logout route,
  // then reload to verify that the app cannot silently recreate a session.
  await page.evaluate(async () => {
    await fetch('http://127.0.0.1:8010/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    })
  })
  await page.reload()
  await page.waitForURL('**/login?**')
  await screenshot(page, testInfo, 'session-expired.png')

  await page.locator('input[name="username"]').fill(username)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: /进入智行/ }).click()
  await page.waitForURL('**/schedule')
  await expect(page.getByRole('heading', { name: '你现在在哪里？' })).toBeVisible()
  await expectReadableControls(page)
})

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const fixturePath = resolve(currentDir, 'fixtures/import-schedule.html')
const username = 'e2e_student'
const password = 'e2e-pass-2026'
const fullManualRoom = '东区三层 A101 交互设计实验室'
const fullImportRoom = 'A座四层 423-425 数据中国实验室 1'

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
      const center = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      const issues: string[] = []
      if (!text) issues.push('缺少可读文字或 aria-label')
      if (rect.height < 40) issues.push(`高度只有 ${rect.height.toFixed(1)}px`)
      if (element.innerText.trim() && rect.width < 44) issues.push(`宽度只有 ${rect.width.toFixed(1)}px`)
      if (
        center
        && center !== element
        && !element.contains(center)
        && !center.closest('.app-tabbar, .van-toast, .van-overlay')
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
  await page.getByLabel('选择星期').selectOption('1')
  await page.locator('.van-field').filter({ hasText: '上课周次' }).locator('input').fill('1-16')
  await page.locator('.van-field').filter({ hasText: '开始时间' }).locator('input').fill('09:00')
  await page.locator('.van-field').filter({ hasText: '结束时间' }).locator('input').fill('10:40')
  await page.locator('.building-search input').fill('国际教育学院')
  await page.getByLabel('选择上课建筑').selectOption({
    label: '湖北大学武昌校区国际教育学院'
  })
  await page.locator('.van-field').filter({ hasText: /^教室/ }).locator('input').fill(fullManualRoom)
}

test('mobile core journey keeps weeks, locations, sessions, text, and actions trustworthy', async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date('2026-09-21T07:00:00+08:00') })
  await page.goto('/login')
  await screenshot(page, testInfo, 'login.png')
  await assertPageQuality(page)

  await page.getByRole('button', { name: /创建账号/ }).click()
  await page.waitForURL('**/register')
  await page.locator('input[name="nickname"]').fill('端到端同学')
  await page.locator('input[name="username"]').fill(username)
  await page.locator('input[name="student_id"]').fill('E2E2026001')
  await page.locator('input[name="password"]').fill(password)
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
  await expect(page.getByText(`湖北大学武昌校区国际教育学院 · ${fullManualRoom}`)).toBeVisible()

  await page.goto('/courses/new')
  await fillCourseForm(page, '不应写入的冲突课程')
  const conflictResponse = page.waitForResponse((response) =>
    response.url().endsWith('/api/courses') && response.request().method() === 'POST'
  )
  await page.getByRole('button', { name: '添加到我的课表' }).click()
  expect((await conflictResponse).status()).toBe(409)
  await expect(page.getByRole('alert')).toContainText('这段时间已有课程')
  await expect(page.getByRole('alert')).toContainText('交互设计基础')
  const coursesAfterConflict = await page.evaluate(async () => {
    const token = localStorage.getItem('campusmind_token')
    const response = await fetch('http://127.0.0.1:8010/api/courses', {
      headers: { Authorization: `Bearer ${token}` }
    })
    return response.json() as Promise<Array<{ course_name: string }>>
  })
  expect(coursesAfterConflict.filter((course) => course.course_name === '交互设计基础')).toHaveLength(1)
  expect(coursesAfterConflict.some((course) => course.course_name === '不应写入的冲突课程')).toBe(false)

  await page.goto('/courses/import')
  await page.locator('input[type="file"]').setInputFiles(fixturePath)
  await page.getByTestId('preview-import').click()
  await expect(page.getByTestId('raw-location')).toHaveText('教4')
  await page.getByTestId('raw-location').scrollIntoViewIfNeeded()
  await screenshot(page, testInfo, 'import-needs-resolution.png')
  await page.locator('input[name="room_name"]').fill(fullImportRoom)
  const buildingSelect = page.locator('select[name="building_id"]')
  if (!(await buildingSelect.inputValue())) {
    await buildingSelect.selectOption({ label: '湖北大学(武昌主校区)-教4' })
  }
  await expect(page.getByTestId('commit-import')).toBeEnabled()
  await page.getByTestId('commit-import').click()
  await expect(page.getByText('1 门课程已完整导入')).toBeVisible()
  await page.getByTestId('view-courses').click()
  await page.waitForURL('**/courses')

  await expect(page.getByText(`湖北大学武昌校区国际教育学院 · ${fullManualRoom}`)).toBeVisible()
  await expect(page.getByText(`湖北大学(武昌主校区)-教4 · ${fullImportRoom}`)).toBeVisible()
  await page.getByText(`湖北大学(武昌主校区)-教4 · ${fullImportRoom}`).scrollIntoViewIfNeeded()
  await screenshot(page, testInfo, 'course-list.png')
  await assertPageQuality(page)

  await page.locator('#courseWeekSelect').selectOption('9')
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

  await page.getByRole('link', { name: /出发/ }).click()
  await page.waitForURL('**/schedule')
  await page.getByRole('button', { name: /看看什么时候出发/ }).click()
  await expect(page.getByText(`湖北大学武昌校区国际教育学院 · ${fullManualRoom}`)).toBeVisible()
  await page.getByText(`湖北大学武昌校区国际教育学院 · ${fullManualRoom}`).scrollIntoViewIfNeeded()
  await screenshot(page, testInfo, 'departure-advice.png')
  await assertPageQuality(page)

  await page.evaluate(() => localStorage.setItem('campusmind_token', 'invalid-e2e-token'))
  await page.getByRole('link', { name: /校园/ }).click()
  await page.waitForURL('**/login?**')
  const expiredToasts = page.locator('.van-toast').filter({ hasText: '登录已过期，请重新登录' })
  await expect(expiredToasts).toHaveCount(1)
  await screenshot(page, testInfo, 'session-expired.png')

  await page.locator('input[name="username"]').fill(username)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: /进入智行/ }).click()
  await page.waitForURL('**/home')
  await expect(page.getByText('真实第 4 周')).toBeVisible()
  await expectReadableControls(page)
})

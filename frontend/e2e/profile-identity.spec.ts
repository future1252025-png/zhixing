import { expect, test } from '@playwright/test'

const password = 'identity-pass-2026'

test('student id is the single login identity and stays readable on a phone', async ({ context, page }, testInfo) => {
  const isMobile = testInfo.project.name.startsWith('mobile')
  const studentId = testInfo.project.name === 'mobile-webkit'
    ? '999999999999993' : isMobile ? '999999999999991' : '999999999999992'

  await context.clearCookies()
  await page.addInitScript(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.goto('/login')
  const studentIdField = page.locator('.van-field').filter({ hasText: '学号' })
  await expect(studentIdField).toBeVisible()
  await expect(studentIdField.locator('input')).toHaveAttribute('placeholder', '输入学号')
  const loginInputWidth = await studentIdField.locator('input').evaluate(
    (input) => input.getBoundingClientRect().width
  )
  expect(loginInputWidth).toBeGreaterThanOrEqual(120)

  await page.getByRole('button', { name: /创建账号/ }).click()
  await page.waitForURL('**/register')
  await expect(page.locator('.gentle-note')).toContainText('昵称用于个人页展示')
  await expect(page.locator('input[name="student_id"]')).toHaveCount(1)
  await expect(page.locator('input[name="username"]')).toHaveCount(0)

  await page.locator('input[name="nickname"]').fill('future')
  await page.locator('input[name="student_id"]').fill(studentId)
  await page.locator('input[name="password"]').fill(password)
  await page.locator('input[name="confirm_password"]').fill(password)
  await page.getByRole('button', { name: /创建账号/ }).click()
  await page.waitForURL('**/home')

  await page.goto('/profile')
  await expect(page.locator('.profile-copy h1')).toHaveText('future')
  await expect(page.locator('.profile-copy')).toContainText('个人页昵称')
  await expect(page.locator('.account-list article')).toHaveCount(2)
  await expect(page.locator('.student-identity-row')).toContainText(studentId)
  await expect(page.locator('.student-identity-row')).toContainText('用于登录智行')
  await expect(page.locator('.account-list')).not.toContainText('登录账号')
  await expect(page.locator('.account-list')).not.toContainText('相同')
  await expect(page.locator('.account-list')).not.toContainText('不同')
  await expect(page.locator('.account-list')).toContainText('学生')

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    const studentIdLayout = await page.locator('.student-id-stat strong').evaluate((element) => {
      const hero = element.closest('.profile-hero')
      if (!(hero instanceof HTMLElement)) throw new Error('profile hero not found')
      const range = document.createRange()
      range.selectNodeContents(element)
      const textBounds = range.getBoundingClientRect()
      const heroBounds = hero.getBoundingClientRect()
      return {
        text: element.textContent?.trim() ?? '',
        lineCount: range.getClientRects().length,
        textLeft: textBounds.left,
        textRight: textBounds.right,
        heroLeft: heroBounds.left,
        heroRight: heroBounds.right
      }
    })

    expect(studentIdLayout.text).toBe(studentId)
    expect(studentIdLayout.lineCount).toBe(1)
    expect(studentIdLayout.textLeft).toBeGreaterThanOrEqual(studentIdLayout.heroLeft)
    expect(studentIdLayout.textRight).toBeLessThanOrEqual(studentIdLayout.heroRight)
  }
})

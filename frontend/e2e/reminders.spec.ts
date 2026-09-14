import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('reminder center replaces navigation and persists courses, custom actions and notifications', async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date('2026-09-21T14:09:00+08:00') })
  await page.addInitScript(() => {
    const state = { notifications: [] as string[], vibrations: 0 }
    Object.assign(window, { reminderTest: state })
    class TestNotification {
      static permission = localStorage.getItem('e2e-notification-permission') || 'default'
      static async requestPermission() { this.permission = 'granted'; localStorage.setItem('e2e-notification-permission', 'granted'); return 'granted' }
      onclick = null
      constructor(title: string) { state.notifications.push(title) }
      close() {}
    }
    Object.defineProperty(window, 'Notification', { configurable: true, value: TestNotification })
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => { state.vibrations++; return true } })
  })
  const credentials = { student_id: `reminders-${testInfo.project.name}`, password: 'e2e-reminder-pass-2026' }
  expect((await page.request.post('http://127.0.0.1:8010/api/auth/register', {
    data: { ...credentials, nickname: '提醒回归同学' }
  })).ok()).toBeTruthy()
  const login = await page.request.post('http://127.0.0.1:8010/api/auth/login', { data: credentials })
  expect(login.ok()).toBeTruthy()
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` }
  expect((await page.request.put('http://127.0.0.1:8010/api/semester', {
    headers, data: { start_date: '2026-08-31', total_weeks: 20 }
  })).ok()).toBeTruthy()
  expect((await page.request.post('http://127.0.0.1:8010/api/courses', { headers,
    data: { course_name: '思想概论', weekday: 1, start_time: '14:30', end_time: '16:10',
      building_id: 1, room_name: '409', teacher: '杨老师', weeks: '1-16' }
  })).ok()).toBeTruthy()
  for (const [weekday, course_name] of [[2, '次日 JAVA 回归课程'], [3, '后日算法回归课程']] as const) {
    expect((await page.request.post('http://127.0.0.1:8010/api/courses', { headers,
      data: { course_name, weekday, start_time: '15:55', end_time: '17:35', building_id: 1,
        room_name: '503', teacher: '测试老师', weeks: '1-16' }
    })).ok()).toBeTruthy()
  }

  // Existing bookmarks remain valid, but the old walking/navigation UI is gone.
  await page.goto('/schedule')
  await expect(page).toHaveURL(/\/reminders$/)
  await expect(page.getByRole('heading', { name: '课程提醒', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /生成出行建议|步行规划/ })).toHaveCount(0)
  await expect(page.locator('.real-campus-map')).toHaveCount(0)
  const permissionPrompt = page.getByRole('dialog', { name: '开启通知提醒' })
  await expect(permissionPrompt).toBeVisible()
  await expect(page.locator('.device-notice')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('notification-permission-prompt.png'), animations: 'disabled' })
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([])
  await permissionPrompt.getByRole('button', { name: '暂不开启' }).click()
  await expect(permissionPrompt).not.toBeVisible()
  await page.getByRole('switch', { name: '课程提醒' }).click()
  await expect(permissionPrompt).toBeVisible()
  await permissionPrompt.getByRole('button', { name: '开启通知', exact: true }).click()
  await expect(permissionPrompt).not.toBeVisible()
  await expect(page.getByRole('switch', { name: '课程提醒' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('.next-reminders li').first()).toContainText('14:20')
  await expect(page.locator('.next-reminders li').first()).toContainText('14:30–16:10')
  await expect(page.locator('.next-reminders li')).toHaveCount(1)
  await expect(page.locator('.next-reminders')).not.toContainText('次日 JAVA')
  await expect(page.locator('.next-reminders')).not.toContainText('后日算法')
  await expect(page.locator('.course-daily-tip')).toHaveText('保持网页打开，接收今天的课程提醒。')
  await expect(page.locator('.course-reminder-panel .panel-tip')).toHaveCount(1)
  await page.getByTestId('new-reminder').click()
  await page.locator('[name="reminder-title"]').fill('提交算法作业')
  await page.locator('[name="reminder-date"]').fill('2026-09-21')
  await page.locator('[name="reminder-time"]').fill('14:11')
  await page.locator('[name="reminder-note"]').fill('附上代码和实验报告')
  await page.screenshot({ path: testInfo.outputPath('reminder-editor.png'), animations: 'disabled' })
  await page.getByRole('button', { name: '保存提醒', exact: true }).click()
  const card = page.locator('.reminder-item').filter({ hasText: '提交算法作业' })
  await expect(card).toHaveCount(1)
  await expect(page.locator('.device-notice')).toHaveCount(0)
  await page.clock.fastForward(120_000)
  await expect.poll(() => page.evaluate(() => (window as any).reminderTest.notifications.filter((name: string) => name === '提交算法作业').length)).toBe(1)
  await page.clock.fastForward(5000)
  expect(await page.evaluate(() => (window as any).reminderTest.notifications.length)).toBe(1)
  await card.getByRole('button', { name: '10 分钟后提醒', exact: true }).click()
  await expect(card).toHaveCount(1)
  await expect(card).toContainText('14:21')
  await card.getByRole('button', { name: '完成', exact: true }).click()
  await expect(card).toHaveCount(0)
  await page.getByRole('button', { name: '全部', exact: true }).click()
  await expect(card).toHaveCount(2)
  await expect(card.first()).toContainText('已完成')

  await page.getByTestId('new-reminder').click()
  await page.locator('[name="reminder-title"]').fill('每周研讨会')
  await page.locator('[name="reminder-time"]').fill('16:00')
  await page.locator('[name="reminder-repeat"]').selectOption('weekly')
  await page.locator('[name="reminder-end-date"]').fill('2026-10-21')
  await page.locator('[name="reminder-mode"]').selectOption('silent')
  await page.getByRole('button', { name: '保存提醒', exact: true }).click()
  const weekly = page.locator('.reminder-item').filter({ hasText: '每周研讨会' })
  await expect(weekly).toContainText('每周一')
  await weekly.getByRole('button', { name: '完成本次', exact: true }).click()
  await expect(weekly).toContainText('9/28')
  await weekly.getByRole('button', { name: '暂停', exact: true }).click()
  await expect(weekly).toContainText('已暂停')
  await page.reload()
  await page.getByRole('button', { name: '全部', exact: true }).click()
  await expect(weekly).toContainText('已暂停')
  await weekly.getByRole('button', { name: '恢复', exact: true }).click()
  await weekly.getByRole('button', { name: '编辑', exact: true }).click()
  await page.locator('[name="reminder-time"]').fill('16:30')
  await page.getByRole('button', { name: '保存提醒', exact: true }).click()
  await expect(weekly).toContainText('16:30')
  await weekly.getByRole('button', { name: '删除', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click()
  await expect(weekly).toHaveCount(0)
  await page.clock.fastForward(3000)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('reminder-center.png'), fullPage: true, animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false)
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(accessibility.violations).toEqual([])
  await page.getByRole('link', { name: '我的', exact: true }).click()
  await page.getByRole('link', { name: /通知设置/ }).click()
  await expect(page).toHaveURL(/\/profile\/notifications$/)
  await expect(page.getByRole('heading', { name: '网页通知已开启' })).toBeVisible()
  const help = page.locator('details.reminder-help')
  const explanation = help.locator('.reminder-help-content')
  await expect(explanation).not.toBeVisible()
  await help.locator('summary').click()
  await expect(explanation).toBeVisible()
  await expect(explanation).toContainText('切换课表周次不会影响')
  await expect(explanation).toContainText('通知需在每台设备单独开启')
  await page.screenshot({ path: testInfo.outputPath('notification-settings.png'), fullPage: true, animations: 'disabled' })
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([])
  await help.locator('summary').focus()
  await page.keyboard.press('Enter')
  await expect(explanation).not.toBeVisible()
  await page.getByRole('button', { name: '暂停本机通知' }).click()
  await page.goto('/reminders')
  await expect(permissionPrompt).not.toBeVisible()
  await expect(page.getByText('本机通知已暂停。')).toBeVisible()
  await page.getByRole('link', { name: '去开启', exact: true }).click()
  await page.getByRole('button', { name: '开启本机通知' }).click()
  await expect(page.getByRole('heading', { name: '网页通知已开启' })).toBeVisible()
  await page.goto('/reminders')
  await expect(permissionPrompt).not.toBeVisible()
  await page.clock.setSystemTime(new Date('2026-09-22T00:00:00+08:00'))
  await page.clock.runFor(60_000)
  await expect(page.locator('.next-reminders li')).toHaveCount(1)
  await expect(page.locator('.next-reminders li')).toContainText('次日 JAVA 回归课程')
  await expect(page.locator('.next-reminders')).not.toContainText('后日算法')
})

import { expect, test } from '@playwright/test'

test('actual imported clocks, preview corrections and later edits stay consistent', async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date('2026-09-21T14:09:00+08:00') })
  const credentials = { student_id: `time-${testInfo.project.name}`, password: 'e2e-time-pass-2026' }
  const registered = await page.request.post('http://127.0.0.1:8010/api/auth/register', {
    data: { ...credentials, nickname: '时间回归同学' }
  })
  expect(registered.ok()).toBeTruthy()
  const login = await page.request.post('http://127.0.0.1:8010/api/auth/login', { data: credentials })
  expect(login.ok()).toBeTruthy()
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` }
  const semester = await page.request.put('http://127.0.0.1:8010/api/semester', {
    headers, data: { start_date: '2026-08-31', total_weeks: 20 }
  })
  expect(semester.ok()).toBeTruthy()

  await page.goto('/courses/import')
  await page.locator('input[type="file"]').setInputFiles({
    name: '实际时间课表.html', mimeType: 'text/html',
    buffer: Buffer.from(`<table>
      <tr><th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th></tr>
      <tr><td>第五六节 14:30-16:10</td><td>思想概论<br>杨老师<br>1-16(周)[05-06节]<br>教4-409</td></tr>
      <tr><td>第七八节 16:25-18:05</td><td>JAVA应用开发<br>张老师<br>1-16(周)[07-08节]<br>教4-503</td></tr>
    </table>`)
  })
  await page.getByTestId('preview-import').click()
  await expect(page.getByTestId('start-row-1')).toHaveValue('14:30')
  await expect(page.getByTestId('end-row-1')).toHaveValue('16:10')
  await page.getByTestId('start-row-1').fill('14:35')
  await page.getByTestId('end-row-1').fill('16:15')
  const editor = page.locator('[data-row-ref="row-1"] .import-time-editor')
  await editor.scrollIntoViewIfNeeded()
  await expect(editor).toBeVisible()
  const bounds = await editor.boundingBox()
  expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  await page.screenshot({ path: testInfo.outputPath('import-time-editor.png'), animations: 'disabled' })
  await page.getByTestId('commit-import').click()
  await expect(page.getByTestId('view-courses')).toBeVisible()
  await page.getByTestId('view-courses').click()
  const courseRow = page.locator('.timetable-slot').filter({ has: page.getByText('思想概论', { exact: true }) })
  await expect(courseRow).toHaveCount(1)
  await expect(courseRow.locator('.time-cell')).toContainText('14:35')
  await expect(courseRow.locator('.time-cell')).toContainText('16:15')
  await expect(courseRow.locator('.time-cell')).not.toContainText('14:00')
  await courseRow.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('saved-clock-axis.png'), animations: 'disabled' })

  const saved = await (await page.request.get('http://127.0.0.1:8010/api/courses', { headers })).json()
  const course = saved.find((item: { course_name: string }) => item.course_name === '思想概论')
  await page.goto(`/courses/${course.id}/edit`)
  await expect(page.locator('[name="start_time"]')).toHaveValue('14:35')
  await page.locator('[name="start_time"]').fill('14:30')
  await page.locator('[name="end_time"]').fill('16:10')
  await page.locator('.course-save').click()
  await page.waitForURL('**/courses')
  await expect(courseRow).toHaveCount(1)
  await expect(courseRow.locator('.time-cell')).toContainText('14:30')
  await page.goto('/home')
  await expect(page.locator('.today-copy')).toContainText('思想概论')
  await expect(page.locator('.today-copy')).toContainText('14:30')
  await expect(page.locator('.today-copy')).not.toContainText('JAVA应用开发')
})

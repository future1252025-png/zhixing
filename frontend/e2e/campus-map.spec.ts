import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Contract fixture for native SDK events, not a replacement shipped to users.
function sdkFixture() {
  const state = { maps: [] as any[], markers: 0, overlays: 0 }
  class TestMap {
    handlers: Record<string, (event?: any) => void> = {}
    center: number[]; zoom: number; destroyed = false
    constructor(host: HTMLElement, options: any) {
      this.center = options.center; this.zoom = options.zoom
      host.style.background = '#e9f0df'
      host.innerHTML = '<div style="padding:30px;color:#405939">原生地图事件测试</div>'
      state.maps.push(this)
    }
    on(name: string, handler: any) { this.handlers[name] = handler }
    off(name: string) { delete this.handlers[name] }
    add(items: any[]) { state.overlays += items.length }
    remove() {} addControl() {}
    destroy() { this.destroyed = true }
    getCenter() { return { lng: this.center[0], lat: this.center[1] } }
    getZoom() { return this.zoom }
    setZoomAndCenter(zoom: number, center: number[]) {
      this.zoom = zoom; this.center = center; this.handlers.moveend?.()
    }
  }
  Object.assign(window, { mapTest: state, AMap: { Map: TestMap, Marker: class { constructor() { state.markers++ } },
    Scale: class {}, ToolBar: class {}, CircleMarker: class {}, Circle: class {},
    plugin(_names: string[], callback: () => void) { callback() } } })
  ;(window as any).___onAPILoaded()
}

test('native place identity, map camera and classroom round trip', async ({ page }, testInfo) => {
  const credentials = { student_id: `map-${testInfo.project.name}`, password: 'map-e2e-password-2026' }
  expect((await page.request.post('http://127.0.0.1:8010/api/auth/register', { data: { ...credentials, nickname: '地图回归同学' } })).ok()).toBeTruthy()
  expect((await page.request.post('http://127.0.0.1:8010/api/auth/login', { data: credentials })).ok()).toBeTruthy()
  const response = await page.request.get('http://127.0.0.1:8010/api/buildings')
  const buildings = await response.json()
  const target = buildings.find((item: any) => item.name.includes('国际教育学院'))
  expect(target).toBeTruthy()
  // The test binding exists only in intercepted responses; no production POI is invented.
  await page.route('**/api/buildings', route => route.fulfill({ json: buildings.map((item: any) => ({ ...item,
    map_pois: item.id === target.id ? [{ provider: 'amap', poi_id: 'B_TEST_NATIVE', name: '原生测试地点' }] : [] })) }))
  await page.route('https://webapi.amap.com/maps?*', route => route.fulfill({ contentType: 'application/javascript', body: '(' + sdkFixture.toString() + ')()' }))
  await page.goto('/home')
  await page.getByRole('button', { name: '展开地图' }).click()
  await expect(page).toHaveURL(/\/map$/)
  await expect.poll(() => page.evaluate(() => Boolean((window as any).mapTest?.maps?.at(-1)?.handlers?.zoomstart))).toBe(true)
  await page.evaluate(() => {
    const map = (window as any).mapTest.maps.at(-1)
    for (let i = 0; i < 5; i++) { map.handlers.zoomstart(); map.zoom = 17 + i * .5; map.handlers.zoomend() }
    map.center = [114.336, 30.582]; map.handlers.moveend()
  })
  await page.waitForTimeout(300) // native gesture suppression interval
  await page.evaluate(() => {
    const map = (window as any).mapTest.maps.at(-1)
    map.handlers.click({ lnglat: { lng: 114.336, lat: 30.582 } })
    map.handlers.hotspotclick({ id: 'B_TEST_NATIVE', name: '原生测试地点', lnglat: { lng: 114.336, lat: 30.582 } })
  })
  await expect(page.getByLabel('选中的建筑')).toContainText('国际教育学院')
  await expect(page.getByLabel('选中的建筑')).toContainText('已关联原生地点')
  await expect(page.getByLabel('附近建筑候选')).toHaveCount(0)
  await expect(page).toHaveURL(/\/map$/) // selection is not an automatic navigation
  await page.getByRole('button', { name: '选择频道', exact: true }).click()
  await expect(page).toHaveURL(new RegExp('/buildings/' + target.id + '/chats\\?from=map$'))
  await expect(page.getByLabel('公共频道')).toBeVisible()
  await page.getByRole('searchbox', { name: '搜索教室频道' }).fill('A203')
  await page.getByRole('button', { name: /进入“A203”/ }).click()
  await expect(page).toHaveURL(/room_name=A203/)
  await expect(page.getByText('A203', { exact: true }).first()).toBeVisible()
  await page.goBack()
  await expect(page.getByLabel('最近访问的教室')).toContainText('A203')
  await page.screenshot({ path: testInfo.outputPath('classroom-channels.png'), animations: 'disabled' })
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
  await page.getByRole('button', { name: '返回地图选楼' }).click()
  await expect(page).toHaveURL(/\/map$/)
  await expect.poll(() => page.evaluate(() => Boolean((window as any).mapTest?.maps?.at(-1)?.handlers?.zoomstart))).toBe(true)
  await expect.poll(() => page.evaluate(() => (window as any).mapTest.maps.at(-1).zoom)).toBe(19)
  expect(await page.evaluate(() => (window as any).mapTest.maps.at(-1).center)).toEqual([114.336, 30.582])
  expect(await page.evaluate(() => (window as any).mapTest.markers)).toBe(0)
  await page.evaluate(() => (window as any).mapTest.maps.at(-1).handlers.hotspotclick({ id: 'B_UNBOUND', name: '未关联地点', lnglat: { lng: 114.336, lat: 30.582 } }))
  await expect(page.getByLabel('附近建筑候选')).toContainText('未关联地点')
  await expect(page.getByLabel('选中的建筑')).toHaveCount(0)
  await page.getByRole('searchbox', { name: '搜索校园建筑' }).fill('国际教育学院')
  await page.getByLabel('建筑列表').getByRole('button', { name: /国际教育学院/ }).click()
  await expect(page.getByRole('button', { name: '选择频道', exact: true })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const mapBounds = await page.locator('.map-canvas-pane').boundingBox()
  const directoryBounds = await page.locator('.map-directory').boundingBox()
  expect(mapBounds && directoryBounds).toBeTruthy()
  expect(mapBounds!.x + mapBounds!.width <= directoryBounds!.x + 1 || mapBounds!.y + mapBounds!.height <= directoryBounds!.y + 1).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('map-selection-layout.png'), animations: 'disabled' })
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
  // A link from building details is a one-shot focus request. It must not
  // reset the camera again when returning from a channel.
  await page.goto('/map?building=' + target.id)
  await expect(page).toHaveURL(/\/map$/)
  await expect(page.getByLabel('选中的建筑')).toContainText('国际教育学院')
  await expect.poll(() => page.evaluate(() => Boolean((window as any).mapTest?.maps?.at(-1)?.handlers?.zoomstart))).toBe(true)
  await page.evaluate(() => { const map = (window as any).mapTest.maps.at(-1); map.zoom = 20; map.handlers.zoomend() })
  await page.getByRole('button', { name: '选择频道', exact: true }).click()
  await page.getByRole('button', { name: '返回地图选楼' }).click()
  await expect.poll(() => page.evaluate(() => Boolean((window as any).mapTest?.maps?.at(-1)?.handlers?.zoomstart))).toBe(true)
  expect(await page.evaluate(() => (window as any).mapTest.maps.at(-1).zoom)).toBe(20)
})

test('the local building directory works while map SDK loading fails', async ({ page }, testInfo) => {
  const credentials = { student_id: `map-offline-${testInfo.project.name}`, password: 'map-e2e-password-2026' }
  await page.request.post('http://127.0.0.1:8010/api/auth/register', { data: { ...credentials, nickname: '地图离线回归' } })
  await page.request.post('http://127.0.0.1:8010/api/auth/login', { data: credentials })
  await page.route('https://webapi.amap.com/**', route => route.abort())
  await page.goto('/map')
  await expect(page.getByRole('button', { name: '重新加载地图' })).toBeVisible()
  await page.getByRole('searchbox', { name: '搜索校园建筑' }).fill('国际教育学院')
  await page.getByLabel('建筑列表').getByRole('button', { name: /国际教育学院/ }).click()
  await page.getByRole('button', { name: '选择频道', exact: true }).click()
  await expect(page.getByLabel('公共频道')).toBeVisible()
})

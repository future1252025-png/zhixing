<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { showFailToast, showSuccessToast, showToast } from 'vant'

import { isAMapConfigured, loadAMapSdk } from '@/utils/amap'
import {
  gcj02ToWgs84,
  isPointInPolygon,
  type LatLngPoint,
  wgs84ToGcj02
} from '@/utils/geo'

type CollectedPoint = {
  id: string
  name: string
  type: string
  address: string
  latitude: number
  longitude: number
  gcjLatitude: number
  gcjLongitude: number
  source: 'search' | 'click'
  selected: boolean
}

type PoiResult = {
  id?: string
  name?: string
  type?: string
  address?: string
  location?: string | {
    lng: number
    lat: number
  }
  boundaries?: string
  boundary?: string
}

const defaultCampusPolygon: LatLngPoint[] = [
  { latitude: 30.5841, longitude: 114.3262 },
  { latitude: 30.5844, longitude: 114.3304 },
  { latitude: 30.5833, longitude: 114.3329 },
  { latitude: 30.5808, longitude: 114.3332 },
  { latitude: 30.5784, longitude: 114.3311 },
  { latitude: 30.5780, longitude: 114.3270 },
  { latitude: 30.5798, longitude: 114.3254 }
]
const campusCenterWgs = {
  latitude: 30.58122,
  longitude: 114.32917
}
const defaultKeywords = [
  '湖北大学',
  '湖北大学 图书馆',
  '湖北大学 学院',
  '湖北大学 体育馆',
  '湖北大学 食堂',
  '湖北大学 宿舍',
  '湖北大学 广场',
  '湖北大学 快递',
  '湖北大学 菜鸟',
  '湖北大学 校史馆',
  '湖北大学 教学楼'
]

const mapContainer = shallowRef<HTMLDivElement | null>(null)
const map = shallowRef<any>(null)
const amap = shallowRef<any>(null)
const overlays = shallowRef<any[]>([])
const points = ref<CollectedPoint[]>([])
const campusPolygonWgs = ref<LatLngPoint[]>([...defaultCampusPolygon])
const keyword = ref('湖北大学')
const loading = ref(false)
const drawingBoundary = ref(false)
const boundaryMode = ref<'默认范围' | '高德范围' | '手绘范围'>('默认范围')
const errorMessage = ref('')

const selectedPoints = computed(() => points.value.filter((point) => point.selected))
const seedPreview = computed(() => buildSeedData(selectedPoints.value))
const centerGcj = computed(() => wgs84ToGcj02(campusCenterWgs.latitude, campusCenterWgs.longitude))
const campusPolygonGcj = computed(() =>
  campusPolygonWgs.value.map((point) => wgs84ToGcj02(point.latitude, point.longitude))
)

function parseLocation(location: PoiResult['location']): { longitude: number, latitude: number } | null {
  if (!location) {
    return null
  }
  if (typeof location === 'string') {
    const [longitude, latitude] = location.split(',').map(Number)
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
      return { longitude, latitude }
    }
    return null
  }
  if (Number.isFinite(location.lng) && Number.isFinite(location.lat)) {
    return { longitude: location.lng, latitude: location.lat }
  }
  return null
}

function parseAmapBoundary(boundaryText?: string): LatLngPoint[] | null {
  if (!boundaryText) {
    return null
  }
  const rings = boundaryText
    .split('|')
    .map((ring) => ring
      .split(';')
      .map((item) => {
        const [longitude, latitude] = item.split(',').map(Number)
        if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
          return null
        }
        const [wgsLongitude, wgsLatitude] = gcj02ToWgs84(latitude, longitude)
        return {
          latitude: Number(wgsLatitude.toFixed(6)),
          longitude: Number(wgsLongitude.toFixed(6))
        }
      })
      .filter((point): point is LatLngPoint => point !== null))
    .filter((ring) => ring.length >= 3)

  if (rings.length === 0) {
    return null
  }
  return rings.sort((left, right) => right.length - left.length)[0]
}

function isInsideCampus(latitude: number, longitude: number): boolean {
  return isPointInPolygon({ latitude, longitude }, campusPolygonWgs.value)
}

function createPoint(
  name: string,
  type: string,
  address: string,
  gcjLatitude: number,
  gcjLongitude: number,
  source: CollectedPoint['source'],
  sourceId = ''
): CollectedPoint | null {
  const [longitude, latitude] = gcj02ToWgs84(gcjLatitude, gcjLongitude)
  if (!isInsideCampus(latitude, longitude)) {
    return null
  }

  return {
    id: sourceId || `${name}-${gcjLongitude.toFixed(6)}-${gcjLatitude.toFixed(6)}`,
    name,
    type: normalizeType(type),
    address,
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
    gcjLatitude: Number(gcjLatitude.toFixed(6)),
    gcjLongitude: Number(gcjLongitude.toFixed(6)),
    source,
    selected: true
  }
}

function normalizeType(type: string): string {
  if (type.includes('餐饮')) return '餐饮服务'
  if (type.includes('体育')) return '体育设施'
  if (type.includes('生活')) return '生活服务'
  if (type.includes('住宿') || type.includes('宿舍')) return '宿舍'
  if (type.includes('学校') || type.includes('科教')) return '校园地点'
  return type.split(';')[0] || '校园地点'
}

function addPoints(nextPoints: CollectedPoint[]) {
  const existingKeys = new Set(
    points.value.map((point) => `${point.name}-${point.latitude.toFixed(5)}-${point.longitude.toFixed(5)}`)
  )
  const merged = [...points.value]

  nextPoints.forEach((point) => {
    const key = `${point.name}-${point.latitude.toFixed(5)}-${point.longitude.toFixed(5)}`
    if (!existingKeys.has(key)) {
      merged.push(point)
      existingKeys.add(key)
    }
  })
  points.value = merged
  renderMapOverlays()
}

function createMarker(point: CollectedPoint): any {
  const marker = new amap.value.Marker({
    position: [point.gcjLongitude, point.gcjLatitude],
    anchor: 'center',
    content: `<div class="collector-marker">${point.source === 'click' ? '点' : ''}</div>`,
    zIndex: point.selected ? 120 : 80
  })
  marker.setLabel({
    direction: 'top',
    offset: new amap.value.Pixel(0, -8),
    content: `<div class="collector-label">${escapeHtml(point.name)}</div>`
  })
  marker.on('click', () => {
    point.selected = !point.selected
    renderMapOverlays()
  })
  return marker
}

function createBoundaryVertex(point: LatLngPoint, index: number): any {
  const [longitude, latitude] = wgs84ToGcj02(point.latitude, point.longitude)
  return new amap.value.Marker({
    position: [longitude, latitude],
    anchor: 'center',
    content: `<div class="boundary-vertex">${index + 1}</div>`,
    zIndex: 150
  })
}

function renderCampusBoundary() {
  const path = campusPolygonGcj.value
  if (path.length >= 3) {
    const polygon = new amap.value.Polygon({
      path,
      strokeColor: '#1f6feb',
      strokeOpacity: 0.9,
      strokeWeight: 2,
      fillColor: '#1f6feb',
      fillOpacity: 0.08
    })
    map.value.add(polygon)
    overlays.value.push(polygon)
  } else if (path.length >= 2) {
    const polyline = new amap.value.Polyline({
      path,
      strokeColor: '#1f6feb',
      strokeOpacity: 0.9,
      strokeWeight: 2
    })
    map.value.add(polyline)
    overlays.value.push(polyline)
  }

  if (drawingBoundary.value) {
    const vertexMarkers = campusPolygonWgs.value.map(createBoundaryVertex)
    if (vertexMarkers.length > 0) {
      map.value.add(vertexMarkers)
      overlays.value.push(...vertexMarkers)
    }
  }
}

function renderMapOverlays() {
  if (!map.value || !amap.value) {
    return
  }
  if (overlays.value.length > 0) {
    map.value.remove(overlays.value)
  }
  overlays.value = []
  renderCampusBoundary()

  const markers = selectedPoints.value.map(createMarker)
  if (markers.length > 0) {
    map.value.add(markers)
    overlays.value.push(...markers)
  }

  if (overlays.value.length > 0) {
    map.value.setFitView(overlays.value, false, [42, 24, 42, 24], 17)
  }
}

function searchKeyword(searchText: string): Promise<CollectedPoint[]> {
  return new Promise((resolve) => {
    if (!amap.value) {
      resolve([])
      return
    }

    const placeSearch = new amap.value.PlaceSearch({
      city: '武汉',
      pageSize: 25,
      pageIndex: 1,
      extensions: 'all'
    })
    placeSearch.searchNearBy(
      searchText,
      centerGcj.value,
      1200,
      (status: string, result: any) => {
        if (status !== 'complete' || !result?.poiList?.pois) {
          resolve([])
          return
        }
        const found = (result.poiList.pois as PoiResult[])
          .map((poi) => {
            const location = parseLocation(poi.location)
            if (!location || !poi.name) {
              return null
            }
            return createPoint(
              poi.name,
              poi.type || '校园地点',
              poi.address || '',
              location.latitude,
              location.longitude,
              'search',
              poi.id
            )
          })
          .filter((point): point is CollectedPoint => point !== null)
        resolve(found)
      }
    )
  })
}

function searchCampusPoi(): Promise<PoiResult | null> {
  return new Promise((resolve) => {
    if (!amap.value) {
      resolve(null)
      return
    }
    const placeSearch = new amap.value.PlaceSearch({
      city: '武汉',
      pageSize: 10,
      pageIndex: 1,
      extensions: 'all'
    })
    placeSearch.search('湖北大学', (status: string, result: any) => {
      if (status !== 'complete' || !result?.poiList?.pois) {
        resolve(null)
        return
      }
      const pois = result.poiList.pois as PoiResult[]
      resolve(pois.find((poi) => poi.name?.includes('湖北大学')) || pois[0] || null)
    })
  })
}

async function tryUseAmapCampusBoundary() {
  loading.value = true
  errorMessage.value = ''
  try {
    const poi = await searchCampusPoi()
    const boundary = parseAmapBoundary(poi?.boundaries || poi?.boundary)
    if (!boundary) {
      showFailToast('高德 JS API 未返回湖北大学边界，请使用手动画范围')
      return
    }
    campusPolygonWgs.value = boundary
    boundaryMode.value = '高德范围'
    drawingBoundary.value = false
    renderMapOverlays()
    showSuccessToast('已使用高德返回的校园边界')
  } finally {
    loading.value = false
  }
}

async function searchCurrentKeyword() {
  const text = keyword.value.trim()
  if (!text) {
    showFailToast('请输入搜索关键词')
    return
  }

  loading.value = true
  errorMessage.value = ''
  try {
    const result = await searchKeyword(text)
    addPoints(result)
    showToast(`新增 ${result.length} 个候选点`)
  } finally {
    loading.value = false
  }
}

async function autoCollectCampusPois() {
  loading.value = true
  errorMessage.value = ''
  try {
    let count = 0
    for (const item of defaultKeywords) {
      const result = await searchKeyword(item)
      count += result.length
      addPoints(result)
    }
    showSuccessToast(`自动采集完成，命中 ${count} 条候选`)
  } finally {
    loading.value = false
  }
}

function startDrawingBoundary() {
  campusPolygonWgs.value = []
  points.value = []
  drawingBoundary.value = true
  boundaryMode.value = '手绘范围'
  renderMapOverlays()
  showToast('请沿地图上的湖北大学边界依次点击')
}

function finishDrawingBoundary() {
  if (campusPolygonWgs.value.length < 3) {
    showFailToast('至少需要 3 个边界点')
    return
  }
  drawingBoundary.value = false
  renderMapOverlays()
  showSuccessToast('校园范围已更新')
}

function resetDefaultBoundary() {
  campusPolygonWgs.value = [...defaultCampusPolygon]
  boundaryMode.value = '默认范围'
  drawingBoundary.value = false
  points.value = []
  renderMapOverlays()
}

function handleMapClick(event: any) {
  const lnglat = event.lnglat
  const [longitude, latitude] = gcj02ToWgs84(lnglat.getLat(), lnglat.getLng())

  if (drawingBoundary.value) {
    campusPolygonWgs.value.push({
      latitude: Number(latitude.toFixed(6)),
      longitude: Number(longitude.toFixed(6))
    })
    renderMapOverlays()
    return
  }

  const point = createPoint(
    `手动采点 ${points.value.length + 1}`,
    '手动采点',
    '地图点击采集',
    lnglat.getLat(),
    lnglat.getLng(),
    'click'
  )
  if (!point) {
    showFailToast('该点不在当前校园多边形范围内')
    return
  }
  addPoints([point])
}

function togglePoint(point: CollectedPoint) {
  point.selected = !point.selected
  renderMapOverlays()
}

function clearPoints() {
  points.value = []
  renderMapOverlays()
}

function buildSeedData(source: CollectedPoint[]): string {
  return JSON.stringify(
    source.map((point) => ({
      name: point.name,
      type: point.type,
      description: `${point.name}，来源于高德地图采点工具。`,
      latitude: point.latitude,
      longitude: point.longitude,
      map_x: estimateMapX(point.longitude),
      map_y: estimateMapY(point.latitude),
      walk_hint: '来自真实地图采点，建议演示前人工确认名称和位置。'
    })),
    null,
    2
  )
}

function estimateMapX(longitude: number): number {
  const longitudes = campusPolygonWgs.value.map((point) => point.longitude)
  const minLongitude = Math.min(...longitudes)
  const maxLongitude = Math.max(...longitudes)
  const ratio = (longitude - minLongitude) / (maxLongitude - minLongitude || 0.001)
  return Number(Math.min(Math.max(ratio * 100, 0), 100).toFixed(1))
}

function estimateMapY(latitude: number): number {
  const latitudes = campusPolygonWgs.value.map((point) => point.latitude)
  const minLatitude = Math.min(...latitudes)
  const maxLatitude = Math.max(...latitudes)
  const ratio = (maxLatitude - latitude) / (maxLatitude - minLatitude || 0.001)
  return Number(Math.min(Math.max(ratio * 100, 0), 100).toFixed(1))
}

async function copySeedData() {
  await navigator.clipboard.writeText(seedPreview.value)
  showSuccessToast('已复制采点数据')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

async function initMap() {
  if (!isAMapConfigured()) {
    errorMessage.value = '请先配置 frontend/.env.local 中的高德地图 Key'
    return
  }

  loading.value = true
  try {
    amap.value = await loadAMapSdk()
    await nextTick()
    map.value = new amap.value.Map(mapContainer.value, {
      center: centerGcj.value,
      zoom: 17,
      viewMode: '2D',
      resizeEnable: true
    })
    map.value.addControl(new amap.value.Scale())
    map.value.addControl(new amap.value.ToolBar({ position: 'RB' }))
    map.value.on('click', handleMapClick)
    renderMapOverlays()
  } catch {
    errorMessage.value = '地图加载失败，请检查 Key、域名白名单和网络'
  } finally {
    loading.value = false
  }
}

onMounted(initMap)

onBeforeUnmount(() => {
  if (map.value) {
    map.value.destroy()
  }
})
</script>

<template>
  <section class="page collector-page">
    <van-nav-bar title="地图采点工具" />
    <div class="collector-layout">
      <section class="surface-panel map-panel">
        <div class="collector-heading">
          <div>
            <h1>湖北大学武昌主校区采点</h1>
            <p>当前使用{{ boundaryMode }}过滤候选地点。优先尝试高德边界，拿不到时可手动画校园范围。</p>
          </div>
          <span>{{ selectedPoints.length }} 个已选</span>
        </div>
        <div ref="mapContainer" class="collector-map">
          <div v-if="loading" class="collector-state">正在处理地图数据...</div>
          <div v-if="errorMessage" class="collector-state error">{{ errorMessage }}</div>
        </div>
      </section>

      <section class="surface-panel controls-panel">
        <div class="boundary-tools">
          <van-button block plain :loading="loading" @click="tryUseAmapCampusBoundary">
            尝试读取高德校园范围
          </van-button>
          <van-button v-if="!drawingBoundary" block plain @click="startDrawingBoundary">
            手动画校园范围
          </van-button>
          <van-button v-else block type="primary" @click="finishDrawingBoundary">
            完成手绘范围
          </van-button>
          <van-button block plain @click="resetDefaultBoundary">恢复默认范围</van-button>
        </div>

        <div class="search-row">
          <input v-model="keyword" class="collector-input" placeholder="输入地点关键词" />
          <van-button type="primary" size="small" :loading="loading" @click="searchCurrentKeyword">
            搜索
          </van-button>
        </div>
        <div class="collector-actions">
          <van-button block plain :loading="loading" @click="autoCollectCampusPois">
            自动搜索常见校园地点
          </van-button>
          <van-button block plain @click="clearPoints">清空候选</van-button>
          <van-button block type="primary" :disabled="selectedPoints.length === 0" @click="copySeedData">
            复制已选点位数据
          </van-button>
        </div>

        <div class="collector-list">
          <article
            v-for="point in points"
            :key="point.id"
            class="collector-item"
            :class="{ disabled: !point.selected }"
            @click="togglePoint(point)"
          >
            <div>
              <strong>{{ point.name }}</strong>
              <span>{{ point.type }} / {{ point.source === 'search' ? '搜索' : '点击' }}</span>
            </div>
            <small>{{ point.latitude }}, {{ point.longitude }}</small>
          </article>
          <van-empty v-if="points.length === 0" description="暂无候选点，先搜索或点击地图" />
        </div>
      </section>

      <section class="surface-panel preview-panel">
        <div class="collector-heading compact">
          <div>
            <h2>种子数据预览</h2>
            <p>复制后可用于替换后端 DEMO_BUILDINGS，提交前仍建议人工筛选。</p>
          </div>
        </div>
        <pre>{{ seedPreview }}</pre>
      </section>
    </div>
  </section>
</template>

<style scoped>
.collector-page {
  min-height: 100vh;
}

.collector-layout {
  display: grid;
  gap: 12px;
  width: min(100%, 980px);
  margin: 0 auto;
  padding: 14px;
}

.map-panel,
.controls-panel,
.preview-panel {
  padding: 12px;
}

.collector-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.collector-heading h1,
.collector-heading h2 {
  margin: 0;
  color: var(--cm-ink);
  font-size: 18px;
}

.collector-heading p {
  margin: 4px 0 0;
  color: var(--cm-muted);
  font-size: 13px;
  line-height: 1.5;
}

.collector-heading > span {
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--cm-primary-soft);
  color: var(--cm-primary-dark);
  font-size: 12px;
  font-weight: 800;
  padding: 4px 8px;
}

.collector-map {
  position: relative;
  height: 62vh;
  min-height: 420px;
  overflow: hidden;
  border: 1px solid var(--cm-line);
  border-radius: 8px;
  background: #eef4ff;
}

.collector-state {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: grid;
  place-items: center;
  background: rgb(255 255 255 / 80%);
  color: var(--cm-muted);
  font-size: 14px;
  text-align: center;
  padding: 20px;
}

.collector-state.error {
  color: var(--cm-red);
}

.boundary-tools,
.collector-actions {
  display: grid;
  gap: 8px;
}

.search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  margin-top: 12px;
}

.collector-input {
  min-height: 36px;
  border: 1px solid var(--cm-line);
  border-radius: 8px;
  color: var(--cm-ink);
  font: inherit;
  padding: 0 10px;
}

.collector-actions {
  margin-top: 10px;
}

.collector-list {
  display: grid;
  max-height: 420px;
  overflow: auto;
  gap: 8px;
  margin-top: 12px;
}

.collector-item {
  display: grid;
  gap: 5px;
  cursor: pointer;
  border: 1px solid var(--cm-line);
  border-radius: 8px;
  background: #f8fbff;
  padding: 10px;
}

.collector-item.disabled {
  opacity: 0.48;
}

.collector-item strong {
  display: block;
  color: var(--cm-ink);
  font-size: 14px;
}

.collector-item span,
.collector-item small {
  display: block;
  color: var(--cm-muted);
  font-size: 12px;
  line-height: 1.45;
}

.preview-panel pre {
  max-height: 360px;
  overflow: auto;
  margin: 0;
  border-radius: 8px;
  background: #101828;
  color: #ecfdf3;
  font-size: 12px;
  line-height: 1.55;
  padding: 12px;
  white-space: pre-wrap;
}

:global(.collector-marker) {
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border: 3px solid #ffffff;
  border-radius: 999px;
  background: #1f6feb;
  box-shadow: 0 6px 14px rgb(15 23 42 / 24%);
  color: #ffffff;
  font-size: 10px;
  font-weight: 800;
}

:global(.boundary-vertex) {
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border: 2px solid #ffffff;
  border-radius: 999px;
  background: #13a46b;
  box-shadow: 0 6px 14px rgb(15 23 42 / 24%);
  color: #ffffff;
  font-size: 10px;
  font-weight: 800;
}

:global(.collector-label) {
  transform: translateY(-4px);
  border: 1px solid #d0d5dd;
  border-radius: 8px;
  background: rgb(255 255 255 / 94%);
  box-shadow: 0 4px 12px rgb(15 23 42 / 14%);
  color: #101828;
  font-size: 12px;
  font-weight: 700;
  padding: 3px 7px;
  white-space: nowrap;
}

@media (min-width: 860px) {
  .collector-layout {
    grid-template-columns: minmax(0, 1.4fr) minmax(300px, 0.8fr);
    align-items: start;
  }

  .preview-panel {
    grid-column: 1 / -1;
  }
}
</style>

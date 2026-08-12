<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { showFailToast, showSuccessToast, showToast } from 'vant'

import { isAMapConfigured, loadAMapPlugin, loadAMapSdk } from '@/utils/amap'
import {
  gcj02ToWgs84,
  isPointInPolygon,
  type LatLngPoint,
  wgs84ToGcj02
} from '@/utils/geo'
import {
  buildCampusSearchKeywords,
  clearCollectorDraft,
  readCollectorDraft,
  writeCollectorDraft,
  type CollectorPoint
} from '@/utils/mapCollector'

type CollectedPoint = CollectorPoint

type PendingManualPoint = {
  gcjLatitude: number
  gcjLongitude: number
  latitude: number
  longitude: number
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
const allCampusKeywords = buildCampusSearchKeywords()

const mapContainer = shallowRef<HTMLDivElement | null>(null)
const map = shallowRef<any>(null)
const amap = shallowRef<any>(null)
const overlays = shallowRef<any[]>([])
const points = ref<CollectedPoint[]>([])
const campusPolygonWgs = ref<LatLngPoint[]>([...defaultCampusPolygon])
const keyword = ref('湖北大学')
const loading = ref(false)
const drawingBoundary = ref(false)
const manualPointMode = ref(false)
const boundaryMode = ref<'默认范围' | '高德范围' | '手绘范围'>('默认范围')
const errorMessage = ref('')
const pendingManualPoint = ref<PendingManualPoint | null>(null)
const manualPointName = ref('')
const manualPointType = ref('教学楼')
const manualPointAddress = ref('')

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
  sourceId = '',
  allowOutsideCampus = false
): CollectedPoint | null {
  const [longitude, latitude] = gcj02ToWgs84(gcjLatitude, gcjLongitude)
  if (!allowOutsideCampus && !isInsideCampus(latitude, longitude)) {
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
  persistCollectorDraft()
  renderMapOverlays()
}

function persistCollectorDraft() {
  writeCollectorDraft(window.localStorage, {
    points: points.value,
    campusPolygonWgs: campusPolygonWgs.value,
    boundaryMode: boundaryMode.value
  })
}

function restoreCollectorDraft() {
  const draft = readCollectorDraft(window.localStorage)
  if (!draft) {
    return
  }
  points.value = draft.points
  if (draft.campusPolygonWgs.length >= 3) {
    campusPolygonWgs.value = draft.campusPolygonWgs
    boundaryMode.value = draft.boundaryMode
  }
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

function createPendingManualMarker(point: PendingManualPoint): any {
  const marker = new amap.value.Marker({
    position: [point.gcjLongitude, point.gcjLatitude],
    anchor: 'center',
    content: '<div class="collector-pending-marker">待保存</div>',
    zIndex: 180
  })
  return marker
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

  if (pendingManualPoint.value) {
    const pendingMarker = createPendingManualMarker(pendingManualPoint.value)
    map.value.add(pendingMarker)
    overlays.value.push(pendingMarker)
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
    persistCollectorDraft()
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
    for (const item of allCampusKeywords) {
      const result = await searchKeyword(item)
      count += result.length
      addPoints(result)
    }
    showSuccessToast(`全量搜索完成，命中 ${count} 条候选`)
  } finally {
    loading.value = false
  }
}

function startDrawingBoundary() {
  campusPolygonWgs.value = []
  points.value = []
  drawingBoundary.value = true
  boundaryMode.value = '手绘范围'
  persistCollectorDraft()
  renderMapOverlays()
  showToast('请沿地图上的湖北大学边界依次点击')
}

function finishDrawingBoundary() {
  if (campusPolygonWgs.value.length < 3) {
    showFailToast('至少需要 3 个边界点')
    return
  }
  drawingBoundary.value = false
  persistCollectorDraft()
  renderMapOverlays()
  showSuccessToast('校园范围已更新')
}

function resetDefaultBoundary() {
  campusPolygonWgs.value = [...defaultCampusPolygon]
  boundaryMode.value = '默认范围'
  drawingBoundary.value = false
  points.value = []
  clearCollectorDraft(window.localStorage)
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
    persistCollectorDraft()
    renderMapOverlays()
    return
  }

  if (!manualPointMode.value) {
    showToast('如需自定义地点，请先打开手动标点模式')
    return
  }

  setPendingManualPoint(lnglat.getLat(), lnglat.getLng())
}

function setPendingManualPoint(gcjLatitude: number, gcjLongitude: number) {
  const [longitude, latitude] = gcj02ToWgs84(gcjLatitude, gcjLongitude)
  pendingManualPoint.value = {
    gcjLatitude: Number(gcjLatitude.toFixed(6)),
    gcjLongitude: Number(gcjLongitude.toFixed(6)),
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6))
  }
  manualPointName.value = ''
  manualPointType.value = '教学楼'
  manualPointAddress.value = ''
  renderMapOverlays()
  showToast('已选中坐标，请填写地点名称')
}

function toggleManualPointMode() {
  manualPointMode.value = !manualPointMode.value
  if (manualPointMode.value) {
    drawingBoundary.value = false
    showToast('手动标点已开启，请点击地图或使用地图中心')
  }
}

function useMapCenterAsManualPoint() {
  if (!map.value) {
    showFailToast('地图还没有加载完成')
    return
  }
  manualPointMode.value = true
  const center = map.value.getCenter()
  setPendingManualPoint(center.getLat(), center.getLng())
}

function saveManualPoint() {
  if (!pendingManualPoint.value) {
    showFailToast('请先在地图上点击一个位置')
    return
  }
  const name = manualPointName.value.trim()
  if (!name) {
    showFailToast('请输入地点名称，例如 3号教学楼')
    return
  }
  const point = createPoint(
    name,
    manualPointType.value.trim() || '校园地点',
    manualPointAddress.value.trim() || '手动标点',
    pendingManualPoint.value.gcjLatitude,
    pendingManualPoint.value.gcjLongitude,
    'click',
    '',
    true
  )
  if (!point) {
    showFailToast('该点不在当前校园多边形范围内')
    return
  }
  addPoints([point])
  pendingManualPoint.value = null
  manualPointName.value = ''
  manualPointAddress.value = ''
  manualPointMode.value = false
  renderMapOverlays()
  showSuccessToast(`已添加 ${name}`)
}

function cancelManualPoint() {
  pendingManualPoint.value = null
  manualPointName.value = ''
  manualPointAddress.value = ''
  renderMapOverlays()
}

function togglePoint(point: CollectedPoint) {
  point.selected = !point.selected
  persistCollectorDraft()
  renderMapOverlays()
}

function clearPoints() {
  points.value = []
  clearCollectorDraft(window.localStorage)
  renderMapOverlays()
}

function buildSeedData(source: CollectedPoint[]): string {
  return JSON.stringify(
    source.map((point) => ({
      name: point.name,
      type: point.type,
      description: point.name,
      latitude: point.latitude,
      longitude: point.longitude,
      map_x: estimateMapX(point.longitude),
      map_y: estimateMapY(point.latitude),
      walk_hint: null
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
  if (!navigator.clipboard) {
    showFailToast('复制失败，请手动选择文本复制')
    return
  }
  try {
    await navigator.clipboard.writeText(seedPreview.value)
    showSuccessToast('已复制采点数据')
  } catch {
    showFailToast('复制失败，请手动选择文本复制')
  }
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
    amap.value = await loadAMapPlugin('AMap.PlaceSearch')
    await nextTick()
    restoreCollectorDraft()
    map.value = new amap.value.Map(mapContainer.value, {
      center: centerGcj.value,
      zoom: 17,
      viewMode: '2D',
      resizeEnable: true
    })
    void Promise.all([
      loadAMapPlugin('AMap.Scale'),
      loadAMapPlugin('AMap.ToolBar')
    ]).then(([scaleAMap, toolbarAMap]) => {
      if (!map.value) return
      map.value.addControl(new scaleAMap.Scale())
      map.value.addControl(new toolbarAMap.ToolBar({ position: 'RB' }))
    }).catch(() => {
      // Point collection still works when optional controls fail to load.
    })
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
          <div class="map-mode-tip" :class="{ active: manualPointMode }">
            {{ manualPointMode ? '手动标点模式：点击地图选择位置' : '需要自定义地点时，先打开右侧手动标点模式' }}
          </div>
          <div v-if="loading" class="collector-state">正在处理地图数据...</div>
          <div v-if="errorMessage" class="collector-state error">{{ errorMessage }}</div>
        </div>
      </section>

      <section class="surface-panel controls-panel">
        <div class="boundary-tools">
          <van-button block plain :loading="loading" loading-text="正在读取校园范围" @click="tryUseAmapCampusBoundary">
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
          <input
            id="collector-keyword"
            v-model="keyword"
            class="collector-input"
            placeholder="输入地点关键词"
            aria-label="地点关键词"
          />
          <van-button type="primary" size="small" :loading="loading" loading-text="搜索中" @click="searchCurrentKeyword">
            搜索
          </van-button>
        </div>
        <div class="manual-point-card">
          <strong>手动标点</strong>
          <p>搜索不到“教3、教4、实训大楼”等内部地点时，打开模式后点击地图，或把地图移动到目标位置后使用地图中心。</p>
          <div class="manual-actions">
            <van-button
              :type="manualPointMode ? 'primary' : 'default'"
              size="small"
              @click="toggleManualPointMode"
            >
              {{ manualPointMode ? '关闭手动标点' : '打开手动标点' }}
            </van-button>
            <van-button plain size="small" @click="useMapCenterAsManualPoint">
              使用地图中心
            </van-button>
          </div>
          <p v-if="!pendingManualPoint" class="manual-empty">
            还没有选中坐标。请先打开手动标点后点击地图，或点击“使用地图中心”。
          </p>
          <template v-if="pendingManualPoint">
            <small>
              已选坐标：{{ pendingManualPoint.latitude }}, {{ pendingManualPoint.longitude }}
            </small>
            <label class="manual-label" for="manual-point-name">地点名称</label>
            <input
              id="manual-point-name"
              v-model="manualPointName"
              class="collector-input"
              placeholder="地点名称，例如 3号教学楼"
            />
            <label class="manual-label" for="manual-point-type">地点类型</label>
            <select id="manual-point-type" v-model="manualPointType" class="collector-input">
              <option value="教学楼">教学楼</option>
              <option value="实验楼">实验楼</option>
              <option value="宿舍">宿舍</option>
              <option value="食堂">食堂</option>
              <option value="体育设施">体育设施</option>
              <option value="校园地点">校园地点</option>
            </select>
            <label class="manual-label" for="manual-point-address">地址信息 / 别名</label>
            <input
              id="manual-point-address"
              v-model="manualPointAddress"
              class="collector-input"
              placeholder="说明/别名，可填 教3、教4、实训大楼"
            />
            <div class="manual-actions">
              <van-button type="primary" size="small" @click="saveManualPoint">
                保存地点
              </van-button>
              <van-button plain size="small" @click="cancelManualPoint">
                取消
              </van-button>
            </div>
          </template>
        </div>
        <div class="collector-actions">
          <van-button block plain :loading="loading" loading-text="正在搜索全部地点" @click="autoCollectCampusPois">
            自动搜索全部地点
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
  --page-max: 980px;
  min-height: 100vh;
}

.collector-layout {
  display: grid;
  gap: 16px;
  width: min(100%, 980px);
  margin: 0 auto;
  padding: 16px;
}

.map-panel,
.controls-panel,
.preview-panel {
  border-radius: var(--radius-lg);
  background: rgba(255, 253, 247, .92);
  box-shadow: 0 17px 42px rgba(70, 90, 66, .09);
  padding: 16px;
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
  border-radius: var(--radius-pill);
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
  border-radius: 22px;
  background: var(--fresh-mint);
}

.map-mode-tip {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 2;
  max-width: calc(100% - 20px);
  border: 1px solid rgba(88, 119, 84, .16);
  border-radius: var(--radius-pill);
  background: rgba(255, 253, 247, .92);
  box-shadow: 0 5px 16px rgba(54, 72, 52, .12);
  color: #4b644d;
  font-size: 12px;
  font-weight: 800;
  padding: 7px 10px;
  pointer-events: none;
}

.map-mode-tip.active {
  border-color: var(--fresh-sun);
  background: rgba(255, 238, 199, .95);
  color: #825f27;
}

.collector-state {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: grid;
  place-items: center;
  background: rgba(248, 250, 241, .91);
  color: #405443;
  font-size: 14px;
  text-align: center;
  padding: 20px;
  backdrop-filter: blur(8px);
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
  min-height: 44px;
  border: 1px solid var(--cm-line);
  border-radius: 12px;
  background: var(--fresh-paper-2);
  color: var(--cm-ink);
  font: inherit;
  font-size: 16px;
  padding: 0 10px;
}

.collector-actions {
  margin-top: 10px;
}

.manual-point-card {
  display: grid;
  gap: 8px;
  margin-top: 12px;
  border: 1px solid var(--cm-line);
  border-radius: var(--radius-md);
  background: var(--fresh-bg);
  padding: 13px;
}

.manual-point-card strong {
  color: var(--cm-ink);
  font-size: 14px;
}

.manual-point-card p,
.manual-point-card small {
  margin: 0;
  color: var(--cm-muted);
  font-size: 12px;
  line-height: 1.5;
}

.manual-empty {
  border: 1px dashed var(--cm-line);
  border-radius: 12px;
  background: rgba(255, 253, 247, .8);
  padding: 8px;
}

.manual-label {
  color: var(--cm-ink);
  font-size: 12px;
  font-weight: 800;
}

.manual-actions {
  display: flex;
  gap: 8px;
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
  border-radius: 15px;
  background: var(--fresh-paper-2);
  padding: 11px;
  transition: transform .2s ease, border-color .2s ease, background .2s ease;
}

.collector-item.disabled {
  border-color: var(--fresh-line);
  background: var(--disabled-surface);
  opacity: 1;
}

.collector-item.disabled strong {
  color: var(--disabled-text);
}

.collector-item.disabled span,
.collector-item.disabled small {
  color: #929a92;
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
  border: 1px solid var(--fresh-line);
  border-radius: 16px;
  background: var(--fresh-bg);
  color: #3f5143;
  font-size: 12px;
  line-height: 1.55;
  padding: 12px;
  white-space: pre-wrap;
}

.collector-input:focus {
  border-color: var(--fresh-leaf);
  outline: 0;
  box-shadow: 0 0 0 3px rgba(105, 146, 99, .13);
}

.collector-item:not(.disabled):hover {
  border-color: var(--fresh-leaf);
  background: var(--fresh-bg);
  transform: translateY(-2px);
}

:global(.collector-marker) {
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border: 3px solid #ffffff;
  border-radius: var(--radius-pill);
  background: #1f6feb;
  box-shadow: 0 6px 14px rgb(15 23 42 / 24%);
  color: #ffffff;
  font-size: 12px;
  font-weight: 800;
}

:global(.boundary-vertex) {
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border: 2px solid #ffffff;
  border-radius: var(--radius-pill);
  background: #13a46b;
  box-shadow: 0 6px 14px rgb(15 23 42 / 24%);
  color: #ffffff;
  font-size: 12px;
  font-weight: 800;
}

:global(.collector-pending-marker) {
  display: grid;
  min-width: 54px;
  height: 28px;
  place-items: center;
  border: 2px solid #ffffff;
  border-radius: var(--radius-pill);
  background: #f59e0b;
  box-shadow: 0 8px 18px rgb(15 23 42 / 24%);
  color: #ffffff;
  font-size: 12px;
  font-weight: 800;
  padding: 0 10px;
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

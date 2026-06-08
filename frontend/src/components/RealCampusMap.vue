<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

import type { Building } from '@/api/buildings'
import type { CampusMapPoint } from '@/types/map'
import { isAMapConfigured, loadAMapSdk } from '@/utils/amap'
import { wgs84ToGcj02 } from '@/utils/geo'
import {
  getBuildingHitZoneSize,
  getMapInteractionLevel,
  shouldShowBuildingHighlight
} from '@/utils/mapInteraction'
import { filterMapBuildings } from '@/utils/mapSearch'

const props = withDefaults(defineProps<{
  title?: string
  subtitle?: string
  buildings?: Building[]
  activeBuildingId?: number | null
  fromPoint?: CampusMapPoint | null
  toPoint?: CampusMapPoint | null
  height?: string
  zoom?: number
  fitView?: boolean
  walkingRoute?: boolean
}>(), {
  title: '校园真实地图',
  subtitle: '基于高德地图展示湖北大学建筑位置',
  buildings: () => [],
  activeBuildingId: null,
  fromPoint: null,
  toPoint: null,
  height: '260px',
  zoom: 16,
  fitView: true,
  walkingRoute: false
})

const emit = defineEmits<{
  buildingClick: [buildingId: number]
}>()

const mapContainer = shallowRef<HTMLDivElement | null>(null)
const map = shallowRef<any>(null)
const amap = shallowRef<any>(null)
const overlays = shallowRef<any[]>([])
const routePlanner = shallowRef<any>(null)
const loading = shallowRef(false)
const errorMessage = shallowRef('')
const searchQuery = ref('')
const selectedSearchBuildingId = ref<number | null>(null)
const currentZoom = ref(props.zoom)

const hasConfig = computed(() => isAMapConfigured())
const markerBuildings = computed(() =>
  props.buildings.filter((building) =>
    Number.isFinite(building.latitude) && Number.isFinite(building.longitude)
  )
)
const searchResults = computed(() => filterMapBuildings(markerBuildings.value, searchQuery.value, 6))
const selectedBuilding = computed(() =>
  markerBuildings.value.find((building) => building.id === selectedSearchBuildingId.value) ?? null
)
const interactionLevel = computed(() => getMapInteractionLevel(currentZoom.value))

function pointToLngLat(point: Pick<CampusMapPoint, 'longitude' | 'latitude'>): [number, number] {
  return wgs84ToGcj02(point.latitude, point.longitude)
}

function getMapCenter(): [number, number] {
  const activeBuilding = markerBuildings.value.find(
    (building) => building.id === props.activeBuildingId
  )
  if (activeBuilding) {
    return pointToLngLat(activeBuilding)
  }
  if (props.toPoint) {
    return pointToLngLat(props.toPoint)
  }
  if (props.fromPoint) {
    return pointToLngLat(props.fromPoint)
  }
  if (markerBuildings.value[0]) {
    return pointToLngLat(markerBuildings.value[0])
  }
  return [114.3235, 30.5828]
}

function buildingHitZoneContent(active = false): string {
  const size = getBuildingHitZoneSize(currentZoom.value, active)
  const showHighlight = shouldShowBuildingHighlight(active)
  return `
    <div style="
      position:relative;
      width:${size}px;
      height:${size}px;
      border-radius:999px;
      background:transparent;
      cursor:pointer;
      transform:translateZ(0);
    ">
      ${
        showHighlight
          ? `<span style="
              position:absolute;
              inset:50%;
              width:18px;
              height:18px;
              border:2px solid #1f6feb;
              border-radius:999px;
              background:rgba(31,111,235,.16);
              box-shadow:0 0 0 8px rgba(31,111,235,.14);
              transform:translate(-50%,-50%);
            "></span>`
          : ''
      }
    </div>
  `
}

function routeMarkerContent(kind: 'from' | 'to'): string {
  const palette = {
    from: '#10b981',
    to: '#1f6feb'
  }
  return `
    <div style="
      display:grid;
      width:16px;
      height:16px;
      place-items:center;
      border:3px solid #fff;
      border-radius:999px;
      background:${palette[kind]};
      box-shadow:0 6px 14px rgba(15,23,42,.24);
      color:#fff;
      font-size:11px;
      font-weight:800;
      line-height:1;
    "></div>
  `
}

function clearOverlays() {
  if (map.value && overlays.value.length > 0) {
    map.value.remove(overlays.value)
  }
  overlays.value = []
}

function clearWalkingRoute() {
  if (routePlanner.value) {
    routePlanner.value.clear?.()
  }
  routePlanner.value = null
}

function renderWalkingRoute() {
  if (!props.walkingRoute || !map.value || !amap.value || !props.fromPoint || !props.toPoint) {
    return
  }

  clearWalkingRoute()
  routePlanner.value = new amap.value.Walking({
    map: map.value,
    hideMarkers: true
  })
  routePlanner.value.search(
    pointToLngLat(props.fromPoint),
    pointToLngLat(props.toPoint),
    () => {}
  )
}

function renderMapContent(adjustView = false) {
  if (!map.value || !amap.value) {
    return
  }

  clearWalkingRoute()
  clearOverlays()
  const nextOverlays: any[] = []

  markerBuildings.value.forEach((building) => {
    const active = building.id === props.activeBuildingId ||
      building.id === selectedSearchBuildingId.value
    const marker = new amap.value.Marker({
      position: pointToLngLat(building),
      content: buildingHitZoneContent(active),
      anchor: 'center',
      zIndex: active ? 120 : 100
    })
    marker.on('click', () => {
      selectedSearchBuildingId.value = building.id
      emit('buildingClick', building.id)
    })
    nextOverlays.push(marker)
  })

  if (props.fromPoint) {
    const marker = new amap.value.Marker({
      position: pointToLngLat(props.fromPoint),
      content: routeMarkerContent('from'),
      anchor: 'center',
      zIndex: 140
    })
    nextOverlays.push(marker)
  }

  if (props.toPoint) {
    const marker = new amap.value.Marker({
      position: pointToLngLat(props.toPoint),
      content: routeMarkerContent('to'),
      anchor: 'center',
      zIndex: 150
    })
    nextOverlays.push(marker)
  }

  if (props.fromPoint && props.toPoint) {
    const polyline = new amap.value.Polyline({
      path: [pointToLngLat(props.fromPoint), pointToLngLat(props.toPoint)],
      strokeColor: '#1f6feb',
      strokeWeight: 5,
      strokeOpacity: 0.88,
      strokeStyle: 'solid',
      lineJoin: 'round',
      zIndex: 80
    })
    nextOverlays.push(polyline)
  }

  if (nextOverlays.length > 0) {
    map.value.add(nextOverlays)
  }
  overlays.value = nextOverlays
  renderWalkingRoute()

  if (adjustView) {
    if (props.fitView && nextOverlays.length > 0) {
      map.value.setFitView(nextOverlays, false, [42, 24, 42, 24], 17)
    } else {
      map.value.setCenter(getMapCenter())
    }
  }
}

function focusSearchResult(building: Building) {
  selectedSearchBuildingId.value = building.id
  renderMapContent()
  if (map.value) {
    const position = pointToLngLat(building)
    map.value.setZoomAndCenter(Math.max(props.zoom, 18), position)
  }
}

function openSelectedBuilding() {
  if (selectedBuilding.value) {
    emit('buildingClick', selectedBuilding.value.id)
  }
}

async function initMap() {
  if (!hasConfig.value || !mapContainer.value) {
    return
  }

  loading.value = true
  errorMessage.value = ''
  try {
    amap.value = await loadAMapSdk()
    await nextTick()
    map.value = new amap.value.Map(mapContainer.value, {
      center: getMapCenter(),
      zoom: props.zoom,
      viewMode: '2D',
      resizeEnable: true,
      mapStyle: 'amap://styles/normal'
    })
    map.value.addControl(new amap.value.Scale())
    map.value.addControl(new amap.value.ToolBar({ position: 'RB' }))
    map.value.on('zoomend', () => {
      currentZoom.value = map.value.getZoom()
    })
    currentZoom.value = map.value.getZoom()
    renderMapContent(true)
  } catch {
    errorMessage.value = '真实地图加载失败，请检查高德 Key、域名白名单和网络连接'
  } finally {
    loading.value = false
  }
}

onMounted(initMap)

watch(
  () => [
    props.buildings,
    props.activeBuildingId,
    props.fromPoint,
    props.toPoint
  ],
  () => renderMapContent(true),
  { deep: true }
)

onBeforeUnmount(() => {
  clearWalkingRoute()
  clearOverlays()
  if (map.value) {
    map.value.destroy()
  }
})
</script>

<template>
  <section class="surface-panel real-map-card">
    <div class="real-map-heading">
      <div>
        <h2>{{ title }}</h2>
        <p>{{ subtitle }}</p>
      </div>
      <span class="map-badge">AMap</span>
    </div>

    <div v-if="markerBuildings.length > 0" class="map-search">
      <van-search
        v-model="searchQuery"
        shape="round"
        placeholder="搜索地点、学院、食堂、公寓"
      />
      <div v-if="searchResults.length > 0" class="map-search-results">
        <button
          v-for="building in searchResults"
          :key="building.id"
          type="button"
          :class="{ active: building.id === selectedSearchBuildingId }"
          @click="focusSearchResult(building)"
        >
          <strong>{{ building.name }}</strong>
          <span>{{ building.type }}</span>
        </button>
      </div>
      <p v-else-if="searchQuery.trim()" class="map-search-empty">没有找到匹配地点</p>
    </div>

    <div
      v-if="hasConfig"
      class="real-map-shell"
      :class="`level-${interactionLevel}`"
      :style="{ height }"
    >
      <div ref="mapContainer" class="real-map-container" />
      <div v-if="loading" class="map-state">正在加载真实地图...</div>
      <div v-if="errorMessage" class="map-state error">{{ errorMessage }}</div>
    </div>
    <div v-else class="map-placeholder" :style="{ minHeight: height }">
      <strong>未配置高德地图 Key</strong>
      <span>请在 frontend/.env.local 中配置 VITE_AMAP_KEY 和 VITE_AMAP_SECURITY_CODE</span>
    </div>
    <article v-if="hasConfig && selectedBuilding" class="map-selected-card">
      <div>
        <strong>{{ selectedBuilding.name }}</strong>
        <span>{{ selectedBuilding.type }}</span>
      </div>
      <button type="button" @click="openSelectedBuilding">查看详情</button>
    </article>
  </section>
</template>

<style scoped>
.real-map-card {
  margin: 14px 0;
  padding: 12px;
}

.real-map-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.real-map-heading h2 {
  margin: 0;
  color: var(--cm-ink);
  font-size: 18px;
  line-height: 1.3;
}

.real-map-heading p {
  margin: 4px 0 0;
  color: var(--cm-muted);
  font-size: 13px;
  line-height: 1.45;
}

.map-badge {
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--cm-primary-soft);
  color: var(--cm-primary-dark);
  font-size: 12px;
  font-weight: 800;
  padding: 4px 8px;
}

.map-search {
  margin-bottom: 10px;
}

.map-search :deep(.van-search) {
  padding: 0;
  background: transparent;
}

.map-search-results {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 8px 0 2px;
}

.map-search-results button {
  display: grid;
  min-width: 138px;
  border: 1px solid var(--cm-line);
  border-radius: 8px;
  background: #fff;
  color: var(--cm-ink);
  cursor: pointer;
  gap: 3px;
  padding: 8px 10px;
  text-align: left;
}

.map-search-results button.active {
  border-color: var(--cm-primary);
  background: var(--cm-primary-soft);
}

.map-search-results strong {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.map-search-results span,
.map-search-empty {
  color: var(--cm-muted);
  font-size: 12px;
}

.map-search-empty {
  margin: 8px 0 2px;
}

.real-map-shell {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--cm-line);
  border-radius: 8px;
  background: #eef4ff;
}

.real-map-container {
  width: 100%;
  height: 100%;
}

.map-selected-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
  border: 1px solid var(--cm-primary);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 20px rgb(16 24 40 / 8%);
  padding: 10px 12px;
}

.map-selected-card div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.map-selected-card strong {
  overflow: hidden;
  color: var(--cm-ink);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.map-selected-card span {
  color: var(--cm-muted);
  font-size: 12px;
}

.map-selected-card button {
  flex: 0 0 auto;
  border: 0;
  border-radius: 8px;
  background: var(--cm-primary);
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 800;
  padding: 7px 10px;
}

.map-state,
.map-placeholder {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgb(255 255 255 / 82%);
  color: var(--cm-muted);
  font-size: 13px;
  text-align: center;
  padding: 18px;
}

.map-state.error {
  color: var(--cm-red);
}

.map-placeholder {
  position: relative;
  align-content: center;
  gap: 6px;
  border: 1px dashed var(--cm-line);
  border-radius: 8px;
  background: #f8fbff;
}

.map-placeholder strong {
  color: var(--cm-ink);
  font-size: 15px;
}

.map-placeholder span {
  color: var(--cm-muted);
  font-size: 13px;
  line-height: 1.5;
}
</style>

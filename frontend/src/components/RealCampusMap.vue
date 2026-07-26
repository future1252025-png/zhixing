<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

import type { Building } from '@/api/buildings'
import type { CampusMapPoint } from '@/types/map'
import { isAMapConfigured, loadAMapPlugin, loadAMapSdk } from '@/utils/amap'
import { wgs84ToGcj02 } from '@/utils/geo'
import {
  getBuildingHitZoneSize,
  getBuildingPinSize,
  getMapInteractionLevel,
  hasMapPointerMovedBeyondTolerance,
  MAP_DRAG_HOLD_DELAY_MS,
  shouldShowBuildingHighlight,
  shouldShowBuildingPin,
  type MapInteractionLevel
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
  selectedActionText?: string
}>(), {
  title: '校园地图',
  subtitle: '基于高德地图展示湖北大学建筑位置',
  buildings: () => [],
  activeBuildingId: null,
  fromPoint: null,
  toPoint: null,
  height: '260px',
  zoom: 16,
  fitView: true,
  walkingRoute: false,
  selectedActionText: '查看详情'
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
const dragGestureState = shallowRef<'idle' | 'holding' | 'active'>('idle')
let disposed = false
let initializationGeneration = 0
let zoomEndHandler: (() => void) | null = null
let mapAccessibilityObserver: MutationObserver | null = null
let longPressDragEnabled = false
let dragPointerId: number | null = null
let dragPointerStart: { x: number; y: number } | null = null
let dragPointerLast: { x: number; y: number } | null = null
let dragHoldTimer: ReturnType<typeof setTimeout> | null = null
let lastRenderedInteractionLevel: MapInteractionLevel | null = null

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
const dragGestureMessage = computed(() =>
  dragGestureState.value === 'active' ? '现在可以拖动地图' : '继续按住以拖动地图'
)

function shouldUseLongPressDrag(): boolean {
  return typeof window !== 'undefined' && (
    window.matchMedia?.('(pointer: coarse)').matches ||
    navigator.maxTouchPoints > 0
  )
}

function setMapDragEnabled(enabled: boolean) {
  map.value?.setStatus?.({ dragEnable: enabled })
}

function clearDragHoldTimer() {
  if (dragHoldTimer !== null) {
    clearTimeout(dragHoldTimer)
    dragHoldTimer = null
  }
}

function resetTouchDragGesture(pointerId?: number) {
  if (pointerId !== undefined && dragPointerId !== pointerId) {
    return
  }
  clearDragHoldTimer()
  dragPointerId = null
  dragPointerStart = null
  dragPointerLast = null
  dragGestureState.value = 'idle'
  if (longPressDragEnabled) {
    setMapDragEnabled(false)
  }
}

function handleMapPointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse') {
    setMapDragEnabled(true)
    return
  }
  if (!longPressDragEnabled || dragPointerId !== null) {
    return
  }

  // Hybrid devices may have enabled native dragging during a previous mouse interaction.
  // Touch input still needs to wait for the deliberate hold gesture.
  setMapDragEnabled(false)
  dragPointerId = event.pointerId
  dragPointerStart = { x: event.clientX, y: event.clientY }
  dragPointerLast = { x: event.clientX, y: event.clientY }
  dragGestureState.value = 'holding'
  clearDragHoldTimer()
  dragHoldTimer = setTimeout(() => {
    if (dragPointerId !== event.pointerId) {
      return
    }
    dragGestureState.value = 'active'
  }, MAP_DRAG_HOLD_DELAY_MS)
}

function handleMapPointerMove(event: PointerEvent) {
  if (
    dragGestureState.value === 'active' &&
    dragPointerId === event.pointerId &&
    dragPointerLast
  ) {
    event.preventDefault()
    const deltaX = event.clientX - dragPointerLast.x
    const deltaY = event.clientY - dragPointerLast.y
    if (deltaX !== 0 || deltaY !== 0) {
      map.value?.panBy?.(deltaX, deltaY, 0)
      dragPointerLast = { x: event.clientX, y: event.clientY }
    }
    return
  }
  if (
    dragGestureState.value !== 'holding' ||
    dragPointerId !== event.pointerId ||
    !dragPointerStart
  ) {
    return
  }
  if (hasMapPointerMovedBeyondTolerance(
    dragPointerStart.x,
    dragPointerStart.y,
    event.clientX,
    event.clientY
  )) {
    resetTouchDragGesture(event.pointerId)
  }
}

function handleMapPointerEnd(event: PointerEvent) {
  if (event.pointerType !== 'mouse') {
    resetTouchDragGesture(event.pointerId)
  }
}

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
  const pinWidth = getBuildingPinSize(active)
  const pinHeight = Math.round((pinWidth * 31) / 24)
  const fill = active ? '#e2493b' : '#3d73e0'
  const ringSize = 20
  // 经典水滴 pin，配色随底图惯例（蓝=可点地点，红=选中）而非应用 UI；
  // 针尖用纯像素定位落在命中区几何中心（即坐标点），不依赖 transform，
  // 外部样式/动画覆盖不会再把它从坐标点上挪走
  return `
    <div style="
      position:relative;
      width:${size}px;
      height:${size}px;
      background:transparent;
      cursor:pointer;
    ">
      ${
        shouldShowBuildingHighlight(active)
          ? `<span style="
              position:absolute;
              left:${(size - ringSize) / 2}px;
              top:${(size - ringSize) / 2}px;
              width:${ringSize}px;
              height:${ringSize}px;
              border-radius:999px;
              background:rgba(226,73,59,.16);
              box-shadow:0 0 0 6px rgba(226,73,59,.09);
            "></span>`
          : ''
      }
      <svg viewBox="0 0 24 31" style="
        position:absolute;
        left:${(size - pinWidth) / 2}px;
        bottom:${size / 2}px;
        width:${pinWidth}px;
        height:${pinHeight}px;
        filter:drop-shadow(0 2px 2px rgba(30,40,34,.35));
      ">
        <path
          d="M12 1C6.2 1 1.5 5.6 1.5 11.3c0 2.6.9 5 2.6 7.2L12 31l7.9-12.5c1.7-2.2 2.6-4.6 2.6-7.2C22.5 5.6 17.8 1 12 1z"
          fill="${fill}" stroke="#fff" stroke-width="1.5"
        />
        <circle cx="12" cy="11.3" r="4.2" fill="#fff"/>
      </svg>
    </div>
  `
}

function routeMarkerContent(kind: 'from' | 'to'): string {
  const palette = {
    from: '#13b59b',
    to: '#218cff'
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
      font-size: 12px;
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
  if (
    !props.walkingRoute ||
    !map.value ||
    !amap.value ||
    typeof amap.value.Walking !== 'function' ||
    !props.fromPoint ||
    !props.toPoint
  ) {
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
  lastRenderedInteractionLevel = interactionLevel.value
  const nextOverlays: any[] = []

  markerBuildings.value.forEach((building) => {
    const active = building.id === props.activeBuildingId ||
      building.id === selectedSearchBuildingId.value
    if (!shouldShowBuildingPin(currentZoom.value, active)) {
      return
    }
    const marker = new amap.value.Marker({
      position: pointToLngLat(building),
      content: buildingHitZoneContent(active),
      anchor: 'center',
      zIndex: active ? 120 : 100
    })
    marker.on('click', () => {
      // 点选只出确认卡，跳转交给卡上按钮——地图拖动时不再误触进页
      selectedSearchBuildingId.value = building.id
      renderMapContent()
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

  if (props.fromPoint && props.toPoint && !props.walkingRoute) {
    const polyline = new amap.value.Polyline({
      path: [pointToLngLat(props.fromPoint), pointToLngLat(props.toPoint)],
      strokeColor: '#218cff',
      strokeWeight: 5,
      strokeOpacity: 0.82,
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

function initializationIsActive(generation: number): boolean {
  return !disposed && generation === initializationGeneration
}

function labelGeneratedMapElements() {
  const container = mapContainer.value
  if (!container) return

  container.querySelectorAll('iframe').forEach((frame) => {
    if (!frame.title && !frame.getAttribute('aria-label')) {
      frame.title = `${props.title || '校园地图'}交互辅助框架`
    }
  })
  container.querySelectorAll('img').forEach((image) => {
    if (!image.hasAttribute('alt')) {
      image.alt = image.closest('.amap-logo') ? '高德地图' : ''
    }
  })
}

function observeGeneratedMapElements() {
  mapAccessibilityObserver?.disconnect()
  labelGeneratedMapElements()
  if (!mapContainer.value) return

  mapAccessibilityObserver = new MutationObserver(labelGeneratedMapElements)
  mapAccessibilityObserver.observe(mapContainer.value, {
    childList: true,
    subtree: true
  })
}

async function installMapControls(generation: number, targetMap: any) {
  if (!initializationIsActive(generation) || map.value !== targetMap) {
    return
  }

  try {
    const [scaleAMap, toolbarAMap] = await Promise.all([
      loadAMapPlugin('AMap.Scale'),
      loadAMapPlugin('AMap.ToolBar')
    ])
    if (!initializationIsActive(generation) || map.value !== targetMap) {
      return
    }
    targetMap.addControl(new scaleAMap.Scale())
    targetMap.addControl(new toolbarAMap.ToolBar({ position: 'RB' }))
  } catch {
    // The base map remains usable when optional controls fail to load.
  }
}

async function initMap() {
  if (!hasConfig.value || !mapContainer.value) {
    return
  }

  const generation = ++initializationGeneration
  loading.value = true
  errorMessage.value = ''
  try {
    let loadedAMap = await loadAMapSdk()
    if (!initializationIsActive(generation)) {
      return
    }
    if (props.walkingRoute) {
      loadedAMap = await loadAMapPlugin('AMap.Walking')
      if (!initializationIsActive(generation)) {
        return
      }
    }
    await nextTick()
    if (!initializationIsActive(generation) || !mapContainer.value) {
      return
    }
    const targetMap = new loadedAMap.Map(mapContainer.value, {
      center: getMapCenter(),
      zoom: props.zoom,
      viewMode: '2D',
      resizeEnable: true,
      dragEnable: !shouldUseLongPressDrag(),
      mapStyle: 'amap://styles/normal'
    })
    if (!initializationIsActive(generation)) {
      targetMap.destroy?.()
      return
    }
    amap.value = loadedAMap
    map.value = targetMap
    longPressDragEnabled = shouldUseLongPressDrag()
    if (longPressDragEnabled) {
      setMapDragEnabled(false)
    }
    observeGeneratedMapElements()
    void installMapControls(generation, targetMap)
    zoomEndHandler = () => {
      if (map.value === targetMap) {
        currentZoom.value = targetMap.getZoom()
      }
    }
    targetMap.on('zoomend', zoomEndHandler)
    currentZoom.value = targetMap.getZoom()
    renderMapContent(true)
  } catch {
    if (initializationIsActive(generation)) {
      // 用户只需要知道"暂时打不开"；Key/白名单是开发者的事，仅开发环境提示
      errorMessage.value = import.meta.env.DEV
        ? '地图加载失败，请检查高德 Key、域名白名单和网络连接'
        : '地图暂时打不开，请稍后再试'
    }
  } finally {
    if (initializationIsActive(generation)) {
      loading.value = false
    }
  }
}

onMounted(initMap)

watch(
  () => [
    props.buildings,
    props.fromPoint,
    props.toPoint
  ],
  () => renderMapContent(true),
  { deep: true }
)

// 仅高亮变化时重建标记即可，不重新拉动视角，避免地图跳动。
watch(
  () => props.activeBuildingId,
  () => renderMapContent(false)
)

// zoom 档位决定 pin 显隐和命中区尺寸；只在档位真正变化时重建标记
// （同样不动视角），同档位内缩放不做无谓的整批重建。
watch(currentZoom, () => {
  if (interactionLevel.value !== lastRenderedInteractionLevel) {
    renderMapContent(false)
  }
})

onBeforeUnmount(() => {
  disposed = true
  initializationGeneration += 1
  mapAccessibilityObserver?.disconnect()
  mapAccessibilityObserver = null
  resetTouchDragGesture()
  clearWalkingRoute()
  clearOverlays()
  if (map.value) {
    if (zoomEndHandler) {
      map.value.off?.('zoomend', zoomEndHandler)
    }
    map.value.destroy()
  }
  zoomEndHandler = null
  map.value = null
  amap.value = null
  routePlanner.value = null
  overlays.value = []
  mapContainer.value = null
})
</script>

<template>
  <section class="real-map-card" :class="{ 'real-map-card--compact': !title && !subtitle }">
    <header v-if="title || subtitle" class="real-map-heading">
      <div class="real-map-heading__copy">
        <span class="heading-kicker">
          <i aria-hidden="true" />
          在校园里慢慢走
        </span>
        <h2>{{ title }}</h2>
        <p>{{ subtitle }}</p>
      </div>
      <div class="map-badge" aria-label="高德地图引擎在线">
        <span class="map-badge__orbit" aria-hidden="true"><i /></span>
        <span>
          <small>地图服务</small>
          <strong>高德地图</strong>
        </span>
      </div>
    </header>

    <div
      class="map-stage"
      :class="{ 'map-stage--searchable': markerBuildings.length > 0 }"
    >
      <div v-if="markerBuildings.length > 0" class="map-search">
        <div class="map-search__meta" aria-hidden="true">
          <span>找一个校园地点</span>
          <b>{{ markerBuildings.length }} 个地点</b>
        </div>
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
            <i aria-hidden="true" />
            <span>
              <strong>{{ building.name }}</strong>
              <small>{{ building.type }}</small>
            </span>
          </button>
        </div>
        <p v-else-if="searchQuery.trim()" class="map-search-empty">
          <i aria-hidden="true" />
          没找到这个地点，换个关键词试试
        </p>
      </div>

      <div
        v-if="hasConfig"
        class="real-map-shell"
        :class="`level-${interactionLevel}`"
        :style="{ height }"
      >
        <div
          ref="mapContainer"
          class="real-map-container"
          @pointerdown.capture="handleMapPointerDown"
          @pointermove.capture="handleMapPointerMove"
          @pointerup.capture="handleMapPointerEnd"
          @pointercancel.capture="handleMapPointerEnd"
          @contextmenu.prevent
          @dragstart.prevent
        />

        <div
          v-if="dragGestureState !== 'idle'"
          class="map-drag-feedback"
          :class="{ 'map-drag-feedback--active': dragGestureState === 'active' }"
          role="status"
          aria-live="polite"
        >
          <i aria-hidden="true" />
          {{ dragGestureMessage }}
        </div>

        <div v-if="loading" class="map-state map-state--loading">
          <div class="state-radar" aria-hidden="true">
            <i /><i /><i />
          </div>
          <div class="map-state__copy">
            <small>地图正在展开</small>
            <strong>正在准备校园地图</strong>
            <span>地点和步行路线很快就好...</span>
          </div>
        </div>
        <div v-if="errorMessage" class="map-state map-state--error">
          <div class="state-alert" aria-hidden="true"><i>!</i></div>
          <div class="map-state__copy">
            <small>地图暂时走神了</small>
            <strong>地图没有加载成功</strong>
            <span>{{ errorMessage }}</span>
          </div>
        </div>
      </div>

      <div v-else class="map-placeholder" :style="{ minHeight: height }">
        <div class="placeholder-core" aria-hidden="true">
          <i /><i /><span>!</span>
        </div>
        <small>还差一步配置</small>
        <strong>未配置高德地图 Key</strong>
        <p>
          请在 <code>frontend/.env.local</code> 中配置
          <span>VITE_AMAP_KEY</span> 和 <span>VITE_AMAP_SECURITY_CODE</span>
        </p>
      </div>

      <article v-if="hasConfig && selectedBuilding" class="map-selected-card">
        <i class="selected-beacon" aria-hidden="true" />
        <div>
          <small>刚刚选中的地点</small>
          <strong>{{ selectedBuilding.name }}</strong>
          <span>{{ selectedBuilding.type }}</span>
        </div>
        <button type="button" @click="openSelectedBuilding">
          <span>{{ selectedActionText }}</span>
          <i aria-hidden="true">→</i>
        </button>
      </article>
    </div>
  </section>
</template>

<style scoped>
.real-map-card {
  --map-cyan: #55f7ff;
  --map-cyan-rgb: 85 247 255;
  --map-violet: #9678ff;
  --map-violet-rgb: 150 120 255;
  --map-night: #050b18;
  --map-panel: rgb(8 17 35 / 88%);
  --map-line: rgb(116 226 255 / 19%);
  margin: 0;
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border: 1px solid rgb(var(--map-cyan-rgb) / 18%);
  border-radius: 24px;
  background:
    radial-gradient(circle at 88% 0%, rgb(var(--map-violet-rgb) / 18%), transparent 36%),
    radial-gradient(circle at 4% 100%, rgb(var(--map-cyan-rgb) / 12%), transparent 38%),
    linear-gradient(145deg, #071125 0%, #040914 62%, #090b1b 100%);
  box-shadow:
    0 28px 70px rgb(0 3 12 / 42%),
    inset 0 1px 0 rgb(255 255 255 / 7%);
  color: #effcff;
  padding: clamp(14px, 2.3vw, 22px);
}

.real-map-card--compact {
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  padding: 0;
}

.real-map-heading {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 16px;
  animation: map-heading-in 700ms cubic-bezier(.16, 1, .3, 1) both;
}

.real-map-heading__copy {
  min-width: 0;
}

.heading-kicker {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 7px;
  color: rgb(var(--map-cyan-rgb) / 76%);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .18em;
  line-height: 1;
}

.heading-kicker i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--map-cyan);
  box-shadow: 0 0 12px var(--map-cyan);
  animation: map-live-pulse 1.8s ease-in-out infinite;
}

.real-map-heading h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  color: #f5fdff;
  font-size: clamp(19px, 3vw, 24px);
  font-weight: 700;
  letter-spacing: -.03em;
  line-height: 1.18;
  text-shadow: 0 0 22px rgb(var(--map-cyan-rgb) / 12%);
}

.real-map-heading h2 span {
  display: grid;
  width: 25px;
  height: 19px;
  place-items: center;
  border: 1px solid rgb(var(--map-cyan-rgb) / 38%);
  border-radius: 4px 1px 4px 1px;
  background: rgb(var(--map-cyan-rgb) / 8%);
  color: var(--map-cyan);
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .08em;
  box-shadow: inset 0 0 10px rgb(var(--map-cyan-rgb) / 8%);
}

.real-map-heading p {
  margin: 6px 0 0 35px;
  color: rgb(199 220 232 / 62%);
  font-size: 12px;
  line-height: 1.5;
}

.map-badge {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  min-width: 104px;
  align-items: center;
  gap: 10px;
  border: 1px solid rgb(var(--map-cyan-rgb) / 20%);
  border-radius: 10px 3px 10px 3px;
  background: linear-gradient(120deg, rgb(var(--map-cyan-rgb) / 8%), rgb(var(--map-violet-rgb) / 9%));
  box-shadow: inset 0 0 22px rgb(var(--map-cyan-rgb) / 4%);
  padding: 8px 10px;
}

.map-badge > span:last-child {
  display: grid;
  gap: 2px;
}

.map-badge small,
.map-badge strong {
  font-family: "SFMono-Regular", Consolas, monospace;
  line-height: 1;
}

.map-badge small {
  color: rgb(190 214 230 / 45%);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .13em;
}

.map-badge strong {
  color: #e9fdff;
  font-size: 12px;
  letter-spacing: .09em;
}

.map-badge__orbit {
  position: relative;
  display: grid;
  width: 27px;
  height: 27px;
  place-items: center;
  border: 1px solid rgb(var(--map-cyan-rgb) / 25%);
  border-radius: 50%;
  animation: map-orbit 8s linear infinite;
}

.map-badge__orbit i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 10px var(--map-cyan);
}

.map-stage {
  position: relative;
  min-width: 0;
}

.map-search {
  position: absolute;
  z-index: 12;
  top: 14px;
  left: 14px;
  width: min(410px, calc(100% - 194px));
  min-width: 210px;
  animation: map-search-in 720ms 100ms cubic-bezier(.16, 1, .3, 1) both;
}

.map-search__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 9px 6px;
  color: rgb(196 226 238 / 48%);
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .13em;
  line-height: 1;
  text-shadow: 0 1px 8px #000;
}

.map-search__meta b {
  color: rgb(var(--map-cyan-rgb) / 78%);
  font-size: inherit;
  font-weight: 700;
}

.map-search :deep(.van-search) {
  padding: 0;
  background: transparent;
  --van-search-input-height: 44px;
  --van-field-left-icon-color: rgb(var(--map-cyan-rgb) / 76%);
  --van-field-input-text-color: #effcff;
  --van-field-placeholder-text-color: rgb(196 218 231 / 48%);
}

.map-search :deep(.van-search__content) {
  position: relative;
  overflow: hidden;
  border: 1px solid rgb(var(--map-cyan-rgb) / 23%);
  border-radius: 11px 3px 11px 3px;
  background:
    linear-gradient(105deg, rgb(8 20 40 / 92%), rgb(11 17 38 / 82%)) !important;
  box-shadow:
    0 12px 34px rgb(0 3 12 / 34%),
    inset 0 0 20px rgb(var(--map-cyan-rgb) / 3%);
  backdrop-filter: blur(18px) saturate(145%);
  transition:
    border-color 240ms ease,
    box-shadow 240ms ease,
    transform 240ms ease;
}

.map-search :deep(.van-search__content:focus-within) {
  border-color: rgb(var(--map-cyan-rgb) / 58%);
  box-shadow:
    0 14px 38px rgb(0 3 12 / 45%),
    0 0 0 3px rgb(var(--map-cyan-rgb) / 8%),
    inset 0 0 24px rgb(var(--map-cyan-rgb) / 5%);
  transform: translateY(-1px);
}

.map-search :deep(.van-field__control) {
  caret-color: var(--map-cyan);
  font-size: 16px;
  letter-spacing: .01em;
}

.map-search :deep(.van-icon-search) {
  filter: drop-shadow(0 0 5px rgb(var(--map-cyan-rgb) / 38%));
  font-size: 18px;
}

.map-search :deep(.van-icon-clear) {
  color: rgb(211 235 244 / 55%);
}

.map-search-results {
  display: flex;
  gap: 7px;
  overflow-x: auto;
  margin-top: 7px;
  padding: 2px 2px 7px;
  scrollbar-color: rgb(var(--map-cyan-rgb) / 35%) transparent;
  scrollbar-width: thin;
}

.map-search-results button {
  position: relative;
  display: flex;
  min-width: 152px;
  max-width: 200px;
  min-height: 48px;
  align-items: center;
  gap: 9px;
  overflow: hidden;
  border: 1px solid rgb(132 200 226 / 16%);
  border-radius: 9px 2px 9px 2px;
  background: rgb(7 16 34 / 90%);
  box-shadow: 0 9px 24px rgb(0 3 12 / 32%);
  color: #e8f9ff;
  cursor: pointer;
  padding: 8px 10px;
  text-align: left;
  backdrop-filter: blur(14px);
  transition:
    border-color 220ms ease,
    background 220ms ease,
    box-shadow 220ms ease,
    transform 220ms cubic-bezier(.2, .8, .2, 1);
}

.map-search-results button > i {
  position: relative;
  flex: 0 0 auto;
  width: 9px;
  height: 9px;
  border: 1px solid rgb(var(--map-cyan-rgb) / 70%);
  border-radius: 50%;
  box-shadow: 0 0 0 3px rgb(var(--map-cyan-rgb) / 7%);
}

.map-search-results button.active {
  border-color: rgb(var(--map-cyan-rgb) / 58%);
  background: linear-gradient(105deg, rgb(var(--map-cyan-rgb) / 14%), rgb(var(--map-violet-rgb) / 12%));
  box-shadow:
    0 10px 28px rgb(0 3 12 / 42%),
    inset 0 0 18px rgb(var(--map-cyan-rgb) / 6%);
}

.map-search-results button > span {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.map-search-results strong {
  overflow: hidden;
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.map-search-results small,
.map-search-empty {
  color: rgb(196 218 231 / 55%);
  font-size: 12px;
}

.map-search-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  margin: 7px 0 0;
  border: 1px solid rgb(var(--map-violet-rgb) / 20%);
  border-radius: 8px 2px 8px 2px;
  background: rgb(8 14 31 / 88%);
  box-shadow: 0 10px 26px rgb(0 3 12 / 30%);
  color: rgb(210 218 237 / 68%);
  line-height: 1.4;
  padding: 8px 10px;
  backdrop-filter: blur(14px);
}

.map-search-empty i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--map-violet);
  box-shadow: 0 0 8px var(--map-violet);
}

.real-map-shell {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border: 1px solid rgb(var(--map-cyan-rgb) / 24%);
  border-radius: 17px 5px 17px 5px;
  background: #07101e;
  box-shadow:
    0 20px 45px rgb(0 3 14 / 42%),
    inset 0 0 0 1px rgb(255 255 255 / 3%),
    inset 0 0 55px rgb(var(--map-cyan-rgb) / 4%);
  animation: map-shell-in 850ms cubic-bezier(.16, 1, .3, 1) both;
}

.real-map-container {
  width: 100%;
  height: 100%;
  -webkit-touch-callout: none;
  user-select: none;
  background:
    radial-gradient(circle at 50% 45%, #132949, #07101e 65%),
    #07101e;
}

.real-map-container :deep(.amap-layer canvas),
.real-map-container :deep(.amap-layer img) {
  filter: brightness(.62) saturate(.7) contrast(1.17) hue-rotate(142deg);
}

.real-map-container :deep(.amap-logo),
.real-map-container :deep(.amap-copyright) {
  filter: grayscale(1) brightness(1.8);
  opacity: .38 !important;
}

.real-map-container :deep(.amap-copyright) {
  color: rgb(218 238 245 / 58%) !important;
}

.real-map-container :deep(.amap-toolbar),
.real-map-container :deep(.amap-controlbar),
.real-map-container :deep(.amap-scalecontrol) {
  border: 1px solid rgb(var(--map-cyan-rgb) / 24%) !important;
  border-radius: 9px 3px 9px 3px !important;
  background: rgb(7 16 33 / 82%) !important;
  box-shadow:
    0 10px 25px rgb(0 3 12 / 38%),
    inset 0 0 14px rgb(var(--map-cyan-rgb) / 4%) !important;
  color: rgb(229 250 255 / 82%) !important;
  backdrop-filter: blur(12px);
  transform: scale(1.18);
  transform-origin: bottom right;
}

.real-map-container :deep(.amap-toolbar span),
.real-map-container :deep(.amap-controlbar span) {
  filter: invert(1) sepia(.1) saturate(2) hue-rotate(135deg) brightness(1.25);
}

.real-map-container :deep(.amap-toolbar .amap-ctrl-zoom-in),
.real-map-container :deep(.amap-toolbar .amap-ctrl-zoom-out),
.real-map-container :deep(.amap-toolbar div) {
  min-width: 34px !important;
  min-height: 34px !important;
  line-height: 34px !important;
  font-size: 18px !important;
}

.real-map-container :deep(.amap-scale-text) {
  color: rgb(229 250 255 / 72%) !important;
  text-shadow: 0 1px 3px #000;
}

.map-selected-card {
  position: absolute;
  z-index: 11;
  right: 72px;
  bottom: 14px;
  left: 14px;
  display: flex;
  width: min(430px, calc(100% - 86px));
  min-width: 0;
  align-items: center;
  gap: 10px;
  overflow: hidden;
  border: 1px solid rgb(var(--map-cyan-rgb) / 30%);
  border-radius: 12px 3px 12px 3px;
  background:
    linear-gradient(110deg, rgb(7 21 39 / 94%), rgb(13 12 37 / 90%));
  box-shadow:
    0 14px 34px rgb(0 3 12 / 48%),
    inset 0 0 25px rgb(var(--map-cyan-rgb) / 5%);
  padding: 9px 10px;
  backdrop-filter: blur(18px) saturate(145%);
  animation: map-selected-in 460ms cubic-bezier(.16, 1, .3, 1) both;
}

.selected-beacon {
  position: relative;
  flex: 0 0 auto;
  width: 13px;
  height: 13px;
  border: 1px solid var(--map-cyan);
  border-radius: 50%;
  box-shadow:
    0 0 0 4px rgb(var(--map-cyan-rgb) / 8%),
    0 0 14px rgb(var(--map-cyan-rgb) / 55%);
}

.map-selected-card div {
  display: grid;
  flex: 1 1 auto;
  min-width: 0;
  gap: 2px;
}

.map-selected-card small {
  color: rgb(var(--map-cyan-rgb) / 62%);
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .14em;
}

.map-selected-card strong {
  overflow: hidden;
  color: #effcff;
  font-size: 16px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.map-selected-card div > span {
  overflow: hidden;
  color: rgb(199 219 231 / 52%);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.map-selected-card button {
  flex: 0 0 auto;
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  border: 1px solid rgb(var(--map-cyan-rgb) / 32%);
  border-radius: 8px 2px 8px 2px;
  background: linear-gradient(105deg, rgb(var(--map-cyan-rgb) / 14%), rgb(var(--map-violet-rgb) / 18%));
  color: #eaffff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  padding: 0 14px;
  transition:
    border-color 220ms ease,
    box-shadow 220ms ease,
    transform 220ms ease;
}

.map-selected-card button i {
  color: var(--map-cyan);
  font-family: Arial, sans-serif;
  font-size: 14px;
  font-style: normal;
  transition: transform 220ms ease;
}

.map-state {
  position: absolute;
  z-index: 20;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  background:
    radial-gradient(circle at 50% 45%, rgb(var(--map-cyan-rgb) / 9%), transparent 30%),
    rgb(3 9 22 / 90%);
  color: #eafcff;
  font-size: 14px;
  text-align: center;
  padding: 18px;
  backdrop-filter: blur(8px);
}

.map-state__copy {
  display: grid;
  max-width: 330px;
  gap: 5px;
  text-align: left;
}

.map-state__copy small {
  color: rgb(var(--map-cyan-rgb) / 68%);
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .15em;
}

.map-state__copy strong {
  color: #f0fdff;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: .01em;
}

.map-state__copy span {
  color: rgb(199 221 232 / 58%);
  font-size: 14px;
  line-height: 1.5;
}

.state-radar {
  position: relative;
  flex: 0 0 auto;
  width: 62px;
  height: 62px;
  border: 1px solid rgb(var(--map-cyan-rgb) / 20%);
  border-radius: 50%;
  background:
    linear-gradient(90deg, transparent 49%, rgb(var(--map-cyan-rgb) / 12%) 50%, transparent 51%),
    linear-gradient(transparent 49%, rgb(var(--map-cyan-rgb) / 12%) 50%, transparent 51%);
  box-shadow:
    0 0 34px rgb(var(--map-cyan-rgb) / 8%),
    inset 0 0 20px rgb(var(--map-cyan-rgb) / 5%);
}

.state-radar::before {
  position: absolute;
  inset: 8px;
  border: 1px dashed rgb(var(--map-cyan-rgb) / 28%);
  border-radius: 50%;
  content: '';
  animation: map-orbit 5s linear infinite;
}

.state-radar::after {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 26px;
  height: 1px;
  background: linear-gradient(90deg, var(--map-cyan), transparent);
  box-shadow: 0 0 9px var(--map-cyan);
  content: '';
  transform-origin: left center;
  animation: map-orbit 1.8s linear infinite;
}

.map-state--error {
  background:
    radial-gradient(circle at 50% 45%, rgb(255 91 143 / 9%), transparent 31%),
    rgb(5 7 20 / 92%);
}

.map-state--error .map-state__copy small {
  color: #ff739f;
}

.state-alert {
  position: relative;
  display: grid;
  flex: 0 0 auto;
  width: 57px;
  height: 57px;
  place-items: center;
  border: 1px solid rgb(255 102 150 / 42%);
  background: rgb(255 80 137 / 6%);
  clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
  color: #ff7aa5;
  filter: drop-shadow(0 0 16px rgb(255 87 143 / 18%));
}

.state-alert i {
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 19px;
  font-style: normal;
  font-weight: 800;
}

.map-placeholder {
  position: relative;
  display: grid;
  overflow: hidden;
  align-content: center;
  justify-items: center;
  gap: 7px;
  border: 1px solid rgb(var(--map-cyan-rgb) / 18%);
  border-radius: 17px 5px 17px 5px;
  background:
    radial-gradient(circle at 50% 45%, rgb(var(--map-violet-rgb) / 13%), transparent 29%),
    linear-gradient(145deg, #071225, #050a17 68%);
  box-shadow:
    inset 0 0 60px rgb(0 3 13 / 44%),
    0 18px 42px rgb(0 3 12 / 32%);
  color: #e9faff;
  padding: 76px 24px 22px;
  text-align: center;
}

.map-stage:not(.map-stage--searchable) .map-placeholder {
  padding-top: 22px;
}

.placeholder-core {
  position: relative;
  display: grid;
  width: 61px;
  height: 61px;
  margin-bottom: 3px;
  place-items: center;
  border: 1px solid rgb(var(--map-violet-rgb) / 32%);
  border-radius: 50%;
  box-shadow:
    0 0 30px rgb(var(--map-violet-rgb) / 10%),
    inset 0 0 20px rgb(var(--map-violet-rgb) / 6%);
}

.placeholder-core span {
  position: relative;
  z-index: 1;
  color: #ff79a5;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 15px;
  font-weight: 800;
}

.map-placeholder > small {
  position: relative;
  color: rgb(var(--map-violet-rgb) / 75%);
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .16em;
}

.map-placeholder > strong {
  position: relative;
  color: #effcff;
  font-size: 15px;
  font-weight: 700;
}

.map-placeholder > p {
  position: relative;
  max-width: 560px;
  margin: 0;
  color: rgb(197 217 230 / 54%);
  font-size: 14px;
  line-height: 1.5;
}

.map-placeholder code,
.map-placeholder p span {
  color: rgb(var(--map-cyan-rgb) / 78%);
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: .92em;
}

@media (hover: hover) {
  .map-search-results button:hover {
    border-color: rgb(var(--map-cyan-rgb) / 42%);
    background: rgb(10 27 48 / 94%);
    box-shadow:
      0 13px 30px rgb(0 3 12 / 42%),
      0 0 18px rgb(var(--map-cyan-rgb) / 5%);
    transform: translateY(-2px);
  }

  .map-selected-card button:hover {
    border-color: rgb(var(--map-cyan-rgb) / 70%);
    box-shadow:
      0 0 18px rgb(var(--map-cyan-rgb) / 13%),
      inset 0 0 14px rgb(var(--map-cyan-rgb) / 8%);
    transform: translateY(-1px);
  }

  .map-selected-card button:hover i {
    transform: translateX(2px);
  }
}

.map-search-results button:focus-visible,
.map-selected-card button:focus-visible {
  outline: 2px solid var(--map-cyan);
  outline-offset: 2px;
}

@keyframes map-heading-in {
  from {
    opacity: 0;
    transform: translateY(-9px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes map-search-in {
  from {
    opacity: 0;
    transform: translate3d(-14px, 0, 0);
  }

  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@keyframes map-shell-in {
  from {
    opacity: 0;
    clip-path: inset(0 100% 0 0 round 17px 5px 17px 5px);
    transform: scale(.985);
  }

  to {
    opacity: 1;
    clip-path: inset(0 0 0 0 round 17px 5px 17px 5px);
    transform: scale(1);
  }
}

@keyframes map-selected-in {
  from {
    opacity: 0;
    transform: translate3d(0, 14px, 0) scale(.97);
  }

  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

@keyframes map-orbit {
  to {
    transform: rotate(360deg);
  }
}

@keyframes map-live-pulse {
  0%,
  100% {
    opacity: .55;
    transform: scale(.78);
  }

  50% {
    opacity: 1;
    transform: scale(1.22);
  }
}

@media (max-width: 640px) {
  .map-search {
    right: 11px;
    left: 11px;
    width: auto;
    min-width: 0;
  }

  .map-selected-card {
    right: 92px;
    bottom: 11px;
    left: 11px;
    width: auto;
  }

  .map-selected-card button {
    min-width: 76px;
    justify-content: center;
    padding: 0 10px;
  }

  .map-selected-card button > span {
    display: inline;
    overflow: hidden;
    max-width: 84px;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@media (max-width: 420px) {
  .real-map-card {
    border-radius: var(--radius-md);
    padding: 13px;
  }

  .real-map-card--compact {
    border-radius: 0;
    padding: 0;
  }

  .real-map-heading {
    gap: 10px;
    margin-bottom: 13px;
  }

  .real-map-heading p {
    margin-left: 0;
  }

  .map-badge {
    min-width: 0;
    padding: 7px;
  }

  .map-badge > span:last-child {
    display: none;
  }

  .map-state {
    gap: 15px;
  }

  .state-radar,
  .state-alert {
    transform: scale(.82);
  }
}

/* 清新自然版地图：保留地图能力，只留下柔和、易读的界面。 */
.real-map-card {
  --map-cyan: #6f9b69;
  --map-cyan-rgb: 111 155 105;
  --map-violet: #7ea9a5;
  --map-violet-rgb: 126 169 165;
  overflow: visible;
  border: 1px solid rgba(84, 118, 82, .14);
  border-radius: 28px;
  background:
    radial-gradient(circle at 92% 5%, rgba(240, 207, 132, .2), transparent 25%),
    var(--fresh-paper);
  box-shadow: 0 19px 44px rgba(70, 91, 66, .1);
  color: var(--fresh-ink);
}

.real-map-card--compact {
  overflow: visible;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  padding: 0;
}

.real-map-heading {
  margin-bottom: 15px;
  animation: map-heading-in 650ms cubic-bezier(.22, 1, .36, 1) both;
}

.heading-kicker {
  margin-bottom: 7px;
  color: var(--fresh-muted);
  font-family: inherit;
  font-size: 12px;
  letter-spacing: .04em;
}

.heading-kicker i {
  width: 8px;
  height: 12px;
  border-radius: 90% 8% 90% 10%;
  background: var(--fresh-leaf);
  box-shadow: none;
  animation: map-leaf-nod 2.8s ease-in-out infinite;
  transform: rotate(28deg);
}

.real-map-heading h2 {
  color: var(--fresh-ink);
  font-size: clamp(20px, 3vw, 25px);
  text-shadow: none;
}

.real-map-heading p {
  margin: 5px 0 0;
  color: var(--fresh-muted);
  font-size: 12px;
}

.map-badge {
  min-width: 108px;
  border: 1px solid var(--fresh-line);
  border-radius: 15px;
  background: var(--fresh-bg);
  box-shadow: none;
  padding: 8px 10px;
}

.map-badge__orbit {
  border: 0;
  border-radius: 50% 50% 50% 38%;
  background: var(--fresh-mint);
  animation: map-leaf-nod 3.2s ease-in-out infinite;
}

.map-badge__orbit i {
  width: 10px;
  height: 15px;
  border-radius: 90% 8% 90% 10%;
  background: var(--fresh-leaf);
  box-shadow: none;
  transform: rotate(28deg);
}

.map-badge small {
  color: #8b968a;
  font-family: inherit;
  font-size: 12px;
  letter-spacing: .04em;
}

.map-badge strong {
  color: var(--fresh-green-dark);
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0;
}

.map-search {
  top: 12px;
  left: 12px;
  width: min(410px, calc(100% - 86px));
}

.map-search__meta {
  width: fit-content;
  gap: 14px;
  margin: 0 4px 6px;
  border-radius: var(--radius-pill);
  background: rgba(255, 253, 247, .9);
  box-shadow: 0 3px 10px rgba(64, 83, 61, .08);
  color: var(--fresh-text);
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0;
  padding: 5px 9px;
  text-shadow: none;
}

.map-search__meta b { color: var(--fresh-green); }

.map-search :deep(.van-search) {
  --van-field-left-icon-color: #6d8e69;
  --van-field-input-text-color: var(--fresh-ink);
  --van-field-placeholder-text-color: #929b92;
}

.map-search :deep(.van-search__content) {
  border: 1px solid rgba(89, 121, 85, .17);
  border-radius: 15px;
  background: rgba(255, 253, 248, .94) !important;
  box-shadow: 0 9px 24px rgba(57, 74, 55, .13);
  backdrop-filter: blur(14px);
}

.map-search :deep(.van-search__content:focus-within) {
  border-color: var(--fresh-leaf);
  box-shadow: 0 10px 27px rgba(57, 74, 55, .14), 0 0 0 3px rgba(111, 155, 105, .14);
  transform: translateY(-1px);
}

.map-search :deep(.van-field__control) {
  caret-color: var(--fresh-green);
  font-size: 16px;
}

.real-map-container :deep(img),
.real-map-container :deep(canvas) {
  -webkit-user-drag: none;
  -webkit-touch-callout: none;
  user-select: none;
}

.map-drag-feedback {
  position: absolute;
  z-index: 12;
  right: 12px;
  bottom: 12px;
  display: flex;
  align-items: center;
  gap: 7px;
  border: 1px solid rgba(83, 118, 82, .2);
  border-radius: var(--radius-pill);
  background: rgba(255, 253, 248, .92);
  box-shadow: 0 7px 18px rgba(59, 74, 57, .14);
  color: #415846;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 11px;
  pointer-events: none;
  backdrop-filter: blur(12px);
}

.map-drag-feedback i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--fresh-sun);
  box-shadow: 0 0 0 5px rgba(214, 167, 88, .14);
}

.map-drag-feedback--active i {
  background: #16877e;
  box-shadow: 0 0 0 5px rgba(22, 135, 126, .14);
}
.map-search :deep(.van-icon-search) { filter: none; font-size: 18px; }
.map-search :deep(.van-icon-clear) { color: #849285; }

.map-search-results {
  padding-bottom: 8px;
  scrollbar-color: #a9c0a5 transparent;
}

.map-search-results button {
  min-width: 145px;
  border: 1px solid rgba(86, 119, 82, .15);
  border-radius: var(--radius-sm);
  background: rgba(255, 253, 248, .95);
  box-shadow: 0 7px 19px rgba(60, 77, 57, .12);
  color: var(--fresh-ink);
  backdrop-filter: blur(13px);
}

.map-search-results button > i {
  width: 10px;
  height: 14px;
  border: 0;
  border-radius: 90% 8% 90% 10%;
  background: var(--fresh-leaf);
  box-shadow: none;
  transform: rotate(28deg);
}

.map-search-results button.active {
  border-color: var(--fresh-leaf);
  background: var(--fresh-mint);
  box-shadow: 0 8px 21px rgba(60, 89, 57, .14);
  transform: translateY(-2px);
}
.map-search-results small { color: var(--fresh-muted); }
.map-search-empty {
  border: 1px solid #ead9b4;
  border-radius: 13px;
  background: rgba(255, 248, 229, .95);
  box-shadow: 0 7px 20px rgba(79, 75, 59, .1);
  color: #826f49;
  backdrop-filter: blur(12px);
}
.map-search-empty i { background: var(--fresh-sun); box-shadow: none; }

.real-map-shell {
  border: 1px solid rgba(83, 118, 82, .17);
  border-radius: 24px;
  background: var(--fresh-mint);
  box-shadow: 0 16px 35px rgba(59, 78, 57, .13);
  animation: map-shell-in 800ms cubic-bezier(.22, 1, .36, 1) both;
}

.real-map-container {
  background: var(--fresh-mint);
}

.real-map-container :deep(.amap-layer canvas),
.real-map-container :deep(.amap-layer img) {
  filter: saturate(.78) contrast(.95) brightness(1.04);
}

.real-map-container :deep(.amap-logo),
.real-map-container :deep(.amap-copyright) {
  filter: none;
  opacity: .55 !important;
}

.real-map-container :deep(.amap-copyright) {
  color: #536356 !important;
}

.real-map-container :deep(.amap-toolbar),
.real-map-container :deep(.amap-controlbar),
.real-map-container :deep(.amap-scalecontrol) {
  border: 1px solid rgba(79, 108, 76, .15) !important;
  border-radius: 12px !important;
  background: rgba(255, 253, 248, .91) !important;
  box-shadow: 0 7px 18px rgba(59, 74, 57, .13) !important;
  color: #3e5042 !important;
  backdrop-filter: blur(12px);
  transform: scale(1.18);
  transform-origin: bottom right;
}

.real-map-container :deep(.amap-toolbar span),
.real-map-container :deep(.amap-controlbar span) {
  filter: sepia(.18) saturate(.65) hue-rotate(61deg);
}

.real-map-container :deep(.amap-toolbar .amap-ctrl-zoom-in),
.real-map-container :deep(.amap-toolbar .amap-ctrl-zoom-out),
.real-map-container :deep(.amap-toolbar div) {
  min-width: 34px !important;
  min-height: 34px !important;
  line-height: 34px !important;
  font-size: 18px !important;
}

.real-map-container :deep(.amap-scale-text) {
  color: #425247 !important;
  text-shadow: 0 1px 2px #fff;
}

.map-selected-card {
  right: 70px;
  border: 1px solid rgba(87, 121, 83, .18);
  border-radius: var(--fresh-radius-sm);
  background: rgba(255, 253, 247, .94);
  box-shadow: 0 10px 28px rgba(56, 73, 54, .17);
  backdrop-filter: blur(16px);
}

.selected-beacon {
  width: 13px;
  height: 18px;
  border: 0;
  border-radius: 90% 8% 90% 10%;
  background: var(--fresh-leaf);
  box-shadow: none;
  transform: rotate(26deg);
}

.map-selected-card small {
  color: var(--fresh-muted);
  font-family: inherit;
  font-size: 12px;
  letter-spacing: .03em;
}
.map-selected-card strong { color: var(--fresh-ink); font-size: 15px; }
.map-selected-card div > span { color: #5f6e62; font-size: 13px; }
.map-selected-card button {
  min-height: 44px;
  border: 0;
  border-radius: 11px;
  background: var(--fresh-green);
  color: #fff;
  font-size: 13px;
  padding: 0 14px;
  box-shadow: 0 6px 15px rgba(74, 111, 70, .2);
}
.map-selected-card button i { color: #fff; }

.map-state {
  background: rgba(247, 250, 240, .92);
  color: var(--fresh-ink);
  backdrop-filter: blur(9px);
}
.map-state__copy small {
  color: var(--fresh-text);
  font-family: inherit;
  font-size: 12px;
  letter-spacing: .02em;
}
.map-state__copy strong { color: var(--fresh-ink); }
.map-state__copy span { color: #536356; }
.state-radar {
  border: 0;
  background: var(--fresh-mint);
  box-shadow: none;
}
.state-radar::before {
  inset: 19px;
  border: 0;
  background: var(--fresh-sun);
  animation: none;
}
.state-radar::after {
  top: 7px;
  left: 25px;
  width: 15px;
  height: 27px;
  border-radius: 90% 90% 35% 35%;
  background: var(--fresh-leaf);
  box-shadow: none;
  transform-origin: 6px 24px;
  animation: map-flower-turn 2.2s linear infinite;
}
.map-state--error { background: rgba(255, 248, 240, .94); }
.map-state--error .map-state__copy small { color: #89503f; }
.state-alert {
  border: 0;
  border-radius: 50%;
  background: var(--cm-red-soft);
  clip-path: none;
  color: var(--cm-red);
  filter: none;
}
.map-placeholder {
  border: 1px solid rgba(88, 118, 83, .14);
  border-radius: 24px;
  background:
    radial-gradient(circle at 50% 30%, rgba(233, 207, 142, .26), transparent 35%),
    var(--fresh-bg);
  box-shadow: 0 13px 30px rgba(65, 82, 62, .09);
  color: var(--fresh-ink);
}
.placeholder-core {
  border: 0;
  border-radius: 50% 50% 42% 50%;
  background: var(--fresh-mint);
  box-shadow: none;
}
.placeholder-core span { color: #6d8969; }
.map-placeholder > small {
  color: var(--fresh-muted);
  font-family: inherit;
  letter-spacing: .02em;
}
.map-placeholder > strong { color: var(--fresh-ink); }
.map-placeholder > p { color: var(--fresh-muted); }
.map-placeholder code,
.map-placeholder p span {
  border-radius: 5px;
  background: var(--fresh-mint);
  color: var(--fresh-text);
}

@keyframes map-leaf-nod {
  0%, 100% { rotate: 0deg; }
  50% { rotate: 10deg; }
}

@keyframes map-flower-turn {
  to { transform: rotate(360deg); }
}

@media (max-width: 640px) {
  .map-search { right: 11px; left: 11px; width: auto; }
  .map-selected-card { right: 11px; bottom: 11px; left: 11px; width: auto; }
}

@media (prefers-reduced-motion: reduce) {
  .real-map-card,
  .real-map-card *,
  .real-map-card *::before,
  .real-map-card *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: .01ms !important;
  }
}
</style>

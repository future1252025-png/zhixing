<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'

import type { Building } from '@/api/buildings'
import type { CampusMapPoint } from '@/types/map'
import { isAMapConfigured, loadAMapSdk } from '@/utils/amap'
import { wgs84ToGcj02 } from '@/utils/geo'

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
}>(), {
  title: '校园真实地图',
  subtitle: '基于高德地图展示湖北大学建筑位置',
  buildings: () => [],
  activeBuildingId: null,
  fromPoint: null,
  toPoint: null,
  height: '260px',
  zoom: 16,
  fitView: true
})

const emit = defineEmits<{
  buildingClick: [buildingId: number]
}>()

const mapContainer = shallowRef<HTMLDivElement | null>(null)
const map = shallowRef<any>(null)
const amap = shallowRef<any>(null)
const overlays = shallowRef<any[]>([])
const loading = shallowRef(false)
const errorMessage = shallowRef('')

const hasConfig = computed(() => isAMapConfigured())
const markerBuildings = computed(() =>
  props.buildings.filter((building) =>
    Number.isFinite(building.latitude) && Number.isFinite(building.longitude)
  )
)

function pointToLngLat(point: Pick<CampusMapPoint, 'longitude' | 'latitude'>): [number, number] {
  return wgs84ToGcj02(point.latitude, point.longitude)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
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

function markerContent(kind: 'building' | 'from' | 'to', active = false): string {
  const palette = {
    building: active ? '#1f6feb' : '#10b981',
    from: '#10b981',
    to: '#1f6feb'
  }
  const text = kind === 'from' ? '起' : kind === 'to' ? '到' : ''
  return `
    <div style="
      display:grid;
      width:${active ? 22 : 18}px;
      height:${active ? 22 : 18}px;
      place-items:center;
      border:3px solid #fff;
      border-radius:999px;
      background:${palette[kind]};
      box-shadow:0 6px 14px rgba(15,23,42,.24);
      color:#fff;
      font-size:11px;
      font-weight:800;
      line-height:1;
    ">${text}</div>
  `
}

function labelContent(name: string, active = false): string {
  return `
    <div style="
      transform:translateY(-4px);
      border:1px solid ${active ? '#1f6feb' : '#d0d5dd'};
      border-radius:8px;
      background:rgba(255,255,255,.94);
      box-shadow:0 4px 12px rgba(15,23,42,.14);
      color:#101828;
      font-size:12px;
      font-weight:${active ? 800 : 700};
      padding:3px 7px;
      white-space:nowrap;
    ">${escapeHtml(name)}</div>
  `
}

function clearOverlays() {
  if (map.value && overlays.value.length > 0) {
    map.value.remove(overlays.value)
  }
  overlays.value = []
}

function renderMapContent() {
  if (!map.value || !amap.value) {
    return
  }

  clearOverlays()
  const nextOverlays: any[] = []

  markerBuildings.value.forEach((building) => {
    const active = building.id === props.activeBuildingId
    const marker = new amap.value.Marker({
      position: pointToLngLat(building),
      content: markerContent('building', active),
      anchor: 'center',
      zIndex: active ? 120 : 100
    })
    marker.setLabel({
      direction: 'top',
      offset: new amap.value.Pixel(0, -8),
      content: labelContent(building.name, active)
    })
    marker.on('click', () => emit('buildingClick', building.id))
    nextOverlays.push(marker)
  })

  if (props.fromPoint) {
    const marker = new amap.value.Marker({
      position: pointToLngLat(props.fromPoint),
      content: markerContent('from'),
      anchor: 'center',
      zIndex: 140
    })
    marker.setLabel({
      direction: 'top',
      offset: new amap.value.Pixel(0, -8),
      content: labelContent(props.fromPoint.name, true)
    })
    nextOverlays.push(marker)
  }

  if (props.toPoint) {
    const marker = new amap.value.Marker({
      position: pointToLngLat(props.toPoint),
      content: markerContent('to'),
      anchor: 'center',
      zIndex: 150
    })
    marker.setLabel({
      direction: 'top',
      offset: new amap.value.Pixel(0, -8),
      content: labelContent(props.toPoint.name, true)
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

  if (props.fitView && nextOverlays.length > 0) {
    map.value.setFitView(nextOverlays, false, [42, 24, 42, 24], 17)
  } else {
    map.value.setCenter(getMapCenter())
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
    renderMapContent()
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
  () => renderMapContent(),
  { deep: true }
)

onBeforeUnmount(() => {
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

    <div
      v-if="hasConfig"
      class="real-map-shell"
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

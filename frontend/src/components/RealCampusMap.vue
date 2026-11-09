<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { Building } from '@/api/buildings'
import type { MapCamera, MapCoordinate, NativeMapPoi } from '@/types/map'
import type { DevicePosition } from '@/utils/deviceGeolocation'
import { isAMapConfigured, loadAMapPlugin, loadAMapSdk } from '@/utils/amap'
import { CAMPUS_MAP_CENTER, buildingMapCoordinate, readMapCoordinate, readNativeMapPoi, validMapCamera } from '@/utils/mapSelection'
import { wgs84ToGcj02 } from '@/utils/geo'

const props = withDefaults(defineProps<{
  title?: string; subtitle?: string; height?: string; zoom?: number; interactive?: boolean; lazy?: boolean; autoCenter?: boolean
  buildings?: Building[]; activeBuildingId?: number | null; camera?: MapCamera | null; position?: DevicePosition | null
}>(), { title: '', subtitle: '', height: '260px', zoom: 17, interactive: true, lazy: false, autoCenter: false,
  buildings: () => [], activeBuildingId: null, camera: null, position: null })
const emit = defineEmits<{ poiClick: [poi: NativeMapPoi]; mapClick: [coordinate: MapCoordinate]
  cameraChange: [camera: MapCamera]; ready: [] }>()
const host = shallowRef<HTMLElement | null>(null)
const mapContainer = shallowRef<HTMLDivElement | null>(null)
const map = shallowRef<any>(null)
const sdk = shallowRef<any>(null)
const loading = ref(false)
const error = ref('')
let disposed = false
let generation = 0
let deferredClick: ReturnType<typeof setTimeout> | undefined
let gesture = false
let suppressUntil = 0
let positionOverlays: any[] = []
let intersection: IntersectionObserver | null = null
let accessibility: MutationObserver | null = null
let pendingFocus: MapCamera | null = null
let cameraClaimed = validMapCamera(props.camera) || props.activeBuildingId !== null
let locationCentered = false
const listeners: [string, (...args: any[]) => void][] = []

function startingCamera(): MapCamera {
  if (pendingFocus) return pendingFocus
  if (validMapCamera(props.camera)) return props.camera
  const building = props.buildings.find(item => item.id === props.activeBuildingId)
  const point = building ? buildingMapCoordinate(building) : (props.autoCenter || !props.interactive) && props.position ? buildingMapCoordinate(props.position) : null
  return { center: point ? [point.longitude, point.latitude] : CAMPUS_MAP_CENTER, zoom: props.zoom }
}
function publishCamera() {
  const center = readMapCoordinate(map.value?.getCenter?.())
  const zoom = map.value?.getZoom?.()
  if (center && Number.isFinite(zoom)) emit('cameraChange', { center: [center.longitude, center.latitude], zoom })
}
function focusCoordinate(coordinate: MapCoordinate, zoom = 18) {
  if (!readMapCoordinate(coordinate)) return
  const camera: MapCamera = { zoom, center: [coordinate.longitude, coordinate.latitude] }
  if (!validMapCamera(camera)) return
  cameraClaimed = true
  if (map.value) map.value.setZoomAndCenter(zoom, camera.center)
  else pendingFocus = camera
}
function drawPosition() {
  if (!map.value || !sdk.value) return
  if (positionOverlays.length) map.value.remove(positionOverlays)
  positionOverlays = []
  const position = props.position
  if (!position) return
  const center = wgs84ToGcj02(position.latitude, position.longitude)
  // Only the user's position and accuracy are overlays, never building pins or hitboxes.
  if (typeof sdk.value.CircleMarker === 'function') positionOverlays.push(new sdk.value.CircleMarker({
    center, radius: 6, strokeColor: '#ffffff', strokeWeight: 2, fillColor: '#1677ff', fillOpacity: 1, zIndex: 180,
    bubble: true, cursor: 'default'
  }))
  if (position.accuracy && position.accuracy <= 1000 && typeof sdk.value.Circle === 'function') {
    positionOverlays.push(new sdk.value.Circle({ center, radius: position.accuracy,
      strokeColor: '#1677ff', strokeOpacity: .2, strokeWeight: 1, fillColor: '#1677ff', fillOpacity: .08,
      bubble: true, cursor: 'default' }))
  }
  if (positionOverlays.length) map.value.add(positionOverlays)
}
function updatePosition() {
  drawPosition()
  if (!map.value || !props.position || !props.autoCenter) return
  // The mini map follows the latest fix. The expanded map centers only once,
  // and a slow GPS result must never undo an explicit selection/zoom/drag.
  if (props.interactive && (cameraClaimed || locationCentered)) return
  locationCentered = true
  map.value.setCenter(wgs84ToGcj02(props.position.latitude, props.position.longitude))
}
function labelMapElements() {
  mapContainer.value?.querySelectorAll('iframe').forEach(frame => { if (!frame.title) frame.title = '校园地图交互辅助框架' })
  mapContainer.value?.querySelectorAll('img').forEach(image => {
    if (!image.hasAttribute('alt')) image.alt = image.closest('.amap-logo') ? '高德地图' : ''
  })
}
function bind(event: string, handler: (...args: any[]) => void) {
  listeners.push([event, handler]); map.value.on(event, handler)
}
function clearMap() {
  clearTimeout(deferredClick)
  accessibility?.disconnect()
  for (const [event, handler] of listeners.splice(0)) map.value?.off?.(event, handler)
  if (positionOverlays.length) map.value?.remove(positionOverlays)
  positionOverlays = []
  map.value?.destroy?.()
  map.value = null
}
async function installControls(target: any, version: number) {
  if (!props.interactive) return
  try {
    const [scale, toolbar] = await Promise.all([loadAMapPlugin('AMap.Scale'), loadAMapPlugin('AMap.ToolBar')])
    if (disposed || generation !== version || map.value !== target) return
    target.addControl(new scale.Scale())
    target.addControl(new toolbar.ToolBar({ position: 'RT' }))
  } catch { /* Optional controls do not prevent native map selection. */ }
}
async function init() {
  if (disposed || loading.value) return
  if (!isAMapConfigured()) { error.value = '地图暂不可用，仍可从建筑列表进入频道。'; return }
  const version = ++generation
  loading.value = true; error.value = ''; clearMap()
  try {
    const loaded = await loadAMapSdk()
    await nextTick()
    if (disposed || version !== generation || !mapContainer.value) return
    const camera = startingCamera()
    const target = new loaded.Map(mapContainer.value, { center: camera.center, zoom: camera.zoom,
      viewMode: '2D', resizeEnable: true, mapStyle: 'amap://styles/normal', isHotspot: props.interactive,
      dragEnable: props.interactive, zoomEnable: props.interactive, scrollWheel: props.interactive,
      doubleClickZoom: props.interactive, keyboardEnable: props.interactive, rotateEnable: false, pitchEnable: false })
    sdk.value = loaded; map.value = target
    pendingFocus = null
    bind('hotspotclick', event => {
      if (!props.interactive || gesture || Date.now() < suppressUntil) return
      const poi = readNativeMapPoi(event)
      if (!poi) return
      cameraClaimed = true
      clearTimeout(deferredClick)
      suppressUntil = Date.now() + 200
      emit('poiClick', poi)
    })
    bind('click', event => {
      if (gesture || Date.now() < suppressUntil) return
      const point = readMapCoordinate(event?.lnglat)
      if (!point) return
      cameraClaimed = true
      clearTimeout(deferredClick)
      // AMap may dispatch both events for a single tap. Native POI identity wins.
      deferredClick = setTimeout(() => { if (!disposed && !gesture && Date.now() >= suppressUntil) emit('mapClick', point) }, 220)
    })
    for (const event of ['dragstart', 'zoomstart']) bind(event, () => { cameraClaimed = true; gesture = true; clearTimeout(deferredClick) })
    for (const event of ['dragend', 'zoomend']) bind(event, () => { gesture = false; suppressUntil = Date.now() + 250; publishCamera() })
    bind('moveend', publishCamera)
    labelMapElements()
    accessibility = new MutationObserver(labelMapElements)
    accessibility.observe(mapContainer.value, { childList: true, subtree: true })
    drawPosition()
    if (props.position && props.autoCenter) locationCentered = true
    publishCamera()
    void installControls(target, version)
    emit('ready')
  } catch { if (!disposed && version === generation) error.value = '地图暂时打不开，请重试或从建筑列表进入频道。' }
  finally { if (!disposed && version === generation) loading.value = false }
}
watch(() => props.position, updatePosition)
// Data refreshes, selected IDs and zoom events never re-fit or rebuild the map.
onMounted(() => {
  if (props.lazy && host.value && typeof IntersectionObserver !== 'undefined') {
    intersection = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { intersection?.disconnect(); void init() }
    }, { rootMargin: '180px' })
    intersection.observe(host.value)
  } else void init()
})
onBeforeUnmount(() => { disposed = true; generation++; intersection?.disconnect(); clearMap() })
defineExpose({ focusCoordinate })
</script>

<template>
  <section ref="host" class="real-map-card" :style="{ height }">
    <header v-if="title || subtitle"><h3 v-if="title">{{ title }}</h3><p v-if="subtitle">{{ subtitle }}</p></header>
    <div class="map-frame">
      <div ref="mapContainer" class="real-campus-map" role="region" aria-label="高德校园地图" />
      <div v-if="loading" class="map-state" role="status">正在展开校园地图…</div>
      <div v-if="error" class="map-state map-error" role="status"><p>{{ error }}</p><button type="button" @click="init">重新加载地图</button></div>
    </div>
  </section>
</template>

<style scoped>
.real-map-card { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.real-map-card header { padding: 14px 18px; }
.real-map-card h3 { margin: 0; font-size: 16px; }
.real-map-card header p { margin: 5px 0 0; font-size: 12px; color: #60715f; }
.map-frame { position: relative; flex: 1; min-height: 0; overflow: hidden; background: #edf1e8; }
.real-campus-map { position: absolute; inset: 0; width: 100%; height: 100%; }
.map-state { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 12px; padding: 24px; background: #f4f6edd9; color: #48604d; font-size: 14px; text-align: center; pointer-events: none; }
.map-error { pointer-events: auto; }
.map-error button { min-height: 44px; border: 1px solid #b6c6b5; border-radius: 12px; padding: 8px 18px; background: #fffef9; color: #36533c; cursor: pointer; }
</style>

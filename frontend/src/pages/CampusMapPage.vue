<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showFailToast, showSuccessToast } from 'vant'
import RealCampusMap from '@/components/RealCampusMap.vue'
import TechIcon from '@/components/TechIcon.vue'
import { bindBuildingMapPoi, type Building } from '@/api/buildings'
import { useAuthStore } from '@/stores/auth'
import { useBuildingsStore } from '@/stores/buildings'
import { useMapAutoLocation } from '@/composables/useMapAutoLocation'
import { formatBuildingDisplayName } from '@/utils/buildings'
import { boundPoiBuilding, buildingMapCoordinate, nearbyBuildingCandidates, readMapCoordinate, searchCampusBuildings } from '@/utils/mapSelection'
import { getAMapPoiDetails } from '@/utils/amap'
import { readRecentChatEntries } from '@/utils/chat'
import { createScopedStorage } from '@/utils/scopedStorage'
import { goBack } from '@/utils/navigation'
import { savedRouteView } from '@/utils/routeScroll'
import type { MapCoordinate, NativeMapPoi } from '@/types/map'

const router = useRouter()
const route = useRoute()
const viewState = savedRouteView(route.fullPath)
const auth = useAuthStore()
const buildings = useBuildingsStore()
const session = useMapAutoLocation()
session.attachUser(auth.currentUser?.id ?? null)
const focusUserOnOpen = route.query.locate === '1'
const focusBuildingOnOpen = Boolean(route.query.building)
const mapView = ref<InstanceType<typeof RealCampusMap> | null>(null)
const directoryScroll = ref<HTMLElement | null>(null)
function revealSelection() { void nextTick(() => directoryScroll.value?.scrollTo({ top: 0 })) }
const query = ref(typeof viewState.query === 'string' ? viewState.query : '')
const category = ref(typeof viewState.category === 'string' && ['全部', '教学', '图书', '生活'].includes(viewState.category) ? viewState.category : '全部')
const point = ref<MapCoordinate | null>(session.selectedPoi?.coordinate ?? null)
const resolving = ref(false)
const binding = ref(false)
const categories = ['全部', '教学', '图书', '生活']
const visibleCount = ref(typeof viewState.visibleCount === 'number' && Number.isInteger(viewState.visibleCount)
  ? Math.max(40, Math.min(10000, viewState.visibleCount)) : 40)
let selectionVersion = 0
let disposed = false
const selected = computed(() => buildings.buildings.find(item => item.id === session.selectedBuildingId) ?? null)
const bound = computed(() => session.selectedPoi ? boundPoiBuilding(buildings.buildings, session.selectedPoi.id) : null)
const nearby = computed(() => point.value
  ? nearbyBuildingCandidates(buildings.buildings, point.value, session.selectedPoi?.name)
  : session.selectedPoi ? searchCampusBuildings(buildings.buildings, session.selectedPoi.name, 8).map(building => ({ building, distance: null })) : [])
const results = computed(() => {
  const filtered = buildings.buildings.filter(item => category.value === '全部' || (category.value === '教学'
    ? /教学|教[一二三四五六七八九1-9]|学院|实验|双创|实训/.test(item.name)
    : category.value === '图书' ? /图书|自习|阅览/.test(item.name) : /食堂|公寓|宿舍|超市|驿站|体育|医院/.test(item.name)))
  return searchCampusBuildings(filtered, query.value, filtered.length)
})
const visibleResults = computed(() => results.value.slice(0, visibleCount.value))
watch([query, category], () => { visibleCount.value = 40; revealSelection() })
const recent = computed(() => {
  const userId = auth.currentUser?.id
  if (!userId) return []
  const ids = new Set(readRecentChatEntries(createScopedStorage(userId)).map(entry => entry.buildingId))
  return [...ids].map(id => buildings.buildings.find(item => item.id === id)).filter((item): item is Building => Boolean(item)).slice(0, 5)
})
const locationLabel = computed(() => session.locating ? '正在获取当前位置…' : session.position ? `定位时间 ${new Date(session.position.locatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}${session.position.accuracy ? ` · 精度约 ${Math.round(session.position.accuracy)} 米` : ' · 精度未知'}` : '尚未获取位置，不影响选楼聊天')

function clearSelection() {
  selectionVersion++; resolving.value = false; point.value = null
  session.selectedPoi = null; session.selectedBuildingId = null
}
function selectBuilding(building: Building, focus = false) {
  selectionVersion++; resolving.value = false
  session.selectedBuildingId = building.id
  revealSelection()
  if (focus) { session.selectedPoi = null; point.value = null; mapView.value?.focusCoordinate(buildingMapCoordinate(building)) }
}
async function onPoi(poi: NativeMapPoi) {
  const version = ++selectionVersion
  query.value = ''; category.value = '全部'
  session.selectedPoi = poi; point.value = poi.coordinate
  session.selectedBuildingId = boundPoiBuilding(buildings.buildings, poi.id)?.id ?? null
  resolving.value = false
  revealSelection()
  if (!poi.coordinate && !session.selectedBuildingId) {
    resolving.value = true
    try {
      const details = await getAMapPoiDetails(poi.id)
      if (disposed || version !== selectionVersion || !details) return
      session.selectedPoi = { ...poi, name: details.name || poi.name, coordinate: readMapCoordinate(details.location) }
      point.value = session.selectedPoi.coordinate
    } catch { /* Searchable local building directory remains available. */ }
    finally { if (!disposed && version === selectionVersion) resolving.value = false }
  }
}
function onPoint(coordinate: MapCoordinate) {
  clearSelection(); query.value = ''; point.value = coordinate; revealSelection()
}
function enterChannel() {
  if (selected.value) void router.push({ path: `/buildings/${selected.value.id}/chats`, query: { from: 'map' } })
}
async function locate() {
  const position = await session.locate()
  if (!position || disposed) return
  await nextTick()
  mapView.value?.focusCoordinate(buildingMapCoordinate(position), 17)
}
async function bindSelected() {
  const building = selected.value
  const poi = session.selectedPoi
  if (!building || !poi || binding.value || auth.currentUser?.role !== 'admin') return
  try { await showConfirmDialog({ title: '确认地图地点关联', message: `将高德地点“${poi.name}”关联到“${formatBuildingDisplayName(building.name)}”？之后点击该地点会打开这个建筑的频道入口。` }) }
  catch { return }
  binding.value = true
  try {
    await bindBuildingMapPoi(building.id, { poi_id: poi.id, name: poi.name })
    buildings.invalidate(); await buildings.ensureLoaded()
    showSuccessToast('已关联，历史频道保持不变')
  } catch { showFailToast('关联未完成，请确认管理员权限、网络以及是否已关联其他建筑') }
  finally { binding.value = false }
}
async function load() {
  try {
    await buildings.ensureLoaded()
    if (disposed) return
    const requested = Number(route.query.building)
    const building = buildings.buildings.find(item => item.id === requested)
    if (building) {
      selectBuilding(building, true)
      // Consume one-shot focus instructions so returning from a channel does
      // not replay them over the user's subsequently changed map camera.
      void router.replace('/map')
    }
    else if (session.selectedPoi && !selected.value) session.selectedBuildingId = bound.value?.id ?? null
  } catch { /* Directory error is displayed with a retry action. */ }
}
onMounted(() => {
  void load()
  if (focusUserOnOpen && !focusBuildingOnOpen) void router.replace('/map')
})
onBeforeUnmount(() => { disposed = true; selectionVersion++ })
</script>

<template>
  <section class="campus-map-page" :data-route-content-ready="!buildings.loading || buildings.loaded"
    :data-route-view-state="JSON.stringify({ query, category, visibleCount })">
    <header class="map-page-header">
      <button class="map-back" type="button" aria-label="返回校园" @click="goBack(router, '/home')"><TechIcon name="arrow" :size="22" /></button>
      <div class="map-page-title"><h1>校园地图</h1><p>选一栋建筑，进入这里的频道</p></div>
      <button class="locate-button" type="button" :disabled="session.locating" @click="locate"><TechIcon name="aim" :size="19" />{{ session.locating ? '定位中…' : '定位我' }}</button>
    </header>
    <div class="map-workspace">
      <div class="map-canvas-pane">
        <RealCampusMap ref="mapView" height="100%" :camera="focusUserOnOpen ? null : session.camera" :position="session.position" :auto-center="!focusBuildingOnOpen"
          @camera-change="session.rememberCamera" @poi-click="onPoi" @map-click="onPoint" />
      </div>
      <aside class="map-directory" aria-label="选择建筑进入频道">
        <div ref="directoryScroll" class="directory-scroll" data-scroll-region="map-directory">
          <p class="map-location-copy" :class="{ 'map-warning': session.locationError }" role="status">{{ session.locationError || locationLabel }}</p>
          <section v-if="selected" class="map-selected-building" aria-label="选中的建筑">
            <div class="selection-heading"><span>{{ bound?.id === selected.id ? '已关联原生地点' : session.selectedPoi ? '请核对建筑后进入' : '已选校园建筑' }}</span><button type="button" aria-label="取消建筑选择" @click="clearSelection"><TechIcon name="close" :size="18" /></button></div>
            <h2>{{ formatBuildingDisplayName(selected.name) }}</h2>
            <p v-if="session.selectedPoi">地图地点：{{ session.selectedPoi.name }}</p><p v-else>{{ selected.type }}</p>
            <button class="enter-channel-button" type="button" @click="enterChannel"><TechIcon name="chat" :size="19" />选择频道<TechIcon name="arrow" :size="18" /></button>
            <small>先看看这里的留言；发布时再验证你是否在附近。</small>
            <button v-if="auth.currentUser?.role === 'admin' && session.selectedPoi && !bound" class="binding-button" type="button" :disabled="binding" @click="bindSelected">{{ binding ? '正在关联…' : '管理员：关联此地图地点' }}</button>
          </section>
          <section v-else-if="session.selectedPoi || point" class="map-candidates" aria-label="附近建筑候选">
            <div class="selection-heading"><span>{{ session.selectedPoi ? '原生地点' : '从点击位置附近选择' }}</span><button type="button" aria-label="取消地点选择" @click="clearSelection"><TechIcon name="close" :size="18" /></button></div>
            <h2>{{ session.selectedPoi?.name || '你想进入哪栋建筑？' }}</h2>
            <p>{{ resolving ? '正在查询地点信息…' : '请从下方确认建筑，不会自动进入距离最近的频道。' }}</p>
            <button v-for="candidate in nearby" :key="candidate.building.id" type="button" class="candidate-row" @click="selectBuilding(candidate.building)"><span>{{ formatBuildingDisplayName(candidate.building.name) }}</span><small>{{ candidate.distance === null ? '名称候选' : `距点击处约 ${Math.round(candidate.distance)} 米` }}</small><TechIcon name="arrow" :size="16" /></button>
            <p v-if="!nearby.length && !resolving">附近没有已收录建筑，可以继续搜索校内建筑。</p>
          </section>
          <div v-else class="map-selection-intro"><span class="fresh-kicker">从地点开始聊</span><h2>点地图上的原生地点</h2><p>地图没有标出的楼，也能在下面找到。</p></div>
          <label class="map-building-search"><TechIcon name="search" :size="19" /><input v-model="query" type="search" aria-label="搜索校园建筑" placeholder="搜索建筑，如教4、图书馆" maxlength="100" /></label>
          <div class="map-category-tabs" role="group" aria-label="建筑类型"><button v-for="item in categories" :key="item" type="button" :aria-pressed="category === item" @click="category = item">{{ item }}</button></div>
          <div v-if="recent.length && !query && !point && !session.selectedPoi" class="map-recent"><h3>最近去过</h3><div><button v-for="building in recent" :key="building.id" type="button" @click="selectBuilding(building, true)">{{ formatBuildingDisplayName(building.name) }}</button></div></div>
          <p v-if="buildings.loading" role="status">正在加载建筑目录…</p>
          <div v-if="buildings.errorMessage" class="map-warning" role="alert"><p>建筑目录暂时未能加载，地图仍可查看。</p><button type="button" @click="load">重新加载建筑</button></div>
          <section class="map-building-results" aria-label="建筑列表">
            <header><h3>{{ query ? '搜索结果' : '校园建筑' }}</h3><span>{{ results.length }} 处</span></header>
            <button v-for="building in visibleResults" :key="building.id" type="button" :aria-pressed="selected?.id === building.id" @click="selectBuilding(building, true)"><span class="directory-building-icon"><TechIcon name="building" :size="20" /></span><span><strong>{{ formatBuildingDisplayName(building.name) }}</strong><small>{{ building.type }}</small></span><TechIcon name="arrow" :size="17" /></button>
            <button v-if="visibleResults.length < results.length" class="directory-more" type="button" @click="visibleCount += 40">加载更多地点（已显示 {{ visibleResults.length }} / {{ results.length }}）</button>
            <p v-if="!results.length && !buildings.loading">没有找到建筑，试试名称或“教4”这样的简称。</p>
          </section>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.campus-map-page { position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column; height: 100dvh; background: #f7f8f0; color: #354c3c; }
.map-page-header { display: flex; align-items: center; gap: 14px; padding: calc(12px + var(--app-safe-area-top, env(safe-area-inset-top, 0px))) 22px 12px; border-bottom: 1px solid #e0e6d9; background: #fffef9; }
button { font: inherit; cursor: pointer; color: inherit; }
button:disabled { opacity: .55; cursor: wait; }
button:focus-visible,input:focus-visible { outline: 2px solid #4f7558; outline-offset: 3px; }
.map-back { width: 44px; height: 44px; border: 1px solid #dfe6d7; border-radius: 15px; background: #f2f5eb; }
.map-back :deep(svg) { transform: rotate(180deg); }
.map-page-title { flex: 1; }
.map-page-title h1 { font-size: 20px; margin: 0; }
.map-page-title p { font-size: 12px; margin: 5px 0 0; color: #61715e; }
.locate-button { display: flex; align-items: center; gap: 7px; min-height: 44px; border: 1px solid #d8e2d0; border-radius: 15px; padding: 8px 15px; background: #edf3e6; }
.map-workspace { display: grid; grid-template-columns: minmax(0, 1fr) 350px; flex: 1; min-height: 0; }
.map-canvas-pane { min-width: 0; min-height: 0; }
.map-directory { min-height: 0; background: #fffef9; border-left: 1px solid #dfe6d7; }
.directory-scroll { height: 100%; overflow-y: auto; overscroll-behavior: contain; padding: 18px 18px calc(20px + env(safe-area-inset-bottom, 0px)); box-sizing: border-box; }
.map-location-copy { font-size: 11px; line-height: 1.7; color: #64705e; margin: 0 0 14px; }
.map-selection-intro h2,.map-selected-building h2,.map-candidates h2 { font-size: 20px; margin: 8px 0; overflow-wrap: anywhere; }
.map-selection-intro p,.map-candidates p,.map-selected-building p { font-size: 12px; color: #62705c; line-height: 1.7; margin: 8px 0; }
.map-selected-building,.map-candidates { padding: 16px; border: 1px solid #d5dfcb; border-radius: 20px; background: #f1f5e9; margin-bottom: 18px; }
.selection-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: #536b4d; }
.selection-heading button { display: grid; place-items: center; width: 44px; height: 44px; border: 0; border-radius: 12px; background: #e7eede; flex-shrink: 0; }
.enter-channel-button { display: flex; align-items: center; justify-content: center; gap: 12px; width: 100%; min-height: 48px; border: 0; border-radius: 14px; background: #42634a; color: white; margin: 14px 0 10px; }
.map-selected-building > small { display: block; font-size: 11px; color: #596d51; line-height: 1.6; }
.binding-button { margin-top: 12px; min-height: 44px; border: 1px solid #bbcbb0; border-radius: 12px; background: #fffef9; padding: 8px; font-size: 12px; }
.candidate-row { display: grid; grid-template-columns: 1fr auto; gap: 4px 6px; width: 100%; min-height: 56px; padding: 10px 0; text-align: left; border: 0; border-top: 1px solid #dce5d4; background: transparent; font-size: 13px; }
.candidate-row small { grid-column: 1; font-size: 10px; color: #65745f; }
.candidate-row > :deep(svg) { grid-column: 2; grid-row: 1/3; align-self: center; }
.map-building-search { display: flex; align-items: center; gap: 9px; padding: 0 12px; background: #f2f4ec; border: 1px solid #dbe4d3; border-radius: 14px; margin: 18px 0 10px; }
.map-building-search input { min-width: 0; width: 100%; min-height: 48px; padding: 9px 0; font: inherit; font-size: 16px; background: transparent; border: 0; color: #354c3c; }
.map-category-tabs { display: flex; gap: 7px; margin-bottom: 16px; }
.map-category-tabs button { flex: 1; min-height: 44px; padding: 6px; border: 1px solid #e1e7d9; border-radius: 12px; background: #fffef9; font-size: 12px; }
.map-category-tabs button[aria-pressed=true] { background: #e6eddb; border-color: #b5c9a5; color: #36532f; }
.map-recent h3,.map-building-results h3 { margin: 0; font-size: 13px; }
.map-recent { margin-bottom: 20px; }
.map-recent > div { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.map-recent button { min-height: 44px; border-radius: 12px; border: 1px solid #e1ddeb; background: #f2eef5; padding: 8px 10px; font-size: 12px; }
.map-building-results > header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.map-building-results > header span { font-size: 11px; color: #65735e; }
.map-building-results > button { display: flex; align-items: center; gap: 11px; width: 100%; min-height: 68px; text-align: left; border: 0; border-bottom: 1px solid #e8eddf; border-radius: 12px; background: transparent; padding: 10px 8px; }
.map-building-results > button[aria-pressed=true] { background: #edf3e5; }
.map-building-results > .directory-more { justify-content: center; min-height: 48px; color: #365b40; background: #edf3e5; margin-top: 8px; }
.directory-building-icon { display: grid; place-items: center; width: 34px; height: 38px; flex-shrink: 0; border-radius: 10px; background: #edf1e7; color: #6b825c; }
.map-building-results > button > span:nth-child(2) { flex: 1; min-width: 0; }
.map-building-results strong { display: block; font-size: 13px; overflow-wrap: anywhere; }
.map-building-results small { display: block; margin-top: 5px; font-size: 11px; color: #64725e; }
.map-building-results > p,.map-warning { font-size: 12px; line-height: 1.8; }
.map-warning { color: #9a4933; }
.map-warning button { min-height: 44px; border: 1px solid #decaba; background: #fff8ef; border-radius: 12px; padding: 8px; }
@media (max-width: 700px) {
  .map-page-header { gap: 10px; padding-inline: 12px; }
  .map-page-title h1 { font-size: 17px; }
  .map-page-title p { font-size: 10px; }
  .locate-button { padding-inline: 10px; font-size: 12px; }
  .map-workspace { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(160px, 1fr) minmax(150px, 40%); }
  .map-directory { border-left: 0; border-top: 1px solid #d3ddc9; }
  .directory-scroll { padding-top: 13px; }
  .map-location-copy { margin-bottom: 7px; }
  .map-selection-intro h2 { font-size: 17px; }
  .map-selected-building,.map-candidates { padding: 12px 14px; }
}
</style>

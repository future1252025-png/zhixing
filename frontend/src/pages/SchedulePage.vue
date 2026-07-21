<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { isAxiosError } from 'axios'
import { showFailToast, showToast } from 'vant'
import { useRoute, useRouter } from 'vue-router'

import { getBuildings, type Building } from '@/api/buildings'
import { getCourses } from '@/api/courses'
import { getScheduleSuggestion } from '@/api/schedule'
import RealCampusMap from '@/components/RealCampusMap.vue'
import TechIcon from '@/components/TechIcon.vue'
import { useLocationStore } from '@/stores/location'
import type { Course } from '@/types/course'
import type { CampusMapPoint } from '@/types/map'
import type { ScheduleSuggestion } from '@/types/schedule'
import {
  filterScheduleLocations,
  formatDistance,
  getLocationDisplayInfo,
  getStatusMeta,
  type SearchableScheduleLocation
} from '@/utils/schedule'

type ScheduleLocationOption = SearchableScheduleLocation & {
  source: 'building'
  building_id: number | null
  description?: string | null
}

const router = useRouter()
const route = useRoute()
const locationStore = useLocationStore()
const buildings = ref<Building[]>([])
const courses = ref<Course[]>([])
const selectedOption = ref('')
const startQuery = ref('')
const destinationQuery = ref('')
const selectedDestination = ref<Building | null>(null)
const suggestion = ref<ScheduleSuggestion | null>(null)
const loading = ref(true)
const generating = ref(false)
const errorMessage = ref('')
/** Route map is secondary to the departure card; start collapsed after a suggestion. */
const mapExpanded = ref(true)

const hasCourses = computed(() => courses.value.length > 0)
const startLocations = computed<ScheduleLocationOption[]>(() =>
  buildings.value.map((building) => ({
    id: building.id,
    source: 'building' as const,
    name: building.name,
    type: building.type,
    building_id: building.id,
    latitude: building.latitude,
    longitude: building.longitude,
    description: building.walk_hint
  }))
)
const startSearchResults = computed(() =>
  filterScheduleLocations(startLocations.value, startQuery.value, 10)
)
const destinationSearchResults = computed(() =>
  filterScheduleLocations(buildings.value, destinationQuery.value, 10)
)
const statusMeta = computed(() =>
  suggestion.value ? getStatusMeta(suggestion.value.status) : null
)
const routeFromPoint = computed<CampusMapPoint | null>(() => {
  const location = locationStore.selectedLocation
  if (!location) return null
  return {
    name: location.name,
    latitude: location.latitude,
    longitude: location.longitude
  }
})
const suggestionRouteToPoint = computed<CampusMapPoint | null>(() => {
  if (selectedDestination.value) {
    return {
      id: selectedDestination.value.id,
      name: selectedDestination.value.name,
      latitude: selectedDestination.value.latitude,
      longitude: selectedDestination.value.longitude
    }
  }
  if (!suggestion.value) return null
  return {
    id: suggestion.value.target_building.id,
    name: suggestion.value.target_building.name,
    latitude: suggestion.value.target_building.latitude,
    longitude: suggestion.value.target_building.longitude
  }
})
const routeReady = computed(() => Boolean(routeFromPoint.value && suggestionRouteToPoint.value))

function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const code = error.response?.data?.code
    const message = error.response?.data?.message
    if (code === 'no_upcoming_course') return '本教学周暂无后续课程'
    if (code === 'semester_unconfigured') return '请先在课表页设置学期'
    if (code === 'semester_not_active') return '当前日期不在已设置的教学周内'
    if (code === 'schedule_conflict') return '同一时间存在多门课程，请先修复课表冲突'
    if (code === 'course_location_incomplete') return '下一节课的地点不完整，请先补全教学楼和教室'
    if (typeof message === 'string') return message
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') return detail
  }
  return '出发建议生成失败，请稍后重试'
}

function applySelectedOption(value: string) {
  selectedOption.value = value
  suggestion.value = null
  if (value.startsWith('building:')) {
    const id = Number(value.replace('building:', ''))
    const building = buildings.value.find((item) => item.id === id)
    if (building) {
      locationStore.selectBuilding(building)
      startQuery.value = building.name
    }
  }
}

function selectStartLocation(location: ScheduleLocationOption) {
  applySelectedOption(`${location.source}:${location.id}`)
}

function selectDestination(building: Building) {
  selectedDestination.value = building
  destinationQuery.value = building.name
}

function locationTitle(location: Pick<SearchableScheduleLocation, 'name' | 'type'>): string {
  return getLocationDisplayInfo(location).title
}

function locationSubtitle(location: Pick<SearchableScheduleLocation, 'name' | 'type'>): string {
  return getLocationDisplayInfo(location).subtitle
}

function clearDestination() {
  selectedDestination.value = null
  destinationQuery.value = ''
}

async function loadScheduleData() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [buildingResult, courseResult] = await Promise.all([
      getBuildings(),
      getCourses().catch(() => [])
    ])
    buildings.value = buildingResult
    courses.value = courseResult

    if (!locationStore.selectedLocation && buildingResult.length > 0) {
      applySelectedOption(`building:${buildingResult[0].id}`)
    }
    const destinationId = Number(route.query.destination)
    if (Number.isFinite(destinationId)) {
      const destination = buildingResult.find((item) => item.id === destinationId)
      if (destination) selectDestination(destination)
    }
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    loading.value = false
  }
}

async function useBrowserLocation() {
  try {
    const location = await locationStore.requestBrowserLocation()
    selectedOption.value = location.source
    startQuery.value = location.source === 'fallback'
      ? '校园中心'
      : '浏览器定位：当前位置'
    suggestion.value = null
    showToast(location.source === 'fallback'
      ? '定位超时，已使用校园中心，可搜索调整'
      : '已使用当前位置')
  } catch {
    showFailToast(locationStore.browserError || '浏览器定位失败，请手动选择当前位置')
  }
}

async function generateSuggestion() {
  const payload = locationStore.suggestionPayload
  if (!payload) {
    showFailToast('请先选择当前位置')
    return
  }

  generating.value = true
  errorMessage.value = ''
  try {
    suggestion.value = await getScheduleSuggestion(payload)
    // Keep the departure time first; map is one tap away.
    mapExpanded.value = false
  } catch (error) {
    suggestion.value = null
    errorMessage.value = getErrorMessage(error)
  } finally {
    generating.value = false
  }
}

function toggleRouteMap() {
  mapExpanded.value = !mapExpanded.value
}

onMounted(loadScheduleData)
</script>

<template>
  <section class="page schedule-page">
    <van-nav-bar title="准备出发" />
    <div class="page-content schedule-content">
      <header v-reveal="{ from: 'left', distance: 40 }" class="journey-hero">
        <div class="journey-copy">
          <span class="fresh-kicker">不用急，算好时间再出发</span>
          <h1 class="fresh-heading">从这里，走到<br />今天的下一站。</h1>
          <p class="fresh-copy">选一个起点，智行会结合下一节课，给你留出从容的步行时间。</p>
        </div>

        <div class="journey-illustration" aria-hidden="true">
          <span class="journey-sun"></span>
          <span class="journey-hill hill-a"></span>
          <span class="journey-hill hill-b"></span>
          <svg viewBox="0 0 260 120">
            <path class="journey-shadow" d="M7 96C48 41 89 103 133 63S203 29 252 52" />
            <path class="journey-path" pathLength="1" d="M7 96C48 41 89 103 133 63S203 29 252 52" />
          </svg>
          <span class="walk-dot dot-start"></span>
          <span class="walk-dot dot-end"><TechIcon name="route" :size="17" /></span>
        </div>

        <div class="journey-meta">
          <div><span>已保存课程</span><strong>{{ courses.length }}</strong></div>
          <div><span>校园地点</span><strong>{{ buildings.length }}</strong></div>
          <div><span>当前位置</span><strong>{{ locationStore.selectedLocation ? '已选择' : '待选择' }}</strong></div>
        </div>
      </header>

      <section
        v-reveal="{ from: 'right', distance: 38, stagger: 48 }"
        class="route-planner fresh-card"
      >
        <header class="planner-heading">
          <div>
            <span>路线安排</span>
            <h2>你现在在哪里？</h2>
            <p>终点可以不选，我们会使用下一节课的地点。</p>
          </div>
          <button type="button" aria-label="刷新地点和课程" @click="loadScheduleData">
            <van-icon name="replay" />
          </button>
        </header>

        <div v-if="loading" class="planner-loading" aria-live="polite">
          <span><i></i><i></i><i></i></span>
          <p>正在整理地点和课程...</p>
        </div>

        <van-empty v-else-if="errorMessage && !suggestion" image="error" :description="errorMessage">
          <div class="page-actions">
            <van-button
              v-if="!hasCourses"
              type="primary"
              size="small"
              @click="router.push('/courses/new')"
            >
              添加课程
            </van-button>
            <van-button plain size="small" @click="loadScheduleData">重新加载</van-button>
          </div>
        </van-empty>

        <template v-else>
          <div class="route-node start-node">
            <span class="node-pin"><i></i></span>
            <div class="node-body">
              <div class="node-label">
                <span>起点</span>
                <button type="button" :disabled="locationStore.browserLoading" @click="useBrowserLocation">
                  <van-icon name="aim" />
                  {{ locationStore.browserLoading ? '定位中' : '用当前位置' }}
                </button>
              </div>

              <van-search
                id="locationSearch"
                v-model="startQuery"
                shape="round"
                placeholder="搜索图书馆、教学楼、食堂..."
              />

              <div class="location-result-list">
                <button
                  v-for="location in startSearchResults"
                  :key="`${location.source}-${location.id}`"
                  type="button"
                  :class="{ active: selectedOption === `${location.source}:${location.id}` }"
                  :aria-pressed="selectedOption === `${location.source}:${location.id}`"
                  @click="selectStartLocation(location)"
                >
                  <i></i>
                  <span>
                    <strong>{{ locationTitle(location) }}</strong>
                    <small>{{ locationSubtitle(location) }}</small>
                  </span>
                </button>
              </div>

              <div v-if="locationStore.selectedLocation" class="selected-place">
                <span><van-icon name="success" /></span>
                <div>
                  <small>起点已选择</small>
                  <strong>
                    {{ locationTitle({
                      name: locationStore.selectedLocation.name,
                      type: locationStore.selectedLocation.source === 'browser'
                        ? '浏览器定位'
                        : locationStore.selectedLocation.source === 'fallback'
                          ? '校园中心'
                          : '校园地点'
                    }) }}
                  </strong>
                  <p>{{ locationStore.selectedLocation.description || '从这里出发' }}</p>
                </div>
              </div>
            </div>
          </div>

          <div class="route-connector" aria-hidden="true">
            <i></i><i></i><i></i><i></i>
          </div>

          <div class="route-node end-node">
            <span class="node-pin"><i></i></span>
            <div class="node-body">
              <div class="node-label">
                <span>终点</span>
                <small>选填 · 默认下一节课</small>
              </div>

              <van-search
                id="destinationSearch"
                v-model="destinationQuery"
                shape="round"
                placeholder="想先预览其他终点？"
              />

              <div class="location-result-list">
                <button
                  v-for="building in destinationSearchResults"
                  :key="building.id"
                  type="button"
                  :class="{ active: selectedDestination?.id === building.id }"
                  :aria-pressed="selectedDestination?.id === building.id"
                  @click="selectDestination(building)"
                >
                  <i></i>
                  <span>
                    <strong>{{ locationTitle(building) }}</strong>
                    <small>{{ locationSubtitle(building) }}</small>
                  </span>
                </button>
              </div>

              <div v-if="selectedDestination" class="selected-place selected-destination">
                <span><van-icon name="flag-o" /></span>
                <div>
                  <small>预览终点</small>
                  <strong>{{ locationTitle(selectedDestination) }}</strong>
                  <p>{{ locationSubtitle(selectedDestination) }}</p>
                </div>
                <button type="button" aria-label="改回下一节课终点" @click="clearDestination">
                  <van-icon name="cross" />
                </button>
              </div>
            </div>
          </div>

          <button
            class="generate-button"
            type="button"
            :disabled="generating"
            @click="generateSuggestion"
          >
            <span><TechIcon name="route" :size="22" /></span>
            <span>
              <strong>{{ generating ? '正在计算步行时间' : '看看什么时候出发' }}</strong>
              <small>{{ generating ? '请稍候片刻' : '给路上留一点从容' }}</small>
            </span>
            <TechIcon v-if="!generating" name="arrow" :size="20" />
            <span v-else class="soft-loader"></span>
          </button>
        </template>
      </section>

      <section
        v-if="suggestion && statusMeta"
        v-reveal="{ from: 'right', distance: 42, stagger: 55 }"
        class="departure-card"
      >
        <span class="ticket-leaf" aria-hidden="true"></span>
        <div class="departure-time">
          <span :class="statusMeta.className">{{ statusMeta.label }}</span>
          <p>建议出发</p>
          <strong>{{ suggestion.suggest_departure_time }}</strong>
        </div>

        <div class="course-destination">
          <small>下一节课</small>
          <h2>{{ suggestion.next_course.course_name }}</h2>
          <p>
            {{ suggestion.next_course.start_time }}—{{ suggestion.next_course.end_time }}
            · {{ suggestion.target_building.name }} {{ suggestion.next_course.room_name }}
          </p>
          <span v-if="suggestion.next_course.teacher">{{ suggestion.next_course.teacher }}</span>
          <span v-if="suggestion.next_course.weeks">{{ suggestion.next_course.weeks }} 周</span>
        </div>

        <div class="route-summary">
          <article>
            <span>从</span>
            <strong>{{ suggestion.from_location.name }}</strong>
          </article>
          <i><TechIcon name="arrow" :size="18" /></i>
          <article>
            <span>到</span>
            <strong>{{ suggestion.target_building.name }}</strong>
          </article>
        </div>

        <div class="walking-metrics">
          <div><span>距离</span><strong>{{ formatDistance(suggestion.distance_meters) }}</strong></div>
          <div><span>步行</span><strong>{{ suggestion.walk_minutes }} 分钟</strong></div>
          <div><span>余量</span><strong>{{ suggestion.buffer_minutes }} 分钟</strong></div>
        </div>

        <p class="suggestion-text">{{ suggestion.text }}</p>
        <p v-if="suggestion.warning" class="warning-text">{{ suggestion.warning }}</p>
      </section>

      <section
        v-if="routeReady"
        v-reveal="{ from: 'left', distance: 42 }"
        class="map-card fresh-card"
        :class="{ collapsed: !mapExpanded }"
      >
        <button
          type="button"
          class="map-toggle"
          :aria-expanded="mapExpanded"
          @click="toggleRouteMap"
        >
          <div class="fresh-section-heading">
            <div>
              <h2>沿着这条路走</h2>
              <p>{{ mapExpanded ? '校园步行路线仅供参考' : '点开查看路线预览' }}</p>
            </div>
          </div>
          <span class="map-toggle-action">
            {{ mapExpanded ? '收起地图' : '展开地图' }}
            <TechIcon name="arrow" :size="16" />
          </span>
        </button>
        <div v-if="mapExpanded" class="map-body">
          <RealCampusMap
            title=""
            subtitle=""
            :from-point="routeFromPoint"
            :to-point="suggestionRouteToPoint"
            :walking-route="true"
            height="300px"
          />
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.schedule-page {
  background:
    radial-gradient(circle at 102% 4%, rgba(111, 159, 170, 0.18), transparent 20rem),
    radial-gradient(circle at -15% 52%, rgba(144, 174, 131, 0.12), transparent 19rem);
}

.schedule-content {
  display: grid;
  gap: 18px;
}

.journey-hero {
  position: relative;
  min-height: 374px;
  overflow: hidden;
  border-radius: 34px 34px 26px 34px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.5), transparent 44%),
    #dfecee;
  padding: 25px 22px 18px;
  box-shadow: var(--fresh-shadow-soft);
}

.journey-copy {
  position: relative;
  z-index: 3;
  max-width: 360px;
}

.journey-copy .fresh-heading {
  font-size: clamp(31px, 8.7vw, 43px);
}

.journey-copy .fresh-copy {
  max-width: 315px;
}

.journey-illustration {
  position: absolute;
  right: 11px;
  bottom: 67px;
  left: 11px;
  height: 130px;
}

.journey-illustration svg {
  position: absolute;
  inset: 0;
  z-index: 2;
  width: 100%;
  height: 100%;
  overflow: visible;
  fill: none;
}

.journey-shadow {
  stroke: rgba(77, 125, 91, 0.12);
  stroke-linecap: round;
  stroke-width: 10;
}

.journey-path {
  stroke: var(--fresh-green);
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  stroke-linecap: round;
  stroke-width: 2.1;
  animation: journey-grow 1.55s 350ms var(--fresh-spring) forwards;
}

.journey-sun {
  position: absolute;
  top: -22px;
  right: 22px;
  z-index: 1;
  width: 39px;
  height: 39px;
  border-radius: 50%;
  background: var(--fresh-sun);
  box-shadow: 0 0 0 11px rgba(242, 200, 111, 0.13);
  animation: journey-sun 4s ease-in-out infinite;
}

.journey-hill {
  position: absolute;
  bottom: -49px;
  border-radius: 50%;
}

.hill-a {
  right: -37px;
  width: 230px;
  height: 118px;
  background: rgba(126, 166, 126, 0.18);
}

.hill-b {
  bottom: -60px;
  left: -55px;
  width: 260px;
  height: 125px;
  background: rgba(111, 159, 170, 0.12);
}

.walk-dot {
  position: absolute;
  z-index: 3;
  display: grid;
  width: 13px;
  height: 13px;
  place-items: center;
  border: 4px solid #dfecee;
  border-radius: 50%;
  background: var(--fresh-green);
  box-sizing: content-box;
  animation: dot-pop 520ms var(--fresh-spring) both;
}

.dot-start {
  bottom: 18px;
  left: 17%;
  animation-delay: 720ms;
}

.dot-end {
  top: 24px;
  right: 14%;
  width: 34px;
  height: 34px;
  border-width: 5px;
  background: var(--fresh-paper);
  color: #5b8992;
  animation-delay: 1.1s;
}

.journey-meta {
  position: absolute;
  right: 18px;
  bottom: 17px;
  left: 18px;
  z-index: 4;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.57);
  padding: 10px 4px;
}

.journey-meta div {
  display: grid;
  gap: 3px;
  padding: 0 10px;
}

.journey-meta div + div {
  border-left: 1px solid rgba(79, 125, 88, 0.13);
}

.journey-meta span {
  color: var(--fresh-muted);
  font-size: 12px;
}

.journey-meta strong {
  overflow: hidden;
  color: var(--fresh-ink);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.route-planner {
  padding: 19px 17px 17px;
}

.planner-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 13px;
  margin-bottom: 17px;
}

.planner-heading > div > span {
  color: var(--fresh-green);
  font-size: 12px;
  font-weight: 720;
}

.planner-heading h2 {
  margin: 4px 0 0;
  color: var(--fresh-ink);
  font-size: 22px;
}

.planner-heading p {
  margin: 5px 0 0;
  color: var(--fresh-muted);
  font-size: 12px;
}

.planner-heading > button {
  display: grid;
  flex: 0 0 auto;
  width: 39px;
  height: 39px;
  place-items: center;
  border: 1px solid var(--fresh-line);
  border-radius: 14px;
  background: #f8faf4;
  color: var(--fresh-green-dark);
  cursor: pointer;
}

.planner-loading {
  display: grid;
  min-height: 180px;
  place-content: center;
  justify-items: center;
  gap: 12px;
  color: var(--fresh-muted);
  font-size: 12px;
}

.planner-loading > span {
  display: flex;
  gap: 5px;
  align-items: flex-end;
  height: 27px;
}

.planner-loading i {
  width: 6px;
  height: 10px;
  border-radius: 999px;
  background: var(--fresh-blue);
  animation: planner-load 850ms ease-in-out infinite alternate;
}

.planner-loading i:nth-child(2) { height: 22px; animation-delay: 150ms; }
.planner-loading i:nth-child(3) { height: 15px; animation-delay: 300ms; }
.planner-loading p { margin: 0; }

.route-node {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 11px;
}

.node-pin {
  position: relative;
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border: 1px solid #a8c0a8;
  border-radius: 50%;
  background: var(--fresh-mint);
}

.node-pin i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--fresh-green);
}

.end-node .node-pin {
  border-color: #aec5ca;
  background: var(--fresh-sky);
}

.end-node .node-pin i {
  background: var(--fresh-blue);
}

.node-body {
  min-width: 0;
}

.node-label {
  display: flex;
  min-height: 28px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 5px;
}

.node-label > span {
  color: var(--fresh-ink);
  font-size: 12px;
  font-weight: 750;
}

.node-label > button {
  display: flex;
  min-height: 30px;
  align-items: center;
  gap: 5px;
  border: 0;
  background: transparent;
  color: var(--fresh-green-dark);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  padding: 0 3px;
}

.node-label > button:disabled {
  color: #8c988e;
  cursor: wait;
  opacity: 1;
}

.node-label > small {
  color: var(--fresh-muted);
  font-size: 12px;
}

.location-result-list {
  display: flex;
  gap: 7px;
  overflow-x: auto;
  margin-top: 9px;
  padding: 1px 1px 5px;
  scrollbar-width: none;
}

.location-result-list::-webkit-scrollbar { display: none; }

.location-result-list > button {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  flex: 0 0 155px;
  gap: 8px;
  align-items: center;
  min-height: 57px;
  border: 1px solid var(--fresh-line);
  border-radius: 17px;
  background: #fafbf6;
  color: var(--fresh-ink);
  cursor: pointer;
  padding: 9px 10px;
  text-align: left;
}

.location-result-list > button > i {
  width: 8px;
  height: 8px;
  border: 2px solid #b8c4b7;
  border-radius: 50%;
}

.location-result-list > button > span {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.location-result-list strong,
.location-result-list small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.location-result-list strong { font-size: 14px; }
.location-result-list small { color: var(--fresh-muted); font-size: 12px; }

.location-result-list > button.active {
  border-color: #96b39a;
  background: var(--fresh-mint);
  color: var(--fresh-green-dark);
}

.end-node .location-result-list > button.active {
  border-color: #a6c1c6;
  background: var(--fresh-sky);
  color: #4e7c85;
}

.location-result-list > button.active > i {
  border-color: var(--fresh-green);
  background: var(--fresh-green);
  box-shadow: 0 0 0 4px rgba(79, 125, 88, 0.1);
}

.selected-place {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 9px;
  align-items: center;
  margin-top: 9px;
  border-radius: 17px;
  background: #eef4ea;
  padding: 10px;
}

.selected-place > span {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 50%;
  background: #fff;
  color: var(--fresh-green);
}

.selected-place > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.selected-place small { color: var(--fresh-green); font-size: 12px; font-weight: 720; }
.selected-place strong { overflow: hidden; color: var(--fresh-ink); font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
.selected-place p { overflow: hidden; margin: 0; color: var(--fresh-muted); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }

.selected-destination {
  grid-template-columns: auto minmax(0, 1fr) auto;
  background: #eaf2f3;
}

.selected-destination > span { color: var(--fresh-blue); }

.selected-destination > button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid #c5d7d9;
  border-radius: 11px;
  background: #fff;
  color: #628791;
  cursor: pointer;
}

.route-connector {
  display: flex;
  width: 24px;
  height: 53px;
  flex-direction: column;
  align-items: center;
  justify-content: space-around;
}

.route-connector i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #9fb3a0;
  animation: connector-drop 1.5s ease-in-out infinite;
}

.route-connector i:nth-child(2) { animation-delay: 150ms; }
.route-connector i:nth-child(3) { animation-delay: 300ms; }
.route-connector i:nth-child(4) { animation-delay: 450ms; }

.generate-button {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 11px;
  align-items: center;
  width: 100%;
  min-height: 68px;
  margin-top: 17px;
  overflow: hidden;
  border: 0;
  border-radius: 20px;
  background: var(--fresh-green-dark);
  color: #fff;
  cursor: pointer;
  padding: 12px 15px 12px 10px;
  text-align: left;
  box-shadow: 0 13px 28px rgba(49, 91, 59, 0.2);
}

.generate-button > span:first-child {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.14);
}

.generate-button > span:nth-child(2) {
  display: grid;
  gap: 3px;
}

.generate-button strong { font-size: 16px; font-weight: 760; }
.generate-button small { color: rgba(255, 255, 255, 0.82); font-size: 13px; }

.generate-button:disabled {
  background: #86988a;
  color: #fff;
  cursor: wait;
  opacity: 1;
  box-shadow: none;
}

.soft-loader {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: loader-spin 780ms linear infinite;
}

.map-card {
  overflow: hidden;
  padding: 14px 16px 16px;
}

.map-card.collapsed {
  padding-bottom: 12px;
}

.map-toggle {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  width: 100%;
  min-height: 52px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 4px 2px 10px;
  text-align: left;
}

.map-toggle .fresh-section-heading {
  margin: 0;
}

.map-toggle-action {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  background: #eaf2e6;
  color: var(--fresh-green-dark);
  font-size: 13px;
  font-weight: 720;
  padding: 0 12px;
  white-space: nowrap;
}

.map-card.collapsed .map-toggle-action :deep(svg) {
  transform: rotate(90deg);
}

.map-card:not(.collapsed) .map-toggle-action :deep(svg) {
  transform: rotate(-90deg);
}

.map-body {
  margin-top: 2px;
  overflow: hidden;
  border-radius: 18px;
}

.departure-card {
  position: relative;
  overflow: hidden;
  border-radius: 32px 32px 25px 32px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.45), transparent 40%),
    #e5eedf;
  padding: 23px 19px 19px;
  box-shadow: var(--fresh-shadow);
}

.ticket-leaf {
  position: absolute;
  top: -25px;
  right: -10px;
  width: 100px;
  height: 146px;
  border-radius: 100% 0 100% 0;
  background: rgba(111, 159, 112, 0.13);
  transform: rotate(24deg);
}

.departure-time {
  position: relative;
  z-index: 1;
}

.departure-time > span {
  display: inline-flex;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.65);
  color: var(--fresh-green-dark);
  font-size: 12px;
  font-weight: 720;
  padding: 5px 9px;
}

.departure-time > span.tight { color: #a2742e; }
.departure-time > span.late { color: #ad5e56; }

.departure-time p {
  margin: 12px 0 0;
  color: var(--fresh-text);
  font-size: 14px;
  font-weight: 680;
}

.departure-time > strong {
  display: block;
  margin-top: 4px;
  color: var(--fresh-ink);
  font-family: "STKaiti", "KaiTi", sans-serif;
  font-size: clamp(44px, 12vw, 58px);
  line-height: 1;
  letter-spacing: -0.04em;
}

.course-destination {
  margin-top: 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.58);
  padding: 14px;
}

.course-destination small { color: var(--fresh-green); font-size: 12px; font-weight: 720; }
.course-destination h2 { margin: 4px 0 0; color: var(--fresh-ink); font-size: 18px; }
.course-destination p { margin: 6px 0 0; color: var(--fresh-text); font-size: 14px; line-height: 1.55; }
.course-destination > span { display: inline-block; margin-top: 7px; margin-right: 6px; border-radius: 999px; background: #fff; color: var(--fresh-muted); font-size: 12px; padding: 5px 9px; }

.route-summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  margin-top: 13px;
}

.route-summary article {
  display: grid;
  min-width: 0;
  gap: 3px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.5);
  padding: 11px;
}

.route-summary article span { color: var(--fresh-muted); font-size: 12px; }
.route-summary article strong { overflow: hidden; color: var(--fresh-ink); font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.route-summary > i { color: var(--fresh-green); }

.walking-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 13px;
  border-top: 1px solid rgba(79, 125, 88, 0.14);
  padding-top: 13px;
}

.walking-metrics div {
  display: grid;
  gap: 3px;
  padding: 0 10px;
}

.walking-metrics div + div { border-left: 1px solid rgba(79, 125, 88, 0.13); }
.walking-metrics span { color: var(--fresh-muted); font-size: 12px; }
.walking-metrics strong { color: var(--fresh-ink); font-size: 15px; font-weight: 760; }

.suggestion-text {
  margin: 14px 0 0;
  color: var(--fresh-text);
  font-size: 14px;
  line-height: 1.65;
}

.warning-text {
  margin: 10px 0 0;
  border-radius: 14px;
  background: #fae8df;
  color: #9e5f55;
  font-size: 13px;
  line-height: 1.55;
  padding: 12px;
}

@keyframes journey-grow {
  to { stroke-dashoffset: 0; }
}

@keyframes journey-sun {
  50% { transform: translateY(-6px) scale(1.04); }
}

@keyframes dot-pop {
  from { opacity: 0; transform: scale(0.2) rotate(-12deg); }
  70% { transform: scale(1.09) rotate(2deg); }
  to { opacity: 1; transform: none; }
}

@keyframes planner-load {
  to { transform: scaleY(1.42); }
}

@keyframes connector-drop {
  50% { opacity: 0.35; transform: translateY(4px); }
}

@keyframes loader-spin {
  to { transform: rotate(1turn); }
}

@media (max-width: 370px) {
  .journey-hero { min-height: 365px; padding-right: 18px; padding-left: 18px; }
  .journey-meta { right: 13px; left: 13px; }
  .route-planner { padding-right: 14px; padding-left: 14px; }
}

@media (prefers-reduced-motion: reduce) {
  .journey-path,
  .journey-sun,
  .walk-dot,
  .planner-loading i,
  .route-connector i,
  .soft-loader {
    animation: none;
  }

  .journey-path {
    stroke-dashoffset: 0;
  }
}
</style>

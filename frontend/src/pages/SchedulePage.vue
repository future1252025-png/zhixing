<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { isAxiosError } from 'axios'
import { showFailToast, showToast } from 'vant'
import { useRoute, useRouter } from 'vue-router'

import { getBuildings, type Building } from '@/api/buildings'
import { getCourses } from '@/api/courses'
import { getScheduleSuggestion } from '@/api/schedule'
import RealCampusMap from '@/components/RealCampusMap.vue'
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
  if (!location) {
    return null
  }
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
  if (!suggestion.value) {
    return null
  }
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
    const detail = error.response?.data?.detail
    if (detail === 'No upcoming course found') {
      return '暂无后续课程，请先添加课程'
    }
    if (typeof detail === 'string') {
      return detail
    }
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
      getCourses()
    ])
    buildings.value = buildingResult
    courses.value = courseResult

    if (!locationStore.selectedLocation && buildingResult.length > 0) {
      applySelectedOption(`building:${buildingResult[0].id}`)
    }
    const destinationId = Number(route.query.destination)
    if (Number.isFinite(destinationId)) {
      const destination = buildingResult.find((item) => item.id === destinationId)
      if (destination) {
        selectDestination(destination)
      }
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
  if (!hasCourses.value) {
    errorMessage.value = '暂无后续课程，请先添加课程'
    return
  }
  const payload = locationStore.suggestionPayload
  if (!payload) {
    showFailToast('请先选择当前位置')
    return
  }

  generating.value = true
  errorMessage.value = ''
  try {
    suggestion.value = await getScheduleSuggestion(payload)
  } catch (error) {
    suggestion.value = null
    errorMessage.value = getErrorMessage(error)
  } finally {
    generating.value = false
  }
}

onMounted(loadScheduleData)
</script>

<template>
  <section class="page">
    <van-nav-bar title="出发建议" />
    <div class="page-content schedule-content">
      <header v-reveal class="schedule-heading"><span>校园步行建议</span><h1>从这里，到下一站。</h1><p>选择起点和终点；不选终点时，系统自动使用下一节课地点。</p></header>

      <section v-reveal="{ delay: 45 }" class="panel route-control-panel">
        <div class="panel-heading">
          <div>
            <h2>选择路线</h2>
            <p>起点和终点都可以搜索，终点不选时默认下一节课地点。</p>
          </div>
          <van-button size="small" plain @click="loadScheduleData">刷新</van-button>
        </div>

        <p v-if="loading" class="muted-text">正在加载位置和课程...</p>
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
            <van-button plain size="small" @click="loadScheduleData">重试</van-button>
          </div>
        </van-empty>
        <template v-else>
          <label class="field-label" for="locationSearch">起点</label>
          <div class="location-search-block">
            <van-search
              id="locationSearch"
              v-model="startQuery"
              shape="round"
              placeholder="输入起点，例如图书馆、教3、食堂"
            />
            <div class="location-result-list">
              <button
                v-for="location in startSearchResults"
                :key="`${location.source}-${location.id}`"
                type="button"
                :class="{ active: selectedOption === `${location.source}:${location.id}` }"
                @click="selectStartLocation(location)"
              >
                <strong>{{ locationTitle(location) }}</strong>
                <span>{{ locationSubtitle(location) }}</span>
              </button>
            </div>
          </div>

          <div v-if="locationStore.selectedLocation" class="selected-location">
            <strong>{{ locationTitle({
              name: locationStore.selectedLocation.name,
              type: locationStore.selectedLocation.source === 'browser'
                ? '浏览器定位'
                : locationStore.selectedLocation.source === 'fallback'
                  ? '定位兜底'
                  : '已选起点'
            }) }}</strong>
            <span>{{ locationStore.selectedLocation.description || '已选择当前位置' }}</span>
          </div>

          <label class="field-label destination-label" for="destinationSearch">终点</label>
          <div class="location-search-block">
            <van-search
              id="destinationSearch"
              v-model="destinationQuery"
              shape="round"
              placeholder="输入终点；不选则使用下一节课地点"
            />
            <div class="location-result-list">
              <button
                v-for="building in destinationSearchResults"
                :key="building.id"
                type="button"
                :class="{ active: selectedDestination?.id === building.id }"
                @click="selectDestination(building)"
              >
                <strong>{{ locationTitle(building) }}</strong>
                <span>{{ locationSubtitle(building) }}</span>
              </button>
            </div>
          </div>
          <div v-if="selectedDestination" class="selected-location">
            <strong>{{ locationTitle(selectedDestination) }}</strong>
            <span>{{ locationSubtitle(selectedDestination) }} · 已作为地图路线终点</span>
            <button type="button" class="inline-clear" @click="clearDestination">
              改用下一节课终点
            </button>
          </div>

          <div class="page-actions">
            <van-button type="primary" block :loading="generating" @click="generateSuggestion">
              生成出发建议
            </van-button>
            <van-button block plain :loading="locationStore.browserLoading" @click="useBrowserLocation">
              使用浏览器定位
            </van-button>
          </div>
        </template>
      </section>

      <section v-if="routeReady" v-reveal="{ delay: 65 }" class="map-panel">
        <RealCampusMap
          title="路线预览"
          subtitle="地图路线仅用于校园内步行参考"
          :from-point="routeFromPoint"
          :to-point="suggestionRouteToPoint"
          :walking-route="true"
          height="280px"
        />
      </section>

      <section v-if="suggestion && statusMeta" v-reveal="{ delay: 80 }" class="suggestion-ticket">
        <div class="suggestion-header" :class="statusMeta.className">
          <span>{{ statusMeta.label }}</span>
          <strong>{{ suggestion.suggest_departure_time }} 出发</strong>
        </div>

        <div class="course-summary">
          <h2>{{ suggestion.next_course.course_name }}</h2>
          <p>
            {{ suggestion.next_course.start_time }}-{{ suggestion.next_course.end_time }}
            · {{ suggestion.target_building.name }} {{ suggestion.next_course.room_name }}
          </p>
          <p v-if="suggestion.next_course.teacher">教师：{{ suggestion.next_course.teacher }}</p>
          <p v-if="suggestion.next_course.weeks">周次：{{ suggestion.next_course.weeks }}</p>
        </div>

        <div class="route-cards">
          <article>
            <span>起点</span>
            <strong>{{ suggestion.from_location.name }}</strong>
          </article>
          <article>
            <span>终点</span>
            <strong>{{ suggestion.target_building.name }}</strong>
          </article>
        </div>

        <div class="metrics-grid">
          <div>
            <span>距离</span>
            <strong>{{ formatDistance(suggestion.distance_meters) }}</strong>
          </div>
          <div>
            <span>步行</span>
            <strong>{{ suggestion.walk_minutes }} 分钟</strong>
          </div>
          <div>
            <span>缓冲</span>
            <strong>{{ suggestion.buffer_minutes }} 分钟</strong>
          </div>
        </div>

        <p class="suggestion-text">{{ suggestion.text }}</p>
        <p v-if="suggestion.warning" class="warning-text">{{ suggestion.warning }}</p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.schedule-content {
  display: grid;
  gap: 18px;
}

.schedule-heading { padding: 8px 2px 0; }
.schedule-heading span { color: var(--cm-primary); font-size: 12px; font-weight: 700; }
.schedule-heading h1 { margin: 6px 0 6px; font-size: 28px; line-height: 1.2; }
.schedule-heading p { margin: 0; color: var(--cm-muted); font-size: 14px; line-height: 1.65; }

.panel {
  border: 1px solid var(--cm-line);
  border-radius: var(--cm-radius);
  background: var(--cm-surface);
  padding: 15px 14px;
  box-shadow: 0 8px 24px rgba(28, 50, 42, 0.05);
}

.panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.panel-heading h2 {
  margin: 0;
  color: var(--cm-ink);
  font-size: 20px;
  font-weight: 760;
  line-height: 1.25;
}

.panel-heading p,
.muted-text {
  margin: 4px 0 0;
  color: var(--cm-muted);
  font-size: 14px;
}

.field-label {
  display: block;
  margin-bottom: 8px;
  color: var(--cm-text);
  font-size: 14px;
  font-weight: 700;
}

.destination-label {
  margin-top: 14px;
}

.location-search-block {
  display: grid;
  gap: 9px;
}

.location-search-block :deep(.van-search) {
  padding: 0;
  background: transparent;
}

.location-result-list {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 3px;
}

.location-result-list button {
  display: grid;
  flex: 0 0 178px;
  gap: 2px;
  min-height: 66px;
  border: 1px solid var(--cm-line);
  border-radius: var(--cm-radius);
  background: #fff;
  color: var(--cm-ink);
  cursor: pointer;
  padding: 9px 11px;
  text-align: left;
  transition:
    transform var(--cm-motion),
    border-color var(--cm-motion),
    box-shadow var(--cm-motion),
    background var(--cm-motion);
}

.location-result-list button.active {
  border-color: var(--cm-primary);
  background: var(--cm-primary-soft);
  color: var(--cm-primary-dark);
  box-shadow: 0 8px 18px rgba(11, 118, 111, 0.12);
}

.location-result-list button:active {
  transform: translateY(1px);
}

.location-result-list strong {
  font-size: 13px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.location-result-list span {
  color: var(--cm-muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected-location {
  display: grid;
  gap: 4px;
  margin-top: 10px;
  border: 1px solid var(--cm-line);
  border-left: 4px solid var(--cm-primary);
  border-radius: var(--cm-radius);
  background: #fff;
  padding: 11px;
  box-shadow: 0 6px 16px rgba(28, 50, 42, 0.05);
}

.selected-location span {
  color: var(--cm-muted);
  font-size: 13px;
}

.inline-clear {
  width: fit-content;
  border: 0;
  background: transparent;
  color: var(--cm-primary);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  padding: 0;
}

.map-panel {
  overflow: hidden;
  border: 1px solid var(--cm-line);
  border-radius: var(--cm-radius);
  background: var(--cm-surface);
  padding: 10px;
  box-shadow: 0 8px 24px rgba(28, 50, 42, 0.05);
}

.suggestion-ticket {
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: var(--cm-radius);
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px) 0 0 / 24px 24px,
    linear-gradient(180deg, #17383d 0%, #10272c 100%);
  color: #fff;
  box-shadow: var(--cm-shadow-strong);
  padding: 16px;
}

.suggestion-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid rgba(255,255,255,.18);
  border-radius: 0;
  padding: 0 0 12px;
}

.suggestion-header strong {
  font-size: 19px;
}

.status-normal {
  background: transparent;
  color: #8ed7ca;
}

.status-tight {
  background: transparent;
  color: #f2c76d;
}

.status-late {
  background: transparent;
  color: #ff9aa4;
}

.course-summary {
  margin: 15px 0;
}

.course-summary h2 {
  margin: 0 0 7px;
  color: #fff;
  font-size: 21px;
  font-weight: 760;
}

.course-summary p {
  margin: 4px 0 0;
  color: #c7dcd9;
  font-size: 14px;
  line-height: 1.5;
}

.route-cards,
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.metrics-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.route-cards article,
.metrics-grid div {
  display: grid;
  gap: 4px;
  min-width: 0;
  border: 1px solid rgba(255,255,255,.18);
  border-radius: var(--cm-radius-sm);
  background: rgba(255,255,255,.06);
  padding: 11px;
}

.route-cards span,
.metrics-grid span {
  color: #9fbfbb;
  font-size: 12px;
}

.route-cards strong,
.metrics-grid strong {
  overflow-wrap: anywhere;
  font-size: 14px;
}

.suggestion-text {
  margin: 15px 0 0;
  color: #fff;
  line-height: 1.65;
}

.warning-text {
  margin: 10px 0 0;
  border-radius: var(--cm-radius-sm);
  background: rgba(242,184,75,.15);
  color: #f6d28a;
  font-size: 13px;
  line-height: 1.5;
  padding: 9px 11px;
}
</style>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { isAxiosError } from 'axios'
import { showFailToast, showToast } from 'vant'
import { useRouter } from 'vue-router'

import {
  getBuildings,
  type Building
} from '@/api/buildings'
import RealCampusMap from '@/components/RealCampusMap.vue'
import { getCourses } from '@/api/courses'
import { getScheduleSuggestion } from '@/api/schedule'
import { useLocationStore } from '@/stores/location'
import type { Course } from '@/types/course'
import type { CampusMapPoint } from '@/types/map'
import type { ScheduleSuggestion } from '@/types/schedule'
import {
  formatDistance,
  filterScheduleLocations,
  getStatusMeta,
  type SearchableScheduleLocation
} from '@/utils/schedule'

type ScheduleLocationOption = SearchableScheduleLocation & {
  source: 'building'
  building_id: number | null
  description?: string | null
}

const router = useRouter()
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
const startLocations = computed<ScheduleLocationOption[]>(() => [
  ...buildings.value.map((building) => ({
    id: building.id,
    source: 'building' as const,
    name: building.name,
    type: building.type,
    building_id: building.id,
    latitude: building.latitude,
    longitude: building.longitude,
    description: building.walk_hint
  }))
])
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
const customRouteToPoint = computed<CampusMapPoint | null>(() => {
  if (!selectedDestination.value) {
    return null
  }
  return {
    id: selectedDestination.value.id,
    name: selectedDestination.value.name,
    latitude: selectedDestination.value.latitude,
    longitude: selectedDestination.value.longitude
  }
})
const suggestionRouteToPoint = computed<CampusMapPoint | null>(() => {
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
const customRouteVisible = computed(() =>
  Boolean(routeFromPoint.value && customRouteToPoint.value)
)

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

    if (!locationStore.selectedLocation || locationStore.selectedLocation.source === 'preset') {
      if (buildingResult.length > 0) {
        applySelectedOption(`building:${buildingResult[0].id}`)
      }
    }
    if (!destinationQuery.value && buildingResult.length > 0) {
      destinationQuery.value = ''
    }
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    loading.value = false
  }
}

async function useBrowserLocation() {
  try {
    await locationStore.requestBrowserLocation()
    selectedOption.value = 'browser'
    startQuery.value = '浏览器定位：当前位置'
    suggestion.value = null
    showToast('已使用浏览器定位')
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
    <div class="page-content">
      <section class="hero-panel schedule-hero">
        <span class="hero-eyebrow">下一站建议</span>
        <h1 class="hero-title">从当前位置到下一节课</h1>
        <p class="hero-copy">基于课程表、建筑坐标和 10 分钟缓冲时间，生成可演示的出发建议。</p>
      </section>

      <section class="surface-panel panel">
        <div class="panel-heading">
          <div>
            <h2>当前位置</h2>
            <p>搜索校园建筑作为起点，也可以使用浏览器定位</p>
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
          <label class="field-label" for="locationSelect">当前位置</label>
          <div class="location-search-block">
            <van-search
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
                <strong>{{ location.name }}</strong>
                <span>{{ location.type }}</span>
              </button>
            </div>
          </div>

          <div v-if="locationStore.selectedLocation" class="selected-location">
            <strong>{{ locationStore.selectedLocation.name }}</strong>
            <span>{{ locationStore.selectedLocation.description || '已选择当前位置' }}</span>
          </div>

          <label class="field-label destination-label" for="destinationSearch">路线终点</label>
          <div class="location-search-block">
            <van-search
              id="destinationSearch"
              v-model="destinationQuery"
              shape="round"
              placeholder="输入终点，例如教4、实验楼、食堂；不选则默认下一节课"
            />
            <div class="location-result-list">
              <button
                v-for="building in destinationSearchResults"
                :key="building.id"
                type="button"
                :class="{ active: selectedDestination?.id === building.id }"
                @click="selectDestination(building)"
              >
                <strong>{{ building.name }}</strong>
                <span>{{ building.type }}</span>
              </button>
            </div>
          </div>
          <div v-if="selectedDestination" class="selected-location">
            <strong>{{ selectedDestination.name }}</strong>
            <span>已作为地图路线终点</span>
            <button type="button" class="inline-clear" @click="clearDestination">
              使用下一节课终点
            </button>
          </div>

          <div class="page-actions">
            <van-button
              type="primary"
              block
              :loading="generating"
              @click="generateSuggestion"
            >
              生成出发建议
            </van-button>
            <van-button
              block
              plain
              :loading="locationStore.browserLoading"
              @click="useBrowserLocation"
            >
              使用浏览器定位
            </van-button>
          </div>
        </template>
      </section>

      <section v-if="customRouteVisible" class="surface-panel panel suggestion-panel">
        <div class="panel-heading compact">
          <div>
            <h2>自选路线预览</h2>
            <p>这一路线只用于地图导航预览，不会影响下一节课出发时间。</p>
          </div>
        </div>

        <RealCampusMap
          title="自选路线"
          subtitle="优先使用高德步行路线规划，失败时显示直线兜底"
          :from-point="routeFromPoint"
          :to-point="customRouteToPoint"
          :walking-route="true"
          height="260px"
        />

        <div class="route-cards">
          <article>
            <span>起点</span>
            <strong>{{ routeFromPoint?.name }}</strong>
          </article>
          <article>
            <span>终点</span>
            <strong>{{ selectedDestination?.name }}</strong>
          </article>
        </div>
      </section>

      <section v-if="suggestion && statusMeta" class="surface-panel panel suggestion-panel">
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

        <RealCampusMap
          title="真实地图路径建议"
          subtitle="优先使用高德步行路线规划，失败时显示直线兜底"
          :from-point="routeFromPoint"
          :to-point="suggestionRouteToPoint"
          :walking-route="true"
          height="260px"
        />

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
.panel {
  padding: 14px;
}

.schedule-hero {
  margin-bottom: 14px;
}

.panel + .panel {
  margin-top: 14px;
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
  font-size: 19px;
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
  gap: 8px;
}

.location-search-block :deep(.van-search) {
  padding: 0;
  background: transparent;
}

.location-result-list {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.location-result-list button {
  display: grid;
  flex: 0 0 136px;
  gap: 2px;
  min-height: 54px;
  border: 1px solid var(--cm-line);
  border-radius: 10px;
  background: #ffffff;
  color: var(--cm-ink);
  cursor: pointer;
  font: inherit;
  padding: 8px 10px;
  text-align: left;
}

.location-result-list button.active {
  border-color: var(--cm-primary);
  background: var(--cm-primary-soft);
  color: var(--cm-primary-dark);
}

.location-result-list strong {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  border-radius: 8px;
  background: #f8fbff;
  padding: 10px;
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
  padding: 0;
}

.suggestion-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-radius: 8px;
  padding: 10px 12px;
}

.suggestion-header strong {
  font-size: 18px;
}

.status-normal {
  background: var(--cm-green-soft);
  color: var(--cm-green);
}

.status-tight {
  background: var(--cm-amber-soft);
  color: #b45309;
}

.status-late {
  background: var(--cm-red-soft);
  color: var(--cm-red);
}

.course-summary {
  margin: 14px 0;
}

.course-summary h2 {
  margin: 0 0 6px;
  color: var(--cm-ink);
  font-size: 19px;
}

.course-summary p {
  margin: 4px 0 0;
  color: var(--cm-text);
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
  border: 1px solid var(--cm-line);
  border-radius: 8px;
  background: #f8fbff;
  padding: 10px;
}

.route-cards span,
.metrics-grid span {
  color: var(--cm-muted);
  font-size: 12px;
}

.route-cards strong,
.metrics-grid strong {
  overflow-wrap: anywhere;
  font-size: 14px;
}

.suggestion-text {
  margin: 14px 0 0;
  color: var(--cm-ink);
  line-height: 1.6;
}

.warning-text {
  margin: 10px 0 0;
  border-radius: 8px;
  background: var(--cm-amber-soft);
  color: #b45309;
  font-size: 13px;
  line-height: 1.5;
  padding: 8px 10px;
}
</style>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { isAxiosError } from 'axios'
import { showFailToast, showToast } from 'vant'
import { useRouter } from 'vue-router'

import {
  getBuildings,
  getLocationPresets,
  type Building,
  type LocationPreset
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
  getStatusMeta
} from '@/utils/schedule'

const router = useRouter()
const locationStore = useLocationStore()
const presets = ref<LocationPreset[]>([])
const buildings = ref<Building[]>([])
const courses = ref<Course[]>([])
const selectedOption = ref('')
const suggestion = ref<ScheduleSuggestion | null>(null)
const loading = ref(true)
const generating = ref(false)
const errorMessage = ref('')

const hasCourses = computed(() => courses.value.length > 0)
const statusMeta = computed(() =>
  suggestion.value ? getStatusMeta(suggestion.value.status) : null
)
const routeFromPoint = computed<CampusMapPoint | null>(() => {
  if (!suggestion.value) {
    return null
  }
  return {
    name: suggestion.value.from_location.name,
    latitude: suggestion.value.from_location.latitude,
    longitude: suggestion.value.from_location.longitude
  }
})
const routeToPoint = computed<CampusMapPoint | null>(() => {
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
  if (value.startsWith('preset:')) {
    const id = Number(value.replace('preset:', ''))
    const preset = presets.value.find((item) => item.id === id)
    if (preset) {
      locationStore.selectPreset(preset)
    }
    return
  }
  if (value.startsWith('building:')) {
    const id = Number(value.replace('building:', ''))
    const building = buildings.value.find((item) => item.id === id)
    if (building) {
      locationStore.selectBuilding(building)
    }
  }
}

async function loadScheduleData() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [presetResult, buildingResult, courseResult] = await Promise.all([
      getLocationPresets(),
      getBuildings(),
      getCourses()
    ])
    presets.value = presetResult
    buildings.value = buildingResult
    courses.value = courseResult

    if (!locationStore.selectedLocation) {
      if (presetResult.length > 0) {
        applySelectedOption(`preset:${presetResult[0].id}`)
      } else if (buildingResult.length > 0) {
        applySelectedOption(`building:${buildingResult[0].id}`)
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
    await locationStore.requestBrowserLocation()
    selectedOption.value = 'browser'
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
            <p>选择预设位置或校园建筑作为起点</p>
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
          <select
            id="locationSelect"
            class="location-select"
            :value="selectedOption"
            @change="applySelectedOption(($event.target as HTMLSelectElement).value)"
          >
            <option value="">请选择当前位置</option>
            <optgroup v-if="presets.length > 0" label="位置预设">
              <option
                v-for="preset in presets"
                :key="`preset-${preset.id}`"
                :value="`preset:${preset.id}`"
              >
                {{ preset.name }}
              </option>
            </optgroup>
            <optgroup v-if="buildings.length > 0" label="校园建筑">
              <option
                v-for="building in buildings"
                :key="`building-${building.id}`"
                :value="`building:${building.id}`"
              >
                {{ building.name }}
              </option>
            </optgroup>
            <option v-if="locationStore.selectedLocation?.source === 'browser'" value="browser">
              浏览器定位：当前位置
            </option>
          </select>

          <div v-if="locationStore.selectedLocation" class="selected-location">
            <strong>{{ locationStore.selectedLocation.name }}</strong>
            <span>{{ locationStore.selectedLocation.description || '已选择当前位置' }}</span>
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
          subtitle="用高德地图展示当前位置、目标建筑和直线方向"
          :from-point="routeFromPoint"
          :to-point="routeToPoint"
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

.location-select {
  width: 100%;
  min-height: 42px;
  border: 1px solid var(--cm-line);
  border-radius: 8px;
  background: #ffffff;
  color: var(--cm-ink);
  font: inherit;
  padding: 0 10px;
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

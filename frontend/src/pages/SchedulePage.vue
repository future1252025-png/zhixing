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
import { getCourses } from '@/api/courses'
import { getScheduleSuggestion } from '@/api/schedule'
import { useLocationStore } from '@/stores/location'
import type { Course } from '@/types/course'
import type { ScheduleSuggestion } from '@/types/schedule'
import {
  formatDistance,
  getRouteVisualPoints,
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
const routeVisual = computed(() => {
  if (!suggestion.value) {
    return null
  }
  return getRouteVisualPoints(
    suggestion.value.from_location,
    suggestion.value.target_building
  )
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
      <section class="panel">
        <div class="panel-heading">
          <div>
            <h1>下一节课怎么走</h1>
            <p>选择当前位置，生成出发时间和步行建议</p>
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

      <section v-if="suggestion && statusMeta" class="panel suggestion-panel">
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

        <div v-if="routeVisual" class="route-visual">
          <div
            class="route-line"
            :style="{
              left: `${routeVisual.from.left}%`,
              top: `${routeVisual.from.top}%`,
              width: `${routeVisual.lineWidth}%`,
              transform: `rotate(${routeVisual.lineAngle}deg)`
            }"
          />
          <div
            class="route-point from"
            :style="{ left: `${routeVisual.from.left}%`, top: `${routeVisual.from.top}%` }"
          >
            起
          </div>
          <div
            class="route-point to"
            :style="{ left: `${routeVisual.to.left}%`, top: `${routeVisual.to.top}%` }"
          >
            到
          </div>
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
.panel {
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 1px 5px rgb(15 23 42 / 8%);
  padding: 14px;
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

.panel-heading h1 {
  margin: 0;
  font-size: 21px;
  line-height: 1.25;
}

.panel-heading p,
.muted-text {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 14px;
}

.field-label {
  display: block;
  margin-bottom: 8px;
  color: #374151;
  font-size: 14px;
  font-weight: 700;
}

.location-select {
  width: 100%;
  min-height: 42px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #ffffff;
  color: #1f2937;
  font: inherit;
  padding: 0 10px;
}

.selected-location {
  display: grid;
  gap: 4px;
  margin-top: 10px;
  border-radius: 8px;
  background: #f6f7fb;
  padding: 10px;
}

.selected-location span {
  color: #6b7280;
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
  background: #e8f7ef;
  color: #047857;
}

.status-tight {
  background: #fff7ed;
  color: #c2410c;
}

.status-late {
  background: #fef2f2;
  color: #b91c1c;
}

.course-summary {
  margin: 14px 0;
}

.course-summary h2 {
  margin: 0 0 6px;
  font-size: 19px;
}

.course-summary p {
  margin: 4px 0 0;
  color: #4b5563;
  font-size: 14px;
  line-height: 1.5;
}

.route-visual {
  position: relative;
  height: 180px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background:
    linear-gradient(90deg, rgb(229 231 235 / 65%) 1px, transparent 1px),
    linear-gradient(rgb(229 231 235 / 65%) 1px, transparent 1px),
    #f8fafc;
  background-size: 36px 36px;
}

.route-line {
  position: absolute;
  height: 3px;
  transform-origin: left center;
  border-radius: 999px;
  background: #1677ff;
}

.route-point {
  position: absolute;
  display: grid;
  width: 34px;
  height: 34px;
  transform: translate(-50%, -50%);
  place-items: center;
  border: 3px solid #ffffff;
  border-radius: 50%;
  box-shadow: 0 2px 8px rgb(15 23 42 / 18%);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
}

.route-point.from {
  background: #16a34a;
}

.route-point.to {
  background: #1677ff;
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
  border-radius: 8px;
  background: #f6f7fb;
  padding: 10px;
}

.route-cards span,
.metrics-grid span {
  color: #6b7280;
  font-size: 12px;
}

.route-cards strong,
.metrics-grid strong {
  overflow-wrap: anywhere;
  font-size: 14px;
}

.suggestion-text {
  margin: 14px 0 0;
  color: #1f2937;
  line-height: 1.6;
}

.warning-text {
  margin: 10px 0 0;
  border-radius: 8px;
  background: #fff7ed;
  color: #c2410c;
  font-size: 13px;
  line-height: 1.5;
  padding: 8px 10px;
}
</style>

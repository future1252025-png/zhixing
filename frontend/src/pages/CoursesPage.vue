<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { isAxiosError } from 'axios'
import { showConfirmDialog, showFailToast, showSuccessToast } from 'vant'
import { useRouter } from 'vue-router'

import { deleteCourse, getCourses } from '@/api/courses'
import type { Course } from '@/types/course'
import {
  filterCoursesByWeek,
  getCourseTimeSlots,
  readSelectedWeek,
  WEEKDAYS,
  writeSelectedWeek
} from '@/utils/course'

const router = useRouter()
const courses = ref<Course[]>([])
const loading = ref(true)
const deletingId = ref<number | null>(null)
const activeCourse = ref<Course | null>(null)
const actionSheetVisible = ref(false)
const errorMessage = ref('')
const selectedWeek = ref(
  typeof window === 'undefined' ? 1 : readSelectedWeek(window.localStorage)
)
const weekOptions = Array.from({ length: 20 }, (_, index) => index + 1)
const timeSlots = getCourseTimeSlots()
const courseActionOptions = [
  { name: '编辑课程' },
  { name: '删除课程', color: '#d92d20' }
]
const visibleCourses = computed(() => filterCoursesByWeek(courses.value, selectedWeek.value))

function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') {
      return detail
    }
  }
  return '课程请求失败，请稍后重试'
}

async function loadCourses() {
  loading.value = true
  errorMessage.value = ''
  try {
    courses.value = await getCourses()
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    loading.value = false
  }
}

function openCreatePage(query: Record<string, string> = {}) {
  router.push({ path: '/courses/new', query })
}

function openImportPage() {
  router.push('/courses/import')
}

function openEditPage(courseId: number) {
  router.push(`/courses/${courseId}/edit`)
}

function openCreateForSlot(weekday: number, slot: { start_time: string; end_time: string }) {
  openCreatePage({
    weekday: String(weekday),
    start_time: slot.start_time,
    end_time: slot.end_time
  })
}

function getCellCourses(weekday: number, slot: { start_time: string; end_time: string }) {
  return visibleCourses.value
    .filter(
      (course) =>
        course.weekday === weekday &&
        course.start_time < slot.end_time &&
        course.end_time > slot.start_time
    )
    .sort((left, right) => {
      if (left.start_time === right.start_time) {
        return left.id - right.id
      }
      return left.start_time.localeCompare(right.start_time)
    })
}

function getCourseTone(course: Course): string {
  return `tone-${course.id % 6}`
}

function openCourseActions(course: Course) {
  activeCourse.value = course
  actionSheetVisible.value = true
}

async function handleCourseAction(action: { name: string }) {
  const course = activeCourse.value
  actionSheetVisible.value = false
  if (!course) {
    return
  }
  if (action.name === '编辑课程') {
    openEditPage(course.id)
  }
  if (action.name === '删除课程') {
    await confirmDelete(course)
  }
}

async function confirmDelete(course: Course) {
  try {
    await showConfirmDialog({
      title: '删除课程',
      message: `确认删除「${course.course_name}」吗？`
    })
  } catch {
    return
  }

  deletingId.value = course.id
  try {
    await deleteCourse(course.id)
    showSuccessToast('课程已删除')
    await loadCourses()
  } catch (error) {
    showFailToast(getErrorMessage(error))
  } finally {
    deletingId.value = null
  }
}

watch(selectedWeek, (week) => {
  if (typeof window !== 'undefined') {
    writeSelectedWeek(window.localStorage, week)
  }
})

onMounted(loadCourses)
</script>

<template>
  <section class="page">
    <van-nav-bar title="课程表" />
    <div class="page-content">
      <div class="hero-panel course-hero">
        <div>
          <span class="hero-eyebrow">课程驱动出发建议</span>
          <h1 class="hero-title">我的课程</h1>
          <p class="hero-copy">按星期查看课程安排，出发建议会自动寻找未来最近一节课。</p>
        </div>
        <div class="hero-actions">
          <van-button plain type="primary" size="small" icon="description" @click="openImportPage">
            导入课表
          </van-button>
          <van-button type="primary" size="small" icon="plus" @click="openCreatePage">
            新增课程
          </van-button>
        </div>
      </div>

      <section class="week-switcher surface-panel">
        <label for="week-select">当前周次</label>
        <select id="week-select" v-model.number="selectedWeek" class="week-select">
          <option v-for="week in weekOptions" :key="week" :value="week">
            第 {{ week }} 周
          </option>
        </select>
        <span>仅显示本周有课的课程</span>
      </section>

      <p v-if="loading" class="muted-text">正在加载课程...</p>
      <van-empty v-else-if="errorMessage" image="error" :description="errorMessage">
        <van-button type="primary" size="small" @click="loadCourses">重试</van-button>
      </van-empty>
      <van-empty v-else-if="courses.length === 0" description="暂无课程">
        <van-button type="primary" size="small" @click="openCreatePage">
          添加第一门课程
        </van-button>
      </van-empty>
      <section v-else class="timetable-shell surface-panel">
        <div class="timetable-scroll" aria-label="周课表">
          <div class="timetable-grid">
            <div class="time-head"></div>
            <div v-for="weekday in WEEKDAYS" :key="weekday.value" class="weekday-head">
              {{ weekday.label.replace('星期', '周') }}
            </div>

            <template v-for="slot in timeSlots" :key="slot.section">
              <div class="time-cell">
                <strong>{{ slot.section }}</strong>
                <span>{{ slot.start_time }}</span>
                <span>{{ slot.end_time }}</span>
              </div>
              <div
                v-for="weekday in WEEKDAYS"
                :key="`${slot.section}-${weekday.value}`"
                class="course-cell"
              >
                <button
                  v-if="getCellCourses(weekday.value, slot).length === 0"
                  type="button"
                  class="empty-cell-button"
                  aria-label="在此时间添加课程"
                  @click="openCreateForSlot(weekday.value, slot)"
                ></button>
                <article
                  v-for="course in getCellCourses(weekday.value, slot)"
                  :key="course.id"
                  class="timetable-course"
                  :class="getCourseTone(course)"
                >
                  <button type="button" class="course-content" @click="openCourseActions(course)">
                    <strong>{{ course.course_name }}</strong>
                    <span>@{{ course.building.name }}</span>
                    <span>{{ course.room_name }}</span>
                    <span v-if="course.teacher">{{ course.teacher }}</span>
                  </button>
                </article>
              </div>
            </template>
          </div>
        </div>
        <p v-if="visibleCourses.length === 0" class="empty-week">第 {{ selectedWeek }} 周暂无课程</p>
      </section>
      <van-action-sheet
        v-model:show="actionSheetVisible"
        :actions="courseActionOptions"
        cancel-text="取消"
        close-on-click-action
        @select="handleCourseAction"
      />
    </div>
  </section>
</template>

<style scoped>
.page-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.course-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.hero-actions {
  display: grid;
  gap: 8px;
  min-width: 92px;
}

.week-switcher {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 8px 12px;
  margin-bottom: 16px;
  padding: 12px 14px;
}

.week-switcher label {
  color: var(--cm-ink);
  font-size: 14px;
  font-weight: 800;
}

.week-switcher span {
  grid-column: 1 / -1;
  color: var(--cm-muted);
  font-size: 12px;
}

.week-select {
  width: 100%;
  min-height: 34px;
  border: 1px solid var(--cm-line);
  border-radius: 8px;
  background: #fff;
  color: var(--cm-ink);
  font: inherit;
  padding: 0 10px;
}

.page-toolbar h1 {
  margin: 0;
  font-size: 22px;
  line-height: 1.25;
}

.page-toolbar p,
.muted-text {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 14px;
}

.timetable-shell {
  padding: 10px;
}

.timetable-scroll {
  overflow: visible;
}

.timetable-grid {
  display: grid;
  grid-template-columns: 34px repeat(7, minmax(0, 1fr));
  width: 100%;
  border: 1px solid #d8e7f5;
  border-radius: 12px;
  background: #f8fbff;
  overflow: hidden;
}

.time-head,
.weekday-head,
.time-cell,
.course-cell {
  border-right: 1px solid #d8e7f5;
  border-bottom: 1px solid #d8e7f5;
}

.weekday-head {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #eef8ff;
  color: #1688df;
  font-size: 11px;
  font-weight: 800;
  line-height: 30px;
  text-align: center;
}

.time-cell {
  display: grid;
  align-content: center;
  gap: 2px;
  min-height: 116px;
  background: #eef8ff;
  color: #1688df;
  text-align: center;
  padding: 5px 2px;
}

.time-cell strong {
  color: #1f2937;
  font-size: 15px;
}

.time-cell span {
  font-size: 10px;
}

.course-cell {
  position: relative;
  min-height: 116px;
  background: rgba(255, 255, 255, 0.72);
  padding: 3px;
}

.timetable-course {
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.58);
  border-radius: 8px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.24);
  overflow: hidden;
}

.timetable-course + .timetable-course {
  margin-top: 4px;
}

.course-content {
  display: grid;
  width: 100%;
  min-height: 96px;
  border: 0;
  background: transparent;
  color: #fff;
  cursor: pointer;
  font: inherit;
  gap: 2px;
  padding: 7px 5px;
  text-align: left;
}

.course-content strong,
.course-content span {
  overflow-wrap: anywhere;
}

.course-content strong {
  font-size: 12px;
  line-height: 1.22;
}

.course-content span {
  font-size: 10px;
  line-height: 1.25;
}

.empty-cell-button {
  position: absolute;
  inset: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.tone-0 {
  background: #79a7ef;
}

.tone-1 {
  background: #d96f91;
}

.tone-2 {
  background: #7fd8c4;
}

.tone-3 {
  background: #e0ad63;
}

.tone-4 {
  background: #9c86df;
}

.tone-5 {
  background: #6e98c8;
}

.empty-week {
  margin: 10px 0 2px;
  color: var(--cm-muted);
  font-size: 13px;
  text-align: center;
}

.text-button {
  border: 0;
  background: transparent;
  color: var(--cm-primary);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  padding: 0;
}

.text-button:disabled {
  color: #98a2b3;
  cursor: not-allowed;
}

.danger {
  color: var(--cm-red);
}
</style>

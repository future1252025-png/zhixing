<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { isAxiosError } from 'axios'
import { showConfirmDialog, showFailToast, showSuccessToast } from 'vant'
import { useRouter } from 'vue-router'

import { deleteCourse, getCourses } from '@/api/courses'
import type { Course } from '@/types/course'
import {
  buildCourseCreateQuery,
  buildCourseColorMap,
  filterCoursesByWeek,
  getCourseTimeSlots,
  getQuickWeekOptions,
  getTeachingWeekOptions,
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
const weekOptions = getTeachingWeekOptions()
const timeSlots = getCourseTimeSlots()
const courseActionOptions = [
  { name: '编辑课程' },
  { name: '删除课程', color: '#e44f5f' }
]
const visibleCourses = computed(() => filterCoursesByWeek(courses.value, selectedWeek.value))
const quickWeekOptions = computed(() => getQuickWeekOptions(selectedWeek.value))
const courseColorMap = computed(() => buildCourseColorMap(visibleCourses.value))
const courseCountText = computed(() =>
  visibleCourses.value.length > 0 ? `${visibleCourses.value.length} 门课` : '本周暂无课'
)

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

function openCreateForCurrentWeek() {
  openCreatePage({ weeks: String(selectedWeek.value) })
}

function openImportPage() {
  router.push('/courses/import')
}

function openEditPage(courseId: number) {
  router.push(`/courses/${courseId}/edit`)
}

function openCreateForSlot(weekday: number, slot: { start_time: string; end_time: string }) {
  openCreatePage(buildCourseCreateQuery(weekday, slot, selectedWeek.value))
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

function getCourseStyle(course: Course): Record<string, string> {
  return {
    background: courseColorMap.value[course.id] ?? '#4f83bd'
  }
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
    <van-nav-bar title="课表" />
    <div class="page-content courses-content">
      <header class="course-toolbar">
        <div><span>我的课表</span><h1>第 {{ selectedWeek }} 周</h1><p>{{ courseCountText }} · 点击课程可编辑或删除</p></div>
        <div class="toolbar-actions"><button type="button" aria-label="导入课表" @click="openImportPage"><van-icon name="description" /></button><button type="button" aria-label="新增课程" @click="openCreateForCurrentWeek"><van-icon name="plus" /></button></div>
      </header>

      <section class="week-panel" aria-label="选择周次">
        <label class="week-select-label" for="courseWeekSelect">
          <span>当前周次</span>
          <select id="courseWeekSelect" v-model.number="selectedWeek">
            <option v-for="week in weekOptions" :key="week" :value="week">
              第 {{ week }} 周
            </option>
          </select>
        </label>
        <div class="week-switcher" aria-label="快捷选择周次">
          <button v-for="week in quickWeekOptions" :key="week" type="button" :class="{ active: selectedWeek === week }" @click="selectedWeek = week"><span>{{ week }}</span><small>周</small></button>
        </div>
      </section>

      <p v-if="loading" class="muted-text">正在加载课程...</p>
      <van-empty v-else-if="errorMessage" image="error" :description="errorMessage">
        <van-button type="primary" size="small" @click="loadCourses">重试</van-button>
      </van-empty>
      <van-empty v-else-if="courses.length === 0" description="暂无课程">
        <van-button type="primary" size="small" @click="openCreateForCurrentWeek">
          添加第一门课程
        </van-button>
      </van-empty>
      <section v-else class="timetable-shell">
        <div class="timetable-grid" aria-label="周课表">
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
                :style="getCourseStyle(course)"
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
        <p v-if="visibleCourses.length === 0" class="empty-week">
          第 {{ selectedWeek }} 周暂无课程，点击空白格即可添加。
        </p>
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
.courses-content {
  display: grid;
  gap: 15px;
}

.timetable-shell {
  overflow: hidden;
  padding: 8px;
}

.timetable-grid {
  display: grid;
  grid-template-columns: 34px repeat(7, minmax(0, 1fr));
  width: 100%;
  border: 1px solid #d7e5ee;
  border-radius: 6px;
  background: rgba(248, 252, 255, 0.9);
  overflow: hidden;
}

.time-head,
.weekday-head,
.time-cell,
.course-cell {
  border-right: 1px solid #d7e5ee;
  border-bottom: 1px solid #d7e5ee;
}

.weekday-head {
  background: #edf8fb;
  color: var(--cm-primary);
  font-size: 10px;
  font-weight: 900;
  line-height: 30px;
  text-align: center;
}

.time-cell {
  display: grid;
  align-content: center;
  gap: 2px;
  min-height: 118px;
  background: #edf8fb;
  color: var(--cm-primary);
  text-align: center;
  padding: 5px 2px;
}

.time-cell strong {
  color: var(--cm-ink);
  font-size: 15px;
}

.time-cell span {
  font-size: 10px;
}

.course-cell {
  position: relative;
  min-height: 118px;
  background: rgba(255, 255, 255, 0.7);
  padding: 3px;
}

.empty-cell-button {
  position: absolute;
  inset: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.empty-cell-button:active {
  background: rgba(15, 127, 120, 0.06);
}

.timetable-course {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.62);
  border-radius: 4px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
}

.timetable-course + .timetable-course {
  margin-top: 4px;
}

.course-content {
  display: grid;
  width: 100%;
  min-height: 98px;
  border: 0;
  background: transparent;
  color: #fff;
  cursor: pointer;
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

.tone-0 {
  background: #6e9fe7;
}

.tone-1 {
  background: #d96f91;
}

.tone-2 {
  background: #67cbb7;
}

.tone-3 {
  background: #dca95b;
}

.tone-4 {
  background: #9a87df;
}

.tone-5 {
  background: #5f8fbe;
}

.empty-week {
  margin: 10px 0 3px;
  color: var(--cm-muted);
  font-size: 13px;
  text-align: center;
}

.course-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 2px 2px;
}

.course-toolbar span {
  color: var(--cm-primary);
  font-size: 12px;
  font-weight: 700;
}

.course-toolbar h1 {
  margin: 3px 0 3px;
  font-size: 27px;
  line-height: 1.2;
}

.course-toolbar p {
  margin: 0;
  color: var(--cm-muted);
  font-size: 12px;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.toolbar-actions button {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid var(--cm-line);
  border-radius: 50%;
  background: #fff;
  color: var(--cm-primary);
  cursor: pointer;
  font-size: 19px;
}

.week-panel {
  display: grid;
  gap: 9px;
}

.week-select-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--cm-line);
  border-radius: var(--cm-radius);
  background: #fff;
  color: var(--cm-text);
  font-size: 13px;
  font-weight: 700;
  padding: 9px 11px;
}

.week-select-label select {
  min-width: 118px;
  border: 1px solid var(--cm-line);
  border-radius: 6px;
  background: #f8faf8;
  color: var(--cm-ink);
  cursor: pointer;
  font: inherit;
  padding: 7px 9px;
}

.week-switcher {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 7px;
  margin: 0;
  padding: 0;
}

.week-switcher button {
  display: grid;
  width: 100%;
  min-width: 0;
  height: 44px;
  place-items: center;
  align-content: center;
  border: 1px solid var(--cm-line);
  border-radius: 6px;
  background: #fff;
  color: var(--cm-muted);
  cursor: pointer;
  line-height: 1;
}

.week-switcher button span {
  color: inherit;
  font-size: 15px;
  font-weight: 750;
}

.week-switcher button small {
  margin-top: 3px;
  font-size: 9px;
}

.week-switcher button.active {
  border-color: var(--cm-primary);
  background: var(--cm-primary);
  color: #fff;
}

@media (max-width: 390px) {
  .week-switcher {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

.timetable-shell {
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0;
}

.timetable-grid {
  border-color: var(--cm-line);
  border-radius: 6px;
  background: #fff;
}

.time-head,
.weekday-head,
.time-cell,
.course-cell {
  border-color: var(--cm-line);
}

.weekday-head,
.time-cell {
  background: #eef3ef;
}

.weekday-head {
  color: var(--cm-text);
  font-weight: 700;
}

.time-cell {
  color: var(--cm-muted);
}

.course-cell {
  background: #fff;
}

.timetable-course {
  border: 0;
  border-radius: 4px;
  box-shadow: none;
}

.tone-0 { background: #4f83bd; }
.tone-1 { background: #c86d7e; }
.tone-2 { background: #4ca891; }
.tone-3 { background: #c29243; }
.tone-4 { background: #7f72b5; }
.tone-5 { background: #587b91; }
</style>

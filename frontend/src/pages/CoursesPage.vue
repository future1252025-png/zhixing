<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { showConfirmDialog, showFailToast, showSuccessToast } from 'vant'
import { useRouter } from 'vue-router'

import { deleteCourse, getCourses } from '@/api/courses'
import { extractBusinessError } from '@/api/errors'
import TechIcon from '@/components/TechIcon.vue'
import CourseCard from '@/components/course/CourseCard.vue'
import SemesterSettingsCard from '@/components/course/SemesterSettingsCard.vue'
import { useAuthStore } from '@/stores/auth'
import { useSemesterStore } from '@/stores/semester'
import type { Course } from '@/types/course'
import type { SemesterUpdate } from '@/types/semester'
import {
  buildCourseCreateQuery,
  buildCourseColorMap,
  filterCoursesByWeek,
  getCourseTimeSlots,
  getQuickWeekOptions,
  getTeachingWeekOptions,
  WEEKDAYS
} from '@/utils/course'

const router = useRouter()
const authStore = useAuthStore()
const semesterStore = useSemesterStore()
const courses = ref<Course[]>([])
const loading = ref(true)
const deletingId = ref<number | null>(null)
const activeCourse = ref<Course | null>(null)
const actionSheetVisible = ref(false)
const errorMessage = ref('')
const semesterErrorMessage = ref('')
const selectedWeek = computed({
  get: () => semesterStore.browsingWeek,
  set: (week: number) => {
    if (week === semesterStore.browsingWeek) return
    semesterStore.setBrowsingWeek(week)
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
})
const weekOptions = computed(() =>
  getTeachingWeekOptions(semesterStore.totalWeeks ?? undefined)
)
const timeSlots = getCourseTimeSlots()
const courseActionOptions = [
  { name: '编辑课程' },
  { name: '删除课程', color: '#b65f56' }
]
const visibleCourses = computed(() => filterCoursesByWeek(courses.value, selectedWeek.value))
const orderedVisibleCourses = computed(() =>
  [...visibleCourses.value].sort((left, right) =>
    left.weekday - right.weekday ||
    left.start_time.localeCompare(right.start_time) ||
    left.id - right.id
  )
)
const quickWeekOptions = computed(() =>
  getQuickWeekOptions(
    selectedWeek.value,
    5,
    semesterStore.totalWeeks ?? undefined
  )
)
const courseColorMap = computed(() => buildCourseColorMap(visibleCourses.value))
const courseCountText = computed(() =>
  visibleCourses.value.length > 0 ? `${visibleCourses.value.length} 门课` : '本周暂无课'
)
const todayWeekday = computed(() => {
  const day = new Date().getDay()
  return day === 0 ? 7 : day
})

function getErrorMessage(error: unknown): string {
  return extractBusinessError(error).message
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

async function loadSemester() {
  const userId = authStore.currentUser?.id
  if (!userId) {
    semesterErrorMessage.value = '登录信息尚未加载完成'
    return
  }
  semesterErrorMessage.value = ''
  try {
    await semesterStore.load(userId)
  } catch (error) {
    semesterErrorMessage.value = getErrorMessage(error)
  }
}

async function saveSemesterSetting(payload: SemesterUpdate) {
  semesterErrorMessage.value = ''
  try {
    await semesterStore.save(payload)
    showSuccessToast('学期设置已保存')
  } catch (error) {
    const message = getErrorMessage(error)
    semesterErrorMessage.value = message
    showFailToast(message)
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
    '--course-accent': courseColorMap.value[course.id] ?? '#678f70'
  }
}

function openCourseActions(course: Course) {
  activeCourse.value = course
  actionSheetVisible.value = true
}

async function handleCourseAction(action: { name: string }) {
  const course = activeCourse.value
  actionSheetVisible.value = false
  if (!course) return
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

watch(
  () => authStore.currentUser?.id,
  (userId, previousUserId) => {
    if (userId && userId !== previousUserId) {
      void loadSemester()
    }
  }
)

onMounted(() => {
  void Promise.all([loadCourses(), loadSemester()])
})
</script>

<template>
  <section class="page courses-page">
    <van-nav-bar title="我的课表" />
    <div class="page-content courses-content">
      <div v-if="semesterStore.loading" class="semester-loading fresh-card" aria-live="polite">
        <i aria-hidden="true"></i>
        <span>正在读取真实教学周...</span>
      </div>
      <van-empty
        v-else-if="semesterErrorMessage && !semesterStore.semester"
        image="error"
        :description="semesterErrorMessage"
      >
        <van-button type="primary" size="small" @click="loadSemester">重新加载学期</van-button>
      </van-empty>
      <SemesterSettingsCard
        v-else
        id="semester-settings"
        v-reveal="{ from: 'right', distance: 32 }"
        :semester="semesterStore.semester"
        :saving="semesterStore.saving"
        @save="saveSemesterSetting"
      />

      <header
        v-reveal="{ from: 'left', distance: 38, stagger: 55 }"
        class="course-hero"
      >
        <div class="hero-leaves" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="course-hero-copy">
          <span class="fresh-kicker">这一周，慢慢来</span>
          <div class="week-number">
            <strong>{{ String(selectedWeek).padStart(2, '0') }}</strong>
            <span>浏览第 {{ selectedWeek }} 周</span>
          </div>
          <p>{{ courseCountText }} · 点课程可以编辑，点空白格可以添加</p>
        </div>
        <div class="course-actions">
          <button type="button" @click="openImportPage">
            <TechIcon name="upload" :size="18" />
            <span>导入</span>
          </button>
          <button type="button" @click="openCreateForCurrentWeek">
            <TechIcon name="spark" :size="18" />
            <span>新增</span>
          </button>
        </div>
      </header>

      <section
        v-reveal="{ from: 'right', distance: 36, stagger: 54 }"
        class="week-book fresh-card"
        aria-label="选择周次"
      >
        <div class="week-book-heading">
          <div>
            <span>翻到哪一周？</span>
            <small>左右几周可以快速切换</small>
          </div>
          <label for="courseWeekSelect">
            <select id="courseWeekSelect" v-model.number="selectedWeek">
              <option v-for="week in weekOptions" :key="week" :value="week">
                第 {{ week }} 周
              </option>
            </select>
            <van-icon name="arrow-down" />
          </label>
        </div>

        <div class="week-switcher">
          <button
            v-for="week in quickWeekOptions"
            :key="week"
            type="button"
            :class="{ active: selectedWeek === week }"
            :aria-pressed="selectedWeek === week"
            @click="selectedWeek = week"
          >
            <span>{{ String(week).padStart(2, '0') }}</span>
            <small>周</small>
            <i></i>
          </button>
        </div>
      </section>

      <div v-if="loading" class="course-loading" aria-live="polite">
        <span><i></i><i></i><i></i></span>
        <p>正在整理你的课程...</p>
      </div>

      <van-empty v-else-if="errorMessage" image="error" :description="errorMessage">
        <van-button type="primary" size="small" @click="loadCourses">重新加载</van-button>
      </van-empty>

      <van-empty v-else-if="courses.length === 0" description="还没有课程安排">
        <van-button type="primary" size="small" @click="openCreateForCurrentWeek">
          添加第一门课程
        </van-button>
      </van-empty>

      <section
        v-else
        v-reveal="{ from: 'left', distance: 42 }"
        class="timetable-shell fresh-card"
      >
        <header class="table-heading">
          <div><h2>一周课表</h2><p>横向滑动，看看每天的安排</p></div>
          <span><i></i> 浏览第 {{ selectedWeek }} 周</span>
        </header>

        <div class="table-scroll-hint" aria-hidden="true">
          <span>向左滑动查看更多</span>
          <i></i>
        </div>

        <div class="timetable-viewport" tabindex="0" aria-label="可横向滚动的周课表">
          <div class="timetable-grid" role="grid" aria-label="周课表">
            <div class="time-head" role="columnheader">
              <span>时间</span>
            </div>
            <div
              v-for="weekday in WEEKDAYS"
              :key="weekday.value"
              class="weekday-head"
              :class="{ 'is-today': weekday.value === todayWeekday }"
              role="columnheader"
            >
              <small>{{ weekday.label.slice(-1) }}</small>
              <span>{{ weekday.value === todayWeekday ? '今' : weekday.value }}</span>
            </div>

            <template v-for="slot in timeSlots" :key="slot.section">
              <div class="time-cell" role="rowheader">
                <strong>{{ slot.section }}</strong>
                <time>{{ slot.start_time }}</time>
                <i></i>
                <time>{{ slot.end_time }}</time>
              </div>

              <div
                v-for="weekday in WEEKDAYS"
                :key="`${slot.section}-${weekday.value}`"
                class="course-cell"
                :class="{
                  'has-course': getCellCourses(weekday.value, slot).length > 0,
                  'is-today': weekday.value === todayWeekday
                }"
                role="gridcell"
              >
                <button
                  v-if="getCellCourses(weekday.value, slot).length === 0"
                  type="button"
                  class="empty-cell-button"
                  aria-label="在此时间添加课程"
                  @click="openCreateForSlot(weekday.value, slot)"
                >
                  <span aria-hidden="true">＋</span>
                </button>

                <article
                  v-for="course in getCellCourses(weekday.value, slot)"
                  :key="course.id"
                  class="timetable-course"
                  :class="{ 'is-deleting': deletingId === course.id }"
                  :style="getCourseStyle(course)"
                >
                  <button
                    type="button"
                    class="course-content"
                    :disabled="deletingId === course.id"
                    @click="openCourseActions(course)"
                  >
                    <strong>{{ course.course_name }}</strong>
                    <span class="compact-location">
                      <van-icon name="location-o" />
                      <span>
                        <b>{{ course.building.name }}</b>
                        <small>{{ course.room_name }}</small>
                      </span>
                    </span>
                    <time>{{ course.start_time }}—{{ course.end_time }}</time>
                  </button>
                </article>
              </div>
            </template>
          </div>
        </div>

        <section v-if="orderedVisibleCourses.length" class="course-place-index">
          <header>
            <div>
              <span>地点清单</span>
              <h3>这周要去哪里上课</h3>
            </div>
            <small>建筑与教室完整显示</small>
          </header>

          <div class="place-course-list">
            <CourseCard
              v-for="course in orderedVisibleCourses"
              :key="`place-${course.id}`"
              :course="course"
              :disabled="deletingId === course.id"
              @select="openCourseActions(course)"
              @edit="openEditPage"
            />
          </div>
        </section>

        <div v-if="visibleCourses.length === 0" class="empty-week">
          <span><TechIcon name="calendar" :size="22" /></span>
          <div>
            <strong>这一周还没有安排</strong>
            <p>点课表里的空白位置，就能添加课程。</p>
          </div>
          <button type="button" @click="openCreateForCurrentWeek">添加课程</button>
        </div>
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
.courses-page {
  background:
    radial-gradient(circle at 105% 4%, rgba(183, 167, 200, 0.15), transparent 18rem),
    radial-gradient(circle at -10% 48%, rgba(127, 168, 122, 0.12), transparent 19rem);
}

.courses-content {
  display: grid;
  gap: 17px;
}

.semester-loading {
  display: flex;
  min-height: 74px;
  align-items: center;
  justify-content: center;
  gap: 11px;
  color: var(--fresh-green-dark);
  font-size: 14px;
  font-weight: 720;
}

.semester-loading i {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(76, 119, 84, .24);
  border-top-color: var(--fresh-green);
  border-radius: 50%;
  animation: semester-loading-spin 900ms linear infinite;
}

.course-hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  min-height: 168px;
  align-items: end;
  overflow: hidden;
  border-radius: 28px 28px 22px 28px;
  background:
    linear-gradient(155deg, rgba(255, 255, 255, 0.38), transparent 45%),
    #e6eee0;
  padding: 18px;
  box-shadow: var(--fresh-shadow-soft);
}

.course-hero::after {
  position: absolute;
  top: -49px;
  right: -37px;
  width: 188px;
  height: 188px;
  border: 36px solid rgba(255, 255, 255, 0.33);
  border-radius: 50%;
  content: "";
}

.course-hero-copy {
  position: relative;
  z-index: 2;
}

.week-number {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin-top: 10px;
}

.week-number strong {
  color: var(--fresh-ink);
  font-family: "STKaiti", "KaiTi", "PingFang SC", sans-serif;
  font-size: clamp(40px, 12vw, 52px);
  font-weight: 690;
  line-height: 0.85;
  letter-spacing: -0.06em;
}

.week-number span {
  color: var(--fresh-green-dark);
  font-size: 13px;
  font-weight: 760;
}

.course-hero-copy p {
  margin: 12px 0 0;
  color: var(--fresh-text);
  font-size: 13px;
}

.course-actions {
  position: relative;
  z-index: 3;
  display: flex;
  align-self: start;
  gap: 7px;
}

.course-actions button {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(79, 125, 88, 0.17);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.56);
  color: var(--fresh-green-dark);
  cursor: pointer;
  font-size: 13px;
  font-weight: 720;
  padding: 0 12px;
}

.course-actions button:last-child {
  border-color: var(--fresh-green);
  background: var(--fresh-green);
  color: #fff;
}

.hero-leaves {
  position: absolute;
  right: 22px;
  bottom: 27px;
  z-index: 1;
  display: flex;
  gap: 2px;
  transform: rotate(8deg);
}

.hero-leaves i {
  width: 25px;
  height: 48px;
  border-radius: 100% 0 100% 0;
  background: rgba(91, 134, 91, 0.25);
  transform: rotate(-36deg);
  animation: leaf-sway 3.7s ease-in-out infinite alternate;
  transform-origin: bottom;
}

.hero-leaves i:nth-child(2) { height: 61px; animation-delay: 300ms; }
.hero-leaves i:nth-child(3) { height: 37px; animation-delay: 600ms; }

.week-book {
  padding: 17px;
}

.week-book-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 13px;
}

.week-book-heading > div {
  display: grid;
  gap: 3px;
}

.week-book-heading span {
  color: var(--fresh-ink);
  font-size: 15px;
  font-weight: 750;
}

.week-book-heading small {
  color: var(--fresh-muted);
  font-size: 12px;
}

.week-book-heading label {
  display: flex;
  min-height: 37px;
  align-items: center;
  gap: 6px;
  border-radius: 13px;
  background: var(--fresh-mint);
  color: var(--fresh-green-dark);
  padding: 0 9px;
}

.week-book-heading select {
  appearance: none;
  border: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font-size: 12px;
  font-weight: 720;
}

.week-switcher {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 7px;
}

.week-switcher button {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 64px;
  place-content: center;
  justify-items: center;
  overflow: hidden;
  border: 1px solid var(--fresh-line);
  border-radius: 18px;
  background: #fafbf6;
  color: var(--fresh-muted);
  cursor: pointer;
}

.week-switcher button > span {
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-size: 16px;
  font-weight: 680;
}

.week-switcher button small {
  margin-top: 3px;
  font-size: 12px;
}

.week-switcher button i {
  position: absolute;
  right: 7px;
  bottom: 7px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #c2ccc0;
}

.week-switcher button.active {
  border-color: #91af94;
  background: var(--fresh-mint);
  color: var(--fresh-green-dark);
  box-shadow: inset 0 0 0 1px rgba(79, 125, 88, 0.06);
}

.week-switcher button.active i {
  background: var(--fresh-green);
  box-shadow: 0 0 0 4px rgba(79, 125, 88, 0.1);
}

.course-loading {
  display: grid;
  min-height: 190px;
  place-content: center;
  justify-items: center;
  gap: 12px;
  border-radius: var(--fresh-radius);
  background: rgba(255, 253, 248, 0.62);
  color: var(--fresh-muted);
  font-size: 12px;
}

.course-loading > span {
  display: flex;
  gap: 5px;
  align-items: flex-end;
  height: 27px;
}

.course-loading i {
  width: 6px;
  height: 10px;
  border-radius: 999px;
  background: var(--fresh-leaf);
  animation: course-load 850ms ease-in-out infinite alternate;
}

.course-loading i:nth-child(2) { height: 22px; animation-delay: 150ms; }
.course-loading i:nth-child(3) { height: 15px; animation-delay: 300ms; }
.course-loading p { margin: 0; }

.timetable-shell {
  overflow: hidden;
  padding: 0 0 11px;
}

.table-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
  padding: 18px 18px 13px;
}

.table-heading h2 {
  margin: 0;
  color: var(--fresh-ink);
  font-size: 20px;
}

.table-heading p {
  margin: 4px 0 0;
  color: var(--fresh-muted);
  font-size: 12px;
}

.table-heading > span {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--fresh-green-dark);
  font-size: 12px;
  font-weight: 720;
}

.table-heading > span i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--fresh-leaf);
}

.table-scroll-hint {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  padding: 0 17px 8px;
  color: var(--fresh-muted);
  font-size: 12px;
}

.table-scroll-hint i {
  width: 24px;
  height: 1px;
  background: var(--fresh-green);
  animation: hint-slide 1.7s ease-in-out infinite;
}

.timetable-viewport {
  overflow-x: auto;
  overscroll-behavior-x: contain;
  border-top: 1px solid var(--fresh-line);
  outline: none;
  scroll-padding-left: 58px;
  scrollbar-color: #aebca9 transparent;
  scrollbar-width: thin;
  scroll-snap-type: x proximity;
}

.timetable-viewport:focus-visible {
  box-shadow: inset 0 0 0 3px rgba(79, 125, 88, 0.14);
}

.timetable-viewport::-webkit-scrollbar { height: 5px; }
.timetable-viewport::-webkit-scrollbar-thumb { border-radius: 999px; background: #aebca9; }

.timetable-grid {
  display: grid;
  grid-template-columns: 58px repeat(7, minmax(96px, 1fr));
  min-width: 730px;
  width: 100%;
  background: #fbfcf8;
}

.time-head,
.weekday-head,
.time-cell,
.course-cell {
  border-right: 1px solid #e4e9e0;
  border-bottom: 1px solid #e4e9e0;
}

.time-head,
.weekday-head {
  min-height: 55px;
}

.time-head {
  position: sticky;
  left: 0;
  z-index: 4;
  display: grid;
  place-items: center;
  background: #edf2e9;
  color: var(--fresh-green-dark);
  font-size: 12px;
  font-weight: 720;
}

.weekday-head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  background: #f8faf4;
  color: var(--fresh-text);
}

.weekday-head.is-today {
  background: #e5f0e2;
  color: var(--fresh-green-dark);
  box-shadow: inset 0 -3px 0 var(--fresh-green);
}

.weekday-head small {
  font-size: 13px;
  font-weight: 760;
}

.weekday-head span {
  color: #6d7a6f;
  font-family: ui-monospace, monospace;
  font-size: 12px;
}

.weekday-head.is-today span {
  color: var(--fresh-green-dark);
}

.time-cell {
  position: sticky;
  left: 0;
  z-index: 3;
  display: grid;
  min-height: 136px;
  align-content: center;
  justify-items: center;
  background: #edf2e9;
  color: var(--fresh-muted);
  padding: 8px 2px;
}

.time-cell strong {
  margin-bottom: 7px;
  color: var(--fresh-green-dark);
  font-family: ui-monospace, monospace;
  font-size: 17px;
}

.time-cell time {
  font-size: 12px;
  font-weight: 650;
  color: var(--fresh-text);
}

.time-cell i {
  width: 1px;
  height: 8px;
  margin: 3px 0;
  background: #b7c7b4;
}

.course-cell {
  position: relative;
  display: grid;
  min-height: 136px;
  align-content: start;
  gap: 5px;
  background: #fbfcf8;
  padding: 5px;
  scroll-snap-align: start;
}

.course-cell.has-course {
  background: #f8faf5;
}

.course-cell.is-today {
  background: #f3f8f0;
}

.empty-cell-button {
  position: absolute;
  inset: 0;
  display: grid;
  scroll-margin-block: 76px 108px;
  place-items: center;
  border: 0;
  background: transparent;
  color: #728d70;
  cursor: pointer;
}

.empty-cell-button span {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 50%;
  background: #edf4e8;
  color: #728d70;
  font-size: 18px;
  transition:
    background 220ms var(--fresh-spring),
    color 220ms var(--fresh-spring),
    transform 220ms var(--fresh-spring);
}

.timetable-course {
  --course-accent: var(--fresh-green);
  min-width: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--course-accent) 28%, #d8e1d5);
  border-radius: 14px 14px 11px 14px;
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--course-accent) 13%, #fffdf8), #fffdf8);
  box-shadow: 0 6px 16px rgba(49, 72, 49, 0.07);
}

.course-content {
  display: flex;
  width: 100%;
  min-height: 124px;
  scroll-margin-block: 76px 108px;
  flex-direction: column;
  align-items: stretch;
  border: 0;
  background: transparent;
  color: var(--fresh-ink);
  cursor: pointer;
  padding: 11px 9px;
  text-align: left;
}

.course-content::before {
  width: 24px;
  height: 4px;
  margin-bottom: 9px;
  border-radius: 999px;
  background: var(--course-accent);
  content: "";
}

.course-content strong {
  display: -webkit-box;
  overflow: hidden;
  font-size: 13px;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.compact-location {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 3px;
  margin-top: 5px;
  color: var(--fresh-muted);
  font-size: 12px;
}

.compact-location > i {
  margin-top: 1px;
  color: color-mix(in srgb, var(--course-accent) 76%, var(--fresh-ink));
}

.compact-location > span {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.compact-location b {
  display: -webkit-box;
  overflow: hidden;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.25;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.compact-location small {
  overflow: hidden;
  color: var(--fresh-ink);
  font-size: 12px;
  font-weight: 760;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.course-content time {
  margin-top: auto;
  color: color-mix(in srgb, var(--course-accent) 72%, var(--fresh-ink));
  font-size: 12px;
  font-weight: 720;
}

.course-place-index {
  margin: 13px 12px 2px;
  border: 1px solid rgba(83, 119, 82, 0.13);
  border-radius: 21px;
  background: #f2f7ed;
  padding: 14px;
}

.course-place-index > header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.course-place-index > header span {
  color: var(--fresh-green);
  font-size: 12px;
  font-weight: 760;
}

.course-place-index h3 {
  margin: 3px 0 0;
  color: var(--fresh-ink);
  font-size: 15px;
}

.course-place-index > header > small {
  color: var(--fresh-muted);
  font-size: 12px;
}

.place-course-list {
  display: grid;
  gap: 8px;
}

.place-course-list > button {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  border: 1px solid #dfe8dc;
  border-radius: 16px;
  background: #fffdf8;
  color: var(--fresh-ink);
  cursor: pointer;
  padding: 10px;
  text-align: left;
}

.place-day {
  display: grid;
  min-width: 42px;
  min-height: 35px;
  place-items: center;
  border-radius: 12px;
  background: var(--fresh-mint);
  color: var(--fresh-green-dark);
  font-size: 12px;
  font-weight: 760;
  padding: 0 7px;
}

.place-course-copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.place-course-copy > strong {
  color: var(--fresh-ink);
  font-size: 12px;
}

.place-course-copy > span {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  color: var(--fresh-green-dark);
  font-size: 12px;
  line-height: 1.4;
}

.place-course-copy b {
  font-weight: 700;
  overflow-wrap: anywhere;
}

.place-course-copy small {
  color: var(--fresh-text);
  font-size: 12px;
  font-weight: 700;
}

.place-course-list time {
  align-self: start;
  border-radius: 9px;
  background: #eef3e9;
  color: var(--fresh-text);
  font-size: 12px;
  font-weight: 720;
  padding: 6px 7px;
}

.timetable-course.is-deleting {
  border-color: #d7ddd3;
  background: #eef0eb;
  filter: grayscale(0.5);
}

.timetable-course.is-deleting .course-content {
  color: var(--fresh-muted);
  cursor: wait;
}

.empty-week {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  margin: 12px;
  border-radius: 18px;
  background: var(--fresh-mint);
  padding: 12px;
}

.empty-week > span {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 14px;
  background: #fff;
  color: var(--fresh-green-dark);
}

.empty-week strong { color: var(--fresh-ink); font-size: 15px; }
.empty-week p { margin: 5px 0 0; color: var(--fresh-muted); font-size: 13px; line-height: 1.55; }

.empty-week button {
  min-height: 34px;
  border: 1px solid #9eb79f;
  border-radius: 12px;
  background: #fff;
  color: var(--fresh-green-dark);
  cursor: pointer;
  font-size: 12px;
  font-weight: 720;
  padding: 0 10px;
}

@media (hover: hover) {
  .empty-cell-button:hover span {
    background: var(--fresh-mint);
    color: var(--fresh-green-dark);
    transform: scale(1.08);
  }

  .timetable-course:hover {
    box-shadow: 0 10px 24px rgba(49, 72, 49, 0.12);
    transform: translateY(-2px);
  }
}

@keyframes leaf-sway {
  to { transform: rotate(-27deg) translateY(-4px); }
}

@keyframes course-load {
  to { transform: scaleY(1.4); }
}

@keyframes hint-slide {
  50% { transform: translateX(5px); }
}

@keyframes semester-loading-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 370px) {
  .course-hero { min-height: 228px; padding: 19px; }
  .course-actions button { padding: 0 8px; }
  .week-switcher { gap: 5px; }
  .week-switcher button { min-height: 59px; border-radius: 16px; }
  .empty-week { grid-template-columns: auto minmax(0, 1fr); }
  .empty-week button { grid-column: 1 / -1; width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .hero-leaves i,
  .course-loading i,
  .table-scroll-hint i,
  .semester-loading i {
    animation: none;
  }
}
</style>

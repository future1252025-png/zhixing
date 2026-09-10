<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { showConfirmDialog, showFailToast, showSuccessToast } from 'vant'
import { useRouter } from 'vue-router'

import { deleteCourse } from '@/api/courses'
import { extractBusinessError } from '@/api/errors'
import TechIcon from '@/components/TechIcon.vue'
import SemesterSettingsCard from '@/components/course/SemesterSettingsCard.vue'
import { useAuthStore } from '@/stores/auth'
import { useCoursesStore } from '@/stores/courses'
import { useSemesterStore } from '@/stores/semester'
import type { Course } from '@/types/course'
import type { SemesterUpdate } from '@/types/semester'
import { createScrollPositionGuard } from '@/utils/scrollPositionGuard'
import {
  buildCourseCreateQuery,
  buildCourseColorMap,
  courseUsesStandardSlotTime,
  filterCoursesByWeek,
  formatCourseLocation,
  formatTimetableCourseLocation,
  getTimetableTimeSlots,
  getWeekdayLabel,
  getQuickWeekOptions,
  getTeachingWeekOptions,
  WEEKDAYS
} from '@/utils/course'

const router = useRouter()
const authStore = useAuthStore()
const coursesStore = useCoursesStore()
const semesterStore = useSemesterStore()
const courses = ref<Course[]>([])
const loading = ref(true)
const deletingId = ref<number | null>(null)
const activeCourse = ref<Course | null>(null)
const actionSheetVisible = ref(false)
const timetableGridRef = ref<HTMLElement | null>(null)
const timetableTransitionFrameRef = ref<HTMLElement | null>(null)
const weekHeadRef = ref<HTMLElement | null>(null)
const weekHeadStuck = ref(false)
const courseCardHeight = ref(170)
const weekStageLockedHeight = ref<number | null>(null)
const weekTransitionName = ref<'week-forward' | 'week-backward'>('week-forward')
const errorMessage = ref('')
const semesterErrorMessage = ref('')
const weekScrollGuard = createScrollPositionGuard()
const selectedWeek = computed({
  get: () => semesterStore.browsingWeek,
  set: (week: number) => {
    if (week === semesterStore.browsingWeek) return
    prepareWeekTransition()
    weekTransitionName.value = week > semesterStore.browsingWeek
      ? 'week-forward'
      : 'week-backward'
    semesterStore.setBrowsingWeek(week)
    void nextTick().then(() => {
      restoreWeekScrollPosition()
      scheduleWeekScrollRestore()
    })
  }
})
const weekOptions = computed(() =>
  getTeachingWeekOptions(semesterStore.totalWeeks ?? undefined)
)
const courseActionOptions = [
  { name: '查看地点', subname: '打开地图与地点频道' },
  { name: '编辑课程' },
  { name: '删除课程', color: '#b65f56' }
]
const visibleCourses = computed(() => filterCoursesByWeek(courses.value, selectedWeek.value))
// Keep the semester's saved clock axis stable when browsing different weeks.
const timeSlots = computed(() => getTimetableTimeSlots(courses.value))
const pendingScheduleCourses = computed(() =>
  visibleCourses.value
    .filter((course) => !course.start_time || !course.end_time)
    .sort((left, right) => left.weekday - right.weekday || left.id - right.id)
)
const timetableCoursesByCell = computed(() => {
  const coursesByCell = new Map<string, Course[]>()
  for (const course of visibleCourses.value) {
    if (!course.start_time || !course.end_time) continue
    const key = `${course.start_time}-${course.end_time}-${course.weekday}`
    const cellCourses = coursesByCell.get(key) ?? []
    cellCourses.push(course)
    cellCourses.sort((left, right) =>
      (left.start_time ?? '').localeCompare(right.start_time ?? '') || left.id - right.id
    )
    coursesByCell.set(key, cellCourses)
  }
  return coursesByCell
})
const activeCourseDescription = computed(() => {
  if (!activeCourse.value) return ''
  return [
    activeCourse.value.teacher ? `教师：${activeCourse.value.teacher}` : '',
    formatCourseLocation(activeCourse.value)
  ].filter(Boolean).join(' · ')
})
const quickWeekOptions = computed(() =>
  getQuickWeekOptions(
    selectedWeek.value,
    5,
    semesterStore.totalWeeks ?? undefined
  )
)
const courseColorMap = computed(() => buildCourseColorMap(courses.value))
const courseCountText = computed(() =>
  visibleCourses.value.length > 0 ? `${visibleCourses.value.length} 门课` : '本周暂无课'
)
const todayWeekday = computed(() => {
  const day = new Date().getDay()
  return day === 0 ? 7 : day
})
// 当前时刻（分钟精度），驱动"此刻正在上的节次"呼吸高亮
const nowMinutes = ref(getMinutesOfDay())
let nowTimer: ReturnType<typeof setInterval> | undefined
let timetableResizeObserver: ResizeObserver | undefined
let courseHeightFrame: number | undefined
let weekHeadScrollFrame: number | undefined
let observedGridWidth = 0

function getMinutesOfDay(): number {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

function toMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number)
  return (hour || 0) * 60 + (minute || 0)
}

function isNowSlot(weekday: number, slot: { start_time: string; end_time: string }): boolean {
  return (
    isTodayColumn(weekday) &&
    nowMinutes.value >= toMinutes(slot.start_time) &&
    nowMinutes.value < toMinutes(slot.end_time)
  )
}

// 左右滑动切周：横向位移明显大于纵向才触发，避免与纵向滚动打架
let touchStartX = 0
let touchStartY = 0

function handleWeekTouchStart(event: TouchEvent) {
  touchStartX = event.touches[0]?.clientX ?? 0
  touchStartY = event.touches[0]?.clientY ?? 0
}

function handleWeekTouchEnd(event: TouchEvent) {
  const touch = event.changedTouches[0]
  if (!touch) return
  const deltaX = touch.clientX - touchStartX
  const deltaY = touch.clientY - touchStartY
  if (Math.abs(deltaX) < 64 || Math.abs(deltaX) < Math.abs(deltaY) * 1.4) return
  const nextWeek = selectedWeek.value + (deltaX < 0 ? 1 : -1)
  if (weekOptions.value.includes(nextWeek)) {
    selectedWeek.value = nextWeek
  }
}
const selectedWeekDates = computed(() => {
  const startDate = semesterStore.semester?.start_date
  if (!startDate) {
    return WEEKDAYS.map((weekday) => ({
      iso: '',
      label: String(weekday.value)
    }))
  }

  const [year, month, day] = startDate.split('-').map(Number)
  const semesterStart = new Date(year, month - 1, day)
  return WEEKDAYS.map((weekday) => {
    const date = new Date(semesterStart)
    date.setDate(date.getDate() + (selectedWeek.value - 1) * 7 + weekday.value - 1)
    return {
      iso: [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
      ].join('-'),
      label: `${date.getMonth() + 1}/${date.getDate()}`
    }
  })
})
const selectedWeekDateRange = computed(() => {
  const first = selectedWeekDates.value[0]
  const last = selectedWeekDates.value[6]
  if (!first?.iso || !last?.iso) return '周一至周日'
  return `${first.iso.replace(/-/g, '.')} — ${last.iso.replace(/-/g, '.')}`
})

function isTodayColumn(weekday: number): boolean {
  return semesterStore.currentWeek === selectedWeek.value && weekday === todayWeekday.value
}

function getErrorMessage(error: unknown): string {
  return extractBusinessError(error).message
}

async function loadCourses() {
  loading.value = true
  errorMessage.value = ''
  try {
    courses.value = await coursesStore.ensureLoaded()
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
  return timetableCoursesByCell.value.get(`${slot.start_time}-${slot.end_time}-${weekday}`) ?? []
}

function getCourseStyle(course: Course): Record<string, string> {
  return {
    '--course-accent': courseColorMap.value[course.id] ?? 'var(--fresh-green)'
  }
}

async function syncCourseCardHeight() {
  courseCardHeight.value = 170
  await nextTick()
  const contents = timetableGridRef.value?.querySelectorAll<HTMLElement>('.course-content')
  if (!contents?.length) return

  courseCardHeight.value = Math.max(
    170,
    ...Array.from(contents, (content) => Math.ceil(content.scrollHeight + 2))
  )
}

function scheduleCourseCardHeightSync() {
  if (courseHeightFrame !== undefined) return
  courseHeightFrame = window.requestAnimationFrame(() => {
    courseHeightFrame = undefined
    void syncCourseCardHeight()
  })
}

function syncWeekHeadStuckState() {
  const weekHead = weekHeadRef.value
  if (!weekHead || !document.documentElement.classList.contains('capacitor-android')) {
    weekHeadStuck.value = false
    return
  }

  const stickyTop = Number.parseFloat(window.getComputedStyle(weekHead).top) || 0
  weekHeadStuck.value = window.scrollY > 0 && weekHead.getBoundingClientRect().top <= stickyTop + 0.5
}

function scheduleWeekHeadStuckSync() {
  if (weekHeadScrollFrame !== undefined) return
  weekHeadScrollFrame = window.requestAnimationFrame(() => {
    weekHeadScrollFrame = undefined
    syncWeekHeadStuckState()
  })
}

function prepareWeekTransition() {
  weekScrollGuard.begin()
  weekStageLockedHeight.value =
    timetableTransitionFrameRef.value?.getBoundingClientRect().height ?? null
}

function restoreWeekScrollPosition() {
  weekScrollGuard.restore()
}

function scheduleWeekScrollRestore() {
  weekScrollGuard.scheduleRestore()
}

function releaseWeekScrollPosition() {
  // Once the user starts a new gesture, their new position is authoritative.
  // In particular, the transition's delayed after-enter callback must not
  // restore the offset captured before they swiped or scrolled.
  weekScrollGuard.release()
}

function handleWeekScrollKey(event: KeyboardEvent) {
  if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) {
    releaseWeekScrollPosition()
  }
}

function finishWeekTransition() {
  restoreWeekScrollPosition()
  weekStageLockedHeight.value = null
  void nextTick().then(() => {
    weekScrollGuard.scheduleRestore(true)
  })
}

function openCourseActions(course: Course) {
  activeCourse.value = course
  actionSheetVisible.value = true
}

async function handleCourseAction(action: { name: string }) {
  const course = activeCourse.value
  actionSheetVisible.value = false
  if (!course) return
  if (action.name === '查看地点') {
    if (!course.building_id || !course.building) {
      showFailToast('这个上课地点还未匹配校园地图，请先补全地点后再打开')
      openEditPage(course.id)
      return
    }
    router.push(`/buildings/${course.building_id}`)
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
    coursesStore.invalidate()
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

watch(visibleCourses, () => {
  void syncCourseCardHeight()
}, { flush: 'post' })

watch(timetableGridRef, (grid) => {
  timetableResizeObserver?.disconnect()
  timetableResizeObserver = undefined
  observedGridWidth = 0
  if (!grid || typeof ResizeObserver === 'undefined') return

  timetableResizeObserver = new ResizeObserver(([entry]) => {
    const width = entry?.contentRect.width ?? 0
    if (Math.abs(width - observedGridWidth) < 1) return
    observedGridWidth = width
    scheduleCourseCardHeightSync()
  })
  timetableResizeObserver.observe(grid)
}, { flush: 'post' })

onMounted(() => {
  void Promise.all([loadCourses(), loadSemester()])
  window.addEventListener('scroll', scheduleWeekHeadStuckSync, { passive: true })
  window.addEventListener('resize', scheduleWeekHeadStuckSync)
  window.addEventListener('touchstart', releaseWeekScrollPosition, { passive: true })
  window.addEventListener('wheel', releaseWeekScrollPosition, { passive: true })
  window.addEventListener('keydown', handleWeekScrollKey)
  void nextTick().then(scheduleWeekHeadStuckSync)
  nowTimer = setInterval(() => {
    nowMinutes.value = getMinutesOfDay()
  }, 60_000)
})

onBeforeUnmount(() => {
  if (nowTimer) clearInterval(nowTimer)
  window.removeEventListener('scroll', scheduleWeekHeadStuckSync)
  window.removeEventListener('resize', scheduleWeekHeadStuckSync)
  window.removeEventListener('touchstart', releaseWeekScrollPosition)
  window.removeEventListener('wheel', releaseWeekScrollPosition)
  window.removeEventListener('keydown', handleWeekScrollKey)
  timetableResizeObserver?.disconnect()
  if (courseHeightFrame !== undefined) {
    window.cancelAnimationFrame(courseHeightFrame)
  }
  weekScrollGuard.release()
  if (weekHeadScrollFrame !== undefined) {
    window.cancelAnimationFrame(weekHeadScrollFrame)
  }
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
          <p>{{ courseCountText }} · 点课程查看地点或编辑，点空白格添加</p>
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
            <select
              id="courseWeekSelect"
              v-model.number="selectedWeek"
              aria-label="选择浏览教学周"
            >
              <option v-for="week in weekOptions" :key="week" :value="week">
                第 {{ week }} 周
              </option>
            </select>
            <TechIcon name="chevron-down" :size="15" />
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

      <section
        v-else-if="courses.length === 0"
        v-reveal="{ from: 'left', distance: 42 }"
        class="courses-empty fresh-card"
        aria-label="课表为空"
      >
        <div class="courses-empty-art" aria-hidden="true">
          <i class="art-page"></i>
          <i class="art-leaf art-leaf-1"></i>
          <i class="art-leaf art-leaf-2"></i>
          <i class="art-dot"></i>
        </div>
        <h2>课表还空着呢</h2>
        <p>从教务系统文本一键导入整学期课表，<br />也可以先手动添加一门试试。</p>
        <div class="courses-empty-actions">
          <van-button type="primary" @click="openImportPage">
            <TechIcon name="upload" :size="17" />
            <span>导入课表</span>
          </van-button>
          <van-button plain @click="openCreateForCurrentWeek">手动添加</van-button>
        </div>
      </section>

      <template v-else>
        <section
          v-if="pendingScheduleCourses.length"
          class="pending-courses fresh-card"
          aria-labelledby="pending-courses-title"
        >
          <header>
            <div>
              <span>暂不占用课表时段</span>
              <h2 id="pending-courses-title">待补全课程</h2>
            </div>
            <b>{{ pendingScheduleCourses.length }} 门</b>
          </header>
          <article
            v-for="course in pendingScheduleCourses"
            :key="course.id"
            :class="{ 'is-deleting': deletingId === course.id }"
          >
            <div>
              <small>{{ getWeekdayLabel(course.weekday) }} · 时间待补充</small>
              <strong>{{ course.course_name }}</strong>
              <span v-if="course.teacher" class="pending-teacher">教师：{{ course.teacher }}</span>
              <span>{{ formatCourseLocation(course) }}</span>
            </div>
            <footer>
              <button type="button" @click="openEditPage(course.id)">补全时间</button>
              <button
                type="button"
                class="pending-delete"
                :disabled="deletingId === course.id"
                @click="confirmDelete(course)"
              >
                删除
              </button>
            </footer>
          </article>
        </section>

        <section
          v-reveal="{ from: 'left', distance: 42 }"
          class="timetable-shell fresh-card"
        >
        <header class="table-heading">
          <div><h2>第 {{ selectedWeek }} 周课表</h2><p>{{ selectedWeekDateRange }}</p><p class="time-axis-note">时间按已保存课程显示；空白参考时段可自由修改。</p></div>
          <span><i></i> {{ courseCountText }}</span>
        </header>

        <div
          ref="timetableTransitionFrameRef"
          class="timetable-transition-frame"
          :style="weekStageLockedHeight === null
            ? undefined
            : { minHeight: `${weekStageLockedHeight}px` }"
        >
          <Transition
            :name="weekTransitionName"
            @after-enter="finishWeekTransition"
            @enter-cancelled="finishWeekTransition"
          >
            <div
              :key="selectedWeek"
              class="timetable-week-stage"
              :data-week="selectedWeek"
              @touchstart.passive="handleWeekTouchStart"
              @touchend.passive="handleWeekTouchEnd"
            >
              <div class="timetable-viewport" aria-label="完整展示周一到周日的周课表">
              <div
                ref="weekHeadRef"
                class="week-head"
                :class="{ 'is-stuck': weekHeadStuck }"
                aria-hidden="true"
              >
                <div class="time-head"><span>时间</span></div>
                <div
                  v-for="weekday in WEEKDAYS"
                  :key="weekday.value"
                  class="weekday-head"
                  :class="{ 'is-today': isTodayColumn(weekday.value) }"
                >
                  <small>{{ weekday.label.slice(-1) }}</small>
                  <time
                    v-if="selectedWeekDates[weekday.value - 1]?.iso"
                    :datetime="selectedWeekDates[weekday.value - 1].iso"
                  >
                    {{ selectedWeekDates[weekday.value - 1].label }}
                  </time>
                  <span v-else>{{ weekday.value }}</span>
                  <em v-if="isTodayColumn(weekday.value)">今</em>
                </div>
              </div>

              <div
                ref="timetableGridRef"
                class="timetable-grid"
                :style="{ '--course-card-height': `${courseCardHeight}px` }"
              >
                <section
                  v-for="slot in timeSlots"
                  :key="`${slot.start_time}-${slot.end_time}`"
                  class="timetable-slot"
                >
                  <header class="time-cell">
                    <strong>{{ slot.isReference ? '参考' : slot.section }}</strong>
                    <span><time>{{ slot.start_time }}</time><i></i><time>{{ slot.end_time }}</time></span>
                  </header>

                  <div class="slot-days">
                    <div
                      v-for="weekday in WEEKDAYS"
                      :key="`${slot.start_time}-${slot.end_time}-${weekday.value}`"
                      class="course-cell"
                      :class="{
                        'has-course': getCellCourses(weekday.value, slot).length > 0,
                        'is-today': isTodayColumn(weekday.value),
                        'is-now': isNowSlot(weekday.value, slot)
                      }"
                    >
                      <button
                        v-if="getCellCourses(weekday.value, slot).length === 0"
                        type="button"
                        class="empty-cell-button"
                        :aria-label="`${weekday.label}${slot.label}添加课程`"
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
                          :aria-label="`${weekday.label}${slot.label}，${course.course_name}${course.teacher ? `，教师${course.teacher}` : ''}，${formatCourseLocation(course)}，点击查看课程操作`"
                          :disabled="deletingId === course.id"
                          @click="openCourseActions(course)"
                        >
                          <strong>{{ course.course_name }}</strong>
                          <span v-if="course.teacher" class="compact-teacher">
                            {{ course.teacher }}
                          </span>
                          <span class="compact-location">
                            <span class="location-mark" aria-hidden="true">@</span>
                            <span>{{ formatTimetableCourseLocation(course) }}</span>
                          </span>
                          <time v-if="!courseUsesStandardSlotTime(course, slot)" class="exception-time">
                            {{ course.start_time }}—{{ course.end_time }}
                          </time>
                        </button>
                      </article>
                    </div>
                  </div>
                </section>
              </div>
              </div>
            </div>
          </Transition>
        </div>
        </section>
      </template>

      <van-action-sheet
        v-model:show="actionSheetVisible"
        class="course-action-sheet"
        :title="activeCourse?.course_name"
        :description="activeCourseDescription"
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
  overflow-anchor: none;
  background:
    radial-gradient(circle at 100% 0%, rgba(153, 166, 215, 0.18), transparent 24rem),
    linear-gradient(180deg, #f8f8f2 0%, #eef2f7 46%, #e7edf6 100%);
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
  font-weight: 700;
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
    var(--fresh-mint);
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
  font-family: var(--font-serif);
  font-size: clamp(40px, 12vw, 52px);
  font-weight: 600;
  line-height: 0.85;
  letter-spacing: -0.06em;
}

.week-number span {
  color: var(--fresh-green-dark);
  font-size: 13px;
  font-weight: 700;
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
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.56);
  color: var(--fresh-green-dark);
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
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
  font-weight: 700;
}

.week-book-heading small {
  color: var(--fresh-muted);
  font-size: 12px;
}

.week-book-heading label {
  display: flex;
  min-height: 44px;
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
  font-weight: 700;
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
  border-radius: var(--radius-md);
  background: var(--fresh-paper-2);
  color: var(--fresh-muted);
  cursor: pointer;
  transition:
    background 320ms var(--fresh-spring),
    border-color 320ms var(--fresh-spring),
    box-shadow 320ms var(--fresh-spring),
    color 320ms var(--fresh-spring),
    transform 320ms var(--fresh-spring);
}

.week-switcher button > span {
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-size: 16px;
  font-weight: 600;
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
  background: var(--fresh-line-strong);
}

.week-switcher button.active {
  border-color: #91af94;
  background: var(--fresh-mint);
  color: var(--fresh-green-dark);
  box-shadow: inset 0 0 0 1px rgba(79, 125, 88, 0.06);
  transform: translateY(-2px);
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
  border-radius: var(--radius-pill);
  background: var(--fresh-leaf);
  animation: course-load 850ms ease-in-out infinite alternate;
}

.course-loading i:nth-child(2) { height: 22px; animation-delay: 150ms; }
.course-loading i:nth-child(3) { height: 15px; animation-delay: 300ms; }
.course-loading p { margin: 0; }

/* 零课程空状态：品牌插画 + 导入（主）/手动（次）双入口 */
.courses-empty {
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: 34px 22px 30px;
  text-align: center;
}

.courses-empty-art {
  position: relative;
  width: 96px;
  height: 88px;
  margin-bottom: 8px;
}

.courses-empty-art .art-page {
  position: absolute;
  inset: 6px 14px 0;
  border: 1.5px solid var(--fresh-line-strong);
  border-radius: 14px 14px 16px 16px;
  background:
    repeating-linear-gradient(
      180deg,
      transparent 0 15px,
      var(--fresh-line) 15px 16.5px
    ),
    var(--fresh-paper);
  transform: rotate(-3deg);
}

.courses-empty-art .art-leaf {
  position: absolute;
  width: 22px;
  height: 22px;
  border-radius: 70% 30% 62% 38%;
  background: var(--fresh-leaf);
  opacity: 0.85;
}

.courses-empty-art .art-leaf-1 {
  top: -4px;
  right: 2px;
  transform: rotate(28deg);
}

.courses-empty-art .art-leaf-2 {
  bottom: 2px;
  left: -2px;
  width: 16px;
  height: 16px;
  background: var(--fresh-sun);
  transform: rotate(-18deg);
}

.courses-empty-art .art-dot {
  position: absolute;
  top: 30%;
  left: 4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--fresh-blue);
  opacity: 0.7;
}

.courses-empty h2 {
  margin: 0;
  color: var(--fresh-ink);
  font-family: var(--font-serif);
  font-size: 22px;
  font-weight: 700;
}

.courses-empty p {
  margin: 0;
  color: var(--fresh-muted);
  font-size: var(--text-sm);
  line-height: 1.7;
}

.courses-empty-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.courses-empty-actions .van-button {
  min-width: 128px;
}

.courses-empty-actions .van-button span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.pending-courses {
  display: grid;
  gap: 12px;
  padding: 18px;
}

.pending-courses > header,
.pending-courses article,
.pending-courses article footer {
  display: flex;
  align-items: center;
}

.pending-courses > header {
  justify-content: space-between;
  gap: 16px;
}

.pending-courses > header span,
.pending-courses article small,
.pending-courses article span {
  color: var(--fresh-muted);
  font-size: 12px;
}

.pending-courses h2 {
  margin: 3px 0 0;
  color: var(--fresh-ink);
  font-size: 20px;
}

.pending-courses > header b {
  border-radius: var(--radius-pill);
  background: var(--cm-amber-soft);
  color: #775424;
  font-size: 12px;
  padding: 7px 10px;
}

.pending-courses article {
  justify-content: space-between;
  gap: 14px;
  min-width: 0;
  border: 1px solid var(--fresh-line);
  border-radius: var(--radius-sm);
  background: var(--fresh-paper-2);
  padding: 12px;
}

.pending-courses article.is-deleting {
  opacity: .6;
}

.pending-courses article > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.pending-courses article strong,
.pending-courses article span {
  overflow-wrap: anywhere;
}

.pending-courses article footer {
  flex: 0 0 auto;
  gap: 7px;
}

.pending-courses article button {
  min-height: 44px;
  border: 1px solid var(--fresh-line-strong);
  border-radius: 12px;
  background: var(--fresh-paper);
  color: var(--fresh-green-dark);
  font-weight: 700;
  padding: 0 13px;
}

.pending-courses article .pending-delete {
  color: #9a4e47;
}

.timetable-shell {
  --time-rail: clamp(44px, 7vw, 58px);
  --timetable-width: min(920px, calc(100vw - 12px));
  position: relative;
  width: var(--timetable-width);
  justify-self: start;
  margin-left: calc((100% - var(--timetable-width)) / 2);
  overflow: clip;
  border-radius: 24px;
  padding: 0 0 8px;
}

.table-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
  padding: 17px 18px 14px;
}

.table-heading h2 {
  margin: 0;
  color: var(--fresh-ink);
  font-size: clamp(20px, 3vw, 25px);
}

.table-heading p {
  margin: 4px 0 0;
  color: var(--fresh-muted);
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-size: 11px;
}

.table-heading > span {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--fresh-green-dark);
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.table-heading .time-axis-note { font-family: inherit; line-height: 1.5; }

.table-heading > span i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--fresh-leaf);
}

.timetable-viewport {
  border-top: 1px solid var(--fresh-line);
  overflow: visible;
}

.timetable-transition-frame {
  position: relative;
  overflow-anchor: none;
}

.timetable-week-stage {
  min-width: 0;
  transform-origin: center top;
}

.week-head {
  position: sticky;
  /* 导航栏 58px + 刘海安全区，吸顶表头正好贴住导航底边 */
  top: calc(var(--nav-height, 58px) + var(--app-safe-area-top, env(safe-area-inset-top, 0px)));
  z-index: 6;
  display: grid;
  grid-template-columns: var(--time-rail) repeat(7, minmax(0, 1fr));
  width: 100%;
  background: rgba(246, 247, 252, 0.96);
  box-shadow: 0 6px 14px rgba(62, 76, 99, 0.08);
  backdrop-filter: blur(12px);
}

.timetable-grid {
  --course-card-height: 170px;
  display: grid;
  grid-auto-rows: minmax(var(--course-card-height), auto);
  width: 100%;
  background: #eef1f7;
}

.timetable-slot {
  display: grid;
  grid-template-columns: var(--time-rail) minmax(0, 1fr);
  height: 100%;
  width: 100%;
  border-bottom: 1px solid rgba(111, 126, 151, 0.16);
}

.slot-days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  min-width: 0;
  align-items: stretch;
}

.time-head,
.weekday-head,
.time-cell,
.course-cell {
  border-right: 1px solid rgba(111, 126, 151, 0.14);
}

.time-head,
.weekday-head {
  min-height: 62px;
}

.time-head {
  display: grid;
  place-items: center;
  background: #e5eaf2;
  color: var(--fresh-green-dark);
  font-size: 12px;
  font-weight: 700;
}

.weekday-head {
  position: relative;
  display: grid;
  align-items: center;
  justify-content: center;
  align-content: center;
  gap: 3px;
  background: #f6f7fb;
  color: var(--fresh-text);
  text-align: center;
}

.weekday-head.is-today {
  background: var(--fresh-mint);
  color: var(--fresh-green-dark);
  box-shadow: inset 0 -3px 0 var(--fresh-green);
}

.weekday-head small {
  font-size: clamp(12px, 2vw, 15px);
  font-weight: 700;
}

.weekday-head span,
.weekday-head time {
  color: #536158;
  font-family: ui-monospace, monospace;
  font-size: clamp(9px, 1.45vw, 11px);
}

.weekday-head.is-today span,
.weekday-head.is-today time {
  color: var(--fresh-green-dark);
}

.weekday-head em {
  position: absolute;
  top: 4px;
  right: 4px;
  display: grid;
  width: 16px;
  height: 16px;
  place-items: center;
  border-radius: 50%;
  background: var(--fresh-green);
  color: #fff;
  font-size: 9px;
  font-style: normal;
  font-weight: 700;
}

.time-cell {
  display: grid;
  min-height: var(--course-card-height);
  align-content: center;
  justify-items: center;
  background: #e5eaf2;
  color: var(--fresh-muted);
  padding: 8px 1px;
}

.time-cell strong {
  margin-bottom: 7px;
  color: var(--fresh-green-dark);
  font-family: ui-monospace, monospace;
  font-size: clamp(14px, 2.5vw, 18px);
}

.time-cell time {
  font-size: 12px;
  font-weight: 600;
  color: var(--fresh-text);
}

.time-cell > span {
  display: grid;
  justify-items: center;
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
  min-height: var(--course-card-height);
  align-content: stretch;
  grid-auto-rows: var(--course-card-height);
  gap: 3px;
  background: rgba(249, 250, 253, 0.78);
  padding: clamp(2px, 0.7vw, 5px);
  min-width: 0;
}

.course-cell.has-course {
  background: rgba(240, 244, 249, 0.92);
}

.course-cell.is-today {
  background: rgba(229, 239, 230, 0.86);
}

/* 此刻正在上的节次：柔和呼吸描边，只描今日列当前格 */
.course-cell.is-now::after {
  position: absolute;
  inset: 3px;
  z-index: 2;
  border: 2px solid color-mix(in srgb, var(--fresh-green) 62%, transparent);
  border-radius: 12px;
  content: "";
  pointer-events: none;
  animation: now-breathe 2.6s var(--fresh-spring) infinite;
}

@keyframes now-breathe {
  0%,
  100% {
    opacity: 0.35;
  }

  50% {
    opacity: 0.85;
  }
}

@media (prefers-reduced-motion: reduce) {
  .course-cell.is-now::after {
    opacity: 0.6;
    animation: none;
  }
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
  background: #e2e9f0;
  color: #728d70;
  font-size: 16px;
  opacity: 0;
  transition:
    background 220ms var(--fresh-spring),
    color 220ms var(--fresh-spring),
    opacity 220ms var(--fresh-spring),
    transform 220ms var(--fresh-spring);
}

/* 触屏没有 hover，"＋"完全不可见等于没有入口：常驻低透明度，今日列稍亮 */
@media (hover: none) {
  .empty-cell-button span {
    opacity: 0.32;
  }

  .course-cell.is-today .empty-cell-button span {
    opacity: 0.55;
  }
}

.timetable-course {
  --course-accent: var(--fresh-green);
  position: relative;
  box-sizing: border-box;
  height: 100%;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--course-accent) 84%, #dbe3ee);
  border-radius: clamp(7px, 1.5vw, 12px);
  background:
    linear-gradient(
      155deg,
      color-mix(in srgb, var(--course-accent) 66%, #ffffff),
      color-mix(in srgb, var(--course-accent) 50%, #f4f7fb)
    );
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.42),
    0 4px 10px color-mix(in srgb, var(--course-accent) 22%, transparent);
  transition:
    box-shadow 280ms var(--fresh-spring),
    transform 280ms var(--fresh-spring);
}

.course-content {
  display: flex;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  scroll-margin-block: 76px 108px;
  flex-direction: column;
  align-items: center;
  border: 0;
  background: transparent;
  color: var(--fresh-ink);
  cursor: pointer;
  padding: clamp(6px, 1.2vw, 11px) clamp(3px, 1vw, 8px);
  text-align: center;
}

.course-content::before {
  content: none;
}

.course-content strong {
  color: color-mix(in srgb, var(--course-accent) 18%, #172b21);
  font-size: clamp(10px, 1.8vw, 14px);
  line-height: 1.4;
  font-weight: 700;
  overflow-wrap: anywhere;
  text-wrap: balance;
}

.compact-teacher {
  display: block;
  width: 100%;
  margin-top: 5px;
  color: color-mix(in srgb, var(--course-accent) 30%, #34483b);
  font-size: clamp(9px, 1.35vw, 11px);
  font-weight: 650;
  line-height: 1.35;
  overflow-wrap: anywhere;
  text-align: center;
}

.compact-location {
  display: block;
  width: 100%;
  min-width: 0;
  margin-top: auto;
  color: color-mix(in srgb, var(--course-accent) 38%, #21362a);
  font-size: clamp(9px, 1.4vw, 12px);
  line-height: 1.35;
  text-align: center;
  text-wrap: pretty;
}

.location-mark {
  margin-right: 1px;
  font-weight: 800;
}

.compact-location > span:last-child {
  font-size: inherit;
  font-weight: 600;
  overflow-wrap: break-word;
  word-break: normal;
}

.course-content .exception-time {
  margin-top: 5px;
  color: color-mix(in srgb, var(--course-accent) 72%, var(--fresh-ink));
  font-size: clamp(9px, 1.4vw, 11px);
  font-weight: 700;
}

.timetable-course.is-deleting {
  border-color: var(--fresh-line);
  background: var(--disabled-surface);
  filter: grayscale(0.5);
}

.timetable-course.is-deleting .course-content {
  color: var(--fresh-muted);
  cursor: wait;
}

:global(.course-action-sheet) {
  --van-action-sheet-description-color: var(--text-secondary);
  --van-action-sheet-subname-color: var(--text-secondary);
}

:global(.course-action-sheet .van-action-sheet__header) {
  min-height: var(--van-action-sheet-header-height);
  padding: 13px 46px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

:global(.course-action-sheet .van-action-sheet__description) {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.week-forward-enter-active,
.week-forward-leave-active,
.week-backward-enter-active,
.week-backward-leave-active {
  transition:
    opacity 220ms ease,
    transform 320ms var(--fresh-spring);
}

.week-forward-leave-active,
.week-backward-leave-active {
  position: absolute;
  top: 0;
  z-index: 1;
  right: 0;
  left: 0;
}

/* 不用 blur：低端 Android 上是掉帧源，位移+透明度已足够表达方向 */
.week-forward-enter-from,
.week-backward-leave-to {
  opacity: 0;
  transform: translateX(32px) scale(0.985);
}

.week-forward-leave-to,
.week-backward-enter-from {
  opacity: 0;
  transform: translateX(-32px) scale(0.985);
}

@media (hover: hover) {
  .empty-cell-button:hover span {
    background: var(--fresh-mint);
    color: var(--fresh-green-dark);
    opacity: 0.8;
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

@keyframes semester-loading-spin {
  to { transform: rotate(360deg); }
}

.empty-cell-button:focus-visible span {
  opacity: 1;
}

@media (max-width: 500px) {
  .table-heading {
    align-items: flex-start;
    padding: 15px 13px 12px;
  }

  .table-heading > span {
    flex: 0 0 auto;
    padding-top: 5px;
    font-size: 10px;
  }

  .weekday-head em {
    top: 2px;
    right: 2px;
    width: 13px;
    height: 13px;
    font-size: 8px;
  }

  .course-cell {
    padding: 0;
  }

}

@media (max-width: 370px) {
  .course-hero { min-height: 228px; padding: 19px; }
  .course-actions button { padding: 0 8px; }
  .week-switcher { gap: 5px; }
  .week-switcher button { min-height: 59px; border-radius: 16px; }
}

@media (prefers-reduced-motion: reduce) {
  .hero-leaves i,
  .course-loading i,
  .semester-loading i {
    animation: none;
  }

  .week-forward-enter-active,
  .week-forward-leave-active,
  .week-backward-enter-active,
  .week-backward-leave-active {
    transition-duration: 1ms;
  }

  .week-forward-enter-from,
  .week-forward-leave-to,
  .week-backward-enter-from,
  .week-backward-leave-to {
    filter: none;
    transform: none;
  }
}
</style>

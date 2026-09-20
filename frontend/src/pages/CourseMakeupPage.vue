<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showSuccessToast } from 'vant'
import TechIcon from '@/components/TechIcon.vue'
import { createMakeups, deleteCourse, deleteMakeupBatch, updateMakeup } from '@/api/courses'
import { extractBusinessError } from '@/api/errors'
import { useAuthStore } from '@/stores/auth'
import { useCoursesStore } from '@/stores/courses'
import { useSemesterStore } from '@/stores/semester'
import { campusTime } from '@/utils/campusTime'
import { coursesOnDate, formatCourseLocation, getWeekdayLabel } from '@/utils/course'
import { addCalendarDays, validDate } from '@/utils/reminders'
import { useKeyboardAwarePage } from '@/utils/keyboardInset'
import { CURRENT_WEEK_ANCHOR } from '@/utils/routeAnchor'
import { createUuid } from '@/utils/uuid'
import type { Course, MakeupEntry } from '@/types/course'

type DraftRow = { course: Course; selected: boolean; start: string; end: string; changeLocation: boolean; location: string }
const auth = useAuthStore()
const courses = useCoursesStore()
const semester = useSemesterStore()
const route = useRoute()
const router = useRouter()
const { pageStyle, onFieldFocus } = useKeyboardAwarePage({ basePaddingPx: 32 })
const mode = ref<'single' | 'day'>('single')
const query = ref('')
const today = campusTime(new Date()).date
const originalDate = ref(today)
const targetDate = ref(typeof route.query.date === 'string' && validDate(route.query.date) ? route.query.date : today)
const cancelOriginal = ref(false)
const rows = ref<DraftRow[]>([])
const editingId = ref<number | null>(null)
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const errorRef = ref<HTMLElement | null>(null)
const requestId = createUuid()
watch(error, message => {
  if (message) errorRef.value?.scrollIntoView({ block: 'center', behavior: 'instant' })
}, { flush: 'post' })
watch([targetDate, cancelOriginal, rows], () => { error.value = '' }, { deep: true })
const sourceCourses = computed(() => courses.courses.filter(course => !course.makeup))
const matches = computed(() => sourceCourses.value.filter(course => `${course.course_name} ${course.teacher ?? ''}`.toLowerCase().includes(query.value.trim().toLowerCase())))
const selectedRows = computed(() => rows.value.filter(row => row.selected))
const scheduled = computed(() => courses.courses.filter(course => course.makeup).sort((a, b) => a.makeup!.date.localeCompare(b.makeup!.date) || (a.start_time ?? '').localeCompare(b.start_time ?? '')))
const dateMax = computed(() => semester.semester?.start_date && semester.totalWeeks ? addCalendarDays(semester.semester.start_date, semester.totalWeeks * 7 - 1) : undefined)
const actionLabel = computed(() => editingId.value ? '保存这次修改' : `添加${selectedRows.value.length ? ` ${selectedRows.value.length} 门` : ''}补课`)

function draft(course: Course): DraftRow {
  return { course, selected: true, start: course.start_time ?? '', end: course.end_time ?? '', changeLocation: false, location: formatCourseLocation(course) }
}
function dateLabel(date: string): string {
  if (!validDate(date)) return '请选择日期'
  const day = new Date(`${date}T00:00:00Z`).getUTCDay() || 7
  const week = semester.semester?.start_date ? Math.floor((Date.parse(date) - Date.parse(semester.semester.start_date)) / 604_800_000) + 1 : 0
  return `${date} · ${getWeekdayLabel(day)}${week > 0 && week <= (semester.totalWeeks ?? 0) ? ` · 第 ${week} 周` : ''}`
}
function selectCourse(course: Course) {
  rows.value = [draft(course)]
  if (semester.semester?.start_date) originalDate.value = addCalendarDays(semester.semester.start_date, (semester.browsingWeek - 1) * 7 + course.weekday - 1)
  error.value = ''
}
function selectDay() {
  if (mode.value === 'day' && !editingId.value) rows.value = coursesOnDate(courses.courses, originalDate.value, semester.semester).filter(course => !course.makeup).map(draft)
}
watch([mode, originalDate], () => {
  error.value = ''
  if (mode.value === 'day') selectDay()
  else if (rows.value.length > 1) rows.value = []
})
function editExisting(course: Course) {
  editingId.value = course.id
  mode.value = 'single'
  rows.value = [draft(course)]
  targetDate.value = course.makeup!.date
  cancelOriginal.value = false
  error.value = ''
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
}
function mergeCourses(updated: Course[], removed: number[] = []) {
  const ids = new Set([...updated.map(course => course.id), ...removed])
  courses.invalidate()
  courses.courses = [...courses.courses.filter(course => !ids.has(course.id)), ...updated]
  courses.loaded = true
  void courses.ensureLoaded(true).catch(() => {})
}
async function save() {
  if (busy.value || loading.value) return
  error.value = ''
  if (!validDate(targetDate.value) || !selectedRows.value.length) { error.value = '请选择课程和补课日期'; return }
  const entries: MakeupEntry[] = []
  for (const row of selectedRows.value) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.end) || row.start >= row.end) {
      error.value = `请补全「${row.course.course_name}」的起止时间，下课须晚于上课`; return
    }
    if (row.changeLocation && !row.location.trim()) { error.value = '请填写这次的上课地点'; return }
    if (cancelOriginal.value && (!validDate(originalDate.value) || !coursesOnDate(courses.courses, originalDate.value, semester.semester).some(course => course.id === row.course.id))) {
      error.value = '原日期没有这门课程，或已经调课，请重新选择原日期'; return
    }
    entries.push({ source_course_id: row.course.id, date: targetDate.value, start_time: row.start, end_time: row.end,
      location: row.changeLocation ? row.location.trim() : null,
      source_date: mode.value === 'day' || cancelOriginal.value ? originalDate.value : null, cancel_source: cancelOriginal.value })
  }
  const userId = auth.currentUser?.id
  const savedDate = targetDate.value
  busy.value = true
  try {
    const first = entries[0]!
    const saved = editingId.value ? [await updateMakeup(editingId.value, { date: first.date, start_time: first.start_time, end_time: first.end_time, location: first.location })]
      : await createMakeups({ request_id: requestId, entries })
    if (auth.currentUser?.id !== userId) return
    mergeCourses(saved)
    showSuccessToast(editingId.value ? '这次补课已修改' : `已添加 ${saved.length} 门补课`)
    const week = semester.semester?.start_date ? Math.floor((Date.parse(savedDate) - Date.parse(semester.semester.start_date)) / 604_800_000) + 1 : semester.browsingWeek
    await router.replace({ path: '/courses', query: { week: String(week) }, hash: CURRENT_WEEK_ANCHOR })
  } catch (cause) { error.value = extractBusinessError(cause).message }
  finally { busy.value = false }
}
async function cancel(course: Course, batch = false) {
  if (busy.value) return
  const removed = batch ? scheduled.value.filter(item => item.makeup!.batch_id === course.makeup!.batch_id) : [course]
  const restores = removed.some(item => item.makeup?.cancel_source)
  try { await showConfirmDialog({ title: batch ? `撤销这批 ${removed.length} 门补课？` : '取消这次补课？',
    message: `${restores ? '原日期对应的课程和提醒将恢复。' : '其他日期的课程不受影响。'}已安排的这次补课通知也会取消。`, confirmButtonText: '确认取消', cancelButtonText: '保留' }) }
  catch { return }
  const userId = auth.currentUser?.id
  busy.value = true
  error.value = ''
  try {
    if (batch) await deleteMakeupBatch(course.makeup!.batch_id)
    else await deleteCourse(course.id)
    if (auth.currentUser?.id !== userId) return
    mergeCourses([], removed.map(item => item.id))
    if (removed.some(item => item.id === editingId.value)) { editingId.value = null; rows.value = [] }
    showSuccessToast('已取消补课')
  } catch (cause) { error.value = extractBusinessError(cause).message }
  finally { busy.value = false }
}
onMounted(async () => {
  try {
    const userId = auth.currentUser?.id
    if (!userId) return
    await Promise.all([courses.ensureLoaded(), semester.load(userId)])
    if (auth.currentUser?.id !== userId) return
    if (typeof route.query.from === 'string' && validDate(route.query.from)) originalDate.value = route.query.from
    else if (semester.semester?.start_date) originalDate.value = addCalendarDays(semester.semester.start_date, (semester.browsingWeek - 1) * 7)
    const editing = scheduled.value.find(course => course.id === Number(route.query.edit))
    const source = sourceCourses.value.find(course => course.id === Number(route.query.source))
    if (editing) editExisting(editing)
    else if (source) selectCourse(source)
    else if (route.query.edit) error.value = '这门补课已不存在，请刷新课表'
  } catch (cause) { error.value = extractBusinessError(cause).message }
  finally { loading.value = false }
})
</script>

<template>
  <section class="page makeup-page">
    <van-nav-bar title="快捷补课" left-arrow @click-left="!busy && router.push('/courses')" />
    <main class="page-content makeup-content" :style="pageStyle" @focusin="onFieldFocus">
      <header class="makeup-heading"><span class="fresh-kicker">临时调整，也能轻松安排</span><h1>{{ editingId ? '只改这一次' : '选好课程，换个时间上' }}</h1><p>老师、地点自动带入，不改变其他周的课表。</p></header>
      <p v-if="loading" role="status">正在读取已有课程…</p>
      <p v-if="error" ref="errorRef" class="makeup-error" role="alert">{{ error }}</p>
      <p v-if="!loading && !semester.semester?.start_date" class="makeup-card"><router-link to="/profile/semester">先设置学期日期</router-link>，再安排补课。</p>
      <form v-else-if="!loading" aria-label="快捷补课" @submit.prevent="save">
        <fieldset :disabled="busy">
          <section v-if="!editingId" class="makeup-card">
            <div class="makeup-tabs" role="group" aria-label="补课方式"><button type="button" :aria-pressed="mode === 'single'" @click="mode = 'single'">选一门课</button><button type="button" :aria-pressed="mode === 'day'" @click="mode = 'day'">按一天补课</button></div>
            <template v-if="mode === 'single'">
              <label class="makeup-search"><TechIcon name="search" :size="19" /><input v-model="query" type="search" aria-label="搜索已有课程" placeholder="搜索课程或老师" /></label>
              <div class="makeup-picker" role="group" aria-label="选择已有课程">
                <button v-for="course in matches" :key="course.id" type="button" :aria-pressed="rows[0]?.course.id === course.id" @click="selectCourse(course)">
                  <span><strong>{{ course.course_name }}</strong><small>{{ getWeekdayLabel(course.weekday) }} · {{ course.start_time || '时间待补充' }} · {{ course.teacher || formatCourseLocation(course) }}</small></span><TechIcon v-if="rows[0]?.course.id === course.id" name="check" :size="20" />
                </button>
                <p v-if="!matches.length">{{ sourceCourses.length ? '没有找到这门课' : '还没有课程，请先导入或添加' }}</p>
              </div>
            </template>
            <label v-else class="makeup-field">补哪天的课<input v-model="originalDate" type="date" aria-label="原上课日期" required /><small>{{ dateLabel(originalDate) }}</small></label>
          </section>
          <section class="makeup-card">
            <label class="makeup-field">{{ editingId ? '上课日期' : '补课日期' }}<input v-model="targetDate" type="date" aria-label="补课日期" :min="semester.semester?.start_date || undefined" :max="dateMax" required /><small>{{ dateLabel(targetDate) }} · 仅这一天</small></label>
            <p v-if="!rows.length" class="makeup-empty">{{ mode === 'day' ? '这一天没有可补的常规课程，试试其他日期。' : '选择一门课程后，在这里确认时间。' }}</p>
            <article v-for="row in rows" :key="row.course.id" class="makeup-row" :class="{ unselected: !row.selected }">
              <header><label v-if="mode === 'day'"><input v-model="row.selected" type="checkbox" :aria-label="`选择${row.course.course_name}`" /><strong>{{ row.course.course_name }}</strong></label><strong v-else>{{ row.course.course_name }}</strong><small v-if="row.course.teacher">{{ row.course.teacher }}</small></header>
              <template v-if="row.selected">
                <div class="makeup-times"><label class="makeup-field">上课时间<input v-model="row.start" type="time" :aria-label="`${row.course.course_name}上课时间`" step="60" required /></label><span aria-hidden="true">—</span><label class="makeup-field">下课时间<input v-model="row.end" type="time" :aria-label="`${row.course.course_name}下课时间`" step="60" required /></label></div>
                <div class="makeup-location"><span><TechIcon name="location" :size="16" />{{ formatCourseLocation(row.course) }}</span><button type="button" @click="row.changeLocation = !row.changeLocation">{{ row.changeLocation ? '沿用原地点' : '改地点' }}</button></div>
                <label v-if="row.changeLocation" class="makeup-field">这次上课地点<input v-model="row.location" :aria-label="`${row.course.course_name}补课地点`" maxlength="120" placeholder="例如：教4-503" required /></label>
              </template>
            </article>
            <div v-if="!editingId && selectedRows.length" class="makeup-cancel-source"><label><input v-model="cancelOriginal" type="checkbox" />原日期这几门课停课</label><p>{{ cancelOriginal ? '只取消原日期的这一次课程和提醒。' : '默认保留原课，只额外加一次补课。' }}</p><label v-if="cancelOriginal && mode === 'single'" class="makeup-field">原上课日期<input v-model="originalDate" type="date" aria-label="原上课日期" required /><small>{{ dateLabel(originalDate) }}</small></label></div>
            <p v-if="editingId && rows[0]?.course.makeup?.cancel_source" class="makeup-note">原 {{ rows[0].course.makeup.source_date }} 的停课安排保持不变；取消这次补课即可恢复。</p>
            <p class="makeup-note">北京时间 · 提醒沿用课程设置，仅在上课当天安排。</p>
            <button type="submit" class="makeup-primary" :disabled="busy || !selectedRows.length">{{ busy ? '正在保存…' : actionLabel }}</button>
          </section>
        </fieldset>
      </form>
      <details v-if="scheduled.length" class="makeup-card makeup-manage"><summary>已安排的补课 <span>{{ scheduled.length }} 门</span></summary><article v-for="course in scheduled" :key="course.id"><strong>{{ course.course_name }}</strong><p>{{ dateLabel(course.makeup!.date) }}<br />{{ course.start_time }}—{{ course.end_time }} · {{ formatCourseLocation(course) }}</p><div><button type="button" :disabled="busy" @click="editExisting(course)">修改这次</button><button type="button" :disabled="busy" @click="cancel(course)">取消这次</button><button v-if="scheduled.filter(item => item.makeup!.batch_id === course.makeup!.batch_id).length > 1" type="button" :disabled="busy" @click="cancel(course, true)">撤销整批</button></div></article></details>
    </main>
  </section>
</template>

<style scoped>
.makeup-page { --page-max: 820px; }
.makeup-content { max-width: 720px; margin: auto; display: grid; gap: 20px; }
.makeup-heading { padding: 24px; border-radius: 26px 26px 42px 26px; background: linear-gradient(130deg,#f8efd9,#e6f0e1); }
h1 { font-size: clamp(24px,4vw,32px); color: #35523d; margin: 14px 0 8px; }
.makeup-heading p,.makeup-note,.makeup-empty { color: #62705e; font-size: 13px; line-height: 1.7; }
.makeup-heading p { margin: 0; }
fieldset { padding: 0; border: 0; margin: 0; min-width: 0; display: grid; gap: 18px; }
.makeup-card { padding: 22px; border-radius: 24px; background: #fffef9; border: 1px solid #e0e7d9; }
button,input { font: inherit; }
button { cursor: pointer; }
button:disabled { opacity: .5; cursor: not-allowed; }
button:focus-visible,input:focus-visible,summary:focus-visible { outline: 2px solid #587858; outline-offset: 3px; }
.makeup-tabs { display: flex; gap: 4px; background: #eff3e8; border-radius: 15px; padding: 4px; margin-bottom: 18px; }
.makeup-tabs button { flex: 1; padding: 12px 6px; border: 0; border-radius: 12px; background: transparent; color: #53664f; }
.makeup-tabs button[aria-pressed=true] { background: #fffef9; color: #355a3f; box-shadow: 0 2px 8px #42553b0d; font-weight: 700; }
.makeup-search { display: flex; align-items: center; gap: 8px; padding: 0 12px; background: #f4f6ee; border-radius: 12px; color: #61775c; }
.makeup-search input { width: 100%; min-width: 0; min-height: 44px; border: 0; background: transparent; font-size: 16px; color: #354d3c; }
.makeup-picker { max-height: 240px; overflow-y: auto; overscroll-behavior: contain; margin-top: 12px; display: grid; gap: 8px; padding: 4px; }
.makeup-picker button { display: flex; align-items: center; justify-content: space-between; gap: 12px; text-align: left; border: 1px solid #e2e8dc; background: #fafbf5; border-radius: 14px; padding: 12px; color: #3e5943; }
.makeup-picker button[aria-pressed=true] { background: #e9f1e2; border-color: #8fa783; }
.makeup-picker button > span { min-width: 0; }
.makeup-picker strong { overflow-wrap: anywhere; font-size: 15px; }
.makeup-picker small { display: block; margin-top: 5px; color: #63705d; font-size: 12px; line-height: 1.5; }
.makeup-field { display: grid; gap: 8px; min-width: 0; color: #455e49; font-size: 14px; font-weight: 650; }
.makeup-field > input { box-sizing: border-box; width: 100%; min-width: 0; min-height: 48px; border: 1px solid #dce4d5; border-radius: 12px; padding: 10px; background: #f7f9f1; color: #334d3b; font-size: 16px; }
.makeup-field small { font-size: 12px; font-weight: 400; line-height: 1.6; color: #64725e; }
.makeup-row { margin-top: 18px; padding-top: 18px; border-top: 1px solid #e1e7d9; }
.makeup-row header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; color: #3d5741; }
.makeup-row header label,.makeup-cancel-source > label { display: flex; align-items: center; gap: 9px; min-height: 44px; }
.makeup-row header small { color: #63745e; }
input[type=checkbox] { width: 20px; height: 20px; accent-color: #567653; flex-shrink: 0; }
.makeup-times { display: grid; grid-template-columns: minmax(0,1fr) auto minmax(0,1fr); align-items: end; gap: 10px; margin: 14px 0; }
.makeup-times > span { padding-bottom: 14px; color: #78906f; }
.makeup-location { display: flex; gap: 12px; align-items: center; justify-content: space-between; font-size: 13px; margin: 8px 0; color: #5e7057; }
.makeup-location > span { display: flex; align-items: center; gap: 5px; overflow-wrap: anywhere; min-width: 0; }
.makeup-location button { flex-shrink: 0; background: transparent; border: 0; min-height: 44px; color: #426547; text-decoration: underline; }
.makeup-cancel-source { padding: 14px; background: #f4f5ec; border-radius: 14px; margin-top: 18px; color: #4b644b; font-size: 14px; }
.makeup-cancel-source p { font-size: 12px; line-height: 1.7; margin: 2px 0 7px; }
.makeup-primary { width: 100%; border: 0; border-radius: 15px; min-height: 48px; padding: 12px; background: #496e50; color: #fff; font-weight: 700; }
.makeup-error { color: #994d39; padding: 12px 15px; border-radius: 14px; background: #fff3eb; line-height: 1.8; margin: 0; }
.makeup-manage summary { cursor: pointer; color: #405c45; font-weight: 650; padding-block: 5px; }
.makeup-manage summary span { font-weight: 400; font-size: 13px; margin-left: 6px; }
.makeup-manage article { margin-top: 18px; border-top: 1px solid #e2e7da; padding-top: 16px; }
.makeup-manage article p { font-size: 13px; color: #62745c; line-height: 1.8; }
.makeup-manage article div { display: flex; gap: 8px; flex-wrap: wrap; }
.makeup-manage button { min-height: 44px; padding: 8px 12px; border: 1px solid #dce4d5; background: #f6f8ef; border-radius: 12px; color: #486349; }
@media (max-width: 480px) { .makeup-card { padding: 17px; }.makeup-heading { padding: 22px; }.makeup-times { gap: 7px; } }
</style>

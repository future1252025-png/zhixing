<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { showConfirmDialog, showSuccessToast } from 'vant'
import { useCoursesStore } from '@/stores/courses'
import { useSemesterStore } from '@/stores/semester'
import { campusTime } from '@/utils/campusTime'
import { getCourseTimeSlots } from '@/utils/course'
import { validateCourseTimeRules } from '@/utils/courseTimeRules'
import { extractBusinessError } from '@/api/errors'
import type { CourseTimeRule } from '@/types/semester'

const courses = useCoursesStore()
const semester = useSemesterStore()
const editing = ref(false)
const editingIndex = ref<number | null>(null)
const startDate = ref('')
const endDate = ref('')
const slots = ref<Pick<CourseTimeRule, 'from_start' | 'from_end' | 'start_time' | 'end_time'>[]>([])
const error = ref('')
const rules = computed(() => semester.semester?.time_rules ?? [])
function begin(index: number | null = null) {
  error.value = ''
  editingIndex.value = index
  const rule = index === null ? null : rules.value[index]
  startDate.value = rule?.start_date ?? campusTime(new Date()).date
  endDate.value = rule?.end_date ?? ''
  const unique = new Map<string, { start_time: string; end_time: string }>()
  for (const course of courses.courses) if (!course.makeup && course.start_time && course.end_time) {
    unique.set(`${course.start_time}-${course.end_time}`, { start_time: course.start_time, end_time: course.end_time })
  }
  const source = unique.size ? [...unique.values()] : getCourseTimeSlots()
  slots.value = rule ? [{ ...rule }] : source.sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map(slot => ({ from_start: slot.start_time, from_end: slot.end_time, ...slot }))
  editing.value = true
}
function shiftAfternoon() {
  const shifted = (value: string) => {
    const [hour = 0, minute = 0] = value.split(':').map(Number)
    const total = hour * 60 + minute + 30
    return total < 1440 ? `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}` : value
  }
  slots.value = slots.value.map(slot => slot.from_start >= '12:00' && slot.from_start < '18:00'
    ? { ...slot, start_time: shifted(slot.from_start), end_time: shifted(slot.from_end) } : slot)
}
async function persist(next: CourseTimeRule[]) {
  const state = semester.semester
  if (!state?.start_date || !state.total_weeks || semester.saving) return
  error.value = validateCourseTimeRules(next)
  if (error.value) return
  try {
    await semester.save({ start_date: state.start_date, total_weeks: state.total_weeks, time_rules: next })
    editing.value = false
    showSuccessToast('上课时间已更新')
    window.dispatchEvent(new Event('campusmind:sync-reminders'))
  } catch (cause) { error.value = extractBusinessError(cause).message }
}
async function save() {
  const changes = slots.value.filter(slot => slot.start_time !== slot.from_start || slot.end_time !== slot.from_end)
    .map(slot => ({ ...slot, start_date: startDate.value, end_date: endDate.value || null }))
  if (!changes.length) { error.value = '请至少修改一个时段'; return }
  await persist([...rules.value.filter((_, index) => index !== editingIndex.value), ...changes])
}
async function remove(index: number) {
  try { await showConfirmDialog({ title: '删除这条时间调整？', message: '对应日期恢复课程原时间，提醒会同步更新。' }) }
  catch { return }
  await persist(rules.value.filter((_, item) => item !== index))
}
onMounted(() => { void courses.ensureLoaded().catch(() => {}) })
</script>

<template>
  <section v-if="semester.semester?.start_date" class="course-time-settings" aria-labelledby="course-time-title">
    <header><div><h2 id="course-time-title">上课时间</h2><p>换季作息，从指定日期自动切换。</p></div>
      <button v-if="!editing" type="button" :disabled="semester.saving || courses.loading" @click="begin()">添加调整</button></header>
    <p v-if="!rules.length && !editing" class="hint">当前沿用导入时间。可设置 5 月 1 日起下午 14:30 上课。</p>
    <ul v-if="!editing && rules.length" class="rule-list">
      <li v-for="(rule, index) in rules" :key="`${index}-${rule.start_date}`">
        <div><strong>{{ rule.start_time }}–{{ rule.end_time }}</strong><small>{{ rule.start_date }} 起{{ rule.end_date ? `，至 ${rule.end_date}` : '' }} · 原 {{ rule.from_start }}–{{ rule.from_end }}</small></div>
        <button type="button" :disabled="semester.saving" :aria-label="`修改 ${rule.from_start} 的时间调整`" @click="begin(index)">修改</button>
        <button type="button" :disabled="semester.saving" :aria-label="`删除 ${rule.from_start} 的时间调整`" @click="remove(index)">删除</button>
      </li>
    </ul>
    <form v-if="editing" @submit.prevent="save">
      <div class="date-fields"><label>从哪天起<input v-model="startDate" type="date" required /></label>
        <label>到哪天（可不填）<input v-model="endDate" type="date" :min="startDate" /></label></div>
      <button class="quick-shift" type="button" @click="shiftAfternoon">下午整体推迟 30 分钟</button>
      <div v-for="(slot, index) in slots" :key="`${slot.from_start}-${slot.from_end}`" class="time-row">
        <span>原 {{ slot.from_start }}–{{ slot.from_end }}</span>
        <label>改为<input v-model="slot.start_time" type="time" step="60" required :aria-label="`时段 ${index + 1} 新上课时间`" /></label>
        <label>至<input v-model="slot.end_time" type="time" step="60" required :aria-label="`时段 ${index + 1} 新下课时间`" /></label>
      </div>
      <p class="hint">只调整原时间相同的常规课程；单独补课保持你指定的时间。不会改动生效前的课表。</p>
      <footer><button type="button" :disabled="semester.saving" @click="editing = false; error = ''">取消</button>
        <button class="primary" type="submit" :disabled="semester.saving">{{ semester.saving ? '正在保存…' : '保存时间调整' }}</button></footer>
    </form>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.course-time-settings { margin-top: 20px; padding: 22px; border-radius: 26px; background: #fffef8; border: 1px solid #e2e7dc; }
header, footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h2 { margin: 0; font-size: 20px; color: #344c38; }
p, small { color: #636b5f; font-size: 13px; line-height: 1.7; }
header p { margin: 5px 0 0; }
button { min-height: 44px; border: 1px solid #dce3d5; border-radius: 12px; padding: 8px 13px; background: #f2f5ed; color: #47644b; font: inherit; font-size: 13px; cursor: pointer; }
button:disabled { opacity: .5; cursor: not-allowed; }
button:focus-visible, input:focus-visible { outline: 2px solid #54785a; outline-offset: 2px; }
.date-fields { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; margin-top: 20px; }
label { display: grid; gap: 6px; color: #606d59; font-size: 12px; min-width: 0; }
input { width: 100%; min-width: 0; box-sizing: border-box; min-height: 44px; padding: 8px; border: 1px solid #dce3d5; border-radius: 10px; background: #fff; color: #344c38; font: inherit; font-size: 15px; }
.quick-shift { margin: 16px 0 8px; }
.time-row { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 8px; padding: 12px 0; border-bottom: 1px solid #edf0e8; }
.time-row > span { grid-column: 1 / -1; font-size: 13px; color: #697361; }
footer { justify-content: flex-end; }
.primary { background: #4f7357; color: white; }
.rule-list { list-style: none; padding: 0; margin: 16px 0 0; }
.rule-list li { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 12px 0; border-top: 1px solid #edf0e8; }
.rule-list li > div { flex: 1 1 180px; }
.rule-list strong, small { display: block; }
.error { color: #9a4d3b; }
@media(min-width: 700px) { .time-row { grid-template-columns: 1.2fr 1fr 1fr; align-items: center; }.time-row > span { grid-column: auto; } }
</style>

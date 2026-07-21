<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { showFailToast, showSuccessToast } from 'vant'
import { useRoute, useRouter } from 'vue-router'

import { getBuildings, type Building } from '@/api/buildings'
import { createCourse, getCourses, updateCourse } from '@/api/courses'
import { extractBusinessError } from '@/api/errors'
import type { Course } from '@/types/course'
import { filterBuildingsByKeyword, includeSelectedBuilding } from '@/utils/buildings'
import {
  WEEKDAYS,
  buildEmptyCourseForm,
  buildWeeksRange,
  courseToForm,
  formToPayload,
  getTeachingWeekOptions,
  parseWeeksRangeToPicker,
  validateCourseForm
} from '@/utils/course'
import { useKeyboardAwarePage } from '@/utils/keyboardInset'

const route = useRoute()
const router = useRouter()
const form = reactive(buildEmptyCourseForm())
const buildings = ref<Building[]>([])
const courses = ref<Course[]>([])
const loading = ref(true)
const submitting = ref(false)
const errorMessage = ref('')
const validationMessages = ref<string[]>([])
const saveErrorMessage = ref('')
const saveErrorCode = ref('')
const conflictNotices = ref<Array<{ courseName: string; overlapWeeks: number[] }>>([])
const weekOptions = getTeachingWeekOptions()
const weekRangeStart = ref(1)
const weekRangeEnd = ref(16)
const buildingKeyword = ref('')
const { pageStyle, onFieldFocus } = useKeyboardAwarePage({ basePaddingPx: 34 })

const courseId = computed(() => {
  const id = Number(route.params.id)
  return Number.isFinite(id) ? id : null
})
const isEdit = computed(() => courseId.value !== null)
const pageTitle = computed(() => (isEdit.value ? '编辑课程' : '新增课程'))
const visibleBuildings = computed(() =>
  includeSelectedBuilding(
    filterBuildingsByKeyword(buildings.value, buildingKeyword.value, 80),
    buildings.value,
    form.building_id
  )
)

function applyCreateDefaultsFromQuery() {
  if (isEdit.value) return
  const weekday = Number(route.query.weekday)
  const startTime = typeof route.query.start_time === 'string' ? route.query.start_time : ''
  const endTime = typeof route.query.end_time === 'string' ? route.query.end_time : ''
  const weeks = typeof route.query.weeks === 'string' ? route.query.weeks.trim() : ''
  if (Number.isInteger(weekday) && weekday >= 1 && weekday <= 7) form.weekday = weekday
  if (/^\d{2}:\d{2}$/.test(startTime)) form.start_time = startTime
  if (/^\d{2}:\d{2}$/.test(endTime)) form.end_time = endTime
  if (weeks && weeks.length <= 64) {
    form.weeks = weeks
    syncWeekRangePicker(weeks)
  }
}

function syncWeekRangePicker(weeks: string | null | undefined) {
  const range = parseWeeksRangeToPicker(weeks)
  if (!range) return
  weekRangeStart.value = range.startWeek
  weekRangeEnd.value = range.endWeek
}

function applyWeeksRange() {
  form.weeks = buildWeeksRange(weekRangeStart.value, weekRangeEnd.value)
}

function applyWeeksPreset(value: string) {
  form.weeks = value
  syncWeekRangePicker(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readConflictNotices(details: Record<string, unknown>) {
  if (!Array.isArray(details.conflicts)) return []
  return details.conflicts.flatMap((item) => {
    if (!isRecord(item) || typeof item.course_name !== 'string') return []
    const overlapWeeks = Array.isArray(item.overlap_weeks)
      ? item.overlap_weeks.filter(
          (week): week is number => Number.isInteger(week) && Number(week) > 0
        )
      : []
    return [{ courseName: item.course_name, overlapWeeks }]
  })
}

function collectValidationMessages(): string[] {
  const messages: string[] = []
  if (!Number.isInteger(Number(form.building_id)) || Number(form.building_id) <= 0) {
    messages.push('请选择上课建筑')
  }
  if (!form.room_name.trim()) {
    messages.push('请输入完整教室')
  }
  const firstError = validateCourseForm(form)
  if (firstError && !messages.includes(firstError)) messages.push(firstError)
  return messages
}

function resetSubmitErrors() {
  validationMessages.value = []
  saveErrorMessage.value = ''
  saveErrorCode.value = ''
  conflictNotices.value = []
}

async function loadFormData() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [buildingResult, courseResult] = await Promise.all([getBuildings(), getCourses()])
    buildings.value = buildingResult
    courses.value = courseResult
    if (isEdit.value && courseId.value !== null) {
      const course = courseResult.find((item) => item.id === courseId.value)
      if (!course) {
        errorMessage.value = '未找到这门课程'
        return
      }
      Object.assign(form, courseToForm(course))
      syncWeekRangePicker(form.weeks)
    } else {
      applyCreateDefaultsFromQuery()
    }
  } catch (error) {
    errorMessage.value = extractBusinessError(error).message
  } finally {
    loading.value = false
  }
}

async function submitCourse() {
  resetSubmitErrors()
  validationMessages.value = collectValidationMessages()
  if (validationMessages.value.length > 0) {
    showFailToast(validationMessages.value[0])
    return
  }

  submitting.value = true
  try {
    const payload = formToPayload(form)
    if (isEdit.value && courseId.value !== null) {
      await updateCourse(courseId.value, payload)
      showSuccessToast('课程已更新')
    } else {
      await createCourse(payload)
      showSuccessToast('课程已新增')
    }
    router.push('/courses')
  } catch (error) {
    const businessError = extractBusinessError(error)
    saveErrorCode.value = businessError.code
    if (businessError.code === 'course_conflict') {
      conflictNotices.value = readConflictNotices(businessError.details)
      saveErrorMessage.value = '这段时间已有课程，请调整时间或周次后再保存。'
    } else if (businessError.code === 'semester_unconfigured') {
      saveErrorMessage.value = '请先设置学期，再保存课程。'
    } else if (businessError.code === 'invalid_room_name') {
      saveErrorMessage.value = '请填写确认无误的完整教室。'
    } else {
      saveErrorMessage.value = businessError.message
    }
    showFailToast(saveErrorMessage.value)
  } finally {
    submitting.value = false
  }
}

onMounted(loadFormData)
</script>

<template>
  <section class="page course-form-page">
    <van-nav-bar :title="pageTitle" left-arrow @click-left="router.push('/courses')" />

    <main class="page-content form-content" :style="pageStyle" @focusin="onFieldFocus">
      <header v-reveal="{ from: 'left', distance: 34, stagger: 45 }" class="form-hero">
        <div class="hero-copy">
          <span class="eyebrow">{{ isEdit ? '整理旧笔记' : '写下一门新课' }}</span>
          <h1>{{ isEdit ? '把课程信息补充完整' : '给课程留一张卡片' }}</h1>
          <p>时间、地点和周次写清楚，到点就不慌张。</p>
        </div>
        <div class="notebook-art" aria-hidden="true">
          <span class="paper paper-back"></span>
          <span class="paper paper-front">
            <i></i><i></i><i></i>
            <b></b>
          </span>
          <span class="leaf leaf-a"></span>
          <span class="leaf leaf-b"></span>
        </div>
      </header>

      <section v-if="loading" class="gentle-state" aria-live="polite">
        <span class="state-flower" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <h2>正在铺开课程卡片</h2>
        <p>课程和教学楼信息很快就好。</p>
      </section>

      <section v-else-if="errorMessage" class="gentle-state error-state" role="alert">
        <span class="state-mark" aria-hidden="true">!</span>
        <h2>这张卡片暂时没打开</h2>
        <p>{{ errorMessage }}</p>
        <div class="state-actions">
          <van-button type="primary" size="small" @click="loadFormData">重新加载</van-button>
          <van-button plain size="small" @click="router.push('/courses')">返回课表</van-button>
        </div>
      </section>

      <van-form v-else class="course-form" @submit="submitCourse">
        <section
          v-if="validationMessages.length"
          class="form-notice form-notice--validation"
          role="alert"
          aria-labelledby="course-validation-title"
        >
          <strong id="course-validation-title">还需要补全这些信息</strong>
          <ul>
            <li v-for="message in validationMessages" :key="message">{{ message }}</li>
          </ul>
        </section>

        <section v-if="saveErrorMessage" class="form-notice form-notice--server" role="alert">
          <strong>{{ saveErrorMessage }}</strong>
          <ul v-if="conflictNotices.length" class="conflict-list">
            <li v-for="conflict in conflictNotices" :key="conflict.courseName">
              <span>「{{ conflict.courseName }}」</span>
              <span v-if="conflict.overlapWeeks.length">
                第 {{ conflict.overlapWeeks.join('、') }} 周
              </span>
            </li>
          </ul>
          <a v-if="saveErrorCode === 'semester_unconfigured'" href="/courses#semester-settings">
            前往课表设置学期
          </a>
        </section>

        <section v-reveal="{ from: 'right', distance: 32, stagger: 38 }" class="form-sheet">
          <header class="sheet-heading">
            <span class="sheet-number">01</span>
            <div>
              <h2>这是一门什么课？</h2>
              <p>先写下名字、星期和教学周。</p>
            </div>
            <span class="tape tape-yellow" aria-hidden="true"></span>
          </header>

          <van-cell-group inset>
            <van-field
              v-model="form.course_name"
              required
              label="课程名称"
              maxlength="100"
              placeholder="例如：设计心理学"
            />
            <van-field required label="星期">
              <template #input>
                <select v-model.number="form.weekday" class="form-select" aria-label="选择星期">
                  <option v-for="weekday in WEEKDAYS" :key="weekday.value" :value="weekday.value">
                    {{ weekday.label }}
                  </option>
                </select>
              </template>
            </van-field>
            <van-field v-model="form.teacher" label="老师" maxlength="64" placeholder="选填" />
            <van-field
              v-model="form.weeks"
              required
              label="上课周次"
              maxlength="64"
              placeholder="例如：1-16"
            />
          </van-cell-group>

          <div class="week-planner">
            <div class="week-planner-title">
              <strong>快速填写周次</strong>
              <span>也可以直接修改上方文字</span>
            </div>
            <div class="week-range">
              <label>
                <span>从第几周</span>
                <select v-model.number="weekRangeStart" class="form-select">
                  <option v-for="week in weekOptions" :key="week" :value="week">第 {{ week }} 周</option>
                </select>
              </label>
              <span class="range-path" aria-hidden="true"><i></i></span>
              <label>
                <span>到第几周</span>
                <select v-model.number="weekRangeEnd" class="form-select">
                  <option v-for="week in weekOptions" :key="week" :value="week">第 {{ week }} 周</option>
                </select>
              </label>
              <button type="button" class="write-range" @click="applyWeeksRange">写入周次</button>
            </div>
            <div class="week-presets" aria-label="常用周次">
              <button
                v-for="preset in [
                  { value: '1-16', label: '全学期' },
                  { value: '1-8', label: '前半学期' },
                  { value: '9-16', label: '后半学期' },
                  { value: '1-16(单)', label: '单周' },
                  { value: '1-16(双)', label: '双周' }
                ]"
                :key="preset.value"
                type="button"
                :class="{ active: form.weeks === preset.value }"
                :aria-pressed="form.weeks === preset.value"
                @click="applyWeeksPreset(preset.value)"
              >
                {{ preset.label }}
              </button>
            </div>
          </div>
        </section>

        <section
          v-reveal="{ from: 'left', distance: 32, delay: 70, stagger: 38 }"
          class="form-sheet place-sheet"
        >
          <header class="sheet-heading">
            <span class="sheet-number">02</span>
            <div>
              <h2>什么时候，在哪里？</h2>
              <p>把一天里的时间与校园地点对上。</p>
            </div>
            <span class="tape tape-green" aria-hidden="true"></span>
          </header>

          <van-cell-group inset>
            <div class="time-pair">
              <van-field v-model="form.start_time" required type="time" label="开始时间" />
              <span class="time-arrow" aria-hidden="true">→</span>
              <van-field v-model="form.end_time" required type="time" label="结束时间" />
            </div>

            <van-field required label="上课建筑">
              <template #input>
                <div class="building-picker">
                  <label class="building-search">
                    <span aria-hidden="true">⌕</span>
                    <input
                      v-model="buildingKeyword"
                      type="search"
                      placeholder="搜索教学楼、实验楼或地点"
                    />
                  </label>
                  <select v-model.number="form.building_id" class="form-select" aria-label="选择上课建筑">
                    <option :value="0">请选择建筑</option>
                    <option v-for="building in visibleBuildings" :key="building.id" :value="building.id">
                      {{ building.name }}
                    </option>
                  </select>
                  <small>找到 {{ visibleBuildings.length }} 个地点</small>
                </div>
              </template>
            </van-field>
            <van-field
              v-model="form.room_name"
              required
              label="教室"
              maxlength="120"
              placeholder="请按课表填写完整教室，例如：逸夫楼 A101"
            />
          </van-cell-group>
        </section>

        <footer v-reveal="{ from: 'right', distance: 28, delay: 110 }" class="form-actions">
          <div>
            <strong>{{ isEdit ? '准备更新这张课程卡' : '都写好了吗？' }}</strong>
            <p>保存后会回到课表，也可以随时再修改。</p>
          </div>
          <button type="submit" class="course-save" :disabled="submitting">
            <span v-if="submitting" class="course-save__spinner" aria-hidden="true"></span>
            <span class="course-save__label">
              {{ submitting ? '正在保存课程' : isEdit ? '保存课程修改' : '添加到我的课表' }}
            </span>
          </button>
          <van-button block plain native-type="button" @click="router.push('/courses')">暂不保存</van-button>
        </footer>
      </van-form>
    </main>
  </section>
</template>

<style scoped>
.form-content {
  display: grid;
  width: min(100%, 720px);
  gap: 18px;
  padding-top: 14px;
}

.form-hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 170px;
  min-height: 230px;
  overflow: hidden;
  align-items: center;
  border: 1px solid rgba(86, 128, 92, 0.14);
  border-radius: 34px 34px 84px 34px;
  background:
    radial-gradient(circle at 92% 12%, rgba(255, 224, 137, 0.58), transparent 30%),
    linear-gradient(145deg, #f7f2dc, #edf4df 68%, #e0eecf);
  box-shadow: 0 22px 50px rgba(72, 102, 69, 0.13);
  padding: 28px;
}

.form-hero::before {
  position: absolute;
  right: -62px;
  bottom: -80px;
  width: 230px;
  height: 170px;
  border-radius: 50%;
  background: rgba(111, 160, 100, 0.12);
  content: "";
}

.hero-copy {
  position: relative;
  z-index: 2;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.68);
  color: #648260;
  font-size: 12px;
  font-weight: 700;
  padding: 7px 12px;
}

.hero-copy h1 {
  max-width: 390px;
  margin: 16px 0 9px;
  color: #304b38;
  font-size: clamp(29px, 7vw, 42px);
  letter-spacing: -0.05em;
  line-height: 1.12;
}

.hero-copy p {
  margin: 0;
  color: #718274;
  font-size: 13px;
  line-height: 1.7;
}

.notebook-art {
  position: relative;
  width: 154px;
  height: 160px;
  transform: rotate(3deg);
  animation: notebook-float 5s ease-in-out infinite;
}

.paper {
  position: absolute;
  width: 116px;
  height: 140px;
  border-radius: 9px 18px 18px 9px;
}

.paper-back {
  top: 9px;
  left: 25px;
  background: #e8ba82;
  box-shadow: 0 13px 28px rgba(74, 87, 63, 0.14);
  transform: rotate(8deg);
}

.paper-front {
  top: 3px;
  left: 13px;
  overflow: hidden;
  background:
    repeating-linear-gradient(180deg, transparent 0 24px, rgba(107, 147, 111, 0.13) 25px 26px),
    #fffdf6;
  box-shadow: inset 7px 0 #f2dca3, 0 13px 28px rgba(74, 87, 63, 0.16);
}

.paper-front i {
  display: block;
  width: 62px;
  height: 5px;
  margin: 26px 0 -11px 29px;
  border-radius: 9px;
  background: #a8c7a0;
}

.paper-front i:nth-child(2) { width: 47px; background: #e6bd79; }
.paper-front i:nth-child(3) { width: 70px; background: #a9cdd0; }
.paper-front b {
  position: absolute;
  right: 15px;
  bottom: 14px;
  width: 28px;
  height: 34px;
  border-radius: 50% 4px 50% 6px;
  background: #85ad7c;
  transform: rotate(25deg);
}

.leaf {
  position: absolute;
  width: 34px;
  height: 53px;
  border-radius: 90% 8% 90% 10%;
  background: #6d9c67;
  transform-origin: bottom center;
}

.leaf-a {
  right: 1px;
  bottom: -2px;
  transform: rotate(27deg);
  animation: leaf-sway 3.6s ease-in-out infinite;
}

.leaf-b {
  right: 30px;
  bottom: -8px;
  width: 27px;
  height: 43px;
  background: #a4bd72;
  transform: rotate(-13deg);
  animation: leaf-sway 3.6s .5s ease-in-out infinite reverse;
}

.gentle-state {
  display: grid;
  justify-items: center;
  border: 1px solid rgba(86, 128, 92, 0.14);
  border-radius: 28px;
  background: rgba(255, 253, 247, 0.88);
  padding: 38px 22px;
  text-align: center;
}

.gentle-state h2 { margin: 14px 0 5px; color: #344b3a; font-size: 20px; }
.gentle-state p { margin: 0; color: #748077; font-size: 13px; }
.state-actions { display: flex; gap: 10px; margin-top: 18px; }
.state-mark {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 50%;
  background: #f8d7c8;
  color: #a25f4f;
  font-size: 22px;
  font-weight: 800;
}

.state-flower { position: relative; width: 52px; height: 52px; animation: flower-turn 4s linear infinite; }
.state-flower i {
  position: absolute;
  top: 4px;
  left: 18px;
  width: 17px;
  height: 26px;
  border-radius: 80% 80% 35% 35%;
  background: #a9c99d;
  transform-origin: 8px 22px;
}
.state-flower i:nth-child(2) { transform: rotate(90deg); }
.state-flower i:nth-child(3) { transform: rotate(180deg); }
.state-flower i:nth-child(4) { transform: rotate(270deg); }

.course-form { display: grid; gap: 18px; }
.form-notice {
  display: grid;
  gap: 9px;
  border: 1px solid #e3b6a7;
  border-radius: 19px;
  background: #fff1ec;
  color: #713b32;
  padding: 14px 16px;
}

.form-notice strong {
  font-size: 14px;
  line-height: 1.55;
}

.form-notice ul {
  display: grid;
  gap: 5px;
  margin: 0;
  padding-left: 20px;
}

.form-notice li {
  font-size: 13px;
  line-height: 1.55;
}

.form-notice a {
  justify-self: start;
  border-bottom: 1px solid currentColor;
  color: #6b3c32;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.8;
  text-decoration: none;
}

.conflict-list li {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 12px;
}

.form-sheet {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(91, 119, 86, 0.13);
  border-radius: 29px;
  background:
    linear-gradient(90deg, transparent 31px, rgba(221, 135, 116, 0.13) 32px, transparent 33px),
    repeating-linear-gradient(180deg, transparent 0 43px, rgba(93, 139, 102, 0.07) 44px 45px),
    #fffdf8;
  box-shadow: 0 18px 44px rgba(75, 91, 70, 0.09);
  padding: 20px;
}

.sheet-heading {
  position: relative;
  display: flex;
  align-items: center;
  gap: 13px;
  margin-bottom: 14px;
  padding: 2px 4px 11px;
}
.sheet-number {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50% 50% 48% 38%;
  background: #e3efda;
  color: #567852;
  font-family: Georgia, serif;
  font-size: 15px;
  font-weight: 700;
}
.sheet-heading h2 { margin: 0; color: #354a39; font-size: 19px; }
.sheet-heading p { margin: 4px 0 0; color: #849087; font-size: 13px; }
.tape {
  position: absolute;
  top: -23px;
  right: 17px;
  width: 62px;
  height: 21px;
  opacity: .7;
  background: #f3d999;
  transform: rotate(4deg);
}
.tape-green { background: #b9d5af; transform: rotate(-5deg); }

.form-sheet :deep(.van-cell-group) {
  overflow: visible;
  margin: 0;
  background: transparent;
}
.form-sheet :deep(.van-cell) {
  margin-bottom: 10px;
  border: 1px solid rgba(91, 119, 86, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.83);
  padding: 13px 14px;
}
.form-sheet :deep(.van-cell::after) { display: none; }
.form-sheet :deep(.van-field__label) { width: 74px; color: #65736a; font-size: 13px; }
.form-sheet :deep(.van-field__control) { color: #2f4234; font-size: 16px; }

.form-select,
.building-search input {
  width: 100%;
  min-height: 44px;
  border: 1px solid #dbe7d8;
  border-radius: 12px;
  background: #fbfdf8;
  color: #304537;
  font: inherit;
  font-size: 16px;
  outline: none;
  padding: 0 34px 0 11px;
}
.form-select:focus,
.building-search input:focus {
  border-color: #7ca178;
  box-shadow: 0 0 0 3px rgba(109, 151, 103, 0.13);
}

.week-planner {
  margin: 4px 0 10px;
  border-radius: 20px;
  background: #f2f6e9;
  padding: 15px;
}
.week-planner-title { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.week-planner-title strong { color: #486248; font-size: 13px; }
.week-planner-title span { color: #899488; font-size: 13px; }
.week-range {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 26px minmax(0, 1fr) auto;
  align-items: end;
  gap: 8px;
  margin-top: 12px;
}
.week-range label { display: grid; gap: 6px; }
.week-range label > span { color: #718171; font-size: 13px; }
.range-path { display: grid; height: 40px; place-items: center; }
.range-path i { width: 17px; height: 2px; border-radius: 2px; background: #a7bfa0; }
.write-range {
  min-height: 40px;
  border: 0;
  border-radius: 12px;
  background: #668e61;
  color: #fff;
  font-weight: 700;
  padding: 0 14px;
}
.week-presets { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 11px; }
.week-presets button {
  min-height: 44px;
  border: 1px solid #d6e3d1;
  border-radius: 99px;
  background: #fffdf8;
  color: #5e735e;
  font-size: 12px;
  padding: 0 12px;
  transition: transform .2s ease, background .2s ease, color .2s ease;
}
.week-presets button.active {
  border-color: #6d9468;
  background: #6d9468;
  color: #fff;
  box-shadow: 0 5px 12px rgba(75, 116, 72, .18);
  transform: translateY(-2px);
}

.time-pair {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 26px minmax(0, 1fr);
  align-items: center;
}
.time-pair :deep(.van-cell) { min-width: 0; }
.time-arrow { color: #7c9c76; font-size: 20px; text-align: center; }
.building-picker { display: grid; width: 100%; gap: 9px; }
.building-search { position: relative; display: block; }
.building-search span {
  position: absolute;
  top: 50%;
  left: 11px;
  z-index: 1;
  color: #74916f;
  font-size: 20px;
  transform: translateY(-52%);
}
.building-search input { padding-left: 36px; }
.building-picker strong { font-size: 15px; }
.building-picker small { color: #899388; font-size: 13px; }

.form-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(190px, .65fr);
  align-items: center;
  gap: 10px 14px;
  border: 1px solid rgba(91, 119, 86, 0.13);
  border-radius: 25px;
  background: #eef4e8;
  box-shadow: 0 16px 40px rgba(75, 91, 70, 0.08);
  padding: 17px;
}
.form-actions > div { grid-row: 1 / 3; }
.form-actions strong { color: #405642; font-size: 15px; }
.form-actions p { margin: 5px 0 0; color: #7f8c80; font-size: 13px; line-height: 1.5; }

.course-save {
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border: 1px solid #547e58;
  border-radius: 14px;
  background: #5f8964;
  box-shadow: 0 8px 18px rgba(64, 101, 67, .18);
  color: #fff;
  cursor: pointer;
  padding: 0 17px;
  transition: transform 260ms ease, box-shadow 260ms ease, background 260ms ease;
}

.course-save:disabled {
  cursor: wait;
  opacity: .82;
}

.course-save__label {
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  line-height: 1.35;
}

.course-save__spinner {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  border: 2px solid rgba(255, 255, 255, .45);
  border-top-color: #fff;
  border-radius: 50%;
  animation: save-spin 900ms linear infinite;
}

@media (hover: hover) and (pointer: fine) {
  .course-save:not(:disabled):hover {
    background: #527a57;
    box-shadow: 0 12px 24px rgba(64, 101, 67, .24);
    transform: translateY(-2px);
  }
}

@keyframes notebook-float {
  0%, 100% { transform: rotate(3deg) translateY(0); }
  50% { transform: rotate(-1deg) translateY(-8px); }
}
@keyframes leaf-sway {
  0%, 100% { rotate: 0deg; }
  50% { rotate: 8deg; }
}
@keyframes flower-turn { to { transform: rotate(360deg); } }
@keyframes save-spin { to { transform: rotate(360deg); } }

@media (max-width: 560px) {
  .form-hero { grid-template-columns: minmax(0, 1fr) 112px; min-height: 210px; padding: 22px 18px; }
  .notebook-art { width: 112px; transform: scale(.78) rotate(3deg); transform-origin: center; }
  .week-range { grid-template-columns: minmax(0, 1fr) 18px minmax(0, 1fr); }
  .write-range { grid-column: 1 / -1; }
  .form-actions { grid-template-columns: 1fr; }
  .form-actions > div { grid-row: auto; }
}

@media (max-width: 390px) {
  .form-hero { grid-template-columns: 1fr; min-height: 230px; padding-right: 100px; }
  .notebook-art { position: absolute; right: -2px; bottom: -23px; }
  .hero-copy h1 { font-size: 27px; }
  .form-sheet { padding: 15px 12px; }
  .time-pair { grid-template-columns: 1fr; }
  .time-arrow { rotate: 90deg; }
}

@media (prefers-reduced-motion: reduce) {
  .notebook-art,
  .leaf,
  .state-flower,
  .course-save__spinner { animation: none; }
}
</style>

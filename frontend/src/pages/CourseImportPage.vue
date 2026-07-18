<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { isAxiosError } from 'axios'
import { showFailToast, showSuccessToast } from 'vant'
import { useRouter } from 'vue-router'

import { getBuildings, type Building } from '@/api/buildings'
import { createCourse, previewCourseImport } from '@/api/courses'
import type { CourseImportPreviewItem } from '@/types/course'
import { filterBuildingsByKeyword, includeSelectedBuilding } from '@/utils/buildings'
import { WEEKDAYS, validateCourseForm } from '@/utils/course'

const router = useRouter()
const buildings = ref<Building[]>([])
const previewItems = ref<CourseImportPreviewItem[]>([])
const selectedFile = ref<File | null>(null)
const loading = ref(false)
const importing = ref(false)
const errorMessage = ref('')
const buildingKeyword = ref('')

const matchedCount = computed(() => previewItems.value.filter((item) => item.building_id).length)
const needsReviewCount = computed(() => previewItems.value.filter((item) => !item.building_id).length)
const filteredBuildings = computed(() =>
  filterBuildingsByKeyword(buildings.value, buildingKeyword.value, 80)
)
const matchPercent = computed(() =>
  previewItems.value.length ? Math.round((matchedCount.value / previewItems.value.length) * 100) : 0
)

function getVisibleBuildings(selectedBuildingId: number | null) {
  return includeSelectedBuilding(filteredBuildings.value, buildings.value, selectedBuildingId)
}

function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') return detail
  }
  return '课表导入失败，请检查文件格式后重试'
}

async function loadBuildings() {
  try {
    buildings.value = await getBuildings()
  } catch (error) {
    showFailToast(getErrorMessage(error))
  }
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] ?? null
  previewItems.value = []
  errorMessage.value = ''
}

async function previewFile() {
  if (!selectedFile.value) {
    showFailToast('请先选择 HTML 或 Excel 课表文件')
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await previewCourseImport(selectedFile.value)
    previewItems.value = result.items
    if (result.total === 0) showFailToast('没有识别到课程，请检查课表格式')
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
    showFailToast(errorMessage.value)
  } finally {
    loading.value = false
  }
}

function toPayload(item: CourseImportPreviewItem) {
  return {
    course_name: item.course_name,
    weekday: item.weekday,
    start_time: item.start_time,
    end_time: item.end_time,
    building_id: Number(item.building_id),
    room_name: item.room_name,
    teacher: item.teacher,
    weeks: item.weeks
  }
}

async function importCourses() {
  if (previewItems.value.length === 0) {
    showFailToast('请先预览课表')
    return
  }
  for (const item of previewItems.value) {
    const validation = validateCourseForm(toPayload(item))
    if (validation) {
      showFailToast(`「${item.course_name}」${validation}`)
      return
    }
  }
  importing.value = true
  try {
    for (const item of previewItems.value) await createCourse(toPayload(item))
    showSuccessToast(`已导入 ${previewItems.value.length} 门课程`)
    router.push('/courses')
  } catch (error) {
    showFailToast(getErrorMessage(error))
  } finally {
    importing.value = false
  }
}

onMounted(loadBuildings)
</script>

<template>
  <section class="page course-import-page">
    <van-nav-bar title="导入课表" left-arrow @click-left="router.push('/courses')" />

    <main class="page-content import-content">
      <header v-reveal="{ from: 'left', distance: 34, stagger: 45 }" class="import-hero">
        <div class="hero-copy">
          <span class="eyebrow">省一点手动录入的时间</span>
          <h1>把课表轻轻搬进来</h1>
          <p>选择 HTML 或 Excel 文件，先预览、再确认，一门课也不会糊里糊涂地进来。</p>
        </div>
        <div class="page-stack" :class="{ reading: loading }" aria-hidden="true">
          <span class="import-paper paper-three"></span>
          <span class="import-paper paper-two"></span>
          <span class="import-paper paper-one">
            <i></i><i></i><i></i><b></b>
          </span>
          <span class="moving-leaf"></span>
        </div>
      </header>

      <section v-reveal="{ from: 'right', distance: 30, delay: 45 }" class="upload-card">
        <header>
          <span class="card-step">第一步</span>
          <div>
            <h2>选择课表文件</h2>
            <p>支持 HTML、XLS、XLSX 格式</p>
          </div>
        </header>

        <label class="file-picker" :class="{ 'has-file': selectedFile, reading: loading }">
          <input
            type="file"
            accept=".html,.htm,.xls,.xlsx,text/html,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            @change="handleFileChange"
          />
          <span class="file-flower" aria-hidden="true"><i></i><i></i><i></i></span>
          <span class="file-copy">
            <strong>{{ selectedFile?.name || '点这里选择一个文件' }}</strong>
            <small>{{ selectedFile ? '已选好，下一步看看识别结果' : '也可以随时换一个文件' }}</small>
          </span>
          <span class="choose-word">{{ selectedFile ? '重新选择' : '浏览文件' }}</span>
        </label>

        <p v-if="errorMessage" class="error-note" role="alert">{{ errorMessage }}</p>

        <div class="preview-action">
          <span>{{ selectedFile ? '文件已就位' : '等待选择文件' }}</span>
          <van-button
            type="primary"
            :disabled="!selectedFile"
            :loading="loading"
            loading-text="正在读取课表"
            @click="previewFile"
          >
            预览识别结果
          </van-button>
        </div>
      </section>

      <template v-if="previewItems.length">
        <section v-reveal="{ from: 'left', distance: 30, stagger: 55 }" class="report-card">
          <header>
            <span class="card-step">第二步</span>
            <div>
              <h2>看看识别得对不对</h2>
              <p>黄色提示的课程，需要补选一个建筑。</p>
            </div>
          </header>
          <div class="report-numbers">
            <div><strong>{{ previewItems.length }}</strong><span>门课程</span></div>
            <div><strong>{{ matchedCount }}</strong><span>地点已匹配</span></div>
            <div :class="{ warning: needsReviewCount }">
              <strong>{{ needsReviewCount }}</strong><span>需要确认</span>
            </div>
          </div>
          <div class="match-progress">
            <div><span>地点匹配进度</span><strong>{{ matchPercent }}%</strong></div>
            <span class="progress-track"><i :style="{ width: `${matchPercent}%` }"></i></span>
          </div>
        </section>

        <label v-reveal="{ from: 'right', distance: 28, delay: 70 }" class="building-search">
          <span class="search-symbol" aria-hidden="true">⌕</span>
          <span>
            <strong>筛选建筑选项</strong>
            <input v-model="buildingKeyword" type="search" placeholder="输入教学楼或地点名称" />
          </span>
          <small>{{ filteredBuildings.length }} 个</small>
        </label>

        <section class="preview-section">
          <div class="section-heading">
            <div>
              <span>第三步</span>
              <h2>逐门确认课程</h2>
            </div>
            <p>每项内容都可以在这里调整。</p>
          </div>

          <div class="preview-list">
            <article
              v-for="(item, index) in previewItems"
              :key="`${item.course_name}-${index}`"
              v-reveal="{
                from: index % 2 ? 'right' : 'left',
                distance: 30,
                delay: Math.min(index * 45, 220),
                stagger: 30
              }"
              class="preview-card"
              :class="{ 'needs-review': !item.building_id }"
            >
              <header class="preview-heading">
                <span class="course-number">{{ String(index + 1).padStart(2, '0') }}</span>
                <div>
                  <strong>{{ item.course_name || '未命名课程' }}</strong>
                  <p>{{ item.raw_location || '暂未读取到原始地点' }}</p>
                </div>
                <span class="match-badge" :class="{ warning: !item.building_id }">
                  {{ item.building_id ? '地点已匹配' : '请补选地点' }}
                </span>
              </header>

              <div class="edit-grid">
                <van-field v-model="item.course_name" required label="课程名称" />
                <van-field required label="星期">
                  <template #input>
                    <select v-model.number="item.weekday" class="form-select">
                      <option v-for="weekday in WEEKDAYS" :key="weekday.value" :value="weekday.value">
                        {{ weekday.label }}
                      </option>
                    </select>
                  </template>
                </van-field>
                <van-field v-model="item.start_time" required type="time" label="开始时间" />
                <van-field v-model="item.end_time" required type="time" label="结束时间" />
                <van-field
                  :model-value="item.teacher ?? ''"
                  label="老师"
                  placeholder="选填"
                  @update:model-value="item.teacher = String($event || '') || null"
                />
                <van-field
                  :model-value="item.weeks ?? ''"
                  label="上课周次"
                  placeholder="例如：1-16"
                  @update:model-value="item.weeks = String($event || '') || null"
                />
                <van-field class="wide-field" required label="上课建筑">
                  <template #input>
                    <select v-model.number="item.building_id" class="form-select">
                      <option :value="null">请选择建筑</option>
                      <option
                        v-for="building in getVisibleBuildings(item.building_id)"
                        :key="building.id"
                        :value="building.id"
                      >
                        {{ building.name }}
                      </option>
                    </select>
                  </template>
                </van-field>
                <van-field
                  v-model="item.room_name"
                  class="wide-field"
                  required
                  label="教室"
                  placeholder="例如：A101"
                />
              </div>
            </article>
          </div>
        </section>

        <footer v-reveal="{ from: 'right', distance: 28, delay: 100 }" class="import-actions">
          <div>
            <strong>{{ needsReviewCount ? '还有课程需要确认地点' : '课程已经整理好了' }}</strong>
            <p>{{ needsReviewCount ? '补全黄色卡片后，就可以一起导入。' : '确认无误后，把它们放进我的课表。' }}</p>
          </div>
          <van-button
            type="primary"
            block
            :disabled="needsReviewCount > 0"
            :loading="importing"
            loading-text="正在导入课程"
            @click="importCourses"
          >
            导入 {{ previewItems.length }} 门课程
          </van-button>
        </footer>
      </template>
    </main>
  </section>
</template>

<style scoped>
.import-content {
  display: grid;
  width: min(100%, 760px);
  gap: 18px;
  padding-top: 14px;
}

.import-hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px;
  min-height: 245px;
  overflow: hidden;
  align-items: center;
  border: 1px solid rgba(91, 125, 91, .14);
  border-radius: 36px 36px 36px 88px;
  background:
    radial-gradient(circle at 12% 110%, rgba(137, 183, 176, .28), transparent 40%),
    linear-gradient(150deg, #eef6eb, #f6f1d9 68%, #f0e4c4);
  box-shadow: 0 22px 50px rgba(74, 103, 70, .12);
  padding: 28px;
}
.import-hero::after {
  position: absolute;
  right: -45px;
  bottom: -85px;
  width: 245px;
  height: 175px;
  border-radius: 50%;
  background: rgba(99, 151, 119, .12);
  content: "";
}
.hero-copy { position: relative; z-index: 2; }
.eyebrow {
  display: inline-flex;
  border-radius: 99px;
  background: rgba(255, 255, 255, .72);
  color: #6c8464;
  font-size: 12px;
  font-weight: 700;
  padding: 7px 12px;
}
.hero-copy h1 {
  max-width: 410px;
  margin: 16px 0 9px;
  color: #314b38;
  font-size: clamp(30px, 7vw, 44px);
  letter-spacing: -.055em;
  line-height: 1.1;
}
.hero-copy p { max-width: 430px; margin: 0; color: #738174; font-size: 13px; line-height: 1.75; }

.page-stack { position: relative; z-index: 1; width: 166px; height: 162px; }
.import-paper {
  position: absolute;
  width: 114px;
  height: 142px;
  border-radius: 10px 17px 17px 10px;
  transform-origin: bottom left;
}
.paper-three { top: 5px; left: 37px; background: #d4b383; transform: rotate(11deg); }
.paper-two { top: 3px; left: 24px; background: #c4d7b7; transform: rotate(5deg); }
.paper-one {
  top: 0;
  left: 10px;
  overflow: hidden;
  background: #fffef8;
  box-shadow: inset 8px 0 #f0dcb0, 0 15px 30px rgba(72, 90, 66, .16);
}
.paper-one i {
  display: block;
  width: 67px;
  height: 5px;
  margin: 26px 0 -10px 29px;
  border-radius: 9px;
  background: #a9c7a5;
}
.paper-one i:nth-child(2) { width: 51px; background: #e8bf83; }
.paper-one i:nth-child(3) { width: 72px; background: #a9cbd0; }
.paper-one b {
  position: absolute;
  right: 14px;
  bottom: 12px;
  width: 29px;
  height: 36px;
  border-radius: 90% 7% 90% 10%;
  background: #77a370;
  transform: rotate(23deg);
}
.moving-leaf {
  position: absolute;
  right: 0;
  bottom: -3px;
  width: 33px;
  height: 54px;
  border-radius: 90% 8% 90% 10%;
  background: #70996c;
  transform: rotate(24deg);
  animation: import-leaf 3.8s ease-in-out infinite;
}
.page-stack.reading .paper-one { animation: page-read 1.25s ease-in-out infinite; }

.upload-card,
.report-card,
.preview-card,
.import-actions {
  border: 1px solid rgba(90, 119, 85, .13);
  background: rgba(255, 253, 247, .92);
  box-shadow: 0 18px 44px rgba(73, 91, 68, .08);
}
.upload-card,
.report-card { border-radius: 28px; padding: 18px; }
.upload-card > header,
.report-card > header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.card-step {
  display: grid;
  min-width: 54px;
  height: 32px;
  place-items: center;
  border-radius: 99px;
  background: #e4efdc;
  color: #557454;
  font-size: 11px;
  font-weight: 700;
}
.upload-card h2,
.report-card h2 { margin: 0; color: #384e3c; font-size: 18px; }
.upload-card header p,
.report-card header p { margin: 4px 0 0; color: #879188; font-size: 11px; }

.file-picker {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  min-height: 118px;
  align-items: center;
  gap: 14px;
  overflow: hidden;
  border: 2px dashed #cbdcc7;
  border-radius: 22px;
  background:
    radial-gradient(circle at 90% 15%, rgba(246, 210, 137, .25), transparent 25%),
    #f7faef;
  cursor: pointer;
  padding: 18px;
  transition: border-color .2s ease, transform .25s ease, background .2s ease;
}
.file-picker:hover { border-color: #8cac86; transform: translateY(-2px); }
.file-picker:focus-within { outline: 3px solid rgba(101, 145, 95, .18); outline-offset: 2px; }
.file-picker.has-file { border-style: solid; border-color: #94b28e; background: #f1f7e9; }
.file-picker input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
}
.file-flower {
  position: relative;
  width: 58px;
  height: 58px;
  border-radius: 20px 20px 28px 20px;
  background: #e3eedb;
}
.file-flower i {
  position: absolute;
  top: 11px;
  left: 24px;
  width: 13px;
  height: 25px;
  border-radius: 80% 80% 30% 30%;
  background: #80a77a;
  transform-origin: 6px 20px;
}
.file-flower i:nth-child(2) { transform: rotate(120deg); }
.file-flower i:nth-child(3) { transform: rotate(240deg); }
.reading .file-flower { animation: flower-spin 2.3s linear infinite; }
.file-copy { display: grid; min-width: 0; gap: 6px; }
.file-copy strong { overflow: hidden; color: #3c513f; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.file-copy small { color: #849087; font-size: 11px; }
.choose-word {
  min-height: 38px;
  border-radius: 12px;
  background: #fff;
  color: #587458;
  font-size: 12px;
  font-weight: 700;
  padding: 11px 13px;
}
.error-note {
  margin: 11px 0 0;
  border-radius: 13px;
  background: #fbe7dd;
  color: #9a5a4d;
  font-size: 12px;
  line-height: 1.55;
  padding: 10px 12px;
}
.preview-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 13px;
}
.preview-action > span { color: #849087; font-size: 11px; }

.report-numbers { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; }
.report-numbers > div {
  display: grid;
  min-height: 82px;
  align-content: center;
  justify-items: center;
  border-radius: 17px;
  background: #eff5ea;
}
.report-numbers > div:nth-child(2) { background: #e7f2ee; }
.report-numbers > div.warning { background: #fff0d5; }
.report-numbers strong { color: #405941; font-family: Georgia, serif; font-size: 26px; }
.report-numbers span { margin-top: 3px; color: #7d8b7d; font-size: 10px; }
.match-progress { margin-top: 13px; }
.match-progress > div { display: flex; justify-content: space-between; color: #758276; font-size: 10px; }
.match-progress strong { color: #5d8259; }
.progress-track { display: block; height: 7px; overflow: hidden; margin-top: 7px; border-radius: 99px; background: #e4eadf; }
.progress-track i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #9fc495, #70a994); transition: width .5s cubic-bezier(.22, 1, .36, 1); }

.building-search {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  border: 1px solid rgba(90, 119, 85, .13);
  border-radius: 20px;
  background: #eef5e9;
  padding: 12px 14px;
}
.search-symbol {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border-radius: 14px;
  background: #fff;
  color: #658261;
  font-size: 23px;
}
.building-search > span:nth-child(2) { display: grid; min-width: 0; gap: 5px; }
.building-search strong { color: #506752; font-size: 11px; }
.building-search input {
  width: 100%;
  min-height: 36px;
  border: 1px solid #d7e3d4;
  border-radius: 11px;
  background: #fff;
  color: #304537;
  font: inherit;
  font-size: 12px;
  outline: none;
  padding: 0 10px;
}
.building-search input:focus { border-color: #7fa17a; box-shadow: 0 0 0 3px rgba(105, 146, 99, .13); }
.building-search > small { color: #789078; font-size: 11px; }

.preview-section { display: grid; gap: 12px; }
.section-heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; padding: 5px 3px; }
.section-heading span { color: #789076; font-size: 10px; font-weight: 700; }
.section-heading h2 { margin: 4px 0 0; color: #354b39; font-size: 20px; }
.section-heading p { margin: 0; color: #899389; font-size: 10px; }
.preview-list { display: grid; gap: 13px; }
.preview-card {
  position: relative;
  overflow: hidden;
  border-radius: 25px;
  padding: 16px;
}
.preview-card::before {
  position: absolute;
  top: 0;
  right: 30px;
  width: 74px;
  height: 22px;
  opacity: .65;
  background: #bcd6b4;
  content: "";
  transform: rotate(3deg) translateY(-9px);
}
.preview-card.needs-review { border-color: #e7c781; background: #fffaf0; }
.preview-card.needs-review::before { background: #f1d48d; }
.preview-heading {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
  padding-bottom: 12px;
}
.course-number {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 50%;
  background: #e8f1e2;
  color: #557454;
  font-family: Georgia, serif;
  font-size: 13px;
}
.preview-heading > div { min-width: 0; }
.preview-heading strong { display: block; overflow: hidden; color: #35493a; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
.preview-heading p { overflow: hidden; margin: 4px 0 0; color: #8a938a; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.match-badge {
  border-radius: 99px;
  background: #e5f1df;
  color: #577752;
  font-size: 10px;
  font-weight: 700;
  padding: 7px 9px;
}
.match-badge.warning { background: #ffedc9; color: #946d2e; }
.edit-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.edit-grid :deep(.van-cell) {
  min-width: 0;
  border: 1px solid #e0e8dc;
  border-radius: 14px;
  background: #fbfdf8;
  padding: 11px;
}
.edit-grid :deep(.van-cell::after) { display: none; }
.edit-grid :deep(.van-field__label) { width: 65px; color: #718073; font-size: 11px; }
.edit-grid :deep(.van-field__control) { color: #304537; font-size: 12px; }
.edit-grid .wide-field { grid-column: 1 / -1; }
.form-select {
  width: 100%;
  min-height: 36px;
  border: 1px solid #d8e4d5;
  border-radius: 10px;
  background: #fff;
  color: #304537;
  font: inherit;
  font-size: 12px;
  outline: none;
  padding: 0 30px 0 9px;
}
.form-select:focus { border-color: #7c9f77; box-shadow: 0 0 0 3px rgba(105, 146, 99, .12); }

.import-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(210px, .62fr);
  align-items: center;
  gap: 15px;
  border-radius: 25px;
  background: #edf4e7;
  padding: 17px;
}
.import-actions strong { color: #405643; font-size: 15px; }
.import-actions p { margin: 5px 0 0; color: #7d897e; font-size: 11px; line-height: 1.5; }

@keyframes import-leaf {
  0%, 100% { transform: rotate(24deg) translateY(0); }
  50% { transform: rotate(16deg) translateY(-7px); }
}
@keyframes page-read {
  0%, 100% { transform: rotate(0); }
  50% { transform: rotateY(-9deg) translateX(-3px); }
}
@keyframes flower-spin { to { transform: rotate(360deg); } }

@media (max-width: 590px) {
  .import-hero { grid-template-columns: minmax(0, 1fr) 115px; min-height: 225px; padding: 22px 18px; }
  .page-stack { width: 115px; transform: scale(.78); transform-origin: center; }
  .file-picker { grid-template-columns: auto minmax(0, 1fr); }
  .choose-word { grid-column: 1 / -1; text-align: center; }
  .import-actions { grid-template-columns: 1fr; }
}
@media (max-width: 420px) {
  .import-hero { grid-template-columns: 1fr; padding-right: 92px; }
  .hero-copy h1 { font-size: 28px; }
  .page-stack { position: absolute; right: -13px; bottom: -20px; }
  .preview-action { align-items: stretch; flex-direction: column; }
  .preview-heading { grid-template-columns: auto minmax(0, 1fr); }
  .match-badge { grid-column: 1 / -1; width: fit-content; margin-left: 49px; }
  .edit-grid { grid-template-columns: 1fr; }
  .edit-grid .wide-field { grid-column: auto; }
  .section-heading p { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .moving-leaf,
  .page-stack.reading .paper-one,
  .reading .file-flower { animation: none; }
}
</style>

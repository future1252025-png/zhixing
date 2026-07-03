<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { isAxiosError } from 'axios'
import { showFailToast, showSuccessToast } from 'vant'
import { useRouter } from 'vue-router'

import { getBuildings, type Building } from '@/api/buildings'
import { createCourse, previewCourseImport } from '@/api/courses'
import type { CourseImportPreviewItem } from '@/types/course'
import { filterBuildingsByKeyword, includeSelectedBuilding } from '@/utils/buildings'
import { validateCourseForm } from '@/utils/course'

const router = useRouter()
const buildings = ref<Building[]>([])
const previewItems = ref<CourseImportPreviewItem[]>([])
const selectedFile = ref<File | null>(null)
const loading = ref(false)
const importing = ref(false)
const errorMessage = ref('')
const buildingKeyword = ref('')

const matchedCount = computed(
  () => previewItems.value.filter((item) => item.building_id).length
)
const needsReviewCount = computed(
  () => previewItems.value.filter((item) => !item.building_id).length
)
const filteredBuildings = computed(() =>
  filterBuildingsByKeyword(buildings.value, buildingKeyword.value, 80)
)

function getVisibleBuildings(selectedBuildingId: number | null) {
  return includeSelectedBuilding(filteredBuildings.value, buildings.value, selectedBuildingId)
}

function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') {
      return detail
    }
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
    if (result.total === 0) {
      showFailToast('没有识别到课程，请检查课表格式')
    }
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
    for (const item of previewItems.value) {
      await createCourse(toPayload(item))
    }
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
  <section class="page">
    <van-nav-bar title="导入课表" left-arrow @click-left="router.push('/courses')" />
    <div class="page-content">
      <header class="import-heading"><span>HTML / Excel</span><h1>导入课表</h1><p>先解析预览，再一次性写入课程。系统会自动匹配已有校园建筑。</p></header>

      <section class="import-panel">
        <label class="file-picker">
          <input
            type="file"
            accept=".html,.htm,.xlsx,text/html,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            @change="handleFileChange"
          />
          <van-icon name="description" />
          <strong>{{ selectedFile?.name ?? '选择课表文件' }}</strong>
          <small>支持 .html、.htm、.xlsx</small>
        </label>
        <van-button type="primary" block :loading="loading" @click="previewFile">
          预览课表
        </van-button>
        <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
      </section>

      <section v-if="previewItems.length" class="preview-summary">
        <span>共识别 {{ previewItems.length }} 门课程</span>
        <span>已匹配 {{ matchedCount }}</span>
        <span>待确认 {{ needsReviewCount }}</span>
      </section>

      <section v-if="previewItems.length" class="building-search-panel">
        <label>
          <span>筛选上课建筑</span>
          <input
            v-model="buildingKeyword"
            type="search"
            placeholder="输入教学楼、实验楼或地点"
          />
        </label>
        <small>当前显示 {{ filteredBuildings.length }} / {{ buildings.length }} 个地点</small>
      </section>

      <section v-if="previewItems.length" class="preview-list">
        <article
          v-for="(item, index) in previewItems"
          :key="`${item.course_name}-${item.weekday}-${item.start_time}-${index}`"
          class="preview-card"
        >
          <div class="preview-head">
            <h2>{{ item.course_name }}</h2>
            <span>{{ item.start_time }}-{{ item.end_time }}</span>
          </div>
          <p>星期{{ ['一', '二', '三', '四', '五', '六', '日'][item.weekday - 1] }}</p>
          <p v-if="item.teacher">教师：{{ item.teacher }}</p>
          <p v-if="item.weeks">周次：{{ item.weeks }}</p>
          <p>原始地点：{{ item.raw_location || item.room_name }}</p>
          <van-field label="上课建筑" required>
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
            required
            label="教室"
            maxlength="64"
            placeholder="请输入教室"
          />
        </article>
      </section>

      <div v-if="previewItems.length" class="page-actions">
        <van-button type="primary" block :loading="importing" @click="importCourses">
          确认导入
        </van-button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.import-panel,
.preview-list {
  margin-bottom: 14px;
}

.import-heading { margin-bottom: 20px; padding: 8px 2px 0; }
.import-heading span { color: var(--cm-primary); font-size: 12px; font-weight: 700; }
.import-heading h1 { margin: 6px 0 6px; font-size: 28px; line-height: 1.2; }
.import-heading p { margin: 0; color: var(--cm-muted); font-size: 14px; line-height: 1.65; }

.import-panel {
  display: grid;
  gap: 12px;
}

.file-picker {
  display: grid;
  min-height: 150px;
  place-items: center;
  align-content: center;
  gap: 6px;
  border: 1px dashed var(--cm-line-strong);
  border-radius: var(--cm-radius);
  background: #fff;
  color: var(--cm-ink);
  cursor: pointer;
  font-size: 14px;
  padding: 18px;
  text-align: center;
}

.file-picker .van-icon { color: var(--cm-primary); font-size: 30px; }
.file-picker strong { font-size: 14px; }
.file-picker small { color: var(--cm-muted); font-size: 11px; }

.file-picker input {
  display: none;
}

.error-text {
  margin: 0;
  color: var(--cm-red);
  font-size: 13px;
}

.preview-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin-bottom: 14px;
  border: 1px solid var(--cm-line);
  background: #fff;
}

.preview-summary span {
  background: #fff;
  color: var(--cm-text);
  font-size: 12px;
  font-weight: 700;
  padding: 10px 8px;
  text-align: center;
}
.preview-summary span + span { border-left: 1px solid var(--cm-line); }

.building-search-panel {
  display: grid;
  gap: 6px;
  margin-bottom: 14px;
  border: 1px solid var(--cm-line);
  border-radius: var(--cm-radius);
  background: #fff;
  padding: 11px 13px;
}

.building-search-panel label {
  display: grid;
  gap: 7px;
}

.building-search-panel span {
  color: var(--cm-text);
  font-size: 13px;
  font-weight: 700;
}

.building-search-panel input {
  width: 100%;
  min-height: 36px;
  border: 1px solid var(--cm-line);
  border-radius: 6px;
  background: #f8faf8;
  color: var(--cm-ink);
  font: inherit;
  outline: none;
  padding: 0 10px;
}

.building-search-panel small {
  color: var(--cm-muted);
  font-size: 11px;
}

.preview-card {
  border: 1px solid var(--cm-line);
  border-radius: var(--cm-radius);
  background: #fff;
  padding: 13px;
}

.preview-card + .preview-card {
  margin-top: 10px;
}

.preview-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.preview-head h2 {
  margin: 0;
  color: var(--cm-ink);
  font-size: 16px;
  line-height: 1.35;
}

.preview-head span,
.preview-card p {
  margin: 4px 0 0;
  color: var(--cm-text);
  font-size: 13px;
}

.form-select {
  width: 100%;
  min-height: 24px;
  border: 0;
  background: transparent;
  color: var(--cm-ink);
  font: inherit;
  outline: none;
}
</style>

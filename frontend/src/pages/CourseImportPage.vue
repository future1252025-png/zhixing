<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { isAxiosError } from 'axios'
import { showFailToast, showSuccessToast } from 'vant'
import { useRouter } from 'vue-router'

import { getBuildings, type Building } from '@/api/buildings'
import { createCourse, previewCourseImport } from '@/api/courses'
import type { CourseImportPreviewItem } from '@/types/course'
import { validateCourseForm } from '@/utils/course'

const router = useRouter()
const buildings = ref<Building[]>([])
const previewItems = ref<CourseImportPreviewItem[]>([])
const selectedFile = ref<File | null>(null)
const loading = ref(false)
const importing = ref(false)
const errorMessage = ref('')

const matchedCount = computed(
  () => previewItems.value.filter((item) => item.building_id).length
)
const needsReviewCount = computed(
  () => previewItems.value.filter((item) => !item.building_id).length
)

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
      <section class="hero-panel import-hero">
        <span class="hero-eyebrow">HTML / Excel</span>
        <h1 class="hero-title">从课表文件导入</h1>
        <p class="hero-copy">
          支持学校课表导出的 HTML 和 .xlsx 文件。导入前会先生成预览，未匹配的上课建筑需要手动确认。
        </p>
      </section>

      <section class="surface-panel import-panel">
        <label class="file-picker">
          <input
            type="file"
            accept=".html,.htm,.xlsx,text/html,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            @change="handleFileChange"
          />
          <span>{{ selectedFile?.name ?? '选择 HTML 或 Excel 课表文件' }}</span>
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
                  v-for="building in buildings"
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
.import-hero,
.import-panel,
.preview-list {
  margin-bottom: 14px;
}

.import-panel {
  display: grid;
  gap: 12px;
  padding: 14px;
}

.file-picker {
  display: grid;
  min-height: 44px;
  place-items: center;
  border: 1px dashed var(--cm-primary);
  border-radius: var(--cm-radius);
  background: var(--cm-primary-soft);
  color: var(--cm-primary-dark);
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  padding: 10px;
  text-align: center;
}

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
  gap: 8px;
  margin-bottom: 14px;
}

.preview-summary span {
  border-radius: var(--cm-radius);
  background: #fff;
  box-shadow: 0 8px 18px rgb(16 24 40 / 6%);
  color: var(--cm-text);
  font-size: 12px;
  font-weight: 700;
  padding: 10px 8px;
  text-align: center;
}

.preview-card {
  border: 1px solid var(--cm-line);
  border-radius: var(--cm-radius);
  background: #fff;
  box-shadow: 0 8px 20px rgb(16 24 40 / 6%);
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

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { isAxiosError } from 'axios'
import { showFailToast, showSuccessToast, showToast } from 'vant'
import { useRoute, useRouter } from 'vue-router'

import { getBuildings, type Building } from '@/api/buildings'
import { createCourse, getCourses, updateCourse } from '@/api/courses'
import type { Course } from '@/types/course'
import {
  WEEKDAYS,
  buildEmptyCourseForm,
  courseToForm,
  findCourseTimeOverlap,
  formToPayload,
  validateCourseForm
} from '@/utils/course'

const route = useRoute()
const router = useRouter()
const form = reactive(buildEmptyCourseForm())
const buildings = ref<Building[]>([])
const courses = ref<Course[]>([])
const loading = ref(true)
const submitting = ref(false)
const errorMessage = ref('')

const courseId = computed(() => {
  const id = Number(route.params.id)
  return Number.isFinite(id) ? id : null
})
const isEdit = computed(() => courseId.value !== null)
const pageTitle = computed(() => (isEdit.value ? '编辑课程' : '新增课程'))

function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') {
      return detail
    }
  }
  return '课程保存失败，请稍后重试'
}

async function loadFormData() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [buildingResult, courseResult] = await Promise.all([
      getBuildings(),
      getCourses()
    ])
    buildings.value = buildingResult
    courses.value = courseResult

    if (isEdit.value && courseId.value !== null) {
      const course = courseResult.find((item) => item.id === courseId.value)
      if (!course) {
        errorMessage.value = '未找到这门课程'
        return
      }
      Object.assign(form, courseToForm(course))
    }
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    loading.value = false
  }
}

async function submitCourse() {
  const validationError = validateCourseForm(form)
  if (validationError) {
    showFailToast(validationError)
    return
  }

  const overlap = findCourseTimeOverlap(
    form,
    courses.value,
    isEdit.value ? courseId.value ?? undefined : undefined
  )
  if (overlap) {
    showToast(`与「${overlap.course_name}」时间重叠，已继续保存`)
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
    showFailToast(getErrorMessage(error))
  } finally {
    submitting.value = false
  }
}

onMounted(loadFormData)
</script>

<template>
  <section class="page">
    <van-nav-bar :title="pageTitle" left-arrow @click-left="router.push('/courses')" />
    <div class="page-content">
      <p v-if="loading" class="muted-text">正在加载课程表单...</p>
      <van-empty v-else-if="errorMessage" image="error" :description="errorMessage">
        <div class="page-actions">
          <van-button type="primary" size="small" @click="loadFormData">重试</van-button>
          <van-button plain size="small" @click="router.push('/courses')">
            返回课程表
          </van-button>
        </div>
      </van-empty>
      <van-form v-else class="course-form" @submit="submitCourse">
        <van-cell-group inset>
          <van-field
            v-model="form.course_name"
            required
            label="课程名称"
            maxlength="100"
            placeholder="请输入课程名称"
          />
          <van-field required label="星期">
            <template #input>
              <select v-model.number="form.weekday" class="form-select">
                <option
                  v-for="weekday in WEEKDAYS"
                  :key="weekday.value"
                  :value="weekday.value"
                >
                  {{ weekday.label }}
                </option>
              </select>
            </template>
          </van-field>
          <van-field
            v-model="form.start_time"
            required
            type="time"
            label="上课时间"
          />
          <van-field
            v-model="form.end_time"
            required
            type="time"
            label="下课时间"
          />
          <van-field required label="上课建筑">
            <template #input>
              <select v-model.number="form.building_id" class="form-select">
                <option :value="0">请选择建筑</option>
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
            v-model="form.room_name"
            required
            label="教室"
            maxlength="64"
            placeholder="例如 A101"
          />
          <van-field
            v-model="form.teacher"
            label="教师"
            maxlength="64"
            placeholder="选填"
          />
          <van-field
            v-model="form.weeks"
            label="周次"
            maxlength="64"
            placeholder="例如 1-16"
          />
        </van-cell-group>

        <div class="page-actions">
          <van-button type="primary" block native-type="submit" :loading="submitting">
            保存课程
          </van-button>
          <van-button block plain native-type="button" @click="router.push('/courses')">
            取消
          </van-button>
        </div>
      </van-form>
    </div>
  </section>
</template>

<style scoped>
.muted-text {
  margin: 12px 0;
  color: #6b7280;
  font-size: 14px;
}

.course-form {
  display: grid;
  gap: 14px;
}

.form-select {
  width: 100%;
  min-height: 24px;
  border: 0;
  background: transparent;
  color: #1f2937;
  font: inherit;
  outline: none;
}
</style>

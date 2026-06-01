<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { isAxiosError } from 'axios'
import { showConfirmDialog, showFailToast, showSuccessToast } from 'vant'
import { useRouter } from 'vue-router'

import { deleteCourse, getCourses } from '@/api/courses'
import type { Course } from '@/types/course'
import { getWeekdayLabel, groupCoursesByWeekday } from '@/utils/course'

const router = useRouter()
const courses = ref<Course[]>([])
const loading = ref(true)
const deletingId = ref<number | null>(null)
const errorMessage = ref('')

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

function openCreatePage() {
  router.push('/courses/new')
}

function openEditPage(courseId: number) {
  router.push(`/courses/${courseId}/edit`)
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

onMounted(loadCourses)
</script>

<template>
  <section class="page">
    <van-nav-bar title="课程表" />
    <div class="page-content">
      <div class="hero-panel course-hero">
        <div>
          <span class="hero-eyebrow">课程驱动出发建议</span>
          <h1 class="hero-title">我的课程</h1>
          <p class="hero-copy">按星期查看课程安排，出发建议会自动寻找未来最近一节课。</p>
        </div>
        <van-button type="primary" size="small" icon="plus" @click="openCreatePage">
          新增课程
        </van-button>
      </div>

      <p v-if="loading" class="muted-text">正在加载课程...</p>
      <van-empty v-else-if="errorMessage" image="error" :description="errorMessage">
        <van-button type="primary" size="small" @click="loadCourses">重试</van-button>
      </van-empty>
      <van-empty v-else-if="courses.length === 0" description="暂无课程">
        <van-button type="primary" size="small" @click="openCreatePage">
          添加第一门课程
        </van-button>
      </van-empty>
      <template v-else>
        <section
          v-for="group in groupCoursesByWeekday(courses)"
          :key="group.weekday"
          class="weekday-section"
        >
          <h2>{{ group.label }}</h2>
          <article v-for="course in group.courses" :key="course.id" class="course-card">
            <div class="course-main">
              <span class="time-chip">{{ course.start_time }}-{{ course.end_time }}</span>
              <h3>{{ course.course_name }}</h3>
              <p>
                {{ course.building.name }} · {{ course.room_name }}
              </p>
              <p v-if="course.teacher">教师：{{ course.teacher }}</p>
              <p v-if="course.weeks">周次：{{ course.weeks }}</p>
            </div>
            <div class="course-actions">
              <span class="weekday-chip">{{ getWeekdayLabel(course.weekday) }}</span>
              <button type="button" class="text-button" @click="openEditPage(course.id)">
                编辑
              </button>
              <button
                type="button"
                class="text-button danger"
                :disabled="deletingId === course.id"
                @click="confirmDelete(course)"
              >
                删除
              </button>
            </div>
          </article>
        </section>
      </template>
    </div>
  </section>
</template>

<style scoped>
.page-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.course-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.page-toolbar h1 {
  margin: 0;
  font-size: 22px;
  line-height: 1.25;
}

.page-toolbar p,
.muted-text {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 14px;
}

.weekday-section + .weekday-section {
  margin-top: 18px;
}

.weekday-section h2 {
  margin: 0 0 10px;
  color: var(--cm-ink);
  font-size: 16px;
}

.course-card {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  border: 1px solid var(--cm-line);
  border-radius: var(--cm-radius);
  background: #ffffff;
  box-shadow: 0 8px 20px rgb(16 24 40 / 6%);
  padding: 13px;
}

.course-card + .course-card {
  margin-top: 10px;
}

.course-main {
  min-width: 0;
}

.course-main h3 {
  margin: 8px 0 6px;
  color: var(--cm-ink);
  font-size: 17px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.course-main p {
  margin: 4px 0 0;
  color: var(--cm-text);
  font-size: 13px;
  line-height: 1.5;
}

.course-actions {
  display: grid;
  align-content: start;
  justify-items: end;
  gap: 8px;
}

.time-chip,
.weekday-chip {
  display: inline-flex;
  width: fit-content;
  border-radius: 999px;
  background: var(--cm-primary-soft);
  color: var(--cm-primary-dark);
  padding: 3px 8px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
}

.weekday-chip {
  background: var(--cm-green-soft);
  color: var(--cm-green);
}

.text-button {
  border: 0;
  background: transparent;
  color: var(--cm-primary);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  padding: 0;
}

.text-button:disabled {
  color: #98a2b3;
  cursor: not-allowed;
}

.danger {
  color: var(--cm-red);
}
</style>

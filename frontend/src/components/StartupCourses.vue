<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { App } from '@capacitor/app'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useCampusClock } from '@/composables/useCampusClock'
import { semesterAt } from '@/utils/campusTime'
import { filterCoursesByWeek, findNextCourse, formatCourseLocation } from '@/utils/course'

const auth = useAuthStore()
const router = useRouter()
let listener: PluginListenerHandle | undefined
let disposed = false
function reconnect() {
  if (!auth.restoring && auth.preview && document.visibilityState === 'visible') void retry()
}
onMounted(() => {
  if (auth.preview) requestAnimationFrame(() => performance.mark('campusmind:course-visible'))
  window.addEventListener('online', reconnect)
  document.addEventListener('visibilitychange', reconnect)
  if (Capacitor.isNativePlatform()) void App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) reconnect()
  }).then(handle => { if (disposed) void handle.remove(); else listener = handle }).catch(() => {})
})
onUnmounted(() => {
  disposed = true
  window.removeEventListener('online', reconnect)
  document.removeEventListener('visibilitychange', reconnect)
  void listener?.remove()
})
const now = useCampusClock()
const semester = computed(() => semesterAt(auth.preview?.semester ?? null, now.value))
const next = computed(() => auth.preview && semester.value.current_week !== null
  ? findNextCourse(filterCoursesByWeek(auth.preview.courses, semester.value.current_week, semester.value), now.value) : null)
const savedAt = computed(() => auth.preview ? new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
}).format(new Date(auth.preview.savedAt)) : '')
async function retry() {
  if (await auth.restoreSession()) await router.replace('/home')
}
function login() { auth.clearSession(); void router.replace('/login') }
</script>

<template>
  <main class="page startup-courses" aria-live="polite">
    <div class="page-content">
      <header><strong>智行</strong><span>让校园日常简单一点</span></header>
      <section v-if="auth.preview" class="fresh-card startup-course-card" data-testid="startup-course-card">
        <small>接下来的课程<span v-if="semester.current_week"> · 第 {{ semester.current_week }} 周</span></small>
        <template v-if="next">
          <h1>{{ next.course_name }}</h1>
          <p>{{ next.start_time }}–{{ next.end_time }}</p>
          <p>{{ formatCourseLocation(next) }}</p>
        </template>
        <h1 v-else>{{ semester.status === 'active' ? '本周没有尚未开始的课程' : semester.status === 'unconfigured' ? '尚未设置学期' : semester.status === 'before_term' ? '新学期还未开始' : '本学期已结束' }}</h1>
        <small>上次同步 {{ savedAt }}</small>
      </section>
      <p role="status">{{ auth.restoring ? (auth.preview ? '正在同步最新课表…' : '正在恢复登录…') : '暂时无法连接，当前显示已保存的课表。' }}</p>
      <div v-if="!auth.restoring" class="startup-actions">
        <van-button type="primary" @click="retry">重新同步</van-button>
        <van-button plain @click="login">前往登录</van-button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.startup-courses { min-height: 100dvh; background: #f4f6ef; }
header { display: flex; align-items: baseline; gap: 16px; padding: 24px 0; }
header strong { font-size: 28px; color: #315b3b; }
header span, small { color: #5f6f62; }
.startup-course-card { padding: 28px 24px; background: #edf3e4; }
h1 { font-size: clamp(24px, 6vw, 36px); line-height: 1.4; margin: 18px 0; }
p { line-height: 1.7; }
.startup-actions { display: flex; gap: 12px; }
</style>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { App } from '@capacitor/app'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useAuthStore } from '@/stores/auth'
import { useRemindersStore } from '@/stores/reminders'
import { useCoursesStore } from '@/stores/courses'
import { useSemesterStore } from '@/stores/semester'
import { buildReminderOccurrences, buildDeviceReminderOccurrences } from '@/utils/reminders'
import { campusTime } from '@/utils/campusTime'
import { useCampusClock } from '@/composables/useCampusClock'
import { listenNativeReminderClicks, syncDeviceReminders, tickWebReminders } from '@/services/reminderNotifications'

const auth = useAuthStore()
const reminders = useRemindersStore()
const courses = useCoursesStore()
const semester = useSemesterStore()
const router = useRouter()
const now = useCampusClock()
const today = computed(() => campusTime(now.value).date)
const occurrences = computed(() => (Capacitor.getPlatform() === 'android' ? buildDeviceReminderOccurrences : buildReminderOccurrences)(reminders.plan,
  courses.loaded ? courses.courses : [], semester.semester, today.value))
let timer: ReturnType<typeof setInterval> | undefined
let nativeState: PluginListenerHandle | null = null
let nativeClick: PluginListenerHandle | null = null
let disposed = false
let syncRevision = 0
let refreshing = false

async function refresh(force = false) {
  const userId = auth.currentUser?.id
  if (!userId || refreshing || reminders.saving) return
  refreshing = true
  try {
    // A failed background refresh must not erase previously scheduled, offline course alarms.
    await Promise.allSettled([reminders.load(userId, force), courses.ensureLoaded(force), semester.load(userId, force)])
    await sync()
  } finally {
    refreshing = false
    if (auth.currentUser?.id && auth.currentUser.id !== userId) void refresh()
  }
}
async function sync(rearm = false) {
  const userId = auth.currentUser?.id
  if (!userId || reminders.userId !== userId || !reminders.loaded) return
  const revision = ++syncRevision
  reminders.scheduling = true
  try {
    const preserveCourses = reminders.plan.course_settings.enabled && (!courses.loaded || !semester.semester)
    const result = await syncDeviceReminders(userId, occurrences.value, reminders.deviceEnabled, preserveCourses, rearm)
    if (!result || revision !== syncRevision || auth.currentUser?.id !== userId) return
    reminders.capability = result.capability
    reminders.scheduledCount = result.count
    reminders.coverageUntil = result.until
    reminders.truncated = result.truncated
    reminders.scheduleError = preserveCourses ? '课表尚未同步，保留本机已安排的课程通知；联网同步后更新。' : ''
  } catch {
    if (revision === syncRevision) reminders.scheduleError = '提醒已保存，但本机通知安排失败，请检查权限后重试。'
  } finally { if (revision === syncRevision) reminders.scheduling = false }
}
watch(() => auth.currentUser?.id, (userId, previous) => {
  syncRevision++
  if (previous !== userId) { courses.attachUser(userId ?? null); reminders.reset(userId ?? null) }
  if (userId) void refresh()
}, { immediate: true })
watch([occurrences, () => reminders.deviceEnabled, () => reminders.loaded], () => void sync(), { deep: true })
watch(() => courses.loaded, (loaded) => {
  if (!loaded && auth.currentUser && reminders.plan.course_settings.enabled) void courses.ensureLoaded().catch(() => {})
})
function resume() {
  if (document.visibilityState === 'visible') {
    // Permission changes and cached daily reminders must not wait for the network.
    void sync(true)
    void refresh(true)
  }
}
function openReminders() { if (auth.currentUser) void router.push('/reminders') }
function notice(event: Event) {
  if (auth.currentUser && document.visibilityState === 'visible') showToast({ message: `${(event as CustomEvent).detail.title}\n${(event as CustomEvent).detail.body}`, duration: 6000 })
}
onMounted(() => {
  timer = setInterval(() => void tickWebReminders(), 1000)
  document.addEventListener('visibilitychange', resume)
  window.addEventListener('campusmind:reminder', notice)
  window.addEventListener('campusmind:open-reminders', openReminders)
  window.addEventListener('campusmind:sync-reminders', resume)
  if (Capacitor.isNativePlatform()) {
    void App.addListener('appStateChange', ({ isActive }) => { if (isActive) resume() }).then((handle) => {
      if (disposed) void handle.remove(); else nativeState = handle
    }).catch(() => {})
    void listenNativeReminderClicks((userId) => { if (auth.currentUser?.id === userId) openReminders() }).then((handle) => {
      if (disposed) void handle?.remove(); else nativeClick = handle
    }).catch(() => {})
  }
})
onUnmounted(() => {
  disposed = true
  clearInterval(timer)
  document.removeEventListener('visibilitychange', resume)
  window.removeEventListener('campusmind:reminder', notice)
  window.removeEventListener('campusmind:open-reminders', openReminders)
  window.removeEventListener('campusmind:sync-reminders', resume)
  void nativeState?.remove()
  void nativeClick?.remove()
})
</script>
<template><span hidden aria-hidden="true"></span></template>

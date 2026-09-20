<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useCampusClock } from '@/composables/useCampusClock'
import { semesterAt } from '@/utils/campusTime'
import { showSuccessToast } from 'vant'
import { extractBusinessError } from '@/api/errors'
import { useAuthStore } from '@/stores/auth'
import { useSemesterStore } from '@/stores/semester'
import type { SemesterUpdate } from '@/types/semester'
import SemesterSettingsCard from './SemesterSettingsCard.vue'

const auth = useAuthStore()
const semester = useSemesterStore()
if (auth.currentUser) semester.attachUser(auth.currentUser.id)
const now = useCampusClock()
const currentSemester = computed(() => semesterAt(semester.semester, now.value))
const error = ref('')
async function load(force = false) {
  const userId = auth.currentUser?.id
  if (!userId) return
  error.value = ''
  try { await semester.load(userId, force) }
  catch (cause) { error.value = extractBusinessError(cause).message }
}
async function save(payload: SemesterUpdate) {
  error.value = ''
  try {
    await semester.save(payload)
    showSuccessToast('学期设置已保存')
    window.dispatchEvent(new Event('campusmind:sync-reminders'))
  } catch (cause) { error.value = extractBusinessError(cause).message }
}
onMounted(() => { void load() })
</script>

<template>
  <div class="semester-settings-panel">
    <p v-if="semester.loading && !semester.semester" role="status">正在读取学期…</p>
    <p v-if="error || semester.errorMessage" class="semester-panel-error" role="alert">{{ error || semester.errorMessage }} <button type="button" @click="load(true)">重试</button></p>
    <SemesterSettingsCard v-if="semester.semester" :semester="semester.semester" :current-semester="currentSemester" :saving="semester.saving" @save="save" />
  </div>
</template>

<style scoped>
.semester-settings-panel { min-width: 0; }
.semester-settings-panel > p { font-size: 13px; line-height: 1.7; }
.semester-panel-error { color: #9a4d3b; }
.semester-panel-error button { min-height: 44px; padding: 8px 16px; border: 1px solid #d9e0d3; border-radius: 12px; background: #fffef8; color: #496a50; font: inherit; cursor: pointer; }
</style>

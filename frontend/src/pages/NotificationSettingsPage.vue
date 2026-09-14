<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showFailToast, showSuccessToast } from 'vant'
import TechIcon from '@/components/TechIcon.vue'
import { useReminderDevice } from '@/composables/useReminderDevice'
import { useAuthStore } from '@/stores/auth'
import { useRemindersStore } from '@/stores/reminders'
import { openExactReminderSettings, testReminderNotification } from '@/services/reminderNotifications'
import { formatReminderAt } from '@/utils/reminders'
import { goBack } from '@/utils/navigation'

const router = useRouter()
const auth = useAuthStore()
const store = useRemindersStore()
const { capabilityReady, permissionBusy, permissionError, enableDevice, checkCapability } = useReminderDevice()
const permissionLabel = computed(() => {
  if (!capabilityReady.value) return '正在检查通知权限'
  if (store.capability.permission === 'unsupported') return '当前浏览器不支持通知'
  if (store.capability.permission !== 'granted') return '通知权限尚未允许'
  if (!store.deviceEnabled) return '本机通知已暂停'
  if (store.scheduleError) return '本机通知需要检查'
  if (store.scheduling) return '正在安排本机通知'
  if (store.capability.platform === 'web') return '网页通知已开启'
  return store.capability.exact ? '本机提醒已开启' : '已开启 · 时间可能延迟'
})
async function refresh() {
  const userId = auth.currentUser?.id
  if (!userId) return
  await Promise.allSettled([store.load(userId, true), checkCapability()])
  window.dispatchEvent(new Event('campusmind:sync-reminders'))
}
async function testNotification() {
  try { await testReminderNotification(); showSuccessToast(store.capability.platform === 'android' ? '5 秒后发送测试提醒' : '已发送测试提醒') }
  catch (error) { showFailToast(error instanceof Error ? error.message : '测试提醒失败') }
}
async function exactSettings() {
  try { await openExactReminderSettings() } catch { showFailToast('请到系统设置 → 智行 → 闹钟和提醒中开启') }
}
onMounted(() => { if (auth.currentUser) void store.load(auth.currentUser.id) })
</script>

<template>
  <section class="page notification-settings-page">
    <van-nav-bar title="通知设置" left-arrow @click-left="goBack(router, '/profile')" />
    <main class="page-content notification-settings-content">
      <section class="device-notice" aria-label="本机提醒状态">
        <header><TechIcon name="bell" :size="20" /><h1>{{ permissionLabel }}</h1></header>
        <p v-if="store.capability.platform === 'web'">请保持网页打开，关闭后无法提醒。</p>
        <p v-else-if="capabilityReady && store.capability.permission === 'granted' && !store.capability.exact">开启准时提醒，减少通知延迟。</p>
        <p v-if="store.scheduleError" class="reminder-error" role="alert">{{ store.scheduleError }}</p>
        <p v-if="permissionError" class="reminder-error" role="alert">{{ permissionError }}</p>
        <small v-if="store.deviceEnabled && store.capability.permission === 'granted'">{{ store.capability.platform === 'android' ? '本机已安排' : '网页待提醒' }} {{ store.scheduledCount }} 条<span v-if="store.coverageUntil"> · 最晚 {{ formatReminderAt(store.coverageUntil) }}</span></small>
        <p v-if="store.truncated" class="reminder-error" role="alert">仅安排了最近 400 条，请在覆盖时间结束前打开 App，继续安排后续提醒。</p>
        <div class="device-actions">
          <button v-if="!store.deviceEnabled || store.capability.permission !== 'granted'" type="button" :disabled="permissionBusy || !capabilityReady || store.capability.permission === 'unsupported'" @click="enableDevice">{{ permissionBusy ? '正在等待授权…' : '开启本机通知' }}</button>
          <button v-else type="button" @click="store.setDeviceEnabled(false)">暂停本机通知</button>
          <button v-if="store.capability.platform === 'android' && store.capability.permission === 'granted' && !store.capability.exact" type="button" @click="exactSettings">设置准时提醒</button>
          <button type="button" :disabled="!store.deviceEnabled || store.capability.permission !== 'granted'" @click="testNotification">发送测试提醒</button>
          <button type="button" :disabled="store.loading || store.saving" @click="refresh">重新同步</button>
        </div>
        <details class="reminder-help">
          <summary>提醒说明<TechIcon name="chevron-down" :size="16" /></summary>
          <div class="reminder-help-content">
            <h2>课程只看今天</h2>
            <p>按北京时间、实际周次和课表中保存的时间提醒，切换课表周次不会影响。自定义事项按设置的日期和重复规则提醒。</p>
            <template v-if="store.capability.platform === 'android'">
              <h2>没收到通知？</h2>
              <p>每天打开一次 App，安排当天课程；保持打开跨天时会自动切换。关闭或被系统冻结后，新一天需重新打开。</p>
              <p>请允许通知和“闹钟和提醒”，并检查勿扰、省电设置。强行停止 App 后需重新打开。已安排的通知无需平板持续在线。</p>
              <p>声音和震动可在 Android 8 及以上分别设置；旧系统使用默认通知方式。</p>
            </template>
            <template v-else>
              <h2>网页提醒的限制</h2>
              <p>浏览器休眠或系统限制可能导致漏提醒，重要事项建议使用安卓 App。</p>
            </template>
            <h2>换设备后</h2>
            <p>提醒随账号同步，通知需在每台设备单独开启。其他设备修改后，联网打开本机 App 或网页即可更新。</p>
          </div>
        </details>
      </section>
      <p v-if="store.error" class="reminder-error" role="alert">{{ store.error }}</p>
    </main>
  </section>
</template>

<style scoped>
.notification-settings-page { --page-max: 920px; }
.notification-settings-content { max-width: 860px; margin: auto; }
.device-notice { padding: 20px; border: 1px solid #d3dfcf; background: #edf3e8; border-radius: 24px; }
.device-notice header { display: flex; align-items: center; gap: 9px; color: #4b6248; }
h1 { margin: 0; font-size: 18px; }
p { font-size: 13px; color: #636b5f; line-height: 1.8; margin: 10px 0; }
small { display: block; color: #636b5f; line-height: 1.7; font-size: 12px; }
.device-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.device-actions button { border: 1px solid #d9e0d3; border-radius: 12px; background: #fffef8; min-height: 44px; padding: 8px 12px; color: #3d5441; font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; }
button:disabled { opacity: .48; cursor: not-allowed; }
button:focus-visible, summary:focus-visible { outline: 2px solid #4f7558; outline-offset: 3px; }
.reminder-help { border-top: 1px solid #d9e0d3; }
summary { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 44px; color: #4b6248; font-size: 13px; font-weight: 650; list-style: none; cursor: pointer; }
summary::-webkit-details-marker { display: none; }
.reminder-help[open] summary :deep(svg) { transform: rotate(180deg); }
.reminder-help-content h2 { margin: 12px 0 4px; font-size: 14px; color: #4b6248; }
.reminder-help-content p { margin: 4px 0 10px; }
.reminder-error { color: #9a4d3b; }
</style>

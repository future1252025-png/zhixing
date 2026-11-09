<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showFailToast, showSuccessToast } from 'vant'
import TechIcon from '@/components/TechIcon.vue'
import { useReminderDevice } from '@/composables/useReminderDevice'
import { useAuthStore } from '@/stores/auth'
import { useRemindersStore } from '@/stores/reminders'
import { openExactReminderSettings, testReminderNotification } from '@/services/reminderNotifications'
import { formatReminderAt } from '@/utils/reminders'
import { goBack } from '@/utils/navigation'
import { openReminderBackgroundSettings, reminderBackgroundStatus, type ReminderBackgroundStatus } from '@/native/reminderSettings'

const router = useRouter()
const auth = useAuthStore()
const store = useRemindersStore()
const background = ref<ReminderBackgroundStatus | null>(null)
const backgroundError = ref('')
let disposed = false
async function checkBackground() {
  try { const result = await reminderBackgroundStatus(); if (!disposed) { background.value = result; backgroundError.value = '' } }
  catch { if (!disposed) backgroundError.value = '暂时无法读取后台设置，可手动到系统中检查。' }
}
function onResume() { if (document.visibilityState === 'visible') void checkBackground() }
async function backgroundSettings(target: 'battery' | 'app') {
  try { await openReminderBackgroundSettings(target) } catch { showFailToast('请在系统设置中打开智行的应用信息') }
}
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
async function testNotification(backgroundTest = false) {
  try { await testReminderNotification(backgroundTest ? 60 : 5); showSuccessToast(store.capability.platform === 'android'
    ? backgroundTest ? '已安排 1 分钟后提醒，现在可划掉后台测试' : '5 秒后发送测试提醒' : '已发送测试提醒') }
  catch (error) { showFailToast(error instanceof Error ? error.message : '测试提醒失败') }
}
async function exactSettings() {
  try { await openExactReminderSettings() } catch { showFailToast('请到系统设置 → 智行 → 闹钟和提醒中开启') }
}
onMounted(() => {
  if (auth.currentUser) void store.load(auth.currentUser.id)
  void checkBackground()
  document.addEventListener('visibilitychange', onResume)
  window.addEventListener('focus', onResume)
})
onUnmounted(() => { disposed = true; document.removeEventListener('visibilitychange', onResume); window.removeEventListener('focus', onResume) })
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
          <button type="button" :disabled="!store.deviceEnabled || store.capability.permission !== 'granted'" @click="testNotification(false)">发送测试提醒</button>
          <button v-if="store.capability.platform === 'android'" type="button" :disabled="!store.deviceEnabled || store.capability.permission !== 'granted'" @click="testNotification(true)">退出后台测试 · 1 分钟</button>
          <button type="button" :disabled="store.loading || store.saving" @click="refresh">重新同步</button>
        </div>
        <details class="reminder-help">
          <summary>提醒说明<TechIcon name="chevron-down" :size="16" /></summary>
          <div class="reminder-help-content">
            <h2>课程只看今天</h2>
            <p>按北京时间、实际周次和课表中保存的时间提醒，切换课表周次不会影响。自定义事项按设置的日期和重复规则提醒。</p>
            <template v-if="store.capability.platform === 'android'">
              <h2>没收到通知？</h2>
              <p>课程列表只显示今天；App 会预先安排未来 30 天的课程通知（最多 400 条），划掉最近任务不依赖网页继续计时。再次打开会更新并修复通知登记。</p>
              <p>课表修改后请联网打开本机 App 同步；超过 30 天未打开、通知数量达到上限或被系统强行停止，需重新打开才能继续安排。</p>
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
      <section v-if="store.capability.platform === 'android'" class="device-notice background-notice" aria-label="后台提醒检查">
        <header><TechIcon name="bell" :size="20" /><h2>退出后也能提醒</h2></header>
        <p v-if="background?.backgroundRestricted" class="reminder-error">系统已限制智行后台运行，请先允许后台活动。</p>
        <p v-else>提醒交给手机系统，无需让页面一直打开。</p>
        <p v-if="background?.batteryOptimized">若划掉后台后仍收不到，请将智行的省电策略设为“不限制”，并在系统提供该选项时允许自启动。</p>
        <p v-if="backgroundError">{{ backgroundError }}</p>
        <div class="device-actions"><button type="button" @click="backgroundSettings('app')">打开应用设置</button><button type="button" @click="backgroundSettings('battery')">检查省电设置</button></div>
        <small>系统“强行停止”会取消提醒，重新打开后恢复。勿扰模式仍可能关闭声音或震动。</small>
      </section>
      <p v-if="store.error" class="reminder-error" role="alert">{{ store.error }}</p>
    </main>
  </section>
</template>

<style scoped>
.notification-settings-page { --page-max: 920px; }
.notification-settings-content { max-width: 860px; margin: auto; }
.background-notice { margin-top: 20px; }
.background-notice h2 { margin: 0; font-size: 18px; }
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

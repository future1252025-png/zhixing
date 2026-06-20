<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { isAxiosError } from 'axios'
import { showFailToast, showSuccessToast } from 'vant'
import { useRoute, useRouter } from 'vue-router'
import { getBuildingDetail, type Building } from '@/api/buildings'
import { createBuildingMessage, getBuildingMessages, validateMessageContent, type BuildingMessage, type MessageLocationSource } from '@/api/messages'

const route = useRoute()
const router = useRouter()
const building = ref<Building | null>(null)
const messages = ref<BuildingMessage[]>([])
const draft = ref('')
const loading = ref(true)
const sending = ref(false)
const locating = ref(false)
const errorMessage = ref('')
const messageListRef = ref<HTMLElement | null>(null)
const buildingId = computed(() => Number(route.params.id))
const remainingCount = computed(() => Math.max(0, 200 - draft.value.length))
const currentLocation = ref<{ latitude: number; longitude: number; location_source: MessageLocationSource; label: string } | null>(null)
const locationText = computed(() => currentLocation.value ? `${currentLocation.value.location_source === 'browser' ? '浏览器定位' : '建筑位置'} · ${currentLocation.value.label}` : '发布前需要确认位置')

function getErrorMessage(error: unknown): string {
  if (isAxiosError(error) && typeof error.response?.data?.detail === 'string') return error.response.data.detail
  return '留言请求失败，请稍后重试'
}
function formatTime(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }
function formatDistance(value: number | null): string { if (value === null) return ''; return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${Math.round(value)} m` }
async function scrollToBottom() { await nextTick(); if (messageListRef.value) messageListRef.value.scrollTop = messageListRef.value.scrollHeight }
async function loadMessages() { if (!Number.isFinite(buildingId.value)) return; try { messages.value = await getBuildingMessages(buildingId.value); await scrollToBottom() } catch (error) { errorMessage.value = getErrorMessage(error) } }
async function loadPage() {
  if (!Number.isFinite(buildingId.value)) { errorMessage.value = '建筑编号无效'; loading.value = false; return }
  loading.value = true; errorMessage.value = ''
  try { const [nextBuilding, nextMessages] = await Promise.all([getBuildingDetail(buildingId.value), getBuildingMessages(buildingId.value)]); building.value = nextBuilding; messages.value = nextMessages; await scrollToBottom() }
  catch (error) { errorMessage.value = getErrorMessage(error) } finally { loading.value = false }
}
function useBuildingLocation() {
  if (!building.value) return showFailToast('建筑信息尚未加载')
  currentLocation.value = { latitude: building.value.latitude, longitude: building.value.longitude, location_source: 'manual', label: building.value.name }
  showSuccessToast('已使用当前建筑位置')
}
function requestBrowserLocation() {
  if (!navigator.geolocation) return showFailToast('当前浏览器不支持定位，请使用建筑位置')
  locating.value = true
  navigator.geolocation.getCurrentPosition(
    (position) => { currentLocation.value = { latitude: position.coords.latitude, longitude: position.coords.longitude, location_source: 'browser', label: '当前位置' }; locating.value = false; showSuccessToast('定位成功') },
    () => { locating.value = false; showFailToast('定位失败，请改用建筑位置') },
    { enableHighAccuracy: true, maximumAge: 60_000, timeout: 8_000 }
  )
}
async function submitMessage() {
  const validationError = validateMessageContent(draft.value)
  if (validationError) return showFailToast(validationError)
  if (!currentLocation.value) return showFailToast('请先定位或使用当前建筑位置')
  sending.value = true
  try {
    await createBuildingMessage(buildingId.value, { content: draft.value, latitude: currentLocation.value.latitude, longitude: currentLocation.value.longitude, location_source: currentLocation.value.location_source })
    draft.value = ''; showSuccessToast('留言已发送'); await loadMessages()
  } catch (error) { showFailToast(getErrorMessage(error)) } finally { sending.value = false }
}
onMounted(loadPage)
</script>

<template>
  <section class="page message-page">
    <van-nav-bar :title="building?.name || '建筑留言'" left-arrow @click-left="router.push(`/buildings/${buildingId}`)" />
    <div class="message-content">
      <header class="message-heading"><div><strong>匿名留言区</strong><span>HTTP 留言 · 按时间顺序</span></div><span>{{ messages.length }} 条</span></header>
      <section class="location-strip"><div><van-icon name="location-o" /><span>{{ locationText }}</span></div><div><button type="button" :disabled="locating" @click="requestBrowserLocation">{{ locating ? '定位中' : '定位' }}</button><button type="button" @click="useBuildingLocation">使用建筑位置</button></div></section>
      <p v-if="loading" class="muted-text">正在加载留言...</p>
      <van-empty v-else-if="errorMessage" image="error" :description="errorMessage"><van-button type="primary" size="small" @click="loadPage">重试</van-button></van-empty>
      <van-empty v-else-if="messages.length === 0" description="还没有留言，发出第一条吧" />
      <div v-else ref="messageListRef" class="message-list">
        <article v-for="message in messages" :key="message.id" class="message-row"><div class="message-meta"><span>{{ message.display_name || '匿名同学' }}</span><span v-if="message.distance_to_building_meters !== null">距建筑约 {{ formatDistance(message.distance_to_building_meters) }}</span><time>{{ formatTime(message.created_at) }}</time></div><p class="message-bubble">{{ message.content }}</p></article>
      </div>
    </div>
    <form class="message-composer" @submit.prevent="submitMessage"><van-field v-model="draft" type="textarea" rows="1" autosize maxlength="200" placeholder="写一条匿名留言" :border="false" /><div class="composer-actions"><span>{{ remainingCount }}/200</span><van-button type="primary" size="small" native-type="submit" :loading="sending">发送</van-button></div></form>
  </section>
</template>

<style scoped>
.message-page { min-height: 100vh; padding-bottom: 100px; }.message-content { width: min(100%,520px); margin: 0 auto; padding: 12px 14px 24px; }
.message-heading { display: flex; align-items: center; justify-content: space-between; padding: 4px 2px 12px; }.message-heading div { display: grid; gap: 3px; }.message-heading strong { font-size: 18px; }.message-heading span { color: var(--cm-muted); font-size: 11px; }.message-heading > span { color: var(--cm-primary); font-weight: 700; }
.location-strip { display: grid; gap: 9px; margin-bottom: 16px; border-top: 1px solid var(--cm-line); border-bottom: 1px solid var(--cm-line); background: #fff; padding: 11px 12px; }.location-strip > div { display: flex; align-items: center; gap: 7px; }.location-strip > div:first-child { color: var(--cm-text); font-size: 12px; }.location-strip .van-icon { color: var(--cm-primary); font-size: 16px; }.location-strip button { border: 1px solid var(--cm-line); border-radius: 5px; background: #fff; color: var(--cm-primary); cursor: pointer; font-size: 11px; padding: 5px 8px; }
.message-list { display: grid; gap: 15px; max-height: calc(100vh - 270px); overflow-y: auto; padding: 4px 2px 18px; }.message-row { display: grid; gap: 5px; }.message-meta { display: flex; flex-wrap: wrap; gap: 8px; color: var(--cm-muted); font-size: 10px; }.message-meta span:first-child { color: var(--cm-text); font-weight: 700; }.message-meta time { margin-left: auto; }.message-bubble { width: fit-content; max-width: 82%; margin: 0; border-radius: 4px 10px 10px 10px; background: #fff; box-shadow: 0 1px 3px rgba(24,43,37,.1); color: var(--cm-ink); font-size: 14px; line-height: 1.6; padding: 10px 12px; overflow-wrap: anywhere; }
.message-composer { position: fixed; right: 0; bottom: 0; left: 0; z-index: 110; width: min(100%,520px); margin: 0 auto; border-top: 1px solid var(--cm-line); background: rgba(255,255,255,.97); padding: 9px 12px calc(9px + env(safe-area-inset-bottom)); backdrop-filter: blur(10px); }.message-composer :deep(.van-field) { border: 1px solid var(--cm-line); border-radius: var(--cm-radius); background: #f8faf8; padding: 9px 11px; }.composer-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 7px; }.composer-actions span { color: var(--cm-muted); font-size: 10px; }
</style>

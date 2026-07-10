<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { isAxiosError } from 'axios'
import { showFailToast, showSuccessToast } from 'vant'
import { useRoute, useRouter } from 'vue-router'
import { getBuildingDetail, type Building } from '@/api/buildings'
import { createBuildingMessage, getBuildingMessages, validateMessageContent, type BuildingMessage, type MessageLocationSource } from '@/api/messages'
import { parseApiDateTime } from '@/utils/dateTime'
import { haversineDistanceMeters } from '@/utils/geo'
import { MESSAGE_PAGE_SIZE, hasMoreMessagePages, mergeOlderMessages } from '@/utils/messagePagination'

const MAX_MESSAGE_DISTANCE_METERS = 500

const route = useRoute()
const router = useRouter()
const building = ref<Building | null>(null)
const messages = ref<BuildingMessage[]>([])
const draft = ref('')
const loading = ref(true)
const sending = ref(false)
const locating = ref(false)
const errorMessage = ref('')
const loadingOlder = ref(false)
const hasMoreMessages = ref(false)
const messageListRef = ref<HTMLElement | null>(null)
const buildingId = computed(() => Number(route.params.id))
const selectedRoomName = computed(() => {
  const value = route.query.room_name
  return typeof value === 'string' && value.trim() ? value.trim() : null
})
const roomTitle = computed(() => selectedRoomName.value || '建筑总聊')
const remainingCount = computed(() => Math.max(0, 200 - draft.value.length))
const currentLocation = ref<{ latitude: number; longitude: number; location_source: MessageLocationSource; label: string } | null>(null)
const distanceToBuildingMeters = computed(() => {
  if (!currentLocation.value || !building.value) return null
  return haversineDistanceMeters(currentLocation.value, building.value)
})
const isLocationInsideBuildingRange = computed(() =>
  distanceToBuildingMeters.value !== null &&
  distanceToBuildingMeters.value <= MAX_MESSAGE_DISTANCE_METERS
)
const composerDisabled = computed(() =>
  !currentLocation.value || !isLocationInsideBuildingRange.value
)
const composerPrompt = computed(() => {
  if (!currentLocation.value) return '请先点击“定位”或“使用建筑位置”，确认你在该建筑附近后才能留言'
  if (!isLocationInsideBuildingRange.value) {
    return `当前位置距该建筑约 ${formatDistance(distanceToBuildingMeters.value)}，超过 ${MAX_MESSAGE_DISTANCE_METERS} 米，不能在这里留言`
  }
  return ''
})
const locationText = computed(() => {
  if (!currentLocation.value) return '发布前需要确认位置'
  const source = currentLocation.value.location_source === 'browser' ? '浏览器定位' : '建筑位置'
  const distance = distanceToBuildingMeters.value === null
    ? ''
    : ` · 距建筑约 ${formatDistance(distanceToBuildingMeters.value)}`
  return `${source} · ${currentLocation.value.label}${distance}`
})

function getErrorMessage(error: unknown): string {
  if (isAxiosError(error) && typeof error.response?.data?.detail === 'string') {
    const detail = error.response.data.detail
    if (detail.toLowerCase().includes('location is too far')) {
      return '当前位置距离该建筑过远，不能在这里留言'
    }
    return detail
  }
  return '留言请求失败，请稍后重试'
}
function formatTime(value: string): string { const date = parseApiDateTime(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }
function formatDistance(value: number | null): string { if (value === null) return ''; return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${Math.round(value)} m` }
async function scrollToBottom() { await nextTick(); if (messageListRef.value) messageListRef.value.scrollTop = messageListRef.value.scrollHeight }
async function loadMessages() {
  if (!Number.isFinite(buildingId.value)) return
  try {
    const nextMessages = await getBuildingMessages(buildingId.value, { roomName: selectedRoomName.value, limit: MESSAGE_PAGE_SIZE, offset: 0 })
    messages.value = nextMessages
    hasMoreMessages.value = hasMoreMessagePages(nextMessages)
    await scrollToBottom()
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  }
}
async function loadOlderMessages() {
  if (!Number.isFinite(buildingId.value) || loadingOlder.value || !hasMoreMessages.value) return
  loadingOlder.value = true
  try {
    const olderMessages = await getBuildingMessages(buildingId.value, {
      roomName: selectedRoomName.value,
      limit: MESSAGE_PAGE_SIZE,
      offset: messages.value.length
    })
    messages.value = mergeOlderMessages(messages.value, olderMessages)
    hasMoreMessages.value = hasMoreMessagePages(olderMessages)
  } catch (error) {
    showFailToast(getErrorMessage(error))
  } finally {
    loadingOlder.value = false
  }
}
async function loadPage() {
  if (!Number.isFinite(buildingId.value)) { errorMessage.value = '建筑编号无效'; loading.value = false; return }
  loading.value = true; errorMessage.value = ''
  try {
    const [nextBuilding, nextMessages] = await Promise.all([
      getBuildingDetail(buildingId.value),
      getBuildingMessages(buildingId.value, { roomName: selectedRoomName.value, limit: MESSAGE_PAGE_SIZE, offset: 0 })
    ])
    building.value = nextBuilding
    messages.value = nextMessages
    hasMoreMessages.value = hasMoreMessagePages(nextMessages)
    await scrollToBottom()
  }
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
  if (composerDisabled.value) return showFailToast(composerPrompt.value)
  const validationError = validateMessageContent(draft.value)
  if (validationError) return showFailToast(validationError)
  if (!currentLocation.value) return showFailToast('请先定位或使用当前建筑位置')
  sending.value = true
  try {
    await createBuildingMessage(buildingId.value, { content: draft.value, room_name: selectedRoomName.value, latitude: currentLocation.value.latitude, longitude: currentLocation.value.longitude, location_source: currentLocation.value.location_source })
    draft.value = ''; showSuccessToast('留言已发送'); await loadMessages()
  } catch (error) { showFailToast(getErrorMessage(error)) } finally { sending.value = false }
}
function handleComposerClick() {
  if (composerDisabled.value) showFailToast(composerPrompt.value)
}
onMounted(loadPage)
watch(() => route.query.room_name, () => { void loadPage() })
</script>

<template>
  <section class="page message-page">
    <van-nav-bar :title="roomTitle" left-arrow @click-left="router.push(`/buildings/${buildingId}/chats`)" />
    <div class="message-content">
      <header v-reveal class="message-heading"><div><strong>{{ roomTitle }}</strong><span>{{ building?.name || '建筑会话' }} · HTTP 聊天 · 按时间顺序</span></div><span>{{ messages.length }} 条</span></header>
      <section v-reveal="{ delay: 45 }" class="location-strip"><div><van-icon name="location-o" /><span>{{ locationText }}</span></div><div><button type="button" :disabled="locating" @click="requestBrowserLocation">{{ locating ? '定位中' : '定位' }}</button><button type="button" @click="useBuildingLocation">使用建筑位置</button></div></section>
      <p v-if="loading" class="muted-text">正在加载留言...</p>
      <van-empty v-else-if="errorMessage" image="error" :description="errorMessage"><van-button type="primary" size="small" @click="loadPage">重试</van-button></van-empty>
      <van-empty v-else-if="messages.length === 0" description="还没有留言，发出第一条吧" />
      <div v-else ref="messageListRef" v-reveal="{ delay: 80 }" class="message-list">
        <button v-if="hasMoreMessages" type="button" class="load-more-button" :disabled="loadingOlder" @click="loadOlderMessages">
          {{ loadingOlder ? '正在加载...' : '加载更早留言' }}
        </button>
        <article v-for="message in messages" :key="message.id" class="message-row"><div class="message-meta"><span>{{ message.display_name || '匿名同学' }}</span><span v-if="message.distance_to_building_meters !== null">距建筑约 {{ formatDistance(message.distance_to_building_meters) }}</span><time>{{ formatTime(message.created_at) }}</time></div><p class="message-bubble">{{ message.content }}</p></article>
      </div>
    </div>
    <form class="message-composer" :class="{ disabled: composerDisabled }" @click.capture="handleComposerClick" @submit.prevent="submitMessage"><van-field v-model="draft" type="textarea" rows="1" autosize maxlength="200" :disabled="composerDisabled" :placeholder="composerDisabled ? '确认在建筑附近后才能留言' : '写一条匿名留言'" :border="false" /><div class="composer-actions"><span>{{ remainingCount }}/200</span><van-button type="primary" size="small" native-type="submit" :loading="sending" :disabled="composerDisabled">发送</van-button></div></form>
  </section>
</template>

<style scoped>
.message-page {
  min-height: 100vh;
  padding-bottom: 108px;
}

.message-content {
  display: grid;
  gap: 12px;
  width: min(100%, 520px);
  margin: 0 auto;
  padding: 14px 14px 24px;
}

.message-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--cm-line);
  border-left: 5px solid var(--cm-chat);
  border-radius: var(--cm-radius);
  background: var(--cm-surface);
  padding: 13px;
  box-shadow: 0 8px 24px rgba(28, 50, 42, 0.05);
}

.message-heading div {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.message-heading strong {
  overflow: hidden;
  color: var(--cm-ink);
  font-size: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-heading span {
  color: var(--cm-muted);
  font-size: 11px;
}

.message-heading > span {
  flex: 0 0 auto;
  border-radius: var(--cm-radius-sm);
  background: var(--cm-chat-soft);
  color: var(--cm-chat-dark);
  font-weight: 800;
  padding: 6px 8px;
}

.location-strip {
  display: grid;
  gap: 9px;
  border: 1px solid var(--cm-line);
  border-radius: var(--cm-radius);
  background: #fff;
  padding: 11px 12px;
}

.location-strip > div {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
}

.location-strip > div:first-child {
  color: var(--cm-text);
  font-size: 12px;
  line-height: 1.5;
}

.location-strip .van-icon {
  color: var(--cm-primary);
  font-size: 16px;
}

.location-strip button {
  border: 1px solid var(--cm-line);
  border-radius: var(--cm-radius-sm);
  background: #fff;
  color: var(--cm-primary);
  cursor: pointer;
  font-size: 11px;
  font-weight: 800;
  padding: 6px 9px;
}

.message-list {
  display: grid;
  gap: 15px;
  max-height: calc(100vh - 290px);
  overflow-y: auto;
  padding: 4px 2px 18px;
}

.load-more-button {
  justify-self: center;
  min-height: 34px;
  border: 1px solid var(--cm-line);
  border-radius: var(--cm-radius-sm);
  background: #fff;
  color: var(--cm-primary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
  padding: 7px 12px;
}

.load-more-button:disabled {
  color: var(--cm-muted);
  cursor: wait;
}

.message-row {
  display: grid;
  gap: 6px;
}

.message-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--cm-muted);
  font-size: 10px;
}

.message-meta span:first-child {
  color: var(--cm-text);
  font-weight: 800;
}

.message-meta time {
  margin-left: auto;
}

.message-bubble {
  width: fit-content;
  max-width: 84%;
  margin: 0;
  border: 1px solid var(--cm-line);
  border-left: 4px solid var(--cm-chat);
  border-radius: 4px 8px 8px;
  background: #fff;
  box-shadow: 0 6px 18px rgba(24, 43, 37, 0.07);
  color: var(--cm-ink);
  font-size: 14px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  padding: 10px 12px;
}

.message-composer {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 110;
  width: min(100%, 520px);
  margin: 0 auto;
  border: 1px solid var(--cm-line);
  border-bottom: 0;
  border-radius: var(--cm-radius) var(--cm-radius) 0 0;
  background: rgba(255, 255, 255, 0.96);
  padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
  backdrop-filter: blur(16px);
}

.message-composer :deep(.van-field) {
  border: 1px solid var(--cm-line);
  border-radius: var(--cm-radius);
  background: #f8faf8;
  padding: 9px 11px;
}

.message-composer.disabled {
  cursor: not-allowed;
}

.message-composer.disabled :deep(.van-field) {
  background: #eef3f1;
  opacity: 1;
}

.composer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 7px;
}

.composer-actions span {
  color: var(--cm-muted);
  font-size: 10px;
}
</style>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { showFailToast, showSuccessToast } from 'vant'
import { useRoute, useRouter } from 'vue-router'
import { getBuildingDetail, type Building } from '@/api/buildings'
import { extractBusinessError } from '@/api/errors'
import { createBuildingMessage, getBuildingMessages, validateMessageContent, type BuildingMessage, type MessageLocationSource } from '@/api/messages'
import TechIcon from '@/components/TechIcon.vue'
import { formatBuildingDisplayName } from '@/utils/buildings'
import { parseApiDateTime } from '@/utils/dateTime'
import { haversineDistanceMeters } from '@/utils/geo'
import { useKeyboardInset } from '@/utils/keyboardInset'
import { MESSAGE_PAGE_SIZE, hasMoreMessagePages, mergeOlderMessages } from '@/utils/messagePagination'
import { goBack } from '@/utils/navigation'

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
const roomTitle = computed(() => selectedRoomName.value || '地点频道')
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

const { keyboardInset } = useKeyboardInset()
const composerLift = computed(() => Math.max(0, keyboardInset.value))
const pageStyle = computed(() => ({
  '--composer-lift': `${composerLift.value}px`,
  paddingBottom: `calc(188px + env(safe-area-inset-bottom) + ${composerLift.value}px)`,
  scrollPaddingBottom: `calc(188px + env(safe-area-inset-bottom) + ${composerLift.value}px)`
}))
const composerStyle = computed(() => ({
  bottom: `calc(max(10px, env(safe-area-inset-bottom)) + ${composerLift.value}px)`
}))

function getErrorMessage(error: unknown): string {
  const message = extractBusinessError(error).message
  if (
    message.includes('过远') ||
    message.toLowerCase().includes('location is too far')
  ) {
    return '当前位置距离该建筑过远，不能在这里留言'
  }
  return message
}
function formatTime(value: string): string { const date = parseApiDateTime(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }
function formatDistance(value: number | null): string { if (value === null) return ''; return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${Math.round(value)} m` }
// 作者色点按昵称哈希取色：加载更早的留言后颜色依旧稳定（index 派生会整体变色）
function authorHue(name: string | null): number {
  const value = name || '匿名同学'
  let hash = 5381
  for (const ch of value) {
    hash = ((hash << 5) + hash + (ch.codePointAt(0) ?? 0)) >>> 0
  }
  return hash % 360
}
function formatDayLabel(date: Date): string {
  const today = new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOfDay(today) - startOfDay(date)) / 86_400_000)
  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'
  return `${date.getMonth() + 1}月${date.getDate()}日`
}
// 留言按日分组：日期放分隔条，行内只留 HH:mm
const groupedMessages = computed(() => {
  const groups: { key: string; label: string; items: BuildingMessage[] }[] = []
  for (const message of messages.value) {
    const date = parseApiDateTime(message.created_at)
    const valid = !Number.isNaN(date.getTime())
    const key = valid
      ? `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
      : 'unknown'
    const lastGroup = groups[groups.length - 1]
    if (lastGroup && lastGroup.key === key) {
      lastGroup.items.push(message)
    } else {
      groups.push({ key, label: valid ? formatDayLabel(date) : '', items: [message] })
    }
  }
  return groups
})
// 页面单滚动区：滚到留言列表底部（留言与输入框都收在视口里）
async function scrollToBottom() {
  await nextTick()
  const list = messageListRef.value
  if (!list) return
  const bottom = list.getBoundingClientRect().bottom + window.scrollY
  window.scrollTo({ top: Math.max(0, bottom - window.innerHeight + 220) })
}
// 每次发起留言请求就递增；响应返回时序号不匹配说明已被更新的请求取代，丢弃过期结果。
let messagesRequestSeq = 0
async function loadMessages() {
  if (!Number.isFinite(buildingId.value)) return
  const requestSeq = ++messagesRequestSeq
  try {
    const nextMessages = await getBuildingMessages(buildingId.value, { roomName: selectedRoomName.value, limit: MESSAGE_PAGE_SIZE, offset: 0 })
    if (requestSeq !== messagesRequestSeq) return
    messages.value = nextMessages
    hasMoreMessages.value = hasMoreMessagePages(nextMessages)
    await scrollToBottom()
  } catch (error) {
    if (requestSeq !== messagesRequestSeq) return
    errorMessage.value = getErrorMessage(error)
  } finally {
    if (requestSeq === messagesRequestSeq) loading.value = false
  }
}
async function loadOlderMessages() {
  if (!Number.isFinite(buildingId.value) || loadingOlder.value || !hasMoreMessages.value) return
  const oldestMessageId = messages.value[0]?.id
  if (oldestMessageId === undefined) return
  const requestSeq = ++messagesRequestSeq
  loadingOlder.value = true
  // 记住当前第一条留言的位置，prepend 后补偿滚动量，阅读位置不跳
  const anchorEl = messageListRef.value?.querySelector<HTMLElement>('.message-row')
  const anchorTop = anchorEl?.getBoundingClientRect().top ?? null
  try {
    const olderMessages = await getBuildingMessages(buildingId.value, {
      roomName: selectedRoomName.value,
      limit: MESSAGE_PAGE_SIZE,
      before_id: oldestMessageId
    })
    if (requestSeq !== messagesRequestSeq) return
    messages.value = mergeOlderMessages(messages.value, olderMessages)
    hasMoreMessages.value = hasMoreMessagePages(olderMessages)
    if (anchorEl && anchorTop !== null) {
      await nextTick()
      window.scrollBy(0, anchorEl.getBoundingClientRect().top - anchorTop)
    }
  } catch (error) {
    if (requestSeq !== messagesRequestSeq) return
    showFailToast(getErrorMessage(error))
  } finally {
    loadingOlder.value = false
  }
}
async function loadPage() {
  if (!Number.isFinite(buildingId.value)) { errorMessage.value = '建筑编号无效'; loading.value = false; return }
  const requestSeq = ++messagesRequestSeq
  loading.value = true; errorMessage.value = ''
  try {
    const [nextBuilding, nextMessages] = await Promise.all([
      getBuildingDetail(buildingId.value),
      getBuildingMessages(buildingId.value, { roomName: selectedRoomName.value, limit: MESSAGE_PAGE_SIZE, offset: 0 })
    ])
    if (requestSeq !== messagesRequestSeq) return
    building.value = nextBuilding
    messages.value = nextMessages
    hasMoreMessages.value = hasMoreMessagePages(nextMessages)
    await scrollToBottom()
  } catch (error) {
    if (requestSeq !== messagesRequestSeq) return
    errorMessage.value = getErrorMessage(error)
  } finally {
    if (requestSeq === messagesRequestSeq) loading.value = false
  }
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

async function handleComposerFocus() {
  await nextTick()
  // Keep the latest messages and the input above the keyboard.
  await scrollToBottom()
  window.setTimeout(() => {
    void scrollToBottom()
  }, 280)
}

onMounted(loadPage)
watch(() => route.query.room_name, () => { void loadPage() })
watch(composerLift, () => {
  if (composerLift.value > 0) {
    void scrollToBottom()
  }
})
</script>

<template>
  <section class="page message-page" :style="pageStyle">
    <van-nav-bar :title="roomTitle" left-arrow @click-left="goBack(router, '/home')" />
    <div class="message-content">
      <header
        v-reveal="{ from: 'left', distance: 38, stagger: 50 }"
        class="message-heading"
      >
        <span class="message-sun" aria-hidden="true"></span>
        <span class="message-leaves" aria-hidden="true"><i></i><i></i></span>
        <span class="channel-icon"><TechIcon name="chat" :size="21" /></span>
        <div class="heading-copy">
          <small>{{ building ? formatBuildingDisplayName(building.name) : '校园地点' }}</small>
          <strong>{{ roomTitle }}</strong>
          <span>这里的留言按时间慢慢排列</span>
        </div>
        <div class="message-count">
          <strong>{{ messages.length }}</strong>
          <small>条留言</small>
        </div>
      </header>

      <section
        v-reveal="{ from: 'right', distance: 36, stagger: 45 }"
        class="location-card"
        :class="{
          verified: currentLocation && isLocationInsideBuildingRange,
          denied: currentLocation && !isLocationInsideBuildingRange,
          locating
        }"
        aria-live="polite"
      >
        <span class="location-mark">
          <i></i>
          <TechIcon name="location" :size="19" />
        </span>
        <div class="location-copy">
          <small>
            {{ locating ? '正在获取位置' : !currentLocation ? '还没有确认位置' : isLocationInsideBuildingRange ? '位置已确认' : '距离有点远' }}
          </small>
          <strong>
            {{ locating ? '稍等一下' : !currentLocation ? '在附近才能发布留言' : isLocationInsideBuildingRange ? '现在可以留言了' : '请靠近这个地点' }}
          </strong>
          <p>{{ locationText }}</p>
          <span v-if="distanceToBuildingMeters !== null">
            距离 {{ formatDistance(distanceToBuildingMeters) }} · 限制 {{ MAX_MESSAGE_DISTANCE_METERS }} m
          </span>
        </div>
        <div class="location-actions">
          <button type="button" :disabled="locating" @click="requestBrowserLocation">
            <TechIcon name="aim" :size="16" />
            {{ locating ? '定位中' : '定位我' }}
          </button>
          <button type="button" @click="useBuildingLocation">
            <TechIcon name="home" :size="16" />
            使用建筑位置
          </button>
        </div>
      </section>

      <div v-if="loading" class="messages-loading" role="status" aria-live="polite">
        <div><span><i></i><i></i><i></i></span><strong>正在加载大家的留言...</strong></div>
        <span v-for="item in 3" :key="item" class="message-skeleton" :class="`skeleton-${item}`"></span>
      </div>

      <van-empty v-else-if="errorMessage" image="error" :description="errorMessage">
        <van-button type="primary" size="small" @click="loadPage">重新加载</van-button>
      </van-empty>

      <van-empty v-else-if="messages.length === 0" description="这里还没有留言">
        <span class="empty-flower" aria-hidden="true"><TechIcon name="spark" :size="23" /></span>
      </van-empty>

      <div
        v-else
        ref="messageListRef"
        v-reveal="{ from: 'left', distance: 40 }"
        class="message-list"
      >
        <button
          v-if="hasMoreMessages"
          type="button"
          class="load-more-button"
          :disabled="loadingOlder"
          @click="loadOlderMessages"
        >
          {{ loadingOlder ? '正在加载...' : '看看更早的留言' }}
        </button>

        <template v-for="group in groupedMessages" :key="group.key">
          <div v-if="group.label" class="day-divider" role="separator">
            <span>{{ group.label }}</span>
          </div>
          <article v-for="message in group.items" :key="message.id" class="message-row">
            <div class="message-meta">
              <span class="message-author">
                <i
                  class="author-avatar"
                  aria-hidden="true"
                  :style="{ '--author-hue': authorHue(message.display_name) }"
                >{{ (message.display_name || '匿')[0] }}</i>
                {{ message.display_name || '匿名同学' }}
              </span>
              <span v-if="message.distance_to_building_meters !== null">
                距建筑 {{ formatDistance(message.distance_to_building_meters) }}
              </span>
              <time>{{ formatTime(message.created_at) }}</time>
            </div>
            <p>{{ message.content }}</p>
          </article>
        </template>
      </div>
    </div>

    <form
      class="message-composer"
      :class="{ disabled: composerDisabled, 'is-lifted': composerLift > 0 }"
      :style="composerStyle"
      @click.capture="handleComposerClick"
      @submit.prevent="submitMessage"
    >
      <div class="composer-status">
        <span><i :class="{ ready: !composerDisabled }"></i>{{ composerDisabled ? '确认位置后可以留言' : '可以发布留言' }}</span>
        <small>{{ remainingCount }} 字可用</small>
      </div>
      <van-field
        v-model="draft"
        type="textarea"
        rows="1"
        autosize
        maxlength="200"
        :disabled="composerDisabled"
        :placeholder="composerDisabled ? '先确认你在这个地点附近' : '写下此刻想留在这里的话…'"
        :border="false"
        @focus="handleComposerFocus"
      />
      <div class="composer-actions">
        <span><i :style="{ width: `${Math.max(2, remainingCount / 2)}%` }"></i></span>
        <van-button
          type="primary"
          size="small"
          native-type="submit"
          :loading="sending"
          loading-text="正在发送"
          :disabled="composerDisabled"
        >
          发布留言
          <TechIcon v-if="!sending" name="arrow" :size="16" />
        </van-button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.message-page {
  min-height: 100dvh;
  /* padding-bottom / scroll-padding-bottom set inline for keyboard lift */
  background:
    radial-gradient(circle at 103% 4%, rgba(183, 167, 200, 0.14), transparent 18rem),
    radial-gradient(circle at -12% 55%, rgba(126, 166, 126, 0.1), transparent 19rem);
}

.message-content {
  display: grid;
  gap: 14px;
  width: min(100%, 590px);
  margin: 0 auto;
  padding: 16px 16px 26px;
}

.message-heading {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 11px;
  align-items: center;
  min-height: 132px;
  overflow: hidden;
  border-radius: 29px 29px 23px 29px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.43), transparent 45%),
    #ebe5ee;
  padding: 18px;
  box-shadow: var(--fresh-shadow-soft);
}

.message-heading::after {
  position: absolute;
  right: -43px;
  bottom: -49px;
  width: 160px;
  height: 100px;
  border-radius: 50%;
  background: rgba(111, 159, 170, 0.1);
  content: "";
}

.channel-icon {
  position: relative;
  z-index: 2;
  display: grid;
  width: 47px;
  height: 47px;
  place-items: center;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.64);
  color: #786c86;
  font-size: 21px;
}

.heading-copy {
  position: relative;
  z-index: 2;
  display: grid;
  min-width: 0;
  gap: 3px;
}

.heading-copy small { color: #635b6b; font-size: 12px; }
.heading-copy strong { overflow: hidden; color: var(--fresh-ink); font-size: 17px; text-overflow: ellipsis; white-space: nowrap; }
.heading-copy span { color: var(--fresh-muted); font-size: 12px; }

.message-count {
  position: relative;
  z-index: 2;
  display: grid;
  justify-items: end;
}

.message-count strong {
  color: var(--fresh-ink);
  font-family: var(--font-serif);
  font-size: 33px;
  line-height: 1;
}

.message-count small { color: var(--fresh-muted); font-size: 12px; }

.message-sun {
  position: absolute;
  top: 12px;
  right: 15px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(242, 200, 111, 0.8);
  box-shadow: 0 0 0 7px rgba(242, 200, 111, 0.1);
}

.message-leaves {
  position: absolute;
  right: 38px;
  bottom: 4px;
  display: flex;
}

.message-leaves i {
  width: 18px;
  height: 34px;
  border-radius: 100% 0 100% 0;
  background: rgba(115, 141, 104, 0.2);
  transform: rotate(-35deg);
}

.location-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 11px;
  border: 1px solid var(--fresh-line);
  border-radius: 24px;
  background: var(--fresh-paper);
  padding: 13px;
  box-shadow: var(--fresh-shadow-soft);
}

.location-card.verified {
  border-color: var(--fresh-line-strong);
  background: var(--fresh-mint);
}

.location-card.denied {
  border-color: #e2c6bf;
  background: var(--cm-red-soft);
}

.location-mark {
  position: relative;
  display: grid;
  width: 43px;
  height: 43px;
  place-items: center;
  border-radius: 50% 50% 50% 14px;
  background: var(--fresh-sky);
  color: var(--cm-chat-dark);
  transform: rotate(-45deg);
}

.location-mark > * {
  transform: rotate(45deg);
}

.location-mark i {
  position: absolute;
  inset: -6px;
  border: 1px solid rgba(111, 159, 170, 0.25);
  border-radius: inherit;
  animation: location-ring 2s ease-out infinite;
}

.verified .location-mark {
  background: var(--fresh-mint);
  color: var(--fresh-green-dark);
}

.location-copy {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.location-copy small { color: var(--fresh-green); font-size: 12px; font-weight: 700; }
.location-copy strong { color: var(--fresh-ink); font-size: 15px; line-height: 1.35; }
.location-copy p {
  overflow: hidden;
  margin: 0;
  color: var(--fresh-muted);
  font-size: 13px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.location-copy > span { color: var(--fresh-muted); font-size: 12px; }

.location-actions {
  display: flex;
  grid-column: 1 / -1;
  gap: 8px;
  padding-top: 6px;
}

.location-actions button {
  display: flex;
  flex: 1;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid var(--fresh-line);
  border-radius: var(--radius-sm);
  background: var(--fresh-paper-2);
  color: var(--fresh-text);
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
}

/* Primary: browser locate */
.location-actions button:first-child {
  border-color: var(--fresh-green);
  background: var(--fresh-green);
  color: #fff;
}

/* Secondary: use building location */
.location-actions button:last-child {
  border-color: #a9c1ad;
  background: #fff;
  color: var(--fresh-green-dark);
}

.location-actions button:disabled {
  border-color: var(--fresh-line);
  background: var(--disabled-surface);
  color: var(--disabled-text);
  cursor: wait;
  opacity: 1;
}

.messages-loading {
  display: grid;
  gap: 13px;
  min-height: 260px;
  align-content: center;
  border-radius: 25px;
  background: rgba(255, 253, 248, 0.72);
  padding: 18px;
}

.messages-loading > div {
  display: flex;
  gap: 11px;
  align-items: center;
}

.messages-loading > div > span {
  display: flex;
  gap: 3px;
  align-items: flex-end;
  height: 26px;
}

.messages-loading > div i {
  width: 5px;
  height: 11px;
  border-radius: var(--radius-pill);
  background: var(--fresh-lilac);
  animation: message-load 800ms ease-in-out infinite alternate;
}

.messages-loading > div i:nth-child(2) { height: 23px; animation-delay: 140ms; }
.messages-loading > div i:nth-child(3) { height: 16px; animation-delay: 280ms; }
.messages-loading strong { color: var(--fresh-ink); font-size: 12px; }

.message-skeleton {
  display: block;
  width: 78%;
  height: 51px;
  border-radius: var(--radius-md);
  background: linear-gradient(90deg, var(--disabled-surface), var(--fresh-paper-2), var(--disabled-surface));
  background-size: 200% 100%;
  animation: skeleton-move 1.3s linear infinite;
}

.skeleton-2 { width: 64%; justify-self: end; }
.skeleton-3 { width: 86%; }

.empty-flower {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 50%;
  background: var(--fresh-mint);
  color: var(--fresh-green);
}

/* 页面唯一滚动区就是文档本身：聊天流不再截进内滚小窗 */
.message-list {
  display: grid;
  gap: 13px;
  border-radius: 25px;
  background: rgba(255, 253, 248, 0.6);
  padding: 13px;
}

.day-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
  color: var(--fresh-muted);
  font-size: var(--text-xs);
  font-weight: 600;
}

.day-divider::before,
.day-divider::after {
  height: 1px;
  flex: 1;
  background: var(--fresh-line);
  content: "";
}

.load-more-button {
  justify-self: center;
  min-height: 40px;
  border: 1px solid var(--fresh-line);
  border-radius: var(--radius-pill);
  background: var(--fresh-paper-2);
  color: var(--fresh-text);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  padding: 0 14px;
}

.message-row {
  display: grid;
  gap: 6px;
}

.message-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--fresh-muted);
  font-size: 12px;
  flex-wrap: wrap;
}

.message-author {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-right: auto;
  color: var(--fresh-text);
  font-weight: 700;
}

.message-author .author-avatar {
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border-radius: 50% 50% 50% 22%;
  background: hsl(var(--author-hue) 30% 58%);
  color: #fff;
  font-size: 11px;
  font-style: normal;
  font-weight: 600;
  line-height: 1;
}

.message-row p {
  max-width: 92%;
  margin: 0;
  border-radius: 8px 19px 19px 19px;
  background: #fff;
  color: var(--fresh-ink);
  font-size: 15px;
  line-height: 1.65;
  padding: 12px 14px;
  box-shadow: 0 7px 19px rgba(49, 72, 49, 0.07);
  overflow-wrap: anywhere;
}

.message-composer {
  position: fixed;
  right: max(10px, calc((100vw - var(--page-max)) / 2 + 10px));
  bottom: max(10px, env(safe-area-inset-bottom));
  left: max(10px, calc((100vw - var(--page-max)) / 2 + 10px));
  z-index: 500;
  overflow: hidden;
  border: 1px solid rgba(79, 125, 88, 0.13);
  border-radius: 25px;
  background: rgba(255, 253, 248, 0.96);
  padding: 10px 12px 11px;
  box-shadow: 0 18px 48px rgba(49, 72, 49, 0.16);
  backdrop-filter: blur(16px);
  transition: bottom 180ms ease;
}

.message-composer.is-lifted {
  border-radius: 20px 20px 16px 16px;
  box-shadow: 0 10px 28px rgba(49, 72, 49, 0.2);
}

.message-composer.disabled {
  background: rgba(245, 247, 241, 0.97);
}

.composer-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 3px 6px;
  color: var(--fresh-text);
  font-size: 13px;
  font-weight: 600;
}

.message-composer.disabled .composer-status {
  color: #8a5b3d;
}

.composer-status > span {
  display: flex;
  align-items: center;
  gap: 6px;
}

.composer-status i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #b9c1b7;
}

.composer-status i.ready {
  background: var(--fresh-green);
  box-shadow: 0 0 0 4px rgba(79, 125, 88, 0.1);
}

.message-composer :deep(.van-cell) {
  min-height: 48px;
  border-radius: 15px;
  background: var(--fresh-paper-2);
  padding: 10px 12px;
}

.message-composer :deep(.van-field__control) {
  font-size: 16px;
  line-height: 1.45;
}

.composer-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding-top: 7px;
}

.composer-actions > span {
  height: 3px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: var(--fresh-mint);
}

.composer-actions > span i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--fresh-leaf);
  transition: width 180ms ease;
}

.composer-actions :deep(.van-button) {
  min-height: 44px;
  padding: 0 16px;
  font-size: 14px;
}

@keyframes location-ring {
  to { opacity: 0; transform: scale(1.28); }
}

@keyframes message-load {
  to { transform: scaleY(1.4); }
}

@keyframes skeleton-move {
  to { background-position: -200% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .location-mark i,
  .messages-loading i,
  .message-skeleton {
    animation: none;
  }
}
</style>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { isAxiosError } from 'axios'
import { showFailToast, showSuccessToast } from 'vant'
import { useRoute, useRouter } from 'vue-router'

import { getBuildingDetail, type Building } from '@/api/buildings'
import {
  createBuildingMessage,
  getBuildingMessages,
  validateMessageContent,
  type BuildingMessage,
  type MessageLocationSource
} from '@/api/messages'

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
const currentLocation = ref<{
  latitude: number
  longitude: number
  location_source: MessageLocationSource
  label: string
} | null>(null)
const locationText = computed(() => {
  if (!currentLocation.value) {
    return '发布留言前需要确认当前位置'
  }
  const source = currentLocation.value.location_source === 'browser' ? '浏览器定位' : '手动位置'
  return `${source}：${currentLocation.value.label}`
})

function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') {
      return detail
    }
  }
  return '留言请求失败，请稍后重试'
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDistance(value: number | null): string {
  if (value === null) {
    return ''
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} km`
  }
  return `${Math.round(value)} m`
}

async function scrollToBottom() {
  await nextTick()
  const container = messageListRef.value
  if (container) {
    container.scrollTop = container.scrollHeight
  }
}

async function loadMessages() {
  if (!Number.isFinite(buildingId.value)) {
    errorMessage.value = '建筑编号无效'
    loading.value = false
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    messages.value = await getBuildingMessages(buildingId.value)
    await scrollToBottom()
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    loading.value = false
  }
}

async function loadPage() {
  if (!Number.isFinite(buildingId.value)) {
    errorMessage.value = '建筑编号无效'
    loading.value = false
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    const [nextBuilding, nextMessages] = await Promise.all([
      getBuildingDetail(buildingId.value),
      getBuildingMessages(buildingId.value)
    ])
    building.value = nextBuilding
    messages.value = nextMessages
    await scrollToBottom()
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    loading.value = false
  }
}

function useBuildingLocation() {
  if (!building.value) {
    showFailToast('建筑信息尚未加载')
    return
  }
  currentLocation.value = {
    latitude: building.value.latitude,
    longitude: building.value.longitude,
    location_source: 'manual',
    label: building.value.name
  }
  showSuccessToast('已使用当前建筑位置')
}

function requestBrowserLocation() {
  if (!navigator.geolocation) {
    showFailToast('当前浏览器不支持定位，请使用手动位置')
    return
  }
  locating.value = true
  navigator.geolocation.getCurrentPosition(
    (position) => {
      currentLocation.value = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        location_source: 'browser',
        label: '当前位置'
      }
      locating.value = false
      showSuccessToast('定位成功')
    },
    () => {
      locating.value = false
      showFailToast('定位失败，请改用手动位置')
    },
    {
      enableHighAccuracy: true,
      maximumAge: 60_000,
      timeout: 8_000
    }
  )
}

async function submitMessage() {
  const validationError = validateMessageContent(draft.value)
  if (validationError) {
    showFailToast(validationError)
    return
  }
  if (!currentLocation.value) {
    showFailToast('请先获取当前位置或使用当前建筑位置')
    return
  }

  sending.value = true
  try {
    await createBuildingMessage(buildingId.value, {
      content: draft.value,
      latitude: currentLocation.value.latitude,
      longitude: currentLocation.value.longitude,
      location_source: currentLocation.value.location_source
    })
    draft.value = ''
    showSuccessToast('留言已发送')
    await loadMessages()
  } catch (error) {
    showFailToast(getErrorMessage(error))
  } finally {
    sending.value = false
  }
}

onMounted(loadPage)
</script>

<template>
  <section class="page message-page">
    <van-nav-bar title="建筑留言" left-arrow @click-left="router.push(`/buildings/${buildingId}`)" />
    <div class="message-content">
      <section class="chat-intro">
        <span class="pill">匿名留言区</span>
        <h1>建筑里的实时经验</h1>
        <p>第一版使用 HTTP 留言，统一显示为“匿名同学”。</p>
      </section>
      <section class="location-panel">
        <div>
          <strong>留言定位</strong>
          <p>{{ locationText }}</p>
        </div>
        <div class="location-actions">
          <van-button size="small" plain :loading="locating" @click="requestBrowserLocation">
            获取当前位置
          </van-button>
          <van-button size="small" type="primary" plain @click="useBuildingLocation">
            使用当前建筑位置
          </van-button>
        </div>
      </section>
      <p v-if="loading" class="muted-text">正在加载留言...</p>
      <van-empty v-else-if="errorMessage" image="error" :description="errorMessage">
        <van-button type="primary" size="small" @click="loadPage">重试</van-button>
      </van-empty>
      <van-empty v-else-if="messages.length === 0" description="暂无留言" />
      <div v-else ref="messageListRef" class="message-list">
        <article v-for="message in messages" :key="message.id" class="message-row">
          <div class="message-meta">
            <span>{{ message.display_name || '匿名同学' }}</span>
            <span v-if="message.distance_to_building_meters !== null">
              距建筑约 {{ formatDistance(message.distance_to_building_meters) }}
            </span>
            <time>{{ formatTime(message.created_at) }}</time>
          </div>
          <p class="message-bubble">{{ message.content }}</p>
        </article>
      </div>
    </div>

    <form class="message-composer" @submit.prevent="submitMessage">
      <van-field
        v-model="draft"
        type="textarea"
        rows="2"
        autosize
        maxlength="200"
        placeholder="写一条匿名留言"
        :border="false"
      />
      <div class="composer-actions">
        <span class="count-text">{{ remainingCount }}/200</span>
        <van-button type="primary" size="small" native-type="submit" :loading="sending">
          发送
        </van-button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.message-page {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  padding-bottom: 0;
}

.message-content {
  width: min(100%, 480px);
  flex: 1;
  margin: 0 auto;
  padding: 8px 14px 112px;
}

.chat-intro {
  margin-bottom: 14px;
  border: 1px solid var(--cm-line);
  border-radius: var(--cm-radius);
  background: rgb(255 255 255 / 88%);
  box-shadow: 0 8px 20px rgb(16 24 40 / 6%);
  padding: 14px;
}

.chat-intro h1 {
  margin: 9px 0 4px;
  color: var(--cm-ink);
  font-size: 21px;
}

.chat-intro p {
  margin: 0;
  color: var(--cm-muted);
  font-size: 13px;
  line-height: 1.6;
}

.location-panel {
  display: grid;
  gap: 10px;
  margin-bottom: 14px;
  border: 1px solid var(--cm-line);
  border-radius: var(--cm-radius);
  background: #fff;
  box-shadow: 0 8px 20px rgb(16 24 40 / 6%);
  padding: 13px;
}

.location-panel strong {
  color: var(--cm-ink);
  font-size: 15px;
}

.location-panel p {
  margin: 5px 0 0;
  color: var(--cm-muted);
  font-size: 13px;
}

.location-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.message-list {
  display: grid;
  max-height: calc(100vh - 276px);
  gap: 12px;
  overflow-y: auto;
  padding-right: 2px;
}

.message-row {
  display: grid;
  justify-items: start;
  gap: 4px;
}

.message-meta {
  display: flex;
  gap: 8px;
  color: var(--cm-muted);
  font-size: 12px;
}

.message-bubble {
  max-width: min(82%, 360px);
  margin: 0;
  border: 1px solid var(--cm-line);
  border-radius: 8px 8px 8px 2px;
  background: #ffffff;
  box-shadow: 0 6px 18px rgb(16 24 40 / 7%);
  color: var(--cm-ink);
  line-height: 1.6;
  overflow-wrap: anywhere;
  padding: 11px 13px;
}

.message-composer {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  width: min(100%, 480px);
  margin: 0 auto;
  border: 1px solid var(--cm-line);
  border-bottom: 0;
  border-radius: 8px 8px 0 0;
  background: rgb(255 255 255 / 96%);
  box-shadow: 0 -10px 26px rgb(16 24 40 / 10%);
  padding: 9px 10px calc(9px + env(safe-area-inset-bottom));
}

.composer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 6px;
}

.count-text,
.muted-text {
  color: var(--cm-muted);
  font-size: 13px;
}
</style>

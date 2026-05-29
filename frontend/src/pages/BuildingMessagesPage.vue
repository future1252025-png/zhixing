<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { isAxiosError } from 'axios'
import { showFailToast, showSuccessToast } from 'vant'
import { useRoute, useRouter } from 'vue-router'

import {
  createBuildingMessage,
  getBuildingMessages,
  validateMessageContent,
  type BuildingMessage
} from '@/api/messages'

const route = useRoute()
const router = useRouter()
const messages = ref<BuildingMessage[]>([])
const draft = ref('')
const loading = ref(true)
const sending = ref(false)
const errorMessage = ref('')
const messageListRef = ref<HTMLElement | null>(null)

const buildingId = computed(() => Number(route.params.id))
const remainingCount = computed(() => Math.max(0, 200 - draft.value.length))

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

async function submitMessage() {
  const validationError = validateMessageContent(draft.value)
  if (validationError) {
    showFailToast(validationError)
    return
  }

  sending.value = true
  try {
    await createBuildingMessage(buildingId.value, draft.value)
    draft.value = ''
    showSuccessToast('留言已发送')
    await loadMessages()
  } catch (error) {
    showFailToast(getErrorMessage(error))
  } finally {
    sending.value = false
  }
}

onMounted(loadMessages)
</script>

<template>
  <section class="page message-page">
    <van-nav-bar title="建筑留言" left-arrow @click-left="router.push(`/buildings/${buildingId}`)" />
    <div class="message-content">
      <p v-if="loading" class="muted-text">正在加载留言...</p>
      <van-empty v-else-if="errorMessage" image="error" :description="errorMessage">
        <van-button type="primary" size="small" @click="loadMessages">重试</van-button>
      </van-empty>
      <van-empty v-else-if="messages.length === 0" description="暂无留言" />
      <div v-else ref="messageListRef" class="message-list">
        <article v-for="message in messages" :key="message.id" class="message-row">
          <div class="message-meta">
            <span>{{ message.display_name || '匿名同学' }}</span>
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
  padding: 14px 14px 104px;
}

.message-list {
  display: grid;
  max-height: calc(100vh - 190px);
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
  color: #6b7280;
  font-size: 12px;
}

.message-bubble {
  max-width: min(82%, 360px);
  margin: 0;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 1px 5px rgb(15 23 42 / 8%);
  color: #1f2937;
  line-height: 1.6;
  overflow-wrap: anywhere;
  padding: 10px 12px;
}

.message-composer {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  width: min(100%, 480px);
  margin: 0 auto;
  border-top: 1px solid #e5e7eb;
  background: #ffffff;
  padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
}

.composer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 6px;
}

.count-text,
.muted-text {
  color: #6b7280;
  font-size: 13px;
}
</style>

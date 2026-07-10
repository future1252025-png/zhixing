<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getBuildingDetail, type Building } from '@/api/buildings'
import {
  getBuildingChatrooms,
  type BuildingChatRoom
} from '@/api/messages'
import { rememberRecentChatEntry } from '@/utils/chat'

const route = useRoute()
const router = useRouter()
const building = ref<Building | null>(null)
const rooms = ref<BuildingChatRoom[]>([])
const loading = ref(true)
const errorMessage = ref('')
const roomQuery = ref('')
const buildingId = computed(() => Number(route.params.id))
const roomCountText = computed(() => {
  const specificRooms = rooms.value.filter((room) => !room.is_general).length
  return specificRooms > 0 ? `${specificRooms} 个教室聊天室` : '可先进入建筑总聊'
})
const filteredRooms = computed(() => {
  const query = roomQuery.value.trim().toLowerCase()
  if (!query) {
    return rooms.value
  }
  return rooms.value.filter((room) =>
    `${room.name} ${room.room_name ?? ''}`.toLowerCase().includes(query)
  )
})
const canOpenCustomRoom = computed(() => {
  const query = roomQuery.value.trim()
  if (!query) {
    return false
  }
  return !rooms.value.some((room) =>
    room.room_name === query || room.name === query
  )
})

function openRoom(room: BuildingChatRoom) {
  if (building.value && typeof window !== 'undefined') {
    rememberRecentChatEntry(window.localStorage, {
      buildingId: buildingId.value,
      buildingName: building.value.name,
      roomName: room.room_name || null
    })
  }
  router.push({
    path: `/buildings/${buildingId.value}/messages`,
    query: room.room_name ? { room_name: room.room_name } : {}
  })
}

function openCustomRoom() {
  const roomName = roomQuery.value.trim()
  if (!roomName || !building.value) {
    return
  }
  rememberRecentChatEntry(window.localStorage, {
    buildingId: buildingId.value,
    buildingName: building.value.name,
    roomName
  })
  router.push({
    path: `/buildings/${buildingId.value}/messages`,
    query: { room_name: roomName }
  })
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
    const [nextBuilding, nextRooms] = await Promise.all([
      getBuildingDetail(buildingId.value),
      getBuildingChatrooms(buildingId.value)
    ])
    building.value = nextBuilding
    rooms.value = nextRooms
  } catch {
    errorMessage.value = '聊天室加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

onMounted(loadPage)
</script>

<template>
  <section class="page chatrooms-page">
    <van-nav-bar title="建筑会话" left-arrow @click-left="router.push(`/buildings/${buildingId}`)" />
    <div class="page-content chatrooms-content">
      <p v-if="loading" class="muted-text">正在加载聊天室...</p>
      <van-empty v-else-if="errorMessage" image="error" :description="errorMessage">
        <van-button type="primary" size="small" @click="loadPage">重试</van-button>
      </van-empty>

      <template v-else>
        <header v-reveal class="chatrooms-hero">
          <span>建筑会话</span>
          <h1>{{ building?.name || '校园建筑' }}</h1>
          <p>先进入建筑总聊，也可以搜索或输入具体教室号。</p>
          <strong>{{ roomCountText }}</strong>
        </header>

        <section v-reveal="{ delay: 45 }" class="room-search">
          <van-search
            v-model="roomQuery"
            placeholder="搜索或输入教室号，例如 教4-203"
            shape="round"
            background="transparent"
          />
          <button v-if="canOpenCustomRoom" type="button" class="custom-room-card" @click="openCustomRoom">
            <span class="room-icon"><van-icon name="plus" /></span>
            <span class="room-copy">
              <strong>进入 {{ roomQuery.trim() }}</strong>
              <small>还没有历史消息，也可以先创建这个教室频道</small>
            </span>
            <van-icon name="arrow" />
          </button>
        </section>

        <section v-reveal="{ delay: 80 }" class="room-list" aria-label="聊天室列表">
          <button
            v-for="room in filteredRooms"
            :key="room.room_name || 'general'"
            type="button"
            class="room-card"
            :class="{ 'is-general': room.is_general }"
            @click="openRoom(room)"
          >
            <span class="room-icon">
              <van-icon :name="room.is_general ? 'friends-o' : 'chat-o'" />
            </span>
            <span class="room-copy">
              <strong>{{ room.name }}</strong>
              <small>
                {{ room.is_general ? '整栋建筑公共讨论区' : '教室专属匿名聊天室' }}
              </small>
            </span>
            <span class="room-count">{{ room.message_count }} 条</span>
            <van-icon name="arrow" />
          </button>
        </section>

        <van-empty
          v-if="filteredRooms.length === 0 && !canOpenCustomRoom"
          description="暂无匹配聊天室"
        />
      </template>
    </div>
  </section>
</template>

<style scoped>
.chatrooms-content {
  display: grid;
  gap: 16px;
}

.chatrooms-hero {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(10, 125, 115, 0.18);
  border-radius: var(--cm-radius);
  background:
    linear-gradient(90deg, rgba(10, 125, 115, 0.065) 1px, transparent 1px) 0 0 / 24px 24px,
    linear-gradient(135deg, #f8fdf9 0%, #e7f4ed 60%, #e9f2fa 100%);
  color: var(--cm-ink);
  padding: 20px;
  box-shadow: 0 18px 42px rgba(30, 68, 55, .11);
}

.chatrooms-hero::after {
  position: absolute;
  right: 18px;
  bottom: 18px;
  width: 86px;
  height: 1px;
  background: linear-gradient(90deg, rgba(10, 125, 115, 0.22), rgba(67, 135, 199, 0.66), rgba(242, 184, 75, 0.85));
  content: "";
}

.chatrooms-hero span {
  color: var(--cm-primary);
  font-size: 12px;
  font-weight: 700;
}

.chatrooms-hero h1 {
  margin: 8px 0 8px;
  font-size: 26px;
  line-height: 1.2;
}

.chatrooms-hero p {
  margin: 0 0 14px;
  color: var(--cm-muted);
  font-size: 14px;
  line-height: 1.55;
}

.chatrooms-hero strong {
  display: inline-flex;
  border-radius: var(--cm-radius-sm);
  border: 1px solid rgba(10, 125, 115, .14);
  background: rgba(255, 255, 255, .74);
  color: var(--cm-primary-dark);
  padding: 7px 11px;
  font-size: 12px;
}

.room-list {
  display: grid;
  gap: 10px;
}

.room-search {
  display: grid;
  gap: 10px;
}

.room-search :deep(.van-search) {
  padding: 0;
}

.room-search :deep(.van-search__content) {
  align-items: center;
  min-height: 50px;
  border: 1px solid var(--cm-line);
  background: #fff;
  padding: 0 12px;
}

.room-card {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto 18px;
  align-items: center;
  gap: 11px;
  width: 100%;
  border: 1px solid var(--cm-line);
  border-left: 4px solid transparent;
  border-radius: var(--cm-radius);
  background: var(--cm-surface);
  color: var(--cm-ink);
  cursor: pointer;
  padding: 14px;
  text-align: left;
  box-shadow: 0 8px 22px rgba(24, 43, 37, .06);
  transition:
    border-color var(--cm-motion),
    box-shadow var(--cm-motion),
    transform var(--cm-motion),
    background var(--cm-motion);
}

.custom-room-card {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 18px;
  align-items: center;
  gap: 11px;
  width: 100%;
  border: 1px dashed rgba(13, 133, 124, .42);
  border-radius: var(--cm-radius);
  background: rgba(13, 133, 124, .08);
  color: var(--cm-ink);
  cursor: pointer;
  padding: 14px;
  text-align: left;
  transition:
    border-color var(--cm-motion),
    transform var(--cm-motion),
    background var(--cm-motion);
}

.room-card.is-general {
  border-color: rgba(13, 133, 124, .28);
  border-left-color: var(--cm-primary);
  background: linear-gradient(135deg, rgba(13, 133, 124, .12), #fff);
}

.room-card:not(.is-general) {
  border-left-color: var(--cm-chat);
}

.room-card:active,
.custom-room-card:active {
  transform: translateY(1px);
}

.room-card:hover,
.custom-room-card:hover {
  border-color: rgba(88, 101, 242, .28);
  box-shadow: 0 12px 28px rgba(24, 43, 37, .08);
}

.room-icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: var(--cm-radius);
  background: var(--cm-chat-soft);
  color: var(--cm-chat-dark);
  font-size: 20px;
}

.room-card.is-general .room-icon {
  background: var(--cm-primary-soft);
  color: var(--cm-primary);
}

.room-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.room-copy strong {
  overflow: hidden;
  font-size: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.room-copy small {
  color: var(--cm-muted);
  font-size: 12px;
}

.room-count {
  border-radius: 999px;
  background: var(--cm-surface-muted);
  color: var(--cm-muted);
  font-size: 12px;
  padding: 5px 8px;
  white-space: nowrap;
}
</style>

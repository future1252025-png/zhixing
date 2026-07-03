<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getBuildingDetail, type Building } from '@/api/buildings'
import {
  getBuildingChatrooms,
  type BuildingChatRoom
} from '@/api/messages'

const route = useRoute()
const router = useRouter()
const building = ref<Building | null>(null)
const rooms = ref<BuildingChatRoom[]>([])
const loading = ref(true)
const errorMessage = ref('')
const buildingId = computed(() => Number(route.params.id))
const roomCountText = computed(() => {
  const specificRooms = rooms.value.filter((room) => !room.is_general).length
  return specificRooms > 0 ? `${specificRooms} 个教室聊天室` : '可先进入建筑总聊'
})

function openRoom(room: BuildingChatRoom) {
  router.push({
    path: `/buildings/${buildingId.value}/messages`,
    query: room.room_name ? { room_name: room.room_name } : {}
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
        <header class="chatrooms-hero">
          <span>建筑会话</span>
          <h1>{{ building?.name || '校园建筑' }}</h1>
          <p>先选择总聊或具体教室，再进入匿名聊天。</p>
          <strong>{{ roomCountText }}</strong>
        </header>

        <section class="room-list" aria-label="聊天室列表">
          <button
            v-for="room in rooms"
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
          v-if="rooms.length === 0"
          description="暂无聊天室"
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
  border-radius: 20px;
  background: linear-gradient(135deg, #0b7771, #133f48);
  color: #fff;
  padding: 20px;
  box-shadow: 0 18px 42px rgba(9, 70, 74, .18);
}

.chatrooms-hero span {
  color: rgba(255, 255, 255, .72);
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
  color: rgba(255, 255, 255, .8);
  font-size: 14px;
  line-height: 1.55;
}

.chatrooms-hero strong {
  display: inline-flex;
  border-radius: 999px;
  background: rgba(255, 255, 255, .14);
  padding: 7px 11px;
  font-size: 12px;
}

.room-list {
  display: grid;
  gap: 10px;
}

.room-card {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto 18px;
  align-items: center;
  gap: 11px;
  width: 100%;
  border: 1px solid var(--cm-line);
  border-radius: 16px;
  background: #fff;
  color: var(--cm-ink);
  cursor: pointer;
  padding: 14px;
  text-align: left;
  box-shadow: 0 8px 22px rgba(24, 43, 37, .06);
}

.room-card.is-general {
  border-color: rgba(13, 133, 124, .28);
  background: linear-gradient(135deg, rgba(13, 133, 124, .12), #fff);
}

.room-icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 14px;
  background: rgba(13, 133, 124, .1);
  color: var(--cm-primary);
  font-size: 20px;
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
  background: var(--cm-surface);
  color: var(--cm-muted);
  font-size: 12px;
  padding: 5px 8px;
  white-space: nowrap;
}
</style>

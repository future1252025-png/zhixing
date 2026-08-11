<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getBuildingDetail, type Building } from '@/api/buildings'
import {
  getBuildingChatrooms,
  type BuildingChatRoom
} from '@/api/messages'
import TechIcon from '@/components/TechIcon.vue'
import { useAuthStore } from '@/stores/auth'
import { formatBuildingDisplayName } from '@/utils/buildings'
import { rememberRecentChatEntry } from '@/utils/chat'
import { goBack } from '@/utils/navigation'
import { createScopedStorage } from '@/utils/scopedStorage'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const building = ref<Building | null>(null)
const rooms = ref<BuildingChatRoom[]>([])
const loading = ref(true)
const errorMessage = ref('')
const roomQuery = ref('')
const buildingId = computed(() => Number(route.params.id))
const roomCountText = computed(() => {
  const specificRooms = rooms.value.filter((room) => !room.is_general).length
  return specificRooms > 0 ? `${specificRooms} 个教室频道` : '公共地点频道已就绪'
})
const filteredRooms = computed(() => {
  const query = roomQuery.value.trim().toLowerCase()
  if (!query) return rooms.value
  return rooms.value.filter((room) =>
    `${room.name} ${room.room_name ?? ''}`.toLowerCase().includes(query)
  )
})
const canOpenCustomRoom = computed(() => {
  const query = roomQuery.value.trim()
  if (!query) return false
  return !rooms.value.some((room) =>
    room.room_name === query || room.name === query
  )
})

function openRoom(room: BuildingChatRoom) {
  const userId = authStore.currentUser?.id
  if (building.value && typeof window !== 'undefined' && userId) {
    rememberRecentChatEntry(createScopedStorage(userId), {
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
  const userId = authStore.currentUser?.id
  if (!roomName || !building.value) return
  if (userId) {
    rememberRecentChatEntry(createScopedStorage(userId), {
      buildingId: buildingId.value,
      buildingName: building.value.name,
      roomName
    })
  }
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
    errorMessage.value = '地点频道加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

onMounted(loadPage)
</script>

<template>
  <section class="page chatrooms-page">
    <van-nav-bar title="地点频道" left-arrow @click-left="goBack(router, '/home')" />
    <div class="page-content chatrooms-content">
      <div v-if="loading" class="channel-loading" role="status" aria-live="polite">
        <span><i></i><i></i><i></i></span>
        <div><strong>正在看看这里有哪些频道</strong><p>很快就能加入大家的留言...</p></div>
      </div>

      <van-empty v-else-if="errorMessage" image="error" :description="errorMessage">
        <van-button type="primary" size="small" @click="loadPage">重新加载</van-button>
      </van-empty>

      <template v-else>
        <header
          v-reveal="{ from: 'left', distance: 40, stagger: 55 }"
          class="channel-hero"
        >
          <span class="channel-sun" aria-hidden="true"></span>
          <span class="talk-bubbles" aria-hidden="true"><i></i><i></i><i></i></span>
          <span class="fresh-kicker">{{ building?.type || '校园地点' }}</span>
          <h1>{{ building ? formatBuildingDisplayName(building.name) : '地点频道' }}</h1>
          <p>{{ roomCountText }} · 选择一个频道，看看此刻留在这里的话。</p>
          <div class="channel-count">
            <span>可进入频道</span>
            <strong>{{ rooms.length }}</strong>
          </div>
        </header>

        <section v-reveal="{ from: 'right', distance: 36 }" class="room-search fresh-card">
          <div class="fresh-section-heading">
            <div><h2>找一个频道</h2><p>搜索教室名，也可以直接进入自定义教室</p></div>
          </div>
          <van-search
            v-model="roomQuery"
            shape="round"
            placeholder="例如：A203、教4-302"
          />
          <button
            v-if="canOpenCustomRoom"
            type="button"
            class="custom-room"
            @click="openCustomRoom"
          >
            <span><TechIcon name="plus" :size="17" /></span>
            <span><strong>进入“{{ roomQuery.trim() }}”</strong><small>这个教室还没有留言，也可以先进去</small></span>
            <TechIcon name="arrow" :size="18" />
          </button>
        </section>

        <section
          v-reveal="{ from: 'left', distance: 40, stagger: 62 }"
          class="room-list-section"
        >
          <div class="fresh-section-heading">
            <div><h2>{{ roomQuery.trim() ? '搜索结果' : '这里的频道' }}</h2><p>地点频道和教室频道都在这里</p></div>
          </div>

          <div class="room-list">
            <button
              v-for="(room, index) in filteredRooms"
              :key="room.room_name || 'general'"
              type="button"
              :class="{ general: room.is_general }"
              @click="openRoom(room)"
            >
              <span class="room-icon">
                <TechIcon :name="room.is_general ? 'users' : 'chat'" :size="22" />
              </span>
              <span class="room-copy">
                <small>{{ room.is_general ? '大家都在这里' : `教室频道 ${String(index + 1).padStart(2, '0')}` }}</small>
                <strong>{{ room.name }}</strong>
                <span>{{ room.message_count }} 条留言</span>
              </span>
              <span class="room-arrow"><TechIcon name="arrow" :size="18" /></span>
            </button>

            <van-empty v-if="filteredRooms.length === 0" description="没有找到相关频道" />
          </div>
        </section>
      </template>
    </div>
  </section>
</template>

<style scoped>
.chatrooms-page {
  background:
    radial-gradient(circle at 105% 5%, rgba(183, 167, 200, 0.15), transparent 18rem),
    radial-gradient(circle at -12% 58%, rgba(126, 166, 126, 0.11), transparent 19rem);
}

.chatrooms-content {
  display: grid;
  gap: 17px;
}

.channel-loading {
  display: flex;
  min-height: 230px;
  align-items: center;
  justify-content: center;
  gap: 14px;
  border-radius: 28px;
  background: rgba(255, 253, 248, 0.72);
}

.channel-loading > span {
  display: flex;
  gap: 4px;
  align-items: flex-end;
  height: 30px;
}

.channel-loading i {
  width: 7px;
  height: 12px;
  border-radius: var(--radius-pill);
  background: var(--fresh-lilac);
  animation: room-load 850ms ease-in-out infinite alternate;
}

.channel-loading i:nth-child(2) { height: 26px; animation-delay: 150ms; }
.channel-loading i:nth-child(3) { height: 18px; animation-delay: 300ms; }
.channel-loading strong { display: block; color: var(--fresh-ink); font-size: 13px; }
.channel-loading p { margin: 4px 0 0; color: var(--fresh-muted); font-size: 12px; }

.channel-hero {
  position: relative;
  min-height: 250px;
  overflow: hidden;
  border-radius: 34px 34px 26px 34px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.46), transparent 42%),
    #ebe5ee;
  padding: 25px 22px;
  box-shadow: var(--fresh-shadow-soft);
}

.channel-hero::after {
  position: absolute;
  right: -58px;
  bottom: -68px;
  width: 230px;
  height: 155px;
  border-radius: 50%;
  background: rgba(111, 159, 170, 0.11);
  content: "";
  transform: rotate(-12deg);
}

.channel-hero h1 {
  position: relative;
  z-index: 2;
  max-width: 320px;
  margin: 15px 0 0;
  color: var(--fresh-ink);
  font-family: var(--font-serif);
  font-size: clamp(34px, 9vw, 46px);
  line-height: 1.08;
  letter-spacing: -0.05em;
}

.channel-hero > p {
  position: relative;
  z-index: 2;
  max-width: 310px;
  margin: 12px 0 0;
  color: var(--fresh-text);
  font-size: 12px;
  line-height: 1.7;
}

.channel-sun {
  position: absolute;
  top: 29px;
  right: 28px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--fresh-sun);
  box-shadow: 0 0 0 9px rgba(242, 200, 111, 0.12);
  animation: room-sun 4s ease-in-out infinite;
}

.talk-bubbles {
  position: absolute;
  right: 19px;
  bottom: 20px;
  z-index: 2;
  width: 106px;
  height: 83px;
}

.talk-bubbles i {
  position: absolute;
  border-radius: 50% 50% 50% 15%;
  background: rgba(255, 255, 255, 0.55);
  animation: bubble-float 3s ease-in-out infinite alternate;
}

.talk-bubbles i:nth-child(1) { top: 4px; left: 3px; width: 38px; height: 32px; }
.talk-bubbles i:nth-child(2) { right: 0; bottom: 2px; width: 52px; height: 43px; animation-delay: 500ms; }
.talk-bubbles i:nth-child(3) { top: 0; right: 14px; width: 25px; height: 21px; animation-delay: 900ms; }

.channel-count {
  position: absolute;
  bottom: 22px;
  left: 22px;
  z-index: 3;
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.channel-count span { color: var(--fresh-muted); font-size: 13px; font-weight: 600; }
.channel-count strong { color: var(--fresh-ink); font-family: var(--font-serif); font-size: 32px; line-height: 0.8; }

.room-search {
  padding: 18px;
}

.room-search :deep(.van-search) {
  margin-top: 14px;
}

.custom-room {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 9px;
  align-items: center;
  width: 100%;
  min-height: 60px;
  margin-top: 9px;
  border: 1px dashed #a9bfa9;
  border-radius: var(--radius-md);
  background: var(--fresh-mint);
  color: var(--fresh-green-dark);
  cursor: pointer;
  padding: 9px 11px;
  text-align: left;
}

.custom-room > span:first-child {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 50%;
  background: #fff;
}

.custom-room > span:nth-child(2) { display: grid; min-width: 0; gap: 3px; }
.custom-room strong { overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.custom-room small { color: var(--fresh-muted); font-size: 12px; }

.room-list-section {
  display: grid;
  gap: 13px;
}

.room-list {
  display: grid;
  gap: 9px;
}

.room-list > button {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 11px;
  align-items: center;
  min-height: 82px;
  overflow: hidden;
  border: 1px solid var(--fresh-line);
  border-radius: 23px;
  background: var(--fresh-paper);
  color: var(--fresh-ink);
  cursor: pointer;
  padding: 11px 13px 11px 11px;
  text-align: left;
  box-shadow: var(--fresh-shadow-soft);
}

.room-list > button::after {
  position: absolute;
  top: -31px;
  right: -28px;
  width: 92px;
  height: 92px;
  border: 17px solid rgba(111, 159, 170, 0.07);
  border-radius: 50%;
  content: "";
}

.room-list > button.general {
  border-color: rgba(79, 125, 88, 0.14);
  background: var(--fresh-mint);
}

.room-icon {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--fresh-sky);
  color: var(--cm-chat-dark);
  font-size: 20px;
}

.general .room-icon {
  background: rgba(255, 255, 255, 0.65);
  color: var(--fresh-green-dark);
}

.room-copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.room-copy strong { font-size: 15px; }
.room-copy small { color: var(--fresh-muted); font-size: 13px; }
.room-copy strong { overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.room-copy > span { color: #3e6845; font-size: 12px; }

.room-arrow {
  position: relative;
  z-index: 2;
  color: var(--fresh-muted);
}

@keyframes room-load {
  to { transform: scaleY(1.4); }
}

@keyframes room-sun {
  50% { transform: translateY(-5px) scale(1.04); }
}

@keyframes bubble-float {
  to { transform: translateY(-6px) rotate(3deg); }
}

@media (prefers-reduced-motion: reduce) {
  .channel-loading i,
  .channel-sun,
  .talk-bubbles i {
    animation: none;
  }
}
</style>

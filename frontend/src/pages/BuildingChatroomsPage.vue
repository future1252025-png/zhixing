<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getBuildingDetail, type Building } from '@/api/buildings'
import { getBuildingChatrooms, type BuildingChatRoom } from '@/api/messages'
import TechIcon from '@/components/TechIcon.vue'
import { useAuthStore } from '@/stores/auth'
import { formatBuildingDisplayName } from '@/utils/buildings'
import { readRecentChatEntries, rememberRecentChatEntry } from '@/utils/chat'
import { goBack } from '@/utils/navigation'
import { savedRouteView } from '@/utils/routeScroll'
import { createScopedStorage } from '@/utils/scopedStorage'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const building = ref<Building | null>(null)
const rooms = ref<BuildingChatRoom[]>([])
const loading = ref(true)
const errorMessage = ref('')
const viewState = savedRouteView(route.fullPath)
const roomQuery = ref(typeof viewState.roomQuery === 'string' ? viewState.roomQuery : '')
const buildingId = computed(() => Number(route.params.id))
const generalRoom = computed(() => rooms.value.find(room => room.is_general))
const classroomRooms = computed(() => rooms.value.filter(room => !room.is_general))
const normalized = (text: string) => text.normalize('NFKC').trim().toLowerCase()
const filteredRooms = computed(() => classroomRooms.value.filter(room =>
  normalized(room.name + ' ' + (room.room_name ?? '')).includes(normalized(roomQuery.value))))
const existingRoom = computed(() => rooms.value.find(room =>
  [room.name, room.room_name ?? ''].some(name => normalized(name) === normalized(roomQuery.value))))
const canOpenCustomRoom = computed(() => roomQuery.value.trim().length > 0 && roomQuery.value.trim().length <= 120 && !existingRoom.value)
const recentRooms = computed(() => {
  const id = auth.currentUser?.id
  if (!id || !building.value) return []
  return readRecentChatEntries(createScopedStorage(id))
    .filter(entry => entry.buildingId === buildingId.value && entry.roomName)
    .slice(0, 4)
})
let requestVersion = 0

function enterRoom(roomName: string | null) {
  if (!building.value || loading.value) return
  const userId = auth.currentUser?.id
  if (userId) {
    rememberRecentChatEntry(createScopedStorage(userId), {
      buildingId: buildingId.value, buildingName: building.value.name, roomName
    })
  }
  void router.push({
    path: '/buildings/' + buildingId.value + '/messages',
    query: { ...(roomName ? { room_name: roomName } : {}), ...(route.query.from === 'map' ? { from: 'map' } : {}) }
  })
}
function openCustomRoom() {
  if (existingRoom.value) enterRoom(existingRoom.value.room_name)
  else if (canOpenCustomRoom.value) enterRoom(roomQuery.value.trim())
}
function returnToMap() {
  if (route.query.from === 'map') goBack(router, '/map')
  else void router.push({ path: '/map', query: { building: buildingId.value } })
}
async function loadPage() {
  const version = ++requestVersion
  const id = buildingId.value
  loading.value = true; errorMessage.value = ''; building.value = null; rooms.value = []
  if (!Number.isInteger(id) || id <= 0) {
    errorMessage.value = '建筑编号无效'; loading.value = false; return
  }
  try {
    const [nextBuilding, nextRooms] = await Promise.all([getBuildingDetail(id), getBuildingChatrooms(id)])
    if (version !== requestVersion) return
    building.value = nextBuilding; rooms.value = nextRooms
  } catch {
    if (version === requestVersion) errorMessage.value = '地点频道加载失败，请稍后重试'
  } finally {
    if (version === requestVersion) loading.value = false
  }
}
watch(buildingId, (_id, previousId) => {
  if (previousId !== undefined) roomQuery.value = ''
  void loadPage()
}, { immediate: true })
onBeforeUnmount(() => { requestVersion++ })
</script>

<template>
  <section class="page chatrooms-page" :data-route-content-ready="!loading" :data-route-view-state="JSON.stringify({ roomQuery })">
    <van-nav-bar title="地点频道" left-arrow @click-left="route.query.from === 'map' ? returnToMap() : goBack(router, '/home')" />
    <div class="page-content chatrooms-content">
      <div v-if="loading" class="channel-loading" role="status">正在加载这里的频道…</div>
      <van-empty v-else-if="errorMessage" image="error" :description="errorMessage">
        <van-button type="primary" size="small" @click="loadPage">重新加载</van-button>
      </van-empty>
      <template v-else-if="building">
        <header class="channel-hero">
          <span class="channel-building-icon"><TechIcon name="building" :size="27" /></span>
          <div><span class="fresh-kicker">{{ building.type }} · 地点频道</span><h1>{{ formatBuildingDisplayName(building.name) }}</h1><p>把校园里的消息，留在它发生的地方。</p></div>
          <button type="button" class="map-return" @click="returnToMap"><TechIcon name="location" :size="17" />返回地图选楼</button>
        </header>
        <section aria-label="公共频道">
          <button class="general-channel" type="button" @click="enterRoom(null)">
            <span class="channel-room-icon"><TechIcon name="users" :size="25" /></span>
            <span class="room-copy"><small>整栋楼 · 公共交流</small><strong>公共频道</strong><span>{{ generalRoom?.message_count ?? 0 }} 条留言 · 失物、活动与身边事</span></span>
            <TechIcon name="arrow" :size="21" />
          </button>
          <p class="channel-location-note"><TechIcon name="aim" :size="14" />可以先浏览；发布留言时才需要验证你在建筑附近。</p>
        </section>
        <section v-if="recentRooms.length && !roomQuery" class="recent-room-section" aria-label="最近访问的教室">
          <h2>接着上次聊</h2>
          <div><button v-for="entry in recentRooms" :key="entry.roomName!" type="button" @click="enterRoom(entry.roomName)"><TechIcon name="chat" :size="16" />{{ entry.roomName }}</button></div>
        </section>
        <section class="classroom-section">
          <header><div><h2>教室频道</h2><p>进入同一个教室，交流课程与学习</p></div><span>{{ classroomRooms.length }} 个</span></header>
          <form class="room-search" @submit.prevent="openCustomRoom">
            <TechIcon name="search" :size="19" /><input v-model="roomQuery" type="search" maxlength="120" placeholder="搜索教室，例如 A203、教4-302" aria-label="搜索教室频道" />
          </form>
          <div class="room-list">
            <button v-for="room in filteredRooms" :key="room.room_name || room.name" type="button" @click="enterRoom(room.room_name)">
              <span class="channel-room-icon"><TechIcon name="chat" :size="20" /></span>
              <span class="room-copy"><strong>{{ room.name }}</strong><span>{{ room.message_count }} 条留言</span></span>
              <TechIcon name="arrow" :size="18" />
            </button>
          </div>
          <button v-if="canOpenCustomRoom" class="custom-room" type="button" @click="openCustomRoom"><TechIcon name="plus" :size="21" /><span><strong>进入“{{ roomQuery.trim() }}”</strong><small>没有找到？请核对教室名称后进入</small></span><TechIcon name="arrow" :size="18" /></button>
          <p v-if="!filteredRooms.length" class="rooms-empty">{{ roomQuery ? '没有匹配的已有教室频道。' : '这里还没有教室频道。输入教室名即可进入，也可以先去公共频道。' }}</p>
        </section>
      </template>
    </div>
  </section>
</template>

<style scoped>
.chatrooms-page { background: linear-gradient(160deg, #f1f5e9, #f8f7f0 45%, #f3f0f6); }
.chatrooms-content { display: grid; gap: 24px; max-width: 880px; margin: 0 auto; padding-bottom: calc(32px + env(safe-area-inset-bottom)); }
button { font: inherit; color: inherit; cursor: pointer; }
button:focus-visible,input:focus-visible { outline: 2px solid #52734c; outline-offset: 3px; }
.channel-loading { padding: 80px 20px; text-align: center; color: var(--fresh-muted); }
.channel-hero { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 14px; padding: 12px 2px 0; }
.channel-building-icon { display: grid; place-items: center; width: 54px; height: 54px; border: 1px solid #d7e1cd; border-radius: 18px; background: #e7eddd; color: #4d6944; }
.channel-hero h1 { margin: 7px 0 0; color: #354c3a; font-size: clamp(24px, 6vw, 32px); line-height: 1.3; overflow-wrap: anywhere; }
.channel-hero p { margin: 9px 0 0; color: #65735e; font-size: 12px; line-height: 1.7; }
.map-return { grid-column: 2; justify-self: start; display: flex; align-items: center; gap: 6px; padding: 8px 10px; min-height: 44px; border: 1px solid #dce4d3; border-radius: 12px; background: #fffef9; font-size: 12px; color: #50694a; }
.general-channel,.room-list > button { display: flex; align-items: center; gap: 14px; width: 100%; text-align: left; border: 1px solid #d2dfc4; border-radius: 22px; padding: 20px 16px; background: #e6edda; color: #3d5a36; }
.general-channel { box-shadow: 0 8px 24px #41562e09; }
.channel-room-icon { display: grid; place-items: center; flex-shrink: 0; width: 46px; height: 46px; border-radius: 16px; background: #fffef9c9; }
.room-copy { flex: 1; min-width: 0; display: grid; gap: 6px; }
.room-copy strong { font-size: 16px; overflow-wrap: anywhere; }
.room-copy small { font-size: 11px; color: #566d4c; }
.room-copy > span { color: #56674e; font-size: 12px; line-height: 1.6; }
.general-channel .room-copy strong { font-size: 21px; }
.channel-location-note { display: flex; align-items: start; gap: 6px; margin: 12px 4px 0; font-size: 11px; color: #64725e; line-height: 1.7; }
.channel-location-note :deep(svg) { flex-shrink: 0; margin-top: 2px; }
h2 { margin: 0; font-size: 17px; color: #3b4f3b; }
.recent-room-section > div { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.recent-room-section button { display: flex; align-items: center; gap: 7px; min-height: 44px; border: 1px solid #e1d9e8; border-radius: 12px; background: #eee8f3; padding: 9px 13px; font-size: 13px; overflow-wrap: anywhere; max-width: 100%; }
.classroom-section { padding: 20px; border: 1px solid #e3e6db; border-radius: 24px; background: #fffef9; }
.classroom-section > header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.classroom-section > header p { font-size: 12px; color: #6a7561; margin: 7px 0 0; line-height: 1.7; }
.classroom-section > header > span { font-size: 12px; white-space: nowrap; color: #66765b; }
.room-search { display: flex; align-items: center; gap: 10px; margin: 18px 0 14px; padding: 0 12px; border: 1px solid #dfe5d5; border-radius: 13px; background: #f3f5ee; color: #69785f; }
.room-search input { min-width: 0; width: 100%; min-height: 48px; padding: 9px 0; font: inherit; font-size: 16px; border: 0; background: transparent; color: #354c3a; }
.room-list { display: grid; gap: 8px; }
.room-list > button { background: #f9faf5; border-color: #e8ebdf; border-radius: 15px; min-height: 78px; padding: 12px; }
.room-list .channel-room-icon { background: #eaf0e2; width: 40px; height: 40px; }
.custom-room { display: flex; align-items: center; gap: 10px; width: 100%; border: 1px dashed #afbea2; border-radius: 15px; background: #f0f4e9; text-align: left; min-height: 78px; padding: 13px; margin-top: 12px; }
.custom-room > span { flex: 1; display: grid; min-width: 0; gap: 6px; }
.custom-room strong { font-size: 14px; overflow-wrap: anywhere; }
.custom-room small,.rooms-empty { color: #67765e; font-size: 12px; line-height: 1.7; }
.rooms-empty { margin: 18px 3px 3px; }
@media (min-width: 700px) { .room-list { grid-template-columns: 1fr 1fr; } .channel-hero { padding-top: 20px; } }
</style>

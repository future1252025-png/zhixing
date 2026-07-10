<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { animate, stagger } from 'animejs'

import { getBuildings, type Building } from '@/api/buildings'
import { getCourses } from '@/api/courses'
import RealCampusMap from '@/components/RealCampusMap.vue'
import type { Course } from '@/types/course'
import {
  buildChatSearchResults,
  buildNextCourseChatTarget,
  formatChatEntryLabel,
  readRecentChatEntries,
  rememberRecentChatEntry,
  type ChatSearchResult,
  type RecentChatEntry
} from '@/utils/chat'
import { filterCoursesByWeek, findNextCourse, getWeekdayLabel, readSelectedWeek } from '@/utils/course'

const router = useRouter()
const buildings = ref<Building[]>([])
const courses = ref<Course[]>([])
const loading = ref(true)
const errorMessage = ref('')
const chatQuery = ref('')
const recentChats = ref<RecentChatEntry[]>([])
const homeRoot = ref<HTMLElement | null>(null)
const selectedWeek = typeof window === 'undefined' ? 1 : readSelectedWeek(window.localStorage)

const activeCourses = computed(() => filterCoursesByWeek(courses.value, selectedWeek))
const nextCourse = computed(() => findNextCourse(activeCourses.value))
const nextCourseChat = computed(() =>
  nextCourse.value ? buildNextCourseChatTarget(nextCourse.value) : null
)
const chatSearchResults = computed(() =>
  buildChatSearchResults(buildings.value, chatQuery.value, 8)
)
const popularChatBuildings = computed(() => {
  const courseBuildingIds = new Set(activeCourses.value.map((course) => course.building_id))
  const scored = buildings.value.map((building, index) => {
    const text = `${building.name} ${building.type} ${building.description}`.toLowerCase()
    let score = 0
    if (courseBuildingIds.has(building.id)) score += 40
    if (/教|教学|实训|实验/.test(text)) score += 16
    if (/图书|食堂|宿舍|体育/.test(text)) score += 10
    return { building, index, score }
  })
  return scored
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 6)
    .map((item) => item.building)
})
const showSearchResults = computed(() => chatQuery.value.trim().length > 0)

function refreshRecentChats() {
  if (typeof window === 'undefined') {
    recentChats.value = []
    return
  }
  recentChats.value = readRecentChatEntries(window.localStorage)
}

async function loadHomeData() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [buildingResult, courseResult] = await Promise.all([getBuildings(), getCourses()])
    buildings.value = buildingResult
    courses.value = courseResult
    refreshRecentChats()
  } catch {
    errorMessage.value = '首页数据加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function playHomeIntro() {
  if (typeof window === 'undefined' || !homeRoot.value) {
    return
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return
  }
  const items = homeRoot.value.querySelectorAll('.home-motion-item')
  if (!items.length) {
    return
  }
  animate(items, {
    opacity: [0, 1],
    translateY: [12, 0],
    duration: 460,
    delay: stagger(58),
    ease: 'outCubic'
  })
}

async function initializeHome() {
  await loadHomeData()
  await nextTick()
  playHomeIntro()
}

function rememberChat(building: Pick<Building, 'id' | 'name'>, roomName: string | null = null) {
  if (typeof window === 'undefined') {
    return
  }
  recentChats.value = rememberRecentChatEntry(window.localStorage, {
    buildingId: building.id,
    buildingName: building.name,
    roomName
  })
}

function openBuildingChat(building: Pick<Building, 'id' | 'name'>, roomName: string | null = null) {
  rememberChat(building, roomName)
  if (roomName) {
    router.push({
      path: `/buildings/${building.id}/messages`,
      query: { room_name: roomName }
    })
    return
  }
  router.push(`/buildings/${building.id}/chats`)
}

function openNextCourseChat() {
  const target = nextCourseChat.value
  if (!target) {
    router.push('/courses/import')
    return
  }
  openBuildingChat(
    {
      id: target.buildingId,
      name: target.buildingName
    },
    target.roomName
  )
}

function openSearchResult(result: ChatSearchResult) {
  openBuildingChat(result.building, result.roomName)
}

function openRecentChat(entry: RecentChatEntry) {
  openBuildingChat(
    {
      id: entry.buildingId,
      name: entry.buildingName
    },
    entry.roomName
  )
}

function openBuilding(buildingId: number) {
  const building = buildings.value.find((item) => item.id === buildingId)
  if (building) {
    openBuildingChat(building)
    return
  }
  router.push(`/buildings/${buildingId}/chats`)
}

onMounted(initializeHome)
</script>

<template>
  <section class="page home-page">
    <van-nav-bar title="校园会话" />
    <div ref="homeRoot" class="page-content home-content">
      <section class="chat-hero home-motion-item">
        <div class="hero-copy-block">
          <span>建筑聊天室</span>
          <h1>把校园地点变成频道。</h1>
          <p>建筑总聊、教室频道和课程地点会话都在这里。</p>
        </div>
        <div class="hero-channel-preview" aria-hidden="true">
          <i></i><i></i><i></i>
        </div>
        <button type="button" @click="openNextCourseChat">
          <van-icon name="chat-o" />
          <strong>{{ nextCourseChat ? '进入下一节课会话' : '导入课表开启课程会话' }}</strong>
        </button>
      </section>

      <section class="next-chat-card home-motion-item">
        <template v-if="nextCourse && nextCourseChat">
          <div>
            <span>第 {{ selectedWeek }} 周 · {{ getWeekdayLabel(nextCourse.weekday) }} · {{ nextCourse.start_time }}</span>
            <h2>{{ nextCourseChat.title }}</h2>
            <p>{{ nextCourseChat.subtitle }}</p>
          </div>
          <button type="button" @click="openNextCourseChat">进教室聊</button>
        </template>
        <template v-else>
          <div>
            <span>课程会话</span>
            <h2>还没有下一节课</h2>
            <p>导入课表后，可以从首页直达课程所在教室聊天室。</p>
          </div>
          <button type="button" @click="router.push('/courses/import')">导入课表</button>
        </template>
      </section>

      <nav class="home-action-row home-motion-item" aria-label="快捷操作">
        <button type="button" @click="router.push('/courses/import')">
          <van-icon name="description" />
          <span><strong>导入课表</strong><small>生成教室会话</small></span>
        </button>
        <button type="button" @click="router.push('/schedule')">
          <van-icon name="guide-o" />
          <span><strong>出发建议</strong><small>从会话到路线</small></span>
        </button>
        <button type="button" @click="router.push('/courses')">
          <van-icon name="notes-o" />
          <span><strong>本周课表</strong><small>第 {{ selectedWeek }} 周</small></span>
        </button>
      </nav>

      <section v-reveal class="chat-search-panel">
        <div class="section-heading">
          <div>
            <h2 class="section-title">找会话</h2>
            <p class="section-subtitle">直接搜建筑或教室，例如：教4、教4-203、图书馆</p>
          </div>
        </div>
        <van-search
          v-model="chatQuery"
          placeholder="搜索建筑、教室、地点"
          shape="round"
          background="transparent"
        />

        <div v-if="showSearchResults" class="chat-result-list">
          <button
            v-for="result in chatSearchResults"
            :key="`${result.building.id}-${result.roomName || 'general'}`"
            type="button"
            @click="openSearchResult(result)"
          >
            <span>
              <strong>{{ result.roomName || result.building.name }}</strong>
              <small>{{ result.roomName ? `${result.building.name} · 教室频道` : `${result.building.type} · 建筑总聊` }}</small>
            </span>
            <b>进入会话</b>
          </button>
          <van-empty v-if="chatSearchResults.length === 0" description="没有找到相关会话" />
        </div>
      </section>

      <section v-if="recentChats.length" v-reveal="{ delay: 45 }" class="chat-strip-section">
        <div class="section-heading">
          <div>
            <h2 class="section-title">最近访问</h2>
            <p class="section-subtitle">常用建筑和教室不用再找一遍</p>
          </div>
        </div>
        <div class="chat-strip" aria-label="最近会话">
          <button
            v-for="entry in recentChats"
            :key="`${entry.buildingId}-${entry.roomName || 'general'}`"
            type="button"
            @click="openRecentChat(entry)"
          >
            <van-icon name="chat-o" />
            <span>{{ formatChatEntryLabel(entry) }}</span>
          </button>
        </div>
      </section>

      <section v-reveal="{ delay: 70 }" class="chat-strip-section">
        <div class="section-heading">
          <div>
            <h2 class="section-title">热门会话</h2>
            <p class="section-subtitle">先从常用教学楼和校园地点开始</p>
          </div>
          <span>{{ buildings.length }} 个地点</span>
        </div>
        <div class="popular-chat-grid">
          <button
            v-for="building in popularChatBuildings"
            :key="building.id"
            type="button"
            @click="openBuildingChat(building)"
          >
            <small>{{ building.type }}</small>
            <strong>{{ building.name }}</strong>
            <span>建筑总聊 / 教室频道</span>
          </button>
        </div>
      </section>

      <section v-reveal="{ delay: 90 }" class="home-map-section">
        <div class="section-heading">
          <div>
            <h2 class="section-title">会话地图</h2>
            <p class="section-subtitle">点击地图里的建筑，直接进入建筑会话</p>
          </div>
        </div>
        <RealCampusMap
          v-if="!loading && buildings.length"
          :buildings="buildings"
          title=""
          subtitle=""
          height="430px"
          selected-action-text="进入会话"
          @building-click="openBuilding"
        />
        <p v-if="loading" class="muted-text map-loading">正在加载校园地图...</p>
        <van-empty v-else-if="errorMessage" image="error" :description="errorMessage">
          <van-button type="primary" size="small" @click="loadHomeData">重试</van-button>
        </van-empty>
        <van-empty v-else-if="!buildings.length" description="暂无建筑数据" />
      </section>
    </div>
  </section>
</template>

<style scoped>
.home-content {
  display: grid;
  gap: 16px;
}

.chat-hero {
  position: relative;
  overflow: hidden;
  display: grid;
  gap: 18px;
  border: 1px solid rgba(10, 125, 115, 0.18);
  border-radius: var(--cm-radius);
  background:
    linear-gradient(90deg, rgba(10, 125, 115, 0.065) 1px, transparent 1px) 0 0 / 26px 26px,
    linear-gradient(135deg, #f8fdf9 0%, #e8f5ee 58%, #e8f2fa 100%);
  color: var(--cm-ink);
  padding: 20px;
  box-shadow: 0 18px 42px rgba(30, 68, 55, 0.11);
}

.chat-hero::after {
  position: absolute;
  right: 18px;
  bottom: 20px;
  width: 118px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(10, 125, 115, 0.66), rgba(67, 135, 199, 0.62), rgba(242, 184, 75, 0.82));
  content: "";
}

.hero-copy-block {
  position: relative;
  z-index: 1;
  max-width: 360px;
}

.chat-hero span,
.next-chat-card span {
  color: var(--cm-primary);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
}

.chat-hero h1 {
  margin: 10px 0 8px;
  font-size: 28px;
  line-height: 1.14;
}

.chat-hero p {
  margin: 0;
  color: var(--cm-muted);
  font-size: 14px;
  line-height: 1.65;
}

.hero-channel-preview {
  position: absolute;
  right: 18px;
  top: 18px;
  display: grid;
  gap: 7px;
  width: 82px;
}

.hero-channel-preview i {
  display: block;
  height: 8px;
  border-radius: 999px;
  background: rgba(10, 125, 115, 0.14);
}

.hero-channel-preview i:nth-child(1) {
  width: 62px;
}

.hero-channel-preview i:nth-child(2) {
  width: 82px;
  background: rgba(67, 135, 199, 0.24);
}

.hero-channel-preview i:nth-child(3) {
  width: 48px;
  justify-self: end;
}

.chat-hero button,
.next-chat-card button {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: var(--cm-radius);
  background: var(--cm-primary);
  color: #fff;
  box-shadow: 0 10px 24px rgba(10, 125, 115, 0.18);
  cursor: pointer;
  font-size: 14px;
  font-weight: 800;
  padding: 11px 13px;
  transition:
    transform var(--cm-motion),
    background var(--cm-motion),
    color var(--cm-motion);
}

.chat-hero button:active,
.next-chat-card button:active,
.home-action-row button:active,
.chat-result-list button:active,
.chat-strip button:active,
.popular-chat-grid button:active {
  transform: translateY(1px);
}

.next-chat-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--cm-line);
  border-left: 5px solid var(--cm-chat);
  border-radius: var(--cm-radius);
  background: var(--cm-surface);
  padding: 15px;
  box-shadow: var(--cm-shadow);
}

.next-chat-card h2 {
  margin: 7px 0 4px;
  font-size: 21px;
  line-height: 1.2;
}

.next-chat-card p {
  margin: 0;
  color: var(--cm-muted);
  font-size: 13px;
  line-height: 1.5;
}

.next-chat-card button {
  border: 1px solid rgba(88, 101, 242, .18);
  background: var(--cm-chat-soft);
  color: var(--cm-chat-dark);
  white-space: nowrap;
}

.home-action-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid var(--cm-line);
  border-radius: var(--cm-radius);
  background: var(--cm-card);
  box-shadow: 0 8px 24px rgba(28, 50, 42, 0.05);
}

.home-action-row button {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  color: var(--cm-ink);
  cursor: pointer;
  padding: 13px 10px;
  text-align: left;
  transition:
    background var(--cm-motion),
    transform var(--cm-motion);
}

.home-action-row button:hover {
  background: var(--cm-surface-muted);
}

.home-action-row button + button {
  border-left: 1px solid var(--cm-line);
}

.home-action-row .van-icon {
  flex: 0 0 auto;
  color: var(--cm-chat);
  font-size: 21px;
}

.home-action-row span {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.home-action-row strong,
.home-action-row small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-action-row strong {
  font-size: 12px;
}

.home-action-row small {
  color: var(--cm-muted);
  font-size: 9px;
}

.chat-search-panel,
.chat-strip-section {
  display: grid;
  gap: 12px;
  border: 1px solid var(--cm-line);
  border-radius: var(--cm-radius);
  background: var(--cm-surface);
  padding: 14px;
  box-shadow: 0 8px 24px rgba(28, 50, 42, 0.05);
}

.chat-search-panel :deep(.van-search) {
  padding: 0;
}

.chat-search-panel :deep(.van-search__content) {
  align-items: center;
  min-height: 50px;
  border: 1px solid var(--cm-line);
  background: #fff;
  padding: 0 12px;
}

.chat-search-panel :deep(.van-field__left-icon) {
  display: flex;
  align-items: center;
}

.chat-result-list {
  display: grid;
  gap: 8px;
}

.chat-result-list button,
.chat-strip button,
.popular-chat-grid button {
  border: 1px solid var(--cm-line);
  background: #fff;
  color: var(--cm-ink);
  cursor: pointer;
  text-align: left;
  transition:
    border-color var(--cm-motion),
    box-shadow var(--cm-motion),
    transform var(--cm-motion),
    background var(--cm-motion);
}

.chat-result-list button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  border-radius: var(--cm-radius);
  padding: 13px;
}

.chat-result-list button:hover,
.popular-chat-grid button:hover {
  border-color: rgba(88, 101, 242, 0.24);
  box-shadow: 0 10px 24px rgba(28, 50, 42, 0.08);
}

.chat-result-list span,
.popular-chat-grid button {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.chat-result-list strong,
.popular-chat-grid strong {
  overflow: hidden;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-result-list small,
.popular-chat-grid small,
.popular-chat-grid span {
  color: var(--cm-muted);
  font-size: 12px;
}

.chat-result-list b {
  border-radius: var(--cm-radius-sm);
  background: var(--cm-chat-soft);
  color: var(--cm-chat-dark);
  font-size: 12px;
  padding: 6px 9px;
  white-space: nowrap;
}

.chat-strip {
  display: flex;
  gap: 9px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.chat-strip button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
  max-width: 230px;
  border-radius: var(--cm-radius);
  padding: 10px 12px;
}

.chat-strip span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.popular-chat-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.popular-chat-grid button {
  min-height: 98px;
  border-radius: var(--cm-radius);
  padding: 14px;
  box-shadow: 0 8px 22px rgba(24, 43, 37, .05);
}

.popular-chat-grid button:nth-child(3n + 1) {
  border-color: rgba(13, 133, 124, .28);
  background: linear-gradient(135deg, rgba(13, 133, 124, .1), #fff);
}

.popular-chat-grid button:nth-child(3n + 2) {
  border-color: rgba(242, 184, 75, .34);
  background: linear-gradient(135deg, rgba(242, 184, 75, .14), #fff);
}

.popular-chat-grid button:nth-child(3n) {
  border-color: rgba(88, 101, 242, .24);
  background: linear-gradient(135deg, rgba(88, 101, 242, .1), #fff);
}

.section-heading > span {
  color: var(--cm-primary);
  font-size: 12px;
  font-weight: 700;
}

.map-loading {
  padding: 40px 0;
  text-align: center;
}

.home-map-section {
  border: 1px solid var(--cm-line);
  border-radius: var(--cm-radius);
  background: var(--cm-surface);
  padding: 14px;
  box-shadow: 0 8px 24px rgba(28, 50, 42, 0.05);
}

@media (max-width: 360px) {
  .home-action-row {
    grid-template-columns: 1fr;
  }

  .home-action-row button + button {
    border-top: 1px solid var(--cm-line);
    border-left: 0;
  }

  .next-chat-card,
  .popular-chat-grid {
    grid-template-columns: 1fr;
  }
}
</style>

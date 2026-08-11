<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { showFailToast } from 'vant'
import { useRouter } from 'vue-router'

import type { Building } from '@/api/buildings'
import RealCampusMap from '@/components/RealCampusMap.vue'
import TechIcon from '@/components/TechIcon.vue'
import CourseCard from '@/components/course/CourseCard.vue'
import SemesterGate from '@/components/course/SemesterGate.vue'
import { useAuthStore } from '@/stores/auth'
import { useBuildingsStore } from '@/stores/buildings'
import { useCoursesStore } from '@/stores/courses'
import { useSemesterStore } from '@/stores/semester'
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
import {
  filterCoursesByWeek,
  findNextCourse
} from '@/utils/course'
import { formatBuildingDisplayName } from '@/utils/buildings'
import { createScopedStorage } from '@/utils/scopedStorage'
import {
  consumeLoginIntroFlag,
  consumeLoginIntroSnapshot,
  type LoginIntroSnapshot
} from '@/utils/loginIntro'

const router = useRouter()
const authStore = useAuthStore()
const buildingsStore = useBuildingsStore()
const coursesStore = useCoursesStore()
const semesterStore = useSemesterStore()
const buildings = ref<Building[]>([])
const courses = ref<Course[]>([])
const loading = ref(true)
const errorMessage = ref('')
const chatQuery = ref('')
const recentChats = ref<RecentChatEntry[]>([])
const loginWelcomeVisible = ref(false)
const loginWelcomeSnapshot = ref<LoginIntroSnapshot | null>(null)
let loginWelcomeTimer: number | null = null
const todayLabel = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'short'
}).format(new Date())

const currentWeek = computed(() =>
  semesterStore.semester?.status === 'active'
    ? semesterStore.semester.current_week
    : null
)
const activeCourses = computed(() =>
  currentWeek.value === null
    ? []
    : filterCoursesByWeek(courses.value, currentWeek.value)
)
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
  const userId = authStore.currentUser?.id
  if (typeof window === 'undefined' || !userId) {
    recentChats.value = []
    return
  }
  recentChats.value = readRecentChatEntries(createScopedStorage(userId))
}

async function loadHomeData() {
  loading.value = true
  errorMessage.value = ''
  const userId = authStore.currentUser?.id
  if (!userId) {
    errorMessage.value = '登录信息尚未加载完成，请重新进入首页'
    loading.value = false
    return
  }
  try {
    const [buildingResult, courseResult] = await Promise.all([
      buildingsStore.ensureLoaded(),
      coursesStore.ensureLoaded(),
      semesterStore.load(userId)
    ])
    buildings.value = buildingResult
    courses.value = courseResult
    refreshRecentChats()
  } catch {
    errorMessage.value = '校园数据暂时没有加载出来，请稍后重试'
  } finally {
    loading.value = false
  }
}

async function initializeHome() {
  const hasLoginIntro = consumeLoginIntroFlag()
  loginWelcomeSnapshot.value = consumeLoginIntroSnapshot()
  if (hasLoginIntro) {
    loginWelcomeVisible.value = true
    loginWelcomeTimer = window.setTimeout(() => {
      loginWelcomeVisible.value = false
      loginWelcomeTimer = null
    }, 3600)
  }
  await loadHomeData()
}

function dismissLoginWelcome() {
  if (loginWelcomeTimer !== null) {
    window.clearTimeout(loginWelcomeTimer)
    loginWelcomeTimer = null
  }
  loginWelcomeVisible.value = false
}

// 欢迎卡不只是提示：有课程快照时点按直达当天课表
function handleWelcomeTap() {
  const hasSnapshot = loginWelcomeSnapshot.value !== null
  dismissLoginWelcome()
  if (hasSnapshot) {
    router.push('/courses')
  }
}

function rememberChat(building: Pick<Building, 'id' | 'name'>, roomName: string | null = null) {
  const userId = authStore.currentUser?.id
  if (typeof window === 'undefined' || !userId) return
  recentChats.value = rememberRecentChatEntry(createScopedStorage(userId), {
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
  if (!target.buildingId || !target.buildingName) {
    showFailToast('这个上课地点还未匹配校园地图，请先补全地点后再打开')
    if (nextCourse.value) openCourseEdit(nextCourse.value.id)
    return
  }
  openBuildingChat({ id: target.buildingId, name: target.buildingName }, target.roomName)
}

function openCourseEdit(courseId: number) {
  router.push(`/courses/${courseId}/edit`)
}

function openSearchResult(result: ChatSearchResult) {
  openBuildingChat(result.building, result.roomName)
}

function openRecentChat(entry: RecentChatEntry) {
  openBuildingChat({ id: entry.buildingId, name: entry.buildingName }, entry.roomName)
}

function openQuickChannels() {
  const latest = recentChats.value[0]
  if (latest) {
    openRecentChat(latest)
    return
  }
  // 还没聊过：带用户到常去处板块，那里每张卡都是频道入口
  document.querySelector('.places-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
onUnmounted(() => {
  if (loginWelcomeTimer !== null) window.clearTimeout(loginWelcomeTimer)
})
</script>

<template>
  <section class="page home-page">
    <div class="page-content home-content">
      <header class="home-top home-motion-item">
        <div class="home-brand">
          <span><i></i><i></i></span>
          <div>
            <strong>智行</strong>
            <small>让校园日常简单一点</small>
          </div>
        </div>
        <time>{{ todayLabel }}</time>
      </header>

      <Transition name="login-welcome">
        <div v-if="loginWelcomeVisible" class="login-welcome-shell">
          <button
            type="button"
            class="login-welcome"
            aria-live="polite"
            @click="handleWelcomeTap"
          >
            <span class="login-welcome__path" aria-hidden="true"><i></i></span>
            <div>
              <small>登录成功 · 校园路线已接上</small>
              <strong>{{ loginWelcomeSnapshot?.courseName || '欢迎回来，慢慢开始今天' }}</strong>
              <p v-if="loginWelcomeSnapshot">
                {{ loginWelcomeSnapshot.startTime }} · {{ [loginWelcomeSnapshot.buildingName, loginWelcomeSnapshot.roomName].filter(Boolean).join(' · ') }} · 点我看课表
              </p>
              <p v-else>课表、地点和出发建议已经准备好了。</p>
            </div>
          </button>
        </div>
      </Transition>

      <div v-if="loading" class="home-semester-loading fresh-card" aria-live="polite">
        <span><i></i><i></i><i></i></span>
        <p>正在对齐真实教学周...</p>
      </div>

      <van-empty v-else-if="errorMessage || !semesterStore.semester" image="error" :description="errorMessage || '学期状态暂时不可用'">
        <van-button type="primary" size="small" @click="loadHomeData">重新加载</van-button>
      </van-empty>

      <SemesterGate
        v-else
        :status="semesterStore.semester.status"
        :current-week="currentWeek"
      >
        <section class="today-card home-motion-item">
          <span class="sun-spot" aria-hidden="true"></span>
          <span class="leaf-cluster leaf-cluster-a" aria-hidden="true"><i></i><i></i><i></i></span>
          <span class="leaf-cluster leaf-cluster-b" aria-hidden="true"><i></i><i></i></span>

          <div class="today-copy">
            <span class="fresh-kicker">今天的下一站</span>
            <p>真实第 {{ currentWeek }} 周</p>
            <template v-if="nextCourse && nextCourseChat">
              <CourseCard
                class="home-next-course"
                :course="nextCourse"
                compact
                @select="openNextCourseChat"
                @edit="openCourseEdit"
              />
            </template>
            <template v-else>
              <h1>今天还没有安排</h1>
              <strong>给自己留一点自由时间</strong>
              <small>本周有新课程时，下一节课会出现在这里。</small>
            </template>
          </div>

          <div class="walking-line" aria-hidden="true">
            <svg viewBox="0 0 330 80">
              <path d="M5 59C70 10 97 72 159 41S247 16 325 43" pathLength="1" />
            </svg>
            <i></i><i></i>
          </div>

          <button type="button" class="today-action" @click="openNextCourseChat">
            <span>{{ nextCourseChat ? '进入地点频道' : '导入我的课表' }}</span>
            <TechIcon name="arrow" :size="19" />
          </button>
        </section>
      </SemesterGate>

      <nav
        v-reveal="{ from: 'right', distance: 34, stagger: 70 }"
        class="quick-notes"
        aria-label="快捷操作"
      >
        <button type="button" class="note note-lilac" @click="openQuickChannels">
          <span><TechIcon name="chat" :size="21" /></span>
          <strong>地点频道</strong>
          <small>{{ recentChats.length ? '回到上次聊过的' : '挑个地点聊聊' }}</small>
        </button>
        <button type="button" class="note note-green" @click="router.push('/courses/import')">
          <span><TechIcon name="upload" :size="21" /></span>
          <strong>导入课表</strong>
          <small>一次整理好本学期</small>
        </button>
        <button type="button" class="note note-blue" @click="router.push('/schedule')">
          <span><TechIcon name="route" :size="21" /></span>
          <strong>准备出发</strong>
          <small>看看什么时候动身</small>
        </button>
        <button type="button" class="note note-yellow" @click="router.push('/courses')">
          <span><TechIcon name="calendar" :size="21" /></span>
          <strong>本周课表</strong>
          <small>{{ activeCourses.length }} 门课程</small>
        </button>
      </nav>

      <section
        v-reveal="{ from: 'left', distance: 38 }"
        class="search-sheet fresh-card"
      >
        <div class="fresh-section-heading">
          <div>
            <h2>想去哪里看看？</h2>
            <p>搜地点或教室，直接进对应频道</p>
          </div>
          <span class="search-flower" aria-hidden="true"><i></i><i></i><i></i></span>
        </div>
        <van-search
          v-model="chatQuery"
          placeholder="例如：教4、图书馆、A203"
          shape="round"
          background="transparent"
        />

        <div v-if="showSearchResults" class="search-results">
          <button
            v-for="result in chatSearchResults"
            :key="`${result.building.id}-${result.roomName || 'general'}`"
            type="button"
            @click="openSearchResult(result)"
          >
            <span class="place-mark"><i></i></span>
            <span>
              <strong>{{ result.roomName || formatBuildingDisplayName(result.building.name) }}</strong>
              <small>
                {{ result.roomName ? `${formatBuildingDisplayName(result.building.name)} · 教室频道` : `${result.building.type} · 地点频道` }}
              </small>
            </span>
            <TechIcon name="arrow" :size="17" />
          </button>
          <van-empty v-if="chatSearchResults.length === 0" description="没有找到相关地点" />
        </div>
      </section>

      <section
        v-if="recentChats.length"
        v-reveal="{ from: 'right', distance: 36, stagger: 55 }"
        class="recent-section"
      >
        <div class="fresh-section-heading">
          <div><h2>最近去过</h2><p>常用的地点放在手边</p></div>
        </div>
        <div class="recent-row">
          <button
            v-for="entry in recentChats"
            :key="`${entry.buildingId}-${entry.roomName || 'general'}`"
            type="button"
            @click="openRecentChat(entry)"
          >
            <span><TechIcon name="location" :size="16" /></span>
            <strong>{{ formatChatEntryLabel(entry) }}</strong>
          </button>
        </div>
      </section>

      <section
        v-reveal="{ from: 'left', distance: 40, stagger: 60 }"
        class="places-section"
      >
        <div class="fresh-section-heading">
          <div><h2>校园里的常去处</h2><p>点一下，进这个地点的频道聊聊</p></div>
          <span>{{ buildings.length }} 个地点</span>
        </div>

        <div class="place-grid">
          <button
            v-for="(building, index) in popularChatBuildings"
            :key="building.id"
            type="button"
            :class="`place-tone-${index % 4}`"
            @click="openBuildingChat(building)"
          >
            <span class="place-index">{{ String(index + 1).padStart(2, '0') }}</span>
            <small>{{ building.type }}</small>
            <strong>{{ formatBuildingDisplayName(building.name) }}</strong>
            <span class="place-enter"><TechIcon name="chat" :size="14" /> 进频道聊聊 <TechIcon name="arrow" :size="15" /></span>
          </button>
        </div>
      </section>

      <section v-reveal="{ from: 'right', distance: 42 }" class="map-section">
        <div class="fresh-section-heading">
          <div><h2>沿着地图去发现</h2><p>点一下建筑，就能进入地点频道</p></div>
        </div>
        <div class="map-sheet fresh-card">
          <RealCampusMap
            v-if="!loading && buildings.length"
            :buildings="buildings"
            title=""
            subtitle=""
            height="430px"
            selected-action-text="进频道"
            @building-click="openBuilding"
          />
          <div v-if="loading" class="home-loading">
            <span><i></i><i></i><i></i></span>
            <p>正在铺开校园地图...</p>
          </div>
          <van-empty v-else-if="errorMessage" image="error" :description="errorMessage">
            <van-button type="primary" size="small" @click="loadHomeData">重新加载</van-button>
          </van-empty>
          <van-empty v-else-if="!buildings.length" description="暂时还没有地点数据" />
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.home-page {
  background:
    radial-gradient(circle at 110% 4%, rgba(146, 177, 133, 0.18), transparent 20rem),
    radial-gradient(circle at -15% 46%, rgba(111, 159, 170, 0.1), transparent 18rem);
}

.home-content {
  display: grid;
  gap: 19px;
  padding-top: 16px;
}

/* 进场动效统一为纯 CSS（原 animejs 时间线）：插入即播，数据到达后不再二次闪现 */
.home-motion-item {
  animation: home-arrive 680ms var(--fresh-spring) both;
}

.today-card.home-motion-item {
  animation-delay: 76ms;
}

@keyframes home-arrive {
  from {
    opacity: 0;
    transform: translateY(18px) rotate(-0.7deg);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

.home-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 43px;
  padding: 0 3px;
}

.home-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.home-brand > span {
  position: relative;
  width: 34px;
  height: 34px;
  border-radius: 12px 15px 10px 15px;
  background: var(--fresh-green);
  transform: rotate(-5deg);
}

.home-brand > span i {
  position: absolute;
  width: 10px;
  height: 17px;
  border-radius: 100% 0 100% 0;
  background: var(--fresh-mint);
}

.home-brand > span i:first-child { top: 4px; left: 6px; }
.home-brand > span i:last-child { right: 5px; bottom: 4px; transform: rotate(83deg); }

.home-brand > div {
  display: grid;
}

.home-brand strong {
  color: var(--fresh-ink);
  font-size: 18px;
}

.home-brand small,
.home-top time {
  color: var(--fresh-muted);
  font-size: 12px;
}

.home-top time {
  border-radius: var(--radius-pill);
  background: rgba(255, 253, 248, 0.74);
  padding: 7px 10px;
}

.today-card {
  position: relative;
  min-height: 360px;
  overflow: hidden;
  border-radius: 34px 34px 26px 34px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.42), transparent 42%),
    var(--fresh-mint);
  padding: 26px 23px 22px;
  box-shadow: 0 22px 55px rgba(66, 96, 65, 0.13);
}

.today-card::after {
  position: absolute;
  right: -54px;
  bottom: -77px;
  width: 250px;
  height: 180px;
  border-radius: 50%;
  background: rgba(111, 159, 170, 0.12);
  content: "";
  transform: rotate(-12deg);
}

.today-copy {
  position: relative;
  z-index: 2;
  max-width: 370px;
}

.login-welcome {
  position: relative;
  display: grid;
  width: 100%;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  overflow: hidden;
  border: 1px solid var(--fresh-line);
  border-radius: 21px 21px 17px 21px;
  background: var(--fresh-mint);
  box-shadow: 0 12px 30px rgba(55, 81, 57, .09);
  color: var(--fresh-ink);
  cursor: pointer;
  font: inherit;
  padding: 14px 15px;
  text-align: left;
}

.login-welcome__path {
  position: relative;
  display: block;
  width: 42px;
  height: 42px;
  border: 2px dashed var(--fresh-leaf);
  border-radius: 50%;
}

.login-welcome__path::before,
.login-welcome__path::after {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--fresh-green);
  content: '';
}
.login-welcome__path::before { top: -4px; left: 15px; }
.login-welcome__path::after { right: -4px; bottom: 12px; background: var(--cm-chat-dark); }
.login-welcome__path i {
  position: absolute;
  top: 13px;
  left: 13px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 0 4px rgba(79, 125, 88, .13);
  animation: welcome-pulse 1.15s ease-in-out infinite alternate;
}
.login-welcome > div { position: relative; z-index: 1; display: grid; min-width: 0; gap: 3px; }
.login-welcome small { color: var(--fresh-green-dark); font-size: 12px; font-weight: 700; }
.login-welcome strong { color: var(--fresh-ink); font-size: 15px; line-height: 1.45; overflow-wrap: anywhere; }
.login-welcome p { margin: 0; color: var(--fresh-text); font-size: 12px; line-height: 1.55; overflow-wrap: anywhere; }

/* 收起时用 grid-template-rows 1fr→0fr 平滑塌高度，首页内容不再猛跳 */
.login-welcome-shell {
  display: grid;
  grid-template-rows: 1fr;
}

.login-welcome-shell .login-welcome {
  min-height: 0;
  cursor: pointer;
}

.login-welcome-enter-active,
.login-welcome-leave-active {
  transition:
    opacity 420ms ease,
    transform 480ms var(--fresh-spring),
    grid-template-rows 460ms var(--fresh-spring);
}
.login-welcome-enter-from { opacity: 0; transform: translateX(32px) rotate(.5deg); }
.login-welcome-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
  transform: translateX(-14px);
}

@keyframes welcome-pulse {
  to { transform: scale(1.18); }
}

.home-next-course {
  width: min(100%, 350px);
  margin-top: 14px;
  box-shadow: 0 12px 28px rgba(57, 84, 58, .11);
}

.today-copy p {
  margin: 16px 0 0;
  color: var(--fresh-text);
  font-size: 12px;
}

.today-copy h1 {
  max-width: 330px;
  margin: 7px 0 0;
  color: var(--fresh-ink);
  font-family: var(--font-serif);
  font-size: clamp(30px, 8vw, 43px);
  font-weight: 700;
  line-height: 1.12;
  letter-spacing: -0.045em;
}

.today-location {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  width: min(100%, 315px);
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  border: 1px solid rgba(79, 125, 88, 0.13);
  border-radius: var(--fresh-radius-sm);
  background: rgba(255, 253, 248, 0.66);
  padding: 10px 12px;
}

.location-pin {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 13px;
  background: var(--fresh-paper);
  color: var(--fresh-green-dark);
  font-size: 18px;
  box-shadow: 0 5px 13px rgba(57, 84, 58, 0.08);
}

.today-location > span:last-child {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.today-location small {
  color: var(--fresh-muted);
  font-size: 12px;
  font-weight: 600;
}

.today-location strong {
  color: var(--fresh-green-dark);
  font-size: 16px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.today-location em {
  color: var(--fresh-text);
  font-size: 13px;
  font-style: normal;
  font-weight: 700;
}

.sun-spot {
  position: absolute;
  top: 29px;
  right: 28px;
  width: 43px;
  height: 43px;
  border-radius: 50%;
  background: var(--fresh-sun);
  box-shadow: 0 0 0 12px rgba(242, 200, 111, 0.13);
  animation: sun-float 4.2s ease-in-out infinite;
}

.leaf-cluster {
  position: absolute;
  z-index: 1;
  display: flex;
  gap: 2px;
}

.leaf-cluster i {
  width: 17px;
  height: 30px;
  border-radius: 100% 0 100% 0;
  background: rgba(91, 134, 91, 0.38);
  transform: rotate(-37deg);
}

.leaf-cluster-a { right: 12px; bottom: 53px; transform: rotate(-16deg); }
.leaf-cluster-b { top: 111px; right: 3px; transform: scale(0.7) rotate(35deg); }

.walking-line {
  position: absolute;
  right: 10px;
  bottom: 55px;
  left: 10px;
  z-index: 1;
  height: 92px;
}

.walking-line svg {
  width: 100%;
  height: 100%;
  overflow: visible;
  fill: none;
}

.walking-line path {
  stroke: rgba(60, 100, 69, 0.55);
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  stroke-linecap: round;
  stroke-width: 2;
  animation: trail-grow 1.45s 450ms var(--fresh-spring) forwards;
}

.walking-line i {
  position: absolute;
  width: 9px;
  height: 9px;
  border: 3px solid var(--fresh-mint);
  border-radius: 50%;
  background: var(--fresh-green);
}

.walking-line i:first-of-type { bottom: 21px; left: 19%; }
.walking-line i:last-of-type { top: 22px; right: 17%; background: var(--fresh-blue); }

.today-action {
  position: absolute;
  right: 20px;
  bottom: 18px;
  left: 20px;
  z-index: 3;
  display: flex;
  min-height: 50px;
  align-items: center;
  justify-content: space-between;
  border: 0;
  border-radius: var(--fresh-radius-sm);
  background: var(--fresh-green-dark);
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  padding: 0 17px;
  box-shadow: 0 12px 24px rgba(49, 91, 59, 0.2);
}

.quick-notes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}

.note {
  display: grid;
  min-width: 0;
  min-height: 133px;
  align-content: space-between;
  gap: 6px;
  border: 0;
  border-radius: 20px 22px 17px 22px;
  color: var(--fresh-ink);
  cursor: pointer;
  padding: 14px 12px;
  text-align: left;
  box-shadow: var(--fresh-shadow-soft);
}

.note:nth-child(2) { transform: rotate(1.1deg); }
.note:nth-child(3) { transform: rotate(-0.8deg); }
.note:nth-child(4) { transform: rotate(0.9deg); }

.note > span {
  display: grid;
  width: 37px;
  height: 37px;
  place-items: center;
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.55);
}

.note strong {
  margin-top: 8px;
  font-size: 13px;
}

.note small {
  color: var(--fresh-text);
  font-size: 12px;
  line-height: 1.45;
}

.note-green { background: var(--fresh-mint); }
.note-blue { background: var(--fresh-sky); }
.note-yellow { background: var(--cm-amber-soft); }
.note-lilac { background: var(--fresh-lilac); }
.note-lilac small { color: #314438; }

.search-sheet,
.map-sheet {
  padding: 18px;
}

.search-flower {
  position: relative;
  width: 38px;
  height: 38px;
}

.search-flower i {
  position: absolute;
  width: 17px;
  height: 23px;
  border-radius: 100% 0 100% 0;
  background: #d5e5cf;
}

.search-flower i:nth-child(2) { right: 0; transform: rotate(83deg); }
.search-flower i:nth-child(3) { right: 4px; bottom: 0; transform: rotate(150deg); }

.search-sheet :deep(.van-search) {
  margin-top: 15px;
}

.search-results {
  display: grid;
  gap: 7px;
  margin-top: 11px;
}

.search-results > button {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-height: 60px;
  border: 1px solid var(--fresh-line);
  border-radius: var(--fresh-radius-sm);
  background: var(--fresh-paper-2);
  color: var(--fresh-ink);
  cursor: pointer;
  padding: 9px 11px;
  text-align: left;
}

.search-results > button > span:nth-child(2) {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.search-results strong,
.search-results small {
  overflow-wrap: anywhere;
}

.search-results strong { font-size: 15px; line-height: 1.4; }
.search-results small { color: var(--fresh-muted); font-size: 13px; }

.place-mark {
  position: relative;
  width: 33px;
  height: 33px;
  border-radius: 50% 50% 50% 10px;
  background: var(--fresh-mint);
  transform: rotate(-45deg);
}

.place-mark i {
  position: absolute;
  inset: 11px;
  border-radius: 50%;
  background: var(--fresh-green);
}

.recent-section,
.places-section,
.map-section {
  display: grid;
  gap: 13px;
}

.recent-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 1px 1px 6px;
  scrollbar-width: none;
}

.recent-row::-webkit-scrollbar { display: none; }

.recent-row button {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  min-height: 47px;
  border: 1px solid var(--fresh-line);
  border-radius: var(--radius-md);
  background: var(--fresh-paper);
  color: var(--fresh-text);
  cursor: pointer;
  padding: 7px 12px 7px 8px;
}

.recent-row button > span {
  display: grid;
  width: 31px;
  height: 31px;
  place-items: center;
  border-radius: 50%;
  background: var(--fresh-sky);
  color: var(--cm-chat-dark);
}

.recent-row strong { font-size: 13px; font-weight: 700; }

.places-section .fresh-section-heading > span {
  color: var(--fresh-muted);
  font-size: 12px;
}

.place-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}

.place-grid button {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 148px;
  align-content: end;
  overflow: hidden;
  border: 0;
  border-radius: 23px 23px 18px 23px;
  color: var(--fresh-ink);
  cursor: pointer;
  padding: 15px;
  text-align: left;
}

.place-grid button::before {
  position: absolute;
  top: -26px;
  right: -19px;
  width: 90px;
  height: 90px;
  border: 18px solid rgba(255, 255, 255, 0.35);
  border-radius: 50%;
  content: "";
  pointer-events: none;
}

.place-tone-0 { background: var(--fresh-mint); }
.place-tone-1 { background: var(--fresh-sky); }
.place-tone-2 { background: var(--cm-amber-soft); }
.place-tone-3 { background: #eee5ec; }

.place-index {
  position: absolute;
  top: 13px;
  left: 14px;
  color: var(--fresh-text);
  font-family: ui-monospace, monospace;
  font-size: 12px;
}

.place-grid small {
  color: var(--fresh-text);
  font-size: 12px;
}

.place-grid strong {
  margin-top: 3px;
  font-size: 16px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.place-enter {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 11px;
  color: var(--fresh-green-dark);
  font-size: 12px;
  font-weight: 700;
}

.map-sheet {
  overflow: hidden;
}

.home-loading,
.home-semester-loading {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 13px;
  color: var(--fresh-muted);
  font-size: 12px;
}

.home-loading { min-height: 330px; }
.home-semester-loading { min-height: 210px; }

.home-loading > span,
.home-semester-loading > span {
  display: flex;
  gap: 5px;
  align-items: flex-end;
  height: 28px;
}

.home-loading i,
.home-semester-loading i {
  width: 5px;
  height: 12px;
  border-radius: var(--radius-pill);
  background: var(--fresh-leaf);
  animation: loading-grow 1s ease-in-out infinite alternate;
}

.home-loading i:nth-child(2),
.home-semester-loading i:nth-child(2) { height: 22px; animation-delay: 160ms; }
.home-loading i:nth-child(3),
.home-semester-loading i:nth-child(3) { height: 16px; animation-delay: 320ms; }
.home-loading p,
.home-semester-loading p { margin: 0; }

@keyframes trail-grow {
  to { stroke-dashoffset: 0; }
}

@keyframes sun-float {
  50% { transform: translateY(-6px) scale(1.04); }
}

@keyframes loading-grow {
  to { transform: scaleY(1.45); }
}

@media (max-width: 370px) {
  .today-card { min-height: 345px; padding-right: 18px; padding-left: 18px; }
  .quick-notes { gap: 6px; }
  .note { min-height: 128px; padding: 12px 9px; }
  .note small { font-size: 12px; }
}

@media (prefers-reduced-motion: reduce) {
  .sun-spot,
  .walking-line path,
  .home-loading i,
  .home-semester-loading i,
  .login-welcome__path i {
    animation: none;
  }

  .walking-line path {
    stroke-dashoffset: 0;
  }
}
</style>

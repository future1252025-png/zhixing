<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getBuildingDetail, type Building } from '@/api/buildings'
import RealCampusMap from '@/components/RealCampusMap.vue'
import TechIcon from '@/components/TechIcon.vue'
import { formatBuildingDisplayName } from '@/utils/buildings'
import { goBack } from '@/utils/navigation'

const route = useRoute()
const router = useRouter()
const building = ref<Building | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const buildingId = computed(() => Number(route.params.id))

async function loadBuilding() {
  loading.value = true
  errorMessage.value = ''
  building.value = null
  if (!Number.isFinite(buildingId.value)) {
    errorMessage.value = '建筑编号无效'
    loading.value = false
    return
  }
  try { building.value = await getBuildingDetail(buildingId.value) }
  catch { errorMessage.value = '未找到该建筑或加载失败' }
  finally { loading.value = false }
}

function openMessages() { router.push(`/buildings/${buildingId.value}/chats`) }
function openSchedule() { router.push({ path: '/schedule', query: { destination: String(buildingId.value) } }) }
onMounted(loadBuilding)
</script>

<template>
  <section class="page building-detail-page">
    <van-nav-bar title="校园地点" left-arrow @click-left="goBack(router, '/home')" />
    <div class="page-content building-content">
      <div v-if="loading" class="place-loading" role="status" aria-live="polite">
        <span><i></i><i></i><i></i></span>
        <div>
          <strong>正在打开这个地点</strong>
          <p>地图和地点信息很快就好...</p>
        </div>
      </div>

      <van-empty v-else-if="errorMessage" image="error" :description="errorMessage">
        <div class="page-actions">
          <van-button type="primary" size="small" @click="loadBuilding">重新加载</van-button>
          <van-button plain size="small" @click="router.push('/home')">回到首页</van-button>
        </div>
      </van-empty>

      <template v-else-if="building">
        <header
          v-reveal="{ from: 'left', distance: 40, stagger: 55 }"
          class="place-hero"
        >
          <span class="place-sun" aria-hidden="true"></span>
          <span class="place-leaves" aria-hidden="true"><i></i><i></i><i></i></span>
          <span class="place-number">{{ String(building.id).padStart(2, '0') }}</span>
          <div class="place-copy">
            <span class="fresh-kicker">{{ building.type }}</span>
            <h1>{{ formatBuildingDisplayName(building.name) }}</h1>
            <p>{{ building.description }}</p>
          </div>
          <div class="place-walk">
            <span><TechIcon name="guide" :size="18" /></span>
            <div><small>步行提示</small><strong>{{ building.walk_hint || '校园内步行可达' }}</strong></div>
          </div>
        </header>

        <section v-reveal="{ from: 'right', distance: 40 }" class="place-map fresh-card">
          <div class="fresh-section-heading">
            <div><h2>它在校园的这里</h2><p>拖动和缩放地图查看更多</p></div>
          </div>
          <RealCampusMap
            :buildings="[building]"
            :active-building-id="building.id"
            title=""
            subtitle=""
            height="330px"
            selected-action-text="打开频道"
            @building-click="openMessages"
          />
        </section>

        <section
          v-reveal="{ from: 'left', distance: 38, stagger: 60 }"
          class="place-facts"
        >
          <article>
            <span><TechIcon name="location" :size="18" /></span>
            <div><small>地点类型</small><strong>{{ building.type }}</strong></div>
          </article>
          <article>
            <span><TechIcon name="aim" :size="18" /></span>
            <div><small>校园坐标</small><strong>{{ building.latitude.toFixed(4) }}, {{ building.longitude.toFixed(4) }}</strong></div>
          </article>
        </section>

        <section v-reveal="{ from: 'right', distance: 36 }" class="place-actions">
          <button type="button" class="chat-action" @click="openMessages">
            <span><TechIcon name="chat" :size="19" /></span>
            <span><strong>看看地点频道</strong><small>找到同在这里的人和留言</small></span>
            <TechIcon name="arrow" :size="19" />
          </button>
          <button type="button" class="route-action" @click="openSchedule">
            <span><TechIcon name="route" :size="20" /></span>
            <span><strong>准备去这里</strong><small>预览步行路线和出发时间</small></span>
            <TechIcon name="arrow" :size="19" />
          </button>
        </section>
      </template>
    </div>
  </section>
</template>

<style scoped>
.building-detail-page {
  background:
    radial-gradient(circle at 105% 4%, rgba(242, 200, 111, 0.17), transparent 18rem),
    radial-gradient(circle at -12% 58%, rgba(111, 159, 170, 0.11), transparent 19rem);
}

.building-content {
  display: grid;
  gap: 17px;
}

.place-loading {
  display: flex;
  min-height: 230px;
  align-items: center;
  justify-content: center;
  gap: 15px;
  border-radius: 28px;
  background: rgba(255, 253, 248, 0.72);
}

.place-loading > span {
  display: flex;
  gap: 4px;
  align-items: flex-end;
  height: 31px;
}

.place-loading i {
  width: 7px;
  height: 13px;
  border-radius: var(--radius-pill);
  background: var(--fresh-leaf);
  animation: place-load 850ms ease-in-out infinite alternate;
}

.place-loading i:nth-child(2) { height: 27px; animation-delay: 150ms; }
.place-loading i:nth-child(3) { height: 19px; animation-delay: 300ms; }
.place-loading strong { display: block; color: var(--fresh-ink); font-size: 13px; }
.place-loading p { margin: 4px 0 0; color: var(--fresh-muted); font-size: 12px; }

.place-hero {
  position: relative;
  min-height: 285px;
  overflow: hidden;
  border-radius: 34px 34px 26px 34px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.46), transparent 43%),
    var(--fresh-mint);
  padding: 25px 22px 20px;
  box-shadow: var(--fresh-shadow-soft);
}

.place-hero::after {
  position: absolute;
  right: -50px;
  bottom: -65px;
  width: 220px;
  height: 150px;
  border-radius: 50%;
  background: rgba(111, 159, 170, 0.1);
  content: "";
  transform: rotate(-11deg);
}

.place-number {
  position: absolute;
  top: 20px;
  right: 25px;
  color: rgba(38, 54, 42, 0.16);
  font-family: var(--font-serif);
  font-size: 72px;
  line-height: 1;
}

.place-copy {
  position: relative;
  z-index: 2;
  max-width: 350px;
}

.place-copy h1 {
  margin: 12px 0 0;
  color: var(--fresh-ink);
  font-family: var(--font-serif);
  font-size: clamp(34px, 9vw, 46px);
  line-height: 1.08;
  letter-spacing: -0.05em;
}

.place-copy p {
  max-width: 320px;
  margin: 12px 0 0;
  color: var(--fresh-text);
  font-size: 12px;
  line-height: 1.75;
}

.place-sun {
  position: absolute;
  right: 38px;
  bottom: 64px;
  width: 37px;
  height: 37px;
  border-radius: 50%;
  background: var(--fresh-sun);
  box-shadow: 0 0 0 10px rgba(242, 200, 111, 0.12);
  animation: place-sun 4s ease-in-out infinite;
}

.place-leaves {
  position: absolute;
  right: 16px;
  bottom: 19px;
  z-index: 1;
  display: flex;
  gap: 1px;
  transform: rotate(7deg);
}

.place-leaves i {
  width: 22px;
  height: 43px;
  border-radius: 100% 0 100% 0;
  background: rgba(91, 134, 91, 0.26);
  transform: rotate(-37deg);
}

.place-walk {
  position: absolute;
  right: 19px;
  bottom: 18px;
  left: 19px;
  z-index: 3;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 9px;
  align-items: center;
  max-width: 275px;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.6);
  padding: 9px;
}

.place-walk > span {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 13px;
  background: #fff;
  color: var(--fresh-green-dark);
}

.place-walk > div { display: grid; min-width: 0; gap: 3px; }
.place-walk small { color: var(--fresh-muted); font-size: 12px; }
.place-walk strong {
  color: var(--fresh-ink);
  font-size: 13px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  white-space: normal;
}

.place-map {
  overflow: hidden;
  padding: 18px;
}

.place-map .fresh-section-heading {
  margin-bottom: 13px;
}

.place-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}

.place-facts article {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 9px;
  align-items: center;
  min-height: 72px;
  border-radius: 21px;
  background: var(--fresh-paper);
  padding: 10px;
  box-shadow: var(--fresh-shadow-soft);
}

.place-facts article > span {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: var(--radius-sm);
  background: var(--fresh-mint);
  color: var(--fresh-green-dark);
}

.place-facts article:nth-child(2) > span {
  background: var(--fresh-sky);
  color: var(--cm-chat-dark);
}

.place-facts article > div { display: grid; min-width: 0; gap: 3px; }
.place-facts small { color: var(--fresh-muted); font-size: 12px; }
.place-facts strong {
  color: var(--fresh-ink);
  font-size: 14px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  white-space: normal;
}

.place-actions {
  display: grid;
  gap: 9px;
}

.place-actions button {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-height: 68px;
  border: 0;
  border-radius: 22px;
  color: var(--fresh-ink);
  cursor: pointer;
  padding: 10px 14px 10px 10px;
  text-align: left;
}

.chat-action { background: var(--fresh-mint); }
.route-action { background: var(--fresh-sky); }

.place-actions button > span:first-child {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.62);
  color: var(--fresh-green-dark);
}

.route-action > span:first-child { color: var(--cm-chat-dark); }
.place-actions button > span:nth-child(2) { display: grid; gap: 3px; }
.place-actions strong { font-size: 15px; }
.place-actions small { color: var(--fresh-muted); font-size: 12px; line-height: 1.4; }

@keyframes place-load {
  to { transform: scaleY(1.4); }
}

@keyframes place-sun {
  50% { transform: translateY(-5px) scale(1.04); }
}

@media (prefers-reduced-motion: reduce) {
  .place-loading i,
  .place-sun {
    animation: none;
  }
}
</style>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getBuildingDetail, type Building } from '@/api/buildings'
import RealCampusMap from '@/components/RealCampusMap.vue'

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

function openMessages() { router.push(`/buildings/${buildingId.value}/messages`) }
function openSchedule() { router.push({ path: '/schedule', query: { destination: String(buildingId.value) } }) }
onMounted(loadBuilding)
</script>

<template>
  <section class="page">
    <van-nav-bar title="建筑详情" left-arrow @click-left="router.push('/home')" />
    <div class="page-content building-content">
      <p v-if="loading" class="muted-text">正在加载建筑详情...</p>
      <van-empty v-else-if="errorMessage" image="error" :description="errorMessage">
        <div class="page-actions"><van-button type="primary" size="small" @click="loadBuilding">重试</van-button><van-button plain size="small" @click="router.push('/home')">返回首页</van-button></div>
      </van-empty>
      <template v-else-if="building">
        <header class="building-heading"><span>{{ building.type }}</span><h1>{{ building.name }}</h1><p>{{ building.description }}</p></header>
        <RealCampusMap title="所在位置" subtitle="地图已定位到当前建筑" :buildings="[building]" :active-building-id="building.id" height="285px" />
        <section class="building-note"><span>步行提示</span><p>{{ building.walk_hint || '暂无步行提示，可从地图查看周边道路和入口。' }}</p></section>
        <div class="building-actions"><button type="button" @click="openMessages"><van-icon name="chat-o" /><span><strong>建筑留言</strong><small>查看附近同学的匿名留言</small></span><van-icon name="arrow" /></button><button type="button" @click="openSchedule"><van-icon name="guide-o" /><span><strong>规划到这里</strong><small>作为路线终点打开出发建议</small></span><van-icon name="arrow" /></button></div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.building-content { display: grid; gap: 16px; }
.building-heading { padding: 8px 2px 2px; }.building-heading span { color: var(--cm-primary); font-size: 12px; font-weight: 700; }.building-heading h1 { margin: 7px 0 6px; font-size: 28px; line-height: 1.2; }.building-heading p { margin: 0; color: var(--cm-muted); font-size: 14px; line-height: 1.65; }
.building-note { border-left: 4px solid var(--cm-amber); background: #fff; padding: 12px 14px; }.building-note span { color: var(--cm-muted); font-size: 11px; }.building-note p { margin: 5px 0 0; color: var(--cm-text); font-size: 14px; line-height: 1.6; }
.building-actions { border-top: 1px solid var(--cm-line); border-bottom: 1px solid var(--cm-line); background: #fff; }.building-actions button { display: grid; grid-template-columns: 24px 1fr auto; width: 100%; align-items: center; gap: 10px; border: 0; background: #fff; color: var(--cm-ink); cursor: pointer; padding: 14px; text-align: left; }.building-actions button + button { border-top: 1px solid var(--cm-line); }.building-actions .van-icon:first-child { color: var(--cm-primary); font-size: 21px; }.building-actions span { display: grid; gap: 3px; }.building-actions strong { font-size: 14px; }.building-actions small { color: var(--cm-muted); font-size: 12px; }
</style>

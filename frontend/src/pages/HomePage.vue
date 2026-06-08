<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import {
  getBuildings,
  type Building
} from '@/api/buildings'
import RealCampusMap from '@/components/RealCampusMap.vue'

const router = useRouter()
const buildings = ref<Building[]>([])
const loading = ref(true)
const errorMessage = ref('')

async function loadHomeData() {
  loading.value = true
  errorMessage.value = ''
  try {
    buildings.value = await getBuildings()
  } catch {
    errorMessage.value = '校园建筑加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function openBuilding(buildingId: number) {
  router.push(`/buildings/${buildingId}`)
}

onMounted(loadHomeData)
</script>

<template>
  <section class="page">
    <van-nav-bar title="智行 CampusMind" />
    <div class="page-content">
      <section class="hero-panel home-hero">
        <span class="hero-eyebrow">湖北大学校园助手</span>
        <h1 class="hero-title">看建筑、查留言、安排下一站</h1>
        <p class="hero-copy">从校园建筑入口开始，把课程表和出发建议串成一条清晰的日程线。</p>
        <div class="metric-row">
          <div class="metric-item">
            <span>建筑</span>
            <strong>{{ buildings.length || '-' }}</strong>
          </div>
          <div class="metric-item">
            <span>入口</span>
            <strong>地图</strong>
          </div>
          <div class="metric-item">
            <span>模式</span>
            <strong>H5</strong>
          </div>
        </div>
      </section>

      <RealCampusMap
        v-if="!loading && buildings.length > 0"
        title="湖北大学真实地图"
        subtitle="在搜索栏查找地点，或直接点击地图上的建筑标识进入详情"
        :buildings="buildings"
        height="420px"
        @building-click="openBuilding"
      />
      <p v-if="loading" class="muted-text map-loading">正在加载校园地图...</p>
      <van-empty v-else-if="errorMessage" image="error" :description="errorMessage">
        <van-button type="primary" size="small" @click="loadHomeData">重试</van-button>
      </van-empty>
      <van-empty v-else-if="buildings.length === 0" description="暂无建筑数据" />
    </div>
  </section>
</template>

<style scoped>
.home-hero {
  min-height: 188px;
}

.map-loading {
  margin-top: 16px;
  text-align: center;
}

</style>

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
  try {
    building.value = await getBuildingDetail(buildingId.value)
  } catch {
    errorMessage.value = '未找到该建筑或加载失败'
  } finally {
    loading.value = false
  }
}

function openMessages() {
  router.push(`/buildings/${buildingId.value}/messages`)
}

onMounted(loadBuilding)
</script>

<template>
  <section class="page">
    <van-nav-bar title="建筑详情" left-arrow @click-left="router.push('/home')" />
    <div class="page-content">
      <p v-if="loading" class="muted-text">正在加载建筑详情...</p>
      <van-empty v-else-if="errorMessage" image="error" :description="errorMessage">
        <div class="page-actions">
          <van-button type="primary" size="small" @click="loadBuilding">重试</van-button>
          <van-button plain size="small" @click="router.push('/home')">返回首页</van-button>
        </div>
      </van-empty>
      <template v-else-if="building">
        <section class="hero-panel detail-header">
          <span class="hero-eyebrow">{{ building.type }}</span>
          <h1 class="hero-title">{{ building.name }}</h1>
          <p class="hero-copy">{{ building.description }}</p>
        </section>

        <section class="surface-panel detail-panel">
          <h2>建筑信息</h2>
          <div class="info-list">
            <article>
              <span>步行提示</span>
              <strong>{{ building.walk_hint || '暂无步行提示' }}</strong>
            </article>
            <article>
              <span>经纬度</span>
              <strong>{{ building.latitude.toFixed(4) }}, {{ building.longitude.toFixed(4) }}</strong>
            </article>
            <article>
              <span>静态地图坐标</span>
              <strong>X {{ building.map_x.toFixed(1) }} / Y {{ building.map_y.toFixed(1) }}</strong>
            </article>
          </div>
        </section>

        <RealCampusMap
          title="建筑所在位置"
          subtitle="真实地图定位当前建筑，便于演示校园空间关系"
          :buildings="[building]"
          :active-building-id="building.id"
          height="260px"
        />

        <div class="page-actions">
          <van-button type="primary" block icon="chat-o" @click="openMessages">
            进入建筑留言区
          </van-button>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.detail-header {
  margin-bottom: 16px;
}

.detail-panel {
  padding: 14px;
}

.detail-panel h2 {
  margin: 0 0 12px;
  color: var(--cm-ink);
  font-size: 17px;
}

.info-list {
  display: grid;
  gap: 10px;
}

.info-list article {
  display: grid;
  gap: 4px;
  border-bottom: 1px solid var(--cm-line);
  padding-bottom: 10px;
}

.info-list article:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.info-list span {
  color: var(--cm-muted);
  font-size: 12px;
}

.info-list strong {
  color: var(--cm-text);
  font-size: 14px;
  line-height: 1.5;
}
</style>

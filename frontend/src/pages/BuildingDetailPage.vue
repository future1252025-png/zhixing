<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { getBuildingDetail, type Building } from '@/api/buildings'

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
        <section class="detail-header">
          <p class="building-type">{{ building.type }}</p>
          <h1>{{ building.name }}</h1>
          <p>{{ building.description }}</p>
        </section>

        <van-cell-group inset>
          <van-cell title="步行提示" :label="building.walk_hint || '暂无步行提示'" />
          <van-cell
            title="经纬度"
            :label="`${building.latitude.toFixed(4)}, ${building.longitude.toFixed(4)}`"
          />
          <van-cell
            title="静态地图坐标"
            :label="`X ${building.map_x.toFixed(1)} / Y ${building.map_y.toFixed(1)}`"
          />
        </van-cell-group>

        <div class="page-actions">
          <van-button disabled block>留言区将在后续阶段实现</van-button>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.detail-header {
  margin-bottom: 16px;
  padding: 0 4px;
}

.detail-header h1 {
  margin: 4px 0 8px;
  font-size: 24px;
  line-height: 1.25;
}

.detail-header p {
  margin: 0;
  color: #4b5563;
  line-height: 1.6;
}

.building-type {
  width: fit-content;
  border-radius: 4px;
  background: #eef5ff;
  color: #1677ff;
  padding: 2px 8px;
  font-size: 13px;
}

.muted-text {
  margin: 12px 0;
  color: #6b7280;
  font-size: 14px;
}
</style>

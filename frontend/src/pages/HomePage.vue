<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import {
  getBuildings,
  getLocationPresets,
  type Building,
  type LocationPreset
} from '@/api/buildings'

const router = useRouter()
const buildings = ref<Building[]>([])
const locationPresets = ref<LocationPreset[]>([])
const loading = ref(true)
const errorMessage = ref('')

async function loadHomeData() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [buildingResult, presetResult] = await Promise.all([
      getBuildings(),
      getLocationPresets()
    ])
    buildings.value = buildingResult
    locationPresets.value = presetResult
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
      <section class="section-block">
        <h2 class="section-title">校园建筑</h2>
        <p v-if="loading" class="muted-text">正在加载建筑数据...</p>
        <van-empty v-else-if="errorMessage" image="error" :description="errorMessage">
          <van-button type="primary" size="small" @click="loadHomeData">重试</van-button>
        </van-empty>
        <van-empty v-else-if="buildings.length === 0" description="暂无建筑数据" />
        <van-cell-group v-else inset>
          <van-cell
            v-for="building in buildings"
            :key="building.id"
            clickable
            is-link
            :title="building.name"
            @click="openBuilding(building.id)"
          >
            <template #label>
              <div class="cell-label">
                <span class="tag-text">{{ building.type }}</span>
                <span>{{ building.description }}</span>
                <span v-if="building.walk_hint">{{ building.walk_hint }}</span>
              </div>
            </template>
          </van-cell>
        </van-cell-group>
      </section>

      <section class="section-block">
        <h2 class="section-title">演示当前位置预设</h2>
        <van-cell-group v-if="locationPresets.length > 0" inset>
          <van-cell
            v-for="preset in locationPresets"
            :key="preset.id"
            :title="preset.name"
            :label="preset.description || preset.building_name || '演示位置'"
          />
        </van-cell-group>
        <p v-else-if="!loading && !errorMessage" class="muted-text">暂无位置预设</p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.section-block + .section-block {
  margin-top: 18px;
}

.section-title {
  margin: 0 0 10px;
  font-size: 17px;
  font-weight: 700;
}

.muted-text {
  margin: 12px 0;
  color: #6b7280;
  font-size: 14px;
}

.cell-label {
  display: grid;
  gap: 4px;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.5;
}

.tag-text {
  width: fit-content;
  border-radius: 4px;
  background: #eef5ff;
  color: #1677ff;
  padding: 1px 6px;
  font-size: 12px;
}
</style>

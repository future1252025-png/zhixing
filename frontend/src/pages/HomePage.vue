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
            <span>位置预设</span>
            <strong>{{ locationPresets.length || '-' }}</strong>
          </div>
          <div class="metric-item">
            <span>模式</span>
            <strong>H5</strong>
          </div>
        </div>
      </section>

      <section class="section-block">
        <div class="section-heading">
          <div>
            <h2 class="section-title">校园建筑</h2>
            <p class="section-subtitle">点击建筑查看详情和匿名留言</p>
          </div>
        </div>
        <p v-if="loading" class="muted-text">正在加载建筑数据...</p>
        <van-empty v-else-if="errorMessage" image="error" :description="errorMessage">
          <van-button type="primary" size="small" @click="loadHomeData">重试</van-button>
        </van-empty>
        <van-empty v-else-if="buildings.length === 0" description="暂无建筑数据" />
        <div v-else class="building-list">
          <button
            v-for="building in buildings"
            :key="building.id"
            type="button"
            class="building-card"
            @click="openBuilding(building.id)"
          >
            <div class="building-card-head">
              <span class="tag-text">{{ building.type }}</span>
              <span class="arrow-text">查看</span>
            </div>
            <h3>{{ building.name }}</h3>
            <p>{{ building.description }}</p>
            <small v-if="building.walk_hint">{{ building.walk_hint }}</small>
          </button>
        </div>
      </section>

      <section class="section-block">
        <div class="section-heading">
          <div>
            <h2 class="section-title">演示当前位置预设</h2>
            <p class="section-subtitle">用于出发建议的手动当前位置</p>
          </div>
        </div>
        <div v-if="locationPresets.length > 0" class="preset-list">
          <article
            v-for="preset in locationPresets"
            :key="preset.id"
            class="preset-item"
          >
            <strong>{{ preset.name }}</strong>
            <span>{{ preset.description || preset.building_name || '演示位置' }}</span>
          </article>
        </div>
        <p v-else-if="!loading && !errorMessage" class="muted-text">暂无位置预设</p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.home-hero {
  min-height: 188px;
}

.building-list {
  display: grid;
  gap: 10px;
}

.building-card {
  width: 100%;
  cursor: pointer;
  border: 1px solid var(--cm-line);
  border-radius: var(--cm-radius);
  background: var(--cm-card);
  box-shadow: 0 8px 20px rgb(16 24 40 / 6%);
  color: inherit;
  font: inherit;
  padding: 13px;
  text-align: left;
  transition:
    transform 0.16s ease,
    box-shadow 0.16s ease;
}

.building-card:active {
  transform: scale(0.99);
}

.building-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.building-card h3 {
  margin: 10px 0 6px;
  color: var(--cm-ink);
  font-size: 18px;
  line-height: 1.35;
}

.building-card p {
  margin: 0;
  color: var(--cm-text);
  font-size: 13px;
  line-height: 1.5;
}

.building-card small {
  display: block;
  margin-top: 8px;
  color: var(--cm-green);
  font-size: 12px;
  line-height: 1.5;
}

.tag-text {
  width: fit-content;
  border-radius: 999px;
  background: var(--cm-primary-soft);
  color: var(--cm-primary-dark);
  padding: 3px 8px;
  font-size: 12px;
  font-weight: 700;
}

.arrow-text {
  color: var(--cm-primary);
  font-size: 12px;
  font-weight: 700;
}

.preset-list {
  display: grid;
  gap: 8px;
}

.preset-item {
  display: grid;
  gap: 4px;
  border: 1px solid var(--cm-line);
  border-radius: var(--cm-radius);
  background: rgb(255 255 255 / 86%);
  padding: 12px;
}

.preset-item strong {
  color: var(--cm-ink);
  font-size: 15px;
}

.preset-item span {
  color: var(--cm-muted);
  font-size: 13px;
  line-height: 1.5;
}
</style>

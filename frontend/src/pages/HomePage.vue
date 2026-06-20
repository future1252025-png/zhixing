<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { getBuildings, type Building } from '@/api/buildings'
import { getCourses } from '@/api/courses'
import RealCampusMap from '@/components/RealCampusMap.vue'
import type { Course } from '@/types/course'
import { filterCoursesByWeek, findNextCourse, getWeekdayLabel, readSelectedWeek } from '@/utils/course'

const router = useRouter()
const buildings = ref<Building[]>([])
const courses = ref<Course[]>([])
const loading = ref(true)
const errorMessage = ref('')
const selectedWeek = typeof window === 'undefined' ? 1 : readSelectedWeek(window.localStorage)
const nextCourse = computed(() => findNextCourse(filterCoursesByWeek(courses.value, selectedWeek)))

async function loadHomeData() {
  loading.value = true
  errorMessage.value = ''
  try {
    const [buildingResult, courseResult] = await Promise.all([getBuildings(), getCourses()])
    buildings.value = buildingResult
    courses.value = courseResult
  } catch {
    errorMessage.value = '首页数据加载失败，请稍后重试'
  } finally { loading.value = false }
}

function openBuilding(buildingId: number) { router.push(`/buildings/${buildingId}`) }
onMounted(loadHomeData)
</script>

<template>
  <section class="page home-page">
    <van-nav-bar title="智行 CampusMind" />
    <div class="page-content home-content">
      <section class="home-ticket">
        <template v-if="nextCourse">
          <div class="ticket-heading"><span>第 {{ selectedWeek }} 周 · {{ getWeekdayLabel(nextCourse.weekday) }}</span><strong>{{ nextCourse.start_time }}</strong></div>
          <h1>{{ nextCourse.course_name }}</h1>
          <p>{{ nextCourse.building.name }} · {{ nextCourse.room_name }}</p>
          <div class="ticket-route" aria-hidden="true"><i></i><b></b><i></i></div>
          <div class="ticket-footer"><span>当前位置</span><button type="button" @click="router.push('/schedule')">生成出发建议</button><span>{{ nextCourse.building.name }}</span></div>
        </template>
        <template v-else>
          <div class="ticket-heading"><span>第 {{ selectedWeek }} 周</span><strong>空闲</strong></div>
          <h1>暂未找到后续课程</h1>
          <p>导入课表后，首页会显示下一节课和出发入口。</p>
          <div class="ticket-empty-actions"><button type="button" @click="router.push('/courses/import')">导入课表</button><button type="button" @click="router.push('/courses/new')">新增课程</button></div>
        </template>
      </section>

      <nav class="home-action-row" aria-label="快捷操作">
        <button type="button" @click="router.push('/courses/import')"><van-icon name="description" /><span><strong>导入课表</strong><small>HTML / Excel</small></span></button>
        <button type="button" @click="router.push('/schedule')"><van-icon name="guide-o" /><span><strong>出发建议</strong><small>计算路线</small></span></button>
        <button type="button" @click="router.push('/courses')"><van-icon name="notes-o" /><span><strong>本周课表</strong><small>第 {{ selectedWeek }} 周</small></span></button>
      </nav>

      <section class="home-map-section">
        <div class="section-heading"><div><h2 class="section-title">校园地图</h2><p class="section-subtitle">搜索地点，或直接点击地图中的建筑区域</p></div><span>{{ buildings.length }} 个地点</span></div>
        <RealCampusMap v-if="!loading && buildings.length" :buildings="buildings" title="" subtitle="" height="440px" @building-click="openBuilding" />
        <p v-if="loading" class="muted-text map-loading">正在加载校园地图...</p>
        <van-empty v-else-if="errorMessage" image="error" :description="errorMessage"><van-button type="primary" size="small" @click="loadHomeData">重试</van-button></van-empty>
        <van-empty v-else-if="!buildings.length" description="暂无建筑数据" />
      </section>
    </div>
  </section>
</template>

<style scoped>
.home-content { display: grid; gap: 18px; }
.home-ticket { position: relative; overflow: hidden; border-radius: 8px; background: #153a3d; color: #fff; padding: 18px; box-shadow: var(--cm-shadow-strong); }
.home-ticket::after { position: absolute; right: -30px; top: -35px; width: 130px; height: 130px; border: 1px solid rgba(255,255,255,.13); border-radius: 50%; content: ""; }
.ticket-heading { position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #a9cbc7; font-size: 12px; }
.ticket-heading strong { color: #fff; font-size: 24px; }
.home-ticket h1 { position: relative; z-index: 1; margin: 15px 0 4px; font-size: 25px; line-height: 1.2; }
.home-ticket p { position: relative; z-index: 1; margin: 0; color: #c7dcd9; font-size: 13px; }
.ticket-route { display: flex; align-items: center; margin: 20px 3px 6px; }
.ticket-route i { width: 12px; height: 12px; border: 3px solid #fff; border-radius: 50%; background: #168f78; }
.ticket-route i:last-child { background: #f2b84b; }.ticket-route b { height: 3px; flex: 1; background: #62c8ba; }
.ticket-footer { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; color: #bcd1ce; font-size: 10px; }
.ticket-footer span:last-child { text-align: right; }.ticket-footer button,.ticket-empty-actions button { border: 1px solid rgba(255,255,255,.3); border-radius: 6px; background: transparent; color: #fff; cursor: pointer; font-size: 11px; padding: 6px 8px; }
.ticket-empty-actions { display: flex; gap: 8px; margin-top: 18px; }
.home-action-row { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); border-top: 1px solid var(--cm-line); border-bottom: 1px solid var(--cm-line); background: #fff; }
.home-action-row button { display: flex; min-width: 0; align-items: center; gap: 8px; border: 0; background: #fff; color: var(--cm-ink); cursor: pointer; padding: 13px 10px; text-align: left; }
.home-action-row button + button { border-left: 1px solid var(--cm-line); }.home-action-row .van-icon { flex: 0 0 auto; color: var(--cm-primary); font-size: 21px; }.home-action-row span { display: grid; min-width: 0; gap: 2px; }.home-action-row strong { font-size: 12px; white-space: nowrap; }.home-action-row small { color: var(--cm-muted); font-size: 9px; white-space: nowrap; }
.section-heading > span { color: var(--cm-primary); font-size: 12px; font-weight: 700; }.map-loading { padding: 40px 0; text-align: center; }
@media (max-width:360px){.home-action-row{grid-template-columns:1fr}.home-action-row button+button{border-left:0;border-top:1px solid var(--cm-line)}}
</style>

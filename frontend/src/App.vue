<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppTabbar from '@/components/AppTabbar.vue'
import WebUpdateNotice from '@/components/WebUpdateNotice.vue'
import StartupCourses from '@/components/StartupCourses.vue'
import { useAuthStore } from '@/stores/auth'
const ReminderRuntime = defineAsyncComponent(() => import('@/components/ReminderRuntime.vue'))
import { vantThemeVars as themeVars } from '@/styles/tokens'

const route = useRoute()
const auth = useAuthStore()
const extrasReady = ref(false)
let extrasFrame = 0
onMounted(() => { extrasFrame = requestAnimationFrame(() => {
  extrasFrame = requestAnimationFrame(() => { extrasReady.value = true })
}) })
onUnmounted(() => cancelAnimationFrame(extrasFrame))
const router = useRouter()
const tabbarRoutes = ['/home', '/courses', '/reminders', '/profile']
const showTabbar = computed(() => tabbarRoutes.includes(route.path))

/* 路由转场方向：tab 互切与同层跳转仅淡入淡出，进层从右滑入、返回从左滑入 */
const transitionName = ref('route-fade')
const pathDepth = (path: string) => path.split('/').filter(Boolean).length

router.afterEach((to, from) => {
  // The SDK hit-test coordinates must never inherit a moving/scaled route container.
  if (to.path === '/map' || from.path === '/map') {
    transitionName.value = 'route-fade'
    return
  }
  if (tabbarRoutes.includes(to.path) && tabbarRoutes.includes(from.path)) {
    transitionName.value = 'route-fade'
    return
  }
  const toDepth = pathDepth(to.path)
  const fromDepth = pathDepth(from.path)
  transitionName.value =
    toDepth > fromDepth ? 'route-forward' : toDepth < fromDepth ? 'route-back' : 'route-fade'
})
</script>

<template>
  <van-config-provider theme="light" :theme-vars="themeVars">
    <div class="app-frame">
      <StartupCourses v-if="auth.preview || auth.restoring" />
      <main v-else class="app-shell">
        <router-view v-slot="{ Component, route: viewRoute }">
          <Transition :name="transitionName" mode="out-in">
            <component :is="Component" :key="viewRoute.path" :data-route-scroll-key="viewRoute.fullPath" />
          </Transition>
        </router-view>
      </main>
      <AppTabbar v-if="showTabbar && !auth.preview && !auth.restoring" />
      <ReminderRuntime v-if="extrasReady && auth.isAuthenticated && !auth.restoring" />
      <WebUpdateNotice />
    </div>
  </van-config-provider>
</template>

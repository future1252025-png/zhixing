<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import AppTabbar from '@/components/AppTabbar.vue'
import AppLaunchIntro from '@/components/AppLaunchIntro.vue'
import LoginWelcomeIntro from '@/components/LoginWelcomeIntro.vue'
import { preloadAMapSdk } from '@/utils/amap'
import {
  consumeLoginIntroFlag,
  consumeLoginIntroSnapshot,
  shouldPlayAppLaunchIntro,
  type LoginIntroSnapshot
} from '@/utils/loginIntro'

const route = useRoute()
const tabbarRoutes = ['/home', '/courses', '/schedule', '/profile']
const showTabbar = computed(() => tabbarRoutes.includes(route.path))
const showLaunchIntro = ref(shouldPlayAppLaunchIntro())
const showLoginIntro = ref(false)
const queuedLoginIntro = ref(false)
const loginIntroSnapshot = ref<LoginIntroSnapshot | null>(null)
const homeHandoffActive = ref(false)
let handoffTimer: number | null = null

const themeVars = {
  primaryColor: '#0f7f78',
  buttonPrimaryBackground: '#0f7f78',
  buttonPrimaryBorderColor: '#0f7f78',
  cellTextColor: '#17212f',
  cellLabelColor: '#607083',
  fieldLabelColor: '#27384d',
  navBarTitleFontSize: '17px',
  navBarIconColor: '#0f7f78',
  tabbarItemActiveColor: '#0f7f78',
  tabbarBackground: 'rgba(255, 255, 255, 0.86)'
}

function startHomeHandoff() {
  homeHandoffActive.value = true
  if (handoffTimer !== null) {
    window.clearTimeout(handoffTimer)
  }
  handoffTimer = window.setTimeout(() => {
    homeHandoffActive.value = false
    handoffTimer = null
  }, 1300)
}

function finishLoginIntro() {
  showLoginIntro.value = false
  loginIntroSnapshot.value = null
}

function startQueuedLoginIntro() {
  queuedLoginIntro.value = false
  homeHandoffActive.value = false
  showLoginIntro.value = true
}

function finishLaunchIntro() {
  showLaunchIntro.value = false
  if (queuedLoginIntro.value) {
    startQueuedLoginIntro()
  }
}

watch(
  () => route.path,
  (path) => {
    if (tabbarRoutes.includes(path) && consumeLoginIntroFlag()) {
      loginIntroSnapshot.value = consumeLoginIntroSnapshot()
      if (showLaunchIntro.value) {
        queuedLoginIntro.value = true
      } else {
        startQueuedLoginIntro()
      }
    }
  },
  { immediate: true }
)

onMounted(() => {
  preloadAMapSdk()
})

onBeforeUnmount(() => {
  if (handoffTimer !== null) {
    window.clearTimeout(handoffTimer)
  }
})
</script>

<template>
  <van-config-provider :theme-vars="themeVars">
    <div class="app-frame" :class="{ 'login-handoff-active': homeHandoffActive }">
      <div class="app-shell">
        <router-view v-slot="{ Component, route: viewRoute }">
          <Transition name="route-page" mode="out-in">
            <component :is="Component" :key="viewRoute.path" />
          </Transition>
        </router-view>
      </div>
      <AppTabbar v-if="showTabbar" />
      <AppLaunchIntro
        v-if="showLaunchIntro"
        @finish="finishLaunchIntro"
      />
      <LoginWelcomeIntro
        v-if="showLoginIntro"
        :snapshot="loginIntroSnapshot"
        @handoff="startHomeHandoff"
        @finish="finishLoginIntro"
      />
    </div>
  </van-config-provider>
</template>

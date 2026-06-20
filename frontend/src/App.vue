<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import AppTabbar from '@/components/AppTabbar.vue'
import LoginWelcomeIntro from '@/components/LoginWelcomeIntro.vue'
import { consumeLoginIntroFlag } from '@/utils/loginIntro'

const route = useRoute()
const tabbarRoutes = ['/home', '/courses', '/schedule', '/profile']
const showTabbar = computed(() => tabbarRoutes.includes(route.path))
const showLoginIntro = ref(false)
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
}

watch(
  () => route.path,
  (path) => {
    if (tabbarRoutes.includes(path) && consumeLoginIntroFlag()) {
      homeHandoffActive.value = false
      showLoginIntro.value = true
    }
  },
  { immediate: true }
)

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
        <router-view />
      </div>
      <AppTabbar v-if="showTabbar" />
      <LoginWelcomeIntro
        v-if="showLoginIntro"
        @handoff="startHomeHandoff"
        @finish="finishLoginIntro"
      />
    </div>
  </van-config-provider>
</template>

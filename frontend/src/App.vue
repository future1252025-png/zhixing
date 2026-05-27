<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import AppTabbar from '@/components/AppTabbar.vue'

const route = useRoute()
const tabbarRoutes = ['/home', '/courses', '/schedule', '/profile']
const showTabbar = computed(() => tabbarRoutes.includes(route.path))

const themeVars = {
  primaryColor: '#1677ff',
  navBarTitleFontSize: '17px',
  tabbarItemActiveColor: '#1677ff'
}
</script>

<template>
  <van-config-provider :theme-vars="themeVars">
    <div class="app-shell">
      <router-view />
    </div>
    <AppTabbar v-if="showTabbar" />
  </van-config-provider>
</template>

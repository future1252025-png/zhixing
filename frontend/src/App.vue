<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import AppTabbar from '@/components/AppTabbar.vue'

const route = useRoute()
const tabbarRoutes = ['/home', '/courses', '/schedule', '/profile']
const showTabbar = computed(() => tabbarRoutes.includes(route.path))

const themeVars = {
  primaryColor: '#1f6feb',
  buttonPrimaryBackground: '#1f6feb',
  buttonPrimaryBorderColor: '#1f6feb',
  cellTextColor: '#182230',
  cellLabelColor: '#667085',
  fieldLabelColor: '#344054',
  navBarTitleFontSize: '17px',
  navBarIconColor: '#1f6feb',
  tabbarItemActiveColor: '#1f6feb',
  tabbarBackground: 'rgba(255, 255, 255, 0.96)'
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

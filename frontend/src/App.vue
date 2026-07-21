<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import AppTabbar from '@/components/AppTabbar.vue'

const route = useRoute()
const tabbarRoutes = ['/home', '/courses', '/schedule', '/profile']
const showTabbar = computed(() => tabbarRoutes.includes(route.path))

const themeVars = {
  primaryColor: '#4f7d58',
  buttonPrimaryBackground: '#4f7d58',
  buttonPrimaryBorderColor: '#4f7d58',
  buttonPrimaryColor: '#ffffff',
  cellBackground: 'transparent',
  cellTextColor: '#26362a',
  cellLabelColor: '#5f6f62',
  fieldLabelColor: '#536657',
  fieldInputTextColor: '#26362a',
  fieldLabelWidth: '4.2em',
  fontSize: '15px',
  navBarTitleFontSize: '17px',
  navBarIconColor: '#426d4b',
  background: '#f4f6ef',
  background2: '#fffdf8',
  textColor: '#26362a',
  textColor2: '#536657',
  textColor3: '#5f6f62',
  borderColor: '#dde5da'
}
</script>

<template>
  <van-config-provider theme="light" :theme-vars="themeVars">
    <div class="app-frame">
      <main class="app-shell">
        <router-view v-slot="{ Component, route: viewRoute }">
          <Transition name="route-page" mode="out-in">
            <component :is="Component" :key="viewRoute.path" />
          </Transition>
        </router-view>
      </main>
      <AppTabbar v-if="showTabbar" />
    </div>
  </van-config-provider>
</template>

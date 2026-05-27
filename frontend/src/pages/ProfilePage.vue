<script setup lang="ts">
import { onMounted } from 'vue'
import { showFailToast } from 'vant'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

onMounted(async () => {
  if (!authStore.currentUser && authStore.token) {
    try {
      await authStore.loadCurrentUser()
    } catch {
      showFailToast('登录状态已失效，请重新登录')
      await router.replace('/login')
    }
  }
})

async function handleLogout() {
  authStore.logout()
  await router.replace('/login')
}
</script>

<template>
  <section class="page">
    <van-nav-bar title="我的" />
    <div class="page-content">
      <van-cell-group inset>
        <van-cell title="账号" :value="authStore.displayName" />
        <van-cell title="用户名" :value="authStore.currentUser?.username || '-'" />
        <van-cell title="角色" :value="authStore.currentUser?.role || '-'" />
      </van-cell-group>
      <div class="page-actions">
        <van-button type="danger" plain block @click="handleLogout">退出登录</van-button>
      </div>
    </div>
  </section>
</template>

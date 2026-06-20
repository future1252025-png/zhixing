<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const activePath = computed(() => route.path)
</script>

<template>
  <van-tabbar class="app-tabbar" :model-value="activePath" route safe-area-inset-bottom>
    <van-tabbar-item to="/home" name="/home" icon="wap-home-o">首页</van-tabbar-item>
    <van-tabbar-item to="/courses" name="/courses" icon="notes-o">课表</van-tabbar-item>
    <van-tabbar-item to="/schedule" name="/schedule" icon="guide-o">建议</van-tabbar-item>
    <van-tabbar-item to="/profile" name="/profile" icon="user-o">我的</van-tabbar-item>
  </van-tabbar>
</template>

<style scoped>
.app-tabbar {
  border-top: 1px solid var(--cm-line);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 -4px 16px rgba(28, 50, 42, 0.05);
  backdrop-filter: blur(12px);
}

.app-tabbar :deep(.van-tabbar-item) {
  color: var(--cm-muted);
  font-size: 11px;
  font-weight: 600;
  transition: color 160ms ease, transform 160ms ease;
}

.app-tabbar :deep(.van-tabbar-item__icon) {
  margin-bottom: 2px;
}

.app-tabbar :deep(.van-tabbar-item--active) {
  background: #fff;
  color: var(--cm-primary);
}

.app-tabbar :deep(.van-tabbar-item--active .van-tabbar-item__icon) {
  transform: translateY(-1px);
}
</style>

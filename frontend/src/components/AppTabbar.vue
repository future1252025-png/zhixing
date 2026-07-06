<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const activePath = computed(() => route.path)
</script>

<template>
  <van-tabbar class="app-tabbar" :model-value="activePath" route safe-area-inset-bottom>
    <van-tabbar-item to="/home" name="/home" icon="chat-o">会话</van-tabbar-item>
    <van-tabbar-item to="/courses" name="/courses" icon="notes-o">课表</van-tabbar-item>
    <van-tabbar-item to="/schedule" name="/schedule" icon="guide-o">建议</van-tabbar-item>
    <van-tabbar-item to="/profile" name="/profile" icon="user-o">我的</van-tabbar-item>
  </van-tabbar>
</template>

<style scoped>
.app-tabbar {
  border-top: 1px solid var(--cm-line);
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 -10px 28px rgba(28, 50, 42, 0.08);
  backdrop-filter: blur(18px);
}

.app-tabbar :deep(.van-tabbar-item) {
  position: relative;
  color: var(--cm-muted);
  font-size: 11px;
  font-weight: 700;
  transition: color var(--cm-motion), transform var(--cm-motion);
}

.app-tabbar :deep(.van-tabbar-item::before) {
  position: absolute;
  top: 7px;
  left: 50%;
  width: 18px;
  height: 3px;
  border-radius: 999px;
  background: transparent;
  transform: translateX(-50%);
  content: "";
  transition: background var(--cm-motion), width var(--cm-motion);
}

.app-tabbar :deep(.van-tabbar-item__icon) {
  margin-bottom: 2px;
}

.app-tabbar :deep(.van-tabbar-item--active) {
  background: transparent;
  color: var(--cm-primary);
}

.app-tabbar :deep(.van-tabbar-item--active::before) {
  width: 26px;
  background: var(--cm-primary);
}

.app-tabbar :deep(.van-tabbar-item--active .van-tabbar-item__icon) {
  transform: translateY(-1px);
}
</style>

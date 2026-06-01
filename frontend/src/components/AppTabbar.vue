<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const activePath = computed(() => route.path)
</script>

<template>
  <van-tabbar class="app-tabbar" :model-value="activePath" route safe-area-inset-bottom>
    <van-tabbar-item to="/home" name="/home" icon="wap-home-o">首页</van-tabbar-item>
    <van-tabbar-item to="/courses" name="/courses" icon="notes-o">课程</van-tabbar-item>
    <van-tabbar-item to="/schedule" name="/schedule" icon="guide-o">建议</van-tabbar-item>
    <van-tabbar-item to="/profile" name="/profile" icon="user-o">我的</van-tabbar-item>
  </van-tabbar>
</template>

<style scoped>
.app-tabbar {
  right: 10px;
  bottom: 8px;
  left: 10px;
  width: auto;
  max-width: 460px;
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid rgb(228 231 236 / 90%);
  border-radius: 8px;
  box-shadow: 0 12px 30px rgb(16 24 40 / 14%);
}
</style>

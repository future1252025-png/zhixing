<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const activePath = computed(() => route.path)
</script>

<template>
  <van-tabbar :model-value="activePath" route safe-area-inset-bottom>
    <van-tabbar-item to="/home" name="/home" icon="home-o">首页</van-tabbar-item>
    <van-tabbar-item to="/courses" name="/courses" icon="notes-o">课程</van-tabbar-item>
    <van-tabbar-item to="/schedule" name="/schedule" icon="guide-o">建议</van-tabbar-item>
    <van-tabbar-item to="/profile" name="/profile" icon="user-o">我的</van-tabbar-item>
  </van-tabbar>
</template>

<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
const isWeb = !Capacitor.isNativePlatform()
</script>

<template>
  <details v-if="isWeb" class="web-install-hint">
    <summary>把智行放到主屏幕</summary>
    <p>iPhone：在 Safari 中点“分享”，选择“添加到主屏幕”。</p>
    <p>安卓：在浏览器菜单中选择“添加到主屏幕”（部分浏览器名称不同）。</p>
    <small>添加后打开更方便，使用时仍需联网。</small>
  </details>
</template>

<style scoped>
.web-install-hint { padding: 16px 20px; margin: 16px 0; border: 1px solid #d9e0d3; border-radius: 20px; background: #fffef8; color: #405c45; }
summary { cursor: pointer; min-height: 32px; font-weight: 650; }
p { font-size: 14px; line-height: 1.7; margin: 8px 0; }
small { color: #63705d; }
</style>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { useRouter } from 'vue-router'

const visible = ref(false)
const router = useRouter()
let removeRouterHandler: (() => void) | undefined
function preloadFailed(event: Event) { event.preventDefault(); visible.value = true }
function refresh() { window.location.reload() }
onMounted(() => {
  if (Capacitor.isNativePlatform()) return
  window.addEventListener('vite:preloadError', preloadFailed)
  removeRouterHandler = router.onError(error => {
    if (/dynamically imported module|Importing a module script failed|Loading chunk|module script/i.test(error.message)) visible.value = true
  })
})
onUnmounted(() => { window.removeEventListener('vite:preloadError', preloadFailed); removeRouterHandler?.() })
</script>

<template>
  <aside v-if="visible" class="web-update-notice" role="alert">
    <span>页面资源暂时打不开，可能有新版本。联网后可刷新，未保存的内容会丢失。</span>
    <button type="button" @click="refresh">刷新页面</button>
    <button type="button" @click="visible = false">稍后</button>
  </aside>
</template>

<style scoped>
.web-update-notice { position: fixed; z-index: 4000; left: max(12px, env(safe-area-inset-left)); right: max(12px, env(safe-area-inset-right)); top: max(12px, env(safe-area-inset-top)); display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 16px; border: 1px solid #a7b99f; border-radius: 18px; background: #fffef8; color: #354c39; box-shadow: 0 8px 30px #26362a22; font-size: 14px; line-height: 1.6; }
span { flex: 1 1 240px; }
button { min-height: 44px; border: 1px solid #d0dbca; border-radius: 12px; background: #edf3e8; padding: 8px 14px; color: inherit; font: inherit; cursor: pointer; }
</style>

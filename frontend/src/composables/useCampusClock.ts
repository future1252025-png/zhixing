import { App } from '@capacitor/app'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { onMounted, onUnmounted, readonly, ref } from 'vue'

/** Tick on minute boundaries, and immediately after browser/native background suspension. */
export function useCampusClock() {
  const now = ref(new Date())
  let timer: ReturnType<typeof setTimeout> | undefined
  let nativeHandle: PluginListenerHandle | undefined
  let disposed = false

  function refresh() {
    if (disposed) return
    clearTimeout(timer)
    now.value = new Date()
    timer = setTimeout(refresh, 60_000 - (now.value.getTime() % 60_000))
  }
  function onVisible() {
    if (document.visibilityState === 'visible') refresh()
  }

  onMounted(() => {
    refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', onVisible)
    if (Capacitor.isNativePlatform()) {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) refresh()
      }).then((handle) => {
        if (disposed) void handle.remove()
        else nativeHandle = handle
      }).catch(() => { /* Browser visibility events and the timer remain available. */ })
    }
  })
  onUnmounted(() => {
    disposed = true
    clearTimeout(timer)
    window.removeEventListener('focus', refresh)
    window.removeEventListener('pageshow', refresh)
    document.removeEventListener('visibilitychange', onVisible)
    void nativeHandle?.remove()
  })
  return readonly(now)
}

import { onBeforeUnmount, onMounted } from 'vue'
import { App } from '@capacitor/app'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { MAP_LOCATION_FRESH_MS, useCampusMapStore } from '@/stores/campusMap'

/** Foreground map pages share a fresh fix; never start background tracking. */
export function useMapAutoLocation() {
  const session = useCampusMapStore()
  let disposed = false
  let appActive = true
  let timer: ReturnType<typeof setInterval> | undefined
  let listener: PluginListenerHandle | undefined
  function refresh() {
    if (!disposed && appActive && document.visibilityState !== 'hidden') void session.ensurePosition()
  }
  onMounted(() => {
    refresh()
    timer = setInterval(refresh, MAP_LOCATION_FRESH_MS)
    document.addEventListener('visibilitychange', refresh)
    if (Capacitor.isNativePlatform()) {
      void App.addListener('appStateChange', ({ isActive }) => {
        appActive = isActive
        if (isActive) refresh()
      }).then(handle => { if (disposed) void handle.remove(); else listener = handle }).catch(() => {})
    }
  })
  onBeforeUnmount(() => {
    disposed = true
    clearInterval(timer)
    document.removeEventListener('visibilitychange', refresh)
    void listener?.remove()
  })
  return session
}

import { onMounted, onUnmounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRemindersStore } from '@/stores/reminders'
import { reminderCapability } from '@/services/reminderNotifications'

// Permission checks never request OS authorization. Only a user gesture calls enableDevice.
export function useReminderDevice() {
  const auth = useAuthStore()
  const store = useRemindersStore()
  const capabilityReady = ref(false)
  const permissionBusy = ref(false)
  const permissionError = ref('')
  let disposed = false
  let checkRevision = 0
  const isCurrent = (userId: number | null) => !disposed && userId !== null
    && auth.currentUser?.id === userId && store.userId === userId

  async function checkCapability() {
    if (permissionBusy.value) return
    const userId = auth.currentUser?.id ?? null
    const revision = ++checkRevision
    try {
      const capability = await reminderCapability()
      if (!isCurrent(userId) || revision !== checkRevision) return
      store.capability = capability
      capabilityReady.value = true
      permissionError.value = ''
      // An existing OS grant needs no new prompt. Never undo an explicit in-app pause.
      if (capability.permission === 'granted' && !store.devicePreferenceSet) store.setDeviceEnabled(true)
    } catch (error) {
      if (isCurrent(userId) && revision === checkRevision) permissionError.value = error instanceof Error ? error.message : '暂时无法检查通知权限'
    }
  }

  async function enableDevice(): Promise<boolean> {
    if (permissionBusy.value) return false
    const userId = store.userId
    permissionBusy.value = true
    permissionError.value = ''
    checkRevision++
    try {
      const capability = await reminderCapability(true)
      if (!isCurrent(userId)) return false
      store.capability = capability
      capabilityReady.value = true
      if (capability.permission !== 'granted') {
        permissionError.value = '尚未获得通知权限，请在系统或浏览器设置中允许智行发送通知后重试'
        return false
      }
      store.setDeviceEnabled(true)
      window.dispatchEvent(new Event('campusmind:sync-reminders'))
      return true
    } catch (error) {
      if (isCurrent(userId)) permissionError.value = error instanceof Error ? error.message : '无法开启通知，请检查系统权限设置'
      return false
    } finally { permissionBusy.value = false }
  }

  function resume() { if (document.visibilityState === 'visible') void checkCapability() }
  onMounted(() => {
    void checkCapability()
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', resume)
  })
  onUnmounted(() => {
    disposed = true
    window.removeEventListener('focus', resume)
    document.removeEventListener('visibilitychange', resume)
  })
  return { capabilityReady, permissionBusy, permissionError, enableDevice, checkCapability }
}

import { defineStore } from 'pinia'
import { Capacitor } from '@capacitor/core'
import { getReminders, saveReminders } from '@/api/reminders'
import { extractBusinessError } from '@/api/errors'
import type { ReminderCapability, ReminderPlan } from '@/types/reminder'
import { emptyReminderPlan, isReminderPlan } from '@/utils/reminders'
import { createScopedStorage } from '@/utils/scopedStorage'

const initialCapability = (): ReminderCapability => ({
  platform: Capacitor.getPlatform() === 'android' ? 'android' : 'web', permission: 'prompt', exact: false
})

export const useRemindersStore = defineStore('reminders', {
  state: () => ({
    plan: emptyReminderPlan(), userId: null as number | null, loaded: false, loading: false, saving: false,
    error: '', offline: false, generation: 0, deviceEnabled: false, devicePreferenceSet: false,
    permissionPromptDismissed: false,
    capability: initialCapability(),
    scheduledCount: 0, coverageUntil: '', truncated: false, scheduleError: '', scheduling: false
  }),
  actions: {
    reset(userId: number | null = null) {
      this.generation++
      this.userId = userId
      this.plan = emptyReminderPlan()
      this.loaded = false
      this.loading = false
      this.saving = false
      this.error = ''
      this.offline = false
      this.scheduledCount = 0
      this.scheduleError = ''
      this.coverageUntil = ''
      this.truncated = false
      this.scheduling = false
      this.capability = initialCapability()
      this.deviceEnabled = false
      this.devicePreferenceSet = false
      this.permissionPromptDismissed = false
      if (userId) {
        try {
          const preference = createScopedStorage(userId).get('reminder-device-enabled')
          this.deviceEnabled = preference === 'true'
          this.devicePreferenceSet = preference === 'true' || preference === 'false'
        } catch { /* storage unavailable */ }
      }
    },
    async load(userId: number, force = false) {
      if (this.userId !== userId) this.reset(userId)
      if (this.loading || (this.loaded && !force)) return
      const generation = this.generation
      this.loading = true
      this.error = ''
      try {
        const plan = await getReminders()
        if (generation !== this.generation) return
        if (!this.loaded || plan.revision >= this.plan.revision) this.plan = plan
        this.loaded = true
        this.offline = false
        try { createScopedStorage(userId).set('reminder-plan', JSON.stringify(this.plan)) } catch { /* server remains authoritative */ }
      } catch (error) {
        if (generation !== this.generation) return
        this.error = extractBusinessError(error).message
        this.offline = true
        // Existing reminders remain available offline; never fabricate a successful sync.
        if (!this.loaded) {
          try {
            const cached = JSON.parse(createScopedStorage(userId).get('reminder-plan') || 'null')
            if (isReminderPlan(cached)) {
              this.plan = cached
              this.loaded = true
            }
          } catch { /* corrupted cache is ignored */ }
        }
      } finally { if (generation === this.generation) this.loading = false }
    },
    async save(plan: ReminderPlan): Promise<void> {
      if (!this.userId || !this.loaded || this.saving) throw new Error('提醒尚未加载完成，请稍后重试')
      const userId = this.userId
      const generation = this.generation
      this.saving = true
      this.error = ''
      try {
        const result = await saveReminders(plan)
        if (generation !== this.generation) throw new Error('账号已切换')
        this.plan = result
        this.offline = false
        try { createScopedStorage(userId).set('reminder-plan', JSON.stringify(result)) } catch { /* saved on server */ }
      } catch (error) {
        if (generation === this.generation) this.error = extractBusinessError(error).message
        throw error
      } finally { if (generation === this.generation) this.saving = false }
    },
    setDeviceEnabled(enabled: boolean) {
      this.deviceEnabled = enabled
      this.devicePreferenceSet = true
      if (this.userId) {
        try { createScopedStorage(this.userId).set('reminder-device-enabled', String(enabled)) } catch { /* session-only */ }
      }
    }
  }
})

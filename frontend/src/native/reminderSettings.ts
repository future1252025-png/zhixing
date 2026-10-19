import { Capacitor, registerPlugin } from '@capacitor/core'

export type ReminderBackgroundStatus = { manufacturer: string; batteryOptimized: boolean; backgroundRestricted: boolean }
const settings = registerPlugin<{
  status(): Promise<ReminderBackgroundStatus>
  open(options: { target: 'battery' | 'app' }): Promise<void>
}>('ReminderSettings')

export async function reminderBackgroundStatus(): Promise<ReminderBackgroundStatus | null> {
  if (Capacitor.getPlatform() !== 'android') return null
  return settings.status()
}
export async function openReminderBackgroundSettings(target: 'battery' | 'app') {
  if (Capacitor.getPlatform() === 'android') await settings.open({ target })
}

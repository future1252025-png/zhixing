import request from './request'
import type { ReminderPlan } from '@/types/reminder'

export async function getReminders(): Promise<ReminderPlan> {
  return (await request.get<ReminderPlan>('/api/reminders')).data
}
export async function saveReminders(plan: ReminderPlan): Promise<ReminderPlan> {
  return (await request.put<ReminderPlan>('/api/reminders', plan)).data
}

import request from './request'
import type {
  ScheduleSuggestion,
  ScheduleSuggestionPayload
} from '@/types/schedule'

export async function getScheduleSuggestion(
  payload: ScheduleSuggestionPayload
): Promise<ScheduleSuggestion> {
  const response = await request.post<ScheduleSuggestion>(
    '/api/schedule/suggestion',
    payload
  )
  return response.data
}

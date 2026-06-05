import request from './request'

export type BuildingMessage = {
  id: number
  building_id: number
  content: string
  display_name: string
  created_at: string
  latitude: number | null
  longitude: number | null
  location_source: 'browser' | 'manual' | null
  distance_to_building_meters: number | null
}

export type MessageLocationSource = 'browser' | 'manual'

export type CreateBuildingMessagePayload = {
  content: string
  latitude: number
  longitude: number
  location_source: MessageLocationSource
}

export function validateMessageContent(content: string): string | null {
  const text = content.trim()
  if (!text) {
    return '留言内容不能为空'
  }
  if (text.length > 200) {
    return '留言内容不能超过 200 字'
  }
  return null
}

export async function getBuildingMessages(buildingId: number): Promise<BuildingMessage[]> {
  const response = await request.get<BuildingMessage[]>(
    `/api/buildings/${buildingId}/messages`
  )
  return response.data
}

export async function createBuildingMessage(
  buildingId: number,
  payload: CreateBuildingMessagePayload
): Promise<BuildingMessage> {
  const response = await request.post<BuildingMessage>(
    `/api/buildings/${buildingId}/messages`,
    {
      ...payload,
      content: payload.content.trim()
    }
  )
  return response.data
}

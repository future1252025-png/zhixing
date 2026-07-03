import request from './request'

export type BuildingMessage = {
  id: number
  building_id: number
  content: string
  display_name: string
  room_name: string | null
  created_at: string
  latitude: number | null
  longitude: number | null
  location_source: 'browser' | 'manual' | null
  distance_to_building_meters: number | null
}

export type MessageLocationSource = 'browser' | 'manual'

export type CreateBuildingMessagePayload = {
  content: string
  room_name?: string | null
  latitude: number
  longitude: number
  location_source: MessageLocationSource
}

export type BuildingChatRoom = {
  name: string
  room_name: string | null
  message_count: number
  is_general: boolean
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

export async function getBuildingMessages(
  buildingId: number,
  roomName?: string | null
): Promise<BuildingMessage[]> {
  if (!roomName) {
    const response = await request.get<BuildingMessage[]>(
      `/api/buildings/${buildingId}/messages`
    )
    return response.data
  }
  const response = await request.get<BuildingMessage[]>(
    `/api/buildings/${buildingId}/messages`,
    { params: { room_name: roomName } }
  )
  return response.data
}

export async function getBuildingChatrooms(buildingId: number): Promise<BuildingChatRoom[]> {
  const response = await request.get<BuildingChatRoom[]>(
    `/api/buildings/${buildingId}/chatrooms`
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
      room_name: payload.room_name?.trim() || null,
      content: payload.content.trim()
    }
  )
  return response.data
}

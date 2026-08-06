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
  location_source: 'native' | 'browser' | 'manual' | null
  distance_to_building_meters: number | null
}

export type MessageLocationSource = 'native' | 'browser' | 'manual'

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

export type GetBuildingMessagesOptions = {
  roomName?: string | null
  limit?: number
  offset?: number
  /** 游标分页：只返回 id 小于该值的更早留言，排序不变。 */
  before_id?: number
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
  optionsOrRoomName?: GetBuildingMessagesOptions | string | null
): Promise<BuildingMessage[]> {
  const options = typeof optionsOrRoomName === 'string' || optionsOrRoomName === null
    ? { roomName: optionsOrRoomName }
    : optionsOrRoomName
  const params: Record<string, number | string> = {}
  const roomName = options?.roomName?.trim()
  if (roomName) {
    params.room_name = roomName
  }
  if (options?.limit !== undefined) {
    params.limit = options.limit
  }
  if (options?.offset !== undefined) {
    params.offset = options.offset
  }
  if (options?.before_id !== undefined) {
    params.before_id = options.before_id
  }
  const config = Object.keys(params).length ? { params } : undefined
  const url = `/api/buildings/${buildingId}/messages`
  const response = config
    ? await request.get<BuildingMessage[]>(url, config)
    : await request.get<BuildingMessage[]>(url)
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

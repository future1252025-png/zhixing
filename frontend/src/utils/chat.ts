import type { Building } from '@/api/buildings'
import type { Course } from '@/types/course'
import { filterBuildingsByKeyword } from '@/utils/buildings'

export const RECENT_CHAT_STORAGE_KEY = 'campusmind-recent-chats'
const MAX_RECENT_CHAT_COUNT = 6

export type RecentChatEntry = {
  buildingId: number
  buildingName: string
  roomName: string | null
}

export type ChatSearchResult = {
  building: Building
  roomName: string | null
}

export type NextCourseChatTarget = {
  buildingId: number | null
  buildingName: string | null
  roomName: string | null
  title: string
  subtitle: string
}

type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function normalizeKeyword(value: string): string {
  return value.trim()
}

function extractRoomName(query: string): string | null {
  const text = normalizeKeyword(query)
  if (!text) {
    return null
  }
  const match = text.match(/([\u4e00-\u9fa5A-Za-z]*\d{1,3}[-号楼室]?\d{2,4}[A-Za-z]?)/)
  return match?.[1] ?? null
}

function extractBuildingKeyword(query: string): string {
  const text = normalizeKeyword(query)
  const roomName = extractRoomName(text)
  if (!roomName) {
    return text
  }
  const buildingPart = roomName.match(/^(.+?)(?:[-号室]\d{2,4}[A-Za-z]?)$/)?.[1]
  return buildingPart || text
}

export function buildNextCourseChatTarget(course: Course): NextCourseChatTarget {
  const roomName = course.room_name.trim() || null
  const buildingName = course.building?.name ?? null
  const sourceLocation = course.source_location?.trim()
  return {
    buildingId: course.building_id,
    buildingName,
    roomName,
    title: course.course_name,
    subtitle: sourceLocation || (
      buildingName && roomName ? `${buildingName} · ${roomName}` : buildingName || roomName || '地点待补充'
    )
  }
}

export function buildChatSearchResults(
  buildings: Building[],
  query: string,
  limit = 6
): ChatSearchResult[] {
  const keyword = extractBuildingKeyword(query)
  const roomName = extractRoomName(query)
  const visibleBuildings = filterBuildingsByKeyword(buildings, keyword, limit)
  return visibleBuildings.map((building) => ({
    building,
    roomName
  }))
}

export function readRecentChatEntries(storage: StorageLike): RecentChatEntry[] {
  try {
    const raw = storage.getItem(RECENT_CHAT_STORAGE_KEY)
    if (!raw) {
      return []
    }
    const value = JSON.parse(raw)
    if (!Array.isArray(value)) {
      return []
    }
    return value
      .filter((item): item is RecentChatEntry =>
        Number.isInteger(item?.buildingId) &&
        typeof item?.buildingName === 'string' &&
        (typeof item?.roomName === 'string' || item?.roomName === null)
      )
      .slice(0, MAX_RECENT_CHAT_COUNT)
  } catch {
    return []
  }
}

export function rememberRecentChatEntry(storage: StorageLike, entry: RecentChatEntry): RecentChatEntry[] {
  const normalizedEntry = {
    buildingId: entry.buildingId,
    buildingName: entry.buildingName,
    roomName: entry.roomName?.trim() || null
  }
  const existing = readRecentChatEntries(storage).filter(
    (item) =>
      item.buildingId !== normalizedEntry.buildingId ||
      item.roomName !== normalizedEntry.roomName
  )
  const nextEntries = [normalizedEntry, ...existing].slice(0, MAX_RECENT_CHAT_COUNT)
  storage.setItem(RECENT_CHAT_STORAGE_KEY, JSON.stringify(nextEntries))
  return nextEntries
}

export function formatChatEntryLabel(entry: Pick<RecentChatEntry, 'buildingName' | 'roomName'>): string {
  return entry.roomName ? `${entry.buildingName} · ${entry.roomName}` : entry.buildingName
}

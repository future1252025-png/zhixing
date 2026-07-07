import type { BuildingMessage } from '@/api/messages'

export const MESSAGE_PAGE_SIZE = 50

export function mergeOlderMessages(
  currentMessages: BuildingMessage[],
  olderMessages: BuildingMessage[]
): BuildingMessage[] {
  const currentIds = new Set(currentMessages.map((message) => message.id))
  const uniqueOlderMessages = olderMessages.filter((message) => !currentIds.has(message.id))
  return [...uniqueOlderMessages, ...currentMessages]
}

export function hasMoreMessagePages(
  latestPage: BuildingMessage[],
  pageSize = MESSAGE_PAGE_SIZE
): boolean {
  return latestPage.length === pageSize
}

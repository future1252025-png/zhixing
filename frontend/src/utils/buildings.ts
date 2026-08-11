export type SearchableBuilding = {
  id: number
  name: string
  type?: string | null
  description?: string | null
  walk_hint?: string | null
}

const CAMPUS_BUILDING_PREFIX = /^湖北大学\s*(?:(?:[（(]\s*武昌(?:主)?校区\s*[）)])|武昌(?:主)?校区)?\s*(?:[-—–·•:：/\\|]\s*)*/
const INTERNAL_DESCRIPTION_TEXT = /(?:，|,)?\s*来源于高德地图采点工具[。.]?/g
const INTERNAL_WALK_HINT_TEXT = /来自真实地图采点，建议演示前人工确认名称和位置[。.]?/g

function cleanDisplayCopy(value: string | null | undefined, pattern: RegExp): string {
  return (value ?? '')
    .replace(pattern, '')
    .replace(/\s+/g, ' ')
    .replace(/^[，,。.]|[，,]\s*$/g, '')
    .trim()
}

/**
 * 地点原名用于搜索、匹配和路线；界面只展示校区前缀之后的具体建筑名。
 */
export function formatBuildingDisplayName(value: string): string {
  const name = value.trim()
  if (!name) return ''

  const conciseName = name.replace(CAMPUS_BUILDING_PREFIX, '').trim()
  return conciseName || name
}

/** 仅清理采集维护备注；原始字段仍保留用于搜索和数据维护。 */
export function formatBuildingDescription(value: string | null | undefined): string {
  return cleanDisplayCopy(value, INTERNAL_DESCRIPTION_TEXT) || '校园里的常用地点。'
}

/** 隐藏面向维护人员的采点提示，给普通用户留下可理解的步行说明。 */
export function formatBuildingWalkHint(value: string | null | undefined): string {
  return cleanDisplayCopy(value, INTERNAL_WALK_HINT_TEXT) || '校园内步行可达'
}

function normalizeKeyword(value: string): string {
  return value.trim().toLowerCase()
}

function getSearchText(building: SearchableBuilding): string {
  return [
    building.name,
    building.type,
    building.description,
    building.walk_hint
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function filterBuildingsByKeyword<T extends SearchableBuilding>(
  buildings: T[],
  keyword: string,
  limit = 80
): T[] {
  const normalized = normalizeKeyword(keyword)
  if (!normalized) {
    return buildings.slice(0, limit)
  }

  return buildings
    .map((building, index) => {
      const name = building.name.toLowerCase()
      const searchText = getSearchText(building)
      if (!searchText.includes(normalized)) {
        return null
      }

      const score =
        name === normalized ? 0 : name.startsWith(normalized) ? 1 : name.includes(normalized) ? 2 : 3
      return { building, index, score }
    })
    .filter((item): item is { building: T; index: number; score: number } => item !== null)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score
      }
      return left.index - right.index
    })
    .slice(0, limit)
    .map((item) => item.building)
}

export function includeSelectedBuilding<T extends SearchableBuilding>(
  visibleBuildings: T[],
  allBuildings: T[],
  selectedBuildingId: number | null | undefined
): T[] {
  if (!selectedBuildingId || visibleBuildings.some((building) => building.id === selectedBuildingId)) {
    return visibleBuildings
  }

  const selected = allBuildings.find((building) => building.id === selectedBuildingId)
  return selected ? [selected, ...visibleBuildings] : visibleBuildings
}

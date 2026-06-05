import type { Building } from '@/api/buildings'

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase()
}

export function filterMapBuildings(
  buildings: Building[],
  query: string,
  limit = 8
): Building[] {
  const keyword = normalizeSearchText(query)
  if (!keyword) {
    return []
  }

  return buildings
    .filter((building) => {
      const target = [
        building.name,
        building.type,
        building.description,
        building.walk_hint ?? ''
      ].join(' ').toLocaleLowerCase()
      return target.includes(keyword)
    })
    .slice(0, limit)
}

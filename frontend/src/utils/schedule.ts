import type {
  ScheduleBuildingInfo,
  ScheduleLocationInfo,
  ScheduleStatus
} from '@/types/schedule'

export type StatusMeta = {
  label: string
  className: string
}

export type RouteVisualPoint = {
  left: number
  top: number
}

export type RouteVisualPoints = {
  from: RouteVisualPoint
  to: RouteVisualPoint
  lineWidth: number
  lineAngle: number
}

export type SearchableScheduleLocation = {
  id: number
  name: string
  type?: string | null
  latitude: number
  longitude: number
}

export function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} 米`
  }
  return `${(distanceMeters / 1000).toFixed(1)} 公里`
}

export function getStatusMeta(status: ScheduleStatus): StatusMeta {
  const statusMap: Record<ScheduleStatus, StatusMeta> = {
    normal: {
      label: '时间充足',
      className: 'status-normal'
    },
    tight: {
      label: '时间紧张',
      className: 'status-tight'
    },
    likely_late: {
      label: '可能迟到',
      className: 'status-late'
    }
  }
  return statusMap[status]
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function getRouteVisualPoints(
  from: Pick<ScheduleLocationInfo, 'latitude' | 'longitude'>,
  to: Pick<ScheduleBuildingInfo, 'latitude' | 'longitude'>
): RouteVisualPoints {
  const minLat = Math.min(from.latitude, to.latitude)
  const maxLat = Math.max(from.latitude, to.latitude)
  const minLng = Math.min(from.longitude, to.longitude)
  const maxLng = Math.max(from.longitude, to.longitude)
  const latRange = maxLat - minLat || 0.001
  const lngRange = maxLng - minLng || 0.001

  const fromPoint = {
    left: clamp(16 + ((from.longitude - minLng) / lngRange) * 68, 16, 84),
    top: clamp(84 - ((from.latitude - minLat) / latRange) * 68, 16, 84)
  }
  const toPoint = {
    left: clamp(16 + ((to.longitude - minLng) / lngRange) * 68, 16, 84),
    top: clamp(84 - ((to.latitude - minLat) / latRange) * 68, 16, 84)
  }

  const deltaX = toPoint.left - fromPoint.left
  const deltaY = toPoint.top - fromPoint.top

  return {
    from: fromPoint,
    to: toPoint,
    lineWidth: Math.sqrt(deltaX ** 2 + deltaY ** 2),
    lineAngle: (Math.atan2(deltaY, deltaX) * 180) / Math.PI
  }
}

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/(\d+)号教学楼/g, '教$1')
    .replace(/第?(\d+)教学楼/g, '教$1')
}

export function filterScheduleLocations<T extends SearchableScheduleLocation>(
  locations: T[],
  query: string,
  limit = 8
): T[] {
  const text = normalizeSearchText(query)
  if (!text) {
    return locations.slice(0, limit)
  }
  return locations
    .filter((location) => {
      const name = normalizeSearchText(location.name)
      const type = normalizeSearchText(location.type ?? '')
      return name.includes(text) || type.includes(text) || text.includes(name)
    })
    .slice(0, limit)
}

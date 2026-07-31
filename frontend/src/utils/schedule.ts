import type {
  ScheduleBuildingInfo,
  ScheduleLocationInfo,
  SchedulePageError,
  ScheduleStatus
} from '@/types/schedule'
import type { BusinessError } from '@/types/api'

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

export type LocationDisplayInfo = {
  title: string
  subtitle: string
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

function positiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function toSchedulePageError(error: BusinessError): SchedulePageError {
  const base = {
    semesterStatus: null,
    courseId: null,
    courseName: null
  } as const

  switch (error.code) {
    case 'semester_unconfigured':
      return {
        ...base,
        code: 'semester_unconfigured',
        title: '请先设置学期',
        message: '设置开学日期和教学周数后，才能按真实教学周生成出发建议。'
      }
    case 'semester_not_active': {
      const semesterStatus = error.details.semester_status === 'before_term'
        ? 'before_term'
        : error.details.semester_status === 'after_term'
          ? 'after_term'
          : null
      return {
        ...base,
        code: 'semester_not_active',
        semesterStatus,
        title: semesterStatus === 'before_term' ? '学期尚未开始' : '本学期已结束',
        message: semesterStatus === 'before_term'
          ? '现在不会提前套用第 1 周课程，开学后会自动启用。'
          : '当前日期已经超过教学周范围，请设置新学期。'
      }
    }
    case 'no_upcoming_course':
      return {
        ...base,
        code: 'no_upcoming_course',
        title: '本周暂无后续课程',
        message: '这一教学周接下来没有要出发的课程，可以安心安排自己的时间。'
      }
    case 'course_location_incomplete': {
      const courseId = positiveInteger(error.details.course_id)
      const courseName = nonEmptyString(error.details.course_name)
      const detailFields = Array.isArray(error.details.missing_fields)
        ? error.details.missing_fields
        : error.fields
      const missingFields = new Set(
        detailFields.filter((field): field is string => typeof field === 'string')
      )
      const missingBuilding = missingFields.has('building_id')
      const missingRoom = missingFields.has('room_name')
      const locationProblem = missingBuilding && !missingRoom
        ? '地图地点未匹配'
        : !missingBuilding && missingRoom
          ? '教室信息不完整'
          : '地点不完整'
      const recoveryMessage = missingBuilding && !missingRoom
        ? '请为这门课选择地图上的上课建筑，再重新生成出发建议。'
        : !missingBuilding && missingRoom
          ? '请补全这门课的教室信息，再重新生成出发建议。'
          : '请补全上课建筑和完整教室，再重新生成出发建议。'
      return {
        ...base,
        code: 'course_location_incomplete',
        courseId,
        courseName,
        title: courseName
          ? `“${courseName}”${locationProblem}`
          : `课程 #${courseId ?? '未知'} ${locationProblem}`,
        message: recoveryMessage
      }
    }
    case 'schedule_conflict':
      return {
        ...base,
        code: 'schedule_conflict',
        title: '下一上课时间存在冲突',
        message: '同一时间有多门课程，先在课表中确认正确安排。'
      }
    case 'course_data_invalid': {
      const courseId = positiveInteger(error.details.course_id)
      return {
        ...base,
        code: 'course_data_invalid',
        courseId,
        title: `课程 #${courseId ?? '未知'} 的时间或周次无法识别`,
        message: '请修正这门课程的时间和周次后再试。'
      }
    }
    default:
      return {
        ...base,
        code: 'unexpected_error',
        title: '暂时没能生成出发建议',
        message: '请稍后重试；如果仍然失败，可以先检查课表和当前位置。'
      }
  }
}

export function getLocationDisplayInfo(
  location: Pick<SearchableScheduleLocation, 'name' | 'type'>
): LocationDisplayInfo {
  const name = location.name.trim()
  const type = location.type?.trim() || '校园地点'
  const campusPrefix = name.includes('湖北大学') && name.includes('武昌校区')
    ? '湖北大学武昌校区'
    : ''
  const title = name
    .replace(/^湖北大学(?:\(|（)武昌校区(?:\)|）)/, '')
    .replace(/^湖北大学武昌校区/, '')
    .replace(/^湖北大学[-—·\s]*/, '')
    .replace(/^[-—·\s]+/, '')
    .trim()

  if (!title || title === name) {
    return {
      title: name,
      subtitle: type
    }
  }

  return {
    title,
    subtitle: campusPrefix ? `${campusPrefix} · ${type}` : type
  }
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

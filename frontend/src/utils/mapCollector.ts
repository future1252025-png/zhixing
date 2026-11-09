import type { LatLngPoint } from './geo'

export type CollectorPoint = {
  id: string
  poiId?: string | null
  name: string
  type: string
  address: string
  latitude: number
  longitude: number
  gcjLatitude: number
  gcjLongitude: number
  source: 'search' | 'click'
  selected: boolean
}

export type CollectorDraft = {
  points: CollectorPoint[]
  campusPolygonWgs: LatLngPoint[]
  boundaryMode: '默认范围' | '高德范围' | '手绘范围'
}

type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const COLLECTOR_DRAFT_KEY = 'campusmind-map-collector-draft'

const campusBaseTerms = [
  '',
  '图书馆',
  '教学楼',
  '教1',
  '教2',
  '教3',
  '教4',
  '1号教学楼',
  '2号教学楼',
  '3号教学楼',
  '4号教学楼',
  '实训大楼',
  '双创大楼',
  '实验室',
  '学院',
  '计算机学院',
  '国际教育学院',
  '生命科学学院',
  '化学化工学院',
  '体育学院',
  '艺术学院',
  '食堂',
  '宿舍',
  '学生公寓',
  '一期学生公寓',
  '二期学生公寓',
  '三期学生公寓',
  '风华园',
  '体育馆',
  '操场',
  '羽毛球场',
  '求索广场',
  '校史馆',
  '快递',
  '菜鸟',
  '超市',
  '打印',
  '校医院',
  '停车场',
  '北门',
  '南门',
  '东门',
  '西门'
]

export function buildCampusSearchKeywords(): string[] {
  return campusBaseTerms.map((term) => `湖北大学${term ? ` ${term}` : ''}`)
}

function isPoint(value: unknown): value is CollectorPoint {
  const point = value as CollectorPoint
  return (
    typeof point?.id === 'string' &&
    (point.poiId == null || (typeof point.poiId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(point.poiId))) &&
    typeof point.name === 'string' &&
    typeof point.type === 'string' &&
    typeof point.address === 'string' &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Number.isFinite(point.gcjLatitude) &&
    Number.isFinite(point.gcjLongitude) &&
    (point.source === 'search' || point.source === 'click') &&
    typeof point.selected === 'boolean'
  )
}

function isLatLngPoint(value: unknown): value is LatLngPoint {
  const point = value as LatLngPoint
  return Number.isFinite(point?.latitude) && Number.isFinite(point.longitude)
}

export function readCollectorDraft(storage: StorageLike): CollectorDraft | null {
  const raw = storage.getItem(COLLECTOR_DRAFT_KEY)
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as CollectorDraft
    if (
      !Array.isArray(parsed.points) ||
      !Array.isArray(parsed.campusPolygonWgs) ||
      !['默认范围', '高德范围', '手绘范围'].includes(parsed.boundaryMode)
    ) {
      return null
    }
    const points = parsed.points.filter(isPoint)
    const campusPolygonWgs = parsed.campusPolygonWgs.filter(isLatLngPoint)
    return {
      points,
      campusPolygonWgs,
      boundaryMode: parsed.boundaryMode
    }
  } catch {
    return null
  }
}

export function writeCollectorDraft(storage: StorageLike, draft: CollectorDraft): void {
  storage.setItem(COLLECTOR_DRAFT_KEY, JSON.stringify(draft))
}

export function clearCollectorDraft(storage: StorageLike): void {
  storage.removeItem(COLLECTOR_DRAFT_KEY)
}

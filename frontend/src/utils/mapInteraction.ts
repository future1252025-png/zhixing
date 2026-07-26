export type MapInteractionLevel = 'area' | 'mixed' | 'building'

export const MAP_DRAG_HOLD_DELAY_MS = 360
export const MAP_DRAG_MOVE_TOLERANCE_PX = 10

export function hasMapPointerMovedBeyondTolerance(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  tolerance = MAP_DRAG_MOVE_TOLERANCE_PX
): boolean {
  return Math.hypot(currentX - startX, currentY - startY) > tolerance
}

export function getMapInteractionLevel(zoom: number): MapInteractionLevel {
  if (zoom < 15.5) {
    return 'area'
  }
  if (zoom < 17.5) {
    return 'mixed'
  }
  return 'building'
}

/**
 * 命中区始终 ≥32px（触控可点下限）：低 zoom 时 pin 视觉上变小，
 * 但可点范围不缩水——"看得见的才点得到，点得到的要点得准"。
 */
export function getBuildingHitZoneSize(zoom: number, active = false): number {
  if (active) {
    return zoom >= 17.5 ? 46 : 32
  }
  const level = getMapInteractionLevel(zoom)
  if (level === 'area') {
    return 32
  }
  if (level === 'mixed') {
    return 32
  }
  return 38
}

/**
 * 普通地点 pin 只在放大到建筑层级后显示：低倍率下 102 个标点会盖住
 * 底图路网和地名文字。选中 pin 是用户的明确意图，任何倍率都保留。
 */
export function shouldShowBuildingPin(zoom: number, active = false): boolean {
  if (active) {
    return true
  }
  return getMapInteractionLevel(zoom) === 'building'
}

/** 可见水滴 pin 的宽度：针尖始终锚定在命中区几何中心 */
export function getBuildingPinSize(active = false): number {
  return active ? 24 : 20
}

export function shouldShowBuildingHighlight(active: boolean): boolean {
  return active
}

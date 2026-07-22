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

export function getBuildingHitZoneSize(zoom: number, active = false): number {
  if (active) {
    return zoom >= 17.5 ? 46 : 32
  }
  const level = getMapInteractionLevel(zoom)
  if (level === 'area') {
    return 10
  }
  if (level === 'mixed') {
    return 22
  }
  return 38
}

export function shouldShowBuildingHighlight(active: boolean): boolean {
  return active
}

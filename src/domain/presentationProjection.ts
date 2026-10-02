import type { Vector2Mm } from './types'

// Derived drawing coordinates only; scene geometry remains in physical millimeters.
export const TABLE_VIEW_OBLIQUE_PROJECTION = {
  planeYCompression: 0.72,
  planeXShear: -0.34,
  zScale: 0.6,
} as const

export function projectPresentationPoint(pointMm: Vector2Mm, elevationMm = 0): Vector2Mm {
  return {
    x: pointMm.x + pointMm.y * TABLE_VIEW_OBLIQUE_PROJECTION.planeXShear,
    y: pointMm.y * TABLE_VIEW_OBLIQUE_PROJECTION.planeYCompression -
      elevationMm * TABLE_VIEW_OBLIQUE_PROJECTION.zScale,
  }
}

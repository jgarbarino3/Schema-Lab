import { describe, expect, it } from 'vitest'
import { projectPresentationPoint } from '../domain/presentationProjection'
import { rotatePointQuarterTurns } from '../domain/geometry'
import { projectLocalOffsetToScreen, projectWorldPointToScreen } from '../canvas/renderers/tableViewProjection'
import type { QuarterTurn, ViewportState } from '../domain/types'

describe('presentation projection', () => {
  const viewport: ViewportState = {
    cameraCenterMm: { x: 150, y: -60 },
    canvasSizePx: { width: 1800, height: 1200 },
    zoomPxPerMm: 2.3,
  }

  it('preserves the established canvas projection for elevated and negative world coordinates', () => {
    for (const point of [{ x: 0, y: 0 }, { x: -45, y: 110 }, { x: 1220, y: 770 }]) {
      for (const elevation of [0, 25, 120]) {
        const projected = projectWorldPointToScreen(point, viewport, elevation)
        expect(projected.x).toBeCloseTo(900 + (point.x - 150 - 0.34 * (point.y + 60)) * 2.3, 10)
        expect(projected.y).toBeCloseTo(600 + (0.72 * (point.y + 60) - 0.6 * elevation) * 2.3, 10)
      }
    }
  })

  it('rotates local geometry before projection without changing physical inputs', () => {
    const point = Object.freeze({ x: 28, y: -12 })
    for (const rotation of [0, 1, 2, 3] as QuarterTurn[]) {
      const rotated = rotatePointQuarterTurns(point, rotation)
      const local = projectLocalOffsetToScreen(point, viewport, rotation, 17)
      const drawing = projectPresentationPoint(rotated, 17)
      expect(local.x).toBeCloseTo(drawing.x * 2.3, 10)
      expect(local.y).toBeCloseTo(drawing.y * 2.3, 10)
    }
    expect(point).toEqual({ x: 28, y: -12 })
  })
})

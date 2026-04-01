import { describe, expect, it } from 'vitest'
import {
  panViewportByScreenDelta,
  screenToWorld,
  worldToScreen,
  zoomViewportAtScreenPoint,
} from '../domain/geometry'
import type { ViewportState } from '../domain/types'

const viewport: ViewportState = {
  zoomPxPerMm: 2,
  cameraCenterMm: { x: 150, y: 120 },
  canvasSizePx: { width: 800, height: 600 },
}

describe('coordinate transforms', () => {
  it('round-trips between world and screen space', () => {
    const worldPoint = { x: 197.25, y: 83.5 }
    const screenPoint = worldToScreen(worldPoint, viewport)

    expect(screenToWorld(screenPoint, viewport)).toEqual(worldPoint)
  })

  it('keeps the cursor-fixed world point stable while zooming', () => {
    const worldPoint = { x: 182.5, y: 90 }
    const screenPoint = worldToScreen(worldPoint, viewport)
    const zoomedViewport = zoomViewportAtScreenPoint(viewport, screenPoint, 1.5)
    const zoomedScreenPoint = worldToScreen(worldPoint, zoomedViewport)

    expect(zoomedScreenPoint.x).toBeCloseTo(screenPoint.x, 5)
    expect(zoomedScreenPoint.y).toBeCloseTo(screenPoint.y, 5)
  })

  it('pans by screen deltas without changing world geometry', () => {
    const worldPoint = { x: 180, y: 144 }
    const screenPointBeforePan = worldToScreen(worldPoint, viewport)
    const pannedViewport = panViewportByScreenDelta(viewport, { x: 40, y: -20 })

    expect(worldToScreen(worldPoint, pannedViewport)).toEqual({
      x: screenPointBeforePan.x - 40,
      y: screenPointBeforePan.y + 20,
    })
  })
})

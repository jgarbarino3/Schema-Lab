import { describe, expect, it } from 'vitest'
import {
  applyPinchViewportTransform,
  clampViewportToKeepBoundsVisible,
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

  it('keeps the world point under a fixed pinch midpoint stable while zooming', () => {
    const midpointPx = { x: 420, y: 260 }
    const anchoredWorldPoint = screenToWorld(midpointPx, viewport)
    const pinchedViewport = applyPinchViewportTransform(
      viewport,
      midpointPx,
      midpointPx,
      1.5,
    )

    expect(worldToScreen(anchoredWorldPoint, pinchedViewport).x).toBeCloseTo(
      midpointPx.x,
      5,
    )
    expect(worldToScreen(anchoredWorldPoint, pinchedViewport).y).toBeCloseTo(
      midpointPx.y,
      5,
    )
  })

  it('applies combined pinch pan and zoom around the moving midpoint', () => {
    const previousMidpointPx = { x: 360, y: 280 }
    const nextMidpointPx = { x: 440, y: 320 }
    const anchoredWorldPoint = screenToWorld(previousMidpointPx, viewport)
    const pinchedViewport = applyPinchViewportTransform(
      viewport,
      previousMidpointPx,
      nextMidpointPx,
      1.25,
    )

    expect(worldToScreen(anchoredWorldPoint, pinchedViewport).x).toBeCloseTo(
      nextMidpointPx.x,
      5,
    )
    expect(worldToScreen(anchoredWorldPoint, pinchedViewport).y).toBeCloseTo(
      nextMidpointPx.y,
      5,
    )
  })

  it('clamps the camera before the active bounds can leave the viewport entirely', () => {
    const clampedViewport = clampViewportToKeepBoundsVisible(
      {
        ...viewport,
        cameraCenterMm: { x: 2200, y: -1800 },
      },
      {
        x: 0,
        y: 0,
        width: 350,
        height: 350,
      },
    )

    expect(clampedViewport.cameraCenterMm).toEqual({
      x: 410,
      y: -10,
    })
  })

  it('leaves the camera unchanged when enough of the bounds remain visible', () => {
    const unclampedViewport = clampViewportToKeepBoundsVisible(
      {
        ...viewport,
        cameraCenterMm: { x: 120, y: 110 },
      },
      {
        x: 0,
        y: 0,
        width: 350,
        height: 350,
      },
    )

    expect(unclampedViewport.cameraCenterMm).toEqual({
      x: 120,
      y: 110,
    })
  })
})

import type {
  BoundsMm,
  CanvasSizePx,
  CardinalDirection,
  QuarterTurn,
  ScreenPointPx,
  Vector2Mm,
  ViewportState,
} from './types'

export const MIN_ZOOM_PX_PER_MM = 0.4
export const MAX_ZOOM_PX_PER_MM = 8
const DEFAULT_FIT_PADDING_PX = 96

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

export function roundMm(value: number) {
  return Number(value.toFixed(6))
}

export function normalizeQuarterTurns(value: number): QuarterTurn {
  const normalized = ((value % 4) + 4) % 4

  return normalized as QuarterTurn
}

export function quarterTurnsToDegrees(value: QuarterTurn) {
  return normalizeQuarterTurns(value) * 90
}

export function rotatePointQuarterTurns(
  pointMm: Vector2Mm,
  quarterTurns: QuarterTurn,
): Vector2Mm {
  switch (normalizeQuarterTurns(quarterTurns)) {
    case 0:
      return pointMm
    case 1:
      return { x: -pointMm.y, y: pointMm.x }
    case 2:
      return { x: -pointMm.x, y: -pointMm.y }
    case 3:
      return { x: pointMm.y, y: -pointMm.x }
  }
}

export function rotateCardinalDirection(
  direction: CardinalDirection,
  quarterTurns: QuarterTurn,
): CardinalDirection {
  const directions: CardinalDirection[] = ['north', 'east', 'south', 'west']
  const directionIndex = directions.indexOf(direction)
  const nextIndex =
    (directionIndex + normalizeQuarterTurns(quarterTurns)) % directions.length

  return directions[nextIndex]
}

export function rotateBoundsQuarterTurns(
  boundsMm: BoundsMm,
  quarterTurns: QuarterTurn,
): BoundsMm {
  const corners = [
    { x: boundsMm.x, y: boundsMm.y },
    { x: boundsMm.x + boundsMm.width, y: boundsMm.y },
    { x: boundsMm.x + boundsMm.width, y: boundsMm.y + boundsMm.height },
    { x: boundsMm.x, y: boundsMm.y + boundsMm.height },
  ]
  const rotatedCorners = corners.map((corner) =>
    rotatePointQuarterTurns(corner, quarterTurns),
  )
  const xValues = rotatedCorners.map((corner) => corner.x)
  const yValues = rotatedCorners.map((corner) => corner.y)
  const minimumX = Math.min(...xValues)
  const maximumX = Math.max(...xValues)
  const minimumY = Math.min(...yValues)
  const maximumY = Math.max(...yValues)

  return {
    x: roundMm(minimumX),
    y: roundMm(minimumY),
    width: roundMm(maximumX - minimumX),
    height: roundMm(maximumY - minimumY),
  }
}

export function worldToScreen(
  pointMm: Vector2Mm,
  viewport: ViewportState,
): ScreenPointPx {
  const halfWidth = viewport.canvasSizePx.width / 2
  const halfHeight = viewport.canvasSizePx.height / 2

  return {
    x: halfWidth + (pointMm.x - viewport.cameraCenterMm.x) * viewport.zoomPxPerMm,
    y: halfHeight + (pointMm.y - viewport.cameraCenterMm.y) * viewport.zoomPxPerMm,
  }
}

export function screenToWorld(
  pointPx: ScreenPointPx,
  viewport: ViewportState,
): Vector2Mm {
  const halfWidth = viewport.canvasSizePx.width / 2
  const halfHeight = viewport.canvasSizePx.height / 2

  return {
    x: roundMm(
      viewport.cameraCenterMm.x + (pointPx.x - halfWidth) / viewport.zoomPxPerMm,
    ),
    y: roundMm(
      viewport.cameraCenterMm.y + (pointPx.y - halfHeight) / viewport.zoomPxPerMm,
    ),
  }
}

export function panViewportByScreenDelta(
  viewport: ViewportState,
  deltaPx: ScreenPointPx,
): ViewportState {
  return {
    ...viewport,
    cameraCenterMm: {
      x: roundMm(
        viewport.cameraCenterMm.x + deltaPx.x / viewport.zoomPxPerMm,
      ),
      y: roundMm(
        viewport.cameraCenterMm.y + deltaPx.y / viewport.zoomPxPerMm,
      ),
    },
  }
}

export function zoomViewportAtScreenPoint(
  viewport: ViewportState,
  pointPx: ScreenPointPx,
  zoomFactor: number,
): ViewportState {
  const nextZoom = clamp(
    viewport.zoomPxPerMm * zoomFactor,
    MIN_ZOOM_PX_PER_MM,
    MAX_ZOOM_PX_PER_MM,
  )
  const worldPointBeforeZoom = screenToWorld(pointPx, viewport)
  const halfWidth = viewport.canvasSizePx.width / 2
  const halfHeight = viewport.canvasSizePx.height / 2

  return {
    ...viewport,
    zoomPxPerMm: nextZoom,
    cameraCenterMm: {
      x: roundMm(worldPointBeforeZoom.x - (pointPx.x - halfWidth) / nextZoom),
      y: roundMm(worldPointBeforeZoom.y - (pointPx.y - halfHeight) / nextZoom),
    },
  }
}

export function applyPinchViewportTransform(
  viewport: ViewportState,
  previousMidpointPx: ScreenPointPx,
  nextMidpointPx: ScreenPointPx,
  zoomFactor: number,
): ViewportState {
  const nextZoom = clamp(
    viewport.zoomPxPerMm * zoomFactor,
    MIN_ZOOM_PX_PER_MM,
    MAX_ZOOM_PX_PER_MM,
  )
  const worldPointBeforePinch = screenToWorld(previousMidpointPx, viewport)
  const halfWidth = viewport.canvasSizePx.width / 2
  const halfHeight = viewport.canvasSizePx.height / 2

  return {
    ...viewport,
    zoomPxPerMm: nextZoom,
    cameraCenterMm: {
      x: roundMm(
        worldPointBeforePinch.x - (nextMidpointPx.x - halfWidth) / nextZoom,
      ),
      y: roundMm(
        worldPointBeforePinch.y - (nextMidpointPx.y - halfHeight) / nextZoom,
      ),
    },
  }
}

export function fitZoomPxPerMm(
  worldSizeMm: { width: number; height: number },
  canvasSizePx: CanvasSizePx,
  paddingPx = DEFAULT_FIT_PADDING_PX,
) {
  const availableWidth = Math.max(canvasSizePx.width - paddingPx, 240)
  const availableHeight = Math.max(canvasSizePx.height - paddingPx, 240)
  const widthZoom = availableWidth / worldSizeMm.width
  const heightZoom = availableHeight / worldSizeMm.height

  return clamp(
    Math.min(widthZoom, heightZoom),
    MIN_ZOOM_PX_PER_MM,
    MAX_ZOOM_PX_PER_MM,
  )
}

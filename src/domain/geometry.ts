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

export function rotatePointAroundCenterQuarterTurns(
  pointMm: Vector2Mm,
  centerMm: Vector2Mm,
  quarterTurns: QuarterTurn,
): Vector2Mm {
  const rotatedPoint = rotatePointQuarterTurns(
    {
      x: roundMm(pointMm.x - centerMm.x),
      y: roundMm(pointMm.y - centerMm.y),
    },
    quarterTurns,
  )

  return {
    x: roundMm(centerMm.x + rotatedPoint.x),
    y: roundMm(centerMm.y + rotatedPoint.y),
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

export function getBoundsCenterMm(boundsMm: BoundsMm): Vector2Mm {
  return {
    x: roundMm(boundsMm.x + boundsMm.width / 2),
    y: roundMm(boundsMm.y + boundsMm.height / 2),
  }
}

export function boundsFromPointsMm(
  firstPointMm: Vector2Mm,
  secondPointMm: Vector2Mm,
): BoundsMm {
  const minimumX = Math.min(firstPointMm.x, secondPointMm.x)
  const minimumY = Math.min(firstPointMm.y, secondPointMm.y)
  const maximumX = Math.max(firstPointMm.x, secondPointMm.x)
  const maximumY = Math.max(firstPointMm.y, secondPointMm.y)

  return {
    x: roundMm(minimumX),
    y: roundMm(minimumY),
    width: roundMm(maximumX - minimumX),
    height: roundMm(maximumY - minimumY),
  }
}

export function unionBoundsMm(boundsItems: BoundsMm[]): BoundsMm | undefined {
  const [firstBounds, ...remainingBounds] = boundsItems

  if (!firstBounds) {
    return undefined
  }

  return remainingBounds.reduce<BoundsMm>(
    (mergedBounds, boundsMm) => {
      const minimumX = Math.min(mergedBounds.x, boundsMm.x)
      const minimumY = Math.min(mergedBounds.y, boundsMm.y)
      const maximumX = Math.max(
        mergedBounds.x + mergedBounds.width,
        boundsMm.x + boundsMm.width,
      )
      const maximumY = Math.max(
        mergedBounds.y + mergedBounds.height,
        boundsMm.y + boundsMm.height,
      )

      return {
        x: roundMm(minimumX),
        y: roundMm(minimumY),
        width: roundMm(maximumX - minimumX),
        height: roundMm(maximumY - minimumY),
      }
    },
    firstBounds,
  )
}

export function boundsIntersectMm(firstBounds: BoundsMm, secondBounds: BoundsMm) {
  return !(
    firstBounds.x + firstBounds.width < secondBounds.x ||
    secondBounds.x + secondBounds.width < firstBounds.x ||
    firstBounds.y + firstBounds.height < secondBounds.y ||
    secondBounds.y + secondBounds.height < firstBounds.y
  )
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

function getRequiredVisibleSpanMm(
  boundsSpanMm: number,
  viewportSpanMm: number,
  options?: {
    edgePaddingMm?: number | Partial<Vector2Mm>
    maxVisibleViewportFraction?: number
    minVisibleFraction?: number
    minVisibleMm?: number
  },
) {
  const minVisibleFraction = options?.minVisibleFraction ?? 0.18
  const minVisibleMm = options?.minVisibleMm ?? 140
  const maxVisibleViewportFraction = options?.maxVisibleViewportFraction ?? 0.92
  const minimumVisibleSpanMm = Math.max(boundsSpanMm * minVisibleFraction, minVisibleMm)

  return Math.min(boundsSpanMm, minimumVisibleSpanMm, viewportSpanMm * maxVisibleViewportFraction)
}

export function clampViewportToKeepBoundsVisible(
  viewport: ViewportState,
  boundsMm: BoundsMm,
  options?: {
    edgePaddingMm?: number | Partial<Vector2Mm>
    maxVisibleViewportFraction?: number
    minVisibleFraction?: number
    minVisibleMm?: number
  },
): ViewportState {
  const viewportWidthMm = Math.max(1, viewport.canvasSizePx.width / viewport.zoomPxPerMm)
  const viewportHeightMm = Math.max(1, viewport.canvasSizePx.height / viewport.zoomPxPerMm)
  const halfViewportWidthMm = viewportWidthMm / 2
  const halfViewportHeightMm = viewportHeightMm / 2

  if (options?.edgePaddingMm !== undefined) {
    const edgePaddingX =
      typeof options.edgePaddingMm === 'number'
        ? options.edgePaddingMm
        : options.edgePaddingMm.x ?? 0
    const edgePaddingY =
      typeof options.edgePaddingMm === 'number'
        ? options.edgePaddingMm
        : options.edgePaddingMm.y ?? 0
    const minimumCameraCenterX = roundMm(boundsMm.x - edgePaddingX + halfViewportWidthMm)
    const maximumCameraCenterX = roundMm(
      boundsMm.x + boundsMm.width + edgePaddingX - halfViewportWidthMm,
    )
    const minimumCameraCenterY = roundMm(boundsMm.y - edgePaddingY + halfViewportHeightMm)
    const maximumCameraCenterY = roundMm(
      boundsMm.y + boundsMm.height + edgePaddingY - halfViewportHeightMm,
    )

    return {
      ...viewport,
      cameraCenterMm: {
        x:
          minimumCameraCenterX <= maximumCameraCenterX
            ? roundMm(
                clamp(
                  viewport.cameraCenterMm.x,
                  minimumCameraCenterX,
                  maximumCameraCenterX,
                ),
              )
            : roundMm((minimumCameraCenterX + maximumCameraCenterX) / 2),
        y:
          minimumCameraCenterY <= maximumCameraCenterY
            ? roundMm(
                clamp(
                  viewport.cameraCenterMm.y,
                  minimumCameraCenterY,
                  maximumCameraCenterY,
                ),
              )
            : roundMm((minimumCameraCenterY + maximumCameraCenterY) / 2),
      },
    }
  }

  const requiredVisibleWidthMm = getRequiredVisibleSpanMm(
    boundsMm.width,
    viewportWidthMm,
    options,
  )
  const requiredVisibleHeightMm = getRequiredVisibleSpanMm(
    boundsMm.height,
    viewportHeightMm,
    options,
  )
  const minimumCameraCenterX = boundsMm.x - halfViewportWidthMm + requiredVisibleWidthMm
  const maximumCameraCenterX =
    boundsMm.x + boundsMm.width + halfViewportWidthMm - requiredVisibleWidthMm
  const minimumCameraCenterY = boundsMm.y - halfViewportHeightMm + requiredVisibleHeightMm
  const maximumCameraCenterY =
    boundsMm.y + boundsMm.height + halfViewportHeightMm - requiredVisibleHeightMm

  return {
    ...viewport,
    cameraCenterMm: {
      x: roundMm(
        clamp(viewport.cameraCenterMm.x, minimumCameraCenterX, maximumCameraCenterX),
      ),
      y: roundMm(
        clamp(viewport.cameraCenterMm.y, minimumCameraCenterY, maximumCameraCenterY),
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

export function expandBoundsMm(boundsMm: BoundsMm, paddingMm: number): BoundsMm {
  return {
    x: roundMm(boundsMm.x - paddingMm),
    y: roundMm(boundsMm.y - paddingMm),
    width: roundMm(boundsMm.width + paddingMm * 2),
    height: roundMm(boundsMm.height + paddingMm * 2),
  }
}

export function createViewportForBounds(
  boundsMm: BoundsMm,
  canvasSizePx: CanvasSizePx,
  paddingPx = DEFAULT_FIT_PADDING_PX,
): ViewportState {
  return {
    zoomPxPerMm: fitZoomPxPerMm(
      {
        width: boundsMm.width,
        height: boundsMm.height,
      },
      canvasSizePx,
      paddingPx,
    ),
    cameraCenterMm: {
      x: roundMm(boundsMm.x + boundsMm.width / 2),
      y: roundMm(boundsMm.y + boundsMm.height / 2),
    },
    canvasSizePx,
  }
}

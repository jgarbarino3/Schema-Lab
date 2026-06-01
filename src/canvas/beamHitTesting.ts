import { worldToScreen } from '../domain/geometry'
import type {
  BeamSegment,
  BeamTraceResult,
  ScreenPointPx,
  ViewportState,
} from '../domain/types'

export interface BeamSegmentHit {
  distancePx: number
  segment: BeamSegment
}

function getSquaredDistanceToSegmentPx(
  pointPx: ScreenPointPx,
  startPx: ScreenPointPx,
  endPx: ScreenPointPx,
) {
  const deltaX = endPx.x - startPx.x
  const deltaY = endPx.y - startPx.y
  const lengthSquared = deltaX * deltaX + deltaY * deltaY

  if (lengthSquared <= Number.EPSILON) {
    const dx = pointPx.x - startPx.x
    const dy = pointPx.y - startPx.y

    return dx * dx + dy * dy
  }

  const projection = Math.min(
    1,
    Math.max(
      0,
      ((pointPx.x - startPx.x) * deltaX + (pointPx.y - startPx.y) * deltaY) /
        lengthSquared,
    ),
  )
  const closestX = startPx.x + projection * deltaX
  const closestY = startPx.y + projection * deltaY
  const dx = pointPx.x - closestX
  const dy = pointPx.y - closestY

  return dx * dx + dy * dy
}

export function getNearestBeamSegmentHit(
  trace: BeamTraceResult,
  viewport: ViewportState,
  pointPx: ScreenPointPx,
  hitSlopPx = 18,
  projectPointToScreen: (
    pointMm: { x: number; y: number },
    segment: BeamSegment,
    endpoint: 'start' | 'end',
  ) => ScreenPointPx = (worldPointMm) => worldToScreen(worldPointMm, viewport),
): BeamSegmentHit | undefined {
  let bestHit: BeamSegmentHit | undefined
  const maxDistanceSquared = hitSlopPx * hitSlopPx

  for (const segment of trace.segments) {
    const distanceSquared = getSquaredDistanceToSegmentPx(
      pointPx,
      projectPointToScreen(segment.startMm, segment, 'start'),
      projectPointToScreen(segment.endMm, segment, 'end'),
    )

    if (distanceSquared > maxDistanceSquared) {
      continue
    }

    const distancePx = Math.sqrt(distanceSquared)

    if (
      !bestHit ||
      distancePx < bestHit.distancePx ||
      (Math.abs(distancePx - bestHit.distancePx) < 0.4 &&
        segment.powerMw > bestHit.segment.powerMw)
    ) {
      bestHit = {
        distancePx,
        segment,
      }
    }
  }

  return bestHit
}

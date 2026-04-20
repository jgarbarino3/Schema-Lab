import type {
  BeamInteractionEvent,
  BeamPathSummary,
  BeamSegment,
  BeamTraceResult,
  ScreenPointPx,
  ViewportState,
} from './types'
import { worldToScreen } from './geometry'

export interface BeamSelectionState {
  interactionId?: string
  pathId?: string
  segmentId?: string
}

export interface BeamSelectionSnapshot {
  interaction?: BeamInteractionEvent
  path?: BeamPathSummary
  segment?: BeamSegment
}

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

export function getBeamSegmentById(
  trace: BeamTraceResult,
  segmentId?: string,
) {
  if (!segmentId) {
    return undefined
  }

  return trace.segments.find((segment) => segment.id === segmentId)
}

export function getBeamPathById(
  trace: BeamTraceResult,
  pathId?: string,
) {
  if (!pathId) {
    return undefined
  }

  return trace.pathSummaries.find((path) => path.pathId === pathId)
}

export function getBeamInteractionById(
  trace: BeamTraceResult,
  interactionId?: string,
) {
  if (!interactionId) {
    return undefined
  }

  return trace.events.find((event) => event.id === interactionId)
}

export function getBeamSelectionSnapshot(
  trace: BeamTraceResult,
  selection: BeamSelectionState,
): BeamSelectionSnapshot {
  const segment = getBeamSegmentById(trace, selection.segmentId)
  const interaction = getBeamInteractionById(trace, selection.interactionId)
  const path = getBeamPathById(
    trace,
    selection.pathId ?? segment?.pathId ?? interaction?.pathId,
  )

  return {
    segment,
    interaction:
      interaction ??
      (segment?.parentInteractionId
        ? getBeamInteractionById(trace, segment.parentInteractionId)
        : undefined),
    path,
  }
}

export function getNearestBeamSegmentHit(
  trace: BeamTraceResult,
  viewport: ViewportState,
  pointPx: ScreenPointPx,
  hitSlopPx = 18,
  projectPointToScreen: (pointMm: {
    x: number
    y: number
  }, segment: BeamSegment, endpoint: 'start' | 'end') => ScreenPointPx = (
    worldPointMm,
  ) => worldToScreen(worldPointMm, viewport),
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

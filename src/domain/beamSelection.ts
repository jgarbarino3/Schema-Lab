import type {
  BeamInteractionEvent,
  BeamPathSummary,
  BeamSegment,
  BeamTraceResult,
} from './types'

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

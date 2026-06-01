import { getAnnotationBoundsMm } from './annotations'
import { getExportWorldBoundsMm, type ExportScope } from './exportLayout'
import { boundsIntersectMm, boundsFromPointsMm, roundMm } from './geometry'
import type {
  BeamInteractionEvent,
  BeamTraceResult,
  BoundsMm,
  ComponentInstance,
  GaussianTraceResult,
  SceneAnnotation,
  SceneDocument,
  Vector2Mm,
} from './types'
import {
  getBreadboardInstance,
  getBreadboardInstances,
  getHostSurfaceIdForComponent,
} from './workspace'

interface GetScopedExportSceneArgs {
  beamTrace: BeamTraceResult
  breadboardSurfaceId?: string
  gaussianTrace: GaussianTraceResult
  scene: SceneDocument
  scope: ExportScope
}

export interface ScopedExportScene {
  annotations: SceneAnnotation[]
  beamTrace: BeamTraceResult
  components: ComponentInstance[]
  exportBreadboardInstance?: ReturnType<typeof getBreadboardInstance>
  gaussianTrace: GaussianTraceResult
}

function expandBoundsMm(boundsMm: BoundsMm, paddingMm: number): BoundsMm {
  return {
    x: roundMm(boundsMm.x - paddingMm),
    y: roundMm(boundsMm.y - paddingMm),
    width: roundMm(boundsMm.width + paddingMm * 2),
    height: roundMm(boundsMm.height + paddingMm * 2),
  }
}

function pointInBoundsMm(pointMm: Vector2Mm, boundsMm: BoundsMm) {
  return (
    pointMm.x >= boundsMm.x &&
    pointMm.x <= boundsMm.x + boundsMm.width &&
    pointMm.y >= boundsMm.y &&
    pointMm.y <= boundsMm.y + boundsMm.height
  )
}

function orientation(a: Vector2Mm, b: Vector2Mm, c: Vector2Mm) {
  return Math.sign((b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y))
}

function lineSegmentsIntersectMm(
  aStart: Vector2Mm,
  aEnd: Vector2Mm,
  bStart: Vector2Mm,
  bEnd: Vector2Mm,
) {
  const o1 = orientation(aStart, aEnd, bStart)
  const o2 = orientation(aStart, aEnd, bEnd)
  const o3 = orientation(bStart, bEnd, aStart)
  const o4 = orientation(bStart, bEnd, aEnd)

  if (o1 === 0 && pointInBoundsMm(bStart, boundsFromPointsMm(aStart, aEnd))) {
    return true
  }
  if (o2 === 0 && pointInBoundsMm(bEnd, boundsFromPointsMm(aStart, aEnd))) {
    return true
  }
  if (o3 === 0 && pointInBoundsMm(aStart, boundsFromPointsMm(bStart, bEnd))) {
    return true
  }
  if (o4 === 0 && pointInBoundsMm(aEnd, boundsFromPointsMm(bStart, bEnd))) {
    return true
  }

  return o1 !== o2 && o3 !== o4
}

function segmentIntersectsBoundsMm(
  startMm: Vector2Mm,
  endMm: Vector2Mm,
  boundsMm: BoundsMm,
) {
  if (pointInBoundsMm(startMm, boundsMm) || pointInBoundsMm(endMm, boundsMm)) {
    return true
  }

  if (!boundsIntersectMm(boundsFromPointsMm(startMm, endMm), boundsMm)) {
    return false
  }

  const topLeft = { x: boundsMm.x, y: boundsMm.y }
  const topRight = { x: boundsMm.x + boundsMm.width, y: boundsMm.y }
  const bottomRight = {
    x: boundsMm.x + boundsMm.width,
    y: boundsMm.y + boundsMm.height,
  }
  const bottomLeft = { x: boundsMm.x, y: boundsMm.y + boundsMm.height }

  return (
    lineSegmentsIntersectMm(startMm, endMm, topLeft, topRight) ||
    lineSegmentsIntersectMm(startMm, endMm, topRight, bottomRight) ||
    lineSegmentsIntersectMm(startMm, endMm, bottomRight, bottomLeft) ||
    lineSegmentsIntersectMm(startMm, endMm, bottomLeft, topLeft)
  )
}

function getExportBreadboardInstance(
  scene: SceneDocument,
  breadboardSurfaceId?: string,
) {
  if (scene.workspace.kind !== 'optical-table') {
    return undefined
  }

  const breadboardInstances = getBreadboardInstances(scene)
  return getBreadboardInstance(scene, breadboardSurfaceId) ?? breadboardInstances[0]
}

function filterBeamTrace(
  beamTrace: BeamTraceResult,
  boundsMm: BoundsMm,
  componentIds: Set<string>,
): BeamTraceResult {
  const beamBoundsMm = expandBoundsMm(boundsMm, 4)
  const segments = beamTrace.segments.filter(
    (segment) =>
      componentIds.has(segment.sourceComponentId) ||
      segmentIntersectsBoundsMm(segment.startMm, segment.endMm, beamBoundsMm),
  )
  const segmentIds = new Set(segments.map((segment) => segment.id))
  const events = beamTrace.events.filter(
    (event) =>
      componentIds.has(event.componentId) ||
      segmentIds.has(event.inputSegmentId) ||
      pointInBoundsMm(event.hitPointMm, beamBoundsMm),
  )
  const eventIds = new Set(events.map((event) => event.id))
  const pathIds = new Set([
    ...segments.map((segment) => segment.pathId),
    ...events.map((event) => event.pathId),
  ])

  return {
    segments,
    events,
    summaries: beamTrace.summaries.filter((summary) =>
      segments.some((segment) => segment.sourceComponentId === summary.sourceComponentId),
    ),
    pathSummaries: beamTrace.pathSummaries
      .map((summary) => ({
        ...summary,
        interactionIds: summary.interactionIds.filter((interactionId) =>
          eventIds.has(interactionId),
        ),
        segmentIds: summary.segmentIds.filter((segmentId) => segmentIds.has(segmentId)),
      }))
      .filter(
        (summary) =>
          pathIds.has(summary.pathId) ||
          summary.segmentIds.length > 0 ||
          summary.interactionIds.length > 0,
      ),
    terminalCaptures: beamTrace.terminalCaptures
      .map((summary) => ({
        ...summary,
        hits: summary.hits.filter(
          (hit) => eventIds.has(hit.interactionId) || pathIds.has(hit.pathId),
        ),
      }))
      .filter((summary) => componentIds.has(summary.componentId) || summary.hits.length > 0),
    opticInteractionSummaries: beamTrace.opticInteractionSummaries
      .map((summary) => ({
        ...summary,
        interactions: summary.interactions.filter((event: BeamInteractionEvent) =>
          eventIds.has(event.id),
        ),
      }))
      .filter(
        (summary) => componentIds.has(summary.componentId) || summary.interactions.length > 0,
      ),
  }
}

function filterGaussianTrace(
  gaussianTrace: GaussianTraceResult,
  beamTrace: BeamTraceResult,
  componentIds: Set<string>,
): GaussianTraceResult {
  const segmentIds = new Set(beamTrace.segments.map((segment) => segment.id))
  const eventIds = new Set(beamTrace.events.map((event) => event.id))
  const pathIds = new Set([
    ...beamTrace.segments.map((segment) => segment.pathId),
    ...beamTrace.events.map((event) => event.pathId),
  ])

  return {
    sources: gaussianTrace.sources.filter((source) =>
      beamTrace.segments.some((segment) => segment.sourceComponentId === source.sourceComponentId),
    ),
    pathAnalyses: gaussianTrace.pathAnalyses
      .map((analysis) => ({
        ...analysis,
        interactionIds: analysis.interactionIds.filter((interactionId) =>
          eventIds.has(interactionId),
        ),
        segmentIds: analysis.segmentIds.filter((segmentId) => segmentIds.has(segmentId)),
      }))
      .filter(
        (analysis) =>
          pathIds.has(analysis.pathId) ||
          analysis.segmentIds.length > 0 ||
          analysis.interactionIds.length > 0,
      ),
    segmentAnalyses: gaussianTrace.segmentAnalyses.filter((analysis) =>
      segmentIds.has(analysis.segmentId),
    ),
    interactionAnalyses: gaussianTrace.interactionAnalyses.filter(
      (analysis) => eventIds.has(analysis.interactionId) || componentIds.has(analysis.componentId),
    ),
    componentWarnings: gaussianTrace.componentWarnings
      .map((warning) => ({
        ...warning,
        interactions: warning.interactions.filter(
          (analysis) => eventIds.has(analysis.interactionId) || componentIds.has(analysis.componentId),
        ),
      }))
      .filter((warning) => componentIds.has(warning.componentId) || warning.interactions.length > 0),
  }
}

export function getScopedExportScene({
  beamTrace,
  breadboardSurfaceId,
  gaussianTrace,
  scene,
  scope,
}: GetScopedExportSceneArgs): ScopedExportScene {
  const visibleAnnotations = scene.annotations.filter((annotation) => !annotation.hidden)
  const exportBreadboardInstance = getExportBreadboardInstance(scene, breadboardSurfaceId)

  if (scope !== 'breadboard-only' || !exportBreadboardInstance) {
    return {
      annotations: visibleAnnotations,
      beamTrace,
      components: scene.components,
      exportBreadboardInstance,
      gaussianTrace,
    }
  }

  const boundsMm = getExportWorldBoundsMm(scene, scope, exportBreadboardInstance.id)
  const components = scene.components.filter(
    (component) =>
      getHostSurfaceIdForComponent(scene, component) === exportBreadboardInstance.id,
  )
  const componentIds = new Set(components.map((component) => component.id))
  const annotations = visibleAnnotations.filter((annotation) =>
    boundsIntersectMm(getAnnotationBoundsMm(annotation), boundsMm),
  )
  const scopedBeamTrace = filterBeamTrace(beamTrace, boundsMm, componentIds)

  return {
    annotations,
    beamTrace: scopedBeamTrace,
    components,
    exportBreadboardInstance,
    gaussianTrace: filterGaussianTrace(gaussianTrace, scopedBeamTrace, componentIds),
  }
}

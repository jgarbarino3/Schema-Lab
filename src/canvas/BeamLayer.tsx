import { Fragment } from 'react'
import { Circle, Layer, Line, Rect, Text } from 'react-konva'
import { getBeamColor } from '../domain/beamTracing'
import { getNearestBeamSegmentHit } from '../domain/beamSelection'
import { worldToScreen } from '../domain/geometry'
import { getGaussianInteractionAnalysis } from '../domain/gaussian'
import { getSurfaceMountPlaneOffsetMm } from '../domain/workspace'
import type {
  BeamInteractionEvent,
  BeamTraceResult,
  GaussianTraceResult,
  RenderMode,
  SceneDocument,
  ViewportState,
} from '../domain/types'
import { projectWorldPointToScreen } from './renderers/tableViewProjection'
import {
  expandBoundsPx,
  getBeamSegmentScreenObstacles,
  getComponentLabelPlacements,
  getComponentSupportScreenBounds,
  layoutFloatingLabels,
} from './labelLayout'

interface BeamLayerProps {
  beamTrace: BeamTraceResult
  gaussianTrace: GaussianTraceResult
  hoveredSegmentId?: string
  highlightedInteractionIds?: string[]
  highlightedPathIds?: string[]
  onHoverSegment: (segmentId?: string) => void
  onSelectSegment: (
    segmentId: string,
    pathId: string,
    interactionId?: string,
  ) => void
  selectedInteractionId?: string
  selectedPathId?: string
  selectedSegmentId?: string
  scene: SceneDocument
  renderMode?: RenderMode
  showDetails: boolean
  showComponentLabels?: boolean
  useProjectedTableView?: boolean
  viewport: ViewportState
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function getSegmentDash(branchKind: string) {
  switch (branchKind) {
    case 'reflected':
      return [10, 6]
    case 'generated-shg':
      return [2, 4]
    default:
      return undefined
  }
}

function getInteractionBadge(
  event: BeamInteractionEvent,
  gaussianTrace: GaussianTraceResult,
) {
  const gaussianInteraction = getGaussianInteractionAnalysis(gaussianTrace, event.id)

  if (gaussianInteraction?.apertureStatus === 'overfill') {
    return 'overfill'
  }

  if (event.outcomeClass === 'blocked') {
    return 'blocked'
  }

  if (event.interactionKind === 'reflection') {
    return 'reflecting'
  }

  if (event.interactionKind === 'terminal') {
    return 'capturing'
  }

  return undefined
}

function formatPowerMw(value: number) {
  return value >= 100 ? value.toFixed(0) : value.toFixed(1)
}

function getBeamDetailLines(args: {
  event: BeamInteractionEvent
  badge?: string
  includePathId: boolean
  showComponentLabel: boolean
}) {
  const lines: string[] = []

  if (args.showComponentLabel) {
    lines.push(args.event.componentLabel)
  }

  lines.push(
    args.includePathId
      ? `${args.event.pathId} / ${formatPowerMw(args.event.incomingPowerMw)} mW`
      : `${formatPowerMw(args.event.incomingPowerMw)} mW`,
  )

  const stateParts: string[] = []

  if (args.badge) {
    stateParts.push(args.badge)
  }

  if (args.event.generatedPowerMw) {
    stateParts.push(`SHG ${formatPowerMw(args.event.generatedPowerMw)} mW`)
  }

  if (args.event.wasClipped) {
    stateParts.push('clipped')
  }

  if (args.event.outcomeClass === 'blocked') {
    stateParts.push('blocked')
  }

  if (stateParts.length) {
    lines.push(stateParts.join(' / '))
  }

  return lines
}

export function BeamLayer({
  beamTrace,
  gaussianTrace,
  hoveredSegmentId,
  highlightedInteractionIds,
  highlightedPathIds,
  onHoverSegment,
  onSelectSegment,
  selectedInteractionId,
  selectedPathId,
  selectedSegmentId,
  scene,
  renderMode = 'simple',
  showDetails,
  showComponentLabels = true,
  useProjectedTableView = false,
  viewport,
}: BeamLayerProps) {
  const hoveredPathId = beamTrace.segments.find(
    (segment) => segment.id === hoveredSegmentId,
  )?.pathId
  const componentById = new Map(
    scene.components.map((component) => [component.id, component] as const),
  )
  const eventByInputSegmentId = new Map(
    beamTrace.events.map((event) => [event.inputSegmentId, event] as const),
  )
  const projectPointForSurface = (
    pointMm: { x: number; y: number },
    surfaceId?: string,
  ) =>
    useProjectedTableView
      ? projectWorldPointToScreen(
          pointMm,
          viewport,
          getSurfaceMountPlaneOffsetMm(scene, surfaceId),
        )
      : worldToScreen(pointMm, viewport)
  const selectNearestSegmentAtPoint = (pointPx: { x: number; y: number }) => {
    const hit = getNearestBeamSegmentHit(
      beamTrace,
      viewport,
      pointPx,
      18,
      (worldPointMm, segment, endpoint) => {
        const sourceSurfaceId =
          componentById.get(segment.sourceComponentId)?.hostSurfaceId
        const targetSurfaceId =
          endpoint === 'end'
            ? componentById.get(eventByInputSegmentId.get(segment.id)?.componentId ?? '')?.hostSurfaceId ??
              sourceSurfaceId
            : sourceSurfaceId

        return projectPointForSurface(worldPointMm, targetSurfaceId)
      },
    )

    if (!hit) {
      return
    }

    onSelectSegment(
      hit.segment.id,
      hit.segment.pathId,
      hit.segment.parentInteractionId,
    )
  }
  const visibleDetailEvents = beamTrace.events.filter(
    (event) =>
      showDetails ||
      event.pathId === selectedPathId ||
      event.id === selectedInteractionId ||
      event.pathId === hoveredPathId,
  )
  const beamSegmentObstacles = useProjectedTableView
    ? []
    : getBeamSegmentScreenObstacles(beamTrace, viewport)
  const componentLabelObstacles =
    showComponentLabels && !useProjectedTableView
      ? getComponentLabelPlacements({
          additionalObstacles: beamSegmentObstacles,
          components: scene.components,
          renderMode,
          selectedComponentId: undefined,
          viewport,
        }).map((label) => expandBoundsPx(label.bounds, 7))
      : []
  const componentSupportObstacles =
    useProjectedTableView
      ? []
      : scene.components.map((component) =>
          expandBoundsPx(getComponentSupportScreenBounds(component, viewport), 5),
        )
  const beamDetailPlacements = layoutFloatingLabels({
    labels: visibleDetailEvents.map((event) => {
      const hitPx = projectPointForSurface(
        event.hitPointMm,
        componentById.get(event.componentId)?.hostSurfaceId,
      )
      const badge =
        selectedPathId && event.pathId === selectedPathId
          ? getInteractionBadge(event, gaussianTrace)
          : undefined

      return {
        anchorPx: hitPx,
        fontSizePx: 7.6,
        id: event.id,
        lineHeightPx: 8.8,
        lines: getBeamDetailLines({
          badge,
          event,
          includePathId: event.pathId === selectedPathId,
          showComponentLabel: !showComponentLabels,
        }),
        maxWidthPx: 120,
        minWidthPx: 40,
      }
    }),
    obstacles: [
      ...beamSegmentObstacles,
      ...componentSupportObstacles,
      ...componentLabelObstacles,
    ],
    viewport,
  })
  const beamDetailPlacementById = new Map(
    beamDetailPlacements.map((placement) => [placement.id, placement] as const),
  )

  return (
    <Layer>
      {beamTrace.segments.map((segment) => {
        const sourceSurfaceId =
          componentById.get(segment.sourceComponentId)?.hostSurfaceId
        const endSurfaceId =
          componentById.get(eventByInputSegmentId.get(segment.id)?.componentId ?? '')?.hostSurfaceId ??
          sourceSurfaceId
        const startPx = projectPointForSurface(segment.startMm, sourceSurfaceId)
        const endPx = projectPointForSurface(segment.endMm, endSurfaceId)
        const isSelected =
          segment.id === selectedSegmentId || segment.pathId === selectedPathId
        const isHovered =
          segment.id === hoveredSegmentId || segment.pathId === hoveredPathId
        const isHighlighted = highlightedPathIds?.includes(segment.pathId)
        const strokeWidth = clamp(
          1.35 + segment.powerPercent / 45,
          1.4,
          segment.pathRole === 'shg' ? 3.7 : 4.5,
        )
        const opacity =
          segment.outcomeClass === 'low-power'
            ? 0.28
            : segment.attenuationClass === 'attenuated'
              ? 0.5
              : segment.attenuationClass === 'clipped'
                ? 0.62
                : segment.pathRole === 'shg'
                  ? 0.94
                  : 0.78
        const stroke = getBeamColor(segment.wavelengthNm, segment.pathRole)

        const points = [startPx.x, startPx.y, endPx.x, endPx.y]
        const displayStrokeWidth =
          isSelected
            ? strokeWidth + 1.45
            : isHighlighted
              ? strokeWidth + 1
              : isHovered
                ? strokeWidth + 0.7
                : strokeWidth

        return (
          <Fragment key={segment.id}>
            <Line
              dash={getSegmentDash(segment.branchKind)}
              hitStrokeWidth={24}
              onClick={(event) => {
                event.cancelBubble = true
                const pointer = event.target.getStage()?.getPointerPosition()

                if (pointer) {
                  selectNearestSegmentAtPoint(pointer)
                  return
                }

                onSelectSegment(
                  segment.id,
                  segment.pathId,
                  segment.parentInteractionId,
                )
              }}
              onTap={(event) => {
                event.cancelBubble = true
                const pointer = event.target.getStage()?.getPointerPosition()

                if (pointer) {
                  selectNearestSegmentAtPoint(pointer)
                  return
                }

                onSelectSegment(
                  segment.id,
                  segment.pathId,
                  segment.parentInteractionId,
                )
              }}
              onMouseEnter={() => onHoverSegment(segment.id)}
              onMouseLeave={() => onHoverSegment(undefined)}
              opacity={0.01}
              points={points}
              stroke="rgba(255,255,255,0.02)"
              strokeWidth={Math.max(displayStrokeWidth + 10, 14)}
            />
            <Line
              dash={getSegmentDash(segment.branchKind)}
              listening={false}
              opacity={isSelected ? 1 : isHighlighted ? 0.96 : isHovered ? 0.94 : opacity}
              points={points}
              shadowBlur={isSelected ? 12 : isHighlighted ? 10 : segment.pathRole === 'shg' ? 8 : 4}
              shadowColor={stroke}
              shadowOpacity={isSelected ? 0.5 : isHighlighted ? 0.34 : segment.pathRole === 'shg' ? 0.42 : 0.2}
              stroke={stroke}
              strokeWidth={displayStrokeWidth}
            />
          </Fragment>
        )
      })}

      {beamTrace.events.map((event) => {
        const hitPx = projectPointForSurface(
          event.hitPointMm,
          componentById.get(event.componentId)?.hostSurfaceId,
        )
        const stroke = getBeamColor(
          event.outputWavelengthNm ?? event.wavelengthNm,
          event.interactionKind === 'shg' ? 'shg' : 'fundamental',
        )
        const isSelected =
          event.id === selectedInteractionId || event.pathId === selectedPathId
        const isHovered = event.pathId === hoveredPathId
        const isHighlighted =
          highlightedInteractionIds?.includes(event.id) ||
          highlightedPathIds?.includes(event.pathId)
        const radius =
          event.wasClipped || event.outcomeClass === 'blocked'
            ? showDetails || isSelected
              ? 4.9
              : 3.2
            : showDetails || isSelected
              ? 3.7
              : 2.5

        return (
          <Fragment key={event.id}>
            <Circle
              fill="rgba(255,255,255,0.02)"
              onClick={(konvaEvent) => {
                konvaEvent.cancelBubble = true
                onSelectSegment(event.inputSegmentId, event.pathId, event.id)
              }}
              onTap={(konvaEvent) => {
                konvaEvent.cancelBubble = true
                onSelectSegment(event.inputSegmentId, event.pathId, event.id)
              }}
              onMouseEnter={() => onHoverSegment(event.inputSegmentId)}
              onMouseLeave={() => onHoverSegment(undefined)}
              radius={Math.max(radius + 6, 10)}
              x={hitPx.x}
              y={hitPx.y}
            />
            <Circle
              fill={
                event.wasClipped || event.outcomeClass === 'blocked'
                  ? '#3f1d12'
                  : '#0b1014'
              }
              listening={false}
              radius={radius}
              stroke={stroke}
              strokeWidth={isSelected ? 1.8 : isHighlighted ? 1.7 : isHovered ? 1.5 : 1.2}
              x={hitPx.x}
              y={hitPx.y}
            />
          </Fragment>
        )
      })}

      {visibleDetailEvents.map((event) => {
          const label = beamDetailPlacementById.get(event.id)

          if (!label) {
            return null
          }

          return (
            <Fragment key={`${event.id}-annotations`}>
              <Line
                dash={[3, 3]}
                listening={false}
                opacity={0.48}
                points={[
                  label.leaderStartPx.x,
                  label.leaderStartPx.y,
                  label.leaderEndPx.x,
                  label.leaderEndPx.y,
                ]}
                stroke="rgba(219, 235, 244, 0.78)"
                strokeWidth={1}
              />
              <Rect
                cornerRadius={4}
                fill="rgba(8, 12, 17, 0.82)"
                height={label.bounds.height}
                listening={false}
                shadowBlur={6}
                shadowColor="#05080c"
                shadowOpacity={0.64}
                stroke="rgba(191, 221, 234, 0.28)"
                strokeWidth={1}
                width={label.bounds.width}
                x={label.bounds.x}
                y={label.bounds.y}
              />
              <Text
                fill="rgba(227, 238, 244, 0.9)"
                fontFamily="IBM Plex Mono, SFMono-Regular, monospace"
                fontSize={label.fontSizePx}
                lineHeight={label.lineHeightPx / label.fontSizePx}
                listening={false}
                text={label.lines.join('\n')}
                width={label.bounds.width - 10}
                x={label.bounds.x + 5}
                y={label.bounds.y + 4}
              />
            </Fragment>
          )
        })}
    </Layer>
  )
}

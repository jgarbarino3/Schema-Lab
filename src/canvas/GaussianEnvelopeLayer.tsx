import { Fragment } from 'react'
import { Circle, Layer, Line, Text } from 'react-konva'
import { getBeamColor } from '../domain/beamTracing'
import { getGaussianWaistMarkers } from '../domain/gaussian'
import { worldToScreen } from '../domain/geometry'
import { getSurfaceMountPlaneOffsetMm } from '../domain/workspace'
import type {
  BeamTraceResult,
  GaussianTraceResult,
  SceneDocument,
  ViewportState,
} from '../domain/types'
import { projectWorldPointToScreen } from './renderers/tableViewProjection'

interface GaussianEnvelopeLayerProps {
  beamTrace: BeamTraceResult
  gaussianTrace: GaussianTraceResult
  hoveredSegmentId?: string
  scene: SceneDocument
  selectedPathId?: string
  useProjectedTableView?: boolean
  viewport: ViewportState
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

export function GaussianEnvelopeLayer({
  beamTrace,
  gaussianTrace,
  hoveredSegmentId,
  scene,
  selectedPathId,
  useProjectedTableView = false,
  viewport,
}: GaussianEnvelopeLayerProps) {
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
  const segmentById = new Map(
    beamTrace.segments.map((segment) => [segment.id, segment] as const),
  )
  const selectedPathInteractions =
    selectedPathId === undefined
      ? []
      : gaussianTrace.interactionAnalyses.filter(
          (analysis) => analysis.pathId === selectedPathId,
        )
  const waistMarkers = getGaussianWaistMarkers(
    beamTrace,
    gaussianTrace,
    selectedPathId,
  )

  return (
    <Layer listening={false}>
      {gaussianTrace.segmentAnalyses.map((analysis) => {
        const segment = segmentById.get(analysis.segmentId)

        if (!segment) {
          return null
        }

        const startSurfaceId =
          componentById.get(segment.sourceComponentId)?.hostSurfaceId
        const endSurfaceId =
          componentById.get(eventByInputSegmentId.get(segment.id)?.componentId ?? '')?.hostSurfaceId ??
          startSurfaceId
        const lengthMm = Math.hypot(segment.directionMm.x, segment.directionMm.y)

        if (lengthMm <= 0) {
          return null
        }

        const normalMm = {
          x: -segment.directionMm.y,
          y: segment.directionMm.x,
        }
        const startPlus = projectPointForSurface(
          {
            x: segment.startMm.x + normalMm.x * analysis.start.spotRadiusMm,
            y: segment.startMm.y + normalMm.y * analysis.start.spotRadiusMm,
          },
          startSurfaceId,
        )
        const endPlus = projectPointForSurface(
          {
            x: segment.endMm.x + normalMm.x * analysis.end.spotRadiusMm,
            y: segment.endMm.y + normalMm.y * analysis.end.spotRadiusMm,
          },
          endSurfaceId,
        )
        const endMinus = projectPointForSurface(
          {
            x: segment.endMm.x - normalMm.x * analysis.end.spotRadiusMm,
            y: segment.endMm.y - normalMm.y * analysis.end.spotRadiusMm,
          },
          endSurfaceId,
        )
        const startMinus = projectPointForSurface(
          {
            x: segment.startMm.x - normalMm.x * analysis.start.spotRadiusMm,
            y: segment.startMm.y - normalMm.y * analysis.start.spotRadiusMm,
          },
          startSurfaceId,
        )
        const isSelected = segment.pathId === selectedPathId
        const isHovered = segment.pathId === hoveredPathId
        const color = getBeamColor(segment.wavelengthNm, segment.pathRole)
        const opacity = isSelected ? 0.18 : isHovered ? 0.12 : 0.07
        const strokeOpacity = isSelected ? 0.48 : isHovered ? 0.34 : 0.22
        const strokeWidth = clamp(
          0.8 + analysis.end.beamDiameterMm * viewport.zoomPxPerMm * 0.01,
          0.8,
          isSelected ? 1.8 : 1.2,
        )

        return (
          <Line
            closed
            fill={color}
            key={analysis.segmentId}
            opacity={opacity}
            points={[
              startPlus.x,
              startPlus.y,
              endPlus.x,
              endPlus.y,
              endMinus.x,
              endMinus.y,
              startMinus.x,
              startMinus.y,
            ]}
            shadowBlur={isSelected ? 8 : 0}
            shadowColor={color}
            shadowOpacity={isSelected ? 0.22 : 0}
            stroke={color}
            strokeOpacity={strokeOpacity}
            strokeWidth={strokeWidth}
          />
        )
      })}

      {selectedPathInteractions.map((interaction) => {
        const event = beamTrace.events.find(
          (candidate) => candidate.id === interaction.interactionId,
        )

        if (!event) {
          return null
        }

        const pointPx = projectPointForSurface(
          event.hitPointMm,
          componentById.get(event.componentId)?.hostSurfaceId,
        )

        return (
          <Text
            fill="rgba(181, 224, 238, 0.92)"
            fontFamily="IBM Plex Mono, SFMono-Regular, monospace"
            fontSize={8.5}
            key={`${interaction.interactionId}-z`}
            text={`z ${interaction.hitDistanceMm.toFixed(1)} mm`}
            x={pointPx.x + 8}
            y={pointPx.y + 10}
          />
        )
      })}

      {waistMarkers.map((marker) => {
        const pointPx = projectPointForSurface(marker.pointMm)

        return (
          <Fragment key={`${marker.segmentId}-waist`}>
            <Circle
              fill="rgba(11, 16, 20, 0.9)"
              radius={4.2}
              stroke="#d9f3fb"
              strokeWidth={1}
              x={pointPx.x}
              y={pointPx.y}
            />
            <Text
              fill="#d9f3fb"
              fontFamily="IBM Plex Mono, SFMono-Regular, monospace"
              fontSize={8.4}
              text={`w0 ${marker.waistRadiusMm.toFixed(3)} mm • z ${marker.zPositionMm.toFixed(1)} mm`}
              x={pointPx.x + 7}
              y={pointPx.y - 16}
            />
          </Fragment>
        )
      })}
    </Layer>
  )
}

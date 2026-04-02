import { Circle, Layer, Line, Text } from 'react-konva'
import { getBeamColor } from '../domain/beamTracing'
import { worldToScreen } from '../domain/geometry'
import type { BeamTraceResult, ViewportState } from '../domain/types'

interface BeamLayerProps {
  beamTrace: BeamTraceResult
  hoveredSegmentId?: string
  onHoverSegment: (segmentId?: string) => void
  onSelectSegment: (
    segmentId: string,
    pathId: string,
    interactionId?: string,
  ) => void
  selectedInteractionId?: string
  selectedPathId?: string
  selectedSegmentId?: string
  showDetails: boolean
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

export function BeamLayer({
  beamTrace,
  hoveredSegmentId,
  onHoverSegment,
  onSelectSegment,
  selectedInteractionId,
  selectedPathId,
  selectedSegmentId,
  showDetails,
  viewport,
}: BeamLayerProps) {
  const hoveredPathId = beamTrace.segments.find(
    (segment) => segment.id === hoveredSegmentId,
  )?.pathId

  return (
    <Layer>
      {beamTrace.segments.map((segment) => {
        const startPx = worldToScreen(segment.startMm, viewport)
        const endPx = worldToScreen(segment.endMm, viewport)
        const isSelected =
          segment.id === selectedSegmentId || segment.pathId === selectedPathId
        const isHovered =
          segment.id === hoveredSegmentId || segment.pathId === hoveredPathId
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

        return (
          <Line
            dash={getSegmentDash(segment.branchKind)}
            hitStrokeWidth={18}
            key={segment.id}
            onClick={(event) => {
              event.cancelBubble = true
              onSelectSegment(
                segment.id,
                segment.pathId,
                segment.parentInteractionId,
              )
            }}
            onMouseEnter={() => onHoverSegment(segment.id)}
            onMouseLeave={() => onHoverSegment(undefined)}
            opacity={isSelected ? 1 : isHovered ? 0.94 : opacity}
            points={[startPx.x, startPx.y, endPx.x, endPx.y]}
            shadowBlur={isSelected ? 12 : segment.pathRole === 'shg' ? 8 : 4}
            shadowColor={stroke}
            shadowOpacity={isSelected ? 0.5 : segment.pathRole === 'shg' ? 0.42 : 0.2}
            stroke={stroke}
            strokeWidth={isSelected ? strokeWidth + 1.45 : isHovered ? strokeWidth + 0.7 : strokeWidth}
          />
        )
      })}

      {beamTrace.events.map((event) => {
        const hitPx = worldToScreen(event.hitPointMm, viewport)
        const stroke = getBeamColor(
          event.outputWavelengthNm ?? event.wavelengthNm,
          event.interactionKind === 'shg' ? 'shg' : 'fundamental',
        )
        const isSelected =
          event.id === selectedInteractionId || event.pathId === selectedPathId
        const isHovered = event.pathId === hoveredPathId
        const radius =
          event.wasClipped || event.outcomeClass === 'blocked'
            ? showDetails || isSelected
              ? 4.9
              : 3.2
            : showDetails || isSelected
              ? 3.7
              : 2.5

        return (
          <Circle
            fill={
              event.wasClipped || event.outcomeClass === 'blocked'
                ? '#3f1d12'
                : '#0b1014'
            }
            key={event.id}
            onClick={(konvaEvent) => {
              konvaEvent.cancelBubble = true
              onSelectSegment(event.inputSegmentId, event.pathId, event.id)
            }}
            onMouseEnter={() => onHoverSegment(event.inputSegmentId)}
            onMouseLeave={() => onHoverSegment(undefined)}
            radius={radius}
            stroke={stroke}
            strokeWidth={isSelected ? 1.8 : isHovered ? 1.5 : 1.2}
            x={hitPx.x}
            y={hitPx.y}
          />
        )
      })}

      {beamTrace.events
        .filter(
          (event) =>
            showDetails ||
            event.pathId === selectedPathId ||
            event.id === selectedInteractionId ||
            event.pathId === hoveredPathId,
        )
        .map((event) => {
          const hitPx = worldToScreen(event.hitPointMm, viewport)
          const labelParts = [
            event.componentLabel,
            event.pathId,
            `${event.incomingPowerMw.toFixed(1)} mW`,
          ]

          if (event.generatedPowerMw) {
            labelParts.push(`SHG ${event.generatedPowerMw.toFixed(1)} mW`)
          }

          if (event.wasClipped) {
            labelParts.push('clipped')
          }

          if (event.outcomeClass === 'blocked') {
            labelParts.push('blocked')
          }

          return (
            <Text
              fill="rgba(227, 238, 244, 0.86)"
              fontFamily="IBM Plex Mono, SFMono-Regular, monospace"
              fontSize={9}
              key={`${event.id}-label`}
              text={labelParts.join(' • ')}
              x={hitPx.x + 6}
              y={hitPx.y - 10}
            />
          )
        })}
    </Layer>
  )
}

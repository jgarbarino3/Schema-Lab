import { memo, useMemo } from 'react'
import type { KonvaEventObject } from 'konva/lib/Node'
import { Circle, Ellipse, Group, Line, Rect, Text } from 'react-konva'
import type { ScreenPointPx, ViewportState } from '../../domain/types'
import type { LiveSurfaceDescriptor } from './surfaceDescriptors'
import {
  getLiveSurfaceLabel,
  getLiveSurfaceRenderTier,
  getSurfaceHoleAxesMm,
} from './surfaceDescriptors'
import {
  projectLocalOffsetToScreen,
  projectWorldPointToScreen,
} from './tableViewProjection'

interface ProjectedSurfaceLayerProps {
  anchorMm?: { x: number; y: number }
  draggable?: boolean
  elevationMm?: number
  isFocused?: boolean
  isHighlighted?: boolean
  isSelected: boolean
  onDragEnd?: (screenPointPx: ScreenPointPx) => void
  onDragMove?: (screenPointPx: ScreenPointPx) => void
  onDragStart?: () => void
  onSelect: (event: KonvaEventObject<MouseEvent | TouchEvent>) => void
  opacity?: number
  showLabels?: boolean
  surface: LiveSurfaceDescriptor
  viewport: ViewportState
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function applyAlpha(hexColor: string, alpha: number) {
  const normalized = hexColor.replace('#', '')

  if (![3, 6].includes(normalized.length)) {
    return hexColor
  }

  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((character) => `${character}${character}`)
          .join('')
      : normalized
  const parsed = Number.parseInt(expanded, 16)

  if (!Number.isFinite(parsed)) {
    return hexColor
  }

  const red = (parsed >> 16) & 255
  const green = (parsed >> 8) & 255
  const blue = parsed & 255

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function shadeHex(hexColor: string, factor: number) {
  const normalized = hexColor.replace('#', '')

  if (![3, 6].includes(normalized.length)) {
    return hexColor
  }

  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((character) => `${character}${character}`)
          .join('')
      : normalized
  const parsed = Number.parseInt(expanded, 16)

  if (!Number.isFinite(parsed)) {
    return hexColor
  }

  const transform = (value: number) =>
    Math.round(
      factor >= 0
        ? value + (255 - value) * factor
        : value * (1 + factor),
    )
      .toString(16)
      .padStart(2, '0')

  return `#${transform((parsed >> 16) & 255)}${transform((parsed >> 8) & 255)}${transform(parsed & 255)}`
}

export const ProjectedSurfaceLayer = memo(function ProjectedSurfaceLayer({
  anchorMm = { x: 0, y: 0 },
  draggable = false,
  elevationMm = 0,
  isFocused = false,
  isHighlighted = false,
  isSelected,
  onDragEnd,
  onDragMove,
  onDragStart,
  onSelect,
  opacity = 1,
  showLabels = true,
  surface,
  viewport,
}: ProjectedSurfaceLayerProps) {
  const anchorPx = useMemo(
    () => projectWorldPointToScreen(anchorMm, viewport, elevationMm),
    [anchorMm, elevationMm, viewport],
  )
  const tier = useMemo(
    () => getLiveSurfaceRenderTier(viewport.zoomPxPerMm),
    [viewport.zoomPxPerMm],
  )
  const localPoint = useMemo(
    () =>
      (pointMm: { x: number; y: number }, zMm = 0) =>
        projectLocalOffsetToScreen(
          pointMm,
          viewport,
          surface.rotationQuarterTurns,
          zMm,
        ),
    [surface.rotationQuarterTurns, viewport],
  )
  const topPolygon = useMemo(
    () =>
      [
        localPoint({ x: 0, y: 0 }),
        localPoint({ x: surface.widthMm, y: 0 }),
        localPoint({ x: surface.widthMm, y: surface.heightMm }),
        localPoint({ x: 0, y: surface.heightMm }),
      ].flatMap((pointPx) => [pointPx.x, pointPx.y]),
    [localPoint, surface.heightMm, surface.widthMm],
  )
  const projectedDepthMm = Math.min(
    surface.kind === 'optical-table' ? 30 : 18,
    Math.max(8, surface.thicknessMm * 0.16),
  )
  const frontFace = useMemo(
    () =>
      [
        localPoint({ x: 0, y: surface.heightMm }),
        localPoint({ x: surface.widthMm, y: surface.heightMm }),
        localPoint({ x: surface.widthMm, y: surface.heightMm }, -projectedDepthMm),
        localPoint({ x: 0, y: surface.heightMm }, -projectedDepthMm),
      ].flatMap((pointPx) => [pointPx.x, pointPx.y]),
    [localPoint, projectedDepthMm, surface.heightMm, surface.widthMm],
  )
  const leadingEdge = useMemo(
    () =>
      [
        localPoint({ x: 0, y: 0 }),
        localPoint({ x: 0, y: surface.heightMm }),
        localPoint({ x: 0, y: surface.heightMm }, -projectedDepthMm),
        localPoint({ x: 0, y: 0 }, -projectedDepthMm),
      ].flatMap((pointPx) => [pointPx.x, pointPx.y]),
    [localPoint, projectedDepthMm, surface.heightMm],
  )
  const labelPoint = localPoint({ x: 8, y: 8 })
  const hitBounds = useMemo(() => {
    const xValues = [
      topPolygon[0],
      topPolygon[2],
      topPolygon[4],
      topPolygon[6],
    ]
    const yValues = [
      topPolygon[1],
      topPolygon[3],
      topPolygon[5],
      topPolygon[7],
      frontFace[5],
      frontFace[7],
    ]

    return {
      height: Math.max(...yValues) - Math.min(...yValues),
      width: Math.max(...xValues) - Math.min(...xValues),
      x: Math.min(...xValues),
      y: Math.min(...yValues),
    }
  }, [frontFace, topPolygon])
  const holeAxes = getSurfaceHoleAxesMm(surface)
  const holeStep =
    tier === 'dense' ? 1 : tier === 'medium' ? 2 : surface.kind === 'optical-table' ? 4 : 3
  const holeRadiusPx = clamp(
    surface.kind === 'optical-table' ? viewport.zoomPxPerMm * 0.85 : viewport.zoomPxPerMm * 0.8,
    0.7,
    2,
  )
  const boardStroke = isSelected
    ? '#8ccfdf'
    : isHighlighted
      ? '#f0cb87'
      : isFocused
        ? '#4e6c79'
        : surface.palette.boardStroke
  const topFill = surface.palette.boardFill
  const frontFill = shadeHex(surface.palette.boardFill, -0.14)
  const edgeFill = shadeHex(surface.palette.boardFill, -0.2)

  return (
    <Group
      draggable={draggable}
      dragDistance={draggable ? 0 : 2}
      listening
      name="breadboard-hit"
      onClick={(event) => {
        event.cancelBubble = true
        onSelect(event)
      }}
      onDragEnd={(event) => {
        if (!onDragEnd) {
          return
        }

        event.cancelBubble = true
        onDragEnd({ x: event.target.x(), y: event.target.y() })
      }}
      onDragMove={(event) => {
        if (!onDragMove) {
          return
        }

        event.cancelBubble = true
        onDragMove({ x: event.target.x(), y: event.target.y() })
      }}
      onDragStart={(event) => {
        if (!onDragStart) {
          return
        }

        event.cancelBubble = true
        onDragStart()
      }}
      onMouseDown={(event) => {
        if (draggable) {
          event.cancelBubble = true
        }
      }}
      onTap={(event) => {
        event.cancelBubble = true
        onSelect(event)
      }}
      opacity={opacity}
      x={anchorPx.x}
      y={anchorPx.y}
    >
      <Rect
        fill="rgba(0, 0, 0, 0.001)"
        height={hitBounds.height}
        strokeEnabled={false}
        width={hitBounds.width}
        x={hitBounds.x}
        y={hitBounds.y}
      />
      <Line
        closed
        fill={frontFill}
        listening={false}
        opacity={0.92}
        points={frontFace}
        stroke={applyAlpha(boardStroke, 0.35)}
        strokeWidth={0.9}
      />
      <Line
        closed
        fill={edgeFill}
        listening={false}
        opacity={0.84}
        points={leadingEdge}
        stroke={applyAlpha(boardStroke, 0.25)}
        strokeWidth={0.8}
      />
      <Line
        closed
        fill={topFill}
        points={topPolygon}
        shadowBlur={isSelected ? 14 : isHighlighted ? 12 : 8}
        shadowColor={isSelected ? '#83bfd2' : isHighlighted ? '#f0cb87' : '#000000'}
        shadowOpacity={isSelected || isHighlighted ? 0.22 : 0.18}
        stroke={boardStroke}
        strokeWidth={isSelected ? 1.4 : isHighlighted ? 1.25 : 1}
      />

      {holeRadiusPx > 0
        ? holeAxes.xPositionsMm.map((xPositionMm, xIndex) =>
            xIndex % holeStep !== 0
              ? null
              : holeAxes.yPositionsMm.map((yPositionMm, yIndex) => {
                  if (yIndex % holeStep !== 0) {
                    return null
                  }

                  const holePoint = localPoint({ x: xPositionMm, y: yPositionMm })

                  return (
                    <Ellipse
                      fill={surface.palette.holeFill}
                      key={`${xPositionMm}-${yPositionMm}`}
                      listening={false}
                      radiusX={holeRadiusPx}
                      radiusY={holeRadiusPx * 0.8}
                      x={holePoint.x}
                      y={holePoint.y}
                    />
                  )
                }),
          )
        : null}

      {surface.counterborePattern === 'corner-25mm'
        ? [
            { x: 25, y: 25 },
            { x: surface.widthMm - 25, y: 25 },
            { x: 25, y: surface.heightMm - 25 },
            { x: surface.widthMm - 25, y: surface.heightMm - 25 },
          ].map((counterbore) => {
            const counterborePoint = localPoint(counterbore)

            return (
              <Group key={`${counterbore.x}-${counterbore.y}`}>
                <Circle
                  fill="#2c343b"
                  listening={false}
                  radius={6.2 * viewport.zoomPxPerMm}
                  stroke="#5c6771"
                  strokeWidth={0.8}
                  x={counterborePoint.x}
                  y={counterborePoint.y}
                />
                <Circle
                  fill={surface.palette.holeFill}
                  listening={false}
                  radius={2.1 * viewport.zoomPxPerMm}
                  x={counterborePoint.x}
                  y={counterborePoint.y}
                />
              </Group>
            )
          })
        : null}

      {showLabels ? (
        <Text
          fill={surface.palette.labelColor}
          fontFamily="IBM Plex Sans, Avenir Next, Segoe UI, sans-serif"
          fontSize={11}
          listening={false}
          text={getLiveSurfaceLabel(surface)}
          x={labelPoint.x}
          y={labelPoint.y - 18}
        />
      ) : null}
    </Group>
  )
})

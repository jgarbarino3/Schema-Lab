import { Circle, Group, Line, Rect, Text } from 'react-konva'
import { getResolvedComponentSpec } from '../domain/componentCatalog'
import { quarterTurnsToDegrees, worldToScreen } from '../domain/geometry'
import type {
  BoundsMm,
  ComponentFootprintShape,
  ComponentInstance,
  PlacementStatus,
  ScreenPointPx,
  ViewportState,
} from '../domain/types'
import { ComponentGlyph } from './ComponentGlyph'

interface ShapeStyle {
  dash?: number[]
  fill: string
  opacity?: number
  stroke: string
  strokeWidth: number
}

interface ComponentNodeProps {
  instance: ComponentInstance
  isDragEnabled?: boolean
  isHovered?: boolean
  isPreview?: boolean
  isSelected: boolean
  onDragEnd?: (componentId: string, screenPointPx: ScreenPointPx) => void
  onDragMove?: (componentId: string, screenPointPx: ScreenPointPx) => void
  onDragStart?: (componentId: string) => void
  onHoverChange?: (componentId?: string) => void
  onSelect?: (componentId: string) => void
  placementStatus?: PlacementStatus
  resolveDragPositionPx?: (screenPointPx: ScreenPointPx) => ScreenPointPx
  viewport: ViewportState
}

function renderFootprintShape(
  shape: ComponentFootprintShape,
  boundsMm: BoundsMm,
  style: ShapeStyle,
) {
  switch (shape) {
    case 'circle':
      return (
        <Circle
          dash={style.dash}
          fill={style.fill}
          opacity={style.opacity}
          radius={Math.min(boundsMm.width, boundsMm.height) / 2}
          stroke={style.stroke}
          strokeWidth={style.strokeWidth}
          x={boundsMm.x + boundsMm.width / 2}
          y={boundsMm.y + boundsMm.height / 2}
        />
      )
    case 'diamond':
      return (
        <Line
          closed
          dash={style.dash}
          fill={style.fill}
          lineJoin="round"
          opacity={style.opacity}
          points={[
            boundsMm.x + boundsMm.width / 2,
            boundsMm.y,
            boundsMm.x + boundsMm.width,
            boundsMm.y + boundsMm.height / 2,
            boundsMm.x + boundsMm.width / 2,
            boundsMm.y + boundsMm.height,
            boundsMm.x,
            boundsMm.y + boundsMm.height / 2,
          ]}
          stroke={style.stroke}
          strokeWidth={style.strokeWidth}
        />
      )
    case 'capsule':
      return (
        <Rect
          cornerRadius={Math.min(boundsMm.width, boundsMm.height) / 2}
          dash={style.dash}
          fill={style.fill}
          height={boundsMm.height}
          opacity={style.opacity}
          stroke={style.stroke}
          strokeWidth={style.strokeWidth}
          width={boundsMm.width}
          x={boundsMm.x}
          y={boundsMm.y}
        />
      )
    case 'rect':
      return (
        <Rect
          cornerRadius={2}
          dash={style.dash}
          fill={style.fill}
          height={boundsMm.height}
          opacity={style.opacity}
          stroke={style.stroke}
          strokeWidth={style.strokeWidth}
          width={boundsMm.width}
          x={boundsMm.x}
          y={boundsMm.y}
        />
      )
  }
}

function getPlacementAccent(status: PlacementStatus | undefined) {
  switch (status) {
    case 'snapped':
      return '#9adbf0'
    case 'warning':
      return '#f5d28c'
    case 'valid':
    default:
      return '#bcdbe6'
  }
}

export function ComponentNode({
  instance,
  isDragEnabled = true,
  isHovered = false,
  isPreview = false,
  isSelected,
  onDragEnd,
  onDragMove,
  onDragStart,
  onHoverChange,
  onSelect,
  placementStatus,
  resolveDragPositionPx,
  viewport,
}: ComponentNodeProps) {
  const spec = getResolvedComponentSpec(instance.type, instance.variantId)
  const screenAnchorPx = worldToScreen(instance.anchorMm, viewport)
  const boundsMm = spec.footprintBoundsMm
  const accentStroke = getPlacementAccent(placementStatus)
  const stroke = isPreview
    ? accentStroke
    : isSelected
      ? '#d8eef5'
      : isHovered
        ? '#cde8f0'
        : spec.renderHint.stroke
  const footprintStyle: ShapeStyle = isPreview
    ? {
        dash: [3, 2],
        fill: 'rgba(0, 0, 0, 0)',
        opacity: 0.95,
        stroke,
        strokeWidth: 1.1,
      }
    : {
        fill: spec.renderHint.fill,
        opacity: isHovered ? 0.96 : 1,
        stroke,
        strokeWidth: isSelected ? 1.2 : isHovered ? 1 : 0.8,
      }

  return (
    <Group
      draggable={isDragEnabled && !isPreview}
      listening={!isPreview}
      onClick={(event) => {
        if (!onSelect) {
          return
        }

        event.cancelBubble = true
        onSelect(instance.id)
      }}
      onDragEnd={(event) => {
        if (!onDragEnd) {
          return
        }

        event.cancelBubble = true
        onDragEnd(instance.id, { x: event.target.x(), y: event.target.y() })
      }}
      onDragMove={(event) => {
        if (!onDragMove) {
          return
        }

        event.cancelBubble = true
        onDragMove(instance.id, { x: event.target.x(), y: event.target.y() })
      }}
      onDragStart={(event) => {
        if (!onDragStart) {
          return
        }

        event.cancelBubble = true
        onDragStart(instance.id)
      }}
      onMouseEnter={() => {
        onHoverChange?.(instance.id)
      }}
      onMouseLeave={() => {
        onHoverChange?.(undefined)
      }}
      onTap={(event) => {
        if (!onSelect) {
          return
        }

        event.cancelBubble = true
        onSelect(instance.id)
      }}
      rotation={quarterTurnsToDegrees(instance.rotationQuarterTurns)}
      scaleX={viewport.zoomPxPerMm}
      scaleY={viewport.zoomPxPerMm}
      x={screenAnchorPx.x}
      y={screenAnchorPx.y}
      dragBoundFunc={
        isDragEnabled && resolveDragPositionPx
          ? (position) => resolveDragPositionPx(position)
          : undefined
      }
    >
      {renderFootprintShape(spec.renderHint.shape, boundsMm, footprintStyle)}

      <ComponentGlyph
        boundsMm={boundsMm}
        glyph={spec.renderHint.glyph}
        stroke={isPreview ? accentStroke : stroke}
      />

      {spec.opticalCenterMm ? (
        <>
          <Line
            points={[
              spec.opticalCenterMm.x - 3,
              spec.opticalCenterMm.y,
              spec.opticalCenterMm.x + 3,
              spec.opticalCenterMm.y,
            ]}
            stroke={isPreview ? accentStroke : '#ffffff'}
            strokeWidth={0.5}
          />
          <Line
            points={[
              spec.opticalCenterMm.x,
              spec.opticalCenterMm.y - 3,
              spec.opticalCenterMm.x,
              spec.opticalCenterMm.y + 3,
            ]}
            stroke={isPreview ? accentStroke : '#ffffff'}
            strokeWidth={0.5}
          />
        </>
      ) : null}

      {isSelected && !isPreview
        ? spec.ports.map((port) => (
            <Circle
              fill="#fbf2a5"
              key={port.id}
              radius={2}
              stroke="#11161b"
              strokeWidth={0.5}
              x={port.positionMm.x}
              y={port.positionMm.y}
            />
          ))
        : null}

      {(isSelected || isPreview) && !spec.opticalCenterMm ? (
        <>
          <Line points={[-3, 0, 3, 0]} stroke={accentStroke} strokeWidth={0.55} />
          <Line points={[0, -3, 0, 3]} stroke={accentStroke} strokeWidth={0.55} />
        </>
      ) : null}

      {isSelected || isPreview ? (
        <Circle
          fill={isPreview ? accentStroke : '#0c1014'}
          radius={1.8}
          stroke={accentStroke}
          strokeWidth={0.55}
          x={0}
          y={0}
        />
      ) : null}

      {!isPreview ? (
        <Text
          align="center"
          fill="#e6edf2"
          fontFamily="IBM Plex Sans, Avenir Next, Segoe UI, sans-serif"
          fontSize={6.3}
          listening={false}
          text={instance.label}
          width={Math.max(boundsMm.width, 38)}
          x={-Math.max(boundsMm.width, 38) / 2}
          y={boundsMm.y + boundsMm.height + 4}
        />
      ) : null}
    </Group>
  )
}

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
  isHighlighted?: boolean
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
  isHighlighted = false,
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
  const bodyBoundsMm = spec.visualBodyBoundsMm
  const boundsMm = spec.hitBoundsMm
  const supportBoundsMm = spec.mount.supportBoundsMm
  const accentStroke = getPlacementAccent(placementStatus)
  const stroke = isPreview
    ? accentStroke
    : isSelected
      ? '#f1fbff'
      : isHighlighted
        ? '#f5d28c'
      : isHovered
        ? '#def3fb'
        : spec.renderHint.stroke
  const bodyStyle: ShapeStyle = isPreview
    ? {
        dash: [3, 2],
        fill: 'rgba(73, 104, 122, 0.12)',
        opacity: 0.98,
        stroke,
        strokeWidth: 1.15,
      }
    : {
        fill: spec.renderHint.fill,
        opacity: isHovered || isSelected || isHighlighted ? 0.98 : 0.92,
        stroke,
        strokeWidth: isSelected ? 1.35 : isHighlighted ? 1.15 : isHovered ? 1.1 : 0.85,
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
      <Rect
        fill="rgba(0, 0, 0, 0.001)"
        height={boundsMm.height}
        width={boundsMm.width}
        x={boundsMm.x}
        y={boundsMm.y}
      />

      {isSelected || isPreview || isHovered || isHighlighted ? (
        <Rect
          cornerRadius={3}
          dash={isPreview ? [5, 3] : [4, 3]}
          fill={
            isPreview
              ? 'rgba(110, 163, 185, 0.08)'
              : isSelected
                ? 'rgba(140, 207, 223, 0.06)'
                : isHighlighted
                  ? 'rgba(245, 210, 140, 0.06)'
                : 'rgba(140, 207, 223, 0.03)'
          }
          height={supportBoundsMm.height}
          opacity={isHovered && !isSelected && !isHighlighted ? 0.65 : 0.95}
          stroke={
            isPreview
              ? accentStroke
              : isSelected
                ? '#8ccfdf'
                : isHighlighted
                  ? '#f5d28c'
                  : '#5b707b'
          }
          strokeWidth={isSelected ? 0.95 : isHighlighted ? 0.9 : 0.8}
          width={supportBoundsMm.width}
          x={supportBoundsMm.x}
          y={supportBoundsMm.y}
        />
      ) : null}

      {renderFootprintShape(spec.renderHint.shape, bodyBoundsMm, bodyStyle)}

      <ComponentGlyph
        boundsMm={bodyBoundsMm}
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
          fill={
            isSelected
              ? '#f4fbff'
              : isHighlighted
                ? '#fff2c6'
                : 'rgba(230, 237, 242, 0.88)'
          }
          fontFamily="IBM Plex Sans, Avenir Next, Segoe UI, sans-serif"
          fontSize={isSelected || isHighlighted ? 6.55 : 6.1}
          listening={false}
          text={instance.label}
          width={Math.max(bodyBoundsMm.width, 42)}
          x={-Math.max(bodyBoundsMm.width, 42) / 2}
          y={supportBoundsMm.y + supportBoundsMm.height + 4.5}
        />
      ) : null}
    </Group>
  )
}

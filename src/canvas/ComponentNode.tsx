import { Circle, Group, Line, Rect, Text } from 'react-konva'
import {
  getEffectiveSupportBoundsMm,
  getResolvedComponentSpec,
  getResolvedComponentSpecForInstance,
  shouldIncludeDefaultMount,
} from '../domain/componentCatalog'
import { quarterTurnsToDegrees, worldToScreen } from '../domain/geometry'
import type {
  BoundsMm,
  ComponentInstance,
  PlacementStatus,
  RenderMode,
  ScreenPointPx,
  ViewportState,
} from '../domain/types'
import { ComponentGlyph } from './ComponentGlyph'
import { renderRealisticHardware } from './realisticHardware'

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
  onResize?: (
    componentId: string,
    update: { widthMm?: number; heightMm?: number },
  ) => void
  onSelect?: (componentId: string) => void
  placementStatus?: PlacementStatus
  renderMode: RenderMode
  resolveDragPositionPx?: (screenPointPx: ScreenPointPx) => ScreenPointPx
  viewport: ViewportState
}

type ResizeHandleDirection =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'

function getResizeHandlePosition(direction: ResizeHandleDirection, boundsMm: BoundsMm) {
  const centerX = boundsMm.x + boundsMm.width / 2
  const centerY = boundsMm.y + boundsMm.height / 2

  switch (direction) {
    case 'nw':
      return { x: boundsMm.x, y: boundsMm.y }
    case 'n':
      return { x: centerX, y: boundsMm.y }
    case 'ne':
      return { x: boundsMm.x + boundsMm.width, y: boundsMm.y }
    case 'e':
      return { x: boundsMm.x + boundsMm.width, y: centerY }
    case 'se':
      return { x: boundsMm.x + boundsMm.width, y: boundsMm.y + boundsMm.height }
    case 's':
      return { x: centerX, y: boundsMm.y + boundsMm.height }
    case 'sw':
      return { x: boundsMm.x, y: boundsMm.y + boundsMm.height }
    case 'w':
      return { x: boundsMm.x, y: centerY }
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
  onResize,
  onSelect,
  placementStatus,
  renderMode,
  resolveDragPositionPx,
  viewport,
}: ComponentNodeProps) {
  const baseSpec = getResolvedComponentSpec(instance.type, instance.variantId)
  const spec = getResolvedComponentSpecForInstance(instance)
  const screenAnchorPx = worldToScreen(instance.anchorMm, viewport)
  const bodyBoundsMm = spec.visualBodyBoundsMm
  const footprintBoundsMm = spec.footprintBoundsMm
  const boundsMm = spec.hitBoundsMm
  const supportBoundsMm = getEffectiveSupportBoundsMm(instance, spec)
  const mountBoundsMm = spec.mountVisualBoundsMm ?? spec.mount.supportBoundsMm
  const showIntegratedMount =
    renderMode === 'realistic' &&
    shouldIncludeDefaultMount(instance) &&
    !!spec.mountRenderHint &&
    !!spec.mountVisualBoundsMm
  const accentStroke = getPlacementAccent(placementStatus)
  const showOverlay = isSelected || isPreview || isHovered || isHighlighted
  const stroke = isPreview
    ? accentStroke
    : isSelected
      ? '#f1fbff'
      : isHighlighted
        ? '#f5d28c'
        : isHovered
          ? '#def3fb'
          : spec.renderHint.stroke
  const overlayStroke = isPreview
    ? accentStroke
    : isSelected
      ? '#8ccfdf'
      : isHighlighted
        ? '#f5d28c'
        : '#6e8794'
  const labelWidth = Math.max(supportBoundsMm.width, mountBoundsMm.width, 42)
  const resizeHandleDirections: ResizeHandleDirection[] = [
    'nw',
    'n',
    'ne',
    'e',
    'se',
    's',
    'sw',
    'w',
  ]

  const handleSelect = () => {
    onSelect?.(instance.id)
  }

  const handleResize = (
    direction: ResizeHandleDirection,
    positionMm: { x: number; y: number },
  ) => {
    if (!onResize) {
      return
    }

    const centerX = footprintBoundsMm.x + footprintBoundsMm.width / 2
    const centerY = footprintBoundsMm.y + footprintBoundsMm.height / 2
    const nextWidthMm =
      direction.includes('e') || direction.includes('w')
        ? Math.max(
            6,
            Math.abs(positionMm.x - centerX) * 2,
            baseSpec.footprintBoundsMm.width * 0.35,
          )
        : undefined
    const nextHeightMm =
      direction.includes('n') || direction.includes('s')
        ? Math.max(
            6,
            Math.abs(positionMm.y - centerY) * 2,
            baseSpec.footprintBoundsMm.height * 0.35,
          )
        : undefined

    onResize(instance.id, {
      widthMm: nextWidthMm,
      heightMm: nextHeightMm,
    })
  }

  return (
    <Group
      draggable={isDragEnabled && !isPreview}
      dragDistance={1}
      listening={!isPreview}
      onClick={(event) => {
        if (!onSelect) {
          return
        }

        event.cancelBubble = true
        handleSelect()
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
      onMouseDown={(event) => {
        event.cancelBubble = true
        handleSelect()
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
        handleSelect()
      }}
      onTouchStart={(event) => {
        event.cancelBubble = true
        handleSelect()
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

      {showOverlay ? (
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
          opacity={isHovered && !isSelected && !isHighlighted ? 0.68 : 0.96}
          stroke={overlayStroke}
          strokeWidth={isSelected ? 0.95 : isHighlighted ? 0.9 : 0.8}
          width={supportBoundsMm.width}
          x={supportBoundsMm.x}
          y={supportBoundsMm.y}
        />
      ) : null}

      {renderMode === 'realistic'
        ? renderRealisticHardware(
            {
              bodyBoundsMm,
              instance,
              mountBoundsMm,
              mountFill: spec.mountRenderHint?.fill ?? '#29333d',
              mountStroke: isSelected
                ? '#b8dceb'
                : isHighlighted
                  ? '#f5d28c'
                  : isHovered
                    ? '#d6e1e6'
                    : spec.mountRenderHint?.stroke ?? '#9fb3bf',
              opticFill: spec.renderHint.fill,
              opticStroke: stroke,
              showMount: showIntegratedMount,
              spec,
            },
          )
        : (
            <ComponentGlyph
              boundsMm={bodyBoundsMm}
              fill={spec.renderHint.fill}
              glyph={spec.renderHint.glyph}
              isConvex={instance.config.curvedMirror?.isConvex}
              stroke={stroke}
            />
          )}

      {renderMode === 'simple' && isHovered && !isSelected && !isPreview ? (
        <Rect
          cornerRadius={2}
          dash={[3, 2]}
          height={mountBoundsMm.height}
          listening={false}
          opacity={0.45}
          stroke="rgba(180, 210, 225, 0.5)"
          strokeWidth={0.7}
          width={mountBoundsMm.width}
          x={mountBoundsMm.x}
          y={mountBoundsMm.y}
        />
      ) : null}

      {spec.opticalCenterMm && renderMode === 'realistic' && showOverlay ? (
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

      {showOverlay ? (
        <Circle
          fill={isPreview ? accentStroke : '#0c1014'}
          radius={1.8}
          stroke={accentStroke}
          strokeWidth={0.55}
          x={0}
          y={0}
        />
      ) : null}

      {isSelected && !isPreview && onResize ? (
        <>
          {resizeHandleDirections.map((direction) => {
            const handlePosition = getResizeHandlePosition(direction, footprintBoundsMm)

            return (
              <Rect
                cornerRadius={1.2}
                draggable
                fill="#f4fbff"
                height={4.8}
                key={direction}
                onDragEnd={(event) => {
                  event.cancelBubble = true
                  handleResize(direction, {
                    x: event.target.x(),
                    y: event.target.y(),
                  })
                }}
                onDragMove={(event) => {
                  event.cancelBubble = true
                  handleResize(direction, {
                    x: event.target.x(),
                    y: event.target.y(),
                  })
                }}
                onDragStart={(event) => {
                  event.cancelBubble = true
                }}
                onMouseDown={(event) => {
                  event.cancelBubble = true
                }}
                onTouchStart={(event) => {
                  event.cancelBubble = true
                }}
                stroke="#10222a"
                strokeWidth={0.45}
                width={4.8}
                x={handlePosition.x - 2.4}
                y={handlePosition.y - 2.4}
              />
            )
          })}
        </>
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
          width={labelWidth}
          x={-labelWidth / 2}
          y={supportBoundsMm.y + supportBoundsMm.height + 4.5}
        />
      ) : null}
    </Group>
  )
}

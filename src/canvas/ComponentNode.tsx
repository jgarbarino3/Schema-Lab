import { Circle, Ellipse, Group, Line, Rect, Text } from 'react-konva'
import {
  getEffectiveSupportBoundsMm,
  getResolvedComponentSpec,
  getResolvedComponentSpecForInstance,
  shouldIncludeDefaultMount,
} from '../domain/componentCatalog'
import { quarterTurnsToDegrees, worldToScreen } from '../domain/geometry'
import type {
  BoundsMm,
  ComponentFootprintShape,
  ComponentInstance,
  PlacementStatus,
  RenderMode,
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

function renderRealisticHardware(
  instance: ComponentInstance,
  bodyBoundsMm: BoundsMm,
  mountBoundsMm: BoundsMm,
  mountStroke: string,
  mountFill: string,
  opticStroke: string,
  opticFill: string,
  showMount: boolean,
) {
  const centerX = bodyBoundsMm.x + bodyBoundsMm.width / 2
  const centerY = bodyBoundsMm.y + bodyBoundsMm.height / 2
  const mountRadius = Math.min(mountBoundsMm.width, mountBoundsMm.height) / 2
  const opticRadius = Math.max(3.8, Math.min(bodyBoundsMm.width, bodyBoundsMm.height) * 0.42)
  const screwRadius = Math.max(1.4, mountRadius * 0.14)
  const screwOffset = Math.max(7, mountRadius - 4.5)
  const mountBase =
    showMount && instance.type !== 'bbo-crystal' ? (
      <>
        <Circle
          fill={mountFill}
          radius={mountRadius}
          stroke={mountStroke}
          strokeWidth={0.9}
          x={mountBoundsMm.x + mountBoundsMm.width / 2}
          y={mountBoundsMm.y + mountBoundsMm.height / 2}
        />
        <Circle
          fill="rgba(13, 17, 22, 0.52)"
          radius={Math.max(5, mountRadius - 4)}
          stroke="rgba(201, 217, 226, 0.18)"
          strokeWidth={0.5}
          x={mountBoundsMm.x + mountBoundsMm.width / 2}
          y={mountBoundsMm.y + mountBoundsMm.height / 2}
        />
        <Circle
          fill="#f2dc86"
          radius={screwRadius}
          stroke="#10151b"
          strokeWidth={0.45}
          x={centerX}
          y={centerY - screwOffset}
        />
        <Circle
          fill="#f2dc86"
          radius={screwRadius}
          stroke="#10151b"
          strokeWidth={0.45}
          x={centerX - screwOffset * 0.86}
          y={centerY + screwOffset * 0.5}
        />
        <Circle
          fill="#f2dc86"
          radius={screwRadius}
          stroke="#10151b"
          strokeWidth={0.45}
          x={centerX + screwOffset * 0.86}
          y={centerY + screwOffset * 0.5}
        />
      </>
    ) : null

  switch (instance.type) {
    case 'mirror':
      return (
        <>
          {mountBase}
          <Circle
            fill={opticFill}
            radius={opticRadius}
            stroke="#f2f7fb"
            strokeWidth={0.95}
            x={centerX}
            y={centerY}
          />
          <Line
            lineCap="round"
            points={[
              centerX + opticRadius * 0.72,
              centerY - opticRadius * 0.72,
              centerX - opticRadius * 0.72,
              centerY + opticRadius * 0.72,
            ]}
            stroke={opticStroke}
            strokeWidth={1.2}
          />
        </>
      )
    case 'beamsplitter':
      return (
        <>
          {mountBase}
          <Circle
            fill="rgba(79, 130, 148, 0.28)"
            radius={opticRadius}
            stroke="#d4eef4"
            strokeWidth={0.9}
            x={centerX}
            y={centerY}
          />
          <Line
            dash={[2.2, 2.2]}
            lineCap="round"
            points={[
              centerX - opticRadius * 0.75,
              centerY + opticRadius * 0.75,
              centerX + opticRadius * 0.75,
              centerY - opticRadius * 0.75,
            ]}
            stroke={opticStroke}
            strokeWidth={1.1}
          />
        </>
      )
    case 'lens':
      return (
        <>
          {mountBase}
          <Ellipse
            fill="rgba(130, 197, 230, 0.32)"
            radiusX={Math.max(2.4, bodyBoundsMm.width * 0.18)}
            radiusY={Math.max(7, bodyBoundsMm.height * 0.42)}
            stroke="#d9eef8"
            strokeWidth={0.95}
            x={centerX}
            y={centerY}
          />
        </>
      )
    case 'filter':
      return (
        <>
          {mountBase}
          <Rect
            fill="rgba(148, 214, 214, 0.14)"
            height={Math.max(8, bodyBoundsMm.height * 0.54)}
            rotation={45}
            stroke="#d8f4f1"
            strokeWidth={0.8}
            width={Math.max(8, bodyBoundsMm.width * 0.54)}
            x={centerX - Math.max(8, bodyBoundsMm.width * 0.54) / 2}
            y={centerY - Math.max(8, bodyBoundsMm.width * 0.54) / 2}
          />
          <Line
            lineCap="round"
            points={[
              centerX - opticRadius * 0.8,
              centerY + opticRadius * 0.7,
              centerX + opticRadius * 0.8,
              centerY - opticRadius * 0.7,
            ]}
            stroke={opticStroke}
            strokeWidth={1.05}
          />
        </>
      )
    case 'iris':
      return (
        <>
          {mountBase}
          <Circle
            fill="rgba(21, 28, 19, 0.74)"
            radius={opticRadius + 1}
            stroke="#dcefd6"
            strokeWidth={0.85}
            x={centerX}
            y={centerY}
          />
          <Circle
            fill="#0c1014"
            radius={Math.max(2.2, opticRadius * 0.46)}
            stroke="#aac39f"
            strokeWidth={0.75}
            x={centerX}
            y={centerY}
          />
        </>
      )
    case 'bbo-crystal':
      return (
        <>
          {showMount ? (
            <Rect
              cornerRadius={3}
              fill={mountFill}
              height={mountBoundsMm.height}
              stroke={mountStroke}
              strokeWidth={0.95}
              width={mountBoundsMm.width}
              x={mountBoundsMm.x}
              y={mountBoundsMm.y}
            />
          ) : null}
          <Line
            closed
            fill="rgba(207, 192, 239, 0.2)"
            lineJoin="round"
            points={[
              centerX - 8,
              centerY,
              centerX,
              centerY - 7,
              centerX + 8,
              centerY,
              centerX,
              centerY + 7,
            ]}
            stroke={opticStroke}
            strokeWidth={1}
          />
        </>
      )
    case 'laser-source':
      return (
        <>
          <Rect
            cornerRadius={4}
            fill={opticFill}
            height={bodyBoundsMm.height}
            stroke={opticStroke}
            strokeWidth={1}
            width={bodyBoundsMm.width}
            x={bodyBoundsMm.x}
            y={bodyBoundsMm.y}
          />
          <Rect
            cornerRadius={3}
            fill="rgba(255, 255, 255, 0.08)"
            height={Math.max(8, bodyBoundsMm.height * 0.18)}
            stroke="rgba(255, 255, 255, 0.18)"
            strokeWidth={0.45}
            width={bodyBoundsMm.width * 0.72}
            x={bodyBoundsMm.x + bodyBoundsMm.width * 0.12}
            y={bodyBoundsMm.y + bodyBoundsMm.height * 0.08}
          />
          <Rect
            cornerRadius={2}
            fill="rgba(12, 18, 22, 0.4)"
            height={bodyBoundsMm.height * 0.76}
            stroke="rgba(220, 227, 223, 0.2)"
            strokeWidth={0.4}
            width={Math.max(16, bodyBoundsMm.width * 0.08)}
            x={bodyBoundsMm.x + bodyBoundsMm.width - Math.max(16, bodyBoundsMm.width * 0.12)}
            y={bodyBoundsMm.y + bodyBoundsMm.height * 0.12}
          />
          <Circle
            fill="#d7f1ff"
            radius={Math.max(2.2, Math.min(bodyBoundsMm.width, bodyBoundsMm.height) * 0.02)}
            stroke="#10222a"
            strokeWidth={0.45}
            x={bodyBoundsMm.x + bodyBoundsMm.width - Math.max(6, bodyBoundsMm.width * 0.03)}
            y={centerY}
          />
        </>
      )
    case 'sample-stage':
      if (instance.variantId === 'pi-ls-180') {
        const plateWidth = Math.min(210, bodyBoundsMm.width * 0.32)
        const plateHeight = Math.min(118, bodyBoundsMm.height * 0.78)
        const chainStartX = bodyBoundsMm.x + bodyBoundsMm.width * 0.4
        const chainEndX = bodyBoundsMm.x + bodyBoundsMm.width * 0.55

        return (
          <>
            <Rect
              cornerRadius={5}
              fill="#bfc4c7"
              height={bodyBoundsMm.height}
              stroke="#e7ecef"
              strokeWidth={1}
              width={bodyBoundsMm.width}
              x={bodyBoundsMm.x}
              y={bodyBoundsMm.y}
            />
            <Rect
              cornerRadius={4}
              fill="#181d22"
              height={plateHeight}
              stroke="#59626c"
              strokeWidth={0.9}
              width={plateWidth}
              x={centerX - plateWidth / 2}
              y={centerY - plateHeight / 2}
            />
            <Line
              lineCap="round"
              lineJoin="round"
              points={[
                chainStartX,
                bodyBoundsMm.y + bodyBoundsMm.height * 0.42,
                bodyBoundsMm.x + bodyBoundsMm.width * 0.72,
                bodyBoundsMm.y + bodyBoundsMm.height * 0.26,
                bodyBoundsMm.x + bodyBoundsMm.width * 0.92,
                centerY,
                bodyBoundsMm.x + bodyBoundsMm.width * 0.72,
                bodyBoundsMm.y + bodyBoundsMm.height * 0.74,
                chainEndX,
                bodyBoundsMm.y + bodyBoundsMm.height * 0.58,
              ]}
              stroke="#161b1f"
              strokeWidth={Math.max(4, bodyBoundsMm.height * 0.08)}
            />
            <Rect
              cornerRadius={3}
              fill="rgba(255, 255, 255, 0.1)"
              height={Math.max(10, bodyBoundsMm.height * 0.16)}
              stroke="rgba(255, 255, 255, 0.2)"
              strokeWidth={0.4}
              width={bodyBoundsMm.width * 0.22}
              x={bodyBoundsMm.x + bodyBoundsMm.width * 0.39}
              y={bodyBoundsMm.y + bodyBoundsMm.height * 0.07}
            />
          </>
        )
      }

      return (
        <>
          <Rect
            cornerRadius={4}
            fill={opticFill}
            height={bodyBoundsMm.height}
            stroke={opticStroke}
            strokeWidth={0.95}
            width={bodyBoundsMm.width}
            x={bodyBoundsMm.x}
            y={bodyBoundsMm.y}
          />
          <Rect
            cornerRadius={3}
            fill="rgba(255, 255, 255, 0.08)"
            height={bodyBoundsMm.height * 0.58}
            stroke="rgba(255, 255, 255, 0.18)"
            strokeWidth={0.4}
            width={bodyBoundsMm.width * 0.26}
            x={centerX - bodyBoundsMm.width * 0.13}
            y={centerY - bodyBoundsMm.height * 0.29}
          />
        </>
      )
    case 'spectrometer':
      return (
        <>
          <Rect
            cornerRadius={5}
            fill={opticFill}
            height={bodyBoundsMm.height}
            stroke={opticStroke}
            strokeWidth={1}
            width={bodyBoundsMm.width}
            x={bodyBoundsMm.x}
            y={bodyBoundsMm.y}
          />
          <Rect
            cornerRadius={3}
            fill="#14191e"
            height={Math.max(14, bodyBoundsMm.height * 0.28)}
            stroke="#48525d"
            strokeWidth={0.7}
            width={Math.max(18, bodyBoundsMm.width * 0.2)}
            x={bodyBoundsMm.x - Math.max(14, bodyBoundsMm.width * 0.16)}
            y={centerY - Math.max(14, bodyBoundsMm.height * 0.28) / 2}
          />
          <Rect
            cornerRadius={3}
            fill="rgba(255, 255, 255, 0.08)"
            height={Math.max(12, bodyBoundsMm.height * 0.16)}
            stroke="rgba(255, 255, 255, 0.18)"
            strokeWidth={0.4}
            width={bodyBoundsMm.width * 0.5}
            x={bodyBoundsMm.x + bodyBoundsMm.width * 0.18}
            y={bodyBoundsMm.y + bodyBoundsMm.height * 0.12}
          />
          <Circle
            fill="#11161b"
            radius={Math.max(4, Math.min(bodyBoundsMm.width, bodyBoundsMm.height) * 0.09)}
            stroke="#b6b0ff"
            strokeWidth={0.8}
            x={centerX}
            y={centerY}
          />
        </>
      )
    default:
      return (
        <>
          {showMount
            ? renderFootprintShape('circle', mountBoundsMm, {
                fill: mountFill,
                opacity: 0.94,
                stroke: mountStroke,
                strokeWidth: 0.9,
              })
            : null}
          {renderFootprintShape(
            'capsule',
            bodyBoundsMm,
            {
              fill: opticFill,
              opacity: 0.95,
              stroke: opticStroke,
              strokeWidth: 0.9,
            },
          )}
          <ComponentGlyph
            boundsMm={bodyBoundsMm}
            fill="rgba(255, 255, 255, 0.1)"
            glyph={specGlyphFallback(instance.type)}
            stroke={opticStroke}
          />
        </>
      )
  }
}

function specGlyphFallback(type: ComponentInstance['type']) {
  switch (type) {
    case 'optic-mount':
      return 'mount'
    case 'support-hardware':
      return 'support'
    case 'laser-source':
      return 'laser'
    case 'fiber-coupler':
      return 'fiber'
    case 'spectrometer':
      return 'spectrometer'
    case 'detector':
      return 'detector'
    case 'beam-dump':
      return 'beam-dump'
    case 'sample-stage':
      return 'sample'
    default:
      return 'mount'
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
            instance,
            bodyBoundsMm,
            mountBoundsMm,
            isSelected
              ? '#b8dceb'
              : isHighlighted
                ? '#f5d28c'
                : isHovered
                  ? '#d6e1e6'
                  : spec.mountRenderHint?.stroke ?? '#9fb3bf',
            spec.mountRenderHint?.fill ?? '#29333d',
            stroke,
            spec.renderHint.fill,
            showIntegratedMount,
          )
        : (
            <ComponentGlyph
              boundsMm={bodyBoundsMm}
              fill={spec.renderHint.fill}
              glyph={spec.renderHint.glyph}
              stroke={stroke}
            />
          )}

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

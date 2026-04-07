import { useEffect, useRef } from 'react'
import { Circle, Group, Line, Rect, Text } from 'react-konva'
import {
  DEFAULT_POST_HOLDER_DIAMETER_MM,
  getEffectiveSupportBoundsMm,
  getResolvedComponentSpecForInstance,
  isPostMountedType,
  shouldIncludeDefaultMount,
} from '../domain/componentCatalog'
import { quarterTurnsToDegrees, worldToScreen } from '../domain/geometry'
import type {
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
  showLabels?: boolean
  showPostHolders?: boolean
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
  showLabels = true,
  showPostHolders = false,
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
  const labelWidth = Math.max(supportBoundsMm.width, mountBoundsMm.width, 38)
  const postHolderDiameterMm = instance.config.postHolderDiameterMm ?? DEFAULT_POST_HOLDER_DIAMETER_MM
  const showPostHolderCircle =
    showPostHolders &&
    renderMode === 'simple' &&
    isPostMountedType(instance.type)

  const handleSelect = () => {
    onSelect?.(instance.id)
  }

  const currentBoundsRef = useRef(footprintBoundsMm)
  useEffect(() => {
    currentBoundsRef.current = footprintBoundsMm
  }, [footprintBoundsMm])

  const resizeTimerRef = useRef<number | null>(null)

  const doUniformResize = (incrementMm: number) => {
    if (!onResize) return
    onResize(instance.id, {
      widthMm: Math.max(1, currentBoundsRef.current.width + incrementMm),
      heightMm: Math.max(1, currentBoundsRef.current.height + incrementMm),
    })
  }


  const startUniformResize = (incrementMm: number) => {
    doUniformResize(incrementMm)

    if (resizeTimerRef.current !== null) {
      window.clearTimeout(resizeTimerRef.current)
      window.clearInterval(resizeTimerRef.current)
    }

    const timeout = window.setTimeout(() => {
      resizeTimerRef.current = window.setInterval(() => {
        doUniformResize(incrementMm)
      }, 70)
    }, 400)
    
    resizeTimerRef.current = timeout
  }

  const stopUniformResize = () => {
    if (resizeTimerRef.current !== null) {
      window.clearTimeout(resizeTimerRef.current)
      window.clearInterval(resizeTimerRef.current)
      resizeTimerRef.current = null
    }
  }

  useEffect(() => {
    return () => stopUniformResize()
  }, [])

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
        ? spec.ports.map((port) => {
            const isInput = port.kind === 'beam-input'
            const isOutput = port.kind === 'beam-output'
            const fill = isInput
              ? '#7ee8a2'
              : isOutput
                ? '#f5c56a'
                : '#7ecce8'
            const label = isInput ? 'in' : isOutput ? 'out' : 'I/O'

            // Offset label outward from the anchor (0,0) so it doesn't sit on the optic
            const dx = port.positionMm.x
            const dy = port.positionMm.y
            const dist = Math.sqrt(dx * dx + dy * dy) || 1
            const labelOffsetX = (dx / dist) * 5
            const labelOffsetY = (dy / dist) * 5

            return (
              <Group key={port.id}>
                <Circle
                  fill={fill}
                  radius={1.8}
                  stroke="#11161b"
                  strokeWidth={0.4}
                  x={port.positionMm.x}
                  y={port.positionMm.y}
                />
                <Text
                  align="center"
                  fill={fill}
                  fontFamily="IBM Plex Sans, sans-serif"
                  fontSize={5.0}
                  fontStyle="bold"
                  listening={false}
                  opacity={0.9}
                  text={label}
                  width={10}
                  x={port.positionMm.x + labelOffsetX - 5}
                  y={port.positionMm.y + labelOffsetY - 2.8}
                />
              </Group>
            )
          })
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

      {showPostHolderCircle ? (
        <Circle
          fill="rgba(160, 200, 220, 0.15)"
          listening={false}
          radius={postHolderDiameterMm / 2}
          stroke="rgba(180, 215, 235, 0.45)"
          strokeWidth={0.6}
          x={0}
          y={0}
        />
      ) : null}

      {isSelected && !isPreview && onResize ? (
        <>

          <Group 
             x={supportBoundsMm.x + supportBoundsMm.width + 4.8} 
             y={supportBoundsMm.y + 3.2}
             onMouseDown={(e) => { e.cancelBubble = true; startUniformResize(1) }}
             onTouchStart={(e) => { e.cancelBubble = true; startUniformResize(1) }}
             onMouseUp={(e) => { e.cancelBubble = true; stopUniformResize() }}
             onTouchEnd={(e) => { e.cancelBubble = true; stopUniformResize() }}
             onMouseEnter={(e) => { e.target.getStage()?.container().style.setProperty('cursor', 'pointer') }}
             onMouseLeave={(e) => { 
                e.target.getStage()?.container().style.setProperty('cursor', 'default')
                stopUniformResize() 
             }}
           >
             <Rect cornerRadius={1.6} fill="#4ba3bd" width={6.4} height={6.4} offsetX={3.2} offsetY={3.2} stroke="#10222a" strokeWidth={0.5} />
             <Text text="+" fontSize={6.2} fill="#f1fbff" offsetX={1.9} offsetY={2.8} />
          </Group>
          <Group 
             x={supportBoundsMm.x + supportBoundsMm.width + 4.8} 
             y={supportBoundsMm.y + 11.2}
             onMouseDown={(e) => { e.cancelBubble = true; startUniformResize(-1) }}
             onTouchStart={(e) => { e.cancelBubble = true; startUniformResize(-1) }}
             onMouseUp={(e) => { e.cancelBubble = true; stopUniformResize() }}
             onTouchEnd={(e) => { e.cancelBubble = true; stopUniformResize() }}
             onMouseEnter={(e) => { e.target.getStage()?.container().style.setProperty('cursor', 'pointer') }}
             onMouseLeave={(e) => { 
                e.target.getStage()?.container().style.setProperty('cursor', 'default')
                stopUniformResize() 
             }}
           >
             <Rect cornerRadius={1.6} fill="#4ba3bd" width={6.4} height={6.4} offsetX={3.2} offsetY={3.2} stroke="#10222a" strokeWidth={0.5} />
             <Text text="-" fontSize={6.8} fill="#f1fbff" offsetX={1.5} offsetY={3} />
          </Group>
        </>
      ) : null}

      {!isPreview && showLabels ? (
        <Text
          align="center"
          fill={
            isSelected
              ? 'rgba(244, 251, 255, 0.8)'
              : isHighlighted
                ? 'rgba(255, 242, 198, 0.78)'
                : 'rgba(230, 237, 242, 0.68)'
          }
          fontFamily="IBM Plex Sans, Avenir Next, Segoe UI, sans-serif"
          fontSize={isSelected || isHighlighted ? 5.4 : 5.0}
          listening={false}
          text={instance.label}
          width={labelWidth}
          x={-labelWidth / 2}
          y={supportBoundsMm.y + supportBoundsMm.height + 2.6}
        />
      ) : null}
    </Group>
  )
}

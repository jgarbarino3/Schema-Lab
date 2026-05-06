import { memo, useEffect, useRef } from 'react'
import type { KonvaEventObject } from 'konva/lib/Node'
import { Circle, Group, Line, Rect, Text } from 'react-konva'
import {
  DEFAULT_POST_HOLDER_DIAMETER_MM,
  getEffectiveSupportBoundsMm,
  getResolvedComponentSpecForInstance,
  isPostMountedType,
  supportsSimpleGlyphAppearance,
  shouldIncludeDefaultMount,
} from '../domain/componentCatalog'
import {
  normalizeQuarterTurns,
  quarterTurnsToDegrees,
  rotateBoundsQuarterTurns,
  rotatePointQuarterTurns,
  worldToScreen,
} from '../domain/geometry'
import type {
  ComponentInstance,
  PlacementStatus,
  RenderMode,
  ScreenPointPx,
  SimpleIconStyle,
  ViewportState,
} from '../domain/types'
import { ComponentGlyph } from './ComponentGlyph'
import { wavelengthToHex } from './beamColorUtil'
import { renderRealisticHardware } from './realisticHardware'
import { resolveSupportHardwareDetail } from './supportHardwareDetail'
import { useEditorStore } from '../state/editorStore'

export interface SimpleGlyphAppearance {
  color: string
  scale: number
  weight: number
}

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
  onOpenContextMenu?: (
    componentId: string,
    event: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => void
  onResize?: (
    componentId: string,
    update: { widthMm?: number; heightMm?: number },
  ) => void
  onSelect?: (
    componentId: string,
    event?: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => void
  placementStatus?: PlacementStatus
  renderMode: RenderMode
  resolveDragPositionPx?: (screenPointPx: ScreenPointPx) => ScreenPointPx
  simpleGlyphAppearance?: SimpleGlyphAppearance
  simpleIconStyle?: SimpleIconStyle
  surfaceSupportCompensationMm?: number
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
  const numericValue = Number.parseInt(expanded, 16)

  if (!Number.isFinite(numericValue)) {
    return hexColor
  }

  const red = (numericValue >> 16) & 255
  const green = (numericValue >> 8) & 255
  const blue = numericValue & 255

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function scaleBoundsAboutCenter(
  boundsMm: { x: number; y: number; width: number; height: number },
  scale: number,
) {
  const scaledWidth = boundsMm.width * scale
  const scaledHeight = boundsMm.height * scale
  return {
    x: boundsMm.x + (boundsMm.width - scaledWidth) / 2,
    y: boundsMm.y + (boundsMm.height - scaledHeight) / 2,
    width: scaledWidth,
    height: scaledHeight,
  }
}

export function ComponentNodeView({
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
  onOpenContextMenu,
  onResize,
  onSelect,
  placementStatus,
  renderMode,
  resolveDragPositionPx,
  simpleGlyphAppearance,
  simpleIconStyle = 'enhanced',
  surfaceSupportCompensationMm = 0,
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
  const componentRotationDegrees = quarterTurnsToDegrees(instance.rotationQuarterTurns)
  const labelScreenBoundsMm = rotateBoundsQuarterTurns(
    supportBoundsMm,
    instance.rotationQuarterTurns,
  )
  const labelScreenTopLeftMm = {
    x: labelScreenBoundsMm.x + labelScreenBoundsMm.width / 2 - labelWidth / 2,
    y: labelScreenBoundsMm.y + labelScreenBoundsMm.height + 2.6,
  }
  const labelLocalTopLeftMm = rotatePointQuarterTurns(
    labelScreenTopLeftMm,
    normalizeQuarterTurns(-instance.rotationQuarterTurns),
  )
  const postHolderDiameterMm = instance.config.postHolderDiameterMm ?? DEFAULT_POST_HOLDER_DIAMETER_MM
  const supportHardwareDetail = resolveSupportHardwareDetail({
    renderMode,
    showPostHolders,
    type: instance.type,
    zoomPxPerMm: viewport.zoomPxPerMm,
  })
  const showPostHolderCircle =
    renderMode === 'simple' && supportHardwareDetail !== 'none'
  const showSupportCompensation =
    surfaceSupportCompensationMm > 0.1 && isPostMountedType(instance.type)
  const mountCenterX = mountBoundsMm.x + mountBoundsMm.width / 2
  const mountCenterY = mountBoundsMm.y + mountBoundsMm.height / 2
  const compensationOuterRadiusMm =
    Math.min(mountBoundsMm.width, mountBoundsMm.height) / 2 +
    Math.min(3.4, surfaceSupportCompensationMm * 0.08)
  const compensationInnerRadiusMm = Math.max(
    0.6,
    compensationOuterRadiusMm - (renderMode === 'realistic' ? 1.2 : 1.6),
  )
  const isEnabledSource = instance.type === 'laser-source' && instance.config.source?.isEnabled
  const isSimpleSourceCard =
    renderMode === 'simple' &&
    instance.type === 'laser-source' &&
    spec.mount.mode === 'external-source'
  const supportsSimpleAppearance = supportsSimpleGlyphAppearance(spec)
  const effectiveSimpleGlyphColor = simpleGlyphAppearance?.color ?? stroke
  const effectiveSimpleGlyphScale = simpleGlyphAppearance?.scale ?? 1
  const effectiveSimpleGlyphWeight = simpleGlyphAppearance?.weight ?? 1
  const simpleGlyphBoundsMm =
    renderMode === 'simple' && supportsSimpleAppearance
      ? scaleBoundsAboutCenter(bodyBoundsMm, effectiveSimpleGlyphScale)
      : bodyBoundsMm
  const simpleGlyphFill =
    renderMode === 'simple' && supportsSimpleAppearance
      ? applyAlpha(effectiveSimpleGlyphColor, 0.14)
      : spec.renderHint.fill
  const sourceGlowColor = isEnabledSource
    ? wavelengthToHex(instance.config.source?.wavelengthNm ?? 0)
    : 'transparent'
  const simpleSourceCardWidthMm = Math.max(
    bodyBoundsMm.width + 18,
    spec.shortVariantLabel.length * 3.7,
    40,
  )
  const simpleSourceCardHeightMm = Math.max(bodyBoundsMm.height + 11, 18)

  const handleSelect = (
    event?: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    onSelect?.(instance.id, event)
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
        handleSelect(event)
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
        if (isDragEnabled || onSelect || onResize) {
          event.cancelBubble = true
        }
      }}
      onContextMenu={(event) => {
        if (!onOpenContextMenu) {
          return
        }

        event.cancelBubble = true
        event.evt.preventDefault()
        onOpenContextMenu(instance.id, event)
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
        handleSelect(event)
      }}
      onTouchStart={(event) => {
        if (isDragEnabled || onSelect || onResize) {
          event.cancelBubble = true
        }
      }}
      rotation={componentRotationDegrees}
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

      {showSupportCompensation ? (
        <>
          <Circle
            fill={
              renderMode === 'realistic'
                ? 'rgba(91, 105, 116, 0.3)'
                : 'rgba(118, 173, 204, 0.14)'
            }
            listening={false}
            radius={compensationOuterRadiusMm}
            stroke={
              renderMode === 'realistic'
                ? 'rgba(214, 226, 236, 0.3)'
                : 'rgba(169, 219, 242, 0.42)'
            }
            strokeWidth={0.5}
            x={mountCenterX}
            y={mountCenterY}
          />
          <Circle
            fill="rgba(0, 0, 0, 0)"
            listening={false}
            radius={compensationInnerRadiusMm}
            stroke={
              renderMode === 'realistic'
                ? 'rgba(25, 31, 36, 0.3)'
                : 'rgba(46, 79, 96, 0.28)'
            }
            strokeWidth={0.45}
            x={mountCenterX}
            y={mountCenterY}
          />
        </>
      ) : null}

      {isEnabledSource ? (
        <Circle
          fill="transparent"
          listening={false}
          radius={bodyBoundsMm.height * 1.6}
          shadowBlur={18}
          shadowColor={sourceGlowColor}
          shadowOpacity={0.35}
          x={bodyBoundsMm.x + bodyBoundsMm.width / 2}
          y={bodyBoundsMm.y + bodyBoundsMm.height / 2}
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
            <>
              {isSimpleSourceCard ? (
                <>
                  <Rect
                    cornerRadius={3.2}
                    fill={isEnabledSource ? 'rgba(9, 13, 18, 0.97)' : 'rgba(12, 17, 22, 0.94)'}
                    listening={false}
                    shadowBlur={12}
                    shadowColor={sourceGlowColor}
                    shadowOpacity={isEnabledSource ? 0.22 : 0.12}
                    stroke={isEnabledSource ? sourceGlowColor : '#d7e5ec'}
                    strokeWidth={0.95}
                    width={simpleSourceCardWidthMm}
                    x={-simpleSourceCardWidthMm / 2}
                    y={-simpleSourceCardHeightMm / 2}
                    height={simpleSourceCardHeightMm}
                  />
                  <Rect
                    cornerRadius={1.3}
                    fill={isEnabledSource ? sourceGlowColor : 'rgba(217, 245, 255, 0.72)'}
                    listening={false}
                    opacity={isEnabledSource ? 0.88 : 0.62}
                    width={simpleSourceCardWidthMm - 10}
                    x={-simpleSourceCardWidthMm / 2 + 5}
                    y={-simpleSourceCardHeightMm / 2 + 3.4}
                    height={1.05}
                  />
                  {showLabels ? (
                    <Text
                      align="center"
                      fill={isEnabledSource ? '#f7fbff' : '#e2edf3'}
                      fontFamily="IBM Plex Sans, Avenir Next, Segoe UI, sans-serif"
                      fontSize={5.45}
                      fontStyle="bold"
                      listening={false}
                      text={spec.shortVariantLabel}
                      width={simpleSourceCardWidthMm - 8}
                      x={-simpleSourceCardWidthMm / 2 + 4}
                      y={-2.95}
                    />
                  ) : null}
                </>
              ) : null}
              <ComponentGlyph
                boundsMm={
                  isSimpleSourceCard
                    ? {
                        ...bodyBoundsMm,
                        width: Math.max(bodyBoundsMm.width, 12),
                        x: bodyBoundsMm.x,
                      }
                    : simpleGlyphBoundsMm
                }
                fill={isSimpleSourceCard ? 'transparent' : simpleGlyphFill}
                glyph={spec.renderHint.glyph}
                isConvex={instance.config.curvedMirror?.isConvex}
                stroke={
                  isSimpleSourceCard
                    ? '#f4fbff'
                    : renderMode === 'simple' && supportsSimpleAppearance
                      ? effectiveSimpleGlyphColor
                      : stroke
                }
                strokeScale={renderMode === 'simple' ? effectiveSimpleGlyphWeight : 1}
                style={renderMode === 'simple' ? simpleIconStyle : 'enhanced'}
              />
            </>
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
              ? 'rgba(244, 251, 255, 0.86)'
              : isHighlighted
                ? 'rgba(255, 242, 198, 0.84)'
                : renderMode === 'simple'
                  ? 'rgba(236, 242, 247, 0.88)'
                  : 'rgba(230, 237, 242, 0.76)'
          }
          fontFamily="IBM Plex Sans, Avenir Next, Segoe UI, sans-serif"
          fontSize={isSelected || isHighlighted ? 6.05 : renderMode === 'simple' ? 5.8 : 5.35}
          fontStyle={renderMode === 'simple' || isSelected || isHighlighted ? 'bold' : 'normal'}
          listening={false}
          rotation={-componentRotationDegrees}
          text={instance.label}
          width={labelWidth}
          x={labelLocalTopLeftMm.x}
          y={labelLocalTopLeftMm.y}
        />
      ) : null}
    </Group>
  )
}

export const ComponentNode = memo(function ComponentNode(props: ComponentNodeProps) {
  const storedSimpleGlyphAppearance = useEditorStore(
    (state) => state.simpleGlyphAppearances[props.instance.id],
  )
  const globalSimpleIconStyle = useEditorStore((state) => state.simpleIconStyle)
  const simpleGlyphAppearance =
    props.simpleGlyphAppearance ?? storedSimpleGlyphAppearance
  const simpleIconStyle =
    props.instance.simpleIconStyleOverride ?? props.simpleIconStyle ?? globalSimpleIconStyle

  return (
    <ComponentNodeView
      {...props}
      simpleGlyphAppearance={simpleGlyphAppearance}
      simpleIconStyle={simpleIconStyle}
    />
  )
})

import { memo, useEffect, useMemo, useRef } from 'react'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Context as KonvaContext } from 'konva/lib/Context'
import type { Group as KonvaGroup } from 'konva/lib/Group'
import type { Shape as KonvaShape } from 'konva/lib/Shape'
import { Group, Rect, Shape } from 'react-konva'
import { worldToScreen } from '../../domain/geometry'
import type { ScreenPointPx, ViewportState } from '../../domain/types'
import {
  getLiveSurfaceCacheKey,
  getLiveSurfaceLabel,
  getLiveSurfaceRenderTier,
  getSurfaceHoleAxesMm,
  getVisibleSurfaceLocalBoundsMm,
  type LiveSurfaceDescriptor,
} from './surfaceDescriptors'

interface LiveSurfaceLayerProps {
  anchorMm?: { x: number; y: number }
  draggable?: boolean
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

function drawRoundedRectPath(
  context: KonvaContext,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = clamp(radius, 0, Math.min(width, height) / 2)

  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.lineTo(x + width - safeRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  context.lineTo(x + width, y + height - safeRadius)
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  context.lineTo(x + safeRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  context.lineTo(x, y + safeRadius)
  context.quadraticCurveTo(x, y, x + safeRadius, y)
  context.closePath()
}

function resolveBoardFill(surface: LiveSurfaceDescriptor) {
  if (surface.palette.boardGradientStops?.length) {
    return undefined
  }

  return surface.palette.boardFill
}

function getSurfaceCounterbores(surface: LiveSurfaceDescriptor) {
  if (surface.counterborePattern === 'none') {
    return []
  }

  const candidates = [
    { x: 25, y: 25 },
    { x: surface.widthMm - 25, y: 25 },
    { x: 25, y: surface.heightMm - 25 },
    { x: surface.widthMm - 25, y: surface.heightMm - 25 },
  ]

  return candidates.filter(
    (candidate) =>
      candidate.x > 0 &&
      candidate.x < surface.widthMm &&
      candidate.y > 0 &&
      candidate.y < surface.heightMm,
  )
}

function renderSurfaceScene(
  context: KonvaContext,
  surface: LiveSurfaceDescriptor,
  viewport: ViewportState,
  flags: {
    isFocused: boolean
    isHighlighted: boolean
    isSelected: boolean
    showLabels: boolean
  },
) {
  const tier = getLiveSurfaceRenderTier(viewport.zoomPxPerMm)
  const visibleBoundsMm =
    tier === 'dense' ? getVisibleSurfaceLocalBoundsMm(surface, viewport) : null
  const holeAxes = getSurfaceHoleAxesMm(surface)
  const counterbores = getSurfaceCounterbores(surface)
  const boardStroke = flags.isSelected
    ? '#7aaebf'
    : flags.isHighlighted
      ? '#f0cb87'
      : flags.isFocused
        ? '#334d58'
        : surface.palette.boardStroke
  const shadowBlur = flags.isHighlighted && !flags.isSelected
    ? 10
    : flags.isSelected
      ? 8
      : flags.isFocused
        ? 4
        : 6
  const shadowColor = flags.isSelected || flags.isHighlighted || flags.isFocused
    ? boardStroke
    : '#000000'
  const labelText = getLiveSurfaceLabel(surface)
  const holeRadius = tier === 'dense' ? 1.5 : tier === 'medium' ? 1.15 : 0
  const holeStep =
    tier === 'dense'
      ? 1
      : surface.kind === 'optical-table'
        ? 4
        : 2

  context.save()
  context.globalAlpha = 1

  if (surface.palette.boardGradientStops?.length) {
    const gradient = context.createLinearGradient(0, 0, surface.widthMm, 0)

    for (const [offset, color] of surface.palette.boardGradientStops) {
      gradient.addColorStop(offset, color)
    }

    context.fillStyle = gradient
  } else {
    context.fillStyle = resolveBoardFill(surface) ?? surface.palette.boardFill
  }

  context.shadowBlur = shadowBlur
  context.shadowColor = shadowColor
  drawRoundedRectPath(context, 0, 0, surface.widthMm, surface.heightMm, 4)
  context.fill()

  context.shadowBlur = 0
  context.lineWidth = flags.isSelected ? 1.12 : flags.isHighlighted ? 1.02 : flags.isFocused ? 0.95 : 0.8
  context.strokeStyle = boardStroke
  context.stroke()

  if (counterbores.length > 0) {
    for (const counterbore of counterbores) {
      context.beginPath()
      context.fillStyle = '#2c343b'
      context.arc(counterbore.x, counterbore.y, 6.2, 0, Math.PI * 2)
      context.fill()
      context.lineWidth = 0.6
      context.strokeStyle = '#56616b'
      context.stroke()

      context.beginPath()
      context.fillStyle = surface.palette.holeFill
      context.arc(counterbore.x, counterbore.y, 2.1, 0, Math.PI * 2)
      context.fill()
    }
  }

  if (holeRadius > 0) {
    const visibleXMin = visibleBoundsMm ? visibleBoundsMm.x : 0
    const visibleYMin = visibleBoundsMm ? visibleBoundsMm.y : 0
    const visibleXMax = visibleBoundsMm
      ? visibleBoundsMm.x + visibleBoundsMm.width
      : surface.widthMm
    const visibleYMax = visibleBoundsMm
      ? visibleBoundsMm.y + visibleBoundsMm.height
      : surface.heightMm

    for (let xIndex = 0; xIndex < holeAxes.xPositionsMm.length; xIndex += holeStep) {
      const xPositionMm = holeAxes.xPositionsMm[xIndex]!

      if (tier === 'dense' && (xPositionMm < visibleXMin || xPositionMm > visibleXMax)) {
        continue
      }

      for (let yIndex = 0; yIndex < holeAxes.yPositionsMm.length; yIndex += holeStep) {
        const yPositionMm = holeAxes.yPositionsMm[yIndex]!

        if (tier === 'dense' && (yPositionMm < visibleYMin || yPositionMm > visibleYMax)) {
          continue
        }

        context.beginPath()
        context.fillStyle = surface.palette.holeFill
        context.arc(xPositionMm, yPositionMm, holeRadius, 0, Math.PI * 2)
        context.fill()
      }
    }
  }

  if (flags.showLabels) {
    context.save()
    context.fillStyle = surface.palette.labelColor
    context.font = `7px IBM Plex Sans, Avenir Next, Segoe UI, sans-serif`
    context.textBaseline = 'alphabetic'
    context.textAlign = 'left'
    context.fillText(labelText, 2, -2)
    context.restore()
  }

  context.restore()
}

function drawSurfaceHit(context: KonvaContext, surface: LiveSurfaceDescriptor) {
  context.save()
  context.fillStyle = 'rgba(0, 0, 0, 0.001)'
  context.fillRect(0, 0, surface.widthMm, surface.heightMm)
  context.restore()
}

export const LiveSurfaceLayer = memo(function LiveSurfaceLayer({
  anchorMm = { x: 0, y: 0 },
  draggable = false,
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
}: LiveSurfaceLayerProps) {
  const groupRef = useRef<KonvaGroup | null>(null)
  const shapeRef = useRef<KonvaShape | null>(null)
  const boardOriginPx = useMemo(() => worldToScreen(anchorMm, viewport), [anchorMm, viewport])
  const tier = useMemo(() => getLiveSurfaceRenderTier(viewport.zoomPxPerMm), [viewport.zoomPxPerMm])
  const cacheKey = useMemo(
    () =>
      getLiveSurfaceCacheKey(surface, tier, {
        isFocused,
        isHighlighted,
        isSelected,
        showLabels,
      }),
    [isFocused, isHighlighted, isSelected, showLabels, surface, tier],
  )

  useEffect(() => {
    const node = shapeRef.current

    if (!node) {
      return
    }

    node.clearCache()

    if (tier !== 'dense') {
      node.cache({
        pixelRatio:
          typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio)
            ? Math.min(window.devicePixelRatio, 1.5)
            : 1,
      })
    }
  }, [cacheKey, tier])

  return (
    <Group
      ref={groupRef}
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
      rotation={surface.rotationQuarterTurns * 90}
      scaleX={viewport.zoomPxPerMm}
      scaleY={viewport.zoomPxPerMm}
      x={boardOriginPx.x}
      y={boardOriginPx.y}
    >
      <Rect
        cornerRadius={4}
        fill="rgba(0, 0, 0, 0.001)"
        height={surface.heightMm}
        listening
        perfectDrawEnabled={false}
        strokeEnabled={false}
        width={surface.widthMm}
      />
      <Shape
        listening={false}
        ref={shapeRef}
        sceneFunc={(context) => {
          renderSurfaceScene(context, surface, viewport, {
            isFocused,
            isHighlighted,
            isSelected,
            showLabels,
          })
        }}
        hitFunc={(context) => drawSurfaceHit(context, surface)}
      />
    </Group>
  )
})

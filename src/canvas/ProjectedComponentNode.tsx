import { memo, useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { KonvaEventObject } from 'konva/lib/Node'
import { Circle, Ellipse, Group, Line, Rect, Text } from 'react-konva'
import {
  DEFAULT_POST_HOLDER_DIAMETER_MM,
  getEffectiveSupportBoundsMm,
  getResolvedComponentSpecForInstance,
  isPostMountedType,
} from '../domain/componentCatalog'
import type {
  BoundsMm,
  ComponentInstance,
  PlacementStatus,
  RenderMode,
  ScreenPointPx,
  ViewportState,
} from '../domain/types'
import {
  resolveRealisticSupportPostholderStyle,
  resolveRealisticSymbolStyle,
} from '../domain/realisticSymbolDecisions'
import { wavelengthToHex } from './beamColorUtil'
import {
  ProjectedSupportFoot,
  ProjectedSupportHolderBlock,
  ProjectedSupportPostShaft,
  ProjectedSupportShadow,
} from './realisticPrimitives'
import {
  projectLocalOffsetToScreen,
  projectWorldPointToScreen,
} from './renderers/tableViewProjection'
import { resolveSupportHardwareDetail } from './supportHardwareDetail'

interface ProjectedComponentNodeProps {
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
  showLabels?: boolean
  showPostHolders?: boolean
  surfaceElevationMm: number
  surfaceSupportCompensationMm?: number
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

function boundsPoints(boundsMm: BoundsMm) {
  return [
    { x: boundsMm.x, y: boundsMm.y },
    { x: boundsMm.x + boundsMm.width, y: boundsMm.y },
    { x: boundsMm.x + boundsMm.width, y: boundsMm.y + boundsMm.height },
    { x: boundsMm.x, y: boundsMm.y + boundsMm.height },
  ]
}

function sampleRoundedRectPoints(boundsMm: BoundsMm, radiusMm: number, steps = 4) {
  const radius = Math.max(
    0,
    Math.min(radiusMm, boundsMm.width / 2, boundsMm.height / 2),
  )
  const corners = [
    {
      center: { x: boundsMm.x + boundsMm.width - radius, y: boundsMm.y + radius },
      startAngle: -Math.PI / 2,
      endAngle: 0,
    },
    {
      center: {
        x: boundsMm.x + boundsMm.width - radius,
        y: boundsMm.y + boundsMm.height - radius,
      },
      startAngle: 0,
      endAngle: Math.PI / 2,
    },
    {
      center: {
        x: boundsMm.x + radius,
        y: boundsMm.y + boundsMm.height - radius,
      },
      startAngle: Math.PI / 2,
      endAngle: Math.PI,
    },
    {
      center: { x: boundsMm.x + radius, y: boundsMm.y + radius },
      startAngle: Math.PI,
      endAngle: (Math.PI * 3) / 2,
    },
  ]
  const points: Array<{ x: number; y: number }> = []

  for (const corner of corners) {
    for (let index = 0; index <= steps; index += 1) {
      const progress = index / steps
      const angle =
        corner.startAngle + (corner.endAngle - corner.startAngle) * progress

      points.push({
        x: corner.center.x + Math.cos(angle) * radius,
        y: corner.center.y + Math.sin(angle) * radius,
      })
    }
  }

  return points
}

function getBottomHalf(points: Array<{ x: number; y: number }>) {
  const centerY =
    points.reduce((sum, point) => sum + point.y, 0) / Math.max(1, points.length)

  return points.filter((point) => point.y >= centerY)
}

function toKonvaPoints(points: Array<{ x: number; y: number }>) {
  const flattened = points.flatMap((point) => [
    Number.isFinite(point.x) ? point.x : 0,
    Number.isFinite(point.y) ? point.y : 0,
  ])

  return flattened.length >= 4 ? flattened : [0, 0, 0, 0]
}

function polygonAtElevation(
  pointsMm: Array<{ x: number; y: number }>,
  localPoint: (pointMm: { x: number; y: number }, zMm?: number) => ScreenPointPx,
  zMm = 0,
) {
  return pointsMm.map((pointMm) => localPoint(pointMm, zMm))
}

function renderExtrudedProfile(args: {
  boundsMm: BoundsMm
  extrusionMm: number
  fill: string
  localPoint: (pointMm: { x: number; y: number }, zMm?: number) => ScreenPointPx
  profile:
    | 'body-capsule'
    | 'body-rect'
    | 'body-rounded-rect'
    | 'stage-deck'
    | 'optic-plate'
    | 'crystal-diamond'
    | 'beam-dump'
  stroke: string
}): ReactNode {
  let outlineMm: Array<{ x: number; y: number }>

  switch (args.profile) {
    case 'body-capsule':
      outlineMm = sampleRoundedRectPoints(
        args.boundsMm,
        args.boundsMm.height / 2,
        6,
      )
      break
    case 'body-rounded-rect':
      outlineMm = sampleRoundedRectPoints(
        args.boundsMm,
        Math.min(args.boundsMm.width, args.boundsMm.height) * 0.18,
      )
      break
    case 'crystal-diamond':
      outlineMm = [
        { x: args.boundsMm.x + args.boundsMm.width / 2, y: args.boundsMm.y },
        {
          x: args.boundsMm.x + args.boundsMm.width,
          y: args.boundsMm.y + args.boundsMm.height / 2,
        },
        {
          x: args.boundsMm.x + args.boundsMm.width / 2,
          y: args.boundsMm.y + args.boundsMm.height,
        },
        { x: args.boundsMm.x, y: args.boundsMm.y + args.boundsMm.height / 2 },
      ]
      break
    default:
      outlineMm = boundsPoints(args.boundsMm)
      break
  }

  const topPoints = polygonAtElevation(outlineMm, args.localPoint, args.extrusionMm)
  const frontStripMm = getBottomHalf(outlineMm)
  const frontStrip = [
    ...polygonAtElevation(frontStripMm, args.localPoint, args.extrusionMm),
    ...polygonAtElevation([...frontStripMm].reverse(), args.localPoint),
  ]
  const topFill =
    args.profile === 'beam-dump' ? shadeHex(args.fill, -0.12) : args.fill

  return (
    <>
      <Line
        closed
        fill={shadeHex(args.fill, -0.22)}
        listening={false}
        opacity={0.92}
        points={toKonvaPoints(frontStrip)}
        stroke={applyAlpha(args.stroke, 0.3)}
        strokeWidth={0.9}
      />
      <Line
        closed
        fill={topFill}
        listening={false}
        points={toKonvaPoints(topPoints)}
        shadowBlur={8}
        shadowColor={applyAlpha(args.stroke, 0.4)}
        shadowOpacity={0.2}
        stroke={args.stroke}
        strokeWidth={1}
      />
      {args.profile === 'stage-deck' ? (() => {
        const deckBoundsMm = {
          x: args.boundsMm.x + args.boundsMm.width * 0.12,
          y: args.boundsMm.y + args.boundsMm.height * 0.26,
          width: args.boundsMm.width * 0.76,
          height: args.boundsMm.height * 0.28,
        }
        const deckTop = polygonAtElevation(
          boundsPoints(deckBoundsMm),
          args.localPoint,
          args.extrusionMm + 2,
        )
        const deckCenter = args.localPoint(
          {
            x: deckBoundsMm.x + deckBoundsMm.width / 2,
            y: deckBoundsMm.y + deckBoundsMm.height / 2,
          },
          args.extrusionMm + 3,
        )

        return (
          <>
            <Line
              closed
              fill={applyAlpha('#eff5fa', 0.5)}
              listening={false}
              points={toKonvaPoints(deckTop)}
              stroke={applyAlpha('#f7fbff', 0.75)}
              strokeWidth={0.8}
            />
            <Circle
              fill="#162028"
              listening={false}
              radius={2.2}
              stroke={applyAlpha('#eff7ff', 0.85)}
              strokeWidth={0.7}
              x={deckCenter.x}
              y={deckCenter.y}
            />
          </>
        )
      })() : null}
      {args.profile === 'beam-dump'
        ? Array.from({ length: 4 }, (_, index) => {
            const ratio = (index + 1) / 5
            const start = args.localPoint(
              {
                x: args.boundsMm.x + args.boundsMm.width * 0.18,
                y: args.boundsMm.y + args.boundsMm.height * ratio,
              },
              args.extrusionMm + 0.5,
            )
            const end = args.localPoint(
              {
                x: args.boundsMm.x + args.boundsMm.width * 0.82,
                y: args.boundsMm.y + args.boundsMm.height * ratio,
              },
              args.extrusionMm + 0.5,
            )

            return (
              <Line
                key={`hatch-${index}`}
                listening={false}
                points={[start.x, start.y, end.x, end.y]}
                stroke={applyAlpha('#f6d3a1', 0.42)}
                strokeWidth={0.8}
              />
            )
          })
        : null}
    </>
  )
}

export const ProjectedComponentNode = memo(function ProjectedComponentNode({
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
  onOpenContextMenu,
  onResize,
  onSelect,
  placementStatus,
  renderMode,
  resolveDragPositionPx,
  showLabels = true,
  showPostHolders = false,
  surfaceElevationMm,
  surfaceSupportCompensationMm = 0,
  viewport,
}: ProjectedComponentNodeProps) {
  const spec = getResolvedComponentSpecForInstance(instance)
  const realisticSymbolStyle = resolveRealisticSymbolStyle(instance, spec)
  const realisticSupportPostholderStyle = resolveRealisticSupportPostholderStyle()
  const accentStroke = getPlacementAccent(placementStatus)
  const supportBoundsMm = getEffectiveSupportBoundsMm(instance, spec)
  const boundsMm = spec.hitBoundsMm
  const bodyBoundsMm = spec.visualBodyBoundsMm
  const labelAnchorMm =
    spec.twoPointFiveDVisualPreset?.labelAnchorMm ?? {
      x: supportBoundsMm.x + supportBoundsMm.width / 2,
      y: supportBoundsMm.y + supportBoundsMm.height + 4,
    }
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
  const anchorPx = projectWorldPointToScreen(
    instance.anchorMm,
    viewport,
    surfaceElevationMm,
  )
  const localPoint = useMemo(
    () =>
      (pointMm: { x: number; y: number }, zMm = 0) =>
        projectLocalOffsetToScreen(
          pointMm,
          viewport,
          instance.rotationQuarterTurns,
          zMm,
        ),
    [instance.rotationQuarterTurns, viewport],
  )
  const localBounds = polygonAtElevation(boundsPoints(boundsMm), localPoint)
  const supportPolygon = polygonAtElevation(boundsPoints(supportBoundsMm), localPoint)
  const xValues = supportPolygon.map((point) => point.x)
  const yValues = supportPolygon.map((point) => point.y)
  const supportAabb = {
    maxX: Math.max(...xValues),
    maxY: Math.max(...yValues),
    minX: Math.min(...xValues),
    minY: Math.min(...yValues),
  }
  const extrusionMm = spec.twoPointFiveDVisualPreset?.extrusionMm ?? 8
  const postHolderDiameterMm =
    instance.config.postHolderDiameterMm ?? DEFAULT_POST_HOLDER_DIAMETER_MM
  const supportHardwareDetail = resolveSupportHardwareDetail({
    renderMode,
    showPostHolders,
    type: instance.type,
    zoomPxPerMm: viewport.zoomPxPerMm,
  })
  const showPostHolderCircle =
    renderMode === 'simple' && supportHardwareDetail !== 'none'
  const projectedSupportHardwareDetail =
    renderMode !== 'realistic'
      ? 'none'
      : realisticSupportPostholderStyle === 'hardware'
        ? supportHardwareDetail
        : realisticSupportPostholderStyle === 'technical'
          ? supportHardwareDetail === 'none'
            ? 'none'
            : 'foot'
          : 'none'
  const showSupportCompensation =
    surfaceSupportCompensationMm > 0.1 &&
    isPostMountedType(instance.type) &&
    realisticSupportPostholderStyle !== 'schematic'
  const isEnabledSource =
    instance.type === 'laser-source' && instance.config.source?.isEnabled
  const sourceGlowColor = isEnabledSource
    ? wavelengthToHex(instance.config.source?.wavelengthNm ?? 0)
    : '#9ddfff'
  const labelPoint = localPoint(labelAnchorMm, extrusionMm * 0.35)
  const labelVisible = showLabels && viewport.zoomPxPerMm >= 0.55
  const currentBoundsRef = useRef(spec.footprintBoundsMm)
  const resizeTimerRef = useRef<number | null>(null)

  useEffect(() => {
    currentBoundsRef.current = spec.footprintBoundsMm
  }, [spec.footprintBoundsMm])

  useEffect(() => {
    return () => {
      if (resizeTimerRef.current !== null) {
        window.clearInterval(resizeTimerRef.current)
        window.clearTimeout(resizeTimerRef.current)
      }
    }
  }, [])

  const doUniformResize = (incrementMm: number) => {
    if (!onResize) {
      return
    }

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

    resizeTimerRef.current = window.setTimeout(() => {
      resizeTimerRef.current = window.setInterval(() => {
        doUniformResize(incrementMm)
      }, 70)
    }, 400)
  }

  const stopUniformResize = () => {
    if (resizeTimerRef.current !== null) {
      window.clearTimeout(resizeTimerRef.current)
      window.clearInterval(resizeTimerRef.current)
      resizeTimerRef.current = null
    }
  }

  const radiusCenterBase = localPoint(
    {
      x: bodyBoundsMm.x + bodyBoundsMm.width / 2,
      y: bodyBoundsMm.y + bodyBoundsMm.height / 2,
    },
    0,
  )
  const radiusCenterTop = localPoint(
    {
      x: bodyBoundsMm.x + bodyBoundsMm.width / 2,
      y: bodyBoundsMm.y + bodyBoundsMm.height / 2,
    },
    extrusionMm,
  )
  const radiusX = Math.max(
    6,
    Math.abs(localPoint({ x: bodyBoundsMm.width / 2, y: 0 }).x),
  )
  const radiusY = Math.max(
    4,
    Math.abs(localPoint({ x: 0, y: bodyBoundsMm.height / 2 }).y),
  )
  const supportCenterBase = {
    x: radiusCenterBase.x,
    y: radiusCenterBase.y + 2,
  }
  const supportDiameterPx = Math.max(
    postHolderDiameterMm * viewport.zoomPxPerMm,
    Math.abs(localPoint({ x: supportBoundsMm.width / 2, y: 0 }).x) * 1.24,
  )
  const supportFootRadiusX = clamp(supportDiameterPx * 0.52, 7, Math.max(12, radiusX * 0.96))
  const supportFootRadiusY = clamp(
    supportFootRadiusX * 0.34,
    3.4,
    Math.max(6, radiusY * 0.74),
  )
  const supportShadowRadiusX = supportFootRadiusX * 1.1
  const supportShadowRadiusY = supportFootRadiusY * 0.82
  const holderWidth = clamp(supportDiameterPx * 0.72, 11, Math.max(16, radiusX * 0.82))
  const holderHeight = clamp(supportDiameterPx * 0.28, 7, Math.max(10, radiusY * 0.92))
  const holderX = supportCenterBase.x - holderWidth / 2
  const holderY = supportCenterBase.y - holderHeight * 0.9
  const bodyUndersidePoint = localPoint(
    {
      x: bodyBoundsMm.x + bodyBoundsMm.width / 2,
      y: bodyBoundsMm.y + bodyBoundsMm.height / 2,
    },
    extrusionMm * 0.2,
  )
  const postShaftBottomY = holderY - 1
  const postShaftTopY = Math.min(bodyUndersidePoint.y + radiusY * 0.08, postShaftBottomY - 4)
  const postShaftWidth = clamp(holderWidth * 0.16, 1.6, 4.6)
  const bodyFill = spec.renderHint.fill
  const profile = spec.twoPointFiveDVisualPreset?.profile ?? 'body-rect'
  const usesProjectedSchematicOptic =
    renderMode === 'realistic' &&
    (instance.type === 'mirror' ||
      instance.type === 'curved-mirror' ||
      instance.type === 'beamsplitter' ||
      instance.type === 'lens')
  const handleSelect = (event?: KonvaEventObject<MouseEvent | TouchEvent>) => {
    onSelect?.(instance.id, event)
  }

  return (
    <Group
      draggable={isDragEnabled && !isPreview}
      dragDistance={1}
      listening={!isPreview}
      onClick={(event) => {
        event.cancelBubble = true
        handleSelect(event)
      }}
      onContextMenu={(event) => {
        if (!onOpenContextMenu) {
          return
        }

        event.cancelBubble = true
        event.evt.preventDefault()
        onOpenContextMenu(instance.id, event)
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
      onMouseEnter={() => onHoverChange?.(instance.id)}
      onMouseLeave={() => onHoverChange?.(undefined)}
      onTap={(event) => {
        event.cancelBubble = true
        handleSelect(event)
      }}
      onTouchStart={(event) => {
        if (isDragEnabled || onSelect || onResize) {
          event.cancelBubble = true
        }
      }}
      dragBoundFunc={
        isDragEnabled && resolveDragPositionPx
          ? (position) => resolveDragPositionPx(position)
          : undefined
      }
      x={anchorPx.x}
      y={anchorPx.y}
    >
      <Line
        closed
        fill="rgba(0, 0, 0, 0.001)"
        points={toKonvaPoints(localBounds)}
        strokeEnabled={false}
      />

      <Ellipse
        fill={applyAlpha('#05080b', 0.52)}
        listening={false}
        radiusX={Math.max(radiusX * 0.92, 8)}
        radiusY={Math.max(radiusY * 0.74, 5)}
        shadowBlur={14}
        shadowColor="#000000"
        shadowOpacity={0.25}
        x={radiusCenterBase.x}
        y={radiusCenterBase.y + 4}
      />

      {showOverlay ? (
        <Line
          closed
          dash={isPreview ? [6, 4] : [5, 4]}
          fill={
            isPreview
              ? 'rgba(110, 163, 185, 0.08)'
              : isSelected
                ? 'rgba(140, 207, 223, 0.06)'
                : isHighlighted
                  ? 'rgba(245, 210, 140, 0.06)'
                  : 'rgba(140, 207, 223, 0.03)'
          }
          listening={false}
          points={toKonvaPoints(supportPolygon)}
          stroke={overlayStroke}
          strokeWidth={1}
        />
      ) : null}

      {projectedSupportHardwareDetail !== 'none' ? (
        <>
          <ProjectedSupportShadow
            centerX={supportCenterBase.x}
            centerY={supportCenterBase.y + 2}
            radiusX={supportShadowRadiusX}
            radiusY={supportShadowRadiusY}
          />
          <ProjectedSupportFoot
            centerX={supportCenterBase.x}
            centerY={supportCenterBase.y}
            radiusX={supportFootRadiusX}
            radiusY={supportFootRadiusY}
          />
          {projectedSupportHardwareDetail === 'holder' ||
          projectedSupportHardwareDetail === 'full-stack' ? (
            <ProjectedSupportHolderBlock
              height={holderHeight}
              width={holderWidth}
              x={holderX}
              y={holderY}
            />
          ) : null}
          {projectedSupportHardwareDetail === 'full-stack' ? (
            <ProjectedSupportPostShaft
              bottomY={postShaftBottomY}
              centerX={supportCenterBase.x}
              topY={postShaftTopY}
              width={postShaftWidth}
            />
          ) : null}
        </>
      ) : null}

      {showPostHolderCircle ? (
        <Ellipse
          fill="rgba(160, 200, 220, 0.12)"
          listening={false}
          radiusX={postHolderDiameterMm * viewport.zoomPxPerMm * 0.5}
          radiusY={postHolderDiameterMm * viewport.zoomPxPerMm * 0.28}
          stroke="rgba(180, 215, 235, 0.36)"
          strokeWidth={0.7}
          x={radiusCenterBase.x}
          y={radiusCenterBase.y + 2}
        />
      ) : null}

      {showSupportCompensation ? (
        <Ellipse
          fill="rgba(118, 173, 204, 0.1)"
          listening={false}
          radiusX={Math.max(radiusX * 0.82, 7)}
          radiusY={Math.max(radiusY * 0.46, 4)}
          stroke="rgba(169, 219, 242, 0.24)"
          strokeWidth={0.8}
          x={radiusCenterBase.x}
          y={radiusCenterBase.y + 2}
        />
      ) : null}

      {isEnabledSource ? (
        <Ellipse
          fill="transparent"
          listening={false}
          radiusX={radiusX * 1.35}
          radiusY={radiusY * 1.1}
          shadowBlur={18}
          shadowColor={sourceGlowColor}
          shadowOpacity={0.28}
          x={radiusCenterTop.x}
          y={radiusCenterTop.y}
        />
      ) : null}

      {usesProjectedSchematicOptic ? (
        instance.type === 'lens' ? (
          <>
            <Ellipse
              fill={applyAlpha(bodyFill, realisticSymbolStyle === 'schematic' ? 0.3 : 0.46)}
              listening={false}
              radiusX={clamp(radiusX * (realisticSymbolStyle === 'schematic' ? 0.18 : 0.24), 2.4, 7.6)}
              radiusY={clamp(radiusY * (realisticSymbolStyle === 'schematic' ? 0.82 : 0.92), 5, 16)}
              stroke={stroke}
              strokeWidth={realisticSymbolStyle === 'schematic' ? 0.86 : 1.05}
              x={radiusCenterTop.x}
              y={radiusCenterTop.y}
            />
            {realisticSymbolStyle !== 'schematic' ? (
              <Ellipse
                fill="rgba(255, 255, 255, 0.2)"
                listening={false}
                radiusX={clamp(radiusX * 0.08, 1, 2.6)}
                radiusY={clamp(radiusY * 0.62, 4, 12)}
                x={radiusCenterTop.x - radiusX * 0.08}
                y={radiusCenterTop.y - radiusY * 0.05}
              />
            ) : null}
          </>
        ) : (() => {
            const insetX =
              bodyBoundsMm.width * (realisticSymbolStyle === 'schematic' ? 0.2 : 0.15)
            const insetY =
              bodyBoundsMm.height * (realisticSymbolStyle === 'schematic' ? 0.2 : 0.15)
            const mirrorStart = localPoint(
              {
                x: bodyBoundsMm.x + bodyBoundsMm.width - insetX,
                y: bodyBoundsMm.y + insetY,
              },
              extrusionMm + 0.4,
            )
            const mirrorEnd = localPoint(
              {
                x: bodyBoundsMm.x + insetX,
                y: bodyBoundsMm.y + bodyBoundsMm.height - insetY,
              },
              extrusionMm + 0.4,
            )
            const splitterStart = localPoint(
              {
                x: bodyBoundsMm.x + insetX,
                y: bodyBoundsMm.y + bodyBoundsMm.height - insetY,
              },
              extrusionMm + 0.4,
            )
            const splitterEnd = localPoint(
              {
                x: bodyBoundsMm.x + bodyBoundsMm.width - insetX,
                y: bodyBoundsMm.y + insetY,
              },
              extrusionMm + 0.4,
            )
            const start =
              instance.type === 'beamsplitter' ? splitterStart : mirrorStart
            const end = instance.type === 'beamsplitter' ? splitterEnd : mirrorEnd

            return (
              <>
                <Line
                  lineCap="round"
                  listening={false}
                  points={[start.x, start.y, end.x, end.y]}
                  stroke="rgba(12, 20, 26, 0.86)"
                  strokeWidth={realisticSymbolStyle === 'schematic' ? 2.4 : 3.8}
                />
                <Line
                  dash={instance.type === 'beamsplitter' ? [3, 3] : undefined}
                  lineCap="round"
                  listening={false}
                  points={[start.x, start.y, end.x, end.y]}
                  stroke={stroke}
                  strokeWidth={realisticSymbolStyle === 'schematic' ? 1.25 : 1.8}
                />
                {instance.type === 'beamsplitter' ? (
                  <Line
                    lineCap="round"
                    listening={false}
                    opacity={0.52}
                    points={[
                      start.x + (end.x - start.x) * 0.18,
                      start.y + (end.y - start.y) * 0.18,
                      start.x + (end.x - start.x) * 0.54,
                      start.y + (end.y - start.y) * 0.54,
                    ]}
                    stroke="rgba(255, 255, 255, 0.72)"
                    strokeWidth={1}
                  />
                ) : null}
              </>
            )
          })()
      ) : null}

      {profile === 'optic-disc' && !usesProjectedSchematicOptic ? (
        <>
          <Ellipse
            fill={shadeHex(bodyFill, -0.22)}
            listening={false}
            radiusX={radiusX}
            radiusY={radiusY}
            stroke={applyAlpha(stroke, 0.4)}
            strokeWidth={0.9}
            x={radiusCenterBase.x}
            y={radiusCenterBase.y}
          />
          <Ellipse
            fill={bodyFill}
            listening={false}
            radiusX={radiusX}
            radiusY={radiusY}
            stroke={stroke}
            strokeWidth={1.1}
            x={radiusCenterTop.x}
            y={radiusCenterTop.y}
          />
          <Line
            listening={false}
            points={[
              radiusCenterTop.x - radiusX * 0.75,
              radiusCenterTop.y,
              radiusCenterTop.x + radiusX * 0.75,
              radiusCenterTop.y,
            ]}
            stroke={applyAlpha('#f4fbff', 0.8)}
            strokeWidth={0.8}
          />
        </>
      ) : null}

      {profile === 'optic-ring' ? (
        <>
          {spec.realisticVisualPreset?.family === 'beam-control'
            ? (() => {
                const plateBoundsMm = {
                  x: bodyBoundsMm.x + bodyBoundsMm.width * 0.04,
                  y: bodyBoundsMm.y + bodyBoundsMm.height * 0.36,
                  width: bodyBoundsMm.width * 0.92,
                  height: Math.max(4.6, bodyBoundsMm.height * 0.28),
                }
                const plateExtrusionMm = Math.max(2.8, extrusionMm * 0.48)
                const plateTop = polygonAtElevation(
                  boundsPoints(plateBoundsMm),
                  localPoint,
                  plateExtrusionMm + 0.2,
                )
                const attenuatorOrientation =
                  instance.config.attenuator?.orientation ?? 'horizontal'
                const gradientStart =
                  instance.type === 'attenuator' && attenuatorOrientation === 'vertical'
                    ? localPoint(
                        {
                          x: plateBoundsMm.x + plateBoundsMm.width / 2,
                          y: plateBoundsMm.y,
                        },
                        plateExtrusionMm + 0.2,
                      )
                    : localPoint(
                        {
                          x: plateBoundsMm.x,
                          y: plateBoundsMm.y + plateBoundsMm.height / 2,
                        },
                        plateExtrusionMm + 0.2,
                      )
                const gradientEnd =
                  instance.type === 'attenuator' && attenuatorOrientation === 'vertical'
                    ? localPoint(
                        {
                          x: plateBoundsMm.x + plateBoundsMm.width / 2,
                          y: plateBoundsMm.y + plateBoundsMm.height,
                        },
                        plateExtrusionMm + 0.2,
                      )
                    : localPoint(
                        {
                          x: plateBoundsMm.x + plateBoundsMm.width,
                          y: plateBoundsMm.y + plateBoundsMm.height / 2,
                        },
                        plateExtrusionMm + 0.2,
                      )
                const gradientStops =
                  instance.type === 'attenuator'
                    ? [
                        0,
                        'rgba(46, 51, 58, 0.9)',
                        0.24,
                        'rgba(75, 77, 77, 0.72)',
                        0.52,
                        'rgba(134, 123, 102, 0.42)',
                        0.82,
                        'rgba(194, 198, 203, 0.2)',
                        1,
                        'rgba(236, 242, 246, 0.1)',
                      ]
                    : instance.type === 'polarizer'
                      ? [
                          0,
                          'rgba(40, 50, 38, 0.84)',
                          0.58,
                          'rgba(92, 110, 80, 0.38)',
                          1,
                          'rgba(182, 208, 156, 0.12)',
                        ]
                      : [
                          0,
                          'rgba(244, 247, 255, 0.12)',
                          0.22,
                          'rgba(173, 191, 255, 0.24)',
                          0.5,
                          'rgba(208, 191, 255, 0.22)',
                          0.78,
                          'rgba(155, 205, 234, 0.18)',
                          1,
                          'rgba(244, 247, 255, 0.1)',
                        ]
                const highlightBoundsMm = {
                  x:
                    instance.type === 'attenuator' && attenuatorOrientation === 'vertical'
                      ? plateBoundsMm.x + plateBoundsMm.width * 0.56
                      : plateBoundsMm.x + plateBoundsMm.width * 0.68,
                  y:
                    instance.type === 'attenuator' && attenuatorOrientation === 'vertical'
                      ? plateBoundsMm.y + plateBoundsMm.height * 0.12
                      : plateBoundsMm.y + plateBoundsMm.height * 0.1,
                  width: plateBoundsMm.width * 0.16,
                  height: plateBoundsMm.height * 0.58,
                }
                const highlightTop = polygonAtElevation(
                  boundsPoints(highlightBoundsMm),
                  localPoint,
                  plateExtrusionMm + 0.32,
                )
                const clampWidthMm = Math.max(1.2, plateBoundsMm.width * 0.05)
                const clampHeightMm = plateBoundsMm.height * 0.8
                const leftClampMm = {
                  x: plateBoundsMm.x - clampWidthMm * 0.55,
                  y: plateBoundsMm.y + plateBoundsMm.height * 0.1,
                  width: clampWidthMm,
                  height: clampHeightMm,
                }
                const rightClampMm = {
                  x: plateBoundsMm.x + plateBoundsMm.width - clampWidthMm * 0.45,
                  y: plateBoundsMm.y + plateBoundsMm.height * 0.1,
                  width: clampWidthMm,
                  height: clampHeightMm,
                }
                const labelChipMm = {
                  x:
                    instance.type === 'waveplate'
                      ? plateBoundsMm.x + plateBoundsMm.width * 0.78
                      : plateBoundsMm.x + plateBoundsMm.width * 0.08,
                  y: plateBoundsMm.y - plateBoundsMm.height * 0.18,
                  width: plateBoundsMm.width * 0.12,
                  height: plateBoundsMm.height * 0.28,
                }
                const labelChipTop = polygonAtElevation(
                  boundsPoints(labelChipMm),
                  localPoint,
                  plateExtrusionMm + 0.36,
                )
                const controlTabMm = {
                  x: plateBoundsMm.x + plateBoundsMm.width + clampWidthMm * 0.4,
                  y: plateBoundsMm.y + plateBoundsMm.height * 0.34,
                  width: plateBoundsMm.width * 0.08,
                  height: plateBoundsMm.height * 0.32,
                }

                return (
                  <>
                    {renderExtrudedProfile({
                      boundsMm: plateBoundsMm,
                      extrusionMm: plateExtrusionMm,
                      fill: shadeHex(spec.realisticVisualPreset?.glassTint ?? bodyFill, -0.06),
                      localPoint,
                      profile: 'optic-plate',
                      stroke,
                    })}
                    <Line
                      closed
                      fill="rgba(255, 255, 255, 0.04)"
                      fillLinearGradientColorStops={gradientStops}
                      fillLinearGradientEndPoint={gradientEnd}
                      fillLinearGradientStartPoint={gradientStart}
                      listening={false}
                      points={toKonvaPoints(plateTop)}
                      stroke={applyAlpha(stroke, 0.78)}
                      strokeWidth={0.9}
                    />
                    <Line
                      closed
                      fill="rgba(246, 250, 252, 0.12)"
                      listening={false}
                      points={toKonvaPoints(highlightTop)}
                      strokeEnabled={false}
                    />
                    {renderExtrudedProfile({
                      boundsMm: leftClampMm,
                      extrusionMm: plateExtrusionMm * 0.74,
                      fill: shadeHex('#4a5259', -0.08),
                      localPoint,
                      profile: 'optic-plate',
                      stroke: applyAlpha('#d7e1e8', 0.18),
                    })}
                    {renderExtrudedProfile({
                      boundsMm: rightClampMm,
                      extrusionMm: plateExtrusionMm * 0.74,
                      fill: shadeHex('#4a5259', -0.08),
                      localPoint,
                      profile: 'optic-plate',
                      stroke: applyAlpha('#d7e1e8', 0.18),
                    })}
                    {instance.type === 'attenuator'
                      ? renderExtrudedProfile({
                          boundsMm: controlTabMm,
                          extrusionMm: plateExtrusionMm * 0.5,
                          fill: '#d9c89f',
                          localPoint,
                          profile: 'optic-plate',
                          stroke: applyAlpha('#221d14', 0.35),
                        })
                      : null}
                    {instance.type === 'polarizer' || instance.type === 'waveplate' ? (
                      <Line
                        closed
                        fill={applyAlpha(
                          instance.type === 'polarizer'
                            ? spec.realisticVisualPreset?.accentFill ?? '#92ab7b'
                            : spec.realisticVisualPreset?.accentFill ?? '#c4b6ff',
                          0.58,
                        )}
                        listening={false}
                        points={toKonvaPoints(labelChipTop)}
                        strokeEnabled={false}
                      />
                    ) : null}
                  </>
                )
              })()
            : (
                <>
                  <Ellipse
                    fill={shadeHex(bodyFill, -0.18)}
                    listening={false}
                    radiusX={radiusX}
                    radiusY={radiusY}
                    stroke={applyAlpha(stroke, 0.35)}
                    strokeWidth={0.8}
                    x={radiusCenterBase.x}
                    y={radiusCenterBase.y}
                  />
                  <Ellipse
                    fill={bodyFill}
                    listening={false}
                    radiusX={radiusX}
                    radiusY={radiusY}
                    stroke={stroke}
                    strokeWidth={1.05}
                    x={radiusCenterTop.x}
                    y={radiusCenterTop.y}
                  />
                  <Ellipse
                    fill={applyAlpha('#0f161b', 0.92)}
                    listening={false}
                    radiusX={radiusX * 0.4}
                    radiusY={radiusY * 0.4}
                    stroke={applyAlpha('#f3f8fb', 0.62)}
                    strokeWidth={0.8}
                    x={radiusCenterTop.x}
                    y={radiusCenterTop.y}
                  />
                </>
              )}
        </>
      ) : null}

      {profile === 'detector-head' ? (
        <>
          {renderExtrudedProfile({
            boundsMm: bodyBoundsMm,
            extrusionMm,
            fill: bodyFill,
            localPoint,
            profile: 'body-rounded-rect',
            stroke,
          })}
          <Ellipse
            fill={applyAlpha('#111920', 0.94)}
            listening={false}
            radiusX={radiusX * 0.26}
            radiusY={radiusY * 0.24}
            stroke={applyAlpha('#f4fbff', 0.8)}
            strokeWidth={0.8}
            x={radiusCenterTop.x + radiusX * 0.18}
            y={radiusCenterTop.y}
          />
        </>
      ) : null}

      {profile !== 'optic-disc' &&
      profile !== 'optic-ring' &&
      profile !== 'detector-head'
        ? renderExtrudedProfile({
            boundsMm: bodyBoundsMm,
            extrusionMm,
            fill: bodyFill,
            localPoint,
            profile:
              profile === 'body-capsule' ||
              profile === 'body-rounded-rect' ||
              profile === 'stage-deck' ||
              profile === 'optic-plate' ||
              profile === 'crystal-diamond' ||
              profile === 'beam-dump'
                ? profile
                : 'body-rect',
            stroke,
          })
        : null}

      {spec.opticalCenterMm && showOverlay ? (
        <>
          {(() => {
            const opticalCenter = localPoint(spec.opticalCenterMm, extrusionMm * 0.8)

            return (
              <>
                <Line
                  listening={false}
                  points={[
                    opticalCenter.x - 4,
                    opticalCenter.y,
                    opticalCenter.x + 4,
                    opticalCenter.y,
                  ]}
                  stroke={isPreview ? accentStroke : '#ffffff'}
                  strokeWidth={0.7}
                />
                <Line
                  listening={false}
                  points={[
                    opticalCenter.x,
                    opticalCenter.y - 4,
                    opticalCenter.x,
                    opticalCenter.y + 4,
                  ]}
                  stroke={isPreview ? accentStroke : '#ffffff'}
                  strokeWidth={0.7}
                />
              </>
            )
          })()}
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
            const portPoint = localPoint(port.positionMm, extrusionMm * 0.8)
            const labelOffsetX = port.positionMm.x >= 0 ? 10 : -22
            const labelOffsetY = port.positionMm.y >= 0 ? 4 : -14

            return (
              <Group key={port.id}>
                <Circle
                  fill={fill}
                  radius={2.1}
                  stroke="#11161b"
                  strokeWidth={0.55}
                  x={portPoint.x}
                  y={portPoint.y}
                />
                <Text
                  fill={fill}
                  fontFamily="IBM Plex Sans, sans-serif"
                  fontSize={8.5}
                  fontStyle="bold"
                  listening={false}
                  text={isInput ? 'in' : isOutput ? 'out' : 'I/O'}
                  x={portPoint.x + labelOffsetX}
                  y={portPoint.y + labelOffsetY}
                />
              </Group>
            )
          })
        : null}

      {showOverlay ? (
        <Circle
          fill={isPreview ? accentStroke : '#0c1014'}
          listening={false}
          radius={2.1}
          stroke={accentStroke}
          strokeWidth={0.8}
          x={0}
          y={0}
        />
      ) : null}

      {isSelected && !isPreview && onResize ? (
        <>
          <Group
            x={supportAabb.maxX + 16}
            y={supportAabb.minY + 10}
            onMouseDown={(event) => {
              event.cancelBubble = true
              startUniformResize(1)
            }}
            onTouchStart={(event) => {
              event.cancelBubble = true
              startUniformResize(1)
            }}
            onMouseUp={(event) => {
              event.cancelBubble = true
              stopUniformResize()
            }}
            onTouchEnd={(event) => {
              event.cancelBubble = true
              stopUniformResize()
            }}
            onMouseEnter={(event) => {
              event.target.getStage()?.container().style.setProperty('cursor', 'pointer')
            }}
            onMouseLeave={(event) => {
              event.target.getStage()?.container().style.setProperty('cursor', 'default')
              stopUniformResize()
            }}
          >
            <Rect
              cornerRadius={6}
              fill="#4ba3bd"
              height={20}
              offsetX={10}
              offsetY={10}
              stroke="#10222a"
              strokeWidth={0.7}
              width={20}
            />
            <Text
              fill="#f1fbff"
              fontSize={14}
              listening={false}
              text="+"
              x={-4}
              y={-8}
            />
          </Group>
          <Group
            x={supportAabb.maxX + 16}
            y={supportAabb.minY + 36}
            onMouseDown={(event) => {
              event.cancelBubble = true
              startUniformResize(-1)
            }}
            onTouchStart={(event) => {
              event.cancelBubble = true
              startUniformResize(-1)
            }}
            onMouseUp={(event) => {
              event.cancelBubble = true
              stopUniformResize()
            }}
            onTouchEnd={(event) => {
              event.cancelBubble = true
              stopUniformResize()
            }}
            onMouseEnter={(event) => {
              event.target.getStage()?.container().style.setProperty('cursor', 'pointer')
            }}
            onMouseLeave={(event) => {
              event.target.getStage()?.container().style.setProperty('cursor', 'default')
              stopUniformResize()
            }}
          >
            <Rect
              cornerRadius={6}
              fill="#4ba3bd"
              height={20}
              offsetX={10}
              offsetY={10}
              stroke="#10222a"
              strokeWidth={0.7}
              width={20}
            />
            <Text
              fill="#f1fbff"
              fontSize={14}
              listening={false}
              text="-"
              x={-3.5}
              y={-8}
            />
          </Group>
        </>
      ) : null}

      {labelVisible && !isPreview ? (
        <Text
          align="center"
          fill={
            isSelected
              ? 'rgba(244, 251, 255, 0.92)'
              : isHighlighted
                ? 'rgba(255, 242, 198, 0.88)'
                : 'rgba(230, 237, 242, 0.76)'
          }
          fontFamily="IBM Plex Sans, Avenir Next, Segoe UI, sans-serif"
          fontSize={isSelected || isHighlighted ? 11 : 10}
          fontStyle={isSelected || isHighlighted ? 'bold' : 'normal'}
          listening={false}
          text={instance.label}
          width={160}
          x={labelPoint.x - 80}
          y={labelPoint.y + 10}
        />
      ) : null}
    </Group>
  )
})

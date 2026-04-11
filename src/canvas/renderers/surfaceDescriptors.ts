import {
  LIVE_SURFACE_DETAIL_MIN_ZOOM_PX_PER_MM,
  rotatePointQuarterTurns,
  roundMm,
  screenToWorld,
} from '../../domain/geometry'
import type {
  BreadboardModel,
  CounterborePattern,
  HoleDensity,
  OpticalTableModel,
  QuarterTurn,
  Vector2Mm,
  ViewportState,
} from '../../domain/types'

export interface LiveSurfacePalette {
  boardFill: string
  boardGradientStops?: Array<[number, string]>
  boardStroke: string
  holeFill: string
  labelColor: string
}

export interface LiveSurfaceDescriptor {
  anchorMm: Vector2Mm
  counterborePattern: CounterborePattern
  finish: string
  holeDensity: HoleDensity
  holeSpacingMm: number
  id: string
  kind: 'breadboard' | 'optical-table'
  label: string
  palette: LiveSurfacePalette
  rotationQuarterTurns: QuarterTurn
  widthMm: number
  heightMm: number
  edgeMarginMm: number
}

export type LiveSurfaceRenderTier = 'dense' | 'medium' | 'sparse'

function getSurfaceEffectiveHolePitchMm(surface: {
  holeDensity: HoleDensity
  holeSpacingMm: number
}) {
  return surface.holeDensity === 'double'
    ? surface.holeSpacingMm / 2
    : surface.holeSpacingMm
}

function getSurfaceHoleAxisPositionsMm(
  lengthMm: number,
  edgeMarginMm: number,
  pitchMm: number,
) {
  if (pitchMm <= 0) {
    return []
  }

  const usableSpanMm = lengthMm - edgeMarginMm * 2

  if (usableSpanMm < 0) {
    return []
  }

  const holeCount = Math.floor(usableSpanMm / pitchMm + 1e-6) + 1

  return Array.from({ length: holeCount }, (_, index) =>
    roundMm(edgeMarginMm + index * pitchMm),
  )
}

export function getSurfaceHoleAxesMm(surface: {
  edgeMarginMm: number
  heightMm: number
  holeDensity: HoleDensity
  holeSpacingMm: number
  widthMm: number
}) {
  const pitchMm = getSurfaceEffectiveHolePitchMm(surface)

  return {
    xPositionsMm: getSurfaceHoleAxisPositionsMm(
      surface.widthMm,
      surface.edgeMarginMm,
      pitchMm,
    ),
    yPositionsMm: getSurfaceHoleAxisPositionsMm(
      surface.heightMm,
      surface.edgeMarginMm,
      pitchMm,
    ),
  }
}

export function getLiveSurfaceRenderTier(zoomPxPerMm: number): LiveSurfaceRenderTier {
  if (zoomPxPerMm >= LIVE_SURFACE_DETAIL_MIN_ZOOM_PX_PER_MM) {
    return 'dense'
  }

  if (zoomPxPerMm >= 0.4) {
    return 'medium'
  }

  return 'sparse'
}

export function createLiveBreadboardSurfaceDescriptor(args: {
  anchorMm?: Vector2Mm
  breadboard: BreadboardModel
  id: string
  label?: string
  rotationQuarterTurns?: QuarterTurn
  palette?: Partial<LiveSurfacePalette>
}): LiveSurfaceDescriptor {
  const { breadboard } = args

  return {
    anchorMm: args.anchorMm ?? { x: 0, y: 0 },
    counterborePattern: breadboard.counterborePattern,
    edgeMarginMm: breadboard.edgeMarginMm,
    finish: breadboard.finish,
    holeDensity: breadboard.holeDensity,
    holeSpacingMm: breadboard.holeSpacingMm,
    id: args.id,
    kind: 'breadboard',
    label: args.label ?? breadboard.label,
    palette: {
      boardFill:
        args.palette?.boardFill ??
        (breadboard.finish === 'black-anodized' ? '#171d22' : '#c9d1d8'),
      boardGradientStops:
        args.palette?.boardGradientStops ??
        (breadboard.finish === 'black-anodized'
          ? undefined
          : [
              [0, '#b8c2ca'],
              [0.4, '#d0d8de'],
              [0.7, '#c4cdd4'],
              [1, '#bbc5cc'],
            ]),
      boardStroke:
        args.palette?.boardStroke ??
        (breadboard.finish === 'black-anodized' ? '#5a6974' : '#7e8b95'),
      holeFill:
        args.palette?.holeFill ??
        (breadboard.finish === 'black-anodized' ? '#0c1014' : '#64717a'),
      labelColor:
        args.palette?.labelColor ??
        (breadboard.finish === 'black-anodized' ? '#d5e2ec' : '#16202a'),
    },
    rotationQuarterTurns: args.rotationQuarterTurns ?? 0,
    widthMm: breadboard.widthMm,
    heightMm: breadboard.heightMm,
  }
}

export function createLiveOpticalTableSurfaceDescriptor(
  table: OpticalTableModel,
): LiveSurfaceDescriptor {
  return {
    anchorMm: { x: 0, y: 0 },
    counterborePattern: table.counterborePattern,
    edgeMarginMm: table.edgeMarginMm,
    finish: table.finish,
    holeDensity: table.holeDensity,
    holeSpacingMm: table.holeSpacingMm,
    id: 'optical-table',
    kind: 'optical-table',
    label: table.label,
    palette: {
      boardFill: '#a8b0b6',
      boardStroke: '#d4dae0',
      holeFill: '#6f777f',
      labelColor: '#16202a',
    },
    rotationQuarterTurns: 0,
    widthMm: table.widthMm,
    heightMm: table.heightMm,
  }
}

export function getLiveSurfaceLabel(surface: LiveSurfaceDescriptor) {
  const holeAxes = getSurfaceHoleAxesMm(surface)
  const effectivePitchMm = getSurfaceEffectiveHolePitchMm(surface)

  return `${surface.label}  •  ${surface.widthMm.toFixed(0)} × ${surface.heightMm.toFixed(
    0,
  )} mm  •  ${holeAxes.xPositionsMm.length} × ${holeAxes.yPositionsMm.length} holes  •  ${effectivePitchMm.toFixed(
    1,
  )} mm pitch`
}

export function getSurfaceWorldBoundsMm(surface: LiveSurfaceDescriptor) {
  const corners = [
    surfaceLocalToWorld(surface, { x: 0, y: 0 }),
    surfaceLocalToWorld(surface, { x: surface.widthMm, y: 0 }),
    surfaceLocalToWorld(surface, { x: 0, y: surface.heightMm }),
    surfaceLocalToWorld(surface, { x: surface.widthMm, y: surface.heightMm }),
  ]

  const xValues = corners.map((point) => point.x)
  const yValues = corners.map((point) => point.y)

  return {
    x: Math.min(...xValues),
    y: Math.min(...yValues),
    width: Math.max(...xValues) - Math.min(...xValues),
    height: Math.max(...yValues) - Math.min(...yValues),
  }
}

export function surfaceLocalToWorld(
  surface: LiveSurfaceDescriptor,
  pointMm: Vector2Mm,
): Vector2Mm {
  const rotatedPointMm = rotatePointQuarterTurns(pointMm, surface.rotationQuarterTurns)

  return {
    x: roundMm(surface.anchorMm.x + rotatedPointMm.x),
    y: roundMm(surface.anchorMm.y + rotatedPointMm.y),
  }
}

export function surfaceWorldToLocal(
  surface: LiveSurfaceDescriptor,
  pointMm: Vector2Mm,
): Vector2Mm {
  const translatedPointMm = {
    x: roundMm(pointMm.x - surface.anchorMm.x),
    y: roundMm(pointMm.y - surface.anchorMm.y),
  }

  return rotatePointQuarterTurns(
    translatedPointMm,
    ((4 - surface.rotationQuarterTurns) % 4) as QuarterTurn,
  )
}

export function getVisibleSurfaceLocalBoundsMm(
  surface: LiveSurfaceDescriptor,
  viewport: ViewportState,
  overscanMm = 18,
) {
  const corners = [
    screenToWorld({ x: 0, y: 0 }, viewport),
    screenToWorld({ x: viewport.canvasSizePx.width, y: 0 }, viewport),
    screenToWorld({ x: 0, y: viewport.canvasSizePx.height }, viewport),
    screenToWorld(
      { x: viewport.canvasSizePx.width, y: viewport.canvasSizePx.height },
      viewport,
    ),
  ]

  const localCorners = corners.map((corner) => surfaceWorldToLocal(surface, corner))
  const xValues = localCorners.map((corner) => corner.x)
  const yValues = localCorners.map((corner) => corner.y)

  return {
    x: Math.max(-overscanMm, Math.min(...xValues) - overscanMm),
    y: Math.max(-overscanMm, Math.min(...yValues) - overscanMm),
    width:
      Math.max(
        0,
        Math.min(surface.widthMm + overscanMm, Math.max(...xValues) + overscanMm) -
          Math.max(-overscanMm, Math.min(...xValues) - overscanMm),
      ),
    height:
      Math.max(
        0,
        Math.min(surface.heightMm + overscanMm, Math.max(...yValues) + overscanMm) -
          Math.max(-overscanMm, Math.min(...yValues) - overscanMm),
      ),
  }
}

export function getLiveSurfaceCacheKey(
  surface: LiveSurfaceDescriptor,
  tier: LiveSurfaceRenderTier,
  flags: {
    isFocused?: boolean
    isHighlighted?: boolean
    isSelected?: boolean
    showLabels?: boolean
  } = {},
) {
  return [
    surface.id,
    surface.kind,
    surface.finish,
    surface.widthMm,
    surface.heightMm,
    surface.holeSpacingMm,
    surface.edgeMarginMm,
    surface.holeDensity,
    surface.counterborePattern,
    tier,
    flags.isFocused ? 'f1' : 'f0',
    flags.isHighlighted ? 'h1' : 'h0',
    flags.isSelected ? 's1' : 's0',
    flags.showLabels ? 'l1' : 'l0',
  ].join('|')
}

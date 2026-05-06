import {
  getEffectiveSupportBoundsMm,
  getResolvedComponentSpecForInstance,
} from '../domain/componentCatalog'
import {
  rotateBoundsQuarterTurns,
  worldToScreen,
} from '../domain/geometry'
import type {
  BeamTraceResult,
  BoundsMm,
  ComponentInstance,
  RenderMode,
  ScreenPointPx,
  ViewportState,
} from '../domain/types'

export interface BoundsPx {
  height: number
  width: number
  x: number
  y: number
}

export type LabelPlacementSide =
  | 'above'
  | 'below'
  | 'left'
  | 'right'
  | 'above-left'
  | 'above-right'
  | 'below-left'
  | 'below-right'

export interface CanvasLabelPlacement {
  anchorPx: ScreenPointPx
  bounds: BoundsPx
  fontSizePx: number
  id: string
  leaderEndPx: ScreenPointPx
  leaderStartPx: ScreenPointPx
  lineHeightPx: number
  lines: string[]
  side: LabelPlacementSide
  text: string
}

export interface FloatingLabelRequest {
  anchorPx: ScreenPointPx
  fontSizePx: number
  id: string
  lineHeightPx?: number
  lines: string[]
  maxWidthPx?: number
  minWidthPx?: number
}

interface LabelCandidate {
  bounds: BoundsPx
  leaderEndPx: ScreenPointPx
  side: LabelPlacementSide
}

interface ComponentLabelStyle {
  fontSizePx: number
  fontStyle: 'bold' | 'normal'
  lineHeightPx: number
}

const LABEL_VIEWPORT_PADDING_PX = 8
const LABEL_COLLISION_PADDING_PX = 5

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function normalizeBoundsPx(bounds: BoundsPx): BoundsPx {
  const x = Math.min(bounds.x, bounds.x + bounds.width)
  const y = Math.min(bounds.y, bounds.y + bounds.height)

  return {
    height: Math.abs(bounds.height),
    width: Math.abs(bounds.width),
    x,
    y,
  }
}

export function expandBoundsPx(bounds: BoundsPx, paddingPx: number): BoundsPx {
  return {
    height: bounds.height + paddingPx * 2,
    width: bounds.width + paddingPx * 2,
    x: bounds.x - paddingPx,
    y: bounds.y - paddingPx,
  }
}

export function boundsIntersectPx(
  firstBounds: BoundsPx,
  secondBounds: BoundsPx,
  paddingPx = 0,
) {
  const first = expandBoundsPx(firstBounds, paddingPx)
  const second = expandBoundsPx(secondBounds, paddingPx)

  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  )
}

function getIntersectionAreaPx(firstBounds: BoundsPx, secondBounds: BoundsPx) {
  const xOverlap = Math.max(
    0,
    Math.min(firstBounds.x + firstBounds.width, secondBounds.x + secondBounds.width) -
      Math.max(firstBounds.x, secondBounds.x),
  )
  const yOverlap = Math.max(
    0,
    Math.min(firstBounds.y + firstBounds.height, secondBounds.y + secondBounds.height) -
      Math.max(firstBounds.y, secondBounds.y),
  )

  return xOverlap * yOverlap
}

function estimateTextWidthPx(text: string, fontSizePx: number) {
  return text.length * fontSizePx * 0.58
}

function wrapSingleLineText(
  text: string,
  maxWidthPx: number,
  fontSizePx: number,
) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word

    if (
      currentLine &&
      estimateTextWidthPx(nextLine, fontSizePx) > maxWidthPx
    ) {
      lines.push(currentLine)
      currentLine = word
      continue
    }

    currentLine = nextLine
  }

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines.length ? lines : [text]
}

function wrapLabelLines(
  textLines: string[],
  maxWidthPx: number,
  fontSizePx: number,
) {
  return textLines.flatMap((line) =>
    wrapSingleLineText(line, maxWidthPx, fontSizePx),
  )
}

function getViewportBoundsPx(viewport: ViewportState): BoundsPx {
  return {
    height: viewport.canvasSizePx.height,
    width: viewport.canvasSizePx.width,
    x: 0,
    y: 0,
  }
}

function clampBoundsToViewport(
  bounds: BoundsPx,
  viewport: ViewportState,
): BoundsPx {
  const viewportBounds = getViewportBoundsPx(viewport)

  return {
    ...bounds,
    x: clamp(
      bounds.x,
      LABEL_VIEWPORT_PADDING_PX,
      Math.max(
        LABEL_VIEWPORT_PADDING_PX,
        viewportBounds.width - bounds.width - LABEL_VIEWPORT_PADDING_PX,
      ),
    ),
    y: clamp(
      bounds.y,
      LABEL_VIEWPORT_PADDING_PX,
      Math.max(
        LABEL_VIEWPORT_PADDING_PX,
        viewportBounds.height - bounds.height - LABEL_VIEWPORT_PADDING_PX,
      ),
    ),
  }
}

function getLabelScore(
  candidateBounds: BoundsPx,
  occupiedBounds: BoundsPx[],
  preferredIndex: number,
  anchorPx: ScreenPointPx,
) {
  const collisionPenalty = occupiedBounds.reduce((score, occupied) => {
    if (!boundsIntersectPx(candidateBounds, occupied, LABEL_COLLISION_PADDING_PX)) {
      return score
    }

    return (
      score +
      10_000 +
      getIntersectionAreaPx(
        expandBoundsPx(candidateBounds, LABEL_COLLISION_PADDING_PX),
        expandBoundsPx(occupied, LABEL_COLLISION_PADDING_PX),
      )
    )
  }, 0)
  const centerX = candidateBounds.x + candidateBounds.width / 2
  const centerY = candidateBounds.y + candidateBounds.height / 2
  const distanceFromAnchor = Math.hypot(centerX - anchorPx.x, centerY - anchorPx.y)

  return collisionPenalty + preferredIndex * 20 + distanceFromAnchor * 0.08
}

function chooseCandidate(
  candidates: LabelCandidate[],
  occupiedBounds: BoundsPx[],
  viewport: ViewportState,
  anchorPx: ScreenPointPx,
) {
  let bestCandidate = candidates[0]
  let bestScore = Number.POSITIVE_INFINITY

  candidates.forEach((candidate, index) => {
    const clampedCandidate = {
      ...candidate,
      bounds: clampBoundsToViewport(candidate.bounds, viewport),
    }
    const score = getLabelScore(
      clampedCandidate.bounds,
      occupiedBounds,
      index,
      anchorPx,
    )

    if (score < bestScore) {
      bestScore = score
      bestCandidate = clampedCandidate
    }
  })

  return bestCandidate
}

function getBoundsCenterPx(bounds: BoundsPx): ScreenPointPx {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  }
}

function worldBoundsToScreenBounds(
  boundsMm: BoundsMm,
  viewport: ViewportState,
): BoundsPx {
  const topLeftPx = worldToScreen({ x: boundsMm.x, y: boundsMm.y }, viewport)
  const bottomRightPx = worldToScreen(
    {
      x: boundsMm.x + boundsMm.width,
      y: boundsMm.y + boundsMm.height,
    },
    viewport,
  )

  return normalizeBoundsPx({
    height: bottomRightPx.y - topLeftPx.y,
    width: bottomRightPx.x - topLeftPx.x,
    x: topLeftPx.x,
    y: topLeftPx.y,
  })
}

function localBoundsToWorldBounds(
  component: ComponentInstance,
  localBoundsMm: BoundsMm,
): BoundsMm {
  const rotatedBounds = rotateBoundsQuarterTurns(
    localBoundsMm,
    component.rotationQuarterTurns,
  )

  return {
    height: rotatedBounds.height,
    width: rotatedBounds.width,
    x: component.anchorMm.x + rotatedBounds.x,
    y: component.anchorMm.y + rotatedBounds.y,
  }
}

function getComponentLabelStyle(args: {
  isHighlighted?: boolean
  isSelected?: boolean
  renderMode: RenderMode
  viewport: ViewportState
}): ComponentLabelStyle {
  const fontSizeMm =
    args.isSelected || args.isHighlighted
      ? 6.05
      : args.renderMode === 'simple'
        ? 5.8
        : 5.35
  const fontSizePx = fontSizeMm * args.viewport.zoomPxPerMm

  return {
    fontSizePx,
    fontStyle:
      args.renderMode === 'simple' || args.isSelected || args.isHighlighted
        ? 'bold'
        : 'normal',
    lineHeightPx: fontSizePx * 1.05,
  }
}

export function getComponentSupportScreenBounds(
  component: ComponentInstance,
  viewport: ViewportState,
) {
  const spec = getResolvedComponentSpecForInstance(component)
  const supportBoundsMm = getEffectiveSupportBoundsMm(component, spec)
  const worldBoundsMm = localBoundsToWorldBounds(component, supportBoundsMm)

  return worldBoundsToScreenBounds(worldBoundsMm, viewport)
}

export function getBeamSegmentScreenObstacles(
  beamTrace: BeamTraceResult,
  viewport: ViewportState,
) {
  return beamTrace.segments.map((segment) => {
    const startPx = worldToScreen(segment.startMm, viewport)
    const endPx = worldToScreen(segment.endMm, viewport)
    const x = Math.min(startPx.x, endPx.x)
    const y = Math.min(startPx.y, endPx.y)
    const width = Math.max(1, Math.abs(endPx.x - startPx.x))
    const height = Math.max(1, Math.abs(endPx.y - startPx.y))

    return expandBoundsPx({ height, width, x, y }, 12)
  })
}

function getComponentLabelCandidates(args: {
  anchorPx: ScreenPointPx
  bounds: BoundsPx
  height: number
  width: number
}): LabelCandidate[] {
  const offsetPx = 8
  const farOffsetPx = 24
  const centerX = args.bounds.x + args.bounds.width / 2
  const centerY = args.bounds.y + args.bounds.height / 2
  const rightX = args.bounds.x + args.bounds.width + offsetPx
  const leftX = args.bounds.x - args.width - offsetPx
  const belowY = args.bounds.y + args.bounds.height + offsetPx
  const farBelowY = args.bounds.y + args.bounds.height + farOffsetPx
  const aboveY = args.bounds.y - args.height - offsetPx
  const farAboveY = args.bounds.y - args.height - farOffsetPx

  return [
    {
      bounds: {
        height: args.height,
        width: args.width,
        x: centerX - args.width / 2,
        y: belowY,
      },
      leaderEndPx: { x: centerX, y: belowY },
      side: 'below',
    },
    {
      bounds: {
        height: args.height,
        width: args.width,
        x: centerX - args.width / 2,
        y: farBelowY,
      },
      leaderEndPx: { x: centerX, y: farBelowY },
      side: 'below',
    },
    {
      bounds: {
        height: args.height,
        width: args.width,
        x: centerX - args.width / 2,
        y: aboveY,
      },
      leaderEndPx: { x: centerX, y: aboveY + args.height },
      side: 'above',
    },
    {
      bounds: {
        height: args.height,
        width: args.width,
        x: centerX - args.width / 2,
        y: farAboveY,
      },
      leaderEndPx: { x: centerX, y: farAboveY + args.height },
      side: 'above',
    },
    {
      bounds: {
        height: args.height,
        width: args.width,
        x: rightX,
        y: centerY - args.height / 2,
      },
      leaderEndPx: { x: rightX, y: centerY },
      side: 'right',
    },
    {
      bounds: {
        height: args.height,
        width: args.width,
        x: leftX,
        y: centerY - args.height / 2,
      },
      leaderEndPx: { x: leftX + args.width, y: centerY },
      side: 'left',
    },
  ]
}

export function getComponentLabelPlacements(args: {
  additionalObstacles?: BoundsPx[]
  components: ComponentInstance[]
  highlightedComponentIds?: string[]
  renderMode: RenderMode
  selectedComponentId?: string
  viewport: ViewportState
}) {
  const highlightedIds = new Set(args.highlightedComponentIds ?? [])
  const occupiedBounds = [
    ...(args.additionalObstacles ?? []),
    ...args.components.map((component) =>
      expandBoundsPx(getComponentSupportScreenBounds(component, args.viewport), 4),
    ),
  ]

  return args.components.map((component) => {
    const supportBounds = getComponentSupportScreenBounds(component, args.viewport)
    const spec = getResolvedComponentSpecForInstance(component)
    const supportBoundsMm = getEffectiveSupportBoundsMm(component, spec)
    const mountBoundsMm = spec.mountVisualBoundsMm ?? spec.mount.supportBoundsMm
    const style = getComponentLabelStyle({
      isHighlighted: highlightedIds.has(component.id),
      isSelected: args.selectedComponentId === component.id,
      renderMode: args.renderMode,
      viewport: args.viewport,
    })
    const minimumWidthPx = Math.max(
      44,
      Math.max(supportBoundsMm.width, mountBoundsMm.width, 36) *
        args.viewport.zoomPxPerMm,
    )
    const naturalWidthPx = estimateTextWidthPx(component.label, style.fontSizePx)
    const widthPx = clamp(
      Math.max(minimumWidthPx, Math.min(naturalWidthPx, minimumWidthPx + 42)),
      52,
      150,
    )
    const lines = wrapLabelLines(
      [component.label],
      widthPx,
      style.fontSizePx,
    )
    const heightPx = Math.max(
      style.lineHeightPx,
      lines.length * style.lineHeightPx,
    )
    const anchorPx = getBoundsCenterPx(supportBounds)
    const candidate = chooseCandidate(
      getComponentLabelCandidates({
        anchorPx,
        bounds: supportBounds,
        height: heightPx,
        width: widthPx,
      }),
      occupiedBounds,
      args.viewport,
      anchorPx,
    )
    const placement: CanvasLabelPlacement = {
      anchorPx,
      bounds: candidate.bounds,
      fontSizePx: style.fontSizePx,
      id: component.id,
      leaderEndPx: candidate.leaderEndPx,
      leaderStartPx: anchorPx,
      lineHeightPx: style.lineHeightPx,
      lines,
      side: candidate.side,
      text: component.label,
    }

    occupiedBounds.push(expandBoundsPx(candidate.bounds, 4))

    return placement
  })
}

function getFloatingLabelCandidates(args: {
  anchorPx: ScreenPointPx
  height: number
  index: number
  width: number
}): LabelCandidate[] {
  const offsetPx = 12 + (args.index % 3) * 5
  const wideOffsetPx = offsetPx + 8
  const farOffsetPx = offsetPx + 26
  const verticalStepPx = (Math.floor(args.index / 3) % 3) * 7

  return [
    {
      bounds: {
        height: args.height,
        width: args.width,
        x: args.anchorPx.x + offsetPx,
        y: args.anchorPx.y - args.height - offsetPx - verticalStepPx,
      },
      leaderEndPx: {
        x: args.anchorPx.x + offsetPx,
        y: args.anchorPx.y - offsetPx,
      },
      side: 'above-right',
    },
    {
      bounds: {
        height: args.height,
        width: args.width,
        x: args.anchorPx.x + offsetPx,
        y: args.anchorPx.y - args.height - farOffsetPx - verticalStepPx,
      },
      leaderEndPx: {
        x: args.anchorPx.x + offsetPx,
        y: args.anchorPx.y - farOffsetPx,
      },
      side: 'above-right',
    },
    {
      bounds: {
        height: args.height,
        width: args.width,
        x: args.anchorPx.x + offsetPx,
        y: args.anchorPx.y + offsetPx + verticalStepPx,
      },
      leaderEndPx: {
        x: args.anchorPx.x + offsetPx,
        y: args.anchorPx.y + offsetPx,
      },
      side: 'below-right',
    },
    {
      bounds: {
        height: args.height,
        width: args.width,
        x: args.anchorPx.x + offsetPx,
        y: args.anchorPx.y + farOffsetPx + verticalStepPx,
      },
      leaderEndPx: {
        x: args.anchorPx.x + offsetPx,
        y: args.anchorPx.y + farOffsetPx,
      },
      side: 'below-right',
    },
    {
      bounds: {
        height: args.height,
        width: args.width,
        x: args.anchorPx.x - args.width - offsetPx,
        y: args.anchorPx.y - args.height - offsetPx - verticalStepPx,
      },
      leaderEndPx: {
        x: args.anchorPx.x - offsetPx,
        y: args.anchorPx.y - offsetPx,
      },
      side: 'above-left',
    },
    {
      bounds: {
        height: args.height,
        width: args.width,
        x: args.anchorPx.x - args.width - offsetPx,
        y: args.anchorPx.y - args.height - farOffsetPx - verticalStepPx,
      },
      leaderEndPx: {
        x: args.anchorPx.x - offsetPx,
        y: args.anchorPx.y - farOffsetPx,
      },
      side: 'above-left',
    },
    {
      bounds: {
        height: args.height,
        width: args.width,
        x: args.anchorPx.x - args.width - offsetPx,
        y: args.anchorPx.y + offsetPx + verticalStepPx,
      },
      leaderEndPx: {
        x: args.anchorPx.x - offsetPx,
        y: args.anchorPx.y + offsetPx,
      },
      side: 'below-left',
    },
    {
      bounds: {
        height: args.height,
        width: args.width,
        x: args.anchorPx.x - args.width - offsetPx,
        y: args.anchorPx.y + farOffsetPx + verticalStepPx,
      },
      leaderEndPx: {
        x: args.anchorPx.x - offsetPx,
        y: args.anchorPx.y + farOffsetPx,
      },
      side: 'below-left',
    },
    {
      bounds: {
        height: args.height,
        width: args.width,
        x: args.anchorPx.x - args.width / 2,
        y: args.anchorPx.y - args.height - wideOffsetPx - verticalStepPx,
      },
      leaderEndPx: {
        x: args.anchorPx.x,
        y: args.anchorPx.y - wideOffsetPx,
      },
      side: 'above',
    },
    {
      bounds: {
        height: args.height,
        width: args.width,
        x: args.anchorPx.x - args.width / 2,
        y: args.anchorPx.y + wideOffsetPx + verticalStepPx,
      },
      leaderEndPx: {
        x: args.anchorPx.x,
        y: args.anchorPx.y + wideOffsetPx,
      },
      side: 'below',
    },
  ]
}

export function layoutFloatingLabels(args: {
  labels: FloatingLabelRequest[]
  obstacles?: BoundsPx[]
  viewport: ViewportState
}) {
  const occupiedBounds = [...(args.obstacles ?? [])]

  return args.labels.map((label, index) => {
    const fontSizePx = label.fontSizePx
    const lineHeightPx = label.lineHeightPx ?? fontSizePx * 1.16
    const naturalWidthPx = Math.max(
      ...label.lines.map((line) => estimateTextWidthPx(line, fontSizePx)),
      label.minWidthPx ?? 0,
    )
    const widthPx = clamp(
      naturalWidthPx + 12,
      label.minWidthPx ?? 44,
      label.maxWidthPx ?? 150,
    )
    const wrappedLines = wrapLabelLines(label.lines, widthPx - 10, fontSizePx)
    const heightPx = wrappedLines.length * lineHeightPx + 8
    const candidate = chooseCandidate(
      getFloatingLabelCandidates({
        anchorPx: label.anchorPx,
        height: heightPx,
        index,
        width: widthPx,
      }),
      occupiedBounds,
      args.viewport,
      label.anchorPx,
    )
    const placement: CanvasLabelPlacement = {
      anchorPx: label.anchorPx,
      bounds: candidate.bounds,
      fontSizePx,
      id: label.id,
      leaderEndPx: candidate.leaderEndPx,
      leaderStartPx: label.anchorPx,
      lineHeightPx,
      lines: wrappedLines,
      side: candidate.side,
      text: label.lines.join(' '),
    }

    occupiedBounds.push(expandBoundsPx(candidate.bounds, 4))

    return placement
  })
}

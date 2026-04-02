import { getBreadboardHoleAxesMm, getEffectiveHolePitchMm, getNearestHole } from './breadboard'
import { getResolvedComponentSpec, isOpticalTarget } from './componentCatalog'
import { rotateBoundsQuarterTurns, roundMm } from './geometry'
import { getWorldPortsForComponent } from './ports'
import type {
  BoundsMm,
  BreadboardModel,
  ComponentInstance,
  PlacementPhase,
  PlacementResult,
  QuarterTurn,
  ResolvedComponentSpec,
  SnapMode,
  SourceLane,
  Vector2Mm,
} from './types'

export const DROP_SNAP_CAPTURE_RADIUS_MM = 5
export const SOURCE_LANE_OFFSET_MM = 60
export const SOURCE_LANE_HALF_WIDTH_MM = 16
export const SCENE_WORLD_PADDING_MM = 120

const HOLE_ALIGNMENT_EPSILON_MM = 0.05
const BOUNDS_INTERSECTION_EPSILON_MM = 0.01

function getDistanceMm(pointA: Vector2Mm, pointB: Vector2Mm) {
  return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y)
}

function translateBounds(boundsMm: BoundsMm, anchorMm: Vector2Mm): BoundsMm {
  return {
    x: roundMm(boundsMm.x + anchorMm.x),
    y: roundMm(boundsMm.y + anchorMm.y),
    width: boundsMm.width,
    height: boundsMm.height,
  }
}

function getBoardBoundsMm(breadboard: BreadboardModel): BoundsMm {
  return {
    x: 0,
    y: 0,
    width: breadboard.widthMm,
    height: breadboard.heightMm,
  }
}

export function getSceneWorldBoundsMm(breadboard: BreadboardModel): BoundsMm {
  return {
    x: -SCENE_WORLD_PADDING_MM,
    y: -SCENE_WORLD_PADDING_MM,
    width: breadboard.widthMm + SCENE_WORLD_PADDING_MM * 2,
    height: breadboard.heightMm + SCENE_WORLD_PADDING_MM * 2,
  }
}

export function getSourceLaneBoundsMm(
  breadboard: BreadboardModel,
  lane: SourceLane,
): BoundsMm {
  switch (lane) {
    case 'left':
      return {
        x: -SOURCE_LANE_OFFSET_MM - SOURCE_LANE_HALF_WIDTH_MM,
        y: 0,
        width: SOURCE_LANE_HALF_WIDTH_MM * 2,
        height: breadboard.heightMm,
      }
    case 'right':
      return {
        x: breadboard.widthMm + SOURCE_LANE_OFFSET_MM - SOURCE_LANE_HALF_WIDTH_MM,
        y: 0,
        width: SOURCE_LANE_HALF_WIDTH_MM * 2,
        height: breadboard.heightMm,
      }
    case 'top':
      return {
        x: 0,
        y: -SOURCE_LANE_OFFSET_MM - SOURCE_LANE_HALF_WIDTH_MM,
        width: breadboard.widthMm,
        height: SOURCE_LANE_HALF_WIDTH_MM * 2,
      }
    case 'bottom':
      return {
        x: 0,
        y: breadboard.heightMm + SOURCE_LANE_OFFSET_MM - SOURCE_LANE_HALF_WIDTH_MM,
        width: breadboard.widthMm,
        height: SOURCE_LANE_HALF_WIDTH_MM * 2,
      }
  }
}

function getNearestAxisValue(valueMm: number, axisValuesMm: number[]) {
  if (axisValuesMm.length === 0) {
    return roundMm(valueMm)
  }

  let nearestValue = axisValuesMm[0]
  let nearestDistance = Math.abs(axisValuesMm[0] - valueMm)

  for (const axisValue of axisValuesMm.slice(1)) {
    const distance = Math.abs(axisValue - valueMm)

    if (
      distance < nearestDistance ||
      (distance === nearestDistance && axisValue > nearestValue)
    ) {
      nearestValue = axisValue
      nearestDistance = distance
    }
  }

  return nearestValue
}

function getLaneAnchorMm(
  breadboard: BreadboardModel,
  lane: SourceLane,
  candidateAnchorMm: Vector2Mm,
) {
  const axes = getBreadboardHoleAxesMm(breadboard)

  switch (lane) {
    case 'left':
      return {
        x: roundMm(-SOURCE_LANE_OFFSET_MM),
        y: getNearestAxisValue(candidateAnchorMm.y, axes.yPositionsMm),
      }
    case 'right':
      return {
        x: roundMm(breadboard.widthMm + SOURCE_LANE_OFFSET_MM),
        y: getNearestAxisValue(candidateAnchorMm.y, axes.yPositionsMm),
      }
    case 'top':
      return {
        x: getNearestAxisValue(candidateAnchorMm.x, axes.xPositionsMm),
        y: roundMm(-SOURCE_LANE_OFFSET_MM),
      }
    case 'bottom':
      return {
        x: getNearestAxisValue(candidateAnchorMm.x, axes.xPositionsMm),
        y: roundMm(breadboard.heightMm + SOURCE_LANE_OFFSET_MM),
      }
  }
}

function isBoundsWithinBounds(boundsMm: BoundsMm, containerMm: BoundsMm) {
  return (
    boundsMm.x >= containerMm.x &&
    boundsMm.y >= containerMm.y &&
    boundsMm.x + boundsMm.width <= containerMm.x + containerMm.width &&
    boundsMm.y + boundsMm.height <= containerMm.y + containerMm.height
  )
}

function doBoundsIntersect(boundsA: BoundsMm, boundsB: BoundsMm) {
  return !(
    boundsA.x + boundsA.width <= boundsB.x + BOUNDS_INTERSECTION_EPSILON_MM ||
    boundsB.x + boundsB.width <= boundsA.x + BOUNDS_INTERSECTION_EPSILON_MM ||
    boundsA.y + boundsA.height <= boundsB.y + BOUNDS_INTERSECTION_EPSILON_MM ||
    boundsB.y + boundsB.height <= boundsA.y + BOUNDS_INTERSECTION_EPSILON_MM
  )
}

function getWorldBounds(
  localBoundsMm: BoundsMm,
  anchorMm: Vector2Mm,
  rotationQuarterTurns: QuarterTurn,
) {
  return translateBounds(
    rotateBoundsQuarterTurns(localBoundsMm, rotationQuarterTurns),
    anchorMm,
  )
}

function getSourceLane(component: ComponentInstance): SourceLane {
  return component.config.source?.lane ?? 'left'
}

function getRotationForSourceLane(lane: SourceLane): QuarterTurn {
  switch (lane) {
    case 'left':
      return 0
    case 'top':
      return 1
    case 'right':
      return 2
    case 'bottom':
      return 3
  }
}

export function resolveComponentPlacement(args: {
  breadboard: BreadboardModel
  candidateAnchorMm: Vector2Mm
  component: ComponentInstance
  dropSnapCaptureRadiusMm?: number
  phase: PlacementPhase
  rotationQuarterTurns?: QuarterTurn
  snapMode: SnapMode
  spec?: ResolvedComponentSpec
}): PlacementResult {
  const {
    breadboard,
    candidateAnchorMm,
    component,
    phase,
    snapMode,
    dropSnapCaptureRadiusMm = DROP_SNAP_CAPTURE_RADIUS_MM,
  } = args
  const spec = args.spec ?? getResolvedComponentSpec(component.type, component.variantId)
  const rotationQuarterTurns =
    args.rotationQuarterTurns ??
    (spec.mount.mode === 'external-source'
      ? getRotationForSourceLane(getSourceLane(component))
      : component.rotationQuarterTurns)
  const roundedCandidateAnchorMm = {
    x: roundMm(candidateAnchorMm.x),
    y: roundMm(candidateAnchorMm.y),
  }

  if (spec.mount.mode === 'external-source') {
    const sourceLane = getSourceLane(component)
    const laneAnchorMm = getLaneAnchorMm(
      breadboard,
      sourceLane,
      roundedCandidateAnchorMm,
    )
    const laneBoundsMm = getSourceLaneBoundsMm(breadboard, sourceLane)
    const footprintBoundsMm = getWorldBounds(
      spec.footprintBoundsMm,
      laneAnchorMm,
      rotationQuarterTurns,
    )
    const supportBoundsMm = getWorldBounds(
      spec.mount.supportBoundsMm,
      laneAnchorMm,
      rotationQuarterTurns,
    )

    return {
      candidateAnchorMm: roundedCandidateAnchorMm,
      resolvedAnchorMm: laneAnchorMm,
      nearestHoleMm: getNearestHole(breadboard, {
        x: Math.min(Math.max(laneAnchorMm.x, 0), breadboard.widthMm),
        y: Math.min(Math.max(laneAnchorMm.y, 0), breadboard.heightMm),
      }),
      snappedHoleMm: undefined,
      snapPreviewHoleMm: undefined,
      distanceToNearestHoleMm: 0,
      status: 'valid',
      reason: 'none',
      isOnHole: false,
      isMountSupported: isBoundsWithinBounds(supportBoundsMm, laneBoundsMm),
      isFootprintInsideBoard: false,
      isOccupied: false,
      sourceLane,
      footprintBoundsMm,
      supportBoundsMm,
    }
  }

  const nearestHoleMm = getNearestHole(breadboard, roundedCandidateAnchorMm)
  const distanceToNearestHoleMm = roundMm(
    getDistanceMm(roundedCandidateAnchorMm, nearestHoleMm),
  )
  const hasSnapPreview =
    snapMode === 'onDrop' &&
    phase === 'drag' &&
    distanceToNearestHoleMm <= dropSnapCaptureRadiusMm
  const shouldSnap =
    snapMode === 'always' ||
    (snapMode === 'onDrop' &&
      phase === 'drop' &&
      distanceToNearestHoleMm <= dropSnapCaptureRadiusMm)
  const resolvedAnchorMm = shouldSnap ? nearestHoleMm : roundedCandidateAnchorMm
  const nearestHoleForResolvedMm = getNearestHole(breadboard, resolvedAnchorMm)
  const isOnHole =
    getDistanceMm(resolvedAnchorMm, nearestHoleForResolvedMm) <=
    HOLE_ALIGNMENT_EPSILON_MM
  const footprintBoundsMm = getWorldBounds(
    spec.footprintBoundsMm,
    resolvedAnchorMm,
    rotationQuarterTurns,
  )
  const supportBoundsMm = getWorldBounds(
    spec.mount.supportBoundsMm,
    resolvedAnchorMm,
    rotationQuarterTurns,
  )
  const boardBoundsMm = getBoardBoundsMm(breadboard)
  const isMountSupported = isBoundsWithinBounds(supportBoundsMm, boardBoundsMm)
  const isFootprintInsideBoard = isBoundsWithinBounds(
    footprintBoundsMm,
    boardBoundsMm,
  )

  let status: PlacementResult['status'] = 'valid'
  let reason: PlacementResult['reason'] = 'none'

  if (!isMountSupported) {
    status = 'warning'
    reason = 'support-outside-board'
  } else if (!isFootprintInsideBoard) {
    status = 'warning'
    reason = 'footprint-overhang'
  } else if (hasSnapPreview || shouldSnap) {
    status = 'snapped'
    reason = hasSnapPreview ? 'snap-preview' : 'none'
  } else if (spec.mount.mode === 'hole-mounted' && !isOnHole) {
    status = 'warning'
    reason = 'off-hole'
  }

  return {
    candidateAnchorMm: roundedCandidateAnchorMm,
    resolvedAnchorMm,
    nearestHoleMm,
    snappedHoleMm: shouldSnap ? nearestHoleMm : undefined,
    snapPreviewHoleMm: hasSnapPreview ? nearestHoleMm : undefined,
    distanceToNearestHoleMm,
    status,
    reason,
    isOnHole,
    isMountSupported,
    isFootprintInsideBoard,
    isOccupied: false,
    footprintBoundsMm,
    supportBoundsMm,
  }
}

export function inspectComponentPlacement(
  breadboard: BreadboardModel,
  component: ComponentInstance,
  spec: ResolvedComponentSpec = getResolvedComponentSpec(
    component.type,
    component.variantId,
  ),
) {
  return resolveComponentPlacement({
    breadboard,
    candidateAnchorMm: component.anchorMm,
    component,
    phase: 'inspect',
    rotationQuarterTurns: component.rotationQuarterTurns,
    snapMode: 'none',
    spec,
  })
}

export function annotatePlacementOccupancy(args: {
  breadboard: BreadboardModel
  components: ComponentInstance[]
  ignoreComponentId?: string
  result: PlacementResult
}) {
  const { breadboard, components, ignoreComponentId, result } = args
  const isOccupied = components.some((component) => {
    if (component.id === ignoreComponentId) {
      return false
    }

    const existingPlacement = inspectComponentPlacement(breadboard, component)

    return doBoundsIntersect(result.supportBoundsMm, existingPlacement.supportBoundsMm)
  })

  if (!isOccupied) {
    return result
  }

  if (result.status === 'warning') {
    return {
      ...result,
      isOccupied: true,
    }
  }

  return {
    ...result,
    isOccupied: true,
    status: 'warning' as const,
    reason: 'occupied' as const,
  }
}

export function reconcileComponentAnchorForBreadboard(
  component: ComponentInstance,
  breadboard: BreadboardModel,
) {
  const spec = getResolvedComponentSpec(component.type, component.variantId)

  return resolveComponentPlacement({
    breadboard,
    candidateAnchorMm: component.anchorMm,
    component,
    phase: 'drop',
    rotationQuarterTurns: component.rotationQuarterTurns,
    snapMode: spec.mount.mode === 'hole-mounted' ? 'always' : 'none',
    spec,
  }).resolvedAnchorMm
}

function createOffsetCandidates(
  originalAnchorMm: Vector2Mm,
  breadboard: BreadboardModel,
  component: ComponentInstance,
) {
  const pitchMm = getEffectiveHolePitchMm(breadboard)

  if (component.config.source) {
    return [
      { x: originalAnchorMm.x, y: roundMm(originalAnchorMm.y + pitchMm) },
      { x: originalAnchorMm.x, y: roundMm(originalAnchorMm.y - pitchMm) },
      { x: originalAnchorMm.x, y: roundMm(originalAnchorMm.y + pitchMm * 2) },
    ]
  }

  const offsets = [
    { x: pitchMm, y: 0 },
    { x: 0, y: pitchMm },
    { x: pitchMm, y: pitchMm },
    { x: -pitchMm, y: 0 },
    { x: 0, y: -pitchMm },
    { x: pitchMm * 2, y: 0 },
    { x: 0, y: pitchMm * 2 },
    { x: pitchMm * 2, y: pitchMm },
    { x: pitchMm, y: pitchMm * 2 },
    { x: pitchMm * 1.25, y: pitchMm * 0.5 },
    { x: pitchMm * 0.5, y: pitchMm * 1.25 },
  ]

  return offsets.map((offset) => ({
    x: roundMm(originalAnchorMm.x + offset.x),
    y: roundMm(originalAnchorMm.y + offset.y),
  }))
}

export function findDuplicatePlacement(args: {
  breadboard: BreadboardModel
  component: ComponentInstance
  components: ComponentInstance[]
}) {
  const { breadboard, component, components } = args
  const spec = getResolvedComponentSpec(component.type, component.variantId)
  const candidates = createOffsetCandidates(component.anchorMm, breadboard, component)
  let firstWarningResult: PlacementResult | undefined

  for (const candidateAnchorMm of candidates) {
    const placement = annotatePlacementOccupancy({
      breadboard,
      components,
      ignoreComponentId: component.id,
      result: resolveComponentPlacement({
        breadboard,
        candidateAnchorMm,
        component,
        phase: 'drop',
        rotationQuarterTurns: component.rotationQuarterTurns,
        snapMode:
          spec.mount.mode === 'hole-mounted'
            ? 'always'
            : spec.mount.mode === 'external-source'
              ? 'none'
              : 'none',
        spec,
      }),
    })

    if (placement.status !== 'warning' && !placement.isOccupied) {
      return placement
    }

    if (
      !firstWarningResult &&
      spec.mount.mode !== 'hole-mounted' &&
      !placement.isOccupied
    ) {
      firstWarningResult = placement
    }
  }

  return firstWarningResult
}

function getPrimaryTargetPoint(component: ComponentInstance) {
  const ports = getWorldPortsForComponent(component)
  const inputPort = ports.find((port) => port.kind === 'beam-input')

  if (inputPort) {
    return inputPort.worldPositionMm
  }

  const spec = getResolvedComponentSpec(component.type, component.variantId)

  if (spec.opticalCenterMm) {
    return {
      x: roundMm(component.anchorMm.x + spec.opticalCenterMm.x),
      y: roundMm(component.anchorMm.y + spec.opticalCenterMm.y),
    }
  }

  return component.anchorMm
}

export function alignExternalSourceToTarget(args: {
  breadboard: BreadboardModel
  lane: SourceLane
  source: ComponentInstance
  target?: ComponentInstance
}) {
  const { breadboard, lane, target } = args
  const defaultAnchor = getLaneAnchorMm(breadboard, lane, {
    x: breadboard.widthMm / 2,
    y: breadboard.heightMm / 2,
  })

  if (!target || !isOpticalTarget(target.type)) {
    return {
      anchorMm: defaultAnchor,
      rotationQuarterTurns: getRotationForSourceLane(lane),
    }
  }

  const targetPoint = getPrimaryTargetPoint(target)

  return {
    anchorMm: getLaneAnchorMm(breadboard, lane, targetPoint),
    rotationQuarterTurns: getRotationForSourceLane(lane),
  }
}

export function getOpticalTargetComponentIds(components: ComponentInstance[]) {
  return components.filter((component) => isOpticalTarget(component.type)).map((component) => component.id)
}

import { getBreadboardHoleAxesMm, getEffectiveHolePitchMm, getNearestHole } from './breadboard'
import {
  getEffectiveSupportBoundsMm,
  getResolvedComponentSpecForInstance,
  isOpticalTarget,
} from './componentCatalog'
import { rotateBoundsQuarterTurns, roundMm } from './geometry'
import { getWorldPortsForComponent } from './ports'
import {
  componentLocalToWorld,
  componentWorldToLocal,
  getBreadboardWorldBoundsMm,
  getComponentById,
  getComponentRootId,
  getComponentTreeIds,
  getDefaultSurfaceId,
  getHostSurfaceIdForComponent,
  getOpticalTableWorldBoundsMm,
  getSurfaceAnchorMm,
  getSurfaceModel,
  getSurfaceRotationQuarterTurns,
  getWorkspaceWorldBoundsMm,
  surfaceLocalToWorld,
  surfaceWorldToLocal,
  transformSurfaceLocalBoundsToWorld,
} from './workspace'
import type {
  BoundsMm,
  BreadboardModel,
  ComponentInstance,
  OpticalTableModel,
  PlacementPhase,
  PlacementResult,
  QuarterTurn,
  ResolvedComponentSpec,
  SceneDocument,
  SnapMode,
  SourceLane,
  Vector2Mm,
} from './types'

export const DROP_SNAP_CAPTURE_RADIUS_MM = 5
export const SOURCE_LANE_OFFSET_MM = 60
export const SOURCE_LANE_HALF_WIDTH_MM = 16
export const SCENE_WORLD_PADDING_MM = 120
export const SOURCE_GUIDE_ALIGNMENT_THRESHOLD_MM = 12

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

export function getSceneWorldBoundsMm(input: BreadboardModel | SceneDocument): BoundsMm {
  const bounds =
    'kind' in input
      ? getWorkspaceWorldBoundsMm(input)
      : {
          x: 0,
          y: 0,
          width: input.widthMm,
          height: input.heightMm,
        }

  return {
    x: bounds.x - SCENE_WORLD_PADDING_MM,
    y: bounds.y - SCENE_WORLD_PADDING_MM,
    width: bounds.width + SCENE_WORLD_PADDING_MM * 2,
    height: bounds.height + SCENE_WORLD_PADDING_MM * 2,
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

function tableToBreadboardModel(table: OpticalTableModel): BreadboardModel {
  return {
    label: table.label,
    widthMm: table.widthMm,
    heightMm: table.heightMm,
    holeSpacingMm: table.holeSpacingMm,
    edgeMarginMm: table.edgeMarginMm,
    thicknessMm: table.thicknessMm,
    finish: 'clear-anodized',
    holeDensity: table.holeDensity,
    counterborePattern: table.counterborePattern,
  }
}

export function getSurfacePlacementModel(
  scene: SceneDocument,
  surfaceId?: string,
): {
  breadboard: BreadboardModel
  boundsMm: BoundsMm
  hostSurfaceId: string
  originMm: Vector2Mm
  rotationQuarterTurns: QuarterTurn
} {
  const resolvedSurfaceId = surfaceId ?? getDefaultSurfaceId(scene)
  const surfaceModel = getSurfaceModel(scene, resolvedSurfaceId)
  const originMm = getSurfaceAnchorMm(scene, resolvedSurfaceId)
  const rotationQuarterTurns = getSurfaceRotationQuarterTurns(
    scene,
    resolvedSurfaceId,
  )

  if (!surfaceModel) {
    const fallbackBreadboard =
      scene.workspace.kind === 'single-breadboard'
        ? scene.workspace.breadboard
        : tableToBreadboardModel(scene.workspace.table)

    return {
      breadboard: fallbackBreadboard,
      boundsMm:
        scene.workspace.kind === 'single-breadboard'
          ? getBreadboardWorldBoundsMm(scene.workspace.breadboard)
          : getOpticalTableWorldBoundsMm(scene.workspace.table),
      hostSurfaceId: getDefaultSurfaceId(scene),
      originMm: { x: 0, y: 0 },
      rotationQuarterTurns: 0,
    }
  }

  if (resolvedSurfaceId === 'optical-table' && scene.workspace.kind === 'optical-table') {
    return {
      breadboard: tableToBreadboardModel(scene.workspace.table),
      boundsMm: getOpticalTableWorldBoundsMm(scene.workspace.table),
      hostSurfaceId: resolvedSurfaceId,
      originMm,
      rotationQuarterTurns,
    }
  }

  return {
    breadboard: surfaceModel as BreadboardModel,
    boundsMm: getBreadboardWorldBoundsMm(
      surfaceModel as BreadboardModel,
      originMm,
      rotationQuarterTurns,
    ),
    hostSurfaceId: resolvedSurfaceId,
    originMm,
    rotationQuarterTurns,
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

function getAttachedComponentPlacement(args: {
  candidateAnchorMm: Vector2Mm
  component: ComponentInstance
  rotationQuarterTurns?: QuarterTurn
  scene: SceneDocument
  spec?: ResolvedComponentSpec
}): PlacementResult | undefined {
  const { candidateAnchorMm, component, scene } = args

  if (!component.attachment) {
    return undefined
  }

  const parent = getComponentById(scene, component.attachment.parentComponentId)

  if (!parent) {
    return undefined
  }

  const parentSpec = getResolvedComponentSpecForInstance(parent)
  const mountSite = parentSpec.mountSites.find(
    (site) => site.id === component.attachment?.parentMountSiteId,
  )

  if (!mountSite) {
    return undefined
  }

  const spec = args.spec ?? getResolvedComponentSpecForInstance(component)
  const localRotationQuarterTurns = (
    ((args.rotationQuarterTurns ?? component.rotationQuarterTurns) -
      parent.rotationQuarterTurns +
      4) %
    4
  ) as QuarterTurn
  const localAnchorMm = componentWorldToLocal(scene, parent.id, candidateAnchorMm)
  const localFootprintBoundsMm = getWorldBounds(
    spec.footprintBoundsMm,
    localAnchorMm,
    localRotationQuarterTurns,
  )
  const localSupportBoundsMm = getWorldBounds(
    getEffectiveSupportBoundsMm(component, spec),
    localAnchorMm,
    localRotationQuarterTurns,
  )
  const isMountSupported = isBoundsWithinBounds(
    localSupportBoundsMm,
    mountSite.seatBoundsMm,
  )
  const isFootprintInsideBoard = isBoundsWithinBounds(
    localFootprintBoundsMm,
    mountSite.seatBoundsMm,
  )
  const worldResolvedAnchorMm = componentLocalToWorld(scene, parent.id, localAnchorMm)

  return {
    candidateAnchorMm,
    resolvedAnchorMm: worldResolvedAnchorMm,
    nearestHoleMm: worldResolvedAnchorMm,
    snappedHoleMm: undefined,
    snapPreviewHoleMm: undefined,
    distanceToNearestHoleMm: 0,
    status: isMountSupported ? 'valid' : 'warning',
    reason: isMountSupported
      ? 'none'
      : isFootprintInsideBoard
        ? 'support-outside-board'
        : 'footprint-overhang',
    isOnHole: true,
    isMountSupported,
    isFootprintInsideBoard,
    isOccupied: false,
    footprintBoundsMm: getWorldBounds(
      localFootprintBoundsMm,
      parent.anchorMm,
      parent.rotationQuarterTurns,
    ),
    supportBoundsMm: getWorldBounds(
      localSupportBoundsMm,
      parent.anchorMm,
      parent.rotationQuarterTurns,
    ),
  }
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
  const spec = args.spec ?? getResolvedComponentSpecForInstance(component)
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
      getEffectiveSupportBoundsMm(component, spec),
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
    getEffectiveSupportBoundsMm(component, spec),
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
  spec: ResolvedComponentSpec = getResolvedComponentSpecForInstance(component),
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

export function resolveScenePlacement(args: {
  scene: SceneDocument
  candidateAnchorMm: Vector2Mm
  component: ComponentInstance
  dropSnapCaptureRadiusMm?: number
  phase: PlacementPhase
  rotationQuarterTurns?: QuarterTurn
  snapMode: SnapMode
  spec?: ResolvedComponentSpec
}) {
  const { scene, component } = args
  const attachedPlacement = getAttachedComponentPlacement(args)

  if (attachedPlacement) {
    return attachedPlacement
  }

  const hostSurfaceId = getHostSurfaceIdForComponent(scene, component)
  const surface = getSurfacePlacementModel(scene, hostSurfaceId)
  const localRotationQuarterTurns = (
    ((component.rotationQuarterTurns - surface.rotationQuarterTurns + 4) % 4) as QuarterTurn
  )
  const requestedRotationQuarterTurns =
    args.rotationQuarterTurns === undefined
      ? undefined
      : (((args.rotationQuarterTurns - surface.rotationQuarterTurns + 4) % 4) as QuarterTurn)
  const localComponent = {
    ...component,
    anchorMm: surfaceWorldToLocal(scene, hostSurfaceId, component.anchorMm),
    rotationQuarterTurns: localRotationQuarterTurns,
    hostSurfaceId,
  }

  if (
    hostSurfaceId === 'optical-table' &&
    getResolvedComponentSpecForInstance(component).mount.mode === 'external-source'
  ) {
    const localCandidateAnchorMm = surfaceWorldToLocal(
      scene,
      hostSurfaceId,
      args.candidateAnchorMm,
    )
    const footprintBoundsMm = transformSurfaceLocalBoundsToWorld(
      scene,
      hostSurfaceId,
      getWorldBounds(
        getResolvedComponentSpecForInstance(component).footprintBoundsMm,
        localCandidateAnchorMm,
        requestedRotationQuarterTurns ?? localRotationQuarterTurns,
      ),
    )

    return {
      candidateAnchorMm: args.candidateAnchorMm,
      resolvedAnchorMm: args.candidateAnchorMm,
      nearestHoleMm: args.candidateAnchorMm,
      distanceToNearestHoleMm: 0,
      status: 'warning' as const,
      reason: 'outside-source-lane' as const,
      isOnHole: false,
      isMountSupported: false,
      isFootprintInsideBoard: false,
      isOccupied: false,
      footprintBoundsMm,
      supportBoundsMm: footprintBoundsMm,
    }
  }

  const result = resolveComponentPlacement({
    breadboard: surface.breadboard,
    candidateAnchorMm: surfaceWorldToLocal(scene, hostSurfaceId, args.candidateAnchorMm),
    component: localComponent,
    dropSnapCaptureRadiusMm: args.dropSnapCaptureRadiusMm,
    phase: args.phase,
    rotationQuarterTurns: requestedRotationQuarterTurns,
    snapMode: args.snapMode,
    spec: args.spec,
  })

  return {
    ...result,
    candidateAnchorMm: surfaceLocalToWorld(scene, hostSurfaceId, result.candidateAnchorMm),
    resolvedAnchorMm: surfaceLocalToWorld(scene, hostSurfaceId, result.resolvedAnchorMm),
    nearestHoleMm: surfaceLocalToWorld(scene, hostSurfaceId, result.nearestHoleMm),
    snappedHoleMm: result.snappedHoleMm
      ? surfaceLocalToWorld(scene, hostSurfaceId, result.snappedHoleMm)
      : undefined,
    snapPreviewHoleMm: result.snapPreviewHoleMm
      ? surfaceLocalToWorld(scene, hostSurfaceId, result.snapPreviewHoleMm)
      : undefined,
    footprintBoundsMm: transformSurfaceLocalBoundsToWorld(
      scene,
      hostSurfaceId,
      result.footprintBoundsMm,
    ),
    supportBoundsMm: transformSurfaceLocalBoundsToWorld(
      scene,
      hostSurfaceId,
      result.supportBoundsMm,
    ),
  }
}

export function inspectSceneComponentPlacement(
  scene: SceneDocument,
  component: ComponentInstance,
  spec: ResolvedComponentSpec = getResolvedComponentSpecForInstance(component),
) {
  return resolveScenePlacement({
    scene,
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

export function annotateScenePlacementOccupancy(args: {
  scene: SceneDocument
  component?: ComponentInstance
  components: ComponentInstance[]
  ignoreComponentId?: string
  result: PlacementResult
  hostSurfaceId?: string
}) {
  const { scene, components, ignoreComponentId, result } = args
  const resolvedHostSurfaceId = args.hostSurfaceId ?? getDefaultSurfaceId(scene)
  const ignoredAttachmentTreeIds =
    args.component && !args.component.attachment
      ? new Set(
          getComponentTreeIds(
            scene,
            getComponentRootId(scene, args.component.id) ?? args.component.id,
          ),
        )
      : undefined
  const isOccupied = components.some((component) => {
    if (component.id === ignoreComponentId) {
      return false
    }

    if (args.component?.attachment) {
      return (
        component.attachment?.parentComponentId ===
          args.component.attachment.parentComponentId &&
        component.attachment.parentMountSiteId ===
          args.component.attachment.parentMountSiteId &&
        doBoundsIntersect(
          result.supportBoundsMm,
          inspectSceneComponentPlacement(scene, component).supportBoundsMm,
        )
      )
    }

    if (ignoredAttachmentTreeIds?.has(component.id)) {
      return false
    }

    if (
      getHostSurfaceIdForComponent(scene, component) !== resolvedHostSurfaceId
    ) {
      return false
    }

    const existingPlacement = inspectSceneComponentPlacement(scene, component)

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
  const spec = getResolvedComponentSpecForInstance(component)

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

export function reconcileComponentAnchorForScene(
  component: ComponentInstance,
  scene: SceneDocument,
) {
  const spec = getResolvedComponentSpecForInstance(component)

  return resolveScenePlacement({
    scene,
    candidateAnchorMm: component.anchorMm,
    component,
    phase: 'drop',
    rotationQuarterTurns: component.rotationQuarterTurns,
    snapMode: spec.mount.mode === 'hole-mounted' ? 'always' : 'none',
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
  const spec = getResolvedComponentSpecForInstance(component)
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

export function findDuplicateScenePlacement(args: {
  component: ComponentInstance
  components: ComponentInstance[]
  scene: SceneDocument
}) {
  const { component, components, scene } = args
  const surface = getSurfacePlacementModel(
    scene,
    getHostSurfaceIdForComponent(scene, component),
  )
  const localAnchorMm = surfaceWorldToLocal(
    scene,
    surface.hostSurfaceId,
    component.anchorMm,
  )
  const localComponent = {
    ...component,
    anchorMm: localAnchorMm,
    rotationQuarterTurns:
      ((component.rotationQuarterTurns - surface.rotationQuarterTurns + 4) %
        4) as QuarterTurn,
  }
  const candidates = createOffsetCandidates(
    localAnchorMm,
    surface.breadboard,
    localComponent,
  )
  let firstWarningResult: PlacementResult | undefined

  for (const localCandidateMm of candidates) {
    const worldCandidateMm = surfaceLocalToWorld(
      scene,
      surface.hostSurfaceId,
      localCandidateMm,
    )
    const placement = annotateScenePlacementOccupancy({
      scene,
      component,
      components,
      ignoreComponentId: component.id,
      result: resolveScenePlacement({
        scene,
        candidateAnchorMm: worldCandidateMm,
        component,
        phase: 'drop',
        rotationQuarterTurns: component.rotationQuarterTurns,
        snapMode:
          getResolvedComponentSpecForInstance(component).mount.mode ===
          'hole-mounted'
            ? 'always'
            : 'none',
      }),
      hostSurfaceId: surface.hostSurfaceId,
    })

    if (placement.status !== 'warning' && !placement.isOccupied) {
      return placement
    }

    if (!firstWarningResult && !placement.isOccupied) {
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

  const spec = getResolvedComponentSpecForInstance(component)

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

export function alignSceneSourceToTarget(args: {
  lane: SourceLane
  scene: SceneDocument
  source: ComponentInstance
  target?: ComponentInstance
}) {
  const { lane, scene, source, target } = args
  const hostSurfaceId = getHostSurfaceIdForComponent(scene, source)
  const surface = getSurfacePlacementModel(scene, hostSurfaceId)
  const defaultAnchorLocalMm = getLaneAnchorMm(surface.breadboard, lane, {
    x: surface.breadboard.widthMm / 2,
    y: surface.breadboard.heightMm / 2,
  })
  const targetPointLocalMm =
    target && isOpticalTarget(target.type)
      ? surfaceWorldToLocal(scene, hostSurfaceId, getPrimaryTargetPoint(target))
      : undefined
  const localAnchorMm = targetPointLocalMm
    ? getLaneAnchorMm(surface.breadboard, lane, targetPointLocalMm)
    : defaultAnchorLocalMm
  const localRotationQuarterTurns = getRotationForSourceLane(lane)

  return {
    anchorMm: surfaceLocalToWorld(scene, hostSurfaceId, localAnchorMm),
    rotationQuarterTurns:
      ((localRotationQuarterTurns + surface.rotationQuarterTurns) % 4) as QuarterTurn,
  }
}

export function getOpticalTargetComponentIds(components: ComponentInstance[]) {
  return components.filter((component) => isOpticalTarget(component.type)).map((component) => component.id)
}

function getSourceOutputPoint(component: ComponentInstance) {
  const ports = getWorldPortsForComponent(component)
  const outputPort = ports.find(
    (port) =>
      port.kind === 'beam-output' || port.kind === 'beam-bidirectional',
  )

  if (outputPort) {
    return outputPort.worldPositionMm
  }

  return component.anchorMm
}

export interface SourceGuideSnapshot {
  alignmentAxis?: 'horizontal' | 'vertical'
  sourcePointMm: Vector2Mm
  targetPointMm: Vector2Mm
}

export function getSourceGuideSnapshot(args: {
  candidateAnchorMm?: Vector2Mm
  scene: SceneDocument
  source: ComponentInstance
  targetId?: string
}): SourceGuideSnapshot | undefined {
  const target =
    args.targetId === undefined
      ? undefined
      : args.scene.components.find((component) => component.id === args.targetId)

  if (!target || !isOpticalTarget(target.type)) {
    return undefined
  }

  const source = args.candidateAnchorMm
    ? {
        ...args.source,
        anchorMm: args.candidateAnchorMm,
      }
    : args.source
  const sourcePointMm = getSourceOutputPoint(source)
  const targetPointMm = getPrimaryTargetPoint(target)
  const deltaX = targetPointMm.x - sourcePointMm.x
  const deltaY = targetPointMm.y - sourcePointMm.y
  const absDeltaX = Math.abs(deltaX)
  const absDeltaY = Math.abs(deltaY)
  let alignmentAxis: SourceGuideSnapshot['alignmentAxis']

  if (
    absDeltaX <= SOURCE_GUIDE_ALIGNMENT_THRESHOLD_MM &&
    absDeltaX <= absDeltaY
  ) {
    alignmentAxis = 'vertical'
  } else if (absDeltaY <= SOURCE_GUIDE_ALIGNMENT_THRESHOLD_MM) {
    alignmentAxis = 'horizontal'
  }

  return {
    alignmentAxis,
    sourcePointMm,
    targetPointMm,
  }
}

export function applySourceGuideAssist(args: {
  candidateAnchorMm: Vector2Mm
  scene: SceneDocument
  source: ComponentInstance
  targetId?: string
}) {
  const guide = getSourceGuideSnapshot({
    candidateAnchorMm: args.candidateAnchorMm,
    scene: args.scene,
    source: args.source,
    targetId: args.targetId,
  })

  if (!guide?.alignmentAxis) {
    return {
      anchorMm: args.candidateAnchorMm,
      guide,
    }
  }

  const deltaMm =
    guide.alignmentAxis === 'vertical'
      ? guide.targetPointMm.x - guide.sourcePointMm.x
      : guide.targetPointMm.y - guide.sourcePointMm.y
  const normalizedStrength =
    1 -
    Math.min(
      1,
      Math.abs(deltaMm) / SOURCE_GUIDE_ALIGNMENT_THRESHOLD_MM,
    )
  const assistStrength = 0.58 + normalizedStrength * 0.28

  return {
    anchorMm:
      guide.alignmentAxis === 'vertical'
        ? {
            x: roundMm(args.candidateAnchorMm.x + deltaMm * assistStrength),
            y: roundMm(args.candidateAnchorMm.y),
          }
        : {
            x: roundMm(args.candidateAnchorMm.x),
            y: roundMm(args.candidateAnchorMm.y + deltaMm * assistStrength),
          },
    guide,
  }
}

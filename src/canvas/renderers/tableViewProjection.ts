import {
  rotatePointQuarterTurns,
  roundMm,
  worldToScreen,
  screenToWorld,
} from '../../domain/geometry'
import {
  OPTICAL_TABLE_SURFACE_ID,
  type BoundsMm,
  type QuarterTurn,
  type RenderMode,
  type SceneDocument,
  type ScreenPointPx,
  type Vector2Mm,
  type ViewportState,
  type WorkspaceViewMode,
} from '../../domain/types'
import {
  getBreadboardInstances,
  getBreadboardWorldBoundsMm,
  getOpticalTable,
  getOpticalTableWorldBoundsMm,
  getSurfaceMountPlaneOffsetMm,
} from '../../domain/workspace'

export const TABLE_VIEW_OBLIQUE_PROJECTION = {
  planeYCompression: 0.72,
  planeXShear: -0.34,
  zScale: 0.6,
} as const

export interface SurfaceProjectionCandidate {
  boundsMm: BoundsMm
  elevationMm: number
  surfaceId: string
}

export function shouldUseProjectedTableView(
  scene: SceneDocument,
  renderMode: RenderMode,
  workspaceViewMode: WorkspaceViewMode,
) {
  return (
    renderMode === 'realistic' &&
    scene.workspace.kind === 'optical-table' &&
    workspaceViewMode === 'table-view'
  )
}

export function projectWorldPointToScreen(
  pointMm: Vector2Mm,
  viewport: ViewportState,
  elevationMm = 0,
): ScreenPointPx {
  const flatPointPx = worldToScreen(pointMm, viewport)
  const worldDeltaY = pointMm.y - viewport.cameraCenterMm.y

  return {
    x:
      flatPointPx.x +
      worldDeltaY *
        TABLE_VIEW_OBLIQUE_PROJECTION.planeXShear *
        viewport.zoomPxPerMm,
    y:
      viewport.canvasSizePx.height / 2 +
      worldDeltaY *
        TABLE_VIEW_OBLIQUE_PROJECTION.planeYCompression *
        viewport.zoomPxPerMm -
      elevationMm *
        TABLE_VIEW_OBLIQUE_PROJECTION.zScale *
        viewport.zoomPxPerMm,
  }
}

export function projectScreenPointToWorld(
  pointPx: ScreenPointPx,
  viewport: ViewportState,
  elevationMm = 0,
): Vector2Mm {
  const halfWidth = viewport.canvasSizePx.width / 2
  const halfHeight = viewport.canvasSizePx.height / 2
  const projectedDeltaY =
    (pointPx.y - halfHeight) / viewport.zoomPxPerMm +
    elevationMm * TABLE_VIEW_OBLIQUE_PROJECTION.zScale
  const worldDeltaY =
    projectedDeltaY / TABLE_VIEW_OBLIQUE_PROJECTION.planeYCompression
  const worldDeltaX =
    (pointPx.x - halfWidth) / viewport.zoomPxPerMm -
    worldDeltaY * TABLE_VIEW_OBLIQUE_PROJECTION.planeXShear

  return {
    x: roundMm(viewport.cameraCenterMm.x + worldDeltaX),
    y: roundMm(viewport.cameraCenterMm.y + worldDeltaY),
  }
}

export function projectLocalOffsetToScreen(
  pointMm: Vector2Mm,
  viewport: ViewportState,
  rotationQuarterTurns: QuarterTurn = 0,
  zMm = 0,
): ScreenPointPx {
  const rotatedPointMm = rotatePointQuarterTurns(pointMm, rotationQuarterTurns)

  return {
    x:
      (rotatedPointMm.x +
        rotatedPointMm.y * TABLE_VIEW_OBLIQUE_PROJECTION.planeXShear) *
      viewport.zoomPxPerMm,
    y:
      rotatedPointMm.y *
        TABLE_VIEW_OBLIQUE_PROJECTION.planeYCompression *
        viewport.zoomPxPerMm -
      zMm * TABLE_VIEW_OBLIQUE_PROJECTION.zScale * viewport.zoomPxPerMm,
  }
}

export function getProjectedBoundsCorners(
  boundsMm: BoundsMm,
  viewport: ViewportState,
  elevationMm = 0,
) {
  return [
    projectWorldPointToScreen(
      { x: boundsMm.x, y: boundsMm.y },
      viewport,
      elevationMm,
    ),
    projectWorldPointToScreen(
      { x: boundsMm.x + boundsMm.width, y: boundsMm.y },
      viewport,
      elevationMm,
    ),
    projectWorldPointToScreen(
      { x: boundsMm.x + boundsMm.width, y: boundsMm.y + boundsMm.height },
      viewport,
      elevationMm,
    ),
    projectWorldPointToScreen(
      { x: boundsMm.x, y: boundsMm.y + boundsMm.height },
      viewport,
      elevationMm,
    ),
  ]
}

export function getProjectedBoundsLinePoints(
  boundsMm: BoundsMm,
  viewport: ViewportState,
  elevationMm = 0,
) {
  return getProjectedBoundsCorners(boundsMm, viewport, elevationMm).flatMap((pointPx) => [
    pointPx.x,
    pointPx.y,
  ])
}

export function getProjectedBoundsAabb(
  boundsMm: BoundsMm,
  viewport: ViewportState,
  elevationMm = 0,
): BoundsMm {
  const corners = getProjectedBoundsCorners(boundsMm, viewport, elevationMm)
  const xValues = corners.map((corner) => corner.x)
  const yValues = corners.map((corner) => corner.y)
  const minimumX = Math.min(...xValues)
  const maximumX = Math.max(...xValues)
  const minimumY = Math.min(...yValues)
  const maximumY = Math.max(...yValues)

  return {
    x: minimumX,
    y: minimumY,
    width: maximumX - minimumX,
    height: maximumY - minimumY,
  }
}

function isPointInsideBounds(boundsMm: BoundsMm, pointMm: Vector2Mm) {
  return (
    pointMm.x >= boundsMm.x &&
    pointMm.x <= boundsMm.x + boundsMm.width &&
    pointMm.y >= boundsMm.y &&
    pointMm.y <= boundsMm.y + boundsMm.height
  )
}

export function getProjectedSurfaceCandidates(
  scene: SceneDocument,
): SurfaceProjectionCandidate[] {
  if (scene.workspace.kind !== 'optical-table') {
    return []
  }

  const candidates: SurfaceProjectionCandidate[] = []
  const opticalTable = getOpticalTable(scene)

  if (opticalTable) {
    candidates.push({
      boundsMm: getOpticalTableWorldBoundsMm(opticalTable),
      elevationMm: 0,
      surfaceId: OPTICAL_TABLE_SURFACE_ID,
    })
  }

  for (const breadboard of getBreadboardInstances(scene)) {
    candidates.push({
      boundsMm: getBreadboardWorldBoundsMm(
        breadboard.model,
        breadboard.anchorMm,
        breadboard.rotationQuarterTurns,
      ),
      elevationMm: breadboard.mountPlaneOffsetMm,
      surfaceId: breadboard.id,
    })
  }

  return candidates
}

export function resolveProjectedScreenPointToWorld(
  scene: SceneDocument,
  viewport: ViewportState,
  pointPx: ScreenPointPx,
  options?: {
    preferredElevationMm?: number
    preferredSurfaceId?: string
  },
) {
  const candidates = getProjectedSurfaceCandidates(scene)
  const resolvedCandidates = candidates
    .map((candidate) => {
      const worldPointMm = projectScreenPointToWorld(
        pointPx,
        viewport,
        candidate.elevationMm,
      )

      return {
        ...candidate,
        containsPoint: isPointInsideBounds(candidate.boundsMm, worldPointMm),
        worldPointMm,
      }
    })
    .sort((left, right) => {
      if (options?.preferredSurfaceId) {
        if (left.surfaceId === options.preferredSurfaceId && right.surfaceId !== options.preferredSurfaceId) {
          return -1
        }

        if (right.surfaceId === options.preferredSurfaceId && left.surfaceId !== options.preferredSurfaceId) {
          return 1
        }
      }

      if (typeof options?.preferredElevationMm === 'number') {
        const leftMatchesPreferredElevation =
          Math.abs(left.elevationMm - options.preferredElevationMm) <= 0.001
        const rightMatchesPreferredElevation =
          Math.abs(right.elevationMm - options.preferredElevationMm) <= 0.001

        if (leftMatchesPreferredElevation !== rightMatchesPreferredElevation) {
          return leftMatchesPreferredElevation ? -1 : 1
        }
      }

      if (left.containsPoint !== right.containsPoint) {
        return left.containsPoint ? -1 : 1
      }

      if (left.elevationMm !== right.elevationMm) {
        return right.elevationMm - left.elevationMm
      }

      return 0
    })

  const bestCandidate = resolvedCandidates[0]

  if (bestCandidate?.containsPoint) {
    return {
      elevationMm: bestCandidate.elevationMm,
      surfaceId: bestCandidate.surfaceId,
      worldPointMm: bestCandidate.worldPointMm,
    }
  }

  if (typeof options?.preferredElevationMm === 'number') {
    return {
      elevationMm: options.preferredElevationMm,
      surfaceId: options.preferredSurfaceId,
      worldPointMm: projectScreenPointToWorld(
        pointPx,
        viewport,
        options.preferredElevationMm,
      ),
    }
  }

  if (options?.preferredSurfaceId) {
    const preferredElevationMm = getSurfaceMountPlaneOffsetMm(
      scene,
      options.preferredSurfaceId,
    )

    return {
      elevationMm: preferredElevationMm,
      surfaceId: options.preferredSurfaceId,
      worldPointMm: projectScreenPointToWorld(
        pointPx,
        viewport,
        preferredElevationMm,
      ),
    }
  }

  return {
    elevationMm: 0,
    surfaceId: OPTICAL_TABLE_SURFACE_ID,
    worldPointMm:
      scene.workspace.kind === 'optical-table'
        ? projectScreenPointToWorld(pointPx, viewport, 0)
        : screenToWorld(pointPx, viewport),
  }
}

export function getProjectedSortBottomPx(
  boundsMm: BoundsMm,
  viewport: ViewportState,
  elevationMm = 0,
) {
  const projectedBounds = getProjectedBoundsAabb(boundsMm, viewport, elevationMm)

  return projectedBounds.y + projectedBounds.height
}

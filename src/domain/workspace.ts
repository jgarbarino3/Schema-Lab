import { getBreadboardCenterMm } from './breadboard'
import { createBreadboardFromPreset, getDefaultBreadboard } from './breadboardPresets'
import { rotateBoundsQuarterTurns, rotatePointQuarterTurns, roundMm } from './geometry'
import type {
  BoundsMm,
  BreadboardInstance,
  BreadboardModel,
  ComponentInstance,
  OpticalTableModel,
  OpticalTableWorkspace,
  QuarterTurn,
  SceneDocument,
  SingleBreadboardWorkspace,
  Vector2Mm,
  WorkspaceSurfaceKind,
  WorkspaceSurfaceSummary,
} from './types'
import {
  OPTICAL_TABLE_SURFACE_ID,
  SINGLE_BREADBOARD_SURFACE_ID,
} from './types'

export function createDefaultOpticalTable(): OpticalTableModel {
  return {
    label: 'Optical Table 3600 × 1500',
    widthMm: 3600,
    heightMm: 1500,
    holeSpacingMm: 25,
    edgeMarginMm: 25,
    thicknessMm: 120,
    finish: 'silver',
    holeDensity: 'single',
    counterborePattern: 'none',
  }
}

export function getBreadboardWorldBoundsMm(
  breadboard: BreadboardModel,
  anchorMm: Vector2Mm = { x: 0, y: 0 },
  rotationQuarterTurns: QuarterTurn = 0,
): BoundsMm {
  const rotatedBoundsMm = rotateBoundsQuarterTurns(
    {
      x: 0,
      y: 0,
      width: breadboard.widthMm,
      height: breadboard.heightMm,
    },
    rotationQuarterTurns,
  )

  return {
    x: roundMm(anchorMm.x + rotatedBoundsMm.x),
    y: roundMm(anchorMm.y + rotatedBoundsMm.y),
    width: rotatedBoundsMm.width,
    height: rotatedBoundsMm.height,
  }
}

export function getBreadboardAnchorForCenterMm(
  breadboard: BreadboardModel,
  centerMm: Vector2Mm,
  rotationQuarterTurns: QuarterTurn = 0,
): Vector2Mm {
  const rotatedBoundsMm = rotateBoundsQuarterTurns(
    {
      x: 0,
      y: 0,
      width: breadboard.widthMm,
      height: breadboard.heightMm,
    },
    rotationQuarterTurns,
  )

  return {
    x: roundMm(centerMm.x - rotatedBoundsMm.x - rotatedBoundsMm.width / 2),
    y: roundMm(centerMm.y - rotatedBoundsMm.y - rotatedBoundsMm.height / 2),
  }
}

export function getOpticalTableWorldBoundsMm(
  table: OpticalTableModel,
  anchorMm: Vector2Mm = { x: 0, y: 0 },
): BoundsMm {
  return {
    x: anchorMm.x,
    y: anchorMm.y,
    width: table.widthMm,
    height: table.heightMm,
  }
}

export function getWorkspaceKind(scene: SceneDocument) {
  return scene.workspace.kind
}

export function isOpticalTableWorkspace(scene: SceneDocument) {
  return scene.workspace.kind === 'optical-table'
}

export function getBreadboardInstances(scene: SceneDocument): BreadboardInstance[] {
  return scene.workspace.kind === 'optical-table' ? scene.workspace.breadboards : []
}

export function getDefaultSurfaceId(scene: SceneDocument) {
  if (scene.workspace.kind === 'single-breadboard') {
    return SINGLE_BREADBOARD_SURFACE_ID
  }

  return scene.workspace.breadboards[0]?.id ?? OPTICAL_TABLE_SURFACE_ID
}

export function getSingleBreadboard(scene: SceneDocument): BreadboardModel | undefined {
  return scene.workspace.kind === 'single-breadboard'
    ? scene.workspace.breadboard
    : undefined
}

export function getOpticalTable(scene: SceneDocument): OpticalTableModel | undefined {
  return scene.workspace.kind === 'optical-table' ? scene.workspace.table : undefined
}

export function getBreadboardInstance(
  scene: SceneDocument,
  surfaceId: string | undefined,
): BreadboardInstance | undefined {
  if (!surfaceId || scene.workspace.kind !== 'optical-table') {
    return undefined
  }

  return scene.workspace.breadboards.find((breadboard) => breadboard.id === surfaceId)
}

export function getSurfaceKind(
  scene: SceneDocument,
  surfaceId: string | undefined,
): WorkspaceSurfaceKind | undefined {
  if (!surfaceId) {
    return undefined
  }

  if (
    surfaceId === SINGLE_BREADBOARD_SURFACE_ID &&
    scene.workspace.kind === 'single-breadboard'
  ) {
    return 'breadboard'
  }

  if (
    surfaceId === OPTICAL_TABLE_SURFACE_ID &&
    scene.workspace.kind === 'optical-table'
  ) {
    return 'optical-table'
  }

  return getBreadboardInstance(scene, surfaceId) ? 'breadboard' : undefined
}

export function getSurfaceModel(
  scene: SceneDocument,
  surfaceId: string | undefined,
): BreadboardModel | OpticalTableModel | undefined {
  if (!surfaceId) {
    return undefined
  }

  if (
    scene.workspace.kind === 'single-breadboard' &&
    surfaceId === SINGLE_BREADBOARD_SURFACE_ID
  ) {
    return scene.workspace.breadboard
  }

  if (
    scene.workspace.kind === 'optical-table' &&
    surfaceId === OPTICAL_TABLE_SURFACE_ID
  ) {
    return scene.workspace.table
  }

  return getBreadboardInstance(scene, surfaceId)?.model
}

export function getSurfaceAnchorMm(
  scene: SceneDocument,
  surfaceId: string | undefined,
): Vector2Mm {
  if (!surfaceId) {
    return { x: 0, y: 0 }
  }

  const breadboardInstance = getBreadboardInstance(scene, surfaceId)

  return breadboardInstance?.anchorMm ?? { x: 0, y: 0 }
}

export function getSurfaceRotationQuarterTurns(
  scene: SceneDocument,
  surfaceId: string | undefined,
): QuarterTurn {
  const breadboardInstance = getBreadboardInstance(scene, surfaceId)

  return breadboardInstance?.rotationQuarterTurns ?? 0
}

export function surfaceLocalToWorld(
  scene: SceneDocument,
  surfaceId: string | undefined,
  pointMm: Vector2Mm,
): Vector2Mm {
  const originMm = getSurfaceAnchorMm(scene, surfaceId)
  const rotationQuarterTurns = getSurfaceRotationQuarterTurns(scene, surfaceId)
  const rotatedPointMm = rotatePointQuarterTurns(pointMm, rotationQuarterTurns)

  return {
    x: roundMm(originMm.x + rotatedPointMm.x),
    y: roundMm(originMm.y + rotatedPointMm.y),
  }
}

export function surfaceWorldToLocal(
  scene: SceneDocument,
  surfaceId: string | undefined,
  pointMm: Vector2Mm,
): Vector2Mm {
  const originMm = getSurfaceAnchorMm(scene, surfaceId)
  const rotationQuarterTurns = getSurfaceRotationQuarterTurns(scene, surfaceId)
  const translatedPointMm = {
    x: roundMm(pointMm.x - originMm.x),
    y: roundMm(pointMm.y - originMm.y),
  }

  return rotatePointQuarterTurns(
    translatedPointMm,
    ((4 - rotationQuarterTurns) % 4) as QuarterTurn,
  )
}

export function transformSurfaceLocalBoundsToWorld(
  scene: SceneDocument,
  surfaceId: string | undefined,
  boundsMm: BoundsMm,
): BoundsMm {
  const rotatedBoundsMm = rotateBoundsQuarterTurns(
    boundsMm,
    getSurfaceRotationQuarterTurns(scene, surfaceId),
  )
  const originMm = getSurfaceAnchorMm(scene, surfaceId)

  return {
    x: roundMm(originMm.x + rotatedBoundsMm.x),
    y: roundMm(originMm.y + rotatedBoundsMm.y),
    width: rotatedBoundsMm.width,
    height: rotatedBoundsMm.height,
  }
}

export function getHostSurfaceIdForComponent(
  scene: SceneDocument,
  component: Pick<ComponentInstance, 'hostSurfaceId'>,
) {
  if (component.hostSurfaceId) {
    return component.hostSurfaceId
  }

  return getDefaultSurfaceId(scene)
}

export function getSurfaceSummaryList(scene: SceneDocument): WorkspaceSurfaceSummary[] {
  if (scene.workspace.kind === 'single-breadboard') {
    return [
      {
        id: SINGLE_BREADBOARD_SURFACE_ID,
        kind: 'breadboard',
        label: scene.workspace.breadboard.label,
      },
    ]
  }

  return [
    {
      id: OPTICAL_TABLE_SURFACE_ID,
      kind: 'optical-table',
      label: scene.workspace.table.label,
    },
    ...scene.workspace.breadboards.map((breadboard) => ({
      id: breadboard.id,
      kind: 'breadboard' as const,
      label: breadboard.label,
    })),
  ]
}

export function getWorkspacePrimaryBreadboard(scene: SceneDocument): BreadboardModel {
  if (scene.workspace.kind === 'single-breadboard') {
    return scene.workspace.breadboard
  }

  return scene.workspace.breadboards[0]?.model ?? getDefaultBreadboard()
}

export function getWorkspaceWorldBoundsMm(scene: SceneDocument): BoundsMm {
  if (scene.workspace.kind === 'single-breadboard') {
    return getBreadboardWorldBoundsMm(scene.workspace.breadboard)
  }

  let boundsMm = getOpticalTableWorldBoundsMm(scene.workspace.table)

  for (const breadboard of scene.workspace.breadboards) {
    const breadboardBoundsMm = getBreadboardWorldBoundsMm(
      breadboard.model,
      breadboard.anchorMm,
      breadboard.rotationQuarterTurns,
    )
    const minX = Math.min(boundsMm.x, breadboardBoundsMm.x)
    const minY = Math.min(boundsMm.y, breadboardBoundsMm.y)
    const maxX = Math.max(
      boundsMm.x + boundsMm.width,
      breadboardBoundsMm.x + breadboardBoundsMm.width,
    )
    const maxY = Math.max(
      boundsMm.y + boundsMm.height,
      breadboardBoundsMm.y + breadboardBoundsMm.height,
    )

    boundsMm = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    }
  }

  return boundsMm
}

export function createBreadboardInstance(args?: {
  id?: string
  label?: string
  model?: BreadboardModel
  anchorMm?: Vector2Mm
  rotationQuarterTurns?: QuarterTurn
}): BreadboardInstance {
  return {
    id: args?.id ?? `breadboard-${Math.random().toString(36).slice(2, 10)}`,
    label: args?.label ?? 'Breadboard',
    model: args?.model ?? getDefaultBreadboard(),
    anchorMm: args?.anchorMm ?? { x: 0, y: 0 },
    rotationQuarterTurns: args?.rotationQuarterTurns ?? 0,
  }
}

export function createCenteredTableWorkspaceFromSingle(
  breadboard: BreadboardModel,
): OpticalTableWorkspace {
  const table = createDefaultOpticalTable()
  const breadboardCenterMm = getBreadboardCenterMm(breadboard)
  const tableCenterMm = {
    x: table.widthMm / 2,
    y: table.heightMm / 2,
  }
  const anchorMm = {
    x: roundMm(tableCenterMm.x - breadboardCenterMm.x),
    y: roundMm(tableCenterMm.y - breadboardCenterMm.y),
  }

  return {
    kind: 'optical-table',
    table,
    breadboards: [
      createBreadboardInstance({
        id: 'breadboard-1',
        label: 'Breadboard 1',
        model: breadboard,
        anchorMm,
      }),
    ],
  }
}

export function createFreshSingleBreadboardWorkspace(): SingleBreadboardWorkspace {
  return {
    kind: 'single-breadboard',
    breadboard: getDefaultBreadboard(),
  }
}

export function createBreadboardWorkspaceFromPreset(presetId: string) {
  return createBreadboardInstance({
    id: `breadboard-${presetId}`,
    label: createBreadboardFromPreset(presetId).label,
    model: createBreadboardFromPreset(presetId),
  })
}

export function translateComponentWorld(
  component: ComponentInstance,
  deltaMm: Vector2Mm,
): ComponentInstance {
  return {
    ...component,
    anchorMm: {
      x: roundMm(component.anchorMm.x + deltaMm.x),
      y: roundMm(component.anchorMm.y + deltaMm.y),
    },
  }
}

export function convertSceneToOpticalTable(scene: SceneDocument): SceneDocument {
  if (scene.workspace.kind === 'optical-table') {
    return scene
  }

  const workspace = createCenteredTableWorkspaceFromSingle(scene.workspace.breadboard)
  const hostSurfaceId = workspace.breadboards[0]?.id
  const breadboardAnchorMm = workspace.breadboards[0]?.anchorMm ?? { x: 0, y: 0 }

  return {
    ...scene,
    version: 6,
    workspace,
    components: scene.components.map((component) => ({
      ...component,
      hostSurfaceId,
      anchorMm: {
        x: roundMm(component.anchorMm.x + breadboardAnchorMm.x),
        y: roundMm(component.anchorMm.y + breadboardAnchorMm.y),
      },
    })),
  }
}

export function convertSceneToSingleBreadboard(args: {
  scene: SceneDocument
  breadboardId?: string
  createFresh?: boolean
}): SceneDocument {
  const { scene, breadboardId, createFresh } = args

  if (scene.workspace.kind === 'single-breadboard') {
    return scene
  }

  const chosenBreadboard =
    !createFresh && breadboardId
      ? scene.workspace.breadboards.find((item) => item.id === breadboardId)
      : scene.workspace.breadboards[0]
  const nextWorkspace = createFresh
    ? createFreshSingleBreadboardWorkspace()
    : {
        kind: 'single-breadboard' as const,
        breadboard: chosenBreadboard?.model ?? getDefaultBreadboard(),
      }
  const originMm = chosenBreadboard?.anchorMm ?? { x: 0, y: 0 }

  return {
    ...scene,
    version: 6,
    workspace: nextWorkspace,
    components: scene.components
      .filter((component) =>
        createFresh ? false : component.hostSurfaceId === chosenBreadboard?.id,
      )
      .map((component) => ({
        ...component,
        hostSurfaceId: SINGLE_BREADBOARD_SURFACE_ID,
        anchorMm: {
          x: roundMm(component.anchorMm.x - originMm.x),
          y: roundMm(component.anchorMm.y - originMm.y),
        },
      })),
  }
}

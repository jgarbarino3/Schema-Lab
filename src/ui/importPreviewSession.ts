import { getDefaultBreadboard } from '../domain/breadboardPresets'
import {
  createDefaultOpticalTable,
  createBreadboardInstance,
  getBreadboardAnchorForCenterMm,
} from '../domain/workspace'
import {
  applySvgImportToScene,
  type ImportPreviewDocument,
  type ImportPreviewItem,
  type SvgImportAnalysis,
  type SvgImportDocument,
  type SvgImportMode,
  type SvgImportWorkspaceConfig,
  type SvgImportWorkspaceDetection,
} from '../domain/svgImport'
import { getDefaultBeamSettings } from '../domain/serialization'
import {
  SCENE_DOCUMENT_KIND,
  SCENE_DOCUMENT_VERSION,
  type ComponentInstance,
  type SceneDocument,
  type Vector2Mm,
} from '../domain/types'

export type ImportPreviewMode = 'source' | 'live-board'
export type ImportConfirmAction = 'board-only' | 'quick-import' | 'modified-import'

export interface ImportDraftComponentBinding {
  component: ComponentInstance
  componentId: string
  previewItemId: string
  previewItemIndex: number
}

function cloneWorkspaceConfig(config: SvgImportWorkspaceConfig): SvgImportWorkspaceConfig {
  return JSON.parse(JSON.stringify(config)) as SvgImportWorkspaceConfig
}

function createBreadboardModelFromSurface(
  surface: SvgImportWorkspaceConfig['breadboards'][number],
) {
  const fallback = getDefaultBreadboard()

  return {
    ...fallback,
    label: surface.label,
    widthMm: surface.physicalWidthMm,
    heightMm: surface.physicalHeightMm,
  }
}

export function createWorkspaceFromImportConfig(
  config: SvgImportWorkspaceConfig,
): SceneDocument['workspace'] {
  if (config.workspaceKind === 'single-breadboard') {
    const primaryBoard = config.breadboards[0]

    return {
      kind: 'single-breadboard',
      breadboard: createBreadboardModelFromSurface(primaryBoard),
    }
  }

  const tableBase = createDefaultOpticalTable()
  const tableSurface = config.table
  const table = {
    ...tableBase,
    label: tableSurface?.label ?? tableBase.label,
    widthMm: tableSurface?.physicalWidthMm ?? tableBase.widthMm,
    heightMm: tableSurface?.physicalHeightMm ?? tableBase.heightMm,
  }

  return {
    kind: 'optical-table',
    table,
    breadboards: config.breadboards.map((surface, index) => {
      const breadboardModel = createBreadboardModelFromSurface(surface)
      const centerMm = {
        x:
          surface.boundsUnits.x -
          (tableSurface?.boundsUnits.x ?? 0) +
          surface.boundsUnits.width / 2,
        y:
          surface.boundsUnits.y -
          (tableSurface?.boundsUnits.y ?? 0) +
          surface.boundsUnits.height / 2,
      }

      return createBreadboardInstance({
        anchorMm: getBreadboardAnchorForCenterMm(breadboardModel, centerMm),
        id: surface.id || `breadboard-${index + 1}`,
        label: surface.label,
        model: breadboardModel,
      })
    }),
  }
}

export function createEmptyImportAnalysis(
  workspaceDetection: SvgImportWorkspaceDetection,
): SvgImportAnalysis {
  return {
    ambiguous: [],
    annotationSegments: [],
    recognized: [],
    reviewItems: [],
    warnings: [],
    workspaceDetection,
  }
}

function createDraftBaseScene(config: SvgImportWorkspaceConfig): SceneDocument {
  return {
    annotations: [],
    beamSettings: getDefaultBeamSettings(),
    components: [],
    kind: SCENE_DOCUMENT_KIND,
    metadata: {
      name: 'Import Preview',
    },
    version: SCENE_DOCUMENT_VERSION,
    workspace: createWorkspaceFromImportConfig(config),
  }
}

function createSurfaceOnlyImportShim(document: ImportPreviewDocument): SvgImportDocument {
  if (document.sourceKind === 'svg') {
    return document
  }

  return {
    bounds: document.bounds,
    elements: [],
    scale: document.scale,
    sourceKind: 'svg',
    svgText: '<svg />',
  }
}

function normalizePreviewItemForDigest(item: ImportPreviewItem) {
  return {
    allowKeepAsLinework: item.allowKeepAsLinework,
    bounds: item.bounds,
    center: item.center,
    componentType: item.componentType ?? null,
    disposition: item.disposition,
    id: item.id,
    isStrongMatch: item.isStrongMatch,
    kind: item.kind,
    rotationQuarterTurns: item.rotationQuarterTurns,
    sourceElementIds: item.sourceElementIds,
    sourceKind: item.sourceKind,
    variantId: item.variantId ?? null,
  }
}

export function getImportSessionDigest(args: {
  appendBreadboardCenterMm?: Vector2Mm
  previewItems: ImportPreviewItem[]
  workspaceConfig: SvgImportWorkspaceConfig
}) {
  return JSON.stringify({
    appendBreadboardCenterMm: args.appendBreadboardCenterMm ?? null,
    previewItems: args.previewItems.map((item) => normalizePreviewItemForDigest(item)),
    workspaceConfig: cloneWorkspaceConfig(args.workspaceConfig),
  })
}

export function isImportSessionDirty(args: {
  baseline: {
    appendBreadboardCenterMm?: Vector2Mm
    mode: SvgImportMode
    previewItems: ImportPreviewItem[]
    workspaceConfig: SvgImportWorkspaceConfig
  }
  current: {
    appendBreadboardCenterMm?: Vector2Mm
    mode: SvgImportMode
    previewItems: ImportPreviewItem[]
    workspaceConfig: SvgImportWorkspaceConfig
  }
}) {
  return (
    getImportSessionDigest({
      appendBreadboardCenterMm: args.current.appendBreadboardCenterMm,
      previewItems: args.current.previewItems,
      workspaceConfig: args.current.workspaceConfig,
    }) !==
    getImportSessionDigest({
      appendBreadboardCenterMm: args.baseline.appendBreadboardCenterMm,
      previewItems: args.baseline.previewItems,
      workspaceConfig: args.baseline.workspaceConfig,
    })
  )
}

export function buildImportDraftScene(args: {
  analysis: SvgImportAnalysis
  appendBreadboardCenterMm?: Vector2Mm
  document: ImportPreviewDocument
  hostSurfaceId?: string
  millimetersPerUnit: number
  mode: SvgImportMode
  previewItems: ImportPreviewItem[]
  workspaceConfig: SvgImportWorkspaceConfig
}): {
  componentBindings: ImportDraftComponentBinding[]
  scene: SceneDocument
} {
  const document =
    args.document.sourceKind === 'svg'
      ? args.document
      : createSurfaceOnlyImportShim(args.document)

  const result = applySvgImportToScene({
    analysis: args.analysis,
    appendBreadboardCenterMm: args.appendBreadboardCenterMm,
    document,
    hostSurfaceId: args.hostSurfaceId,
    millimetersPerUnit: args.millimetersPerUnit,
    mode: args.mode,
    previewItems: args.previewItems,
    scene: createDraftBaseScene(args.workspaceConfig),
    workspaceConfig: args.workspaceConfig,
  })

  const componentPreviewItems = args.previewItems.filter(
    (item) => item.disposition === 'component',
  )

  return {
    componentBindings: result.scene.components.map<ImportDraftComponentBinding>(
      (component, index) => ({
        component,
        componentId: component.id,
        previewItemId: componentPreviewItems[index]?.id ?? component.id,
        previewItemIndex: index,
      }),
    ),
    scene: result.scene,
  }
}

export function updatePreviewItemFromWorldDelta(args: {
  millimetersPerUnit: number
  previewItem: ImportPreviewItem
  worldDeltaMm: Vector2Mm
}) {
  if (!Number.isFinite(args.millimetersPerUnit) || args.millimetersPerUnit <= 0) {
    return args.previewItem
  }

  const sourceDelta = {
    x: args.worldDeltaMm.x / args.millimetersPerUnit,
    y: args.worldDeltaMm.y / args.millimetersPerUnit,
  }
  const nextCenter = {
    x: args.previewItem.center.x + sourceDelta.x,
    y: args.previewItem.center.y + sourceDelta.y,
  }

  return {
    ...args.previewItem,
    bounds: {
      ...args.previewItem.bounds,
      x: nextCenter.x - args.previewItem.bounds.width / 2,
      y: nextCenter.y - args.previewItem.bounds.height / 2,
    },
    center: nextCenter,
  }
}

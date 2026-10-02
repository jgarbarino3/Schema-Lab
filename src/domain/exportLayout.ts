import { createViewportForBounds } from './geometry'
import { inspectSceneComponentPlacement } from './placement'
import type { BoundsMm, CanvasSizePx, SceneDocument, ViewportState } from './types'
import {
  getBreadboardInstance,
  getBreadboardInstances,
  getBreadboardWorldBoundsMm,
  getSingleBreadboard,
  getWorkspacePrimaryBreadboard,
  getWorkspaceWorldBoundsMm,
} from './workspace'

export type ExportScope = 'breadboard-only' | 'full-scheme'
export type ExportFormat = 'png' | 'pdf' | 'svg' | 'dxf' | 'pptx'
export type VectorExportFormat = 'svg' | 'dxf'
export type SvgExportPreset = 'engineering' | 'presentation'
export type ExportView = 'current' | 'top-down' | 'angled'
export type ResolvedExportView = Exclude<ExportView, 'current'>

export interface SceneExportOptions {
  format: ExportFormat
  scope: ExportScope
  svgPreset?: SvgExportPreset
  view?: ExportView
}

const BOARD_TITLE_MARGIN_MM = 18
const EXPORT_PADDING_MM = 10

function unionBounds(boundsA: BoundsMm, boundsB: BoundsMm): BoundsMm {
  const minX = Math.min(boundsA.x, boundsB.x)
  const minY = Math.min(boundsA.y, boundsB.y)
  const maxX = Math.max(boundsA.x + boundsA.width, boundsB.x + boundsB.width)
  const maxY = Math.max(boundsA.y + boundsA.height, boundsB.y + boundsB.height)

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function expandBounds(bounds: BoundsMm, paddingMm: number): BoundsMm {
  return {
    x: bounds.x - paddingMm,
    y: bounds.y - paddingMm,
    width: bounds.width + paddingMm * 2,
    height: bounds.height + paddingMm * 2,
  }
}

export function getExportWorldBoundsMm(
  scene: SceneDocument,
  scope: ExportScope,
  breadboardSurfaceId?: string,
): BoundsMm {
  const breadboard = getWorkspacePrimaryBreadboard(scene)
  const breadboardInstances = getBreadboardInstances(scene)
  const exportBreadboardInstance =
    scene.workspace.kind === 'optical-table'
      ? getBreadboardInstance(scene, breadboardSurfaceId) ?? breadboardInstances[0]
      : undefined
  const primaryBreadboardBounds =
    scene.workspace.kind === 'single-breadboard'
      ? {
          x: 0,
          y: -BOARD_TITLE_MARGIN_MM,
          width: breadboard.widthMm,
          height: breadboard.heightMm + BOARD_TITLE_MARGIN_MM,
        }
      : exportBreadboardInstance
        ? (() => {
            const bounds = getBreadboardWorldBoundsMm(
              exportBreadboardInstance.model,
              exportBreadboardInstance.anchorMm,
              exportBreadboardInstance.rotationQuarterTurns,
            )

            return {
              x: bounds.x,
              y: bounds.y - BOARD_TITLE_MARGIN_MM,
              width: bounds.width,
              height: bounds.height + BOARD_TITLE_MARGIN_MM,
            }
          })()
        : {
            x: 0,
            y: -BOARD_TITLE_MARGIN_MM,
            width: breadboard.widthMm,
            height: breadboard.heightMm + BOARD_TITLE_MARGIN_MM,
          }

  if (scope === 'breadboard-only') {
    return expandBounds(primaryBreadboardBounds, EXPORT_PADDING_MM)
  }

  let schemeBounds = expandBounds(getWorkspaceWorldBoundsMm(scene), 0)

  if (!getSingleBreadboard(scene)) {
    schemeBounds = unionBounds(schemeBounds, primaryBreadboardBounds)
  }

  for (const component of scene.components) {
    const placement = inspectSceneComponentPlacement(scene, component)
    schemeBounds = unionBounds(schemeBounds, placement.supportBoundsMm)
    schemeBounds = unionBounds(schemeBounds, placement.footprintBoundsMm)
  }

  return expandBounds(schemeBounds, EXPORT_PADDING_MM)
}

export function createExportViewport(
  scene: SceneDocument,
  scope: ExportScope,
  canvasSizePx: CanvasSizePx,
  breadboardSurfaceId?: string,
): ViewportState {
  return createViewportForBounds(
    getExportWorldBoundsMm(scene, scope, breadboardSurfaceId),
    canvasSizePx,
    80,
  )
}

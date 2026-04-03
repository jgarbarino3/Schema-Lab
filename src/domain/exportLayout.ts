import { createViewportForBounds } from './geometry'
import { inspectComponentPlacement } from './placement'
import { getSourceLaneBoundsMm } from './placement'
import type { BoundsMm, CanvasSizePx, SceneDocument, ViewportState } from './types'

export type ExportScope = 'breadboard-only' | 'full-scheme'

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
): BoundsMm {
  const { breadboard } = scene
  const boardBounds: BoundsMm = {
    x: 0,
    y: -BOARD_TITLE_MARGIN_MM,
    width: breadboard.widthMm,
    height: breadboard.heightMm + BOARD_TITLE_MARGIN_MM,
  }

  if (scope === 'breadboard-only') {
    return expandBounds(boardBounds, EXPORT_PADDING_MM)
  }

  const lanes = [
    getSourceLaneBoundsMm(breadboard, 'left'),
    getSourceLaneBoundsMm(breadboard, 'right'),
    getSourceLaneBoundsMm(breadboard, 'top'),
    getSourceLaneBoundsMm(breadboard, 'bottom'),
  ]
  let schemeBounds = lanes.reduce(unionBounds, boardBounds)

  for (const component of scene.components) {
    const placement = inspectComponentPlacement(breadboard, component)
    schemeBounds = unionBounds(schemeBounds, placement.supportBoundsMm)
    schemeBounds = unionBounds(schemeBounds, placement.footprintBoundsMm)
  }

  return expandBounds(schemeBounds, EXPORT_PADDING_MM)
}

export function createExportViewport(
  scene: SceneDocument,
  scope: ExportScope,
  canvasSizePx: CanvasSizePx,
): ViewportState {
  return createViewportForBounds(
    getExportWorldBoundsMm(scene, scope),
    canvasSizePx,
    80,
  )
}

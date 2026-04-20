import { describe, expect, it } from 'vitest'
import {
  createBreadboardInstance,
  createDefaultOpticalTable,
} from '../domain/workspace'
import type { SceneDocument, ViewportState } from '../domain/types'
import {
  OPTICAL_TABLE_SURFACE_ID,
  SCENE_DOCUMENT_KIND,
  SCENE_DOCUMENT_VERSION,
} from '../domain/types'
import {
  getProjectedBoundsAabb,
  getProjectedSortBottomPx,
  projectScreenPointToWorld,
  projectWorldPointToScreen,
  resolveProjectedScreenPointToWorld,
  shouldUseProjectedTableView,
} from '../canvas/renderers/tableViewProjection'

const viewport: ViewportState = {
  zoomPxPerMm: 1,
  cameraCenterMm: { x: 900, y: 500 },
  canvasSizePx: { width: 1400, height: 900 },
}

function createOpticalTableScene(): SceneDocument {
  const breadboard = createBreadboardInstance({
    anchorMm: { x: 220, y: 140 },
    id: 'board-1',
    label: 'Board 1',
    model: {
      label: 'Board 1',
      widthMm: 425,
      heightMm: 350,
      holeSpacingMm: 25,
      edgeMarginMm: 25,
      thicknessMm: 25,
      finish: 'black-anodized',
      holeDensity: 'single',
      counterborePattern: 'corner-25mm',
    },
  })

  return {
    kind: SCENE_DOCUMENT_KIND,
    version: SCENE_DOCUMENT_VERSION,
    metadata: { name: 'Projection Test' },
    workspace: {
      kind: 'optical-table',
      table: createDefaultOpticalTable(),
      breadboards: [breadboard],
    },
    beamSettings: {
      beamFidelityMode: 'angle-sensitive',
      defaultBeamDiameterMm: 2,
      defaultDivergenceMrad: 1,
      sharedBeamHeightMm: 25,
    },
    components: [],
    annotations: [],
  }
}

describe('table view projection', () => {
  it('round-trips projected screen coordinates on a fixed elevation plane', () => {
    const pointMm = { x: 360, y: 240 }
    const elevationMm = 25
    const screenPointPx = projectWorldPointToScreen(pointMm, viewport, elevationMm)

    expect(projectScreenPointToWorld(screenPointPx, viewport, elevationMm)).toEqual(pointMm)
  })

  it('resolves breadboard-plane pointers back to the raised surface before the table plane', () => {
    const scene = createOpticalTableScene()
    const breadboard = scene.workspace.kind === 'optical-table'
      ? scene.workspace.breadboards[0]
      : undefined

    expect(breadboard).toBeDefined()

    const breadboardPointMm = {
      x: breadboard!.anchorMm.x + 120,
      y: breadboard!.anchorMm.y + 90,
    }
    const screenPointPx = projectWorldPointToScreen(
      breadboardPointMm,
      viewport,
      breadboard!.mountPlaneOffsetMm,
    )
    const resolved = resolveProjectedScreenPointToWorld(scene, viewport, screenPointPx)

    expect(resolved.surfaceId).toBe(breadboard!.id)
    expect(resolved.worldPointMm).toEqual(breadboardPointMm)
  })

  it('honors a preferred surface when projected screen points overlap elevated hosts', () => {
    const scene = createOpticalTableScene()
    const breadboard = scene.workspace.kind === 'optical-table'
      ? scene.workspace.breadboards[0]
      : undefined

    expect(breadboard).toBeDefined()

    const overlappedTablePointMm = {
      x: breadboard!.anchorMm.x + 120,
      y: breadboard!.anchorMm.y + 90,
    }
    const screenPointPx = projectWorldPointToScreen(overlappedTablePointMm, viewport, 0)
    const resolved = resolveProjectedScreenPointToWorld(scene, viewport, screenPointPx, {
      preferredElevationMm: 0,
      preferredSurfaceId: OPTICAL_TABLE_SURFACE_ID,
    })

    expect(resolved.surfaceId).toBe(OPTICAL_TABLE_SURFACE_ID)
    expect(resolved.worldPointMm).toEqual(overlappedTablePointMm)
  })

  it('expands projected bounds downward when an elevated surface is lifted toward the viewer', () => {
    const flatBoundsPx = getProjectedBoundsAabb(
      { x: 100, y: 100, width: 200, height: 140 },
      viewport,
      0,
    )
    const raisedBoundsPx = getProjectedBoundsAabb(
      { x: 100, y: 100, width: 200, height: 140 },
      viewport,
      25,
    )

    expect(raisedBoundsPx.y).toBeLessThan(flatBoundsPx.y)
    expect(raisedBoundsPx.height).toBeCloseTo(flatBoundsPx.height, 5)
  })

  it('sorts lower projected support bounds later on screen', () => {
    const backBottomPx = getProjectedSortBottomPx(
      { x: 200, y: 120, width: 60, height: 60 },
      viewport,
      0,
    )
    const frontBottomPx = getProjectedSortBottomPx(
      { x: 200, y: 320, width: 60, height: 60 },
      viewport,
      0,
    )

    expect(frontBottomPx).toBeGreaterThan(backBottomPx)
  })

  it('only enables the projected path for realistic optical-table table view', () => {
    const scene = createOpticalTableScene()

    expect(shouldUseProjectedTableView(scene, 'realistic', 'table-view')).toBe(true)
    expect(shouldUseProjectedTableView(scene, 'simple', 'table-view')).toBe(false)
    expect(shouldUseProjectedTableView(scene, 'realistic', 'board-focus')).toBe(false)
    expect(
      shouldUseProjectedTableView(
        {
          ...scene,
          workspace: {
            kind: 'single-breadboard',
            breadboard: {
              label: 'Board',
              widthMm: 300,
              heightMm: 300,
              holeSpacingMm: 25,
              edgeMarginMm: 25,
              thicknessMm: 12.7,
              finish: 'black-anodized',
              holeDensity: 'single',
              counterborePattern: 'corner-25mm',
            },
          },
        },
        'realistic',
        'table-view',
      ),
    ).toBe(false)
  })
})

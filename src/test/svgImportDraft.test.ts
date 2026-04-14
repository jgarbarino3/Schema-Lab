import { describe, expect, it } from 'vitest'
import type {
  BoundsMm,
  Vector2Mm,
} from '../domain/types'
import type {
  ImportPreviewDocument,
  ImportPreviewItem,
  SvgImportAnalysis,
  SvgImportWorkspaceConfig,
} from '../domain/svgImport'
import {
  buildImportDraftScene,
  isImportSessionDirty,
  updatePreviewItemFromWorldDelta,
} from '../ui/importPreviewSession'

function makeAnalysis(workspaceKind: SvgImportAnalysis['workspaceDetection']['workspaceKind'] = 'single-breadboard'): SvgImportAnalysis {
  return {
    ambiguous: [],
    annotationSegments: [],
    recognized: [],
    reviewItems: [],
    warnings: [],
    workspaceDetection: {
      breadboardCandidates: [],
      orphanElementIds: [],
      warnings: [],
      workspaceKind,
    },
  }
}

function makeSvgDocument(): ImportPreviewDocument {
  return {
    bounds: { x: 0, y: 0, width: 120, height: 60 },
    elements: [],
    scale: {
      baseMmPerUnit: 1,
      isReliable: true,
      sourceUnit: 'mm',
    },
    sourceKind: 'svg',
    svgText: '<svg />',
  }
}

function makeRasterDocument(): ImportPreviewDocument {
  return {
    bounds: { x: 0, y: 0, width: 120, height: 60 },
    imageDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
    imageHeightPx: 1,
    imageWidthPx: 1,
    scale: {
      baseMmPerUnit: 1,
      isReliable: false,
      sourceUnit: 'px',
    },
    sourceKind: 'raster',
  }
}

function makeWorkspaceConfig(): SvgImportWorkspaceConfig {
  return {
    workspaceKind: 'single-breadboard',
    breadboards: [
      {
        boundsUnits: { x: 0, y: 0, width: 120, height: 60 },
        id: 'breadboard-1',
        kind: 'breadboard',
        label: 'Breadboard',
        physicalHeightMm: 300,
        physicalWidthMm: 600,
      },
    ],
  }
}

function makePreviewItem(overrides: Partial<ImportPreviewItem> = {}): ImportPreviewItem {
  return {
    allowKeepAsLinework: false,
    bounds: { x: 8, y: 8, width: 12, height: 12 },
    center: { x: 14, y: 14 },
    componentType: 'mirror',
    disposition: 'component',
    editability: {
      canMove: true,
      canReassign: true,
      canRotate: true,
    },
    id: 'preview-1',
    isStrongMatch: true,
    kind: 'recognized-component',
    label: 'Mirror',
    rotationQuarterTurns: 0,
    sourceElementIds: [],
    sourceKind: 'svg',
    suggestions: [
      {
        componentType: 'mirror',
        confidence: 1,
        reason: 'test',
        source: 'heuristic',
      },
    ],
    ...overrides,
  }
}

function expectBoundsToShift(
  bounds: BoundsMm,
  center: Vector2Mm,
  next: ImportPreviewItem,
) {
  expect(next.center).toEqual(center)
  expect(next.bounds.x).toBeCloseTo(bounds.x)
  expect(next.bounds.y).toBeCloseTo(bounds.y)
  expect(next.bounds.width).toBe(bounds.width)
  expect(next.bounds.height).toBe(bounds.height)
}

describe('import preview session helpers', () => {
  it('keeps dirty false for preview-mode toggles and true for semantic edits', () => {
    const session = {
      appendBreadboardCenterMm: { x: 30, y: 20 },
      baselineAppendBreadboardCenterMm: { x: 30, y: 20 },
      baselinePreviewItems: [makePreviewItem()],
      baselineWorkspaceConfig: makeWorkspaceConfig(),
      workingAppendBreadboardCenterMm: { x: 30, y: 20 },
      workingPreviewItems: [makePreviewItem()],
      workingWorkspaceConfig: makeWorkspaceConfig(),
    }

    expect(
      isImportSessionDirty({
        baseline: {
          appendBreadboardCenterMm: session.baselineAppendBreadboardCenterMm,
          mode: 'replace',
          previewItems: session.baselinePreviewItems,
          workspaceConfig: session.baselineWorkspaceConfig,
        },
        current: {
          appendBreadboardCenterMm: session.workingAppendBreadboardCenterMm,
          mode: 'replace',
          previewItems: session.workingPreviewItems,
          workspaceConfig: session.workingWorkspaceConfig,
        },
      }),
    ).toBe(false)

    expect(
      isImportSessionDirty({
        baseline: {
          appendBreadboardCenterMm: session.baselineAppendBreadboardCenterMm,
          mode: 'replace',
          previewItems: session.baselinePreviewItems,
          workspaceConfig: session.baselineWorkspaceConfig,
        },
        current: {
          appendBreadboardCenterMm: session.workingAppendBreadboardCenterMm,
          mode: 'replace',
          previewItems: session.workingPreviewItems,
          workspaceConfig: session.workingWorkspaceConfig,
        },
      }),
    ).toBe(false)

    session.workingPreviewItems[0] = {
      ...session.workingPreviewItems[0],
      rotationQuarterTurns: 1,
    }

    expect(
      isImportSessionDirty({
        baseline: {
          appendBreadboardCenterMm: session.baselineAppendBreadboardCenterMm,
          mode: 'replace',
          previewItems: session.baselinePreviewItems,
          workspaceConfig: session.baselineWorkspaceConfig,
        },
        current: {
          appendBreadboardCenterMm: session.workingAppendBreadboardCenterMm,
          mode: 'replace',
          previewItems: session.workingPreviewItems,
          workspaceConfig: session.workingWorkspaceConfig,
        },
      }),
    ).toBe(true)
  })

  it('keeps component bindings stable while preview items change position and rotation', () => {
    const previewItem = makePreviewItem()
    const first = buildImportDraftScene({
      analysis: makeAnalysis(),
      appendBreadboardCenterMm: { x: 60, y: 30 },
      document: makeSvgDocument(),
      millimetersPerUnit: 1,
      mode: 'replace',
      previewItems: [previewItem],
      workspaceConfig: makeWorkspaceConfig(),
    })

    expect(first.scene.components).toHaveLength(1)
    expect(first.componentBindings).toHaveLength(1)
    expect(first.componentBindings[0]?.previewItemId).toBe('preview-1')

    const shifted = buildImportDraftScene({
      analysis: makeAnalysis(),
      appendBreadboardCenterMm: { x: 60, y: 30 },
      document: makeSvgDocument(),
      millimetersPerUnit: 1,
      mode: 'replace',
      previewItems: [
        makePreviewItem({
          bounds: { x: 36, y: 16, width: 12, height: 12 },
          center: { x: 42, y: 22 },
          rotationQuarterTurns: 1,
        }),
      ],
      workspaceConfig: makeWorkspaceConfig(),
    })

    expect(shifted.scene.components).toHaveLength(1)
    expect(shifted.componentBindings[0]?.componentId).toBe(first.componentBindings[0]?.componentId)
    expect(shifted.scene.components[0]?.rotationQuarterTurns).toBe(1)
    expect(shifted.scene.components[0]?.anchorMm.x).toBeGreaterThan(
      first.scene.components[0]?.anchorMm.x ?? 0,
    )
  })

  it('builds a raster shim scene for live board preview without throwing', () => {
    const result = buildImportDraftScene({
      analysis: makeAnalysis('single-breadboard'),
      appendBreadboardCenterMm: { x: 60, y: 30 },
      document: makeRasterDocument(),
      millimetersPerUnit: 1,
      mode: 'replace',
      previewItems: [makePreviewItem()],
      workspaceConfig: makeWorkspaceConfig(),
    })

    expect(result.scene.workspace.kind).toBe('single-breadboard')
    expect(result.scene.components).toHaveLength(1)
    expect(result.componentBindings[0]?.previewItemId).toBe('preview-1')
  })

  it('shifts preview items in world space during live-board drag', () => {
    const initial = makePreviewItem()
    const next = updatePreviewItemFromWorldDelta({
      millimetersPerUnit: 2,
      previewItem: initial,
      worldDeltaMm: { x: 6, y: -4 },
    })

    expectBoundsToShift(
      { x: 11, y: 6, width: 12, height: 12 },
      { x: 17, y: 12 },
      next,
    )
  })
})

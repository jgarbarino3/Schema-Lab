import { DOMParser as XmldomParser } from '@xmldom/xmldom'
import { describe, expect, it } from 'vitest'
import { createFreshSingleBreadboardWorkspace } from '../domain/workspace'
import {
  analyzeSvgImportDocument,
  applySvgImportToScene,
  createImportPreviewItemsFromSvgAnalysis,
  createInitialSvgImportWorkspaceConfig,
  detectSvgImportWorkspace,
  parseSvgImportDocument,
  type SvgImportDocument,
  type SvgImportElement,
  type SvgImportElementSegment,
} from '../domain/svgImport'
import { SCENE_DOCUMENT_KIND, SCENE_DOCUMENT_VERSION, type SceneDocument } from '../domain/types'

if (typeof DOMParser === 'undefined') {
  ;(globalThis as typeof globalThis & { DOMParser: typeof XmldomParser }).DOMParser =
    XmldomParser as unknown as typeof DOMParser
}

function buildSegments(points: SvgImportElement['points']): SvgImportElementSegment[] {
  const segments: SvgImportElementSegment[] = []

  for (let index = 1; index < points.length; index += 1) {
    segments.push({
      end: points[index],
      polylineIndex: 0,
      start: points[index - 1],
    })
  }

  return segments
}

function makeElement(overrides: Partial<SvgImportElement>): SvgImportElement {
  const points = overrides.points ?? [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
    { x: 0, y: 0 },
  ]
  const polylines = overrides.polylines ?? [points]
  const segments = overrides.segments ?? polylines.flatMap((polyline, polylineIndex) =>
    polyline.slice(1).map((point, index) => ({
      end: point,
      polylineIndex,
      start: polyline[index],
    })),
  )

  return {
    id: overrides.id ?? 'element-1',
    kind: overrides.kind ?? 'rect',
    isClosed: overrides.isClosed ?? true,
    bounds: overrides.bounds ?? { x: 0, y: 0, width: 10, height: 10 },
    center: overrides.center ?? { x: 5, y: 5 },
    hints: overrides.hints ?? [],
    polylines,
    points,
    rotationDeg: overrides.rotationDeg ?? 0,
    segments,
    stroke: overrides.stroke,
    strokeWidth: overrides.strokeWidth,
  }
}

function makeDocument(elements: SvgImportElement[]): SvgImportDocument {
  return {
    svgText: '<svg />',
    elements,
    bounds: { x: 0, y: 0, width: 120, height: 60 },
    scale: {
      baseMmPerUnit: 1,
      isReliable: true,
      sourceUnit: 'mm',
    },
    sourceKind: 'svg',
  }
}

function makeScene(): SceneDocument {
  return {
    kind: SCENE_DOCUMENT_KIND,
    version: SCENE_DOCUMENT_VERSION,
    metadata: {
      name: 'SVG Import Test Scene',
    },
    workspace: createFreshSingleBreadboardWorkspace(),
    beamSettings: {
      beamFidelityMode: 'geometric',
      sharedBeamHeightMm: 75,
      defaultBeamDiameterMm: 2.5,
      defaultDivergenceMrad: 1.2,
    },
    components: [],
    annotations: [],
  }
}

describe('svg import analysis', () => {
  it('uses deterministic label hints in strict mode', () => {
    const document = makeDocument([
      makeElement({
        id: 'mirror-shape',
        hints: ['Mirror M1'],
      }),
      makeElement({
        id: 'unknown-circle',
        kind: 'circle',
        hints: [],
        isClosed: true,
      }),
    ])

    const analysis = analyzeSvgImportDocument({
      document,
      millimetersPerUnit: 1,
      profile: 'strict',
    })

    expect(analysis.recognized).toHaveLength(1)
    expect(analysis.recognized[0].suggestion.componentType).toBe('mirror')
    expect(analysis.reviewItems.length).toBeGreaterThanOrEqual(1)
  })

  it('attaches nearby SVG text labels to component hints before analysis', () => {
    const document = parseSvgImportDocument(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 120">
        <circle id="iris-shape" cx="64" cy="58" r="10" stroke="#66e4ff" fill="none" />
        <text x="92" y="62">Iris 1</text>
      </svg>
    `)

    const analysis = analyzeSvgImportDocument({
      document,
      millimetersPerUnit: 1,
      profile: 'guided',
    })

    expect(
      analysis.recognized.some(
        (recognized) =>
          recognized.elementId === 'iris-shape' &&
          recognized.suggestion.componentType === 'iris',
      ),
    ).toBe(true)
  })

  it('builds import scene with exact variant manual review resolutions', () => {
    const scene = makeScene()
    const document = makeDocument([
      makeElement({
        id: 'beam-splitter-shape',
        hints: ['Beam splitter'],
      }),
      makeElement({
        id: 'unknown-filter-shape',
        kind: 'rect',
        hints: [],
        isClosed: true,
        bounds: { x: 40, y: 20, width: 24, height: 8 },
        center: { x: 52, y: 24 },
        points: [
          { x: 40, y: 20 },
          { x: 64, y: 20 },
          { x: 64, y: 28 },
          { x: 40, y: 28 },
          { x: 40, y: 20 },
        ],
      }),
      makeElement({
        id: 'beam-line',
        kind: 'line',
        isClosed: false,
        hints: [],
        points: [
          { x: 12, y: 42 },
          { x: 90, y: 42 },
        ],
        polylines: [[
          { x: 12, y: 42 },
          { x: 90, y: 42 },
        ]],
        bounds: { x: 12, y: 42, width: 78, height: 0 },
        center: { x: 51, y: 42 },
        segments: buildSegments([
          { x: 12, y: 42 },
          { x: 90, y: 42 },
        ]),
      }),
    ])

    const analysis = analyzeSvgImportDocument({
      document,
      millimetersPerUnit: 1,
      profile: 'guided',
    })
    const reviewItem = analysis.reviewItems.find((item) => item.elementId === 'unknown-filter-shape')

    expect(reviewItem).toBeDefined()

    const result = applySvgImportToScene({
      analysis,
      document,
      millimetersPerUnit: 1,
      mode: 'merge',
      scene,
      manualResolutions: [
        {
          componentType: 'filter',
          disposition: 'component',
          elementId: 'unknown-filter-shape',
          reviewItemId: reviewItem!.id,
          variantId: 'fesh0600',
        },
      ],
    })

    expect(result.importedComponents).toBeGreaterThanOrEqual(2)
    expect(result.scene.components.some((component) => component.variantId === 'fesh0600')).toBe(true)
    expect(result.scene.components.map((component) => component.label)).toEqual(
      expect.arrayContaining(['BS1', 'F1']),
    )
    expect(result.scene.annotations.length).toBeGreaterThanOrEqual(1)
  })

  it('imports preview-edited component positions directly from preview items', () => {
    const scene = makeScene()
    const document = makeDocument([
      makeElement({
        id: 'mirror-preview',
        kind: 'line',
        isClosed: false,
        hints: ['mirror'],
        points: [
          { x: 20, y: 20 },
          { x: 32, y: 32 },
        ],
        polylines: [[
          { x: 20, y: 20 },
          { x: 32, y: 32 },
        ]],
        bounds: { x: 20, y: 20, width: 12, height: 12 },
        center: { x: 26, y: 26 },
        rotationDeg: 0,
        segments: buildSegments([
          { x: 20, y: 20 },
          { x: 32, y: 32 },
        ]),
      }),
    ])
    const analysis = analyzeSvgImportDocument({
      document,
      millimetersPerUnit: 1,
      profile: 'guided',
    })
    const baseline = applySvgImportToScene({
      analysis,
      document,
      millimetersPerUnit: 1,
      mode: 'merge',
      scene: makeScene(),
    })

    const result = applySvgImportToScene({
      analysis,
      document,
      millimetersPerUnit: 1,
      mode: 'merge',
      previewItems: [
        {
          allowKeepAsLinework: false,
          bounds: { x: 44, y: 19, width: 12, height: 12 },
          center: { x: 50, y: 25 },
          componentType: 'mirror',
          disposition: 'component',
          editability: {
            canMove: true,
            canReassign: true,
            canRotate: true,
          },
          elementId: 'mirror-preview',
          id: 'recognized-mirror-preview',
          isStrongMatch: true,
          kind: 'recognized-component',
          label: 'Mirror',
          rotationQuarterTurns: 1,
          sourceElementIds: ['mirror-preview'],
          sourceKind: 'svg',
          suggestions: [
            {
              componentType: 'mirror',
              confidence: 0.96,
              reason: 'Preview override test.',
              source: 'heuristic',
            },
          ],
        },
      ],
      scene,
    })

    expect(result.importedComponents).toBe(1)
    expect(result.scene.components).toHaveLength(1)
    expect(result.scene.components[0].anchorMm.x).toBeGreaterThan(
      baseline.scene.components[0].anchorMm.x,
    )
    expect(result.scene.components[0].rotationQuarterTurns).toBe(1)
    expect(result.scene.components[0].label).toBe('M1')
  })

  it('imports raster-style assigned preview candidates without source SVG elements', () => {
    const scene = makeScene()
    const document = makeDocument([])

    const result = applySvgImportToScene({
      analysis: {
        ambiguous: [],
        annotationSegments: [],
        recognized: [],
        reviewItems: [],
        warnings: [],
        workspaceDetection: detectSvgImportWorkspace(document),
      },
      document,
      millimetersPerUnit: 1,
      mode: 'merge',
      previewItems: [
        {
          allowKeepAsLinework: false,
          bounds: { x: 18, y: 34, width: 10, height: 10 },
          center: { x: 23, y: 39 },
          componentType: 'iris',
          disposition: 'component',
          editability: {
            canMove: true,
            canReassign: true,
            canRotate: true,
          },
          id: 'raster-candidate-1',
          isStrongMatch: false,
          kind: 'raster-candidate',
          label: 'Candidate 1',
          rotationQuarterTurns: 0,
          sourceElementIds: [],
          sourceKind: 'raster',
          suggestions: [],
        },
        {
          allowKeepAsLinework: false,
          bounds: { x: 82, y: 34, width: 10, height: 10 },
          center: { x: 87, y: 39 },
          componentType: 'iris',
          disposition: 'component',
          editability: {
            canMove: true,
            canReassign: true,
            canRotate: true,
          },
          id: 'raster-candidate-2',
          isStrongMatch: false,
          kind: 'raster-candidate',
          label: 'Candidate 2',
          rotationQuarterTurns: 0,
          sourceElementIds: [],
          sourceKind: 'raster',
          suggestions: [],
        },
      ],
      scene,
    })

    expect(result.importedComponents).toBe(2)
    expect(result.scene.components).toHaveLength(2)
    expect(result.scene.components.every((component) => component.type === 'iris')).toBe(true)
    expect(result.scene.components[1].anchorMm.x).toBeGreaterThan(result.scene.components[0].anchorMm.x)
  })

  it('warns when rotation is snapped to quarter-turns', () => {
    const scene = makeScene()
    const tiltedPoints = [
      { x: 10, y: 10 },
      { x: 30, y: 20 },
    ]
    const document = makeDocument([
      makeElement({
        id: 'tilted-mirror',
        kind: 'line',
        isClosed: false,
        hints: ['mirror'],
        rotationDeg: 31,
        points: tiltedPoints,
        polylines: [tiltedPoints],
        bounds: { x: 10, y: 10, width: 20, height: 10 },
        center: { x: 20, y: 15 },
        segments: buildSegments(tiltedPoints),
      }),
    ])

    const analysis = analyzeSvgImportDocument({
      document,
      millimetersPerUnit: 1,
      profile: 'strict',
    })
    const result = applySvgImportToScene({
      analysis,
      document,
      millimetersPerUnit: 1,
      mode: 'replace',
      scene,
    })

    expect(result.warnings.some((warning) => warning.includes('snapped'))).toBe(true)
  })

  it('treats long beam-like lines as annotation segments, not component review items', () => {
    const beamPoints = [
      { x: 10, y: 20 },
      { x: 100, y: 20 },
    ]
    const document = makeDocument([
      makeElement({
        id: 'beam-path-main',
        kind: 'line',
        isClosed: false,
        hints: ['beam path main'],
        points: beamPoints,
        polylines: [beamPoints],
        bounds: { x: 10, y: 20, width: 90, height: 0 },
        center: { x: 55, y: 20 },
        strokeWidth: 0.8,
        segments: buildSegments(beamPoints),
      }),
      makeElement({
        id: 'known-mirror',
        kind: 'line',
        isClosed: false,
        hints: ['mirror m1'],
        points: [
          { x: 32, y: 30 },
          { x: 44, y: 42 },
        ],
        polylines: [[
          { x: 32, y: 30 },
          { x: 44, y: 42 },
        ]],
        bounds: { x: 32, y: 30, width: 12, height: 12 },
        center: { x: 38, y: 36 },
        segments: buildSegments([
          { x: 32, y: 30 },
          { x: 44, y: 42 },
        ]),
      }),
    ])

    const analysis = analyzeSvgImportDocument({
      document,
      millimetersPerUnit: 1,
      profile: 'guided',
    })

    expect(analysis.reviewItems.find((item) => item.elementId === 'beam-path-main')).toBeUndefined()
    expect(analysis.annotationSegments.some((segment) => segment.elementId === 'beam-path-main')).toBe(
      true,
    )
  })

  it('prioritizes polarizer and waveplate suggestions for crossed circular symbols', () => {
    const document = makeDocument([
      makeElement({
        id: 'circular-optic',
        kind: 'circle',
        isClosed: true,
        hints: [],
        bounds: { x: 40, y: 20, width: 20, height: 20 },
        center: { x: 50, y: 30 },
      }),
      makeElement({
        id: 'cross-line',
        kind: 'line',
        isClosed: false,
        hints: [],
        points: [
          { x: 42, y: 22 },
          { x: 58, y: 38 },
        ],
        polylines: [[
          { x: 42, y: 22 },
          { x: 58, y: 38 },
        ]],
        bounds: { x: 42, y: 22, width: 16, height: 16 },
        center: { x: 50, y: 30 },
        strokeWidth: 1.2,
        segments: buildSegments([
          { x: 42, y: 22 },
          { x: 58, y: 38 },
        ]),
      }),
    ])

    const analysis = analyzeSvgImportDocument({
      document,
      millimetersPerUnit: 1,
      profile: 'strict',
    })
    const circularReview = analysis.reviewItems.find((item) => item.elementId === 'circular-optic')

    expect(circularReview).toBeDefined()
    expect(circularReview?.suggestions[0]?.componentType).toBe('polarizer')
    expect(circularReview?.suggestions.some((item) => item.componentType === 'waveplate')).toBe(
      true,
    )
  })

  it('does not fabricate bridge segments between separate open polylines', () => {
    const document = makeDocument([
      makeElement({
        id: 'split-beam-path',
        kind: 'path',
        isClosed: false,
        strokeWidth: 0.8,
        bounds: { x: 0, y: 10, width: 30, height: 0 },
        center: { x: 15, y: 10 },
        polylines: [
          [
            { x: 0, y: 10 },
            { x: 10, y: 10 },
          ],
          [
            { x: 20, y: 10 },
            { x: 30, y: 10 },
          ],
        ],
        points: [
          { x: 0, y: 10 },
          { x: 10, y: 10 },
          { x: 20, y: 10 },
          { x: 30, y: 10 },
        ],
        segments: [
          {
            start: { x: 0, y: 10 },
            end: { x: 10, y: 10 },
            polylineIndex: 0,
          },
          {
            start: { x: 20, y: 10 },
            end: { x: 30, y: 10 },
            polylineIndex: 1,
          },
        ],
      }),
    ])
    const analysis = analyzeSvgImportDocument({
      document,
      millimetersPerUnit: 1,
      profile: 'guided',
    })

    expect(analysis.annotationSegments).toHaveLength(2)
    expect(analysis.annotationSegments.every((segment) => Math.abs(segment.end.x - segment.start.x) === 10)).toBe(
      true,
    )
  })

  it('creates a missing-junction review item for near-connected beam turns', () => {
    const horizontal = [
      { x: 12, y: 30 },
      { x: 48, y: 30 },
    ]
    const vertical = [
      { x: 50, y: 32 },
      { x: 50, y: 64 },
    ]
    const document = makeDocument([
      makeElement({
        id: 'beam-a',
        kind: 'line',
        isClosed: false,
        hints: ['beam path'],
        points: horizontal,
        polylines: [horizontal],
        bounds: { x: 12, y: 30, width: 36, height: 0 },
        center: { x: 30, y: 30 },
        strokeWidth: 0.8,
        segments: buildSegments(horizontal),
      }),
      makeElement({
        id: 'beam-b',
        kind: 'line',
        isClosed: false,
        hints: [],
        points: vertical,
        polylines: [vertical],
        bounds: { x: 50, y: 32, width: 0, height: 32 },
        center: { x: 50, y: 48 },
        strokeWidth: 0.8,
        segments: buildSegments(vertical),
      }),
    ])

    const analysis = analyzeSvgImportDocument({
      document,
      millimetersPerUnit: 1,
      profile: 'guided',
    })

    expect(analysis.reviewItems.some((item) => item.kind === 'missing-junction')).toBe(true)
    expect(analysis.annotationSegments).toHaveLength(2)
  })

  it('detects multi-breadboard optical-table imports and applies the configured workspace', () => {
    const document = makeDocument([
      makeElement({
        id: 'table-outline',
        kind: 'rect',
        bounds: { x: 0, y: 0, width: 360, height: 180 },
        center: { x: 180, y: 90 },
        points: [
          { x: 0, y: 0 },
          { x: 360, y: 0 },
          { x: 360, y: 180 },
          { x: 0, y: 180 },
          { x: 0, y: 0 },
        ],
      }),
      makeElement({
        id: 'board-a',
        kind: 'rect',
        bounds: { x: 40, y: 40, width: 70, height: 70 },
        center: { x: 75, y: 75 },
        points: [
          { x: 40, y: 40 },
          { x: 110, y: 40 },
          { x: 110, y: 110 },
          { x: 40, y: 110 },
          { x: 40, y: 40 },
        ],
      }),
      makeElement({
        id: 'board-b',
        kind: 'rect',
        bounds: { x: 220, y: 50, width: 70, height: 70 },
        center: { x: 255, y: 85 },
        points: [
          { x: 220, y: 50 },
          { x: 290, y: 50 },
          { x: 290, y: 120 },
          { x: 220, y: 120 },
          { x: 220, y: 50 },
        ],
      }),
      makeElement({
        id: 'lens-on-board-a',
        kind: 'circle',
        hints: ['lens l1'],
        bounds: { x: 62, y: 68, width: 12, height: 12 },
        center: { x: 68, y: 74 },
      }),
    ])

    const detection = detectSvgImportWorkspace(document)
    const workspaceConfig = createInitialSvgImportWorkspaceConfig({
      detection,
      document,
    })
    const analysis = analyzeSvgImportDocument({
      document,
      millimetersPerUnit: 10,
      profile: 'strict',
      workspaceDetection: detection,
    })
    const result = applySvgImportToScene({
      analysis,
      document,
      millimetersPerUnit: 10,
      mode: 'replace',
      scene: makeScene(),
      workspaceConfig,
    })

    expect(detection.workspaceKind).toBe('optical-table')
    expect(result.scene.workspace.kind).toBe('optical-table')
    if (result.scene.workspace.kind !== 'optical-table') {
      throw new Error('expected optical-table workspace')
    }
    expect(result.scene.workspace.breadboards.length).toBeGreaterThanOrEqual(2)
    expect(result.scene.components[0]?.hostSurfaceId).toBe(result.scene.workspace.breadboards[0]?.id)
  })

  it('ignores a full-canvas background frame and seeds ambiguous symbols as preview components', () => {
    const elements = [
      makeElement({
        id: 'page-background',
        kind: 'rect',
        bounds: { x: 0, y: 0, width: 1700, height: 900 },
        center: { x: 850, y: 450 },
        points: [
          { x: 0, y: 0 },
          { x: 1700, y: 0 },
          { x: 1700, y: 900 },
          { x: 0, y: 900 },
          { x: 0, y: 0 },
        ],
      }),
      makeElement({
        id: 'board-outline',
        kind: 'rect',
        bounds: { x: 280, y: 120, width: 1120, height: 560 },
        center: { x: 840, y: 400 },
        points: [
          { x: 280, y: 120 },
          { x: 1400, y: 120 },
          { x: 1400, y: 680 },
          { x: 280, y: 680 },
          { x: 280, y: 120 },
        ],
      }),
      ...Array.from({ length: 12 * 24 }, (_, index) => {
        const column = index % 24
        const row = Math.floor(index / 24)
        const x = 320 + column * 40
        const y = 160 + row * 40

        return makeElement({
          id: `hole-${index}`,
          kind: 'circle',
          bounds: { x: x - 4, y: y - 4, width: 8, height: 8 },
          center: { x, y },
        })
      }),
      makeElement({
        id: 'iris-symbol',
        kind: 'circle',
        bounds: { x: 650, y: 420, width: 26, height: 26 },
        center: { x: 663, y: 433 },
      }),
    ]
    const document: SvgImportDocument = {
      svgText: '<svg />',
      elements,
      bounds: { x: 0, y: 0, width: 1700, height: 900 },
      scale: {
        baseMmPerUnit: 1,
        isReliable: true,
        sourceUnit: 'mm',
      },
      sourceKind: 'svg',
    }
    const detection = detectSvgImportWorkspace(document)
    const workspaceConfig = createInitialSvgImportWorkspaceConfig({
      detection,
      document,
    })
    const analysis = analyzeSvgImportDocument({
      document,
      millimetersPerUnit: 0.5,
      profile: 'guided',
      workspaceDetection: detection,
    })
    const previewItems = createImportPreviewItemsFromSvgAnalysis({
      analysis,
      document,
    })

    expect(detection.workspaceKind).toBe('single-breadboard')
    expect(detection.breadboardCandidates).toHaveLength(1)
    expect(previewItems.some((item) => item.disposition === 'component')).toBe(true)

    const result = applySvgImportToScene({
      analysis,
      document,
      millimetersPerUnit: 0.5,
      mode: 'replace',
      previewItems,
      scene: makeScene(),
      workspaceConfig,
    })

    expect(result.scene.workspace.kind).toBe('single-breadboard')
    expect(result.importedComponents).toBeGreaterThan(0)
  })
})

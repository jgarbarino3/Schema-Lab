import { describe, expect, it } from 'vitest'
import { createEmptyScene } from '../domain/serialization'
import {
  analyzeSvgImportDocument,
  applySvgImportToScene,
  type SvgImportDocument,
  type SvgImportElement,
} from '../domain/svgImport'

function makeElement(overrides: Partial<SvgImportElement>): SvgImportElement {
  const points = overrides.points ?? [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
    { x: 0, y: 0 },
  ]

  return {
    id: overrides.id ?? 'element-1',
    kind: overrides.kind ?? 'rect',
    isClosed: overrides.isClosed ?? true,
    bounds: overrides.bounds ?? { x: 0, y: 0, width: 10, height: 10 },
    center: overrides.center ?? { x: 5, y: 5 },
    hints: overrides.hints ?? [],
    points,
    rotationDeg: overrides.rotationDeg ?? 0,
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
    expect(analysis.ambiguous.length).toBeGreaterThanOrEqual(1)
  })

  it('builds import scene with manual ambiguity resolutions', () => {
    const scene = createEmptyScene()
    const document = makeDocument([
      makeElement({
        id: 'beam-splitter-shape',
        hints: ['Beam splitter'],
      }),
      makeElement({
        id: 'unknown-lens-shape',
        kind: 'circle',
        hints: [],
        isClosed: true,
        bounds: { x: 40, y: 20, width: 12, height: 12 },
        center: { x: 46, y: 26 },
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
        bounds: { x: 12, y: 42, width: 78, height: 0 },
        center: { x: 51, y: 42 },
      }),
    ])

    const analysis = analyzeSvgImportDocument({
      document,
      millimetersPerUnit: 1,
      profile: 'guided',
    })

    const result = applySvgImportToScene({
      analysis,
      document,
      millimetersPerUnit: 1,
      mode: 'merge',
      scene,
      manualResolutions: [
        {
          elementId: 'unknown-lens-shape',
          componentType: 'lens',
        },
      ],
    })

    expect(result.importedComponents).toBeGreaterThanOrEqual(2)
    expect(result.scene.components.length).toBeGreaterThanOrEqual(2)
    expect(result.scene.annotations.length).toBeGreaterThanOrEqual(1)
  })

  it('warns when rotation is snapped to quarter-turns', () => {
    const scene = createEmptyScene()
    const document = makeDocument([
      makeElement({
        id: 'tilted-mirror',
        kind: 'line',
        isClosed: false,
        hints: ['mirror'],
        rotationDeg: 31,
        points: [
          { x: 10, y: 10 },
          { x: 30, y: 20 },
        ],
        bounds: { x: 10, y: 10, width: 20, height: 10 },
        center: { x: 20, y: 15 },
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

  it('treats long beam-like lines as annotation segments, not component ambiguities', () => {
    const document = makeDocument([
      makeElement({
        id: 'beam-path-main',
        kind: 'line',
        isClosed: false,
        hints: ['beam path main'],
        points: [
          { x: 10, y: 20 },
          { x: 100, y: 20 },
        ],
        bounds: { x: 10, y: 20, width: 90, height: 0 },
        center: { x: 55, y: 20 },
        strokeWidth: 0.8,
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
        bounds: { x: 32, y: 30, width: 12, height: 12 },
        center: { x: 38, y: 36 },
      }),
    ])

    const analysis = analyzeSvgImportDocument({
      document,
      millimetersPerUnit: 1,
      profile: 'guided',
    })

    expect(analysis.ambiguous.find((item) => item.elementId === 'beam-path-main')).toBeUndefined()
    expect(analysis.annotationSegments.some((segment) => segment.elementId === 'beam-path-main')).toBe(
      true,
    )
  })

  it('prioritizes polarizer/waveplate suggestions for crossed circular symbols', () => {
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
        bounds: { x: 42, y: 22, width: 16, height: 16 },
        center: { x: 50, y: 30 },
        strokeWidth: 1.2,
      }),
    ])

    const analysis = analyzeSvgImportDocument({
      document,
      millimetersPerUnit: 1,
      profile: 'strict',
    })
    const circularAmbiguity = analysis.ambiguous.find((item) => item.elementId === 'circular-optic')

    expect(circularAmbiguity).toBeDefined()
    expect(circularAmbiguity?.suggestions[0]?.componentType).toBe('polarizer')
    expect(circularAmbiguity?.suggestions.some((item) => item.componentType === 'waveplate')).toBe(
      true,
    )
  })
})

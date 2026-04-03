import { describe, expect, it } from 'vitest'
import { createBreadboardFromPreset } from '../domain/breadboardPresets'
import {
  analyzeGaussianPaths,
  classifyGaussianApertureStatus,
  getGaussianInteractionAnalysis,
  getGaussianSourceSummary,
} from '../domain/gaussian'
import { traceSceneBeams } from '../domain/beamTracing'
import {
  createDefaultComponentConfig,
  getComponentDefinition,
} from '../domain/componentCatalog'
import { createEmptyScene } from '../domain/serialization'
import type { ComponentInstance, ComponentType, SceneDocument } from '../domain/types'

function makeComponent(
  type: ComponentType,
  overrides: Partial<ComponentInstance> = {},
): ComponentInstance {
  const definition = getComponentDefinition(type)

  return {
    id: overrides.id ?? `${type}-1`,
    type,
    label: overrides.label ?? definition.defaultLabel,
    variantId: overrides.variantId ?? definition.defaultVariantId,
    anchorMm: overrides.anchorMm ?? { x: 100, y: 100 },
    rotationQuarterTurns: overrides.rotationQuarterTurns ?? 0,
    config:
      overrides.config ??
      createDefaultComponentConfig(type, overrides.variantId ?? definition.defaultVariantId),
  }
}

function makeScene(components: ComponentInstance[]): SceneDocument {
  const scene = createEmptyScene()

  scene.workspace = {
    kind: 'single-breadboard',
    breadboard: createBreadboardFromPreset('metric-300-square'),
  }
  scene.components = components

  return scene
}

function makeEnabledSource(overrides: Partial<ComponentInstance> = {}) {
  const source = makeComponent('laser-source', {
    anchorMm: { x: -60, y: 137.5 },
    ...overrides,
  })

  return {
    ...source,
    config: {
      ...source.config,
      source: {
        ...source.config.source!,
        isEnabled: true,
        wavelengthNm: 800,
        bandwidthNm: 10,
        powerMw: 100,
        normalizedPowerPercent: 100,
      },
    },
  }
}

function makeGaussianTrace(scene: SceneDocument) {
  const beamTrace = traceSceneBeams(scene)

  return {
    beamTrace,
    gaussianTrace: analyzeGaussianPaths(scene, beamTrace),
  }
}

describe('gaussian/paraxial layer', () => {
  it('propagates a free-space Gaussian state from an explicit waist source', () => {
    const source = makeEnabledSource({
      config: {
        ...createDefaultComponentConfig('laser-source'),
        source: {
          ...createDefaultComponentConfig('laser-source').source!,
          isEnabled: true,
          gaussianInputMode: 'explicit-waist',
          waistRadiusMm: 0.5,
          waistOffsetMm: 0,
          wavelengthNm: 800,
          beamDiameterMm: 1,
          divergenceMrad: 0.51,
          powerMw: 100,
          normalizedPowerPercent: 100,
        },
      },
    })
    const { beamTrace, gaussianTrace } = makeGaussianTrace(makeScene([source]))
    const segment = beamTrace.segments[0]!
    const analysis = gaussianTrace.segmentAnalyses.find(
      (item) => item.segmentId === segment.id,
    )!
    const wavelengthMm = 0.0008
    const zR = (Math.PI * 0.5 ** 2) / wavelengthMm
    const expectedRadius = 0.5 * Math.sqrt(1 + (analysis.lengthMm / zR) ** 2)

    expect(analysis.start.waistRadiusMm).toBeCloseTo(0.5, 4)
    expect(analysis.start.waistOffsetMm).toBeCloseTo(0, 4)
    expect(analysis.end.spotRadiusMm).toBeCloseTo(expectedRadius, 3)
  })

  it('derives a source state from diameter and divergence and warns when clamped', () => {
    const source = makeEnabledSource({
      config: {
        ...createDefaultComponentConfig('laser-source'),
        source: {
          ...createDefaultComponentConfig('laser-source').source!,
          isEnabled: true,
          gaussianInputMode: 'derived',
          beamDiameterMm: 0.2,
          divergenceMrad: 1,
          wavelengthNm: 800,
          powerMw: 100,
          normalizedPowerPercent: 100,
        },
      },
    })
    const { gaussianTrace } = makeGaussianTrace(makeScene([source]))
    const summary = getGaussianSourceSummary(gaussianTrace, source.id)!

    expect(summary.warning).toBeDefined()
    expect(summary.launch.spotRadiusMm).toBeGreaterThan(0.24)
    expect(summary.launch.waistOffsetMm).toBeCloseTo(0, 4)
  })

  it('applies a thin-lens transform at the lens plane', () => {
    const source = makeEnabledSource({
      config: {
        ...createDefaultComponentConfig('laser-source'),
        source: {
          ...createDefaultComponentConfig('laser-source').source!,
          isEnabled: true,
          gaussianInputMode: 'explicit-waist',
          waistRadiusMm: 0.35,
          waistOffsetMm: -25,
          wavelengthNm: 800,
          powerMw: 100,
          normalizedPowerPercent: 100,
        },
      },
    })
    const lens = makeComponent('lens', {
      id: 'lens-1',
      anchorMm: { x: 120, y: 137.5 },
      config: {
        ...createDefaultComponentConfig('lens', 'thin-lens-50mm'),
        lens: {
          focalLengthMm: 50,
          clearApertureMm: 22,
        },
      },
      variantId: 'thin-lens-50mm',
    })
    const { beamTrace, gaussianTrace } = makeGaussianTrace(makeScene([source, lens]))
    const lensEvent = beamTrace.events.find((event) => event.componentId === lens.id)!
    const analysis = getGaussianInteractionAnalysis(gaussianTrace, lensEvent.id)!

    expect(analysis.local.spotRadiusMm).toBeCloseTo(
      analysis.outputLocal?.spotRadiusMm ?? 0,
      4,
    )
    expect(analysis.outputLocal?.waistOffsetMm).not.toBeCloseTo(
      analysis.local.waistOffsetMm,
      2,
    )
  })

  it('inherits Gaussian state cleanly across beamsplitter branches', () => {
    const source = makeEnabledSource()
    const beamsplitter = makeComponent('beamsplitter', {
      id: 'bs-1',
      anchorMm: { x: 100, y: 137.5 },
      config: {
        ...createDefaultComponentConfig('beamsplitter'),
        beamSplitter: {
          reflectPercent: 50,
          lossPercent: 2,
        },
      },
    })
    const { beamTrace, gaussianTrace } = makeGaussianTrace(
      makeScene([source, beamsplitter]),
    )
    const splitEvent = beamTrace.events.find(
      (event) => event.componentId === beamsplitter.id,
    )!
    const reflectedPathId = splitEvent.branchResults.find(
      (branch) => branch.branchKind === 'reflected',
    )!.pathId
    const transmittedSegment = gaussianTrace.segmentAnalyses.find(
      (analysis) =>
        analysis.pathId === splitEvent.pathId && analysis.startDistanceMm > 0,
    )!
    const reflectedSegment = gaussianTrace.segmentAnalyses.find(
      (analysis) => analysis.pathId === reflectedPathId,
    )!

    expect(transmittedSegment.start.spotRadiusMm).toBeCloseTo(
      reflectedSegment.start.spotRadiusMm,
      4,
    )
    expect(transmittedSegment.start.waistRadiusMm).toBeCloseTo(
      reflectedSegment.start.waistRadiusMm,
      4,
    )
  })

  it('initializes the SHG branch from the local state at the BBO plane', () => {
    const source = makeEnabledSource()
    const crystal = makeComponent('bbo-crystal', {
      id: 'bbo-1',
      anchorMm: { x: 120, y: 137.5 },
    })
    const { beamTrace, gaussianTrace } = makeGaussianTrace(makeScene([source, crystal]))
    const shgPath = gaussianTrace.pathAnalyses.find(
      (analysis) => analysis.pathRole === 'shg',
    )!
    const fundamentalPath = gaussianTrace.pathAnalyses.find(
      (analysis) => analysis.pathRole === 'fundamental',
    )!
    const shgStartSegment = gaussianTrace.segmentAnalyses.find(
      (analysis) => analysis.pathId === shgPath.pathId,
    )!
    const bboEvent = beamTrace.events.find((event) => event.componentId === crystal.id)!
    const inputAnalysis = getGaussianInteractionAnalysis(gaussianTrace, bboEvent.id)!

    expect(shgPath.wavelengthNm).toBe(400)
    expect(shgStartSegment.start.spotRadiusMm).toBeCloseTo(
      inputAnalysis.local.spotRadiusMm,
      4,
    )
    expect(shgPath.launch.rayleighRangeMm).toBeLessThan(
      fundamentalPath.launch.rayleighRangeMm,
    )
  })

  it('classifies aperture-overfill heuristics for practical warnings', () => {
    expect(classifyGaussianApertureStatus(6, 10)).toBe('clear')
    expect(classifyGaussianApertureStatus(8, 10)).toBe('near-limit')
    expect(classifyGaussianApertureStatus(12, 10)).toBe('overfill')
  })

  it('flags overfilled optics in the derived Gaussian warnings', () => {
    const source = makeEnabledSource({
      config: {
        ...createDefaultComponentConfig('laser-source'),
        source: {
          ...createDefaultComponentConfig('laser-source').source!,
          isEnabled: true,
          gaussianInputMode: 'explicit-waist',
          waistRadiusMm: 6,
          waistOffsetMm: 0,
          wavelengthNm: 800,
          powerMw: 100,
          normalizedPowerPercent: 100,
        },
      },
    })
    const iris = makeComponent('iris', {
      id: 'iris-1',
      anchorMm: { x: 100, y: 137.5 },
      config: {
        ...createDefaultComponentConfig('iris'),
        iris: {
          apertureMm: 4,
        },
      },
    })
    const { gaussianTrace } = makeGaussianTrace(makeScene([source, iris]))
    const warning = gaussianTrace.componentWarnings.find(
      (item) => item.componentId === iris.id,
    )

    expect(warning?.strongestStatus).toBe('overfill')
  })
})

import { describe, expect, it } from 'vitest'
import {
  getBeamSelection,
  getBboReadout,
  getFilterInspectorReadout,
  getTerminalCaptureSummary,
} from '../domain/beamReadouts'
import { traceSceneBeams } from '../domain/beamTracing'
import { createBreadboardFromPreset } from '../domain/breadboardPresets'
import {
  createDefaultComponentConfig,
  getComponentDefinition,
  getResolvedComponentSpec,
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

  scene.breadboard = createBreadboardFromPreset('metric-300-square')
  scene.components = components

  return scene
}

function makeEnabledSource(overrides: Partial<ComponentInstance> = {}) {
  const source = makeComponent('laser-source', {
    anchorMm: { x: -60, y: 112.5 },
    ...overrides,
  })

  return {
    ...source,
    config: {
      ...source.config,
      source: {
        ...source.config.source!,
        isEnabled: true,
        wavelengthNm: source.config.source?.wavelengthNm ?? 800,
        bandwidthNm: source.config.source?.bandwidthNm ?? 10,
        powerMw: 100,
        normalizedPowerPercent: 100,
      },
    },
  }
}

describe('beam readouts', () => {
  it('resolves selected segment context back to its path and interaction', () => {
    const trace = traceSceneBeams(
      makeScene([
        makeEnabledSource(),
        makeComponent('mirror', {
          anchorMm: { x: 100, y: 112.5 },
        }),
      ]),
    )
    const reflectedSegment = trace.segments.find(
      (segment) => segment.branchKind === 'reflected',
    )

    expect(reflectedSegment).toBeDefined()

    const selection = getBeamSelection(trace, {
      segmentId: reflectedSegment!.id,
    })

    expect(selection.segment?.id).toBe(reflectedSegment?.id)
    expect(selection.path?.pathId).toBe(reflectedSegment?.pathId)
    expect(selection.interaction?.id).toBe(reflectedSegment?.parentInteractionId)
  })

  it('builds detector terminal capture summaries', () => {
    const scene = makeScene([
      makeEnabledSource(),
      makeComponent('detector', {
        anchorMm: { x: 140, y: 112.5 },
      }),
    ])
    const trace = traceSceneBeams(scene)
    const capture = getTerminalCaptureSummary(trace, 'detector-1')

    expect(capture?.role).toBe('detector')
    expect(capture?.totalCapturedPowerMw).toBeGreaterThan(7)
    expect(capture?.hits[0]?.sourceLabel).toBe('Laser Source')
    expect(capture?.hits[0]?.contentTag).toBe('fundamental')
  })

  it('reports filter transmission class and numeric loss', () => {
    const spec = getResolvedComponentSpec('filter', 'fesh0350')
    const readout = getFilterInspectorReadout({
      componentId: 'filter-1',
      referenceWavelengthNm: 520,
      strongestIncomingPowerMw: 100,
      spec,
    })

    expect(readout.transmissionClass).toBe('stopband')
    expect(readout.transmissionPercent).toBeLessThan(10)
    expect(readout.lostPowerMw).toBeGreaterThan(90)
  })

  it('changes splitter reflection and BBO compatibility with polarization-sensitive settings', () => {
    const splitterScene = makeScene([
      makeEnabledSource(),
      makeComponent('beamsplitter', {
        anchorMm: { x: 100, y: 112.5 },
      }),
    ])
    const splitter = splitterScene.components.find(
      (component) => component.type === 'beamsplitter',
    )!
    const source = splitterScene.components.find(
      (component) => component.type === 'laser-source',
    )!

    source.config.source!.polarization = {
      basis: 'ray-local',
      presetId: 'linear-out-of-plane',
      inPlaneAmplitude: 0,
      outOfPlaneAmplitude: 1,
      relativePhaseDeg: 0,
    }
    const outOfPlaneTrace = traceSceneBeams(splitterScene)
    const outOfPlaneReflect = outOfPlaneTrace.events.find(
      (event) => event.componentId === splitter.id,
    )?.reflectedPowerMw

    source.config.source!.polarization = {
      basis: 'ray-local',
      presetId: 'linear-in-plane',
      inPlaneAmplitude: 1,
      outOfPlaneAmplitude: 0,
      relativePhaseDeg: 0,
    }
    const inPlaneTrace = traceSceneBeams(splitterScene)
    const inPlaneReflect = inPlaneTrace.events.find(
      (event) => event.componentId === splitter.id,
    )?.reflectedPowerMw

    expect(outOfPlaneReflect).toBeGreaterThan(inPlaneReflect ?? 0)

    const bboScene = makeScene([
      makeEnabledSource({
        anchorMm: { x: -60, y: 162.5 },
      }),
      makeComponent('bbo-crystal', {
        id: 'bbo-1',
        anchorMm: { x: 120, y: 162.5 },
      }),
    ])
    const bbo = bboScene.components.find((component) => component.id === 'bbo-1')!
    const bboSource = bboScene.components.find(
      (component) => component.type === 'laser-source',
    )!
    bboSource.config.source!.polarization = {
      basis: 'ray-local',
      presetId: 'linear-out-of-plane',
      inPlaneAmplitude: 0,
      outOfPlaneAmplitude: 1,
      relativePhaseDeg: 0,
    }
    bbo.config.bboCrystal!.polarizationAxisLocalDeg = 90

    const bboReadout = getBboReadout({
      component: bbo,
      scene: bboScene,
      trace: traceSceneBeams(bboScene),
    })

    expect(bboReadout?.polarizationSummary?.compatibilityPercent).toBeGreaterThan(90)
  })
})

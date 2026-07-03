import { describe, expect, it } from 'vitest'
import { createBreadboardFromPreset } from '../domain/breadboardPresets'
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

describe('deterministic beam tracing', () => {
  it('lets a source escape the scene when no optic intersects the ray', () => {
    const scene = makeScene([makeEnabledSource()])

    const trace = traceSceneBeams(scene)

    expect(trace.events).toHaveLength(0)
    expect(trace.segments).toHaveLength(1)
    expect(trace.segments[0]?.status).toBe('escaped')
  })

  it('reflects a beam from the actual mirror hit point', () => {
    const scene = makeScene([
      makeEnabledSource({
        config: {
          ...createDefaultComponentConfig('laser-source', undefined, 'left'),
          source: {
            ...createDefaultComponentConfig('laser-source', undefined, 'left').source!,
            isEnabled: true,
            wavelengthNm: 700,
            bandwidthNm: 10,
            powerMw: 100,
            normalizedPowerPercent: 100,
          },
        },
      }),
      makeComponent('mirror', {
        anchorMm: { x: 100, y: 112.5 },
      }),
    ])

    const trace = traceSceneBeams(scene)
    const reflection = trace.events.find((event) => event.interactionKind === 'reflection')
    const escaped = trace.segments.find(
      (segment) =>
        segment.status === 'escaped' &&
        Math.abs(segment.directionMm.x) < 0.001 &&
        segment.directionMm.y < -0.99,
    )

    expect(reflection?.hitPointMm).toEqual({ x: 100, y: 112.5 })
    expect(reflection?.reflectedPowerMw).toBeGreaterThan(97)
    expect(escaped).toBeDefined()
  })

  it('toggles flip-mirror behavior between reflection and pass-through', () => {
    const source = makeEnabledSource({
      anchorMm: { x: -60, y: 112.5 },
    })
    const flipMirrorBase = makeComponent('mirror', {
      id: 'flip-mirror-1',
      variantId: 'flip-mirror',
      anchorMm: { x: 100, y: 112.5 },
    })

    const downTrace = traceSceneBeams(
      makeScene([
        source,
        {
          ...flipMirrorBase,
          config: {
            ...createDefaultComponentConfig('mirror', 'flip-mirror'),
            flipMirror: {
              isFlippedDown: true,
            },
          },
        },
      ]),
    )
    const downEvent = downTrace.events.find(
      (event) => event.componentId === flipMirrorBase.id,
    )

    expect(downEvent?.interactionKind).toBe('reflection')
    expect(downEvent?.reflectedPowerMw).toBeGreaterThan(90)

    const upTrace = traceSceneBeams(
      makeScene([
        source,
        {
          ...flipMirrorBase,
          config: {
            ...createDefaultComponentConfig('mirror', 'flip-mirror'),
            flipMirror: {
              isFlippedDown: false,
            },
          },
        },
      ]),
    )
    const upEvent = upTrace.events.find((event) => event.componentId === flipMirrorBase.id)
    const transmittedEscape = upTrace.segments.find(
      (segment) =>
        segment.status === 'escaped' &&
        segment.directionMm.x > 0.99 &&
        Math.abs(segment.directionMm.y) < 0.001,
    )

    expect(upEvent?.interactionKind).toBe('transmission')
    expect(upEvent?.transmittedPowerMw).toBeGreaterThan(99)
    expect(transmittedEscape).toBeDefined()
  })

  it('splits beam power with configured beamsplitter ratio and loss', () => {
    const source = makeEnabledSource({
      anchorMm: { x: -60, y: 162.5 },
    })
    const beamsplitter = makeComponent('beamsplitter', {
      anchorMm: { x: 100, y: 162.5 },
      config: {
        ...createDefaultComponentConfig('beamsplitter', 'plate-1in'),
        beamSplitter: {
          reflectPercent: 50,
          lossPercent: 2,
        },
      },
    })

    const trace = traceSceneBeams(makeScene([source, beamsplitter]))
    const splitEvent = trace.events.find((event) => event.interactionKind === 'split')

    expect(splitEvent?.reflectedPowerMw).toBeCloseTo(46, 4)
    expect(splitEvent?.transmittedPowerMw).toBeCloseTo(52, 4)
    expect(splitEvent?.lostPowerMw).toBeCloseTo(2, 4)
    expect(trace.pathSummaries).toHaveLength(2)
  })

  it('generates SHG in a BBO crystal and preserves residual fundamental power', () => {
    const source = makeEnabledSource({
      anchorMm: { x: -60, y: 212.5 },
    })
    const crystal = makeComponent('bbo-crystal', {
      id: 'bbo-1',
      anchorMm: { x: 120, y: 212.5 },
      config: {
        ...createDefaultComponentConfig('bbo-crystal', 'type-i-bbo'),
        bboCrystal: {
          ...createDefaultComponentConfig('bbo-crystal', 'type-i-bbo').bboCrystal!,
          thicknessUm: 10,
          phaseMatchingAngleDeg: 29.2,
        },
      },
    })
    const detector = makeComponent('detector', {
      anchorMm: { x: 220, y: 212.5 },
    })

    const trace = traceSceneBeams(makeScene([source, crystal, detector]))
    const shgEvent = trace.events.find((event) => event.interactionKind === 'shg')
    const shgSegment = trace.segments.find((segment) => segment.pathRole === 'shg')

    expect(shgEvent?.generatedPowerMw).toBeGreaterThan(0)
    expect(shgEvent?.outputWavelengthNm).toBe(400)
    expect(shgEvent?.transmittedPowerMw).toBeGreaterThan(0)
    expect(shgSegment?.wavelengthNm).toBe(400)
  })

  it('adds internal optical path and femtosecond delay for delay-line components', () => {
    const source = makeEnabledSource({
      anchorMm: { x: -60, y: 137.5 },
    })
    const stage = makeComponent('delay-stage', {
      id: 'stage-1',
      variantId: 'pi-m-112-1dg1',
      anchorMm: { x: 120, y: 137.5 },
      config: {
        ...createDefaultComponentConfig('delay-stage', 'pi-m-112-1dg1'),
        delayLine: {
          positionMm: 10,
          travelMm: 25,
          topology: 'double-pass',
          zeroDelayOffsetFs: 0,
        },
      },
    })
    const foldedPair = makeComponent('folded-mirror-pair', {
      id: 'folded-pair-1',
      variantId: 'frog-delay-retroreflector',
      anchorMm: { x: 130, y: 128.5 },
      attachment: {
        parentComponentId: 'stage-1',
        parentMountSiteId: 'optic-seat',
        localAnchorMm: { x: 10, y: -9 },
        localRotationQuarterTurns: 0,
      },
    })

    const trace = traceSceneBeams(makeScene([source, stage, foldedPair]))
    const stageEvent = trace.events.find((event) => event.componentId === stage.id)!
    const foldedPairEvent = trace.events.find(
      (event) => event.componentId === foldedPair.id,
    )
    const stageSegment = trace.segments.find((segment) => segment.parentInteractionId === stageEvent.id || segment.id === stageEvent.inputSegmentId)!

    expect(stageEvent.physicsKind).toBe('delay-line')
    expect(foldedPairEvent).toBeUndefined()
    expect(stageEvent.internalOpticalPathMm).toBeCloseTo(20, 4)
    expect(stageSegment.internalOpticalPathMm).toBeCloseTo(20, 4)
    expect(stageEvent.timeDelayFs).toBeGreaterThan(60000)
  })

  it('transforms polarization and power through polarizers and waveplates', () => {
    const source = makeEnabledSource({
      config: {
        ...createDefaultComponentConfig('laser-source'),
        source: {
          ...createDefaultComponentConfig('laser-source').source!,
          isEnabled: true,
          polarization: {
            basis: 'ray-local',
            presetId: 'linear-in-plane',
            inPlaneAmplitude: 1,
            outOfPlaneAmplitude: 0,
            relativePhaseDeg: 0,
          },
          powerMw: 100,
          normalizedPowerPercent: 100,
        },
      },
    })
    const waveplate = makeComponent('waveplate', {
      id: 'wp-1',
      anchorMm: { x: 60, y: 112.5 },
      config: {
        ...createDefaultComponentConfig('waveplate', 'half-wave'),
        waveplate: {
          kind: 'half',
          axisLocalDeg: 22.5,
          retardanceDeg: 180,
          insertionLossPercent: 0,
        },
      },
    })
    const polarizer = makeComponent('polarizer', {
      id: 'pol-1',
      anchorMm: { x: 140, y: 112.5 },
      config: {
        ...createDefaultComponentConfig('polarizer'),
        polarizer: {
          axisLocalDeg: 45,
          extinctionRatio: 1000,
          insertionLossPercent: 0,
        },
      },
    })

    const trace = traceSceneBeams(makeScene([source, waveplate, polarizer]))
    const waveplateEvent = trace.events.find((event) => event.componentId === waveplate.id)!
    const polarizerEvent = trace.events.find((event) => event.componentId === polarizer.id)!

    expect(waveplateEvent.physicsKind).toBe('waveplate')
    expect(waveplateEvent.outputPolarization?.tag.toLowerCase()).toContain('elliptical')
    expect(polarizerEvent.physicsKind).toBe('polarizer')
    expect(polarizerEvent.transmittedPowerMw).toBeGreaterThan(40)
    expect(polarizerEvent.transmittedPowerMw).toBeLessThan(100)
  })

  it('generates linked OPA outputs when pump and seed inputs are configured', () => {
    const pump = makeEnabledSource({
      id: 'pump',
      label: 'Pump',
      config: {
        ...createDefaultComponentConfig('laser-source'),
        source: {
          ...createDefaultComponentConfig('laser-source').source!,
          isEnabled: true,
          wavelengthNm: 800,
          powerMw: 100,
          normalizedPowerPercent: 100,
        },
      },
    })
    const seed = makeEnabledSource({
      id: 'seed',
      label: 'Seed',
      anchorMm: { x: -60, y: 212.5 },
      config: {
        ...createDefaultComponentConfig('laser-source'),
        source: {
          ...createDefaultComponentConfig('laser-source').source!,
          isEnabled: true,
          wavelengthNm: 1030,
          powerMw: 60,
          normalizedPowerPercent: 100,
        },
      },
    })
    const opa = makeComponent('opa-module', {
      id: 'opa-1',
      variantId: 'opa-gain-stage',
      anchorMm: { x: 120, y: 212.5 },
      config: {
        ...createDefaultComponentConfig('opa-module', 'opa-gain-stage'),
        opa: {
          role: 'gain',
          pumpLink: { sourceComponentId: 'pump' },
          seedLink: { sourceComponentId: 'seed' },
          outputMode: 'signal+idler',
          conversionEfficiencyPercent: 20,
          signalWavelengthNm: 650,
          idlerWavelengthNm: 1350,
          outputBandwidthNm: 35,
        },
      },
    })

    const trace = traceSceneBeams(makeScene([pump, seed, opa]))
    const opaEvent = trace.events.find((event) => event.componentId === opa.id)!
    const generatedPaths = trace.pathSummaries.filter(
      (path) => path.sourceComponentId === opa.id,
    )

    expect(opaEvent.physicsKind).toBe('opa-gain')
    expect(generatedPaths.length).toBeGreaterThanOrEqual(1)
    expect(generatedPaths.some((path) => Math.abs(path.wavelengthNm - 650) < 1)).toBe(true)
  })
})

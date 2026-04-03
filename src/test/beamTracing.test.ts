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
})

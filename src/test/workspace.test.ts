import { describe, expect, it } from 'vitest'
import { createBreadboardFromPreset } from '../domain/breadboardPresets'
import {
  createDefaultComponentConfig,
  getComponentDefinition,
  getResolvedComponentSpecForInstance,
} from '../domain/componentCatalog'
import { traceSceneBeams } from '../domain/beamTracing'
import { createEmptyScene } from '../domain/serialization'
import type { ComponentInstance } from '../domain/types'
import {
  SINGLE_BREADBOARD_SURFACE_ID,
} from '../domain/types'
import {
  convertSceneToOpticalTable,
  convertSceneToSingleBreadboard,
} from '../domain/workspace'

function makeComponent(
  type: ComponentInstance['type'],
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
    hostSurfaceId: overrides.hostSurfaceId,
    geometryOverride: overrides.geometryOverride,
    config:
      overrides.config ??
      createDefaultComponentConfig(type, overrides.variantId ?? definition.defaultVariantId),
  }
}

describe('workspace conversions and geometry overrides', () => {
  it('converts a single breadboard scene into an optical table workspace', () => {
    const scene = createEmptyScene()
    scene.workspace = {
      kind: 'single-breadboard',
      breadboard: createBreadboardFromPreset('metric-300-square'),
    }
    scene.components = [
      makeComponent('mirror', {
        id: 'mirror-1',
        anchorMm: { x: 100, y: 112.5 },
      }),
    ]

    const converted = convertSceneToOpticalTable(scene)

    expect(converted.workspace.kind).toBe('optical-table')
    if (converted.workspace.kind !== 'optical-table') {
      throw new Error('expected optical-table workspace')
    }
    expect(converted.workspace.breadboards).toHaveLength(1)
    expect(converted.components[0]?.hostSurfaceId).toBe(
      converted.workspace.breadboards[0]?.id,
    )
    expect(converted.components[0]?.anchorMm.x).toBeGreaterThan(100)
  })

  it('converts an optical table scene back to a chosen breadboard workspace', () => {
    const scene = convertSceneToOpticalTable(createEmptyScene())
    if (scene.workspace.kind !== 'optical-table') {
      throw new Error('expected optical-table workspace')
    }

    const breadboardId = scene.workspace.breadboards[0]!.id
    scene.components = [
      makeComponent('mirror', {
        id: 'mirror-on-board',
        anchorMm: { x: scene.workspace.breadboards[0]!.anchorMm.x + 120, y: scene.workspace.breadboards[0]!.anchorMm.y + 112.5 },
        hostSurfaceId: breadboardId,
      }),
      makeComponent('laser-source', {
        id: 'laser-on-table',
        variantId: 'libra',
        anchorMm: { x: 900, y: 700 },
        hostSurfaceId: 'optical-table',
        config: {
          ...createDefaultComponentConfig('laser-source', 'libra'),
          source: {
            ...createDefaultComponentConfig('laser-source', 'libra').source!,
            isEnabled: false,
          },
        },
      }),
    ]

    const converted = convertSceneToSingleBreadboard({
      scene,
      breadboardId,
    })

    expect(converted.workspace.kind).toBe('single-breadboard')
    expect(converted.components).toHaveLength(1)
    expect(converted.components[0]?.hostSurfaceId).toBe(
      SINGLE_BREADBOARD_SURFACE_ID,
    )
  })

  it('scales component geometry overrides into bounds and ports', () => {
    const component = makeComponent('detector', {
      geometryOverride: {
        widthMm: 72,
        heightMm: 54,
      },
    })

    const spec = getResolvedComponentSpecForInstance(component)

    expect(spec.footprintBoundsMm.width).toBeCloseTo(72, 4)
    expect(spec.footprintBoundsMm.height).toBeCloseTo(54, 4)
    expect(spec.ports[0]?.positionMm.x).toBeLessThan(-18)
  })

  it('applies attenuator transmission as a scalar pass-through interaction', () => {
    const source = makeComponent('laser-source', {
      id: 'laser-1',
      anchorMm: { x: -60, y: 112.5 },
      config: {
        ...createDefaultComponentConfig('laser-source'),
        source: {
          ...createDefaultComponentConfig('laser-source').source!,
          isEnabled: true,
          wavelengthNm: 800,
          bandwidthNm: 10,
          powerMw: 100,
          normalizedPowerPercent: 100,
        },
      },
    })
    const attenuator = makeComponent('attenuator', {
      id: 'attn-1',
      variantId: 'variable-nd-horizontal',
      anchorMm: { x: 100, y: 112.5 },
    })
    const detector = makeComponent('detector', {
      id: 'detector-1',
      anchorMm: { x: 180, y: 112.5 },
    })
    const scene = createEmptyScene()
    scene.workspace = {
      kind: 'single-breadboard',
      breadboard: createBreadboardFromPreset('metric-300-square'),
    }
    scene.components = [source, attenuator, detector]

    const trace = traceSceneBeams(scene)
    const capture = trace.terminalCaptures.find(
      (summary) => summary.componentId === 'detector-1',
    )

    expect(capture?.totalCapturedPowerMw).toBeLessThan(100)
    expect(capture?.totalCapturedPowerMw).toBeGreaterThan(1)
    expect(capture?.totalCapturedPowerMw).toBeCloseTo(4, 0)
  })
})

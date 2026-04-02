import { describe, expect, it } from 'vitest'
import {
  analyzeGaussianPaths,
  getGaussianPathTableRows,
  getGaussianWaistMarkers,
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
  scene.components = components
  return scene
}

describe('gaussian readout helpers', () => {
  it('builds compact path-table rows for a traced path', () => {
    const source = makeComponent('laser-source', {
      id: 'laser-1',
      anchorMm: { x: -60, y: 137.5 },
      config: {
        ...createDefaultComponentConfig('laser-source'),
        source: {
          ...createDefaultComponentConfig('laser-source').source!,
          isEnabled: true,
          gaussianInputMode: 'explicit-waist',
          waistRadiusMm: 0.45,
          waistOffsetMm: 12,
        },
      },
    })
    const lens = makeComponent('lens', {
      id: 'lens-1',
      label: 'Lens 1',
      anchorMm: { x: 120, y: 137.5 },
      variantId: 'thin-lens-100mm',
      config: {
        ...createDefaultComponentConfig('lens', 'thin-lens-100mm'),
        lens: {
          focalLengthMm: 100,
          clearApertureMm: 22,
        },
      },
    })
    const scene = makeScene([source, lens])
    const beamTrace = traceSceneBeams(scene)
    const gaussianTrace = analyzeGaussianPaths(scene, beamTrace)
    const pathId = beamTrace.pathSummaries[0]!.pathId
    const rows = getGaussianPathTableRows(beamTrace, gaussianTrace, pathId)

    expect(rows.length).toBeGreaterThan(1)
    expect(rows.some((row) => row.label === 'Lens 1')).toBe(true)
  })

  it('derives waist markers when the waist falls inside a segment', () => {
    const source = makeComponent('laser-source', {
      id: 'laser-1',
      anchorMm: { x: -60, y: 137.5 },
      config: {
        ...createDefaultComponentConfig('laser-source'),
        source: {
          ...createDefaultComponentConfig('laser-source').source!,
          isEnabled: true,
          gaussianInputMode: 'explicit-waist',
          waistRadiusMm: 0.4,
          waistOffsetMm: 20,
        },
      },
    })
    const scene = makeScene([source])
    const beamTrace = traceSceneBeams(scene)
    const gaussianTrace = analyzeGaussianPaths(scene, beamTrace)
    const markers = getGaussianWaistMarkers(
      beamTrace,
      gaussianTrace,
      beamTrace.pathSummaries[0]!.pathId,
    )

    expect(markers).toHaveLength(1)
    expect(markers[0]?.zPositionMm).toBeCloseTo(20, 3)
    expect(markers[0]?.waistRadiusMm).toBeCloseTo(0.4, 3)
  })
})

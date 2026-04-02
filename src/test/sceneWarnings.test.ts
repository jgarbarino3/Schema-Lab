import { describe, expect, it } from 'vitest'
import { analyzeGaussianPaths } from '../domain/gaussian'
import { deriveSceneWarnings } from '../domain/sceneWarnings'
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

describe('scene warnings', () => {
  it('derives mechanical warnings and highlight targets for off-hole optics', () => {
    const mirror = makeComponent('mirror', {
      id: 'mirror-1',
      anchorMm: { x: 40, y: 40 },
    })
    const scene = makeScene([mirror])
    const beamTrace = traceSceneBeams(scene)
    const gaussianTrace = analyzeGaussianPaths(scene, beamTrace)
    const warnings = deriveSceneWarnings(scene, beamTrace, gaussianTrace)

    expect(warnings[0]).toMatchObject({
      category: 'mechanical',
      componentId: 'mirror-1',
      highlightTarget: {
        componentIds: ['mirror-1'],
      },
    })
  })

  it('warns when an enabled source misses its chosen first target', () => {
    const target = makeComponent('mirror', {
      id: 'mirror-1',
      anchorMm: { x: 180, y: 150 },
    })
    const source = makeComponent('laser-source', {
      id: 'laser-1',
      anchorMm: { x: -60, y: 87.5 },
      config: {
        ...createDefaultComponentConfig('laser-source'),
        source: {
          ...createDefaultComponentConfig('laser-source').source!,
          isEnabled: true,
          firstTargetComponentId: target.id,
          lane: 'left',
        },
      },
    })
    const scene = makeScene([source, target])
    const beamTrace = traceSceneBeams(scene)
    const gaussianTrace = analyzeGaussianPaths(scene, beamTrace)
    const warnings = deriveSceneWarnings(scene, beamTrace, gaussianTrace)
    const targetWarning = warnings.find((warning) => warning.sourceComponentId === source.id)

    expect(targetWarning).toMatchObject({
      category: 'optical',
      componentId: source.id,
      sourceComponentId: source.id,
    })
    expect(targetWarning?.highlightTarget?.componentIds).toEqual([
      source.id,
      target.id,
    ])
  })
})

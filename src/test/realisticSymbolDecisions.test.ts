import { describe, expect, it } from 'vitest'
import {
  DEFAULT_POST_HOLDER_DIAMETER_MM,
  createDefaultComponentConfig,
  getResolvedComponentSpec,
  getResolvedComponentSpecForInstance,
} from '../domain/componentCatalog'
import {
  FINAL_REALISTIC_MATERIAL_PROFILE,
  FINAL_REALISTIC_SUPPORT_POSTHOLDER_STYLE,
  FINAL_REALISTIC_SYMBOL_FALLBACK_STYLE,
  FINAL_REALISTIC_SYMBOL_STYLE_BY_FAMILY,
  getRealisticSymbolFamilyKey,
  resolveRealisticMaterialProfile,
  resolveRealisticSupportPostholderStyle,
  resolveRealisticSymbolStyle,
} from '../domain/realisticSymbolDecisions'
import { createEmptyScene, serializeSceneDocument } from '../domain/serialization'
import type { ComponentInstance, ComponentType } from '../domain/types'

function createInstance(type: ComponentType, variantId?: string): ComponentInstance {
  const spec = getResolvedComponentSpec(type, variantId)

  return {
    id: `${type}-${spec.variantId}`,
    type,
    label: spec.shortVariantLabel,
    variantId: spec.variantId,
    anchorMm: { x: 37.5, y: -12.5 },
    rotationQuarterTurns: 1,
    config: createDefaultComponentConfig(type, spec.variantId),
  }
}

function geometrySnapshot(instance: ComponentInstance) {
  const spec = getResolvedComponentSpecForInstance(instance)

  return JSON.parse(
    JSON.stringify({
      anchorMm: instance.anchorMm,
      footprintBoundsMm: spec.footprintBoundsMm,
      hitBoundsMm: spec.hitBoundsMm,
      mountBoundsMm: spec.mount.supportBoundsMm,
      mountMode: spec.mount.mode,
      mountVisualBoundsMm: spec.mountVisualBoundsMm ?? null,
      opticalCenterMm: spec.opticalCenterMm ?? null,
      ports: spec.ports,
      rotationQuarterTurns: instance.rotationQuarterTurns,
      visualBodyBoundsMm: spec.visualBodyBoundsMm,
    }),
  )
}

describe('fixed realistic symbol decisions', () => {
  it('captures the final screenshot-selected visual choices', () => {
    expect(FINAL_REALISTIC_SYMBOL_STYLE_BY_FAMILY).toEqual({
      'planar-mirror': 'technical',
      'curved-mirror': 'technical',
      lens: 'technical',
      beamsplitter: 'technical',
      iris: 'schematic',
      filter: 'hardware',
      'polarization-control': 'technical',
      detector: 'hardware',
      'beam-dump': 'hardware',
      source: 'hardware',
      'post-holder': 'technical',
    })
    expect(FINAL_REALISTIC_SYMBOL_FALLBACK_STYLE).toBe('technical')
    expect(FINAL_REALISTIC_SUPPORT_POSTHOLDER_STYLE).toBe('technical')
    expect(FINAL_REALISTIC_MATERIAL_PROFILE).toBe('catalog')
  })

  it.each([
    ['mirror', 'bb1-e02', 'planar-mirror', 'technical'],
    ['curved-mirror', 'concave-1in', 'curved-mirror', 'technical'],
    ['lens', 'thin-lens-100mm', 'lens', 'technical'],
    ['beamsplitter', 'plate-1in', 'beamsplitter', 'technical'],
    ['iris', 'id12-m', 'iris', 'schematic'],
    ['filter', 'felh0400', 'filter', 'hardware'],
    ['polarizer', 'lpvis100', 'polarization-control', 'technical'],
    ['waveplate', 'quarter-wave', 'polarization-control', 'technical'],
    ['detector', 'detector-generic', 'detector', 'hardware'],
    ['beam-dump', 'beam-dump-generic', 'beam-dump', 'hardware'],
    ['laser-source', 'fs-source-head', 'source', 'hardware'],
    ['support-hardware', 'ph20-m', 'post-holder', 'technical'],
  ] satisfies Array<[ComponentType, string, string, string]>)(
    'resolves %s/%s to %s %s',
    (type, variantId, expectedFamily, expectedStyle) => {
      const instance = createInstance(type, variantId)
      const spec = getResolvedComponentSpecForInstance(instance)

      expect(getRealisticSymbolFamilyKey(instance, spec)).toBe(expectedFamily)
      expect(resolveRealisticSymbolStyle(instance, spec)).toBe(expectedStyle)
    },
  )

  it('uses the technical fallback for unvoted realistic families', () => {
    const attenuator = createInstance('attenuator', 'variable-nd-vertical')
    const telescope = createInstance('telescope', 'reflective-compressor-2x')

    expect(getRealisticSymbolFamilyKey(attenuator)).toBeUndefined()
    expect(resolveRealisticSymbolStyle(attenuator)).toBe('technical')
    expect(getRealisticSymbolFamilyKey(telescope)).toBeUndefined()
    expect(resolveRealisticSymbolStyle(telescope)).toBe('technical')
  })

  it('keeps support and material decisions global and visual only', () => {
    expect(resolveRealisticSupportPostholderStyle()).toBe('technical')
    expect(resolveRealisticMaterialProfile()).toBe('catalog')

    const defaultHolder = getResolvedComponentSpec('support-hardware')

    expect(defaultHolder.variantId).toBe('ph20-m')
    expect(defaultHolder.sku).toBe('PH20/M')
    expect(DEFAULT_POST_HOLDER_DIAMETER_MM).toBe(25)
    expect(defaultHolder.footprintBoundsMm.width).toBeCloseTo(25, 3)
    expect(defaultHolder.footprintBoundsMm.height).toBeCloseTo(25, 3)
  })

  it('does not let style resolution mutate catalog dimensions or scene geometry', () => {
    const instances = [
      createInstance('mirror', 'bb1-e02'),
      createInstance('curved-mirror', 'concave-1in'),
      createInstance('lens', 'thin-lens-100mm'),
      createInstance('beamsplitter', 'plate-1in'),
      createInstance('iris', 'id12-m'),
      createInstance('filter', 'felh0400'),
      createInstance('polarizer', 'lpvis100'),
      createInstance('waveplate', 'quarter-wave'),
      createInstance('detector', 'detector-generic'),
      createInstance('beam-dump', 'beam-dump-generic'),
      createInstance('laser-source', 'fs-source-head'),
      createInstance('attenuator', 'variable-nd-vertical'),
    ]

    for (const instance of instances) {
      const before = geometrySnapshot(instance)
      const spec = getResolvedComponentSpecForInstance(instance)

      resolveRealisticSymbolStyle(instance, spec)
      resolveRealisticSupportPostholderStyle()
      resolveRealisticMaterialProfile()

      expect(geometrySnapshot(instance)).toEqual(before)
    }
  })

  it('does not serialize vote or realistic style preferences into scene JSON', () => {
    const scene = createEmptyScene()

    scene.components.push(createInstance('mirror', 'bb1-e02'))

    const serialized = serializeSceneDocument(scene)

    expect(serialized).not.toContain('realisticSymbolStyle')
    expect(serialized).not.toContain('realistic-symbol')
    expect(serialized).not.toContain('votes')
  })
})

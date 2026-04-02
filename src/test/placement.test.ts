import { describe, expect, it } from 'vitest'
import { createBreadboardFromPreset } from '../domain/breadboardPresets'
import {
  createDefaultComponentConfig,
  getComponentDefinition,
} from '../domain/componentCatalog'
import {
  alignExternalSourceToTarget,
  findDuplicatePlacement,
  resolveComponentPlacement,
} from '../domain/placement'
import type { ComponentInstance, ComponentType } from '../domain/types'

const breadboard = createBreadboardFromPreset('metric-300-square')

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

describe('placement resolution', () => {
  it('keeps external laser sources constrained to the selected source lane', () => {
    const source = makeComponent('laser-source', {
      config: createDefaultComponentConfig('laser-source', undefined, 'left'),
    })

    const result = resolveComponentPlacement({
      breadboard,
      candidateAnchorMm: { x: 40, y: 88 },
      component: source,
      phase: 'drop',
      snapMode: 'none',
    })

    expect(result.resolvedAnchorMm).toEqual({ x: -60, y: 87.5 })
    expect(result.sourceLane).toBe('left')
    expect(result.status).toBe('valid')
  })

  it('captures on-drop hole-mounted placements inside the snap radius', () => {
    const sample = makeComponent('sample-stage')

    const result = resolveComponentPlacement({
      breadboard,
      candidateAnchorMm: { x: 114, y: 114 },
      component: sample,
      phase: 'drop',
      snapMode: 'onDrop',
    })

    expect(result.resolvedAnchorMm).toEqual({ x: 112.5, y: 112.5 })
    expect(result.snappedHoleMm).toEqual({ x: 112.5, y: 112.5 })
    expect(result.status).toBe('snapped')
  })

  it('keeps hole-mounted components warning/off-hole beyond the snap threshold', () => {
    const sample = makeComponent('sample-stage')

    const result = resolveComponentPlacement({
      breadboard,
      candidateAnchorMm: { x: 100, y: 100 },
      component: sample,
      phase: 'drop',
      snapMode: 'onDrop',
    })

    expect(result.resolvedAnchorMm).toEqual({ x: 100, y: 100 })
    expect(result.snappedHoleMm).toBeUndefined()
    expect(result.status).toBe('warning')
    expect(result.reason).toBe('off-hole')
  })

  it('preserves free clamp-capable placement when snap mode is none', () => {
    const mirror = makeComponent('mirror')

    const result = resolveComponentPlacement({
      breadboard,
      candidateAnchorMm: { x: 30, y: 40 },
      component: mirror,
      phase: 'drop',
      snapMode: 'none',
    })

    expect(result.resolvedAnchorMm).toEqual({ x: 30, y: 40 })
    expect(result.status).toBe('valid')
    expect(result.reason).toBe('none')
  })

  it('allows clamp-capable optics near the edge when the support stays on the board', () => {
    const mirror = makeComponent('mirror')

    const result = resolveComponentPlacement({
      breadboard,
      candidateAnchorMm: { x: 12.7, y: 12.7 },
      component: mirror,
      phase: 'drop',
      snapMode: 'none',
    })

    expect(result.status).toBe('valid')
    expect(result.isMountSupported).toBe(true)
    expect(result.isFootprintInsideBoard).toBe(true)
  })

  it('warns when a hole-mounted component cannot fit near the board edge', () => {
    const sample = makeComponent('sample-stage')

    const result = resolveComponentPlacement({
      breadboard,
      candidateAnchorMm: { x: 12.5, y: 12.5 },
      component: sample,
      phase: 'drop',
      snapMode: 'always',
    })

    expect(result.status).toBe('warning')
    expect(result.reason).toBe('support-outside-board')
    expect(result.isMountSupported).toBe(false)
  })

  it('snaps continuously in always mode during drag previews', () => {
    const mirror = makeComponent('mirror')

    const result = resolveComponentPlacement({
      breadboard,
      candidateAnchorMm: { x: 40, y: 40 },
      component: mirror,
      phase: 'drag',
      snapMode: 'always',
    })

    expect(result.resolvedAnchorMm).toEqual({ x: 37.5, y: 37.5 })
    expect(result.status).toBe('snapped')
  })

  it('places duplicates at the next sensible free offset when the preferred slot is occupied', () => {
    const original = makeComponent('mirror', {
      id: 'mirror-1',
      anchorMm: { x: 100, y: 100 },
    })
    const blocker = makeComponent('mirror', {
      id: 'mirror-2',
      anchorMm: { x: 125, y: 100 },
    })

    const placement = findDuplicatePlacement({
      breadboard,
      component: original,
      components: [original, blocker],
    })

    expect(placement?.resolvedAnchorMm).toEqual({ x: 100, y: 125 })
    expect(placement?.reason).toBe('none')
  })

  it('aligns an external source lane to the target input height', () => {
    const source = makeComponent('laser-source', {
      config: createDefaultComponentConfig('laser-source', undefined, 'left'),
    })
    const mirror = makeComponent('mirror', {
      anchorMm: { x: 100, y: 137.5 },
    })

    const alignment = alignExternalSourceToTarget({
      breadboard,
      lane: 'left',
      source,
      target: mirror,
    })

    expect(alignment.anchorMm).toEqual({ x: -60, y: 137.5 })
    expect(alignment.rotationQuarterTurns).toBe(0)
  })
})

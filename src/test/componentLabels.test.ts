import { describe, expect, it } from 'vitest'
import { createDefaultComponentConfig, getComponentDefinition } from '../domain/componentCatalog'
import { createAutoNumberedComponentLabel } from '../domain/componentLabels'
import type { ComponentInstance } from '../domain/types'

function makeComponent(
  label: string,
  type: ComponentInstance['type'] = 'mirror',
  variantId = getComponentDefinition(type).defaultVariantId,
): ComponentInstance {
  return {
    id: `${type}-${label}`,
    type,
    label,
    variantId,
    anchorMm: { x: 0, y: 0 },
    rotationQuarterTurns: 0,
    config: createDefaultComponentConfig(type, variantId),
  }
}

describe('component labels', () => {
  it('creates compact schematic labels for common optical components', () => {
    expect(createAutoNumberedComponentLabel([], 'mirror')).toBe('M1')
    expect(createAutoNumberedComponentLabel([], 'lens')).toBe('L1')
    expect(createAutoNumberedComponentLabel([], 'beamsplitter')).toBe('BS1')
    expect(createAutoNumberedComponentLabel([], 'iris')).toBe('AP1')
  })

  it('counts existing compact and legacy labels without relabeling scenes', () => {
    const components = [
      makeComponent('Planar Mirror 1'),
      makeComponent('M2'),
      makeComponent('Mirror #3'),
      makeComponent('L4', 'lens'),
    ]

    expect(createAutoNumberedComponentLabel(components, 'mirror')).toBe('M4')
    expect(createAutoNumberedComponentLabel(components, 'lens')).toBe('L5')
  })

  it('uses a separate compact family for flip mirrors', () => {
    const components = [
      makeComponent('M1'),
      makeComponent('Flip Mirror 1', 'mirror', 'flip-mirror'),
    ]

    expect(createAutoNumberedComponentLabel(components, 'mirror', 'flip-mirror')).toBe(
      'FM2',
    )
  })
})

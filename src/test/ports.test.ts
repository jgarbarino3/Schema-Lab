import { describe, expect, it } from 'vitest'
import { getComponentDefinition } from '../domain/componentCatalog'
import { getRotatedFootprintBoundsMm, getWorldPortsForComponent } from '../domain/ports'
import type { ComponentInstance } from '../domain/types'

describe('rotation-aware ports', () => {
  it('rotates asymmetric mirror ports through quarter turns', () => {
    const mirror = getComponentDefinition('mirror')
    const componentBase: Omit<ComponentInstance, 'rotationQuarterTurns'> = {
      id: 'mirror-1',
      type: 'mirror',
      label: 'Mirror',
      anchorMm: { x: 100, y: 200 },
    }

    expect(
      getWorldPortsForComponent({ ...componentBase, rotationQuarterTurns: 0 }, mirror),
    ).toEqual([
      {
        id: 'input-west',
        label: 'Input',
        kind: 'beam-input',
        positionMm: { x: -12.7, y: 0 },
        direction: 'west',
        worldPositionMm: { x: 87.3, y: 200 },
        worldDirection: 'west',
      },
      {
        id: 'output-north',
        label: 'Reflected',
        kind: 'beam-output',
        positionMm: { x: 0, y: -12.7 },
        direction: 'north',
        worldPositionMm: { x: 100, y: 187.3 },
        worldDirection: 'north',
      },
    ])

    expect(
      getWorldPortsForComponent({ ...componentBase, rotationQuarterTurns: 1 }, mirror),
    ).toEqual([
      {
        id: 'input-west',
        label: 'Input',
        kind: 'beam-input',
        positionMm: { x: -12.7, y: 0 },
        direction: 'west',
        worldPositionMm: { x: 100, y: 187.3 },
        worldDirection: 'north',
      },
      {
        id: 'output-north',
        label: 'Reflected',
        kind: 'beam-output',
        positionMm: { x: 0, y: -12.7 },
        direction: 'north',
        worldPositionMm: { x: 112.7, y: 200 },
        worldDirection: 'east',
      },
    ])
  })

  it('swaps rotated footprint bounds for non-square components', () => {
    const lens = getComponentDefinition('lens')
    const component: ComponentInstance = {
      id: 'lens-1',
      type: 'lens',
      label: 'Lens',
      anchorMm: { x: 0, y: 0 },
      rotationQuarterTurns: 1,
    }

    expect(getRotatedFootprintBoundsMm(component, lens)).toEqual({
      x: -18,
      y: -12.7,
      width: 36,
      height: 25.4,
    })
  })
})

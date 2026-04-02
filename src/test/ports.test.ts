import { describe, expect, it } from 'vitest'
import {
  COMPONENT_DEFINITIONS,
  createDefaultComponentConfig,
  getResolvedComponentSpec,
} from '../domain/componentCatalog'
import {
  rotateCardinalDirection,
  rotatePointQuarterTurns,
} from '../domain/geometry'
import { getRotatedFootprintBoundsMm, getWorldPortsForComponent } from '../domain/ports'
import type { ComponentInstance, QuarterTurn } from '../domain/types'

describe('rotation-aware ports', () => {
  const rotatedDefinitions = COMPONENT_DEFINITIONS.filter(
    (definition) => definition.ports.length > 0,
  )

  for (const definition of rotatedDefinitions) {
    it(`keeps ${definition.type} ports consistent across quarter turns`, () => {
      const anchorMm = { x: 100, y: 200 }
      const spec = getResolvedComponentSpec(
        definition.type,
        definition.defaultVariantId,
      )

      for (const rotationQuarterTurns of [0, 1, 2, 3] as QuarterTurn[]) {
        const component: ComponentInstance = {
          id: `${definition.type}-${rotationQuarterTurns}`,
          type: definition.type,
          label: definition.defaultLabel,
          variantId: definition.defaultVariantId,
          anchorMm,
          rotationQuarterTurns,
          config: createDefaultComponentConfig(
            definition.type,
            definition.defaultVariantId,
          ),
        }

        expect(getWorldPortsForComponent(component, spec)).toEqual(
          spec.ports.map((port) => {
            const rotatedPositionMm = rotatePointQuarterTurns(
              port.positionMm,
              rotationQuarterTurns,
            )

            return {
              ...port,
              worldDirection: rotateCardinalDirection(
                port.direction,
                rotationQuarterTurns,
              ),
              worldPositionMm: {
                x: Number((anchorMm.x + rotatedPositionMm.x).toFixed(6)),
                y: Number((anchorMm.y + rotatedPositionMm.y).toFixed(6)),
              },
            }
          }),
        )
      }
    })
  }

  it('swaps rotated footprint bounds for non-square components', () => {
    const component: ComponentInstance = {
      id: 'lens-1',
      type: 'lens',
      label: 'Lens',
      variantId: 'plano-convex-1in',
      anchorMm: { x: 0, y: 0 },
      rotationQuarterTurns: 1,
      config: createDefaultComponentConfig('lens', 'plano-convex-1in'),
    }

    expect(getRotatedFootprintBoundsMm(component)).toEqual({
      x: -18,
      y: -12.7,
      width: 36,
      height: 25.4,
    })
  })
})

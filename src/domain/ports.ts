import { getComponentDefinition } from './componentCatalog'
import {
  rotateBoundsQuarterTurns,
  rotateCardinalDirection,
  rotatePointQuarterTurns,
  roundMm,
} from './geometry'
import type {
  BoundsMm,
  ComponentDefinition,
  ComponentInstance,
  WorldPort,
} from './types'

export function getRotatedFootprintBoundsMm(
  component: ComponentInstance,
  definition = getComponentDefinition(component.type),
): BoundsMm {
  return rotateBoundsQuarterTurns(
    definition.footprintBoundsMm,
    component.rotationQuarterTurns,
  )
}

export function getWorldPortsForComponent(
  component: ComponentInstance,
  definition: ComponentDefinition = getComponentDefinition(component.type),
) {
  return definition.ports.map<WorldPort>((port) => {
    const rotatedPositionMm = rotatePointQuarterTurns(
      port.positionMm,
      component.rotationQuarterTurns,
    )

    return {
      ...port,
      worldDirection: rotateCardinalDirection(
        port.direction,
        component.rotationQuarterTurns,
      ),
      worldPositionMm: {
        x: roundMm(component.anchorMm.x + rotatedPositionMm.x),
        y: roundMm(component.anchorMm.y + rotatedPositionMm.y),
      },
    }
  })
}

import { getResolvedComponentSpecForInstance } from './componentCatalog'
import {
  rotateBoundsQuarterTurns,
  rotateCardinalDirection,
  rotatePointQuarterTurns,
  roundMm,
} from './geometry'
import type { BoundsMm, ComponentInstance, ResolvedComponentSpec, WorldPort } from './types'

export function getResolvedSpecForInstance(component: ComponentInstance) {
  return getResolvedComponentSpecForInstance(component)
}

export function getRotatedFootprintBoundsMm(
  component: ComponentInstance,
  spec: ResolvedComponentSpec = getResolvedSpecForInstance(component),
): BoundsMm {
  return rotateBoundsQuarterTurns(
    spec.footprintBoundsMm,
    component.rotationQuarterTurns,
  )
}

export function getWorldPortsForComponent(
  component: ComponentInstance,
  spec: ResolvedComponentSpec = getResolvedSpecForInstance(component),
) {
  return spec.ports.map<WorldPort>((port) => {
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

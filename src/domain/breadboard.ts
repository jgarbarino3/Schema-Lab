import type { BreadboardModel, Vector2Mm } from './types'
import { roundMm } from './geometry'

const COUNTERBORE_INSET_MM = 25

export function getEffectiveHolePitchMm(breadboard: BreadboardModel) {
  return breadboard.holeDensity === 'double'
    ? breadboard.holeSpacingMm / 2
    : breadboard.holeSpacingMm
}

export function getHoleAxisPositionsMm(
  lengthMm: number,
  edgeMarginMm: number,
  pitchMm: number,
) {
  if (pitchMm <= 0) {
    return []
  }

  const usableSpanMm = lengthMm - edgeMarginMm * 2

  if (usableSpanMm < 0) {
    return []
  }

  const holeCount = Math.floor(usableSpanMm / pitchMm + 1e-6) + 1

  return Array.from({ length: holeCount }, (_, index) =>
    roundMm(edgeMarginMm + index * pitchMm),
  )
}

export function getBreadboardHoleAxesMm(breadboard: BreadboardModel) {
  const pitchMm = getEffectiveHolePitchMm(breadboard)

  return {
    xPositionsMm: getHoleAxisPositionsMm(
      breadboard.widthMm,
      breadboard.edgeMarginMm,
      pitchMm,
    ),
    yPositionsMm: getHoleAxisPositionsMm(
      breadboard.heightMm,
      breadboard.edgeMarginMm,
      pitchMm,
    ),
  }
}

export function getBreadboardHoleCounts(breadboard: BreadboardModel) {
  const axes = getBreadboardHoleAxesMm(breadboard)

  return {
    xCount: axes.xPositionsMm.length,
    yCount: axes.yPositionsMm.length,
    totalCount: axes.xPositionsMm.length * axes.yPositionsMm.length,
  }
}

function getNearestAxisValue(valueMm: number, axisValuesMm: number[]) {
  if (axisValuesMm.length === 0) {
    return 0
  }

  let nearestValue = axisValuesMm[0]
  let nearestDistance = Math.abs(axisValuesMm[0] - valueMm)

  for (const axisValue of axisValuesMm.slice(1)) {
    const distance = Math.abs(axisValue - valueMm)

    if (
      distance < nearestDistance ||
      (distance === nearestDistance && axisValue > nearestValue)
    ) {
      nearestValue = axisValue
      nearestDistance = distance
    }
  }

  return nearestValue
}

export function getNearestHole(
  breadboard: BreadboardModel,
  pointMm: Vector2Mm,
): Vector2Mm {
  const axes = getBreadboardHoleAxesMm(breadboard)

  return {
    x: getNearestAxisValue(pointMm.x, axes.xPositionsMm),
    y: getNearestAxisValue(pointMm.y, axes.yPositionsMm),
  }
}

export function getBreadboardCenterMm(breadboard: BreadboardModel): Vector2Mm {
  return {
    x: roundMm(breadboard.widthMm / 2),
    y: roundMm(breadboard.heightMm / 2),
  }
}

export function getNearestBoardCenterHole(breadboard: BreadboardModel) {
  return getNearestHole(breadboard, getBreadboardCenterMm(breadboard))
}

export function getCounterboreCentersMm(breadboard: BreadboardModel) {
  if (breadboard.counterborePattern === 'none') {
    return []
  }

  const candidates = [
    { x: COUNTERBORE_INSET_MM, y: COUNTERBORE_INSET_MM },
    { x: breadboard.widthMm - COUNTERBORE_INSET_MM, y: COUNTERBORE_INSET_MM },
    { x: COUNTERBORE_INSET_MM, y: breadboard.heightMm - COUNTERBORE_INSET_MM },
    {
      x: breadboard.widthMm - COUNTERBORE_INSET_MM,
      y: breadboard.heightMm - COUNTERBORE_INSET_MM,
    },
  ]

  return candidates.filter(
    (candidate) =>
      candidate.x > 0 &&
      candidate.x < breadboard.widthMm &&
      candidate.y > 0 &&
      candidate.y < breadboard.heightMm,
  )
}

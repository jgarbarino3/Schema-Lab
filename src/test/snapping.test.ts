import { describe, expect, it } from 'vitest'
import {
  getBreadboardHoleCounts,
  getEffectiveHolePitchMm,
  getNearestBoardCenterHole,
  getNearestHole,
} from '../domain/breadboard'
import { createBreadboardFromPreset } from '../domain/breadboardPresets'

describe('breadboard snapping', () => {
  it('snaps component anchors to the nearest valid hole', () => {
    const breadboard = createBreadboardFromPreset('metric-300-square')

    expect(getNearestHole(breadboard, { x: 20, y: 40 })).toEqual({
      x: 12.5,
      y: 37.5,
    })
  })

  it('clamps snapped positions to the valid board hole field', () => {
    const breadboard = createBreadboardFromPreset('metric-300-square')

    expect(getNearestHole(breadboard, { x: -100, y: 999 })).toEqual({
      x: 12.5,
      y: 287.5,
    })
  })

  it('updates effective pitch and hole counts for double-density boards', () => {
    const breadboard = {
      ...createBreadboardFromPreset('metric-350-square'),
      holeDensity: 'double' as const,
    }

    expect(getEffectiveHolePitchMm(breadboard)).toBe(12.5)
    expect(getBreadboardHoleCounts(breadboard)).toEqual({
      xCount: 27,
      yCount: 27,
      totalCount: 729,
    })
  })

  it('chooses the upper/right hole on board-center ties', () => {
    const breadboard = createBreadboardFromPreset('metric-350-square')

    expect(getNearestBoardCenterHole(breadboard)).toEqual({
      x: 187.5,
      y: 187.5,
    })
  })
})

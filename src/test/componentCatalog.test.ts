import { describe, expect, it } from 'vitest'
import {
  createDefaultComponentConfig,
  getResolvedComponentSpec,
} from '../domain/componentCatalog'

describe('component catalog variants', () => {
  it('includes the PI M-112.1DG1 delay-stage variant with practical geometry', () => {
    const stage = getResolvedComponentSpec('sample-stage', 'pi-m-112-1dg1')

    expect(stage.vendor).toBe('PI')
    expect(stage.sku).toBe('M-112.1DG1')
    expect(stage.footprintBoundsMm.width).toBeCloseTo(85, 3)
    expect(stage.renderHint.glyph).toBe('sample')
    expect(stage.recommendedHardware?.mount).toBeDefined()
  })

  it('adds explicit polarizer, waveplate, telescope, and OPA module families', () => {
    const polarizer = getResolvedComponentSpec('polarizer', 'lpvis100')
    const waveplate = getResolvedComponentSpec('waveplate', 'quarter-wave')
    const telescope = getResolvedComponentSpec('telescope', 'reflective-compressor-2x')
    const opa = getResolvedComponentSpec('opa-module', 'opa-gain-stage')

    expect(polarizer.physics.kind).toBe('polarizer')
    expect(waveplate.physics.kind).toBe('waveplate')
    expect(telescope.physics.kind).toBe('telescope')
    expect(opa.physics.kind).toBe('opa-gain')
  })

  it('creates focused-optics defaults for the new configurable physics families', () => {
    expect(createDefaultComponentConfig('mirror', 'concave-1in').curvedMirror).toMatchObject({
      radiusOfCurvatureMm: 200,
      isConvex: false,
    })
    expect(createDefaultComponentConfig('polarizer').polarizer?.extinctionRatio).toBeGreaterThan(100)
    expect(createDefaultComponentConfig('waveplate', 'quarter-wave').waveplate).toMatchObject({
      kind: 'quarter',
      retardanceDeg: 90,
    })
    expect(createDefaultComponentConfig('telescope').telescope).toMatchObject({
      mode: 'transmission',
      separationMm: 150,
    })
    expect(createDefaultComponentConfig('opa-module', 'opa-gain-stage').opa?.role).toBe('gain')
  })
})

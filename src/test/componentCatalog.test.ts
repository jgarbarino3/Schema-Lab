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
    expect(stage.renderHint.glyph).toBe('sample-delay-stage')
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

  it('resolves realistic visual presets for hero hardware and variant overrides', () => {
    const mirror = getResolvedComponentSpec('mirror', 'bb1-e02')
    const beamsplitter = getResolvedComponentSpec('beamsplitter', 'plate-1in')
    const lens = getResolvedComponentSpec('lens', 'thin-lens-100mm')
    const filter = getResolvedComponentSpec('filter', 'felh0400')
    const iris = getResolvedComponentSpec('iris', 'id12-m')
    const libra = getResolvedComponentSpec('laser-source', 'libra')
    const detector = getResolvedComponentSpec('detector', 'detector-generic')

    expect(mirror.realisticVisualPreset).toMatchObject({
      family: 'mirror',
      finish: 'cool-metal',
      mountVisual: 'kinematic-round',
    })
    expect(beamsplitter.realisticVisualPreset).toMatchObject({
      family: 'beamsplitter',
      finish: 'cool-metal',
      mountVisual: 'kinematic-round',
    })
    expect(lens.realisticVisualPreset).toMatchObject({
      family: 'lens',
      finish: 'warm-metal',
      mountVisual: 'kinematic-round',
    })
    expect(filter.realisticVisualPreset).toMatchObject({
      family: 'filter',
      finish: 'warm-metal',
      mountVisual: 'kinematic-round',
    })
    expect(iris.realisticVisualPreset).toMatchObject({
      family: 'iris',
      finish: 'graphite',
      mountVisual: 'iris-body',
    })
    expect(libra.realisticVisualPreset).toMatchObject({
      family: 'laser-source',
      finish: 'silver-machined',
      mountVisual: 'none',
    })
    expect(detector.realisticVisualPreset).toMatchObject({
      family: 'detector',
      mountVisual: 'sensor-disc',
    })
  })

  it('creates focused-optics defaults for the new configurable physics families', () => {
    expect(createDefaultComponentConfig('curved-mirror', 'concave-1in').curvedMirror).toMatchObject({
      radiusOfCurvatureMm: 200,
      isConvex: false,
    })
    expect(createDefaultComponentConfig('mirror', 'flip-mirror').flipMirror).toMatchObject({
      isFlippedDown: true,
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

  it('assigns the reviewed variant glyph identities for simple icon rendering', () => {
    expect(getResolvedComponentSpec('laser-source', 'fs-source-head').renderHint.glyph).toBe(
      'laser-fs-source',
    )
    expect(getResolvedComponentSpec('laser-source', 'libra').renderHint.glyph).toBe(
      'laser-libra',
    )
    expect(
      getResolvedComponentSpec('support-hardware', 'pump-seed-combiner').renderHint.glyph,
    ).toBe('support-pump-seed-combiner')
    expect(getResolvedComponentSpec('mirror', 'flip-mirror').renderHint.glyph).toBe(
      'mirror-flip',
    )
    expect(
      getResolvedComponentSpec('attenuator', 'variable-nd-vertical').renderHint.glyph,
    ).toBe('attenuator-vertical')
    expect(getResolvedComponentSpec('waveplate', 'quarter-wave').renderHint.glyph).toBe(
      'waveplate-quarter',
    )
    expect(getResolvedComponentSpec('iris', 'sm1d12sz').renderHint.glyph).toBe(
      'iris-sm1-zero',
    )
    expect(
      getResolvedComponentSpec('telescope', 'reflective-compressor-2x').renderHint.glyph,
    ).toBe('telescope-reflective')
    expect(getResolvedComponentSpec('sample-stage', 'pi-ls-180').renderHint.glyph).toBe(
      'sample-motorized-stage',
    )
    expect(
      getResolvedComponentSpec('spectrometer', 'spectrapro-sp-2150').renderHint.glyph,
    ).toBe('spectrometer-bench')
  })
})

import { describe, expect, it } from 'vitest'
import {
  COMPONENT_DEFINITIONS,
  createDefaultComponentConfig,
  getResolvedComponentSpec,
  getResolvedComponentSpecForInstance,
} from '../domain/componentCatalog'

describe('component catalog variants', () => {
  it('includes the PI M-112.1DG1 delay-stage variant with practical geometry', () => {
    const stage = getResolvedComponentSpec('delay-stage', 'pi-m-112-1dg1')

    expect(stage.vendor).toBe('PI')
    expect(stage.sku).toBe('M-112.1DG1')
    expect(stage.footprintBoundsMm.width).toBeCloseTo(85, 3)
    expect(stage.renderHint.glyph).toBe('sample-delay-stage')
    expect(stage.recommendedHardware?.mount).toBeDefined()
  })

  it('maps the CSV-backed hardware SKUs into placeable variants with practical footprints', () => {
    const base = getResolvedComponentSpec('support-hardware', 'ba2-m')
    const lens = getResolvedComponentSpec('lens', 'la4102-ab')
    const detector = getResolvedComponentSpec('detector', 'bc207vis-m')
    const spectrometer = getResolvedComponentSpec('spectrometer', 'cct10')

    expect(base.sku).toBe('BA2/M')
    expect(base.footprintBoundsMm.width).toBeCloseTo(50, 3)
    expect(base.footprintBoundsMm.height).toBeCloseTo(75, 3)
    expect(lens.footprintBoundsMm.width).toBeCloseTo(50.8, 3)
    expect(detector.sku).toBe('BC207VIS/M')
    expect(spectrometer.sku).toBe('CCT10')
  })

  it('covers the intended placeable core set from the Thorlabs CSVs and leaves accessory-only SKUs out', () => {
    const skus = new Set(
      COMPONENT_DEFINITIONS.flatMap((definition) =>
        definition.variants.map((variant) => variant.sku).filter(Boolean),
      ),
    )

    expect([...skus]).toEqual(
      expect.arrayContaining([
        'BA2/M',
        'BC207VIS/M',
        'BSW10',
        'CCT10',
        'CF038C/M',
        'CF125C/M',
        'CL5',
        'DH1/M',
        'FGB37',
        'FGB39',
        'FH2',
        'FM90/M',
        'FP01',
        'IDA12/M',
        'KM100',
        'LA4102-AB',
        'LA4148-A/AB',
        'LA4158-AB',
        'LA4236-A',
        'LA4725-A/AB',
        'LA4874-A/AB',
        'LMR1/M',
        'NDL-10C-2',
        'PF10-03-P01',
        'PH20E/M',
        'PH40E/M',
        'PH50E/M',
        'PT1/M',
        'PT101/M',
        'PT3/M',
        'S120VC',
        'ST1XY-S/M',
        'TR20/M',
        'TR30/M',
        'TR40/M',
        'TR50/M',
        'TR75/M',
        'XE25L225/M',
        'AB90H',
      ]),
    )
    expect(skus.has('PM100D')).toBe(false)
    expect(skus.has('PM5020')).toBe(false)
    expect(skus.has('XE25T3/M')).toBe(false)
    expect(skus.has('R2/M')).toBe(false)
  })

  it('makes the Thorlabs platform mount the default sample holder', () => {
    expect(
      COMPONENT_DEFINITIONS.find((definition) => definition.type === 'sample-holder')
        ?.defaultVariantId,
    ).toBe('thorlabs-km100b-m')
    const holder = getResolvedComponentSpec('sample-holder', 'thorlabs-km100b-m')
    const opticSeat = holder.mountSites.find((seat) => seat.id === 'optic-seat')

    expect(holder.variantId).toBe('thorlabs-km100b-m')
    expect(holder.footprintBoundsMm.width).toBeCloseTo(48.6, 3)
    expect(opticSeat).toBeDefined()
    expect(opticSeat?.seatBoundsMm.width).toBeGreaterThanOrEqual(30)
    expect(opticSeat?.seatBoundsMm.height).toBeGreaterThanOrEqual(30)
    expect(opticSeat?.allowedChildMountModes).toEqual(
      expect.arrayContaining(['clamp-capable', 'hole-mounted']),
    )
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
    expect(
      getResolvedComponentSpec('filter', 'felh0400').renderHint.glyph,
    ).toBe('filter-longpass')
    expect(
      getResolvedComponentSpec('filter', 'fesh0600').renderHint.glyph,
    ).toBe('filter-shortpass')
    expect(
      getResolvedComponentSpec('filter', 'fguv5-uv').renderHint.glyph,
    ).toBe('filter-colored-glass')
    expect(
      getResolvedComponentSpec('filter', 'fbh266-10').renderHint.glyph,
    ).toBe('filter-bandpass')
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
    expect(
      getResolvedComponentSpec('opa-module', 'white-light-generator').renderHint.glyph,
    ).toBe('opa-white-light')
    expect(
      getResolvedComponentSpec('opa-module', 'pump-seed-combiner').renderHint.glyph,
    ).toBe('opa-combiner')
    expect(
      getResolvedComponentSpec('opa-module', 'opa-gain-stage').renderHint.glyph,
    ).toBe('opa-gain')
    expect(getResolvedComponentSpec('delay-stage', 'pi-ls-180').renderHint.glyph).toBe(
      'sample-motorized-stage',
    )
    expect(
      getResolvedComponentSpec('spectrometer', 'spectrapro-sp-2150').renderHint.glyph,
    ).toBe('spectrometer-bench')
  })

  it('applies per-instance stage and sample appearance overrides to resolved specs', () => {
    const stageSpec = getResolvedComponentSpecForInstance({
      id: 'stage-1',
      type: 'sample-holder',
      label: 'Holder',
      variantId: 'thorlabs-km100b-m',
      anchorMm: { x: 0, y: 0 },
      rotationQuarterTurns: 0,
      finishId: 'graphite',
      config: createDefaultComponentConfig('sample-holder', 'thorlabs-km100b-m'),
    })
    const sampleSpec = getResolvedComponentSpecForInstance({
      id: 'sample-1',
      type: 'sample',
      label: 'TiN',
      variantId: 'tin-substrate',
      anchorMm: { x: 0, y: 0 },
      rotationQuarterTurns: 0,
      materialId: 'tin',
      config: createDefaultComponentConfig('sample', 'tin-substrate'),
    })

    expect(stageSpec.renderHint.fill).not.toBe(
      getResolvedComponentSpec('sample-holder', 'thorlabs-km100b-m').renderHint.fill,
    )
    expect(stageSpec.realisticVisualPreset?.finish).toBe('graphite')
    expect(sampleSpec.realisticVisualPreset?.accentFill).toBeDefined()
    expect(sampleSpec.renderHint.fill).not.toBe(
      getResolvedComponentSpec('sample', 'tin-substrate').renderHint.fill,
    )
  })
})

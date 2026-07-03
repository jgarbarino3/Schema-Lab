import { getSourcePreset } from './sourcePresets'
import { roundMm } from './geometry'
import type {
  BboCrystalConfig,
  BoundsMm,
  CurvedMirrorConfig,
  ComponentBeamPhysics,
  ComponentCategory,
  ComponentConfig,
  ComponentDefinition,
  ComponentInstance,
  ComponentMount,
  ComponentMountSite,
  ComponentRenderHint,
  ComponentType,
  ComponentVariant,
  DelayLineConfig,
  LensConfig,
  MountMode,
  OpaConfig,
  PolarizerConfig,
  PortDefinition,
  PortKind,
  FlipMirrorConfig,
  MountSeatRole,
  RealisticVisualPreset,
  ResolvedComponentSpec,
  SampleMaterialId,
  SourceLane,
  StageFinishId,
  TelescopeConfig,
  TwoPointFiveDVisualPreset,
  WaveplateConfig,
} from './types'

function bounds(x: number, y: number, width: number, height: number): BoundsMm {
  return { x, y, width, height }
}

function insetBounds(
  source: BoundsMm,
  insetX: number,
  insetY: number,
): BoundsMm {
  return bounds(
    source.x + insetX,
    source.y + insetY,
    Math.max(1, source.width - insetX * 2),
    Math.max(1, source.height - insetY * 2),
  )
}

function scaleBounds(
  source: BoundsMm | undefined,
  scaleX: number,
  scaleY: number,
) {
  if (!source) {
    return undefined
  }

  return bounds(
    source.x * scaleX,
    source.y * scaleY,
    source.width * scaleX,
    source.height * scaleY,
  )
}

function scalePorts(ports: PortDefinition[], scaleX: number, scaleY: number) {
  return ports.map((item) => ({
    ...item,
    positionMm: {
      x: item.positionMm.x * scaleX,
      y: item.positionMm.y * scaleY,
    },
  }))
}

function port(
  id: string,
  label: string,
  kind: PortKind,
  x: number,
  y: number,
  direction: PortDefinition['direction'],
): PortDefinition {
  return {
    id,
    label,
    kind,
    positionMm: { x, y },
    direction,
  }
}

function mount(
  mode: MountMode,
  x: number,
  y: number,
  width: number,
  height: number,
): ComponentMount {
  return {
    mode,
    supportBoundsMm: bounds(x, y, width, height),
  }
}

function mountSite(
  id: string,
  label: string,
  role: MountSeatRole,
  x: number,
  y: number,
  width: number,
  height: number,
  allowedChildMountModes: MountMode[] = ['clamp-capable'],
  allowedChildTypes?: ComponentType[],
): ComponentMountSite {
  // Optic seats need a slightly larger local envelope so 1 in mounts, irises,
  // and compact detectors can actually attach instead of falling back to the board.
  const seatWidth =
    role === 'optic-seat'
      ? Math.max(width, 30)
      : role === 'sample-seat'
        ? Math.max(width, 18)
        : width
  const seatHeight =
    role === 'optic-seat'
      ? Math.max(height, 30)
      : role === 'sample-seat'
        ? Math.max(height, 16)
        : height
  const seatX = x - (seatWidth - width) / 2
  const seatY = y - (seatHeight - height) / 2
  const normalizedAllowedChildMountModes =
    role === 'optic-seat'
      ? Array.from(
          new Set<MountMode>([...allowedChildMountModes, 'hole-mounted']),
        )
      : allowedChildMountModes

  return {
    id,
    label,
    role,
    seatBoundsMm: bounds(seatX, seatY, seatWidth, seatHeight),
    defaultLocalAnchorMm: {
      x: seatX + seatWidth / 2,
      y: seatY + seatHeight / 2,
    },
    allowedChildMountModes: normalizedAllowedChildMountModes,
    allowedChildTypes,
  }
}

function renderHint(
  shape: ComponentRenderHint['shape'],
  fill: string,
  stroke: string,
  glyph: ComponentRenderHint['glyph'],
): ComponentRenderHint {
  return {
    shape,
    fill,
    stroke,
    glyph,
  }
}

const SIMPLE_GLYPH_APPEARANCE_GLYPHS = new Set<ComponentRenderHint['glyph']>([
  'laser',
  'laser-fs-source',
  'laser-compact-table',
  'laser-libra',
  'laser-pharos',
  'laser-clark',
  'mount',
  'support',
  'support-clamp-fork',
  'support-mounting-base',
  'support-pedestal-post',
  'support-post-holder',
  'support-pedestal-assembly',
  'support-linear-slide',
  'support-beam-block',
  'support-periscope',
  'support-white-light-cell',
  'support-pump-seed-combiner',
  'mirror',
  'mirror-flip',
  'folded-mirror-pair',
  'curved-mirror',
  'beamsplitter',
  'lens',
  'filter',
  'filter-longpass',
  'filter-shortpass',
  'filter-bandpass',
  'filter-colored-glass',
  'attenuator',
  'attenuator-horizontal',
  'attenuator-vertical',
  'polarizer',
  'waveplate',
  'waveplate-half',
  'waveplate-quarter',
  'iris',
  'iris-standard',
  'iris-zero',
  'iris-sm1-ring',
  'iris-sm1-graduated',
  'iris-sm1-zero',
  'bbo',
  'telescope',
  'telescope-transmission',
  'telescope-reflective',
  'opa',
  'opa-white-light',
  'opa-combiner',
  'opa-gain',
  'sample',
  'sample-holder-generic',
  'sample-holder-slotted',
  'sample-generic',
  'sample-xy-stage',
  'sample-xyz-stage',
  'sample-manual-xyz-stage',
  'sample-delay-stage',
  'sample-motorized-stage',
  'sample-chip',
  'sample-crystal',
  'sample-substrate',
  'fiber',
  'spectrometer',
  'spectrometer-compact',
  'spectrometer-bench',
  'detector',
  'beam-dump',
])

export function supportsSimpleGlyphAppearance(
  spec: Pick<ResolvedComponentSpec, 'renderHint' | 'type'>,
) {
  return SIMPLE_GLYPH_APPEARANCE_GLYPHS.has(spec.renderHint.glyph)
}

function realisticVisualPreset(
  family: RealisticVisualPreset['family'],
  finish: RealisticVisualPreset['finish'],
  mountVisual: RealisticVisualPreset['mountVisual'],
  options: Pick<RealisticVisualPreset, 'accentFill' | 'accentStroke' | 'glassTint'> = {},
): RealisticVisualPreset {
  return {
    family,
    finish,
    mountVisual,
    ...options,
  }
}

function mergeRenderHint(
  base: ComponentRenderHint,
  next?: Partial<ComponentRenderHint>,
): ComponentRenderHint {
  if (!next) {
    return base
  }

  return {
    shape: next.shape ?? base.shape,
    fill: next.fill ?? base.fill,
    stroke: next.stroke ?? base.stroke,
    glyph: next.glyph ?? base.glyph,
  }
}

function mergeRealisticVisualPreset(
  base?: RealisticVisualPreset,
  next?: Partial<RealisticVisualPreset>,
): RealisticVisualPreset | undefined {
  if (!base) {
    if (!next?.family || !next.finish || !next.mountVisual) {
      return undefined
    }

    return {
      family: next.family,
      finish: next.finish,
      mountVisual: next.mountVisual,
      accentFill: next.accentFill,
      accentStroke: next.accentStroke,
      glassTint: next.glassTint,
    }
  }

  if (!next) {
    return base
  }

  return {
    family: next.family ?? base.family,
    finish: next.finish ?? base.finish,
    mountVisual: next.mountVisual ?? base.mountVisual,
    accentFill: next.accentFill ?? base.accentFill,
    accentStroke: next.accentStroke ?? base.accentStroke,
    glassTint: next.glassTint ?? base.glassTint,
  }
}

function mergeTwoPointFiveDVisualPreset(
  base?: TwoPointFiveDVisualPreset,
  next?: Partial<TwoPointFiveDVisualPreset>,
): TwoPointFiveDVisualPreset | undefined {
  if (!base) {
    if (!next?.profile || typeof next.extrusionMm !== 'number') {
      return undefined
    }

    return {
      profile: next.profile,
      extrusionMm: next.extrusionMm,
      labelAnchorMm: next.labelAnchorMm,
    }
  }

  if (!next) {
    return base
  }

  return {
    profile: next.profile ?? base.profile,
    extrusionMm: next.extrusionMm ?? base.extrusionMm,
    labelAnchorMm: next.labelAnchorMm ?? base.labelAnchorMm,
  }
}

function twoPointFiveDVisualPreset(
  profile: TwoPointFiveDVisualPreset['profile'],
  extrusionMm: number,
  labelAnchorMm?: TwoPointFiveDVisualPreset['labelAnchorMm'],
): TwoPointFiveDVisualPreset {
  return {
    profile,
    extrusionMm,
    labelAnchorMm,
  }
}

function inferTwoPointFiveDVisualPreset(
  type: ComponentType,
  footprintBoundsMm: BoundsMm,
  renderHintValue: ComponentRenderHint,
): TwoPointFiveDVisualPreset {
  const labelAnchorMm = {
    x: roundMm(footprintBoundsMm.x + footprintBoundsMm.width / 2),
    y: roundMm(footprintBoundsMm.y + footprintBoundsMm.height + 4),
  }

  switch (type) {
    case 'laser-source':
      return twoPointFiveDVisualPreset('body-rounded-rect', 12, labelAnchorMm)
    case 'mirror':
    case 'folded-mirror-pair':
    case 'curved-mirror':
    case 'lens':
      return twoPointFiveDVisualPreset('optic-disc', 8, labelAnchorMm)
    case 'beamsplitter':
    case 'filter':
      return twoPointFiveDVisualPreset('optic-plate', 8, labelAnchorMm)
    case 'attenuator':
    case 'polarizer':
    case 'waveplate':
      return twoPointFiveDVisualPreset('optic-ring', 7, labelAnchorMm)
    case 'iris':
      return twoPointFiveDVisualPreset('optic-ring', 10, labelAnchorMm)
    case 'delay-stage':
    case 'translation-stage':
      return twoPointFiveDVisualPreset('stage-deck', 11, labelAnchorMm)
    case 'sample-holder':
      return twoPointFiveDVisualPreset('body-rect', 9, labelAnchorMm)
    case 'telescope':
      return twoPointFiveDVisualPreset('body-capsule', 9, labelAnchorMm)
    case 'bbo-crystal':
      return twoPointFiveDVisualPreset('crystal-diamond', 8, labelAnchorMm)
    case 'detector':
      return twoPointFiveDVisualPreset('detector-head', 10, labelAnchorMm)
    case 'beam-dump':
      return twoPointFiveDVisualPreset('beam-dump', 10, labelAnchorMm)
    default:
      switch (renderHintValue.glyph) {
        case 'telescope':
        case 'telescope-transmission':
        case 'telescope-reflective':
          return twoPointFiveDVisualPreset('body-capsule', 9, labelAnchorMm)
        case 'beam-dump':
          return twoPointFiveDVisualPreset('beam-dump', 10, labelAnchorMm)
        case 'sample-delay-stage':
        case 'sample-motorized-stage':
        case 'sample-manual-xyz-stage':
          return twoPointFiveDVisualPreset('stage-deck', 10, labelAnchorMm)
        case 'bbo':
          return twoPointFiveDVisualPreset('crystal-diamond', 8, labelAnchorMm)
        case 'detector':
          return twoPointFiveDVisualPreset('detector-head', 10, labelAnchorMm)
        case 'laser':
        case 'laser-compact-table':
        case 'laser-libra':
        case 'laser-pharos':
        case 'laser-clark':
          return twoPointFiveDVisualPreset('body-rounded-rect', 12, labelAnchorMm)
        default:
          return twoPointFiveDVisualPreset('body-rect', 8, labelAnchorMm)
      }
  }
}

interface StageFinishAppearance {
  accentFill: string
  accentStroke: string
  label: string
  realisticFinish: RealisticVisualPreset['finish']
  renderFill: string
  renderStroke: string
}

interface SampleMaterialAppearance {
  accentFill: string
  accentStroke: string
  label: string
  realisticFinish: RealisticVisualPreset['finish']
  renderFill: string
  renderStroke: string
}

export const STAGE_COMPONENT_TYPES: ComponentType[] = [
  'sample-holder',
  'translation-stage',
  'delay-stage',
]

export const STAGE_FINISH_OPTIONS: Array<{
  id: StageFinishId
  label: string
}> = [
  { id: 'silver-machined', label: 'Silver machined' },
  { id: 'graphite', label: 'Graphite' },
  { id: 'black-anodized', label: 'Black anodized' },
  { id: 'clear-anodized', label: 'Clear anodized' },
]

export const SAMPLE_MATERIAL_OPTIONS: Array<{
  id: SampleMaterialId
  label: string
}> = [
  { id: 'generic-chip', label: 'Generic chip' },
  { id: 'ti-sapphire', label: 'Ti:Sapphire' },
  { id: 'tin', label: 'TiN' },
  { id: 'glass', label: 'Glass' },
  { id: 'silicon', label: 'Silicon' },
  { id: 'sapphire', label: 'Sapphire' },
]

const STAGE_FINISH_APPEARANCES: Record<StageFinishId, StageFinishAppearance> = {
  'silver-machined': {
    accentFill: '#c1c7cc',
    accentStroke: '#f3f8fc',
    label: 'Silver machined',
    realisticFinish: 'silver-machined',
    renderFill: '#8f979d',
    renderStroke: '#e6edf2',
  },
  graphite: {
    accentFill: '#515c66',
    accentStroke: '#d6e0e6',
    label: 'Graphite',
    realisticFinish: 'graphite',
    renderFill: '#59636d',
    renderStroke: '#d6dde3',
  },
  'black-anodized': {
    accentFill: '#2f3941',
    accentStroke: '#dbe5ec',
    label: 'Black anodized',
    realisticFinish: 'graphite',
    renderFill: '#384148',
    renderStroke: '#dae4eb',
  },
  'clear-anodized': {
    accentFill: '#b3bcc2',
    accentStroke: '#edf4f9',
    label: 'Clear anodized',
    realisticFinish: 'silver-machined',
    renderFill: '#7e8b95',
    renderStroke: '#edf4f8',
  },
}

const SAMPLE_MATERIAL_APPEARANCES: Record<SampleMaterialId, SampleMaterialAppearance> = {
  'generic-chip': {
    accentFill: '#5c6872',
    accentStroke: '#e7eef5',
    label: 'Generic chip',
    realisticFinish: 'cool-metal',
    renderFill: '#5f6770',
    renderStroke: '#e2eaf2',
  },
  'ti-sapphire': {
    accentFill: '#4f5fb2',
    accentStroke: '#dae2ff',
    label: 'Ti:Sapphire',
    realisticFinish: 'cool-metal',
    renderFill: '#6173c7',
    renderStroke: '#dce4ff',
  },
  tin: {
    accentFill: '#8b7b4d',
    accentStroke: '#f0e2ac',
    label: 'TiN',
    realisticFinish: 'warm-metal',
    renderFill: '#a68c3f',
    renderStroke: '#f6df8a',
  },
  glass: {
    accentFill: '#7fb6c3',
    accentStroke: '#e1f7ff',
    label: 'Glass',
    realisticFinish: 'cool-metal',
    renderFill: '#8fd0dc',
    renderStroke: '#e2f9ff',
  },
  silicon: {
    accentFill: '#59616d',
    accentStroke: '#e4ebf2',
    label: 'Silicon',
    realisticFinish: 'graphite',
    renderFill: '#6e7681',
    renderStroke: '#ebf2f8',
  },
  sapphire: {
    accentFill: '#6485d9',
    accentStroke: '#e0ebff',
    label: 'Sapphire',
    realisticFinish: 'cool-metal',
    renderFill: '#6f8fe3',
    renderStroke: '#e3edff',
  },
}

export function isStageComponentType(type: ComponentType) {
  return STAGE_COMPONENT_TYPES.includes(type)
}

export function getStageFinishAppearance(finishId: StageFinishId = 'silver-machined') {
  return STAGE_FINISH_APPEARANCES[finishId]
}

export function getSampleMaterialAppearance(
  materialId: SampleMaterialId = 'generic-chip',
) {
  return SAMPLE_MATERIAL_APPEARANCES[materialId]
}

const STAGE_SAMPLE_CHILD_TYPES: ComponentType[] = ['sample']
const STAGE_OPTIC_CHILD_TYPES: ComponentType[] = [
  'optic-mount',
  'mirror',
  'folded-mirror-pair',
  'curved-mirror',
  'beamsplitter',
  'lens',
  'filter',
  'attenuator',
  'polarizer',
  'waveplate',
  'iris',
  'bbo-crystal',
  'fiber-coupler',
  'detector',
]

const MOUNTED_COMPONENT_TYPES: ComponentType[] = [
  'mirror',
  'folded-mirror-pair',
  'curved-mirror',
  'beamsplitter',
  'lens',
  'filter',
  'attenuator',
  'iris',
  'polarizer',
  'waveplate',
  'bbo-crystal',
  'telescope',
  'fiber-coupler',
  'detector',
]

export const DEFAULT_POST_HOLDER_DIAMETER_MM = 20

const POST_MOUNTED_TYPES: ComponentType[] = [
  'mirror',
  'curved-mirror',
  'beamsplitter',
  'lens',
  'filter',
  'attenuator',
  'polarizer',
  'waveplate',
  'iris',
  'detector',
]

export function isPostMountedType(type: ComponentType) {
  return POST_MOUNTED_TYPES.includes(type)
}

function includesDefaultMount(type: ComponentType) {
  return MOUNTED_COMPONENT_TYPES.includes(type)
}

function getDefaultMountVisual(
  type: ComponentType,
  footprintBoundsMm: BoundsMm,
): {
  boundsMm?: BoundsMm
  renderHint?: ComponentRenderHint
} {
  switch (type) {
    case 'mirror':
    case 'folded-mirror-pair':
      return {
        boundsMm: bounds(-14, -14, 28, 28),
        renderHint: renderHint('circle', '#29333d', '#9fb3bf', 'mount'),
      }
    case 'curved-mirror':
    case 'beamsplitter':
    case 'filter':
    case 'lens':
      return {
        boundsMm: bounds(-19, -19, 38, 38),
        renderHint: renderHint('circle', '#29333d', '#9fb3bf', 'mount'),
      }
    case 'iris':
      return {
        boundsMm: bounds(-21, -21, 42, 42),
        renderHint: renderHint('circle', '#2a332d', '#aac39f', 'mount'),
      }
    case 'polarizer':
    case 'waveplate':
      return {
        boundsMm: bounds(-19, -19, 38, 38),
        renderHint: renderHint('circle', '#2e313d', '#c9cdd7', 'mount'),
      }
    case 'bbo-crystal':
      return {
        boundsMm: bounds(-18, -14, 36, 28),
        renderHint: renderHint('rect', '#362d45', '#cfc0ef', 'mount'),
      }
    case 'telescope':
      return {
        boundsMm: bounds(-28, -18, 56, 36),
        renderHint: renderHint('capsule', '#28333d', '#98b0c7', 'support'),
      }
    case 'fiber-coupler':
      return {
        boundsMm: bounds(-24, -18, 48, 36),
        renderHint: renderHint('capsule', '#21353c', '#8fb7bf', 'support'),
      }
    case 'detector':
      return {
        boundsMm: bounds(-20, -20, 40, 40),
        renderHint: renderHint('circle', '#3b3238', '#d8bcc8', 'support'),
      }
    default:
      return {
        boundsMm:
          footprintBoundsMm.width > 0 && footprintBoundsMm.height > 0
            ? footprintBoundsMm
            : undefined,
      }
  }
}

function mergePhysics(
  base: ComponentBeamPhysics,
  next?: ComponentBeamPhysics,
): ComponentBeamPhysics {
  return next ?? base
}

function sourcePhysics(minNm: number, maxNm: number): ComponentBeamPhysics {
  return {
    kind: 'source',
    opticalApertureMm: 8,
    supportedWavelengthNm: {
      minNm,
      maxNm,
    },
  }
}

function mirrorPhysics(
  minNm: number,
  maxNm: number,
  reflectivityPercent: number,
  absorptionPercent: number,
): ComponentBeamPhysics {
  return {
    kind: 'mirror',
    opticalApertureMm: 25.4,
    supportedWavelengthNm: {
      minNm,
      maxNm,
    },
    reflectivityPercent,
    designIncidenceDeg: 45,
    absorptionPercent,
  }
}

function curvedMirrorPhysics(args: {
  minNm: number
  maxNm: number
  reflectivityPercent: number
  absorptionPercent: number
  radiusOfCurvatureMm: number
  isConvex?: boolean
}): ComponentBeamPhysics {
  return {
    kind: 'curved-mirror',
    opticalApertureMm: 25.4,
    supportedWavelengthNm: {
      minNm: args.minNm,
      maxNm: args.maxNm,
    },
    reflectivityPercent: args.reflectivityPercent,
    designIncidenceDeg: 45,
    absorptionPercent: args.absorptionPercent,
    defaultRadiusOfCurvatureMm: args.radiusOfCurvatureMm,
    isConvex: args.isConvex ?? false,
  }
}

function beamsplitterPhysics(): ComponentBeamPhysics {
  return {
    kind: 'beamsplitter',
    opticalApertureMm: 25.4,
    supportedWavelengthNm: {
      minNm: 350,
      maxNm: 1100,
    },
    designIncidenceDeg: 45,
    designWavelengthNm: 800,
    defaultReflectPercent: 50,
    defaultLossPercent: 2,
    sReflectBiasPercent: 4,
    pReflectBiasPercent: -4,
  }
}

function filterPhysics(
  filterMode: 'longpass' | 'shortpass' | 'bandpass',
  args: {
    cutoffNm?: number
    centerNm?: number
    fwhmNm?: number
    peakTransmissionPercent?: number
    stopbandTransmissionPercent?: number
  },
): ComponentBeamPhysics {
  return {
    kind: 'filter',
    opticalApertureMm: 25.4,
    filterMode,
    cutoffNm: args.cutoffNm,
    centerNm: args.centerNm,
    fwhmNm: args.fwhmNm,
    peakTransmissionPercent: args.peakTransmissionPercent ?? 92,
    stopbandTransmissionPercent: args.stopbandTransmissionPercent ?? 4,
  }
}

function irisPhysics(maxApertureMm: number, defaultApertureMm: number): ComponentBeamPhysics {
  return {
    kind: 'iris',
    opticalApertureMm: maxApertureMm,
    maxApertureMm,
    defaultApertureMm,
  }
}

function attenuatorPhysics(args: {
  transmissionPercent: number
  minNm: number
  maxNm: number
  apertureMm: number
  orientation: 'horizontal' | 'vertical'
}): ComponentBeamPhysics {
  return {
    kind: 'attenuator',
    opticalApertureMm: args.apertureMm,
    transmissionPercent: args.transmissionPercent,
    supportedWavelengthNm: {
      minNm: args.minNm,
      maxNm: args.maxNm,
    },
    orientation: args.orientation,
  }
}

function polarizerPhysics(
  transmissionPercent: number,
  extinctionRatio: number,
  apertureMm: number,
): ComponentBeamPhysics {
  return {
    kind: 'polarizer',
    opticalApertureMm: apertureMm,
    transmissionPercent,
    extinctionRatio,
    supportedWavelengthNm: {
      minNm: 300,
      maxNm: 2000,
    },
  }
}

function waveplatePhysics(
  retardanceDeg: number,
  transmissionPercent: number,
  apertureMm: number,
): ComponentBeamPhysics {
  return {
    kind: 'waveplate',
    opticalApertureMm: apertureMm,
    transmissionPercent,
    supportedWavelengthNm: {
      minNm: 300,
      maxNm: 2000,
    },
    defaultRetardanceDeg: retardanceDeg,
  }
}

function delayLinePhysics(
  relayRole: 'manual-stage' | 'motorized-stage' | 'periscope',
  defaultTravelMm: number,
  apertureMm: number,
  transmissionPercent = 97,
): ComponentBeamPhysics {
  return {
    kind: 'delay-line',
    opticalApertureMm: apertureMm,
    transmissionPercent,
    supportedWavelengthNm: {
      minNm: 250,
      maxNm: 2200,
    },
    defaultTravelMm,
    relayRole,
  }
}

function telescopePhysics(args: {
  mode: 'transmission' | 'reflection'
  element1Mm: number
  element2Mm: number
  separationMm: number
  clearApertureMm: number
  transmissionPercent?: number
}): ComponentBeamPhysics {
  return {
    kind: 'telescope',
    opticalApertureMm: args.clearApertureMm,
    transmissionPercent: args.transmissionPercent ?? 96,
    supportedWavelengthNm: {
      minNm: 250,
      maxNm: 2200,
    },
    mode: args.mode,
    defaultElement1Mm: args.element1Mm,
    defaultElement2Mm: args.element2Mm,
    defaultSeparationMm: args.separationMm,
    defaultClearApertureMm: args.clearApertureMm,
  }
}

function opaWhiteLightPhysics(
  outputWavelengthNm: number,
  outputBandwidthNm: number,
  efficiencyPercent: number,
): ComponentBeamPhysics {
  return {
    kind: 'opa-white-light',
    opticalApertureMm: 6,
    transmissionPercent: 92,
    supportedWavelengthNm: {
      minNm: 350,
      maxNm: 1200,
    },
    defaultOutputWavelengthNm: outputWavelengthNm,
    defaultOutputBandwidthNm: outputBandwidthNm,
    defaultConversionEfficiencyPercent: efficiencyPercent,
  }
}

function opaCombinerPhysics(): ComponentBeamPhysics {
  return {
    kind: 'opa-combiner',
    opticalApertureMm: 8,
    transmissionPercent: 95,
    supportedWavelengthNm: {
      minNm: 250,
      maxNm: 2200,
    },
  }
}

function opaGainPhysics(args: {
  signalWavelengthNm: number
  idlerWavelengthNm: number
  bandwidthNm: number
  efficiencyPercent: number
}): ComponentBeamPhysics {
  return {
    kind: 'opa-gain',
    opticalApertureMm: 8,
    transmissionPercent: 94,
    supportedWavelengthNm: {
      minNm: 250,
      maxNm: 2400,
    },
    defaultSignalWavelengthNm: args.signalWavelengthNm,
    defaultIdlerWavelengthNm: args.idlerWavelengthNm,
    defaultBandwidthNm: args.bandwidthNm,
    defaultConversionEfficiencyPercent: args.efficiencyPercent,
  }
}

function relayPhysics(transmissionPercent: number, apertureMm: number): ComponentBeamPhysics {
  return {
    kind: 'relay',
    opticalApertureMm: apertureMm,
    transmissionPercent,
    supportedWavelengthNm: {
      minNm: 250,
      maxNm: 2200,
    },
  }
}

function lensPhysics(
  focalLengthMm: number,
  clearApertureMm: number,
  transmissionPercent = 97,
): ComponentBeamPhysics {
  return {
    kind: 'lens',
    opticalApertureMm: clearApertureMm,
    transmissionPercent,
    supportedWavelengthNm: {
      minNm: 350,
      maxNm: 1600,
    },
    defaultFocalLengthMm: focalLengthMm,
    defaultClearApertureMm: clearApertureMm,
  }
}

function terminalPhysics(
  role: 'beam-dump' | 'detector' | 'spectrometer' | 'fiber-coupler',
  opticalApertureMm: number,
  transmissionPercent: number,
): ComponentBeamPhysics {
  return {
    kind: 'terminal',
    opticalApertureMm,
    role,
    transmissionPercent,
  }
}

function nonePhysics(): ComponentBeamPhysics {
  return {
    kind: 'none',
  }
}

function bboPhysics(defaultPhaseMatchingAngleDeg: number): ComponentBeamPhysics {
  return {
    kind: 'bbo',
    crystalType: 'type-i',
    opticalApertureMm: 8,
    supportedFundamentalNm: {
      minNm: 480,
      maxNm: 1300,
    },
    defaultThicknessUm: 10,
    defaultPhaseMatchingAngleDeg,
  }
}

export const COMPONENT_CATEGORY_LABELS: Record<ComponentCategory, string> = {
  source: 'Sources',
  steering: 'Steering',
  splitting: 'Splitters',
  attenuation: 'Attenuation',
  focusing: 'Focusing',
  conditioning: 'Filters',
  aperture: 'Apertures',
  nonlinear: 'Nonlinear',
  sample: 'Samples',
  coupling: 'Coupling',
  measurement: 'Measurement',
  termination: 'Termination',
  mounting: 'Mounting',
}

export const COMPONENT_CATEGORY_ORDER: ComponentCategory[] = [
  'source',
  'steering',
  'splitting',
  'attenuation',
  'conditioning',
  'aperture',
  'nonlinear',
  'focusing',
  'sample',
  'coupling',
  'measurement',
  'termination',
  'mounting',
]

export const COMPONENT_DEFINITIONS: ComponentDefinition[] = [
  {
    type: 'laser-source',
    category: 'source',
    defaultLabel: 'Laser Source',
    familyLabel: 'Laser Source',
    defaultVariantId: 'fs-source-head',
    footprintBoundsMm: bounds(-38, -14, 76, 28),
    visualBodyBoundsMm: bounds(-34, -10, 68, 20),
    hitBoundsMm: bounds(-42, -18, 84, 36),
    mount: mount('external-source', -38, -14, 76, 28),
    opticalCenterMm: { x: 8, y: 0 },
    ports: [port('output', 'Output', 'beam-output', 38, 0, 'east')],
    renderHint: renderHint('capsule', '#163949', '#8ad6ff', 'laser'),
    realisticVisualPreset: realisticVisualPreset('laser-source', 'teal-anodized', 'none', {
      accentFill: '#2b5b6d',
      accentStroke: '#aee8ff',
    }),
    physics: sourcePhysics(480, 1300),
    recommendedHardware: {
      mount: 'External source shelf or rail mount',
    },
    variants: [
      {
        id: 'fs-source-head',
        label: 'Femtosecond Source Head',
        shortLabel: 'FS Source',
        description: 'External off-board ultrafast source head for FROG and SHG planning.',
        renderHint: {
          glyph: 'laser-fs-source',
        },
      },
      {
        id: 'compact-table-source',
        label: 'Compact Table Source',
        shortLabel: 'Table Source',
        description: 'Small table-mounted example source for quick table layouts and target alignment.',
        footprintBoundsMm: bounds(-135, -58, 270, 116),
        visualBodyBoundsMm: bounds(-126, -50, 252, 100),
        hitBoundsMm: bounds(-148, -70, 296, 140),
        mount: mount('hole-mounted', -135, -58, 270, 116),
        opticalCenterMm: { x: 110, y: 0 },
        ports: [port('output', 'Output', 'beam-output', 135, 0, 'east')],
        renderHint: {
          shape: 'capsule',
          fill: '#4b6d7f',
          stroke: '#c5e8f8',
          glyph: 'laser-compact-table',
        },
        realisticVisualPreset: {
          finish: 'teal-anodized',
          accentFill: '#345364',
          accentStroke: '#d7f5ff',
        },
      },
      {
        id: 'libra',
        label: 'Coherent Libra',
        shortLabel: 'Coherent Libra',
        vendor: 'Coherent',
        sku: 'LIBRA',
        description: 'Table-mounted Libra class laser body.',
        footprintBoundsMm: bounds(-625, -400, 1250, 800),
        visualBodyBoundsMm: bounds(-610, -385, 1220, 770),
        hitBoundsMm: bounds(-640, -415, 1280, 830),
        mount: mount('hole-mounted', -625, -400, 1250, 800),
        opticalCenterMm: { x: 560, y: 0 },
        ports: [port('output', 'Output', 'beam-output', 625, 0, 'east')],
        renderHint: {
          shape: 'rect',
          fill: '#8b928f',
          stroke: '#dce3df',
          glyph: 'laser-libra',
        },
        realisticVisualPreset: {
          finish: 'silver-machined',
          accentFill: '#656d76',
          accentStroke: '#f2f7fa',
        },
      },
      {
        id: 'pharos-body',
        label: 'Light Conversion Pharos',
        shortLabel: 'Pharos',
        vendor: 'Light Conversion',
        sku: 'PHAROS',
        description: 'Table-mounted Pharos laser body with practical default footprint.',
        footprintBoundsMm: bounds(-500, -250, 1000, 500),
        visualBodyBoundsMm: bounds(-488, -238, 976, 476),
        hitBoundsMm: bounds(-516, -266, 1032, 532),
        mount: mount('hole-mounted', -500, -250, 1000, 500),
        opticalCenterMm: { x: 445, y: 0 },
        ports: [port('output', 'Output', 'beam-output', 500, 0, 'east')],
        renderHint: {
          shape: 'rect',
          fill: '#798892',
          stroke: '#c7d7e2',
          glyph: 'laser-pharos',
        },
        realisticVisualPreset: {
          finish: 'silver-machined',
          accentFill: '#5f7280',
          accentStroke: '#e7f2fa',
        },
      },
      {
        id: 'clark-ti-sapphire',
        label: 'Clark Ti:Sapphire',
        shortLabel: 'Clark Ti:Sapph',
        vendor: 'Clark',
        sku: 'TI-SAPPHIRE',
        description: 'Table-mounted Ti:sapphire oscillator or amplifier body.',
        footprintBoundsMm: bounds(-450, -225, 900, 450),
        visualBodyBoundsMm: bounds(-438, -213, 876, 426),
        hitBoundsMm: bounds(-468, -243, 936, 486),
        mount: mount('hole-mounted', -450, -225, 900, 450),
        opticalCenterMm: { x: 395, y: 0 },
        ports: [port('output', 'Output', 'beam-output', 450, 0, 'east')],
        renderHint: {
          shape: 'rect',
          fill: '#6d7d88',
          stroke: '#c8d7df',
          glyph: 'laser-clark',
        },
        realisticVisualPreset: {
          finish: 'silver-machined',
          accentFill: '#61727d',
          accentStroke: '#e9f1f7',
        },
      },
    ],
  },
  {
    type: 'optic-mount',
    category: 'mounting',
    defaultLabel: 'Optic Mount',
    familyLabel: 'Optic Mount',
    defaultVariantId: 'km100',
    footprintBoundsMm: bounds(-17, -17, 34, 34),
    mount: mount('clamp-capable', -9, -9, 18, 18),
    opticalCenterMm: { x: 0, y: 0 },
    ports: [],
    renderHint: renderHint('rect', '#36444d', '#c1d0d8', 'mount'),
    physics: nonePhysics(),
    variants: [
      {
        id: 'km100',
        label: 'Kinematic Mount',
        vendor: 'Thorlabs',
        sku: 'KM100',
        description: '1 in kinematic mirror mount; good default visible-path steering mount.',
      },
      {
        id: 'km05-m',
        label: 'Kinematic Mount',
        vendor: 'Thorlabs',
        sku: 'KM05/M',
        description: '1/2 in kinematic mirror mount for tighter space.',
        footprintBoundsMm: bounds(-14, -14, 28, 28),
        mount: mount('clamp-capable', -8, -8, 16, 16),
      },
      {
        id: 'lmr1-m',
        label: 'Fixed Mount',
        vendor: 'Thorlabs',
        sku: 'LMR1/M',
        description: 'Fixed 1 in optic mount for filters or passive optics.',
      },
      {
        id: 'fm90-m',
        label: 'Flip Mount',
        vendor: 'Thorlabs',
        sku: 'FM90/M',
        description: '90 degree flip mount for routing optics in and out of the beam path.',
      },
      {
        id: 'fh2',
        label: 'Fiberport Holder',
        vendor: 'Thorlabs',
        sku: 'FH2',
        description: 'Compact holder for fiber launch hardware or slim cylindrical optomechanics.',
        footprintBoundsMm: bounds(-12, -12, 24, 24),
      },
      {
        id: 'pt101-m',
        label: 'Goniometric Tilt Platform',
        vendor: 'Thorlabs',
        sku: 'PT101/M',
        description: 'Compact tilt platform for pitch-angle adjustment of mounted optics.',
        footprintBoundsMm: bounds(-20, -18, 40, 36),
      },
      {
        id: 'rsp1-m',
        label: 'Rotation Mount',
        vendor: 'Thorlabs',
        sku: 'RSP1/M',
        description: '1 in rotation mount for waveplates, polarizers, or rotatable filters.',
        renderHint: {
          glyph: 'mount',
          stroke: '#f3d28e',
        },
      },
      {
        id: 'polaris-k1s5',
        label: 'Low-Drift Mirror Mount',
        vendor: 'Thorlabs',
        sku: 'POLARIS-K1S5',
        description: 'Premium low-drift 1 in mirror mount for stability-sensitive layouts.',
      },
      {
        id: 'km100-e02',
        label: 'Mount + Mirror Bundle',
        vendor: 'Thorlabs',
        sku: 'KM100-E02',
        description: 'KM100 mount bundled with a visible mirror; convenient starter assembly.',
      },
    ],
  },
  {
    type: 'support-hardware',
    category: 'mounting',
    defaultLabel: 'Support Hardware',
    familyLabel: 'Support Hardware',
    defaultVariantId: 'cf125c-m',
    footprintBoundsMm: bounds(-16, -12, 32, 24),
    mount: mount('clamp-capable', -10, -10, 20, 20),
    ports: [],
    renderHint: renderHint('capsule', '#324149', '#bacbd4', 'support'),
    physics: nonePhysics(),
    variants: [
      {
        id: 'cf125c-m',
        label: 'Clamping Fork',
        vendor: 'Thorlabs',
        sku: 'CF125C/M',
        description: 'Clamping fork for 1.25 in pedestal bases; standard choice.',
        footprintBoundsMm: bounds(-37.5, -18, 75, 36),
        renderHint: {
          glyph: 'support-clamp-fork',
        },
      },
      {
        id: 'cf175c-m',
        label: 'Clamping Fork',
        vendor: 'Thorlabs',
        sku: 'CF175C/M',
        description: 'Longer-slot clamping fork for awkward hole access.',
        footprintBoundsMm: bounds(-20, -12, 40, 24),
        renderHint: {
          glyph: 'support-clamp-fork',
        },
      },
      {
        id: 'ba2-m',
        label: 'Mounting Base',
        vendor: 'Thorlabs',
        sku: 'BA2/M',
        description: '50 mm × 75 mm mounting base for pedestal-style hardware.',
        footprintBoundsMm: bounds(-25, -37.5, 50, 75),
        renderHint: {
          glyph: 'support-mounting-base',
        },
      },
      {
        id: 'fp01',
        label: 'Fixed Post Mount',
        vendor: 'Thorlabs',
        sku: 'FP01',
        description: 'Compact fixed mount for slim optics or beam sampling targets.',
        footprintBoundsMm: bounds(-12.5, -12.5, 25, 25),
      },
      {
        id: 'dh1-m',
        label: 'Diode Holder',
        vendor: 'Thorlabs',
        sku: 'DH1/M',
        description: 'Pedestal-style diode holder or detector mount body.',
        footprintBoundsMm: bounds(-13, -13, 26, 26),
      },
      {
        id: 'rs1-5p4m',
        label: 'Pedestal Post',
        vendor: 'Thorlabs',
        sku: 'RS1.5P4M',
        description: '25 mm pedestal pillar post, 38 mm long, with M4 taps.',
        footprintBoundsMm: bounds(-10, -10, 20, 20),
        renderHint: {
          glyph: 'support-pedestal-post',
        },
      },
      {
        id: 'rsht1-5-m',
        label: 'Post Holder',
        vendor: 'Thorlabs',
        sku: 'RSHT1.5/M',
        description: '25 mm post holder with flexure lock, 38 mm long.',
        footprintBoundsMm: bounds(-11, -11, 22, 22),
        renderHint: {
          glyph: 'support-post-holder',
        },
      },
      {
        id: 'pedestal-assembly-31.8',
        label: 'Pedestal Assembly',
        vendor: 'Generic',
        sku: 'PED-31.8',
        description: 'Pedestal base, post, and post-holder style assembly for mounted optics.',
        footprintBoundsMm: bounds(-18, -18, 36, 36),
        renderHint: {
          glyph: 'support-pedestal-assembly',
        },
      },
      {
        id: 'linear-slide-mini',
        label: 'Linear Slide',
        vendor: 'Generic',
        sku: 'LIN-SLIDE-MINI',
        description: 'Small translation or positioning base used under compact optics.',
        footprintBoundsMm: bounds(-28, -16, 56, 32),
        renderHint: {
          glyph: 'support-linear-slide',
        },
      },
      {
        id: 'xe25l225-m',
        label: 'Long Translation Rail',
        vendor: 'Thorlabs',
        sku: 'XE25L225/M',
        description: '225 mm extrusion or rail used for compact linear travel assemblies.',
        footprintBoundsMm: bounds(-112.5, -12.5, 225, 25),
        renderHint: {
          glyph: 'support-linear-slide',
        },
      },
      {
        id: 'ab90h',
        label: 'Right-Angle Bracket',
        vendor: 'Thorlabs',
        sku: 'AB90H',
        description: 'Right-angle bracket for orthogonal mounting between posts, plates, or stages.',
        footprintBoundsMm: bounds(-20, -20, 40, 40),
      },
      {
        id: 'beam-block-plate',
        label: 'Beam Block / Plate Holder',
        vendor: 'Generic',
        sku: 'PLATE-BLOCK',
        description: 'Opaque plate or beam-block style hardware.',
        footprintBoundsMm: bounds(-20, -14, 40, 28),
        renderHint: {
          glyph: 'support-beam-block',
        },
      },
      {
        id: 'cl5',
        label: 'Clamp Arm',
        vendor: 'Thorlabs',
        sku: 'CL5',
        description: 'Compact clamp arm or utility hold-down for odd mechanical assemblies.',
        footprintBoundsMm: bounds(-20, -10, 40, 20),
      },
      {
        id: 'cf038c-m',
        label: 'Compact Clamping Fork',
        vendor: 'Thorlabs',
        sku: 'CF038C/M',
        description: 'Compact clamping fork for smaller pedestal bases or tight access.',
        footprintBoundsMm: bounds(-24, -12, 48, 24),
        renderHint: {
          glyph: 'support-clamp-fork',
        },
      },
      {
        id: 'ph20e-m',
        label: 'Pedestal Post',
        vendor: 'Thorlabs',
        sku: 'PH20E/M',
        description: '20 mm pedestal post for compact mounted optics.',
        footprintBoundsMm: bounds(-8, -8, 16, 16),
        renderHint: {
          glyph: 'support-pedestal-post',
        },
      },
      {
        id: 'ph40e-m',
        label: 'Pedestal Post',
        vendor: 'Thorlabs',
        sku: 'PH40E/M',
        description: '40 mm pedestal post for mounted optics or detectors.',
        footprintBoundsMm: bounds(-8, -8, 16, 16),
        renderHint: {
          glyph: 'support-pedestal-post',
        },
      },
      {
        id: 'ph50e-m',
        label: 'Pedestal Post',
        vendor: 'Thorlabs',
        sku: 'PH50E/M',
        description: '50 mm pedestal post for mounted optics or larger assemblies.',
        footprintBoundsMm: bounds(-8, -8, 16, 16),
        renderHint: {
          glyph: 'support-pedestal-post',
        },
      },
      {
        id: 'tr20-m',
        label: 'Pedestal Post Holder',
        vendor: 'Thorlabs',
        sku: 'TR20/M',
        description: '20 mm pedestal post holder block.',
        footprintBoundsMm: bounds(-10, -10, 20, 20),
        renderHint: {
          glyph: 'support-post-holder',
        },
      },
      {
        id: 'tr30-m',
        label: 'Pedestal Post Holder',
        vendor: 'Thorlabs',
        sku: 'TR30/M',
        description: '30 mm pedestal post holder block.',
        footprintBoundsMm: bounds(-10, -10, 20, 20),
        renderHint: {
          glyph: 'support-post-holder',
        },
      },
      {
        id: 'tr40-m',
        label: 'Pedestal Post Holder',
        vendor: 'Thorlabs',
        sku: 'TR40/M',
        description: '40 mm pedestal post holder block.',
        footprintBoundsMm: bounds(-10, -10, 20, 20),
        renderHint: {
          glyph: 'support-post-holder',
        },
      },
      {
        id: 'tr50-m',
        label: 'Pedestal Post Holder',
        vendor: 'Thorlabs',
        sku: 'TR50/M',
        description: '50 mm pedestal post holder block.',
        footprintBoundsMm: bounds(-10, -10, 20, 20),
        renderHint: {
          glyph: 'support-post-holder',
        },
      },
      {
        id: 'tr75-m',
        label: 'Pedestal Post Holder',
        vendor: 'Thorlabs',
        sku: 'TR75/M',
        description: '75 mm pedestal post holder block.',
        footprintBoundsMm: bounds(-10, -10, 20, 20),
        renderHint: {
          glyph: 'support-post-holder',
        },
      },
      {
        id: 'manual-delay-axis',
        label: 'Manual Delay Axis',
        vendor: 'Generic',
        sku: 'DELAY-MANUAL',
        description: 'Manual delay axis with knob-driven travel for OPA timing paths.',
        footprintBoundsMm: bounds(-80, -30, 160, 60),
        visualBodyBoundsMm: bounds(-74, -22, 148, 44),
        hitBoundsMm: bounds(-84, -34, 168, 68),
        renderHint: {
          glyph: 'support-linear-slide',
        },
        opticalCenterMm: { x: 0, y: 0 },
        ports: [
          port('west', 'Input', 'beam-input', -80, 0, 'west'),
          port('east', 'Output', 'beam-output', 80, 0, 'east'),
        ],
        physics: delayLinePhysics('manual-stage', 75, 18, 97),
      },
      {
        id: 'periscope',
        label: 'Periscope',
        vendor: 'Generic',
        sku: 'PERISCOPE',
        description: 'Periscope assembly for beam-height transfer between planes.',
        footprintBoundsMm: bounds(-22, -48, 44, 96),
        visualBodyBoundsMm: bounds(-16, -42, 32, 84),
        hitBoundsMm: bounds(-26, -52, 52, 104),
        renderHint: {
          glyph: 'support-periscope',
        },
        opticalCenterMm: { x: 0, y: 0 },
        ports: [
          port('south', 'Input', 'beam-input', 0, 48, 'south'),
          port('north', 'Output', 'beam-output', 0, -48, 'north'),
        ],
        physics: relayPhysics(95, 12),
      },
      {
        id: 'white-light-cell',
        label: 'White-Light Generator',
        vendor: 'Generic',
        sku: 'WLG',
        description: 'White-light generation hardware block for OPA-style layouts.',
        footprintBoundsMm: bounds(-18, -18, 36, 36),
        renderHint: {
          glyph: 'support-white-light-cell',
        },
      },
      {
        id: 'pump-seed-combiner',
        label: 'Pump / Seed Assembly',
        vendor: 'Generic',
        sku: 'PUMP-SEED',
        description: 'Mechanically distinct pump and seed handling hardware.',
        footprintBoundsMm: bounds(-26, -18, 52, 36),
        renderHint: {
          glyph: 'support-pump-seed-combiner',
        },
      },
    ],
  },
  {
    type: 'mirror',
    category: 'steering',
    defaultLabel: 'Planar Mirror',
    familyLabel: 'Mirror',
    defaultVariantId: 'bb1-e02',
    footprintBoundsMm: bounds(-12.7, -12.7, 25.4, 25.4),
    visualBodyBoundsMm: bounds(-7.5, -7.5, 15, 15),
    mountVisualBoundsMm: bounds(-16, -16, 32, 32),
    hitBoundsMm: bounds(-14, -14, 28, 28),
    mount: mount('clamp-capable', -9, -9, 18, 18),
    opticalCenterMm: { x: 0, y: 0 },
    ports: [
      port('input-west', 'Input', 'beam-input', -12.7, 0, 'west'),
      port('output-north', 'Reflected', 'beam-output', 0, -12.7, 'north'),
    ],
    renderHint: renderHint('rect', '#4b545d', '#e0e7ec', 'mirror'),
    mountRenderHint: renderHint('circle', 'rgba(53, 63, 72, 0.86)', '#93a4af', 'mount'),
    realisticVisualPreset: realisticVisualPreset('mirror', 'cool-metal', 'kinematic-round', {
      glassTint: '#dbeaf4',
      accentFill: '#4d5760',
      accentStroke: '#f2f7fb',
    }),
    physics: mirrorPhysics(400, 750, 98.5, 1),
    recommendedHardware: {
      mount: 'Thorlabs KM100',
      post: 'RS1.5P4M + RSHT1.5/M',
    },
    variants: [
      {
        id: 'bb1-e02',
        label: 'Broadband Dielectric Mirror',
        vendor: 'Thorlabs',
        sku: 'BB1-E02',
        description: '1 in broadband dielectric mirror, 400-750 nm.',
        physics: mirrorPhysics(400, 750, 98.8, 0.8),
      },
      {
        id: 'pf10-03-p01',
        label: 'Protected Silver Mirror',
        vendor: 'Thorlabs',
        sku: 'PF10-03-P01',
        description: '1 in protected silver mirror; broad general-purpose option.',
        physics: mirrorPhysics(450, 2000, 96.5, 1.8),
      },
      {
        id: 'pf10-03-f01',
        label: 'UV-Enhanced Aluminum Mirror',
        vendor: 'Thorlabs',
        sku: 'PF10-03-F01',
        description: '1 in UV-enhanced aluminum mirror for post-BBO UV steering.',
        physics: mirrorPhysics(250, 700, 89, 4),
      },
      {
        id: 'flip-mirror',
        label: 'Flip Mirror',
        vendor: 'Generic',
        sku: 'FLIP-MIRROR',
        description:
          'Flip mount mirror with two states: down reflects into a branch, up passes the beam straight through.',
        renderHint: {
          glyph: 'mirror-flip',
        },
        physics: mirrorPhysics(450, 2000, 96.5, 1.8),
      },
    ],
  },
  {
    type: 'folded-mirror-pair',
    category: 'steering',
    defaultLabel: 'Folded Mirror Pair',
    familyLabel: 'Folded Mirror Pair',
    defaultVariantId: 'compact-45-folded-pair',
    footprintBoundsMm: bounds(-14, -14, 28, 28),
    visualBodyBoundsMm: bounds(-12, -12, 24, 24),
    mountVisualBoundsMm: bounds(-14, -14, 28, 28),
    hitBoundsMm: bounds(-15, -15, 30, 30),
    mount: mount('clamp-capable', -14, -14, 28, 28),
    opticalCenterMm: { x: 0, y: 0 },
    ports: [],
    renderHint: renderHint('rect', '#4b545d', '#dbeaf4', 'folded-mirror-pair'),
    mountRenderHint: renderHint('circle', 'rgba(53, 63, 72, 0.86)', '#93a4af', 'mount'),
    physics: nonePhysics(),
    recommendedHardware: {
      mount: 'Compact two-mirror delay-line carriage',
      post: 'Stage-top payload or compact pedestal assembly',
    },
    variants: [
      {
        id: 'compact-45-folded-pair',
        label: 'Compact 45 deg Folded Pair',
        vendor: 'Generic',
        sku: 'FOLDED-PAIR-45',
        description:
          'Two full-size planar mirror faces joined at the back and opening at positive and negative 45 degrees for folded steering layouts.',
      },
      {
        id: 'frog-delay-retroreflector',
        label: 'FROG Delay Retroreflector',
        vendor: 'Generic',
        sku: 'FROG-RETRO-PAIR',
        description:
          'Stage-top pair of full-size planar mirrors joined at the back for FROG-style delay scanning; the parent delay stage owns timing semantics.',
      },
    ],
  },
  {
    type: 'curved-mirror',
    category: 'steering',
    defaultLabel: 'Curved Mirror',
    familyLabel: 'Curved Mirror',
    defaultVariantId: 'concave-1in',
    footprintBoundsMm: bounds(-12.7, -12.7, 25.4, 25.4),
    visualBodyBoundsMm: bounds(-7.5, -7.5, 15, 15),
    mountVisualBoundsMm: bounds(-16, -16, 32, 32),
    hitBoundsMm: bounds(-14, -14, 28, 28),
    mount: mount('clamp-capable', -9, -9, 18, 18),
    opticalCenterMm: { x: 0, y: 0 },
    ports: [
      port('input-west', 'Input', 'beam-input', -12.7, 0, 'west'),
      port('output-north', 'Reflected', 'beam-output', 0, -12.7, 'north'),
    ],
    renderHint: renderHint('rect', '#4b545d', '#c8d8e4', 'curved-mirror'),
    mountRenderHint: renderHint('circle', 'rgba(53, 63, 72, 0.86)', '#93a4af', 'mount'),
    realisticVisualPreset: realisticVisualPreset('mirror', 'cool-metal', 'kinematic-round', {
      glassTint: '#dbeaf4',
      accentFill: '#4d5760',
      accentStroke: '#f2f7fb',
    }),
    physics: curvedMirrorPhysics({
      minNm: 350,
      maxNm: 1600,
      reflectivityPercent: 96,
      absorptionPercent: 1.5,
      radiusOfCurvatureMm: 200,
    }),
    recommendedHardware: {
      mount: 'Thorlabs KM100',
      post: 'RS1.5P4M + RSHT1.5/M',
    },
    variants: [
      {
        id: 'concave-1in',
        label: 'Concave Mirror',
        vendor: 'Generic',
        sku: 'CONCAVE-1IN',
        description: '1 in concave mirror with spherical reflective curvature.',
        physics: curvedMirrorPhysics({
          minNm: 350,
          maxNm: 1600,
          reflectivityPercent: 96,
          absorptionPercent: 1.5,
          radiusOfCurvatureMm: 200,
        }),
      },
      {
        id: 'convex-1in',
        label: 'Convex Mirror',
        vendor: 'Generic',
        sku: 'CONVEX-1IN',
        description: '1 in convex mirror with spherical reflective curvature.',
        physics: curvedMirrorPhysics({
          minNm: 350,
          maxNm: 1600,
          reflectivityPercent: 95,
          absorptionPercent: 2,
          radiusOfCurvatureMm: 250,
          isConvex: true,
        }),
      },
    ],
  },
  {
    type: 'beamsplitter',
    category: 'splitting',
    defaultLabel: 'Beamsplitter',
    familyLabel: 'Beamsplitter',
    defaultVariantId: 'plate-1in',
    footprintBoundsMm: bounds(-12.7, -12.7, 25.4, 25.4),
    visualBodyBoundsMm: bounds(-8, -8, 16, 16),
    mountVisualBoundsMm: bounds(-16, -16, 32, 32),
    hitBoundsMm: bounds(-14, -14, 28, 28),
    mount: mount('clamp-capable', -9, -9, 18, 18),
    opticalCenterMm: { x: 0, y: 0 },
    ports: [
      port('west', 'West', 'beam-bidirectional', -12.7, 0, 'west'),
      port('east', 'East', 'beam-bidirectional', 12.7, 0, 'east'),
      port('north', 'North', 'beam-bidirectional', 0, -12.7, 'north'),
      port('south', 'South', 'beam-bidirectional', 0, 12.7, 'south'),
    ],
    renderHint: renderHint('diamond', '#1f4b5d', '#9dd2d8', 'beamsplitter'),
    mountRenderHint: renderHint('circle', 'rgba(53, 63, 72, 0.86)', '#8ea3af', 'mount'),
    realisticVisualPreset: realisticVisualPreset(
      'beamsplitter',
      'cool-metal',
      'kinematic-round',
      {
        glassTint: '#88d0db',
        accentFill: '#2f5f6f',
        accentStroke: '#d7f4fb',
      },
    ),
    physics: beamsplitterPhysics(),
    recommendedHardware: {
      mount: 'Thorlabs KM100 or equivalent 1 in optic mount',
      post: 'RS1.5P4M + RSHT1.5/M',
    },
    variants: [
      {
        id: 'plate-1in',
        label: '1 in Plate Beamsplitter',
        description: 'Generic 1 in plate beamsplitter with user-defined ratio and loss.',
      },
      {
        id: 'bsw10',
        label: 'Visible Wedge Beamsplitter',
        vendor: 'Thorlabs',
        sku: 'BSW10',
        description: '1 in visible wedge beamsplitter with practical 50:50 default behavior.',
        physics: {
          kind: 'beamsplitter',
          opticalApertureMm: 25.4,
          supportedWavelengthNm: {
            minNm: 450,
            maxNm: 700,
          },
          designIncidenceDeg: 45,
          designWavelengthNm: 550,
          defaultReflectPercent: 50,
          defaultLossPercent: 3,
          sReflectBiasPercent: 4,
          pReflectBiasPercent: -4,
        },
      },
    ],
  },
  {
    type: 'lens',
    category: 'focusing',
    defaultLabel: 'Lens',
    familyLabel: 'Lens',
    defaultVariantId: 'thin-lens-100mm',
    footprintBoundsMm: bounds(-12.7, -18, 25.4, 36),
    visualBodyBoundsMm: bounds(-7.5, -14, 15, 28),
    mountVisualBoundsMm: bounds(-16, -16, 32, 32),
    hitBoundsMm: bounds(-15, -20, 30, 40),
    mount: mount('clamp-capable', -9, -9, 18, 18),
    opticalCenterMm: { x: 0, y: 0 },
    ports: [
      port('west', 'Input', 'beam-input', -12.7, 0, 'west'),
      port('east', 'Output', 'beam-output', 12.7, 0, 'east'),
    ],
    renderHint: renderHint('rect', '#5a4730', '#ffcf79', 'lens'),
    mountRenderHint: renderHint('circle', 'rgba(69, 57, 35, 0.84)', '#d8b57e', 'mount'),
    realisticVisualPreset: realisticVisualPreset('lens', 'warm-metal', 'kinematic-round', {
      glassTint: '#8fd5ff',
      accentFill: '#886643',
      accentStroke: '#f9e2b8',
    }),
    physics: lensPhysics(100, 22),
    recommendedHardware: {
      mount: 'Thorlabs LMR1/M',
      post: 'RS1.5P4M + RSHT1.5/M',
    },
    variants: [
      {
        id: 'thin-lens-50mm',
        label: '50 mm Thin Lens',
        description: 'Generic thin lens preset with 50 mm focal length and 22 mm clear aperture.',
        physics: lensPhysics(50, 22),
      },
      {
        id: 'thin-lens-75mm',
        label: '75 mm Thin Lens',
        description: 'Generic thin lens preset with 75 mm focal length and 22 mm clear aperture.',
        physics: lensPhysics(75, 22),
      },
      {
        id: 'thin-lens-100mm',
        label: '100 mm Thin Lens',
        description: 'Generic thin lens preset with 100 mm focal length and 22 mm clear aperture.',
        physics: lensPhysics(100, 22),
      },
      {
        id: 'thin-lens-150mm',
        label: '150 mm Thin Lens',
        description: 'Generic thin lens preset with 150 mm focal length and 22 mm clear aperture.',
        physics: lensPhysics(150, 22),
      },
      {
        id: 'thin-lens-200mm',
        label: '200 mm Thin Lens',
        description: 'Generic thin lens preset with 200 mm focal length and 24 mm clear aperture.',
        physics: lensPhysics(200, 24),
      },
      {
        id: 'thin-lens-300mm',
        label: '300 mm Thin Lens',
        description: 'Generic thin lens preset with 300 mm focal length and 24 mm clear aperture.',
        physics: lensPhysics(300, 24),
      },
      {
        id: 'la4148-a-ab',
        label: 'Plano-Convex Lens',
        vendor: 'Thorlabs',
        sku: 'LA4148-A/AB',
        description: '1 in plano-convex lens with a practical short focal-length layout footprint.',
        physics: lensPhysics(50, 25.4),
      },
      {
        id: 'la4725-a-ab',
        label: 'Plano-Convex Lens',
        vendor: 'Thorlabs',
        sku: 'LA4725-A/AB',
        description: '1 in plano-convex lens with a medium focal-length default.',
        physics: lensPhysics(75, 25.4),
      },
      {
        id: 'la4236-a',
        label: 'Plano-Convex Lens',
        vendor: 'Thorlabs',
        sku: 'LA4236-A',
        description: '1 in plano-convex lens commonly used near 100 mm focal length.',
        physics: lensPhysics(100, 25.4),
      },
      {
        id: 'la4874-a-ab',
        label: 'Plano-Convex Lens',
        vendor: 'Thorlabs',
        sku: 'LA4874-A/AB',
        description: '1 in plano-convex lens with a longer focal-length default.',
        physics: lensPhysics(150, 25.4),
      },
      {
        id: 'la4102-ab',
        label: 'Plano-Convex Lens',
        vendor: 'Thorlabs',
        sku: 'LA4102-AB',
        description: '2 in plano-convex lens for larger beam footprints and relay optics.',
        footprintBoundsMm: bounds(-25.4, -29, 50.8, 58),
        visualBodyBoundsMm: bounds(-14, -22, 28, 44),
        mountVisualBoundsMm: bounds(-29, -29, 58, 58),
        hitBoundsMm: bounds(-27.5, -31, 55, 62),
        mount: mount('clamp-capable', -14, -14, 28, 28),
        ports: [
          port('west', 'Input', 'beam-input', -25.4, 0, 'west'),
          port('east', 'Output', 'beam-output', 25.4, 0, 'east'),
        ],
        physics: lensPhysics(200, 50.8),
      },
      {
        id: 'la4158-ab',
        label: 'Plano-Convex Lens',
        vendor: 'Thorlabs',
        sku: 'LA4158-AB',
        description: '2 in plano-convex lens for broad relay or focusing paths.',
        footprintBoundsMm: bounds(-25.4, -29, 50.8, 58),
        visualBodyBoundsMm: bounds(-14, -22, 28, 44),
        mountVisualBoundsMm: bounds(-29, -29, 58, 58),
        hitBoundsMm: bounds(-27.5, -31, 55, 62),
        mount: mount('clamp-capable', -14, -14, 28, 28),
        ports: [
          port('west', 'Input', 'beam-input', -25.4, 0, 'west'),
          port('east', 'Output', 'beam-output', 25.4, 0, 'east'),
        ],
        physics: lensPhysics(300, 50.8),
      },
    ],
  },
  {
    type: 'filter',
    category: 'conditioning',
    defaultLabel: 'Filter',
    familyLabel: 'Filter',
    defaultVariantId: 'felh0400',
    footprintBoundsMm: bounds(-12.7, -12.7, 25.4, 25.4),
    visualBodyBoundsMm: bounds(-8, -8, 16, 16),
    mountVisualBoundsMm: bounds(-16, -16, 32, 32),
    hitBoundsMm: bounds(-14, -14, 28, 28),
    mount: mount('clamp-capable', -9, -9, 18, 18),
    opticalCenterMm: { x: 0, y: 0 },
    ports: [
      port('west', 'Input', 'beam-input', -12.7, 0, 'west'),
      port('east', 'Output', 'beam-output', 12.7, 0, 'east'),
    ],
    renderHint: renderHint('rect', '#45413b', '#e8d7b6', 'filter'),
    mountRenderHint: renderHint('circle', 'rgba(62, 58, 50, 0.84)', '#c4b8a2', 'mount'),
    realisticVisualPreset: realisticVisualPreset('filter', 'warm-metal', 'kinematic-round', {
      glassTint: '#8ddbd3',
      accentFill: '#6b6150',
      accentStroke: '#e8ddd0',
    }),
    physics: filterPhysics('longpass', {
      cutoffNm: 400,
    }),
    recommendedHardware: {
      mount: 'Thorlabs LMR1/M or RSP1/M',
      post: 'RS1.5P4M + RSHT1.5/M',
    },
    variants: [
      {
        id: 'felh0400',
        label: 'Longpass Filter',
        vendor: 'Thorlabs',
        sku: 'FELH0400',
        description: '400 nm longpass filter for visible pass and deeper-UV rejection.',
        renderHint: {
          fill: '#576249',
          glyph: 'filter-longpass',
          stroke: '#efe1a6',
        },
        realisticVisualPreset: {
          accentFill: '#6e6948',
          accentStroke: '#f3e8c8',
          glassTint: '#8bd0ba',
        },
        physics: filterPhysics('longpass', {
          cutoffNm: 400,
        }),
      },
      {
        id: 'felh0450',
        label: 'Longpass Filter',
        vendor: 'Thorlabs',
        sku: 'FELH0450',
        description: '450 nm longpass filter with stronger UV rejection.',
        renderHint: {
          fill: '#5b684d',
          glyph: 'filter-longpass',
          stroke: '#f1e4ad',
        },
        realisticVisualPreset: {
          accentFill: '#706d4f',
          accentStroke: '#f4ead0',
          glassTint: '#9ad8be',
        },
        physics: filterPhysics('longpass', {
          cutoffNm: 450,
        }),
      },
      {
        id: 'fesh0600',
        label: 'Shortpass Filter',
        vendor: 'Thorlabs',
        sku: 'FESH0600',
        description: '600 nm shortpass filter for trimming longer visible/NIR light.',
        renderHint: {
          fill: '#475d71',
          glyph: 'filter-shortpass',
          stroke: '#cee6fb',
        },
        realisticVisualPreset: {
          accentFill: '#4f6782',
          accentStroke: '#e3f3ff',
          glassTint: '#90c4ff',
        },
        physics: filterPhysics('shortpass', {
          cutoffNm: 600,
        }),
      },
      {
        id: 'fesh0350',
        label: 'Shortpass Filter',
        vendor: 'Thorlabs',
        sku: 'FESH0350',
        description: '350 nm shortpass filter for separating UV SHG from visible fundamentals.',
        renderHint: {
          fill: '#42566b',
          glyph: 'filter-shortpass',
          stroke: '#c7dcff',
        },
        realisticVisualPreset: {
          accentFill: '#4d6280',
          accentStroke: '#ddeeff',
          glassTint: '#8ea7ff',
        },
        physics: filterPhysics('shortpass', {
          cutoffNm: 350,
        }),
      },
      {
        id: 'fguv5-uv',
        label: 'UV Colored-Glass Filter',
        vendor: 'Thorlabs',
        sku: 'FGUV5-UV',
        description: 'UG5 UV colored-glass filter for broad UV cleanup.',
        renderHint: {
          fill: '#6f4e2f',
          glyph: 'filter-colored-glass',
          stroke: '#ffd08a',
        },
        realisticVisualPreset: {
          accentFill: '#825e34',
          accentStroke: '#ffe1b0',
          glassTint: '#f2b46e',
        },
        physics: filterPhysics('bandpass', {
          centerNm: 330,
          fwhmNm: 120,
          peakTransmissionPercent: 78,
          stopbandTransmissionPercent: 8,
        }),
      },
      {
        id: 'fbh248-10',
        label: 'UV Bandpass Filter',
        vendor: 'Thorlabs',
        sku: 'FBH248-10',
        description: '248 nm bandpass filter with 10 nm FWHM.',
        renderHint: {
          fill: '#50456f',
          glyph: 'filter-bandpass',
          stroke: '#d7caff',
        },
        realisticVisualPreset: {
          accentFill: '#635683',
          accentStroke: '#e8defe',
          glassTint: '#b6b0ff',
        },
        physics: filterPhysics('bandpass', {
          centerNm: 248,
          fwhmNm: 10,
          peakTransmissionPercent: 72,
          stopbandTransmissionPercent: 1,
        }),
      },
      {
        id: 'fbh254-10',
        label: 'UV Bandpass Filter',
        vendor: 'Thorlabs',
        sku: 'FBH254-10',
        description: '254 nm bandpass filter with 10 nm FWHM.',
        renderHint: {
          fill: '#52476f',
          glyph: 'filter-bandpass',
          stroke: '#dacbff',
        },
        realisticVisualPreset: {
          accentFill: '#645885',
          accentStroke: '#e9dffd',
          glassTint: '#beb0ff',
        },
        physics: filterPhysics('bandpass', {
          centerNm: 254,
          fwhmNm: 10,
          peakTransmissionPercent: 72,
          stopbandTransmissionPercent: 1,
        }),
      },
      {
        id: 'fbh266-10',
        label: 'UV Bandpass Filter',
        vendor: 'Thorlabs',
        sku: 'FBH266-10',
        description: '266 nm bandpass filter with 10 nm FWHM.',
        renderHint: {
          fill: '#54486d',
          glyph: 'filter-bandpass',
          stroke: '#dfceff',
        },
        realisticVisualPreset: {
          accentFill: '#685985',
          accentStroke: '#ecdefe',
          glassTint: '#c8b7ff',
        },
        physics: filterPhysics('bandpass', {
          centerNm: 266,
          fwhmNm: 10,
          peakTransmissionPercent: 72,
          stopbandTransmissionPercent: 1,
        }),
      },
      {
        id: 'fgb37',
        label: 'Colored-Glass Filter',
        vendor: 'Thorlabs',
        sku: 'FGB37',
        description: 'Blue colored-glass filter used for visible cleanup or shortpass-style shaping.',
        renderHint: {
          fill: '#466381',
          glyph: 'filter-colored-glass',
          stroke: '#c8e1ff',
        },
        realisticVisualPreset: {
          accentFill: '#5878a0',
          accentStroke: '#deebff',
          glassTint: '#8abfff',
        },
        physics: filterPhysics('bandpass', {
          centerNm: 470,
          fwhmNm: 180,
          peakTransmissionPercent: 74,
          stopbandTransmissionPercent: 9,
        }),
      },
      {
        id: 'fgb39',
        label: 'Colored-Glass Filter',
        vendor: 'Thorlabs',
        sku: 'FGB39',
        description: 'Blue-green colored-glass filter used for broadband visible conditioning.',
        renderHint: {
          fill: '#3f6d6d',
          glyph: 'filter-colored-glass',
          stroke: '#cbf0e4',
        },
        realisticVisualPreset: {
          accentFill: '#4b8585',
          accentStroke: '#dcfaf0',
          glassTint: '#8ad7c8',
        },
        physics: filterPhysics('bandpass', {
          centerNm: 510,
          fwhmNm: 200,
          peakTransmissionPercent: 76,
          stopbandTransmissionPercent: 8,
        }),
      },
    ],
  },
  {
    type: 'attenuator',
    category: 'attenuation',
    defaultLabel: 'Attenuator',
    familyLabel: 'Attenuator',
    defaultVariantId: 'variable-nd-horizontal',
    footprintBoundsMm: bounds(-17, -17, 34, 34),
    visualBodyBoundsMm: bounds(-11, -11, 22, 22),
    mountVisualBoundsMm: bounds(-18, -18, 36, 36),
    hitBoundsMm: bounds(-20, -20, 40, 40),
    mount: mount('clamp-capable', -11, -11, 22, 22),
    opticalCenterMm: { x: 0, y: 0 },
    ports: [
      port('west', 'Input', 'beam-input', -17, 0, 'west'),
      port('east', 'Output', 'beam-output', 17, 0, 'east'),
    ],
    renderHint: renderHint('circle', '#4d4635', '#efd89b', 'attenuator'),
    mountRenderHint: renderHint('circle', 'rgba(68, 62, 48, 0.84)', '#bca875', 'mount'),
    realisticVisualPreset: realisticVisualPreset('beam-control', 'warm-metal', 'kinematic-round', {
      accentFill: '#7d6953',
      accentStroke: '#e9dfd1',
      glassTint: '#aba49c',
    }),
    physics: attenuatorPhysics({
      transmissionPercent: 50,
      minNm: 350,
      maxNm: 2000,
      apertureMm: 25.4,
      orientation: 'horizontal',
    }),
    recommendedHardware: {
      mount: 'Rotation-compatible ND filter mount',
      post: 'RS1.5P4M + RSHT1.5/M',
    },
    variants: [
      {
        id: 'variable-nd-horizontal',
        label: 'Variable ND Attenuator (Horizontal)',
        description: 'Scalar attenuation optic in a horizontal mount orientation.',
        renderHint: {
          glyph: 'attenuator-horizontal',
        },
        physics: attenuatorPhysics({
          transmissionPercent: 50,
          minNm: 350,
          maxNm: 2000,
          apertureMm: 25.4,
          orientation: 'horizontal',
        }),
      },
      {
        id: 'variable-nd-vertical',
        label: 'Variable ND Attenuator (Vertical)',
        description: 'Scalar attenuation optic in a vertical mount orientation.',
        renderHint: {
          glyph: 'attenuator-vertical',
        },
        physics: attenuatorPhysics({
          transmissionPercent: 50,
          minNm: 350,
          maxNm: 2000,
          apertureMm: 25.4,
          orientation: 'vertical',
        }),
      },
      {
        id: 'ndl-10c-2',
        label: 'Variable ND Filter',
        vendor: 'Thorlabs',
        sku: 'NDL-10C-2',
        description: '1 in continuously variable ND filter for beam power balancing.',
        renderHint: {
          glyph: 'attenuator-horizontal',
        },
        physics: attenuatorPhysics({
          transmissionPercent: 35,
          minNm: 400,
          maxNm: 700,
          apertureMm: 25.4,
          orientation: 'horizontal',
        }),
      },
    ],
  },
  {
    type: 'polarizer',
    category: 'conditioning',
    defaultLabel: 'Polarizer',
    familyLabel: 'Polarizer',
    defaultVariantId: 'lpvis100',
    footprintBoundsMm: bounds(-12.7, -12.7, 25.4, 25.4),
    visualBodyBoundsMm: bounds(-8.5, -8.5, 17, 17),
    mountVisualBoundsMm: bounds(-18, -18, 36, 36),
    hitBoundsMm: bounds(-16, -16, 32, 32),
    mount: mount('clamp-capable', -9, -9, 18, 18),
    opticalCenterMm: { x: 0, y: 0 },
    ports: [
      port('west', 'Input', 'beam-input', -12.7, 0, 'west'),
      port('east', 'Output', 'beam-output', 12.7, 0, 'east'),
    ],
    renderHint: renderHint('circle', '#3a4034', '#d7f0a4', 'polarizer'),
    mountRenderHint: renderHint('circle', 'rgba(55, 61, 46, 0.86)', '#aebd83', 'mount'),
    realisticVisualPreset: realisticVisualPreset('beam-control', 'graphite', 'kinematic-round', {
      accentFill: '#80936f',
      accentStroke: '#e3ead7',
      glassTint: '#9daf93',
    }),
    physics: polarizerPhysics(86, 1000, 25.4),
    recommendedHardware: {
      mount: 'Rotation-compatible polarizer mount',
      post: 'RS1.5P4M + RSHT1.5/M',
    },
    variants: [
      {
        id: 'lpvis100',
        label: 'Linear Polarizer',
        vendor: 'Generic',
        sku: 'LP-VIS-100',
        description: 'Visible/NIR linear polarizer with strong extinction.',
      },
    ],
  },
  {
    type: 'waveplate',
    category: 'conditioning',
    defaultLabel: 'Waveplate',
    familyLabel: 'Waveplate',
    defaultVariantId: 'half-wave',
    footprintBoundsMm: bounds(-12.7, -12.7, 25.4, 25.4),
    visualBodyBoundsMm: bounds(-8.5, -8.5, 17, 17),
    mountVisualBoundsMm: bounds(-18, -18, 36, 36),
    hitBoundsMm: bounds(-16, -16, 32, 32),
    mount: mount('clamp-capable', -9, -9, 18, 18),
    opticalCenterMm: { x: 0, y: 0 },
    ports: [
      port('west', 'Input', 'beam-input', -12.7, 0, 'west'),
      port('east', 'Output', 'beam-output', 12.7, 0, 'east'),
    ],
    renderHint: renderHint('circle', '#3f3653', '#d4c4ff', 'waveplate'),
    mountRenderHint: renderHint('circle', 'rgba(54, 45, 71, 0.86)', '#aa9ccf', 'mount'),
    realisticVisualPreset: realisticVisualPreset('beam-control', 'rose-metal', 'kinematic-round', {
      accentFill: '#b3a9db',
      accentStroke: '#edf2ff',
      glassTint: '#bac5eb',
    }),
    physics: waveplatePhysics(180, 98, 25.4),
    recommendedHardware: {
      mount: 'RSP1/M or equivalent rotation mount',
      post: 'RS1.5P4M + RSHT1.5/M',
    },
    variants: [
      {
        id: 'half-wave',
        label: 'Half-Wave Plate',
        description: 'Half-wave plate for polarization rotation.',
        renderHint: {
          glyph: 'waveplate-half',
        },
        physics: waveplatePhysics(180, 98, 25.4),
      },
      {
        id: 'quarter-wave',
        label: 'Quarter-Wave Plate',
        description: 'Quarter-wave plate for linear/circular conversion.',
        renderHint: {
          glyph: 'waveplate-quarter',
        },
        physics: waveplatePhysics(90, 98, 25.4),
      },
    ],
  },
  {
    type: 'iris',
    category: 'aperture',
    defaultLabel: 'Iris',
    familyLabel: 'Iris',
    defaultVariantId: 'id12-m',
    footprintBoundsMm: bounds(-14, -14, 28, 28),
    visualBodyBoundsMm: bounds(-9, -9, 18, 18),
    mountVisualBoundsMm: bounds(-16, -16, 32, 32),
    hitBoundsMm: bounds(-16, -16, 32, 32),
    mount: mount('clamp-capable', -10, -10, 20, 20),
    opticalCenterMm: { x: 0, y: 0 },
    ports: [
      port('west', 'Input', 'beam-input', -14, 0, 'west'),
      port('east', 'Output', 'beam-output', 14, 0, 'east'),
    ],
    renderHint: renderHint('circle', '#38422b', '#c6d67f', 'iris'),
    mountRenderHint: renderHint('circle', 'rgba(50, 58, 36, 0.86)', '#9ba66b', 'mount'),
    realisticVisualPreset: realisticVisualPreset('iris', 'graphite', 'iris-body', {
      accentFill: '#44503a',
      accentStroke: '#dde7cf',
      glassTint: '#59684a',
    }),
    physics: irisPhysics(12, 12),
    recommendedHardware: {
      mount: 'Integrated post-mounted iris body',
      post: 'RS1.5P4M + RSHT1.5/M',
    },
    variants: [
      {
        id: 'id8-m',
        label: 'Mounted Standard Iris',
        vendor: 'Thorlabs',
        sku: 'ID8/M',
        description: '8.0 mm max aperture post-mounted iris.',
        renderHint: {
          glyph: 'iris-standard',
        },
        physics: irisPhysics(8, 6),
      },
      {
        id: 'id12-m',
        label: 'Mounted Standard Iris',
        vendor: 'Thorlabs',
        sku: 'ID12/M',
        description: '12.0 mm max aperture post-mounted iris; best default alignment choice.',
        renderHint: {
          glyph: 'iris-standard',
        },
        physics: irisPhysics(12, 10),
      },
      {
        id: 'id15-m',
        label: 'Mounted Standard Iris',
        vendor: 'Thorlabs',
        sku: 'ID15/M',
        description: '15.0 mm max aperture post-mounted iris with more clearance.',
        renderHint: {
          glyph: 'iris-standard',
        },
        physics: irisPhysics(15, 12),
      },
      {
        id: 'id25-m',
        label: 'Mounted Standard Iris',
        vendor: 'Thorlabs',
        sku: 'ID25/M',
        description: '25.0 mm max aperture post-mounted iris for expanded beams.',
        renderHint: {
          glyph: 'iris-standard',
        },
        physics: irisPhysics(25, 18),
      },
      {
        id: 'id12z-m',
        label: 'Mounted Zero-Aperture Iris',
        vendor: 'Thorlabs',
        sku: 'ID12Z/M',
        description: '12.0 mm max aperture zero-aperture iris.',
        renderHint: {
          glyph: 'iris-zero',
        },
        physics: irisPhysics(12, 8),
      },
      {
        id: 'sm1d12d',
        label: 'SM1 Ring-Actuated Iris',
        vendor: 'Thorlabs',
        sku: 'SM1D12D',
        description: 'SM1-threaded iris with 0.8-12.0 mm aperture.',
        renderHint: {
          glyph: 'iris-sm1-ring',
        },
        physics: irisPhysics(12, 8),
      },
      {
        id: 'sm1d12c',
        label: 'SM1 Graduated Iris',
        vendor: 'Thorlabs',
        sku: 'SM1D12C',
        description: 'SM1-threaded graduated iris with 1.0-12.0 mm aperture.',
        renderHint: {
          glyph: 'iris-sm1-graduated',
        },
        physics: irisPhysics(12, 8),
      },
      {
        id: 'sm1d12sz',
        label: 'SM1 Zero-Aperture Iris',
        vendor: 'Thorlabs',
        sku: 'SM1D12SZ',
        description: 'SM1-threaded zero-aperture iris that closes fully.',
        renderHint: {
          glyph: 'iris-sm1-zero',
        },
        physics: irisPhysics(12, 8),
      },
      {
        id: 'ida12-m',
        label: 'Adjustable Iris',
        vendor: 'Thorlabs',
        sku: 'IDA12/M',
        description: 'Adjustable mounted iris aligned to the 12 mm aperture class.',
        renderHint: {
          glyph: 'iris-standard',
        },
        physics: irisPhysics(12, 9),
      },
    ],
  },
  {
    type: 'bbo-crystal',
    category: 'nonlinear',
    defaultLabel: 'BBO Crystal',
    familyLabel: 'BBO Crystal',
    defaultVariantId: 'type-i-bbo',
    footprintBoundsMm: bounds(-8, -5, 16, 10),
    visualBodyBoundsMm: bounds(-6.5, -4, 13, 8),
    mountVisualBoundsMm: bounds(-15, -11, 30, 22),
    hitBoundsMm: bounds(-11, -9, 22, 18),
    mount: mount('clamp-capable', -9, -9, 18, 18),
    opticalCenterMm: { x: 0, y: 0 },
    ports: [
      port('west', 'Input', 'beam-input', -8, 0, 'west'),
      port('east', 'Output', 'beam-output', 8, 0, 'east'),
    ],
    renderHint: renderHint('rect', '#5f4f7b', '#d9c7ff', 'bbo'),
    mountRenderHint: renderHint('rect', 'rgba(74, 65, 92, 0.86)', '#b6a7d7', 'mount'),
    physics: bboPhysics(29.2),
    recommendedHardware: {
      mount: 'Thorlabs KM100 or rotation-compatible crystal mount',
      post: 'RS1.5P4M + RSHT1.5/M',
    },
    variants: [
      {
        id: 'type-i-bbo',
        label: 'Type I BBO',
        description: 'Type I BBO crystal for SHG and FROG planning.',
      },
    ],
  },
  {
    type: 'telescope',
    category: 'focusing',
    defaultLabel: 'Telescope',
    familyLabel: 'Telescope',
    defaultVariantId: 'beam-expander-2x',
    footprintBoundsMm: bounds(-35, -18, 70, 36),
    visualBodyBoundsMm: bounds(-30, -12, 60, 24),
    mountVisualBoundsMm: bounds(-40, -20, 80, 40),
    hitBoundsMm: bounds(-42, -22, 84, 44),
    mount: mount('clamp-capable', -18, -18, 36, 36),
    opticalCenterMm: { x: 0, y: 0 },
    ports: [
      port('west', 'Input', 'beam-input', -35, 0, 'west'),
      port('east', 'Output', 'beam-output', 35, 0, 'east'),
    ],
    renderHint: renderHint('capsule', '#324157', '#bed5ff', 'telescope'),
    mountRenderHint: renderHint('capsule', 'rgba(50, 62, 84, 0.84)', '#9fb2d6', 'support'),
    physics: telescopePhysics({
      mode: 'transmission',
      element1Mm: 50,
      element2Mm: 100,
      separationMm: 150,
      clearApertureMm: 25.4,
    }),
    recommendedHardware: {
      mount: 'Dual lens or mirror rail assembly',
      post: 'RS1.5P4M + RSHT1.5/M',
    },
    variants: [
      {
        id: 'beam-expander-2x',
        label: 'Transmission Telescope',
        description: 'Two-lens telescope for ~2x beam expansion.',
        renderHint: {
          glyph: 'telescope-transmission',
        },
      },
      {
        id: 'reflective-compressor-2x',
        label: 'Reflective Telescope',
        description: 'Two-mirror reflective telescope with spherical elements.',
        renderHint: {
          glyph: 'telescope-reflective',
        },
        physics: telescopePhysics({
          mode: 'reflection',
          element1Mm: 200,
          element2Mm: 100,
          separationMm: 300,
          clearApertureMm: 25.4,
          transmissionPercent: 94,
        }),
      },
    ],
  },
  {
    type: 'sample-holder',
    category: 'sample',
    defaultLabel: 'Sample Holder',
    familyLabel: 'Sample Holder',
    defaultVariantId: 'thorlabs-km100b-m',
    footprintBoundsMm: bounds(-24.3, -24.3, 48.6, 48.6),
    visualBodyBoundsMm: bounds(-21.5, -21.5, 43, 43),
    hitBoundsMm: bounds(-28, -28, 56, 56),
    mount: mount('hole-mounted', -24.3, -24.3, 48.6, 48.6),
    ports: [],
    mountSites: [
      mountSite(
        'sample-seat',
        'Sample Seat',
        'sample-seat',
        -12,
        -10,
        16,
        16,
        ['clamp-capable'],
        STAGE_SAMPLE_CHILD_TYPES,
      ),
      mountSite(
        'optic-seat',
        'Optic Seat',
        'optic-seat',
        7,
        -10,
        16,
        16,
        undefined,
        STAGE_OPTIC_CHILD_TYPES,
      ),
    ],
    renderHint: renderHint('rect', '#8f979d', '#e6edf2', 'sample-holder-generic'),
    realisticVisualPreset: realisticVisualPreset('stage', 'silver-machined', 'none', {
      accentFill: '#c1c7cc',
      accentStroke: '#f2f7fb',
    }),
    physics: nonePhysics(),
    recommendedHardware: {
      mount: 'Direct breadboard-mounted sample holder',
      post: 'Direct breadboard mounting',
    },
    variants: [
      {
        id: 'thorlabs-km100b-m',
        label: 'Thorlabs Platform Mount',
        vendor: 'Thorlabs',
        sku: 'KM100B/M',
        description:
          'Compact Thorlabs-style kinematic platform mount sized from the KM100B/M 48.6 mm square body.',
        footprintBoundsMm: bounds(-24.3, -24.3, 48.6, 48.6),
        visualBodyBoundsMm: bounds(-21.5, -21.5, 43, 43),
        hitBoundsMm: bounds(-28, -28, 56, 56),
        mount: mount('hole-mounted', -24.3, -24.3, 48.6, 48.6),
        mountSites: [
          mountSite(
            'sample-seat',
            'Sample Seat',
            'sample-seat',
            -12,
            -10,
            16,
            16,
            ['clamp-capable'],
            STAGE_SAMPLE_CHILD_TYPES,
          ),
          mountSite(
            'optic-seat',
            'Optic Seat',
            'optic-seat',
            7,
            -10,
            16,
            16,
            undefined,
            STAGE_OPTIC_CHILD_TYPES,
          ),
        ],
        renderHint: {
          glyph: 'sample-holder-generic',
        },
      },
    ],
  },
  {
    type: 'translation-stage',
    category: 'sample',
    defaultLabel: 'Translation Stage',
    familyLabel: 'Translation Stage',
    defaultVariantId: 'generic-xy-stage',
    footprintBoundsMm: bounds(-37.5, -27.5, 75, 55),
    visualBodyBoundsMm: bounds(-34, -23, 68, 46),
    hitBoundsMm: bounds(-40, -30, 80, 60),
    mount: mount('hole-mounted', -37.5, -27.5, 75, 55),
    ports: [],
    mountSites: [
      mountSite(
        'sample-seat',
        'Sample Seat',
        'sample-seat',
        -18,
        -10,
        18,
        20,
        ['clamp-capable'],
        STAGE_SAMPLE_CHILD_TYPES,
      ),
      mountSite(
        'optic-seat',
        'Optic Seat',
        'optic-seat',
        8,
        -10,
        18,
        20,
        ['clamp-capable'],
        STAGE_OPTIC_CHILD_TYPES,
      ),
    ],
    renderHint: renderHint('rect', '#8f979d', '#e6edf2', 'sample-xy-stage'),
    realisticVisualPreset: realisticVisualPreset('stage', 'silver-machined', 'none', {
      accentFill: '#c1c7cc',
      accentStroke: '#f2f7fb',
    }),
    physics: nonePhysics(),
    recommendedHardware: {
      mount: 'Direct breadboard-mounted translation stage',
      post: 'Direct breadboard mounting',
    },
    variants: [
      {
        id: 'generic-xy-stage',
        label: 'XY Translation Stage',
        description: 'Generic crossed XY translation stage with two payload seats.',
        renderHint: {
          glyph: 'sample-xy-stage',
        },
      },
      {
        id: 'generic-xyz-stage',
        label: 'XYZ Translation Stage',
        description: 'Generic stacked XYZ translation stage with separated sample and optic seats.',
        footprintBoundsMm: bounds(-42.5, -32.5, 85, 65),
        visualBodyBoundsMm: bounds(-38.5, -28, 77, 56),
        hitBoundsMm: bounds(-46, -36, 92, 72),
        mount: mount('hole-mounted', -42.5, -32.5, 85, 65),
        mountSites: [
          mountSite(
            'sample-seat',
            'Sample Seat',
            'sample-seat',
            -18,
            -12,
            20,
            22,
            ['clamp-capable'],
            STAGE_SAMPLE_CHILD_TYPES,
          ),
          mountSite(
            'optic-seat',
            'Optic Seat',
            'optic-seat',
            10,
            -12,
            20,
            22,
            ['clamp-capable'],
            STAGE_OPTIC_CHILD_TYPES,
          ),
        ],
        renderHint: {
          glyph: 'sample-xyz-stage',
        },
      },
      {
        id: 'newport-m-423',
        label: 'Manual XYZ Stage',
        vendor: 'Newport',
        sku: 'M-423',
        description: 'Manual stacked XYZ translation stage with compact top plate and micrometer-driven slides.',
        footprintBoundsMm: bounds(-47.5, -35, 95, 70),
        visualBodyBoundsMm: bounds(-43, -30.5, 86, 61),
        hitBoundsMm: bounds(-52, -39, 104, 78),
        mount: mount('hole-mounted', -47.5, -35, 95, 70),
        mountSites: [
          mountSite(
            'sample-seat',
            'Sample Seat',
            'sample-seat',
            -18,
            -12,
            20,
            22,
            ['clamp-capable'],
            STAGE_SAMPLE_CHILD_TYPES,
          ),
          mountSite(
            'optic-seat',
            'Optic Seat',
            'optic-seat',
            11,
            -12,
            20,
            22,
            ['clamp-capable'],
            STAGE_OPTIC_CHILD_TYPES,
          ),
        ],
        renderHint: {
          glyph: 'sample-manual-xyz-stage',
        },
      },
      {
        id: 'thorlabs-st1xy-s-m',
        label: 'XY Translator',
        vendor: 'Thorlabs',
        sku: 'ST1XY-S/M',
        description: 'Thorlabs XY translator with micrometer drives for Ø1 in optics.',
        footprintBoundsMm: bounds(-44.5, -31.5, 89, 63),
        visualBodyBoundsMm: bounds(-40, -26, 80, 52),
        hitBoundsMm: bounds(-49, -36, 98, 72),
        mount: mount('hole-mounted', -44.5, -31.5, 89, 63),
        mountSites: [
          mountSite(
            'sample-seat',
            'Sample Seat',
            'sample-seat',
            -18,
            -10,
            20,
            20,
            ['clamp-capable'],
            STAGE_SAMPLE_CHILD_TYPES,
          ),
          mountSite(
            'optic-seat',
            'Optic Seat',
            'optic-seat',
            10,
            -10,
            20,
            20,
            ['clamp-capable'],
            STAGE_OPTIC_CHILD_TYPES,
          ),
        ],
        renderHint: {
          glyph: 'sample-xy-stage',
        },
      },
      {
        id: 'thorlabs-pt1-m',
        label: 'Translation Stage',
        vendor: 'Thorlabs',
        sku: 'PT1/M',
        description: 'Single-axis 25 mm translation stage with standard micrometer and compact slotted carriage.',
        footprintBoundsMm: bounds(-42.5, -18, 85, 36),
        visualBodyBoundsMm: bounds(-38, -13, 76, 26),
        hitBoundsMm: bounds(-47, -22, 94, 44),
        mount: mount('hole-mounted', -42.5, -18, 85, 36),
        mountSites: [
          mountSite(
            'sample-seat',
            'Sample Seat',
            'sample-seat',
            -18,
            -9,
            18,
            18,
            ['clamp-capable'],
            STAGE_SAMPLE_CHILD_TYPES,
          ),
          mountSite(
            'optic-seat',
            'Optic Seat',
            'optic-seat',
            10,
            -9,
            18,
            18,
            ['clamp-capable'],
            STAGE_OPTIC_CHILD_TYPES,
          ),
        ],
        renderHint: {
          glyph: 'sample-holder-slotted',
        },
      },
      {
        id: 'thorlabs-pt3-m',
        label: 'XYZ Translation Stage',
        vendor: 'Thorlabs',
        sku: 'PT3/M',
        description: 'Three-axis 25 mm translation stage with stacked micrometers and top payload plate.',
        footprintBoundsMm: bounds(-48, -36, 96, 72),
        visualBodyBoundsMm: bounds(-43, -31, 86, 62),
        hitBoundsMm: bounds(-53, -41, 106, 82),
        mount: mount('hole-mounted', -48, -36, 96, 72),
        mountSites: [
          mountSite(
            'sample-seat',
            'Sample Seat',
            'sample-seat',
            -18,
            -12,
            20,
            22,
            ['clamp-capable'],
            STAGE_SAMPLE_CHILD_TYPES,
          ),
          mountSite(
            'optic-seat',
            'Optic Seat',
            'optic-seat',
            11,
            -12,
            20,
            22,
            ['clamp-capable'],
            STAGE_OPTIC_CHILD_TYPES,
          ),
        ],
        renderHint: {
          glyph: 'sample-xyz-stage',
        },
      },
    ],
  },
  {
    type: 'delay-stage',
    category: 'sample',
    defaultLabel: 'Delay Stage',
    familyLabel: 'Delay Stage',
    defaultVariantId: 'generic-manual-delay-stage',
    footprintBoundsMm: bounds(-42.5, -17, 85, 34),
    visualBodyBoundsMm: bounds(-39, -12, 78, 24),
    hitBoundsMm: bounds(-45, -20, 90, 40),
    mount: mount('hole-mounted', -42.5, -17, 85, 34),
    mountSites: [
      mountSite(
        'sample-seat',
        'Sample Seat',
        'sample-seat',
        -18,
        -9,
        18,
        18,
        ['clamp-capable'],
        STAGE_SAMPLE_CHILD_TYPES,
      ),
      mountSite(
        'optic-seat',
        'Optic Seat',
        'optic-seat',
        10,
        -9,
        18,
        18,
        ['clamp-capable'],
        STAGE_OPTIC_CHILD_TYPES,
      ),
    ],
    opticalCenterMm: { x: 0, y: 0 },
    ports: [
      port('west', 'Input', 'beam-input', -42.5, 0, 'west'),
      port('east', 'Output', 'beam-output', 42.5, 0, 'east'),
    ],
    renderHint: renderHint('rect', '#8f979d', '#e6edf2', 'sample-delay-stage'),
    realisticVisualPreset: realisticVisualPreset('stage', 'silver-machined', 'none', {
      accentFill: '#c1c7cc',
      accentStroke: '#f2f7fb',
    }),
    physics: delayLinePhysics('manual-stage', 25, 18, 97),
    recommendedHardware: {
      mount: 'Integrated delay stage base',
      post: 'Direct breadboard mounting',
    },
    variants: [
      {
        id: 'generic-manual-delay-stage',
        label: 'Manual Delay Stage',
        description: 'Generic compact manual delay stage with a micrometer-driven carriage.',
        renderHint: {
          glyph: 'sample-delay-stage',
        },
      },
      {
        id: 'pi-m-112-1dg1',
        label: 'Delay Stage',
        vendor: 'PI',
        sku: 'M-112.1DG1',
        description: 'Compact linear delay stage for optical path length tuning.',
        renderHint: {
          glyph: 'sample-delay-stage',
        },
        physics: delayLinePhysics('manual-stage', 25, 18, 97),
      },
      {
        id: 'pi-ls-180',
        label: 'Motorized Delay Stage',
        vendor: 'PI',
        sku: 'LS-180',
        description: 'Large PI LS-180 stage with carriage and cable-chain sweep envelope.',
        renderHint: {
          glyph: 'sample-motorized-stage',
        },
        footprintBoundsMm: bounds(-325.5, -90, 651, 180),
        visualBodyBoundsMm: bounds(-325.5, -75, 651, 150),
        hitBoundsMm: bounds(-360, -120, 720, 240),
        mount: mount('hole-mounted', -360, -120, 720, 240),
        mountSites: [
          mountSite(
            'sample-seat',
            'Sample Seat',
            'sample-seat',
            -48,
            -30,
            44,
            60,
            ['clamp-capable'],
            STAGE_SAMPLE_CHILD_TYPES,
          ),
          mountSite(
            'optic-seat',
            'Optic Seat',
            'optic-seat',
            18,
            -30,
            44,
            60,
            ['clamp-capable'],
            STAGE_OPTIC_CHILD_TYPES,
          ),
        ],
        recommendedHardware: {
          mount: 'Integrated stage base with cable chain envelope',
          post: 'Direct table mounting',
        },
        ports: [
          port('west', 'Input', 'beam-input', -325.5, 0, 'west'),
          port('east', 'Output', 'beam-output', 325.5, 0, 'east'),
        ],
        physics: delayLinePhysics('motorized-stage', 205, 18, 97),
      },
    ],
  },
  {
    type: 'sample',
    category: 'sample',
    defaultLabel: 'Sample',
    familyLabel: 'Sample',
    defaultVariantId: 'generic-sample-chip',
    footprintBoundsMm: bounds(-9, -6, 18, 12),
    visualBodyBoundsMm: bounds(-8, -5, 16, 10),
    hitBoundsMm: bounds(-11, -8, 22, 16),
    mount: mount('clamp-capable', -9, -6, 18, 12),
    ports: [],
    renderHint: renderHint('rect', '#5f6770', '#e2eaf2', 'sample-chip'),
    realisticVisualPreset: realisticVisualPreset('sample', 'cool-metal', 'none', {
      accentFill: '#5c6872',
      accentStroke: '#e7eef5',
    }),
    physics: nonePhysics(),
    recommendedHardware: {
      mount: 'Stage seat or compact carrier',
      post: 'Optional free-placement sample carrier',
    },
    variants: [
      {
        id: 'generic-sample-chip',
        label: 'Sample Chip',
        description: 'Generic mounted chip or coupon sample.',
        renderHint: {
          glyph: 'sample-chip',
        },
      },
      {
        id: 'ti-sapphire-crystal',
        label: 'Ti:Sapphire Crystal',
        description: 'Compact Ti:sapphire sample or gain crystal placeholder for stage mounting.',
        footprintBoundsMm: bounds(-8, -5, 16, 10),
        renderHint: {
          glyph: 'sample-crystal',
        },
      },
      {
        id: 'tin-substrate',
        label: 'TiN Substrate',
        description: 'Thin TiN-coated substrate sample for mount-first layouts.',
        footprintBoundsMm: bounds(-8, -6, 16, 12),
        renderHint: {
          glyph: 'sample-substrate',
        },
      },
      {
        id: 'glass-substrate',
        label: 'Glass Substrate',
        description: 'Rectangular glass substrate sample.',
        footprintBoundsMm: bounds(-9, -6, 18, 12),
        renderHint: {
          glyph: 'sample-substrate',
        },
      },
      {
        id: 'silicon-substrate',
        label: 'Silicon Substrate',
        description: 'Rectangular silicon substrate sample.',
        footprintBoundsMm: bounds(-8, -8, 16, 16),
        renderHint: {
          glyph: 'sample-substrate',
        },
      },
      {
        id: 'sapphire-substrate',
        label: 'Sapphire Substrate',
        description: 'Rectangular sapphire substrate sample.',
        footprintBoundsMm: bounds(-8, -8, 16, 16),
        renderHint: {
          glyph: 'sample-substrate',
        },
      },
    ],
  },
  {
    type: 'opa-module',
    category: 'nonlinear',
    defaultLabel: 'OPA Module',
    familyLabel: 'OPA Module',
    defaultVariantId: 'white-light-generator',
    footprintBoundsMm: bounds(-24, -18, 48, 36),
    visualBodyBoundsMm: bounds(-20, -14, 40, 28),
    hitBoundsMm: bounds(-28, -22, 56, 44),
    mount: mount('hole-mounted', -24, -18, 48, 36),
    opticalCenterMm: { x: 0, y: 0 },
    ports: [
      port('west', 'Input', 'beam-input', -24, 0, 'west'),
      port('east', 'Output', 'beam-output', 24, 0, 'east'),
      port('north', 'Pump', 'beam-input', 0, -18, 'north'),
      port('south', 'Seed', 'beam-input', 0, 18, 'south'),
    ],
    renderHint: renderHint('rect', '#4b3556', '#f2b4ff', 'opa'),
    physics: opaWhiteLightPhysics(650, 140, 8),
    recommendedHardware: {
      mount: 'OPA crystal and steering assembly',
      post: 'Direct table or breadboard mounting',
    },
    variants: [
      {
        id: 'white-light-generator',
        label: 'White-Light Generator',
        description:
          'Generates a broadband seed continuum that lets the OPA be aligned and tuned across a wide wavelength range.',
        renderHint: {
          fill: '#6b5532',
          glyph: 'opa-white-light',
          stroke: '#ffd89d',
        },
      },
      {
        id: 'pump-seed-combiner',
        label: 'Pump / Seed Combiner',
        description:
          'Represents the section where pump and seed beams are timed, steered, and overlapped before they enter the gain crystal.',
        renderHint: {
          fill: '#355372',
          glyph: 'opa-combiner',
          stroke: '#c6e8ff',
        },
        physics: opaCombinerPhysics(),
      },
      {
        id: 'opa-gain-stage',
        label: 'OPA Gain Stage',
        description:
          'Represents the nonlinear gain stage where pump energy amplifies the seed and produces the signal and idler outputs.',
        renderHint: {
          fill: '#5b2f68',
          glyph: 'opa-gain',
          stroke: '#ffd0ff',
        },
        physics: opaGainPhysics({
          signalWavelengthNm: 650,
          idlerWavelengthNm: 1350,
          bandwidthNm: 45,
          efficiencyPercent: 18,
        }),
      },
    ],
  },
  {
    type: 'fiber-coupler',
    category: 'coupling',
    defaultLabel: 'Fiber Coupler',
    familyLabel: 'Fiber Coupler',
    defaultVariantId: 'fiber-coupler-generic',
    footprintBoundsMm: bounds(-20, -15, 40, 30),
    visualBodyBoundsMm: bounds(-18, -11, 36, 22),
    mountVisualBoundsMm: bounds(-16, -16, 32, 32),
    mount: mount('clamp-capable', -10, -10, 20, 20),
    opticalCenterMm: { x: 6, y: 0 },
    ports: [
      port('beam-input', 'Beam In', 'beam-input', -20, 0, 'west'),
      port('fiber-output', 'Fiber Out', 'beam-output', 20, 0, 'east'),
    ],
    renderHint: renderHint('capsule', '#194544', '#8ad9d6', 'fiber'),
    mountRenderHint: renderHint('circle', 'rgba(31, 56, 58, 0.84)', '#7fb7b5', 'mount'),
    physics: terminalPhysics('fiber-coupler', 10, 78),
    recommendedHardware: {
      mount: 'Fiber launch mount with pedestal base',
      post: 'RS1.5P4M + RSHT1.5/M',
    },
    variants: [
      {
        id: 'fiber-coupler-generic',
        label: 'Fiber Coupler',
        description: 'Generic free-space to fiber coupler terminal.',
      },
    ],
  },
  {
    type: 'spectrometer',
    category: 'measurement',
    defaultLabel: 'Spectrometer',
    familyLabel: 'Spectrometer',
    defaultVariantId: 'sr6',
    footprintBoundsMm: bounds(-31, -20, 62, 40),
    mount: mount('hole-mounted', -31, -20, 62, 40),
    opticalCenterMm: { x: -18, y: 0 },
    ports: [port('input', 'Input', 'beam-input', -31, 0, 'west')],
    renderHint: renderHint('rect', '#2b294b', '#b6b0ff', 'spectrometer'),
    physics: terminalPhysics('spectrometer', 8, 88),
    variants: [
      {
        id: 'sr6',
        label: 'Spectrometer',
        vendor: 'Ocean Optics',
        sku: 'SR6',
        description: 'Approximately 200-1000 nm spectrometer range.',
        renderHint: {
          glyph: 'spectrometer-compact',
        },
      },
      {
        id: 'spectrapro-sp-2150',
        label: 'Spectrometer',
        vendor: 'Teledyne Princeton Instruments',
        sku: 'SpectraPro SP-2150',
        description: 'Top-view SP-2150 body with practical footprint and side attachment silhouette.',
        renderHint: {
          glyph: 'spectrometer-bench',
        },
        footprintBoundsMm: bounds(-89, -89, 178, 178),
        visualBodyBoundsMm: bounds(-89, -89, 178, 178),
        hitBoundsMm: bounds(-104, -104, 208, 208),
        mount: mount('hole-mounted', -89, -89, 178, 178),
        mountVisualBoundsMm: bounds(-89, -89, 178, 178),
        opticalCenterMm: { x: -70, y: 0 },
        ports: [port('input', 'Input', 'beam-input', -89, 0, 'west')],
      },
      {
        id: 'cct10',
        label: 'Compact CCD Spectrometer',
        vendor: 'Thorlabs',
        sku: 'CCT10',
        description: 'Compact fiber-coupled spectrometer package for quick layout planning.',
        renderHint: {
          glyph: 'spectrometer-compact',
        },
        footprintBoundsMm: bounds(-42, -23, 84, 46),
        visualBodyBoundsMm: bounds(-38, -19, 76, 38),
        hitBoundsMm: bounds(-46, -27, 92, 54),
        mount: mount('hole-mounted', -42, -23, 84, 46),
        opticalCenterMm: { x: -26, y: 0 },
        ports: [port('input', 'Input', 'beam-input', -42, 0, 'west')],
      },
    ],
  },
  {
    type: 'detector',
    category: 'measurement',
    defaultLabel: 'Detector',
    familyLabel: 'Detector',
    defaultVariantId: 'detector-generic',
    footprintBoundsMm: bounds(-18, -18, 36, 36),
    visualBodyBoundsMm: bounds(-14, -14, 28, 28),
    mountVisualBoundsMm: bounds(-16, -16, 32, 32),
    mount: mount('clamp-capable', -10, -10, 20, 20),
    opticalCenterMm: { x: -8, y: 0 },
    ports: [port('input', 'Input', 'beam-input', -18, 0, 'west')],
    renderHint: renderHint('rect', '#47373f', '#f0c9dd', 'detector'),
    mountRenderHint: renderHint('circle', 'rgba(63, 52, 57, 0.84)', '#d4b7c5', 'mount'),
    realisticVisualPreset: realisticVisualPreset('detector', 'rose-metal', 'sensor-disc', {
      accentFill: '#6c4f5d',
      accentStroke: '#f6ddeb',
    }),
    physics: terminalPhysics('detector', 10, 92),
    recommendedHardware: {
      mount: 'Detector head mount with pedestal base',
      post: 'RS1.5P4M + RSHT1.5/M',
    },
    variants: [
      {
        id: 'detector-generic',
        label: 'Detector',
        description: 'Generic beam detector or power meter head.',
      },
      {
        id: 'bc207vis-m',
        label: 'Beam Profiler',
        vendor: 'Thorlabs',
        sku: 'BC207VIS/M',
        description: 'CMOS beam profiler head for visible beam diagnostics.',
        footprintBoundsMm: bounds(-24, -18, 48, 36),
        visualBodyBoundsMm: bounds(-19, -13, 38, 26),
        hitBoundsMm: bounds(-27, -21, 54, 42),
        mountVisualBoundsMm: bounds(-18, -18, 36, 36),
        opticalCenterMm: { x: -16, y: 0 },
        ports: [port('input', 'Input', 'beam-input', -24, 0, 'west')],
      },
      {
        id: 's120vc',
        label: 'Photodiode Sensor',
        vendor: 'Thorlabs',
        sku: 'S120VC',
        description: 'Compact photodiode power sensor head for visible beams.',
        footprintBoundsMm: bounds(-16, -16, 32, 32),
        visualBodyBoundsMm: bounds(-12, -12, 24, 24),
        hitBoundsMm: bounds(-20, -20, 40, 40),
        opticalCenterMm: { x: -9, y: 0 },
        ports: [port('input', 'Input', 'beam-input', -16, 0, 'west')],
      },
    ],
  },
  {
    type: 'beam-dump',
    category: 'termination',
    defaultLabel: 'Beam Dump',
    familyLabel: 'Beam Dump',
    defaultVariantId: 'beam-dump-generic',
    footprintBoundsMm: bounds(-16, -16, 32, 32),
    mount: mount('clamp-capable', -10, -10, 20, 20),
    opticalCenterMm: { x: 0, y: 0 },
    ports: [port('input', 'Input', 'beam-input', -16, 0, 'west')],
    renderHint: renderHint('circle', '#453523', '#f6c27c', 'beam-dump'),
    physics: terminalPhysics('beam-dump', 18, 0),
    variants: [
      {
        id: 'beam-dump-generic',
        label: 'Beam Dump',
        description: 'Generic beam dump terminal.',
      },
    ],
  },
]

export const COMPONENT_DEFINITIONS_BY_TYPE = Object.fromEntries(
  COMPONENT_DEFINITIONS.map((definition) => [definition.type, definition]),
) as Record<ComponentType, ComponentDefinition>

export function getComponentDefinition(type: ComponentType) {
  return COMPONENT_DEFINITIONS_BY_TYPE[type]
}

export function getComponentVariant(
  type: ComponentType,
  variantId: string,
): ComponentVariant {
  const definition = getComponentDefinition(type)
  const variant = definition.variants.find((item) => item.id === variantId)

  if (!variant) {
    return definition.variants[0]
  }

  return variant
}

export function getResolvedComponentSpec(
  type: ComponentType,
  variantId?: string,
): ResolvedComponentSpec {
  const definition = getComponentDefinition(type)
  const variant = getComponentVariant(type, variantId ?? definition.defaultVariantId)
  const footprintBoundsMm = variant.footprintBoundsMm ?? definition.footprintBoundsMm
  const defaultMountVisual = getDefaultMountVisual(type, footprintBoundsMm)
  const resolvedRenderHint = mergeRenderHint(definition.renderHint, variant.renderHint)

  return {
    type: definition.type,
    category: definition.category,
    familyLabel: definition.familyLabel,
    defaultLabel: definition.defaultLabel,
    variantId: variant.id,
    variantLabel: variant.label,
    shortVariantLabel: variant.shortLabel ?? variant.label,
    vendor: variant.vendor,
    sku: variant.sku,
    description: variant.description,
    footprintBoundsMm,
    visualBodyBoundsMm:
      variant.visualBodyBoundsMm ??
      definition.visualBodyBoundsMm ??
      insetBounds(footprintBoundsMm, 2, 2),
    hitBoundsMm:
      variant.hitBoundsMm ??
      definition.hitBoundsMm ??
      variant.mount?.supportBoundsMm ??
      definition.mount.supportBoundsMm,
    mountVisualBoundsMm:
      variant.mountVisualBoundsMm ??
      definition.mountVisualBoundsMm ??
      defaultMountVisual.boundsMm,
    mount: variant.mount ?? definition.mount,
    opticalCenterMm: variant.opticalCenterMm ?? definition.opticalCenterMm,
    ports: variant.ports ?? definition.ports,
    renderHint: resolvedRenderHint,
    mountRenderHint:
      definition.mountRenderHint && variant.mountRenderHint
        ? mergeRenderHint(definition.mountRenderHint, variant.mountRenderHint)
        : definition.mountRenderHint
          ? definition.mountRenderHint
          : variant.mountRenderHint && defaultMountVisual.renderHint
            ? mergeRenderHint(defaultMountVisual.renderHint, variant.mountRenderHint)
            : variant.mountRenderHint
              ? mergeRenderHint(definition.renderHint, variant.mountRenderHint)
              : defaultMountVisual.renderHint,
    realisticVisualPreset: mergeRealisticVisualPreset(
      definition.realisticVisualPreset,
      variant.realisticVisualPreset,
    ),
    twoPointFiveDVisualPreset:
      mergeTwoPointFiveDVisualPreset(
        definition.twoPointFiveDVisualPreset,
        variant.twoPointFiveDVisualPreset,
      ) ?? inferTwoPointFiveDVisualPreset(type, footprintBoundsMm, resolvedRenderHint),
    physics: mergePhysics(definition.physics, variant.physics),
    recommendedHardware:
      variant.recommendedHardware ?? definition.recommendedHardware,
    mountSites: variant.mountSites ?? definition.mountSites ?? [],
  }
}

export function getResolvedComponentSpecForInstance(
  component: ComponentInstance,
): ResolvedComponentSpec {
  const spec = getResolvedComponentSpec(component.type, component.variantId)
  const appearanceAdjustedSpec = isStageComponentType(component.type)
    ? (() => {
        const finishAppearance = getStageFinishAppearance(component.finishId)

        return {
          ...spec,
          renderHint: {
            ...spec.renderHint,
            fill: finishAppearance.renderFill,
            stroke: finishAppearance.renderStroke,
          },
          realisticVisualPreset: spec.realisticVisualPreset
            ? {
                ...spec.realisticVisualPreset,
                finish: finishAppearance.realisticFinish,
                accentFill: finishAppearance.accentFill,
                accentStroke: finishAppearance.accentStroke,
              }
            : undefined,
        }
      })()
    : component.type === 'sample'
      ? (() => {
          const materialAppearance = getSampleMaterialAppearance(component.materialId)

          return {
            ...spec,
            renderHint: {
              ...spec.renderHint,
              fill: materialAppearance.renderFill,
              stroke: materialAppearance.renderStroke,
            },
            realisticVisualPreset: spec.realisticVisualPreset
              ? {
                  ...spec.realisticVisualPreset,
                  finish: materialAppearance.realisticFinish,
                  accentFill: materialAppearance.accentFill,
                  accentStroke: materialAppearance.accentStroke,
                }
              : undefined,
          }
        })()
      : spec
  const widthOverrideMm = component.geometryOverride?.widthMm
  const heightOverrideMm = component.geometryOverride?.heightMm

  if (!widthOverrideMm && !heightOverrideMm) {
    return appearanceAdjustedSpec
  }

  const scaleX = widthOverrideMm
    ? widthOverrideMm / appearanceAdjustedSpec.footprintBoundsMm.width
    : 1
  const scaleY = heightOverrideMm
    ? heightOverrideMm / appearanceAdjustedSpec.footprintBoundsMm.height
    : 1

  return {
    ...appearanceAdjustedSpec,
    footprintBoundsMm: scaleBounds(appearanceAdjustedSpec.footprintBoundsMm, scaleX, scaleY)!,
    visualBodyBoundsMm: scaleBounds(appearanceAdjustedSpec.visualBodyBoundsMm, scaleX, scaleY)!,
    hitBoundsMm: scaleBounds(appearanceAdjustedSpec.hitBoundsMm, scaleX, scaleY)!,
    mountVisualBoundsMm: scaleBounds(appearanceAdjustedSpec.mountVisualBoundsMm, scaleX, scaleY),
    mount: {
      ...appearanceAdjustedSpec.mount,
      supportBoundsMm: scaleBounds(
        appearanceAdjustedSpec.mount.supportBoundsMm,
        scaleX,
        scaleY,
      )!,
    },
    opticalCenterMm: appearanceAdjustedSpec.opticalCenterMm
      ? {
          x: appearanceAdjustedSpec.opticalCenterMm.x * scaleX,
          y: appearanceAdjustedSpec.opticalCenterMm.y * scaleY,
        }
      : undefined,
    ports: scalePorts(appearanceAdjustedSpec.ports, scaleX, scaleY),
    mountSites: appearanceAdjustedSpec.mountSites.map((mountSite) => ({
      ...mountSite,
      seatBoundsMm: scaleBounds(mountSite.seatBoundsMm, scaleX, scaleY)!,
      defaultLocalAnchorMm: {
        x: mountSite.defaultLocalAnchorMm.x * scaleX,
        y: mountSite.defaultLocalAnchorMm.y * scaleY,
      },
    })),
    twoPointFiveDVisualPreset: appearanceAdjustedSpec.twoPointFiveDVisualPreset
      ? {
          ...appearanceAdjustedSpec.twoPointFiveDVisualPreset,
          extrusionMm:
            appearanceAdjustedSpec.twoPointFiveDVisualPreset.extrusionMm *
            Math.max(scaleX, scaleY),
          labelAnchorMm: appearanceAdjustedSpec.twoPointFiveDVisualPreset.labelAnchorMm
            ? {
                x:
                  appearanceAdjustedSpec.twoPointFiveDVisualPreset.labelAnchorMm.x *
                  scaleX,
                y:
                  appearanceAdjustedSpec.twoPointFiveDVisualPreset.labelAnchorMm.y *
                  scaleY,
              }
            : undefined,
        }
      : undefined,
  }
}

export function getComponentVariants(type: ComponentType) {
  return getComponentDefinition(type).variants
}

export function supportsMountToggle(type: ComponentType) {
  return includesDefaultMount(type)
}

export function shouldIncludeDefaultMount(
  component: Pick<ComponentInstance, 'config' | 'type'>,
) {
  if (!supportsMountToggle(component.type)) {
    return false
  }

  return component.config.support?.includeMount ?? true
}

export function getEffectiveSupportBoundsMm(
  component: Pick<ComponentInstance, 'config' | 'type'>,
  spec: Pick<ResolvedComponentSpec, 'footprintBoundsMm' | 'mountVisualBoundsMm' | 'mount'>,
) {
  if (
    spec.mount.mode === 'external-source' ||
    !supportsMountToggle(component.type) ||
    !shouldIncludeDefaultMount(component)
  ) {
    return spec.footprintBoundsMm
  }

  return spec.mountVisualBoundsMm ?? spec.mount.supportBoundsMm
}

export function createDefaultComponentConfig(
  type: ComponentType,
  variantId?: string,
  preferredLane: SourceLane = 'left',
): ComponentConfig {
  const spec = getResolvedComponentSpec(type, variantId)
  const supportConfig = includesDefaultMount(type)
    ? {
        includeMount: true,
      }
    : undefined

  switch (type) {
    case 'laser-source': {
      const preset = getSourcePreset('ti-sapphire')

      return {
        source: {
          isEnabled: false,
          presetId: preset.id,
          lane: preferredLane,
          wavelengthNm: preset.wavelengthNm,
          bandwidthNm: preset.bandwidthNm,
          powerMw: preset.powerMw,
          normalizedPowerPercent: 100,
          beamDiameterMm: preset.beamDiameterMm,
          divergenceMrad: preset.divergenceMrad,
          gaussianInputMode: 'derived',
          waistRadiusMm: undefined,
          waistOffsetMm: undefined,
          polarization: {
            basis: 'ray-local',
            presetId: 'linear-in-plane',
            inPlaneAmplitude: 1,
            outOfPlaneAmplitude: 0,
            relativePhaseDeg: 0,
          },
        },
        support: supportConfig,
      }
    }
    case 'lens': {
      const physics = spec.physics.kind === 'lens' ? spec.physics : undefined
      const defaultConfig: LensConfig = {
        focalLengthMm: physics?.defaultFocalLengthMm ?? 100,
        clearApertureMm:
          physics?.defaultClearApertureMm ?? physics?.opticalApertureMm ?? 22,
      }

      return {
        lens: defaultConfig,
        support: supportConfig,
      }
    }
    case 'attenuator': {
      return {
        attenuator: {
          transmissionPercent:
            spec.physics.kind === 'attenuator'
              ? spec.physics.transmissionPercent
              : 50,
          orientation:
            spec.physics.kind === 'attenuator' &&
            spec.physics.orientation === 'vertical'
              ? 'vertical'
              : 'horizontal',
        },
        support: supportConfig,
      }
    }
    case 'polarizer': {
      const physics = spec.physics.kind === 'polarizer' ? spec.physics : undefined

      const defaultConfig: PolarizerConfig = {
        axisLocalDeg: 0,
        extinctionRatio: physics?.extinctionRatio ?? 1000,
        insertionLossPercent: Math.max(
          0,
          roundToTenth(100 - (physics?.transmissionPercent ?? 86)),
        ),
      }

      return {
        polarizer: defaultConfig,
        support: supportConfig,
      }
    }
    case 'waveplate': {
      const physics = spec.physics.kind === 'waveplate' ? spec.physics : undefined
      const defaultRetardanceDeg = physics?.defaultRetardanceDeg ?? 180
      const defaultConfig: WaveplateConfig = {
        kind:
          defaultRetardanceDeg <= 100
            ? 'quarter'
            : defaultRetardanceDeg >= 170 && defaultRetardanceDeg <= 190
              ? 'half'
              : 'custom',
        axisLocalDeg: 0,
        retardanceDeg: defaultRetardanceDeg,
        insertionLossPercent: Math.max(
          0,
          roundToTenth(100 - (physics?.transmissionPercent ?? 98)),
        ),
      }

      return {
        waveplate: defaultConfig,
        support: supportConfig,
      }
    }
    case 'beamsplitter': {
      const physics = spec.physics.kind === 'beamsplitter' ? spec.physics : undefined

      return {
        beamSplitter: {
          reflectPercent: physics?.defaultReflectPercent ?? 50,
          lossPercent: physics?.defaultLossPercent ?? 2,
        },
        support: supportConfig,
      }
    }
    case 'iris': {
      const physics = spec.physics.kind === 'iris' ? spec.physics : undefined

      return {
        iris: {
          apertureMm: physics?.defaultApertureMm ?? 10,
        },
        support: supportConfig,
      }
    }
    case 'bbo-crystal': {
      const physics = spec.physics.kind === 'bbo' ? spec.physics : undefined
      const defaultConfig: BboCrystalConfig = {
        crystalType: 'type-i',
        interactionMode: 'estimated',
        thicknessUm: physics?.defaultThicknessUm ?? 10,
        phaseMatchingAngleDeg: physics?.defaultPhaseMatchingAngleDeg ?? 29.2,
        polarizationAxisLocalDeg: 0,
      }

      return {
        bboCrystal: defaultConfig,
        support: supportConfig,
      }
    }
    case 'mirror':
    case 'folded-mirror-pair': {
      if (spec.variantId === 'flip-mirror') {
        const defaultConfig: FlipMirrorConfig = {
          isFlippedDown: true,
        }

        return {
          flipMirror: defaultConfig,
          support: supportConfig,
        }
      }

      return supportConfig
        ? {
            support: supportConfig,
          }
        : {}
    }
    case 'curved-mirror': {
      const defaultConfig: CurvedMirrorConfig = {
        radiusOfCurvatureMm: spec.physics.kind === 'curved-mirror' ? spec.physics.defaultRadiusOfCurvatureMm : 200,
        isConvex: spec.physics.kind === 'curved-mirror' ? spec.physics.isConvex : false,
      }

      return {
        curvedMirror: defaultConfig,
        support: supportConfig,
      }
    }
    case 'delay-stage':
    case 'support-hardware': {
      const physics = spec.physics.kind === 'delay-line' ? spec.physics : undefined

      if (!physics) {
        return supportConfig
          ? {
              support: supportConfig,
            }
          : {}
      }

      const defaultConfig: DelayLineConfig = {
        positionMm: 0,
        travelMm: physics.defaultTravelMm,
        topology: 'double-pass',
        zeroDelayOffsetFs: 0,
      }

      return {
        delayLine: defaultConfig,
        support: supportConfig,
      }
    }
    case 'telescope': {
      const physics = spec.physics.kind === 'telescope' ? spec.physics : undefined

      const defaultConfig: TelescopeConfig = {
        mode: physics?.mode ?? 'transmission',
        element1Mm: physics?.defaultElement1Mm ?? 50,
        element2Mm: physics?.defaultElement2Mm ?? 100,
        separationMm: physics?.defaultSeparationMm ?? 150,
        clearApertureMm:
          physics?.defaultClearApertureMm ?? physics?.opticalApertureMm ?? 25.4,
      }

      return {
        telescope: defaultConfig,
        support: supportConfig,
      }
    }
    case 'opa-module': {
      const physics = spec.physics
      const defaultConfig: OpaConfig =
        physics.kind === 'opa-white-light'
          ? {
              role: 'white-light',
              targetWavelengthNm: physics.defaultOutputWavelengthNm,
              outputBandwidthNm: physics.defaultOutputBandwidthNm,
              conversionEfficiencyPercent: physics.defaultConversionEfficiencyPercent,
              bandwidthScale: 4,
            }
          : physics.kind === 'opa-gain'
            ? {
                role: 'gain',
                outputMode: 'signal+idler',
                targetWavelengthNm: physics.defaultSignalWavelengthNm,
                outputBandwidthNm: physics.defaultBandwidthNm,
                conversionEfficiencyPercent: physics.defaultConversionEfficiencyPercent,
                signalWavelengthNm: physics.defaultSignalWavelengthNm,
                idlerWavelengthNm: physics.defaultIdlerWavelengthNm,
                pumpDepletionPercent: 15,
              }
            : {
                role: 'combiner',
              }

      return {
        opa: defaultConfig,
        support: supportConfig,
      }
    }
    default:
      return supportConfig
        ? {
            support: supportConfig,
          }
        : {}
  }
}

function roundToTenth(value: number) {
  return Math.round(value * 10) / 10
}

export function isExternalSource(type: ComponentType) {
  return getResolvedComponentSpec(type).mount.mode === 'external-source'
}

export function isOpticalTarget(type: ComponentType) {
  const physicsKind = getResolvedComponentSpec(type).physics.kind

  return physicsKind !== 'none' && physicsKind !== 'source'
}

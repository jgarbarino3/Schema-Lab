import { getSourcePreset } from './sourcePresets'
import type {
  BboCrystalConfig,
  BoundsMm,
  ComponentBeamPhysics,
  ComponentCategory,
  ComponentConfig,
  ComponentDefinition,
  ComponentMount,
  ComponentRenderHint,
  ComponentType,
  ComponentVariant,
  LensConfig,
  MountMode,
  PortDefinition,
  PortKind,
  ResolvedComponentSpec,
  SourceLane,
} from './types'

function bounds(x: number, y: number, width: number, height: number): BoundsMm {
  return { x, y, width, height }
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

function passThroughPhysics(
  transmissionPercent: number,
  minNm: number,
  maxNm: number,
  opticalApertureMm = 25.4,
): ComponentBeamPhysics {
  return {
    kind: 'pass-through',
    opticalApertureMm,
    transmissionPercent,
    supportedWavelengthNm: {
      minNm,
      maxNm,
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
    mount: mount('external-source', -38, -14, 76, 28),
    opticalCenterMm: { x: 8, y: 0 },
    ports: [port('output', 'Output', 'beam-output', 38, 0, 'east')],
    renderHint: renderHint('capsule', '#163949', '#8ad6ff', 'laser'),
    physics: sourcePhysics(480, 1300),
    variants: [
      {
        id: 'fs-source-head',
        label: 'Femtosecond Source Head',
        description: 'External off-board ultrafast source head for FROG and SHG planning.',
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
      },
      {
        id: 'cf175c-m',
        label: 'Clamping Fork',
        vendor: 'Thorlabs',
        sku: 'CF175C/M',
        description: 'Longer-slot clamping fork for awkward hole access.',
        footprintBoundsMm: bounds(-20, -12, 40, 24),
      },
      {
        id: 'ba2-m',
        label: 'Mounting Base',
        vendor: 'Thorlabs',
        sku: 'BA2/M',
        description: 'Mounting base for pedestal-style hardware.',
        footprintBoundsMm: bounds(-15, -15, 30, 30),
      },
      {
        id: 'rs1-5p4m',
        label: 'Pedestal Post',
        vendor: 'Thorlabs',
        sku: 'RS1.5P4M',
        description: '25 mm pedestal pillar post, 38 mm long, with M4 taps.',
        footprintBoundsMm: bounds(-10, -10, 20, 20),
      },
      {
        id: 'rsht1-5-m',
        label: 'Post Holder',
        vendor: 'Thorlabs',
        sku: 'RSHT1.5/M',
        description: '25 mm post holder with flexure lock, 38 mm long.',
        footprintBoundsMm: bounds(-11, -11, 22, 22),
      },
    ],
  },
  {
    type: 'mirror',
    category: 'steering',
    defaultLabel: 'Mirror',
    familyLabel: 'Mirror',
    defaultVariantId: 'bb1-e02',
    footprintBoundsMm: bounds(-12.7, -12.7, 25.4, 25.4),
    mount: mount('clamp-capable', -9, -9, 18, 18),
    opticalCenterMm: { x: 0, y: 0 },
    ports: [
      port('input-west', 'Input', 'beam-input', -12.7, 0, 'west'),
      port('output-north', 'Reflected', 'beam-output', 0, -12.7, 'north'),
    ],
    renderHint: renderHint('rect', '#4b545d', '#e0e7ec', 'mirror'),
    physics: mirrorPhysics(400, 750, 98.5, 1),
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
    ],
  },
  {
    type: 'beamsplitter',
    category: 'splitting',
    defaultLabel: 'Beamsplitter',
    familyLabel: 'Beamsplitter',
    defaultVariantId: 'plate-1in',
    footprintBoundsMm: bounds(-12.7, -12.7, 25.4, 25.4),
    mount: mount('clamp-capable', -9, -9, 18, 18),
    opticalCenterMm: { x: 0, y: 0 },
    ports: [
      port('west', 'West', 'beam-bidirectional', -12.7, 0, 'west'),
      port('east', 'East', 'beam-bidirectional', 12.7, 0, 'east'),
      port('north', 'North', 'beam-bidirectional', 0, -12.7, 'north'),
      port('south', 'South', 'beam-bidirectional', 0, 12.7, 'south'),
    ],
    renderHint: renderHint('diamond', '#1f4b5d', '#9dd2d8', 'beamsplitter'),
    physics: beamsplitterPhysics(),
    variants: [
      {
        id: 'plate-1in',
        label: '1 in Plate Beamsplitter',
        description: 'Generic 1 in plate beamsplitter with user-defined ratio and loss.',
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
    mount: mount('clamp-capable', -9, -9, 18, 18),
    opticalCenterMm: { x: 0, y: 0 },
    ports: [
      port('west', 'Input', 'beam-input', -12.7, 0, 'west'),
      port('east', 'Output', 'beam-output', 12.7, 0, 'east'),
    ],
    renderHint: renderHint('rect', '#5a4730', '#ffcf79', 'lens'),
    physics: lensPhysics(100, 22),
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
    ],
  },
  {
    type: 'filter',
    category: 'conditioning',
    defaultLabel: 'Filter',
    familyLabel: 'Filter',
    defaultVariantId: 'felh0400',
    footprintBoundsMm: bounds(-12.7, -12.7, 25.4, 25.4),
    mount: mount('clamp-capable', -9, -9, 18, 18),
    opticalCenterMm: { x: 0, y: 0 },
    ports: [
      port('west', 'Input', 'beam-input', -12.7, 0, 'west'),
      port('east', 'Output', 'beam-output', 12.7, 0, 'east'),
    ],
    renderHint: renderHint('rect', '#45413b', '#e8d7b6', 'filter'),
    physics: filterPhysics('longpass', {
      cutoffNm: 400,
    }),
    variants: [
      {
        id: 'felh0400',
        label: 'Longpass Filter',
        vendor: 'Thorlabs',
        sku: 'FELH0400',
        description: '400 nm longpass filter for visible pass and deeper-UV rejection.',
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
        physics: filterPhysics('bandpass', {
          centerNm: 266,
          fwhmNm: 10,
          peakTransmissionPercent: 72,
          stopbandTransmissionPercent: 1,
        }),
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
    mount: mount('clamp-capable', -10, -10, 20, 20),
    opticalCenterMm: { x: 0, y: 0 },
    ports: [
      port('west', 'Input', 'beam-input', -14, 0, 'west'),
      port('east', 'Output', 'beam-output', 14, 0, 'east'),
    ],
    renderHint: renderHint('circle', '#38422b', '#c6d67f', 'iris'),
    physics: irisPhysics(12, 12),
    variants: [
      {
        id: 'id8-m',
        label: 'Mounted Standard Iris',
        vendor: 'Thorlabs',
        sku: 'ID8/M',
        description: '8.0 mm max aperture post-mounted iris.',
        physics: irisPhysics(8, 6),
      },
      {
        id: 'id12-m',
        label: 'Mounted Standard Iris',
        vendor: 'Thorlabs',
        sku: 'ID12/M',
        description: '12.0 mm max aperture post-mounted iris; best default alignment choice.',
        physics: irisPhysics(12, 10),
      },
      {
        id: 'id15-m',
        label: 'Mounted Standard Iris',
        vendor: 'Thorlabs',
        sku: 'ID15/M',
        description: '15.0 mm max aperture post-mounted iris with more clearance.',
        physics: irisPhysics(15, 12),
      },
      {
        id: 'id25-m',
        label: 'Mounted Standard Iris',
        vendor: 'Thorlabs',
        sku: 'ID25/M',
        description: '25.0 mm max aperture post-mounted iris for expanded beams.',
        physics: irisPhysics(25, 18),
      },
      {
        id: 'id12z-m',
        label: 'Mounted Zero-Aperture Iris',
        vendor: 'Thorlabs',
        sku: 'ID12Z/M',
        description: '12.0 mm max aperture zero-aperture iris.',
        physics: irisPhysics(12, 8),
      },
      {
        id: 'sm1d12d',
        label: 'SM1 Ring-Actuated Iris',
        vendor: 'Thorlabs',
        sku: 'SM1D12D',
        description: 'SM1-threaded iris with 0.8-12.0 mm aperture.',
        physics: irisPhysics(12, 8),
      },
      {
        id: 'sm1d12c',
        label: 'SM1 Graduated Iris',
        vendor: 'Thorlabs',
        sku: 'SM1D12C',
        description: 'SM1-threaded graduated iris with 1.0-12.0 mm aperture.',
        physics: irisPhysics(12, 8),
      },
      {
        id: 'sm1d12sz',
        label: 'SM1 Zero-Aperture Iris',
        vendor: 'Thorlabs',
        sku: 'SM1D12SZ',
        description: 'SM1-threaded zero-aperture iris that closes fully.',
        physics: irisPhysics(12, 8),
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
    mount: mount('clamp-capable', -9, -9, 18, 18),
    opticalCenterMm: { x: 0, y: 0 },
    ports: [
      port('west', 'Input', 'beam-input', -8, 0, 'west'),
      port('east', 'Output', 'beam-output', 8, 0, 'east'),
    ],
    renderHint: renderHint('rect', '#5f4f7b', '#d9c7ff', 'bbo'),
    physics: bboPhysics(29.2),
    variants: [
      {
        id: 'type-i-bbo',
        label: 'Type I BBO',
        description: 'Type I BBO crystal for SHG and FROG planning.',
      },
    ],
  },
  {
    type: 'sample-stage',
    category: 'sample',
    defaultLabel: 'Sample / Stage',
    familyLabel: 'Sample / Stage',
    defaultVariantId: 'sample-stage-generic',
    footprintBoundsMm: bounds(-25, -19, 50, 38),
    mount: mount('hole-mounted', -25, -19, 50, 38),
    opticalCenterMm: { x: 0, y: 0 },
    ports: [
      port('west', 'Input', 'beam-input', -25, 0, 'west'),
      port('east', 'Output', 'beam-output', 25, 0, 'east'),
    ],
    renderHint: renderHint('rect', '#5d342d', '#efab98', 'sample'),
    physics: passThroughPhysics(95, 350, 1600, 18),
    variants: [
      {
        id: 'sample-stage-generic',
        label: 'Sample / Stage',
        description: 'Generic sample holder or delay stage footprint.',
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
    mount: mount('clamp-capable', -10, -10, 20, 20),
    opticalCenterMm: { x: 6, y: 0 },
    ports: [
      port('beam-input', 'Beam In', 'beam-input', -20, 0, 'west'),
      port('fiber-output', 'Fiber Out', 'beam-output', 20, 0, 'east'),
    ],
    renderHint: renderHint('capsule', '#194544', '#8ad9d6', 'fiber'),
    physics: terminalPhysics('fiber-coupler', 10, 78),
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
    mount: mount('clamp-capable', -10, -10, 20, 20),
    opticalCenterMm: { x: -8, y: 0 },
    ports: [port('input', 'Input', 'beam-input', -18, 0, 'west')],
    renderHint: renderHint('rect', '#47373f', '#f0c9dd', 'detector'),
    physics: terminalPhysics('detector', 10, 92),
    variants: [
      {
        id: 'detector-generic',
        label: 'Detector',
        description: 'Generic beam detector or power meter head.',
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

  return {
    type: definition.type,
    category: definition.category,
    familyLabel: definition.familyLabel,
    defaultLabel: definition.defaultLabel,
    variantId: variant.id,
    variantLabel: variant.label,
    vendor: variant.vendor,
    sku: variant.sku,
    description: variant.description,
    footprintBoundsMm: variant.footprintBoundsMm ?? definition.footprintBoundsMm,
    mount: variant.mount ?? definition.mount,
    opticalCenterMm: variant.opticalCenterMm ?? definition.opticalCenterMm,
    ports: variant.ports ?? definition.ports,
    renderHint: mergeRenderHint(definition.renderHint, variant.renderHint),
    physics: mergePhysics(definition.physics, variant.physics),
  }
}

export function getComponentVariants(type: ComponentType) {
  return getComponentDefinition(type).variants
}

export function createDefaultComponentConfig(
  type: ComponentType,
  variantId?: string,
  preferredLane: SourceLane = 'left',
): ComponentConfig {
  const spec = getResolvedComponentSpec(type, variantId)

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
      }
    }
    case 'beamsplitter': {
      const physics = spec.physics.kind === 'beamsplitter' ? spec.physics : undefined

      return {
        beamSplitter: {
          reflectPercent: physics?.defaultReflectPercent ?? 50,
          lossPercent: physics?.defaultLossPercent ?? 2,
        },
      }
    }
    case 'iris': {
      const physics = spec.physics.kind === 'iris' ? spec.physics : undefined

      return {
        iris: {
          apertureMm: physics?.defaultApertureMm ?? 10,
        },
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
      }
    }
    default:
      return {}
  }
}

export function isExternalSource(type: ComponentType) {
  return getResolvedComponentSpec(type).mount.mode === 'external-source'
}

export function isOpticalTarget(type: ComponentType) {
  const physicsKind = getResolvedComponentSpec(type).physics.kind

  return physicsKind !== 'none' && physicsKind !== 'source'
}

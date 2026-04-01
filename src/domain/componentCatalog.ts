import type {
  ComponentCategory,
  ComponentDefinition,
  ComponentType,
  PortDefinition,
  PortKind,
} from './types'

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

export const COMPONENT_CATEGORY_LABELS: Record<ComponentCategory, string> = {
  source: 'Sources',
  steering: 'Steering',
  splitting: 'Splitters',
  focusing: 'Focusing',
  aperture: 'Apertures',
  sample: 'Samples',
  coupling: 'Coupling',
  measurement: 'Measurement',
  termination: 'Termination',
}

export const COMPONENT_CATEGORY_ORDER: ComponentCategory[] = [
  'source',
  'steering',
  'splitting',
  'focusing',
  'aperture',
  'sample',
  'coupling',
  'measurement',
  'termination',
]

export const COMPONENT_DEFINITIONS: ComponentDefinition[] = [
  {
    type: 'laser-source',
    category: 'source',
    defaultLabel: 'Laser Source',
    footprintBoundsMm: { x: -28, y: -14, width: 56, height: 28 },
    opticalCenterMm: { x: 12, y: 0 },
    ports: [port('output', 'Output', 'beam-output', 28, 0, 'east')],
    renderHint: {
      shape: 'capsule',
      fill: '#14384a',
      stroke: '#7fc7ff',
      glyph: 'laser',
    },
  },
  {
    type: 'mirror',
    category: 'steering',
    defaultLabel: 'Mirror',
    footprintBoundsMm: { x: -12.7, y: -12.7, width: 25.4, height: 25.4 },
    opticalCenterMm: { x: 0, y: 0 },
    ports: [
      port('input-west', 'Input', 'beam-input', -12.7, 0, 'west'),
      port('output-north', 'Reflected', 'beam-output', 0, -12.7, 'north'),
    ],
    renderHint: {
      shape: 'rect',
      fill: '#49535c',
      stroke: '#dde5eb',
      glyph: 'mirror',
    },
  },
  {
    type: 'beamsplitter',
    category: 'splitting',
    defaultLabel: 'Beamsplitter',
    footprintBoundsMm: { x: -12.7, y: -12.7, width: 25.4, height: 25.4 },
    opticalCenterMm: { x: 0, y: 0 },
    ports: [
      port('west', 'West', 'beam-bidirectional', -12.7, 0, 'west'),
      port('east', 'East', 'beam-bidirectional', 12.7, 0, 'east'),
      port('north', 'North', 'beam-bidirectional', 0, -12.7, 'north'),
      port('south', 'South', 'beam-bidirectional', 0, 12.7, 'south'),
    ],
    renderHint: {
      shape: 'diamond',
      fill: '#1f4b5d',
      stroke: '#9dd2d8',
      glyph: 'beamsplitter',
    },
  },
  {
    type: 'lens',
    category: 'focusing',
    defaultLabel: 'Lens',
    footprintBoundsMm: { x: -12.7, y: -18, width: 25.4, height: 36 },
    opticalCenterMm: { x: 0, y: 0 },
    ports: [
      port('west', 'Input', 'beam-input', -12.7, 0, 'west'),
      port('east', 'Output', 'beam-output', 12.7, 0, 'east'),
    ],
    renderHint: {
      shape: 'rect',
      fill: '#58472f',
      stroke: '#ffcd72',
      glyph: 'lens',
    },
  },
  {
    type: 'iris',
    category: 'aperture',
    defaultLabel: 'Iris',
    footprintBoundsMm: { x: -14, y: -14, width: 28, height: 28 },
    opticalCenterMm: { x: 0, y: 0 },
    ports: [
      port('west', 'Input', 'beam-input', -14, 0, 'west'),
      port('east', 'Output', 'beam-output', 14, 0, 'east'),
    ],
    renderHint: {
      shape: 'circle',
      fill: '#38422b',
      stroke: '#c6d67f',
      glyph: 'iris',
    },
  },
  {
    type: 'sample-stage',
    category: 'sample',
    defaultLabel: 'Sample / Stage',
    footprintBoundsMm: { x: -25, y: -19, width: 50, height: 38 },
    opticalCenterMm: { x: 0, y: 0 },
    ports: [
      port('west', 'Input', 'beam-input', -25, 0, 'west'),
      port('east', 'Output', 'beam-output', 25, 0, 'east'),
    ],
    renderHint: {
      shape: 'rect',
      fill: '#5d342d',
      stroke: '#efab98',
      glyph: 'sample',
    },
  },
  {
    type: 'fiber-coupler',
    category: 'coupling',
    defaultLabel: 'Fiber Coupler',
    footprintBoundsMm: { x: -20, y: -15, width: 40, height: 30 },
    opticalCenterMm: { x: 6, y: 0 },
    ports: [
      port('beam-input', 'Beam In', 'beam-input', -20, 0, 'west'),
      port('fiber-output', 'Fiber Out', 'beam-output', 20, 0, 'east'),
    ],
    renderHint: {
      shape: 'capsule',
      fill: '#194544',
      stroke: '#8ad9d6',
      glyph: 'fiber',
    },
  },
  {
    type: 'spectrometer',
    category: 'measurement',
    defaultLabel: 'Spectrometer',
    footprintBoundsMm: { x: -31, y: -20, width: 62, height: 40 },
    opticalCenterMm: { x: -18, y: 0 },
    ports: [port('input', 'Input', 'beam-input', -31, 0, 'west')],
    renderHint: {
      shape: 'rect',
      fill: '#2b294b',
      stroke: '#b6b0ff',
      glyph: 'spectrometer',
    },
  },
  {
    type: 'detector',
    category: 'measurement',
    defaultLabel: 'Detector',
    footprintBoundsMm: { x: -18, y: -18, width: 36, height: 36 },
    opticalCenterMm: { x: -8, y: 0 },
    ports: [port('input', 'Input', 'beam-input', -18, 0, 'west')],
    renderHint: {
      shape: 'rect',
      fill: '#47373f',
      stroke: '#f0c9dd',
      glyph: 'detector',
    },
  },
  {
    type: 'beam-dump',
    category: 'termination',
    defaultLabel: 'Beam Dump',
    footprintBoundsMm: { x: -16, y: -16, width: 32, height: 32 },
    opticalCenterMm: { x: 0, y: 0 },
    ports: [port('input', 'Input', 'beam-input', -16, 0, 'west')],
    renderHint: {
      shape: 'circle',
      fill: '#453523',
      stroke: '#f6c27c',
      glyph: 'beam-dump',
    },
  },
]

export const COMPONENT_DEFINITIONS_BY_TYPE = Object.fromEntries(
  COMPONENT_DEFINITIONS.map((definition) => [definition.type, definition]),
) as Record<ComponentType, ComponentDefinition>

export function getComponentDefinition(type: ComponentType) {
  return COMPONENT_DEFINITIONS_BY_TYPE[type]
}

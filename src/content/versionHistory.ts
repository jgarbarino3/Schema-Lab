export interface VersionHistoryEntry {
  version: string
  summary: string
  highlights?: string[]
}

export const CURRENT_VERSION = 'v1.8'

export const VERSION_HISTORY: VersionHistoryEntry[] = [
  {
    version: 'v1.8',
    summary:
      'Canvas annotations feel much more polished with compact controls, cleaner header space, and one-click placement that behaves like the rest of the workspace.',
    highlights: [
      'Smaller header-docked text and shape tools',
      'One-shot text and shape placement',
      'Cleaner workspace header and softer board focus styling',
    ],
  },
  {
    version: 'v1.7',
    summary:
      'Board Focus, guided laser setup, and smoother table interactions make multi-breadboard planning much easier to control.',
    highlights: [
      'Board Focus and Table View workflow',
      'Guided first-target laser placement',
      'Breadboard-aware dragging and viewport polish',
    ],
  },
  {
    version: 'v1.5',
    summary:
      'Premium UI polish and seamless optical-table interactions make the current app feel like the first mature release.',
    highlights: [
      'Compact polished UI',
      'Better table placement',
      'Smoother multi-surface interaction',
    ],
  },
  {
    version: 'v1.4',
    summary:
      'SVG import and richer component editing made complex setups faster to build and refine.',
    highlights: [
      'Interpreted SVG import',
      'Ambiguity review',
      'Resize controls and glyph polish',
    ],
  },
  {
    version: 'v1.2',
    summary:
      'Onboarding and communication improved with tutorial flows, realistic top-down rendering, and beam-line annotations.',
    highlights: ['Tutorial scene', 'Realistic mode', 'Beam lines'],
  },
  {
    version: 'v1.0',
    summary:
      'Optical table mode introduced multi-breadboard planning and large-hardware layouts.',
    highlights: [
      'Optical table workspace',
      'Multiple breadboards',
      'Table-scale planning',
    ],
  },
  {
    version: 'v0.8',
    summary:
      'Practical planning workflows expanded with warnings, exports, touch navigation, and clearer placement behavior.',
    highlights: [
      'Warning review',
      'Grouped and mechanical exports',
      'Touch pinch support',
    ],
  },
  {
    version: 'v0.5',
    summary:
      'Beam tracing and Gaussian planning turned Schema-Lab from a layout tool into an optics analysis workspace.',
    highlights: [
      'Deterministic beam paths',
      'Power bookkeeping',
      'Gaussian layer',
    ],
  },
  {
    version: 'v0.1',
    summary:
      'Initial millimeter-first breadboard editor with core placement, rotation-aware optics, and scene save/load.',
  },
]

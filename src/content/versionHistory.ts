export interface VersionHistoryEntry {
  version: string
  summary: string
  highlights?: string[]
}

export const CURRENT_VERSION = 'v2.0'

export const VERSION_HISTORY: VersionHistoryEntry[] = [
  {
    version: 'v2.0',
    summary:
      'Schema-Lab 2.0 overhauled the editor into a cleaner canvas-first workspace with faster tool access, lighter panels, highlight workflows, stronger simple-mode legibility, and a much more customizable UI for day-to-day optics layout work.',
    highlights: [
      'Two-row premium editor chrome with calmer branding and a bottom status bar',
      'Contextual selection actions, right-click editing, and Highlight bundle rotation',
      'Search-first component library with Recent items and lighter browsing',
      'Cleaner inspector quick-edit layout with collapsed advanced sections',
      'Simple-mode appearance controls for glyph optics plus stronger source visibility',
      'Board Focus, Solo Board, and table workflows refined for multi-breadboard planning',
      'Keyboard-shortcut discoverability, help cleanup, and reduced instructional clutter',
      'Viewport recovery polish, top-biased framing, and denser canvas visibility',
    ],
  },
  {
    version: 'v1.8',
    summary:
      'Schema-Lab added freeform canvas annotations so layouts can include notes, callouts, and diagram shapes with built-in styling controls.',
    highlights: [
      'Text, sticky notes, note cards, callout bubbles, and diagram shapes',
      'Font, color, alignment, fill, and stroke customization',
      'Inline editing, resizing, layering, and export support',
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

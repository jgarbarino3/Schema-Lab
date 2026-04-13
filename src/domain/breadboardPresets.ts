import type { BreadboardModel } from './types'

export interface BreadboardPreset {
  id: string
  label: string
  breadboard: BreadboardModel
}

const COMMON_BREADBOARD_FIELDS = {
  holeSpacingMm: 25,
  edgeMarginMm: 12.5,
  thicknessMm: 12.7,
  finish: 'black-anodized',
  holeDensity: 'single',
  counterborePattern: 'corner-25mm',
} as const

export const BREADBOARD_PRESETS: BreadboardPreset[] = [
  {
    id: 'metric-300-square',
    label: 'Metric 300 × 300 mm',
    breadboard: {
      ...COMMON_BREADBOARD_FIELDS,
      label: 'Metric Breadboard 300 × 300',
      widthMm: 300,
      heightMm: 300,
      presetId: 'metric-300-square',
    },
  },
  {
    id: 'metric-300x400',
    label: 'Metric 300 × 400 mm',
    breadboard: {
      ...COMMON_BREADBOARD_FIELDS,
      label: 'Metric Breadboard 300 × 400',
      widthMm: 300,
      heightMm: 400,
      presetId: 'metric-300x400',
    },
  },
  {
    id: 'metric-300x600',
    label: 'Metric 300 × 600 mm',
    breadboard: {
      ...COMMON_BREADBOARD_FIELDS,
      label: 'Metric Breadboard 300 × 600',
      widthMm: 300,
      heightMm: 600,
      thicknessMm: 19,
      presetId: 'metric-300x600',
    },
  },
  {
    id: 'metric-350-square',
    label: 'Metric 350 × 350 mm',
    breadboard: {
      ...COMMON_BREADBOARD_FIELDS,
      label: 'Metric Breadboard 350 × 350',
      widthMm: 350,
      heightMm: 350,
      presetId: 'metric-350-square',
    },
  },
]

export const DEFAULT_BREADBOARD_PRESET_ID = 'metric-350-square'

const PRESET_SIGNATURE_KEYS: Array<
  keyof Pick<
    BreadboardModel,
    | 'widthMm'
    | 'heightMm'
    | 'holeSpacingMm'
    | 'edgeMarginMm'
    | 'thicknessMm'
    | 'finish'
    | 'holeDensity'
    | 'counterborePattern'
  >
> = [
  'widthMm',
  'heightMm',
  'holeSpacingMm',
  'edgeMarginMm',
  'thicknessMm',
  'finish',
  'holeDensity',
  'counterborePattern',
]

export function getBreadboardPresetById(presetId: string) {
  return BREADBOARD_PRESETS.find((preset) => preset.id === presetId)
}

export function createBreadboardFromPreset(presetId: string) {
  const matchingPreset =
    getBreadboardPresetById(presetId) ??
    getBreadboardPresetById(DEFAULT_BREADBOARD_PRESET_ID)

  if (!matchingPreset) {
    throw new Error('No breadboard presets are available.')
  }

  return { ...matchingPreset.breadboard }
}

export function getDefaultBreadboard() {
  return createBreadboardFromPreset(DEFAULT_BREADBOARD_PRESET_ID)
}

export function findBreadboardPresetId(breadboard: BreadboardModel) {
  return BREADBOARD_PRESETS.find((preset) =>
    PRESET_SIGNATURE_KEYS.every(
      (key) => preset.breadboard[key] === breadboard[key],
    ),
  )?.id
}

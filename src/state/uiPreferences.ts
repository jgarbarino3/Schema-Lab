export type SimpleIconStyle = 'clean' | 'classic'

export const DEFAULT_SIMPLE_ICON_STYLE: SimpleIconStyle = 'clean'

export function isSimpleIconStyle(value: string | undefined): value is SimpleIconStyle {
  return value === 'clean' || value === 'classic'
}

import type { PlacementStatus } from '../domain/types'

export function applyAlpha(hexColor: string, alpha: number) {
  const normalized = hexColor.replace('#', '')

  if (![3, 6].includes(normalized.length)) {
    return hexColor
  }

  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((character) => `${character}${character}`)
          .join('')
      : normalized
  const parsed = Number.parseInt(expanded, 16)

  if (!Number.isFinite(parsed)) {
    return hexColor
  }

  const red = (parsed >> 16) & 255
  const green = (parsed >> 8) & 255
  const blue = parsed & 255

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export function shadeHex(hexColor: string, factor: number) {
  const normalized = hexColor.replace('#', '')

  if (![3, 6].includes(normalized.length)) {
    return hexColor
  }

  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((character) => `${character}${character}`)
          .join('')
      : normalized
  const parsed = Number.parseInt(expanded, 16)

  if (!Number.isFinite(parsed)) {
    return hexColor
  }

  const transform = (value: number) =>
    Math.round(
      factor >= 0
        ? value + (255 - value) * factor
        : value * (1 + factor),
    )
      .toString(16)
      .padStart(2, '0')

  return `#${transform((parsed >> 16) & 255)}${transform((parsed >> 8) & 255)}${transform(parsed & 255)}`
}

export function getPlacementAccent(status: PlacementStatus | undefined) {
  switch (status) {
    case 'snapped':
      return '#9adbf0'
    case 'warning':
      return '#f5d28c'
    case 'valid':
    default:
      return '#bcdbe6'
  }
}

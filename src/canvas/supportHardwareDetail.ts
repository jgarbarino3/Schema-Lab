import {
  isPostMountedType,
} from '../domain/componentCatalog'
import type { ComponentType, RenderMode } from '../domain/types'

export type SupportHardwareDetail = 'none' | 'foot' | 'holder' | 'full-stack'

export const SUPPORT_HARDWARE_ZOOM_THRESHOLDS = {
  holder: 0.46,
  fullStack: 0.92,
} as const

export function resolveSupportHardwareDetail(args: {
  renderMode: RenderMode
  showPostHolders: boolean
  type: ComponentType
  zoomPxPerMm: number
}): SupportHardwareDetail {
  const { renderMode, showPostHolders, type, zoomPxPerMm } = args

  if (!isPostMountedType(type)) {
    return 'none'
  }

  if (renderMode === 'simple') {
    return showPostHolders ? 'full-stack' : 'none'
  }

  if (zoomPxPerMm < SUPPORT_HARDWARE_ZOOM_THRESHOLDS.holder) {
    return 'foot'
  }

  if (zoomPxPerMm < SUPPORT_HARDWARE_ZOOM_THRESHOLDS.fullStack) {
    return 'holder'
  }

  return 'full-stack'
}

import { describe, expect, it } from 'vitest'
import {
  resolveSupportHardwareDetail,
  SUPPORT_HARDWARE_ZOOM_THRESHOLDS,
} from '../canvas/supportHardwareDetail'

describe('resolveSupportHardwareDetail', () => {
  it('returns zoom-tiered support detail in realistic mode', () => {
    expect(
      resolveSupportHardwareDetail({
        renderMode: 'realistic',
        showPostHolders: false,
        type: 'mirror',
        zoomPxPerMm: SUPPORT_HARDWARE_ZOOM_THRESHOLDS.holder - 0.01,
      }),
    ).toBe('foot')

    expect(
      resolveSupportHardwareDetail({
        renderMode: 'realistic',
        showPostHolders: false,
        type: 'attenuator',
        zoomPxPerMm:
          (SUPPORT_HARDWARE_ZOOM_THRESHOLDS.holder +
            SUPPORT_HARDWARE_ZOOM_THRESHOLDS.fullStack) /
          2,
      }),
    ).toBe('holder')

    expect(
      resolveSupportHardwareDetail({
        renderMode: 'realistic',
        showPostHolders: false,
        type: 'waveplate',
        zoomPxPerMm: SUPPORT_HARDWARE_ZOOM_THRESHOLDS.fullStack + 0.01,
      }),
    ).toBe('full-stack')
  })

  it('keeps simple mode gated by the post-holder toggle', () => {
    expect(
      resolveSupportHardwareDetail({
        renderMode: 'simple',
        showPostHolders: false,
        type: 'mirror',
        zoomPxPerMm: 2,
      }),
    ).toBe('none')

    expect(
      resolveSupportHardwareDetail({
        renderMode: 'simple',
        showPostHolders: true,
        type: 'mirror',
        zoomPxPerMm: 0.2,
      }),
    ).toBe('full-stack')
  })

  it('never shows support hardware for non-post-mounted families', () => {
    expect(
      resolveSupportHardwareDetail({
        renderMode: 'realistic',
        showPostHolders: true,
        type: 'laser-source',
        zoomPxPerMm: 3,
      }),
    ).toBe('none')
  })
})

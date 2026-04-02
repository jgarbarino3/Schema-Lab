import { roundMm } from './geometry'
import type {
  PolarizationConfig,
  PolarizationPresetId,
  PolarizationSnapshot,
} from './types'

const POLARIZATION_PRESETS: Record<
  PolarizationPresetId,
  Omit<PolarizationConfig, 'basis' | 'presetId'>
> = {
  'linear-in-plane': {
    inPlaneAmplitude: 1,
    outOfPlaneAmplitude: 0,
    relativePhaseDeg: 0,
  },
  'linear-out-of-plane': {
    inPlaneAmplitude: 0,
    outOfPlaneAmplitude: 1,
    relativePhaseDeg: 0,
  },
  'circular-right': {
    inPlaneAmplitude: 1,
    outOfPlaneAmplitude: 1,
    relativePhaseDeg: 90,
  },
  'circular-left': {
    inPlaneAmplitude: 1,
    outOfPlaneAmplitude: 1,
    relativePhaseDeg: -90,
  },
  elliptical: {
    inPlaneAmplitude: 1,
    outOfPlaneAmplitude: 0.55,
    relativePhaseDeg: 45,
  },
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

export function createDefaultPolarizationConfig(): PolarizationConfig {
  return {
    basis: 'ray-local',
    presetId: 'linear-in-plane',
    ...POLARIZATION_PRESETS['linear-in-plane'],
  }
}

export function applyPolarizationPreset(
  presetId: PolarizationPresetId,
  current?: PolarizationConfig,
): PolarizationConfig {
  return {
    ...(current ?? createDefaultPolarizationConfig()),
    ...POLARIZATION_PRESETS[presetId],
    presetId,
    basis: 'ray-local',
  }
}

export function createPolarizationSnapshot(
  polarization?: PolarizationConfig,
): PolarizationSnapshot {
  const current = polarization ?? createDefaultPolarizationConfig()
  const inPlaneAmplitude = Math.max(0, current.inPlaneAmplitude)
  const outOfPlaneAmplitude = Math.max(0, current.outOfPlaneAmplitude)
  const totalIntensity =
    inPlaneAmplitude ** 2 + outOfPlaneAmplitude ** 2 || 1
  const inPlaneFraction = roundMm((inPlaneAmplitude ** 2) / totalIntensity)
  const outOfPlaneFraction = roundMm((outOfPlaneAmplitude ** 2) / totalIntensity)
  const delta = Math.abs(inPlaneFraction - outOfPlaneFraction)
  const dominantAxis =
    delta < 0.1
      ? 'balanced'
      : inPlaneFraction >= outOfPlaneFraction
        ? 'in-plane'
        : 'out-of-plane'

  return {
    basis: 'ray-local',
    presetId: current.presetId,
    inPlaneAmplitude,
    outOfPlaneAmplitude,
    relativePhaseDeg: current.relativePhaseDeg,
    inPlaneFraction,
    outOfPlaneFraction,
    dominantAxis,
    tag: describePolarization(current),
  }
}

export function describePolarization(
  polarization?: PolarizationConfig | PolarizationSnapshot,
) {
  const current = polarization ?? createDefaultPolarizationConfig()

  if (current.presetId === 'linear-in-plane') {
    return 'Linear in-plane'
  }

  if (current.presetId === 'linear-out-of-plane') {
    return 'Linear out-of-plane'
  }

  if (current.presetId === 'circular-right') {
    return 'Circular right-handed'
  }

  if (current.presetId === 'circular-left') {
    return 'Circular left-handed'
  }

  const snapshot = createPolarizationSnapshot(current)

  if (snapshot.dominantAxis === 'balanced') {
    return `Balanced elliptical (${roundMm(current.relativePhaseDeg)}° phase)`
  }

  return `${snapshot.dominantAxis === 'in-plane' ? 'In-plane' : 'Out-of-plane'} elliptical (${roundMm(current.relativePhaseDeg)}° phase)`
}

export function getPolarizationReflectivityPercent(args: {
  baseReflectPercent: number
  polarization: PolarizationSnapshot
  sReflectBiasPercent: number
  pReflectBiasPercent: number
}) {
  return roundMm(
    clamp(
      args.baseReflectPercent +
        args.polarization.outOfPlaneFraction * args.sReflectBiasPercent +
        args.polarization.inPlaneFraction * args.pReflectBiasPercent,
      0,
      98,
    ),
  )
}

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

interface ComplexValue {
  real: number
  imag: number
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180
}

function createComplex(real: number, imag = 0): ComplexValue {
  return { real, imag }
}

function multiplyComplex(a: ComplexValue, b: ComplexValue): ComplexValue {
  return {
    real: a.real * b.real - a.imag * b.imag,
    imag: a.real * b.imag + a.imag * b.real,
  }
}

function addComplex(a: ComplexValue, b: ComplexValue): ComplexValue {
  return {
    real: a.real + b.real,
    imag: a.imag + b.imag,
  }
}

function scaleComplex(value: ComplexValue, scale: number): ComplexValue {
  return {
    real: value.real * scale,
    imag: value.imag * scale,
  }
}

function magnitudeSquared(value: ComplexValue) {
  return value.real ** 2 + value.imag ** 2
}

function phaseDegrees(value: ComplexValue) {
  return (Math.atan2(value.imag, value.real) * 180) / Math.PI
}

function snapshotToJones(snapshot: PolarizationSnapshot) {
  const deltaRad = toRadians(snapshot.relativePhaseDeg)

  return {
    x: createComplex(snapshot.inPlaneAmplitude, 0),
    y: createComplex(
      snapshot.outOfPlaneAmplitude * Math.cos(deltaRad),
      snapshot.outOfPlaneAmplitude * Math.sin(deltaRad),
    ),
  }
}

function jonesToSnapshot(
  state: { x: ComplexValue; y: ComplexValue },
  fallbackPresetId: PolarizationPresetId = 'elliptical',
): PolarizationSnapshot {
  const xAmplitude = Math.sqrt(Math.max(0, magnitudeSquared(state.x)))
  const yAmplitude = Math.sqrt(Math.max(0, magnitudeSquared(state.y)))
  const xPhase = phaseDegrees(state.x)
  const yPhase = phaseDegrees(state.y)
  let relativePhaseDeg = yPhase - xPhase

  while (relativePhaseDeg > 180) {
    relativePhaseDeg -= 360
  }

  while (relativePhaseDeg < -180) {
    relativePhaseDeg += 360
  }

  return createPolarizationSnapshot({
    basis: 'ray-local',
    presetId: fallbackPresetId,
    inPlaneAmplitude: roundMm(xAmplitude),
    outOfPlaneAmplitude: roundMm(yAmplitude),
    relativePhaseDeg: roundMm(relativePhaseDeg),
  })
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
  const inPlaneAmplitude = Math.max(0, current.inPlaneAmplitude)
  const outOfPlaneAmplitude = Math.max(0, current.outOfPlaneAmplitude)
  const totalIntensity =
    inPlaneAmplitude ** 2 + outOfPlaneAmplitude ** 2 || 1
  const inPlaneFraction = (inPlaneAmplitude ** 2) / totalIntensity
  const outOfPlaneFraction = (outOfPlaneAmplitude ** 2) / totalIntensity
  const delta = Math.abs(inPlaneFraction - outOfPlaneFraction)
  const dominantAxis =
    delta < 0.1
      ? 'balanced'
      : inPlaneFraction >= outOfPlaneFraction
        ? 'in-plane'
        : 'out-of-plane'

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

  if (dominantAxis === 'balanced') {
    return `Balanced elliptical (${roundMm(current.relativePhaseDeg)}° phase)`
  }

  return `${dominantAxis === 'in-plane' ? 'In-plane' : 'Out-of-plane'} elliptical (${roundMm(current.relativePhaseDeg)}° phase)`
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

export function applyPolarizerToSnapshot(args: {
  polarization: PolarizationSnapshot
  axisLocalDeg: number
  extinctionRatio: number
}) {
  const theta = toRadians(args.axisLocalDeg)
  const transmission = {
    x: Math.cos(theta),
    y: Math.sin(theta),
  }
  const orthogonal = {
    x: -Math.sin(theta),
    y: Math.cos(theta),
  }
  const state = snapshotToJones(args.polarization)
  const transmittedAmplitude = addComplex(
    scaleComplex(state.x, transmission.x),
    scaleComplex(state.y, transmission.y),
  )
  const leakageScale = 1 / Math.sqrt(Math.max(args.extinctionRatio, 1))
  const rejectedAmplitude = addComplex(
    scaleComplex(state.x, orthogonal.x * leakageScale),
    scaleComplex(state.y, orthogonal.y * leakageScale),
  )
  const nextState = {
    x: addComplex(
      scaleComplex(transmittedAmplitude, transmission.x),
      scaleComplex(rejectedAmplitude, orthogonal.x),
    ),
    y: addComplex(
      scaleComplex(transmittedAmplitude, transmission.y),
      scaleComplex(rejectedAmplitude, orthogonal.y),
    ),
  }
  const inputIntensity =
    magnitudeSquared(state.x) + magnitudeSquared(state.y) || 1
  const outputIntensity =
    magnitudeSquared(nextState.x) + magnitudeSquared(nextState.y)

  return {
    polarization: jonesToSnapshot(nextState, 'linear-in-plane'),
    transmissionFraction: clamp(outputIntensity / inputIntensity, 0, 1),
  }
}

export function applyWaveplateToSnapshot(args: {
  polarization: PolarizationSnapshot
  axisLocalDeg: number
  retardanceDeg: number
}) {
  const theta = toRadians(args.axisLocalDeg)
  const fast = {
    x: Math.cos(theta),
    y: Math.sin(theta),
  }
  const slow = {
    x: -Math.sin(theta),
    y: Math.cos(theta),
  }
  const state = snapshotToJones(args.polarization)
  const fastAmplitude = addComplex(
    scaleComplex(state.x, fast.x),
    scaleComplex(state.y, fast.y),
  )
  const slowAmplitude = addComplex(
    scaleComplex(state.x, slow.x),
    scaleComplex(state.y, slow.y),
  )
  const retardance = toRadians(args.retardanceDeg)
  const delayedSlow = multiplyComplex(
    slowAmplitude,
    createComplex(Math.cos(retardance), Math.sin(retardance)),
  )
  const nextState = {
    x: addComplex(
      scaleComplex(fastAmplitude, fast.x),
      scaleComplex(delayedSlow, slow.x),
    ),
    y: addComplex(
      scaleComplex(fastAmplitude, fast.y),
      scaleComplex(delayedSlow, slow.y),
    ),
  }

  return jonesToSnapshot(nextState)
}

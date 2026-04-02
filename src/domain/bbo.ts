import { roundMm } from './geometry'
import type {
  BboDerivedMetrics,
  BboInteractionMode,
  BboPolarizationSummary,
  PolarizationSnapshot,
} from './types'

const BBO_PHASE_MATCH_ANCHORS = [
  { wavelengthNm: 515, angleDeg: 43.5 },
  { wavelengthNm: 680, angleDeg: 30.5 },
  { wavelengthNm: 800, angleDeg: 29.2 },
  { wavelengthNm: 1030, angleDeg: 23.3 },
  { wavelengthNm: 1550, angleDeg: 19.8 },
]

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function interpolate(
  value: number,
  start: { wavelengthNm: number; angleDeg: number },
  end: { wavelengthNm: number; angleDeg: number },
) {
  const t =
    (value - start.wavelengthNm) / (end.wavelengthNm - start.wavelengthNm)

  return start.angleDeg + (end.angleDeg - start.angleDeg) * t
}

export function getIdealBboPhaseMatchingAngleDeg(wavelengthNm: number) {
  if (wavelengthNm <= BBO_PHASE_MATCH_ANCHORS[0].wavelengthNm) {
    return BBO_PHASE_MATCH_ANCHORS[0].angleDeg
  }

  const lastAnchor = BBO_PHASE_MATCH_ANCHORS[BBO_PHASE_MATCH_ANCHORS.length - 1]

  if (wavelengthNm >= lastAnchor.wavelengthNm) {
    return lastAnchor.angleDeg
  }

  for (let index = 0; index < BBO_PHASE_MATCH_ANCHORS.length - 1; index += 1) {
    const start = BBO_PHASE_MATCH_ANCHORS[index]
    const end = BBO_PHASE_MATCH_ANCHORS[index + 1]

    if (wavelengthNm >= start.wavelengthNm && wavelengthNm <= end.wavelengthNm) {
      return interpolate(wavelengthNm, start, end)
    }
  }

  return 29.2
}

export function deriveBboMetrics(args: {
  beamDiameterMm: number
  bandwidthNm: number
  interactionMode: BboInteractionMode
  phaseMatchingAngleDeg: number
  thicknessUm: number
  wavelengthNm: number
}): BboDerivedMetrics {
  const idealPhaseMatchingAngleDeg = roundMm(
    getIdealBboPhaseMatchingAngleDeg(args.wavelengthNm),
  )
  const thicknessUm = Math.max(args.thicknessUm, 1)
  const angularAcceptanceDeg = roundMm(
    clamp((24 / thicknessUm) * (args.wavelengthNm / 800) ** 0.35, 0.08, 3.5),
  )
  const acceptanceBandwidthNm = roundMm(
    clamp((1600 / thicknessUm) * (args.wavelengthNm / 800) ** 1.15, 0.8, 220),
  )
  const angularDetuningDeg = roundMm(
    args.phaseMatchingAngleDeg - idealPhaseMatchingAngleDeg,
  )
  const normalizedAngleError =
    angularAcceptanceDeg > 0 ? angularDetuningDeg / angularAcceptanceDeg : 0
  const normalizedBandwidth =
    acceptanceBandwidthNm > 0 ? args.bandwidthNm / acceptanceBandwidthNm : 0
  const thinCrystalBoost = clamp((120 / thicknessUm) ** 0.3, 0.6, 2.2)
  const diameterPenalty = clamp(1 - args.beamDiameterMm * 0.035, 0.55, 1)
  const baseEfficiencyPercent =
    args.interactionMode === 'advanced'
      ? 15 * thinCrystalBoost
      : 8.5 * thinCrystalBoost
  const angleFactor =
    args.interactionMode === 'advanced'
      ? Math.exp(-((normalizedAngleError * 1.35) ** 2))
      : Math.exp(-((normalizedAngleError * 0.9) ** 2))
  const bandwidthFactor =
    args.interactionMode === 'advanced'
      ? Math.exp(-((normalizedBandwidth * 1.1) ** 2))
      : Math.exp(-((normalizedBandwidth * 0.65) ** 2))
  const estimatedEfficiencyPercent = roundMm(
    clamp(baseEfficiencyPercent * angleFactor * bandwidthFactor * diameterPenalty, 0, 35),
  )
  const fundamentalTransmissionPercent = roundMm(
    clamp(100 - estimatedEfficiencyPercent - (args.interactionMode === 'advanced' ? 3 : 1.5), 40, 99),
  )

  return {
    idealPhaseMatchingAngleDeg,
    angularDetuningDeg,
    angularAcceptanceDeg,
    acceptanceBandwidthNm,
    estimatedEfficiencyPercent,
    fundamentalTransmissionPercent,
    shgWavelengthNm: roundMm(args.wavelengthNm / 2),
  }
}

export function deriveBboPolarizationSummary(args: {
  axisLocalDeg: number
  polarization: PolarizationSnapshot
}): BboPolarizationSummary {
  const angleRad = (args.axisLocalDeg * Math.PI) / 180
  const inPlaneWeight = Math.cos(angleRad) ** 2
  const outOfPlaneWeight = Math.sin(angleRad) ** 2
  const compatibilityPercent = roundMm(
    (args.polarization.inPlaneFraction * inPlaneWeight +
      args.polarization.outOfPlaneFraction * outOfPlaneWeight) *
      100,
  )
  const dominantContribution =
    inPlaneWeight >= outOfPlaneWeight ? 'in-plane' : 'out-of-plane'
  const explanation =
    dominantContribution === 'in-plane'
      ? 'Type I estimate is currently favoring the ray-local in-plane component.'
      : 'Type I estimate is currently favoring the ray-local out-of-plane component.'

  return {
    axisLocalDeg: roundMm(args.axisLocalDeg),
    compatibilityPercent,
    dominantContribution,
    explanation,
  }
}

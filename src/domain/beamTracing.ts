import { deriveBboMetrics, deriveBboPolarizationSummary } from './bbo'
import { getResolvedComponentSpec } from './componentCatalog'
import {
  normalizeQuarterTurns,
  rotatePointQuarterTurns,
  roundMm,
} from './geometry'
import { getSceneWorldBoundsMm } from './placement'
import {
  applyPolarizerToSnapshot,
  applyWaveplateToSnapshot,
  createPolarizationSnapshot,
  getPolarizationReflectivityPercent,
} from './polarization'
import { getWorldPortsForComponent } from './ports'
import type {
  BeamAttenuationClass,
  BeamBranchKind,
  BeamBranchResult,
  BeamContentTag,
  BeamInteractionEvent,
  BeamOutcomeClass,
  BeamPathSummary,
  BeamSegment,
  BeamSourceSummary,
  BeamTraceResult,
  CardinalDirection,
  ComponentInstance,
  ComponentType,
  FilterTransmissionClass,
  PolarizationSnapshot,
  ResolvedComponentSpec,
  SceneDocument,
  SourceConfig,
  TerminalCaptureHit,
  Vector2Mm,
} from './types'

const MAX_TRACE_DEPTH = 24
const MIN_POWER_MW = 0.05
const RAY_EPSILON_MM = 0.01
const FS_PER_MM = 3335.6409519815

interface RayState {
  beamId: string
  beamDiameterMm: number
  bandwidthNm: number
  branchKind: BeamBranchKind
  depth: number
  directionMm: Vector2Mm
  divergenceMrad: number
  generation: number
  originMm: Vector2Mm
  pathId: string
  pathRole: 'fundamental' | 'shg'
  polarization: PolarizationSnapshot
  powerMw: number
  sourceComponentId: string
  sourceLabel: string
  sourcePowerMw: number
  wavelengthNm: number
  attenuationClass: BeamAttenuationClass
  opticalPathMm: number
  timeDelayFs: number
  parentInteractionId?: string
}

interface IntersectionCandidate {
  component: ComponentInstance
  hitPointMm: Vector2Mm
  incidenceAngleDeg: number
  rayDistanceMm: number
  spec: ResolvedComponentSpec
}

interface OutgoingRayTemplate {
  attenuationClass: BeamAttenuationClass
  branchKind: BeamBranchKind
  directionMm: Vector2Mm
  originMm: Vector2Mm
  pathMode: 'continue' | 'branch'
  pathRole: 'fundamental' | 'shg'
  polarization: PolarizationSnapshot
  powerMw: number
  wavelengthNm: number
  bandwidthNm: number
  beamDiameterMm: number
  generation: number
  outcomeClass: BeamOutcomeClass
  sourceComponentId?: string
  sourceLabel?: string
  sourcePowerMw?: number
  divergenceMrad?: number
  opticalPathMm?: number
  timeDelayFs?: number
}

interface TraceResolution {
  interactionKind: BeamInteractionEvent['interactionKind']
  outcomeClass: BeamOutcomeClass
  reflectedPowerMw?: number
  transmittedPowerMw?: number
  generatedPowerMw?: number
  capturedPowerMw?: number
  lostPowerMw?: number
  outputWavelengthNm?: number
  filterTransmissionClass?: FilterTransmissionClass
  acceptanceFraction: number
  wasClipped: boolean
  partialAcceptance: boolean
  internalOpticalPathMm: number
  outputPolarization?: PolarizationSnapshot
  note?: string
  outgoing: OutgoingRayTemplate[]
}

interface OpaInputSample {
  componentId: string
  componentLabel: string
  pathId: string
  polarization: PolarizationSnapshot
  powerMw: number
  wavelengthNm: number
  bandwidthNm: number
  beamDiameterMm: number
  divergenceMrad: number
}

interface OpaInputState {
  pump?: OpaInputSample
  seed?: OpaInputSample
  signal?: OpaInputSample
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function normalizeVector(vector: Vector2Mm): Vector2Mm {
  const magnitude = Math.hypot(vector.x, vector.y)

  if (magnitude === 0) {
    return { x: 1, y: 0 }
  }

  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
  }
}

function scaleVector(vector: Vector2Mm, scale: number): Vector2Mm {
  return {
    x: vector.x * scale,
    y: vector.y * scale,
  }
}

function addVectors(a: Vector2Mm, b: Vector2Mm): Vector2Mm {
  return {
    x: roundMm(a.x + b.x),
    y: roundMm(a.y + b.y),
  }
}

function subtractVectors(a: Vector2Mm, b: Vector2Mm): Vector2Mm {
  return {
    x: roundMm(a.x - b.x),
    y: roundMm(a.y - b.y),
  }
}

function dot(a: Vector2Mm, b: Vector2Mm) {
  return a.x * b.x + a.y * b.y
}

function cross(a: Vector2Mm, b: Vector2Mm) {
  return a.x * b.y - a.y * b.x
}

function reflectVector(vector: Vector2Mm, surfaceNormal: Vector2Mm) {
  const normal = normalizeVector(surfaceNormal)
  const scale = 2 * dot(vector, normal)

  return normalizeVector({
    x: vector.x - scale * normal.x,
    y: vector.y - scale * normal.y,
  })
}

function cardinalDirectionToVector(direction: CardinalDirection): Vector2Mm {
  switch (direction) {
    case 'north':
      return { x: 0, y: -1 }
    case 'east':
      return { x: 1, y: 0 }
    case 'south':
      return { x: 0, y: 1 }
    case 'west':
      return { x: -1, y: 0 }
  }
}

function wavelengthToRgb(wavelengthNm: number) {
  const clamped = Math.min(780, Math.max(380, wavelengthNm))
  let red = 0
  let green = 0
  let blue = 0

  if (clamped < 440) {
    red = -(clamped - 440) / (440 - 380)
    blue = 1
  } else if (clamped < 490) {
    green = (clamped - 440) / (490 - 440)
    blue = 1
  } else if (clamped < 510) {
    green = 1
    blue = -(clamped - 510) / (510 - 490)
  } else if (clamped < 580) {
    red = (clamped - 510) / (580 - 510)
    green = 1
  } else if (clamped < 645) {
    red = 1
    green = -(clamped - 645) / (645 - 580)
  } else {
    red = 1
  }

  const intensity =
    clamped > 700
      ? 0.3 + (0.7 * (780 - clamped)) / (780 - 700)
      : clamped < 420
        ? 0.3 + (0.7 * (clamped - 380)) / (420 - 380)
        : 1

  const toChannel = (value: number) =>
    Math.round(255 * Math.max(0, Math.min(1, value)) * intensity)

  return `rgb(${toChannel(red)}, ${toChannel(green)}, ${toChannel(blue)})`
}

export function getBeamColor(wavelengthNm: number, pathRole: 'fundamental' | 'shg') {
  if (pathRole === 'shg' && wavelengthNm < 380) {
    return 'rgb(160, 120, 255)'
  }

  return wavelengthToRgb(wavelengthNm)
}

export function classifyFilterTransmissionPercent(
  transmissionPercent: number,
): FilterTransmissionClass {
  if (transmissionPercent >= 70) {
    return 'passband'
  }

  if (transmissionPercent <= 20) {
    return 'stopband'
  }

  return 'partial'
}

export function getFilterTransmissionEstimate(
  spec: ResolvedComponentSpec,
  wavelengthNm: number,
) {
  if (spec.physics.kind !== 'filter') {
    return {
      transmissionPercent: 100,
      transmissionClass: 'passband' as const,
    }
  }

  let transmissionPercent = spec.physics.peakTransmissionPercent

  switch (spec.physics.filterMode) {
    case 'longpass': {
      const cutoffNm = spec.physics.cutoffNm ?? 400
      const deltaNm = wavelengthNm - cutoffNm

      if (deltaNm >= 25) {
        transmissionPercent = spec.physics.peakTransmissionPercent
      } else if (deltaNm <= -25) {
        transmissionPercent = spec.physics.stopbandTransmissionPercent
      } else {
        const normalized = (deltaNm + 25) / 50

        transmissionPercent = roundMm(
          spec.physics.stopbandTransmissionPercent +
            (spec.physics.peakTransmissionPercent -
              spec.physics.stopbandTransmissionPercent) *
              normalized,
        )
      }
      break
    }
    case 'shortpass': {
      const cutoffNm = spec.physics.cutoffNm ?? 600
      const deltaNm = cutoffNm - wavelengthNm

      if (deltaNm >= 25) {
        transmissionPercent = spec.physics.peakTransmissionPercent
      } else if (deltaNm <= -25) {
        transmissionPercent = spec.physics.stopbandTransmissionPercent
      } else {
        const normalized = (deltaNm + 25) / 50

        transmissionPercent = roundMm(
          spec.physics.stopbandTransmissionPercent +
            (spec.physics.peakTransmissionPercent -
              spec.physics.stopbandTransmissionPercent) *
              normalized,
        )
      }
      break
    }
    case 'bandpass': {
      const centerNm = spec.physics.centerNm ?? wavelengthNm
      const fwhmNm = spec.physics.fwhmNm ?? 10
      const sigmaNm = fwhmNm / 2.355
      const gaussian = Math.exp(-((((wavelengthNm - centerNm) / sigmaNm) ** 2) / 2))

      transmissionPercent = roundMm(
        spec.physics.stopbandTransmissionPercent +
          (spec.physics.peakTransmissionPercent -
            spec.physics.stopbandTransmissionPercent) *
            gaussian,
      )
      break
    }
  }

  return {
    transmissionPercent,
    transmissionClass: classifyFilterTransmissionPercent(transmissionPercent),
  }
}

function getOpticalCenterWorldMm(
  component: ComponentInstance,
  spec: ResolvedComponentSpec,
) {
  if (!spec.opticalCenterMm) {
    return component.anchorMm
  }

  const rotatedCenter = rotatePointQuarterTurns(
    spec.opticalCenterMm,
    component.rotationQuarterTurns,
  )

  return {
    x: roundMm(component.anchorMm.x + rotatedCenter.x),
    y: roundMm(component.anchorMm.y + rotatedCenter.y),
  }
}

function getActiveApertureMm(component: ComponentInstance, spec: ResolvedComponentSpec) {
  if (spec.physics.kind === 'iris') {
    return component.config.iris?.apertureMm ?? spec.physics.defaultApertureMm
  }

  if (spec.physics.kind === 'lens') {
    return (
      component.config.lens?.clearApertureMm ??
      spec.physics.defaultClearApertureMm ??
      spec.physics.opticalApertureMm ??
      spec.footprintBoundsMm.height
    )
  }

  return spec.physics.opticalApertureMm ?? spec.footprintBoundsMm.height
}

function getComponentSurfaceLocalMm(
  componentType: ComponentType,
  apertureMm: number,
) {
  const halfAperture = apertureMm / 2

  switch (componentType) {
    case 'mirror':
    case 'curved-mirror':
    case 'beamsplitter':
      return {
        startMm: { x: halfAperture, y: -halfAperture },
        endMm: { x: -halfAperture, y: halfAperture },
      }
    default:
      return {
        startMm: { x: 0, y: -halfAperture },
        endMm: { x: 0, y: halfAperture },
      }
  }
}

function getSurfaceWorldSegment(
  component: ComponentInstance,
  spec: ResolvedComponentSpec,
) {
  const apertureMm = getActiveApertureMm(component, spec)
  const surfaceLocalMm = getComponentSurfaceLocalMm(component.type, apertureMm)
  const opticalCenterMm = getOpticalCenterWorldMm(component, spec)
  const rotation = normalizeQuarterTurns(component.rotationQuarterTurns)
  const startOffsetMm = rotatePointQuarterTurns(surfaceLocalMm.startMm, rotation)
  const endOffsetMm = rotatePointQuarterTurns(surfaceLocalMm.endMm, rotation)

  return {
    startMm: addVectors(opticalCenterMm, startOffsetMm),
    endMm: addVectors(opticalCenterMm, endOffsetMm),
  }
}

function intersectRayWithSegment(
  originMm: Vector2Mm,
  directionMm: Vector2Mm,
  segmentStartMm: Vector2Mm,
  segmentEndMm: Vector2Mm,
) {
  const rayDirectionMm = normalizeVector(directionMm)
  const segmentDirectionMm = subtractVectors(segmentEndMm, segmentStartMm)
  const denominator = cross(rayDirectionMm, segmentDirectionMm)

  if (Math.abs(denominator) < 1e-9) {
    return undefined
  }

  const diffMm = subtractVectors(segmentStartMm, originMm)
  const t = cross(diffMm, segmentDirectionMm) / denominator
  const u = cross(diffMm, rayDirectionMm) / denominator

  if (t <= RAY_EPSILON_MM || u < 0 || u > 1) {
    return undefined
  }

  const hitPointMm = addVectors(originMm, scaleVector(rayDirectionMm, t))

  return {
    hitPointMm,
    rayDistanceMm: t,
  }
}

function getSurfaceNormalMm(startMm: Vector2Mm, endMm: Vector2Mm) {
  const tangent = subtractVectors(endMm, startMm)

  return normalizeVector({
    x: -tangent.y,
    y: tangent.x,
  })
}

function getIncidenceAngleDeg(directionMm: Vector2Mm, surfaceNormalMm: Vector2Mm) {
  const incoming = normalizeVector(scaleVector(directionMm, -1))
  const normal = normalizeVector(surfaceNormalMm)
  const cosine = Math.min(1, Math.max(-1, dot(incoming, normal)))
  const angleToNormalDeg = (Math.acos(Math.abs(cosine)) * 180) / Math.PI

  return roundMm(angleToNormalDeg)
}

function getRangeFactor(
  wavelengthNm: number,
  supportedRange: { minNm: number; maxNm: number },
) {
  if (wavelengthNm >= supportedRange.minNm && wavelengthNm <= supportedRange.maxNm) {
    return 1
  }

  const outsideDistance =
    wavelengthNm < supportedRange.minNm
      ? supportedRange.minNm - wavelengthNm
      : wavelengthNm - supportedRange.maxNm

  return Math.max(0.05, 1 - outsideDistance / 250)
}

function getAngleFactor(
  scene: SceneDocument,
  incidenceAngleDeg: number,
  designIncidenceDeg: number,
) {
  if (scene.beamSettings.beamFidelityMode === 'geometric') {
    return 1
  }

  const deltaDeg = Math.abs(incidenceAngleDeg - designIncidenceDeg)
  const deltaRad = (deltaDeg * Math.PI) / 180

  return Math.max(0.1, Math.cos(deltaRad) ** 2)
}

function getBeamDiameterAtDistanceMm(
  beamDiameterMm: number,
  divergenceMrad: number,
  distanceMm: number,
) {
  return roundMm(beamDiameterMm + distanceMm * (divergenceMrad / 1000))
}

function getEscapedSegmentEndMm(scene: SceneDocument, ray: RayState) {
  const bounds = getSceneWorldBoundsMm(scene)
  const candidates: number[] = []

  if (ray.directionMm.x > 0) {
    candidates.push((bounds.x + bounds.width - ray.originMm.x) / ray.directionMm.x)
  } else if (ray.directionMm.x < 0) {
    candidates.push((bounds.x - ray.originMm.x) / ray.directionMm.x)
  }

  if (ray.directionMm.y > 0) {
    candidates.push((bounds.y + bounds.height - ray.originMm.y) / ray.directionMm.y)
  } else if (ray.directionMm.y < 0) {
    candidates.push((bounds.y - ray.originMm.y) / ray.directionMm.y)
  }

  const distanceMm = Math.min(
    ...candidates.filter((value) => Number.isFinite(value) && value > 0),
  )

  return addVectors(ray.originMm, scaleVector(ray.directionMm, distanceMm))
}

function classifyAttenuationClass(args: {
  acceptanceFraction: number
  blocked?: boolean
  powerPercent: number
  wasClipped?: boolean
}): BeamAttenuationClass {
  if (args.blocked) {
    return 'blocked'
  }

  if (args.wasClipped) {
    return 'clipped'
  }

  if (args.powerPercent <= 8) {
    return 'low-power'
  }

  if (args.acceptanceFraction < 0.9 || args.powerPercent < 75) {
    return 'attenuated'
  }

  return 'normal'
}

function resolveSegmentOutcome(ray: RayState, status: BeamSegment['status']): BeamOutcomeClass {
  if (status === 'escaped') {
    return 'escaped'
  }

  if (status === 'blocked') {
    return 'blocked'
  }

  if (ray.attenuationClass === 'low-power') {
    return 'low-power'
  }

  if (ray.attenuationClass === 'attenuated' || ray.attenuationClass === 'clipped') {
    return ray.attenuationClass === 'clipped' ? 'clipped' : 'attenuated'
  }

  if (ray.branchKind === 'reflected') {
    return 'reflected'
  }

  if (ray.branchKind === 'generated-shg') {
    return 'generated-shg'
  }

  return 'transmitted'
}

function getTimeDelayFs(opticalPathMm: number) {
  return roundMm(opticalPathMm * FS_PER_MM)
}

function makeSegment(args: {
  endMm: Vector2Mm
  id: string
  internalOpticalPathMm?: number
  powerMw: number
  ray: RayState
  startMm: Vector2Mm
  status: BeamSegment['status']
}) {
  const geometricLengthMm = Math.hypot(
    args.endMm.x - args.startMm.x,
    args.endMm.y - args.startMm.y,
  )
  const internalOpticalPathMm = roundMm(args.internalOpticalPathMm ?? 0)
  const effectiveOpticalLengthMm = roundMm(geometricLengthMm + internalOpticalPathMm)
  const opticalPathMm = roundMm(args.ray.opticalPathMm + effectiveOpticalLengthMm)

  return {
    id: args.id,
    beamId: args.ray.beamId,
    pathId: args.ray.pathId,
    sourceComponentId: args.ray.sourceComponentId,
    startMm: args.startMm,
    endMm: args.endMm,
    directionMm: args.ray.directionMm,
    wavelengthNm: args.ray.wavelengthNm,
    bandwidthNm: args.ray.bandwidthNm,
    powerMw: roundMm(args.powerMw),
    powerPercent: roundMm((args.powerMw / args.ray.sourcePowerMw) * 100),
    beamDiameterMm: args.ray.beamDiameterMm,
    generation: args.ray.generation,
    status: args.status,
    pathRole: args.ray.pathRole,
    branchKind: args.ray.branchKind,
    attenuationClass:
      args.status === 'blocked' ? 'blocked' : args.ray.attenuationClass,
    outcomeClass: resolveSegmentOutcome(args.ray, args.status),
    polarization: args.ray.polarization,
    parentEventId: args.ray.parentInteractionId,
    parentInteractionId: args.ray.parentInteractionId,
    geometricLengthMm: roundMm(geometricLengthMm),
    internalOpticalPathMm,
    effectiveOpticalLengthMm,
    opticalPathMm,
    timeDelayFs: getTimeDelayFs(opticalPathMm),
  } satisfies BeamSegment
}

function createNote(spec: ResolvedComponentSpec) {
  if (spec.vendor && spec.sku) {
    return `${spec.variantLabel} (${spec.vendor} ${spec.sku})`
  }

  return spec.variantLabel
}

function findNearestIntersection(
  ray: RayState,
  components: ComponentInstance[],
) {
  let nearestCandidate: IntersectionCandidate | undefined

  for (const component of components) {
    if (component.id === ray.sourceComponentId && ray.depth === 0) {
      continue
    }

    const spec = getResolvedComponentSpec(component.type, component.variantId)

    if (spec.physics.kind === 'none' || spec.physics.kind === 'source') {
      continue
    }

    const surface = getSurfaceWorldSegment(component, spec)
    const intersection = intersectRayWithSegment(
      ray.originMm,
      ray.directionMm,
      surface.startMm,
      surface.endMm,
    )

    if (!intersection) {
      continue
    }

    const surfaceNormalMm = getSurfaceNormalMm(surface.startMm, surface.endMm)
    const incidenceAngleDeg = getIncidenceAngleDeg(ray.directionMm, surfaceNormalMm)

    if (
      !nearestCandidate ||
      intersection.rayDistanceMm < nearestCandidate.rayDistanceMm
    ) {
      nearestCandidate = {
        component,
        spec,
        hitPointMm: intersection.hitPointMm,
        incidenceAngleDeg,
        rayDistanceMm: intersection.rayDistanceMm,
      }
    }
  }

  return nearestCandidate
}

function createSourceRay(
  component: ComponentInstance,
  config: SourceConfig,
  ids: { beamId: string; pathId: string },
) {
  const outputPort = getWorldPortsForComponent(component).find(
    (port) => port.kind === 'beam-output',
  )

  if (!outputPort) {
    return undefined
  }

  const sourcePowerMw = roundMm(
    config.powerMw * (config.normalizedPowerPercent / 100),
  )

  return {
    beamId: ids.beamId,
    beamDiameterMm: config.beamDiameterMm,
    bandwidthNm: config.bandwidthNm,
    branchKind: 'root' as const,
    depth: 0,
    directionMm: cardinalDirectionToVector(outputPort.worldDirection),
    divergenceMrad: config.divergenceMrad,
    generation: 0,
    originMm: addVectors(
      outputPort.worldPositionMm,
      scaleVector(cardinalDirectionToVector(outputPort.worldDirection), RAY_EPSILON_MM),
    ),
    pathId: ids.pathId,
    pathRole: 'fundamental' as const,
    polarization: createPolarizationSnapshot(config.polarization),
    powerMw: sourcePowerMw,
    sourceComponentId: component.id,
    sourceLabel: component.label,
    sourcePowerMw,
    wavelengthNm: config.wavelengthNm,
    attenuationClass: 'normal' as const,
    opticalPathMm: 0,
    timeDelayFs: 0,
  } satisfies RayState
}

function traceMirror(
  scene: SceneDocument,
  candidate: IntersectionCandidate,
  ray: RayState,
): TraceResolution | undefined {
  if (
    candidate.spec.physics.kind !== 'mirror' &&
    candidate.spec.physics.kind !== 'curved-mirror'
  ) {
    return undefined
  }

  const isFlipMirror =
    candidate.component.type === 'mirror' &&
    candidate.component.variantId === 'flip-mirror'
  const isFlippedDown = candidate.component.config.flipMirror?.isFlippedDown ?? true

  if (isFlipMirror && !isFlippedDown) {
    const outgoingPowerMw = roundMm(ray.powerMw)
    const outgoingPowerPercent = roundMm((outgoingPowerMw / ray.sourcePowerMw) * 100)
    const attenuationClass = classifyAttenuationClass({
      acceptanceFraction: 1,
      powerPercent: outgoingPowerPercent,
      blocked: outgoingPowerMw <= MIN_POWER_MW,
    })

    return {
      interactionKind: outgoingPowerMw > MIN_POWER_MW ? 'transmission' : 'blocked',
      outcomeClass:
        attenuationClass === 'blocked'
          ? 'blocked'
          : attenuationClass === 'low-power'
            ? 'low-power'
            : 'transmitted',
      transmittedPowerMw: outgoingPowerMw,
      lostPowerMw: 0,
      acceptanceFraction: 1,
      wasClipped: false,
      partialAcceptance: false,
      internalOpticalPathMm: 0,
      outputPolarization: ray.polarization,
      note: `${createNote(candidate.spec)} • flipped up (pass-through) • ${ray.polarization.tag}`,
      outgoing:
        outgoingPowerMw > MIN_POWER_MW
          ? [
              {
                attenuationClass,
                branchKind: 'continued',
                directionMm: ray.directionMm,
                originMm: addVectors(
                  candidate.hitPointMm,
                  scaleVector(ray.directionMm, RAY_EPSILON_MM),
                ),
                pathMode: 'continue',
                pathRole: ray.pathRole,
                polarization: ray.polarization,
                powerMw: outgoingPowerMw,
                wavelengthNm: ray.wavelengthNm,
                bandwidthNm: ray.bandwidthNm,
                beamDiameterMm: getBeamDiameterAtDistanceMm(
                  ray.beamDiameterMm,
                  ray.divergenceMrad,
                  candidate.rayDistanceMm,
                ),
                generation: ray.generation,
                outcomeClass: attenuationClass === 'low-power' ? 'low-power' : 'transmitted',
              },
            ]
          : [],
    }
  }

  const surface = getSurfaceWorldSegment(candidate.component, candidate.spec)
  const surfaceNormalMm = getSurfaceNormalMm(surface.startMm, surface.endMm)
  const rangeFactor = getRangeFactor(
    ray.wavelengthNm,
    candidate.spec.physics.supportedWavelengthNm,
  )
  const angleFactor = getAngleFactor(
    scene,
    candidate.incidenceAngleDeg,
    candidate.spec.physics.designIncidenceDeg,
  )
  const reflectivityPercent =
    candidate.spec.physics.reflectivityPercent * rangeFactor * angleFactor
  const outgoingPowerMw = roundMm(ray.powerMw * (reflectivityPercent / 100))
  const outgoingPowerPercent = roundMm((outgoingPowerMw / ray.sourcePowerMw) * 100)
  const reflectedDirectionMm = reflectVector(ray.directionMm, surfaceNormalMm)
  const attenuationClass = classifyAttenuationClass({
    acceptanceFraction: reflectivityPercent / 100,
    powerPercent: outgoingPowerPercent,
  })

  return {
    interactionKind: 'reflection',
    outcomeClass: outgoingPowerMw > MIN_POWER_MW ? 'reflected' : 'blocked',
    reflectedPowerMw: outgoingPowerMw,
    lostPowerMw: roundMm(ray.powerMw - outgoingPowerMw),
    acceptanceFraction: reflectivityPercent / 100,
    wasClipped: false,
    partialAcceptance: reflectivityPercent < 99.5,
    internalOpticalPathMm: 0,
    outputPolarization: ray.polarization,
    note: `${createNote(candidate.spec)} • ${ray.polarization.tag}`,
    outgoing:
      outgoingPowerMw > MIN_POWER_MW
        ? [
            {
              attenuationClass,
              branchKind: 'reflected',
              directionMm: reflectedDirectionMm,
              originMm: addVectors(
                candidate.hitPointMm,
                scaleVector(reflectedDirectionMm, RAY_EPSILON_MM),
              ),
              pathMode: 'continue',
              pathRole: ray.pathRole,
              polarization: ray.polarization,
              powerMw: outgoingPowerMw,
              wavelengthNm: ray.wavelengthNm,
              bandwidthNm: ray.bandwidthNm,
              beamDiameterMm: getBeamDiameterAtDistanceMm(
                ray.beamDiameterMm,
                ray.divergenceMrad,
                candidate.rayDistanceMm,
              ),
              generation: ray.generation,
              outcomeClass: attenuationClass === 'low-power' ? 'low-power' : 'reflected',
            },
          ]
        : [],
  }
}

function traceBeamsplitter(
  scene: SceneDocument,
  candidate: IntersectionCandidate,
  ray: RayState,
): TraceResolution | undefined {
  if (candidate.spec.physics.kind !== 'beamsplitter') {
    return undefined
  }

  const surface = getSurfaceWorldSegment(candidate.component, candidate.spec)
  const surfaceNormalMm = getSurfaceNormalMm(surface.startMm, surface.endMm)
  const rangeFactor = getRangeFactor(
    ray.wavelengthNm,
    candidate.spec.physics.supportedWavelengthNm,
  )
  const angleFactor = getAngleFactor(
    scene,
    candidate.incidenceAngleDeg,
    candidate.spec.physics.designIncidenceDeg,
  )
  const polarizedReflectPercent = getPolarizationReflectivityPercent({
    baseReflectPercent:
      candidate.component.config.beamSplitter?.reflectPercent ??
      candidate.spec.physics.defaultReflectPercent,
    polarization: ray.polarization,
    sReflectBiasPercent: candidate.spec.physics.sReflectBiasPercent,
    pReflectBiasPercent: candidate.spec.physics.pReflectBiasPercent,
  })
  const reflectPercent = clamp(polarizedReflectPercent * rangeFactor, 0, 95)
  const configuredLossPercent = Math.max(
    0,
    candidate.component.config.beamSplitter?.lossPercent ??
      candidate.spec.physics.defaultLossPercent,
  )
  const effectiveLossPercent = Math.min(
    40,
    configuredLossPercent + (1 - angleFactor) * 12 + (1 - rangeFactor) * 18,
  )
  const transmitPercent = Math.max(0, 100 - reflectPercent - effectiveLossPercent)
  const reflectedPowerMw = roundMm(ray.powerMw * (reflectPercent / 100))
  const transmittedPowerMw = roundMm(ray.powerMw * (transmitPercent / 100))
  const reflectedDirectionMm = reflectVector(ray.directionMm, surfaceNormalMm)
  const propagatedBeamDiameterMm = getBeamDiameterAtDistanceMm(
    ray.beamDiameterMm,
    ray.divergenceMrad,
    candidate.rayDistanceMm,
  )
  const outgoing: OutgoingRayTemplate[] = []

  if (transmittedPowerMw > MIN_POWER_MW) {
    outgoing.push({
      attenuationClass: classifyAttenuationClass({
        acceptanceFraction: transmitPercent / 100,
        powerPercent: roundMm((transmittedPowerMw / ray.sourcePowerMw) * 100),
      }),
      branchKind: 'transmitted',
      directionMm: ray.directionMm,
      originMm: addVectors(
        candidate.hitPointMm,
        scaleVector(ray.directionMm, RAY_EPSILON_MM),
      ),
      pathMode: 'continue',
      pathRole: ray.pathRole,
      polarization: ray.polarization,
      powerMw: transmittedPowerMw,
      wavelengthNm: ray.wavelengthNm,
      bandwidthNm: ray.bandwidthNm,
      beamDiameterMm: propagatedBeamDiameterMm,
      generation: ray.generation,
      outcomeClass:
        transmittedPowerMw / ray.sourcePowerMw <= 0.08
          ? 'low-power'
          : transmitPercent < 90
            ? 'attenuated'
            : 'transmitted',
    })
  }

  if (reflectedPowerMw > MIN_POWER_MW) {
    outgoing.push({
      attenuationClass: classifyAttenuationClass({
        acceptanceFraction: reflectPercent / 100,
        powerPercent: roundMm((reflectedPowerMw / ray.sourcePowerMw) * 100),
      }),
      branchKind: 'reflected',
      directionMm: reflectedDirectionMm,
      originMm: addVectors(
        candidate.hitPointMm,
        scaleVector(reflectedDirectionMm, RAY_EPSILON_MM),
      ),
      pathMode: 'branch',
      pathRole: ray.pathRole,
      polarization: ray.polarization,
      powerMw: reflectedPowerMw,
      wavelengthNm: ray.wavelengthNm,
      bandwidthNm: ray.bandwidthNm,
      beamDiameterMm: propagatedBeamDiameterMm,
      generation: ray.generation,
      outcomeClass:
        reflectedPowerMw / ray.sourcePowerMw <= 0.08
          ? 'low-power'
          : reflectPercent < 90
            ? 'attenuated'
            : 'reflected',
    })
  }

  return {
    interactionKind: 'split',
    outcomeClass: 'transmitted',
    reflectedPowerMw,
    transmittedPowerMw,
    lostPowerMw: roundMm(ray.powerMw - reflectedPowerMw - transmittedPowerMw),
    acceptanceFraction: (reflectPercent + transmitPercent) / 100,
    wasClipped: false,
    partialAcceptance: effectiveLossPercent > 0,
    internalOpticalPathMm: 0,
    outputPolarization: ray.polarization,
    note: `${createNote(candidate.spec)} • ${ray.polarization.tag}`,
    outgoing,
  }
}

function getDelayLineInternalPathMm(component: ComponentInstance) {
  const config = component.config.delayLine

  if (!config) {
    return 0
  }

  const multiplier = config.topology === 'single-pass' ? 1 : 2
  return roundMm(Math.max(0, config.positionMm) * multiplier)
}

function getNearestPortId(
  component: ComponentInstance,
  hitPointMm: Vector2Mm,
) {
  const ports = getWorldPortsForComponent(component)
  let nearestPortId: string | undefined
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const port of ports) {
    const distance = Math.hypot(
      port.worldPositionMm.x - hitPointMm.x,
      port.worldPositionMm.y - hitPointMm.y,
    )

    if (distance < nearestDistance) {
      nearestPortId = port.id
      nearestDistance = distance
    }
  }

  return nearestPortId
}

function createOpaInputSampleFromRay(
  component: ComponentInstance,
  ray: RayState,
  beamDiameterMm: number,
): OpaInputSample {
  return {
    componentId: component.id,
    componentLabel: component.label,
    pathId: ray.pathId,
    polarization: ray.polarization,
    powerMw: ray.powerMw,
    wavelengthNm: ray.wavelengthNm,
    bandwidthNm: ray.bandwidthNm,
    beamDiameterMm,
    divergenceMrad: ray.divergenceMrad,
  }
}

function resolveLinkedOpaInput(
  scene: SceneDocument,
  link?: { sourceComponentId?: string; pathId?: string },
): OpaInputSample | undefined {
  if (!link?.sourceComponentId && !link?.pathId) {
    return undefined
  }

  const component = link.sourceComponentId
    ? scene.components.find((item) => item.id === link.sourceComponentId)
    : undefined
  const source = component?.config.source

  if (!source?.isEnabled) {
    return undefined
  }

  return {
    componentId: component!.id,
    componentLabel: component!.label,
    pathId: link.pathId ?? `linked:${component!.id}`,
    polarization: createPolarizationSnapshot(source.polarization),
    powerMw: roundMm(source.powerMw * (source.normalizedPowerPercent / 100)),
    wavelengthNm: source.wavelengthNm,
    bandwidthNm: source.bandwidthNm,
    beamDiameterMm: source.beamDiameterMm,
    divergenceMrad: source.divergenceMrad,
  }
}

function getOpaPortRole(
  component: ComponentInstance,
  hitPointMm: Vector2Mm,
): keyof OpaInputState | undefined {
  const nearestPortId = getNearestPortId(component, hitPointMm)

  switch (nearestPortId) {
    case 'north':
      return 'pump'
    case 'south':
      return 'seed'
    case 'west':
      return 'signal'
    default:
      return undefined
  }
}

function combineOpaPolarizations(samples: OpaInputSample[]) {
  const totalPower = samples.reduce((sum, sample) => sum + sample.powerMw, 0) || 1

  return createPolarizationSnapshot({
    basis: 'ray-local',
    presetId: 'elliptical',
    inPlaneAmplitude: roundMm(
      Math.sqrt(
        samples.reduce(
          (sum, sample) =>
            sum + sample.powerMw * sample.polarization.inPlaneFraction,
          0,
        ) / totalPower,
      ),
    ),
    outOfPlaneAmplitude: roundMm(
      Math.sqrt(
        samples.reduce(
          (sum, sample) =>
            sum + sample.powerMw * sample.polarization.outOfPlaneFraction,
          0,
        ) / totalPower,
      ),
    ),
    relativePhaseDeg: roundMm(
      samples.reduce((sum, sample) => sum + sample.polarization.relativePhaseDeg, 0) /
        samples.length,
    ),
  })
}

function tracePassThrough(
  scene: SceneDocument,
  candidate: IntersectionCandidate,
  ray: RayState,
): TraceResolution | undefined {
  const propagatedBeamDiameterMm = getBeamDiameterAtDistanceMm(
    ray.beamDiameterMm,
    ray.divergenceMrad,
    candidate.rayDistanceMm,
  )

  switch (candidate.spec.physics.kind) {
    case 'filter': {
      const estimate = getFilterTransmissionEstimate(candidate.spec, ray.wavelengthNm)
      const transmissionPercent =
        estimate.transmissionPercent * getAngleFactor(scene, candidate.incidenceAngleDeg, 0)
      const outgoingPowerMw = roundMm(ray.powerMw * (transmissionPercent / 100))
      const powerPercent = roundMm((outgoingPowerMw / ray.sourcePowerMw) * 100)
      const attenuationClass = classifyAttenuationClass({
        acceptanceFraction: transmissionPercent / 100,
        powerPercent,
        blocked: outgoingPowerMw <= MIN_POWER_MW,
      })

      return {
        interactionKind: outgoingPowerMw > MIN_POWER_MW ? 'transmission' : 'blocked',
        outcomeClass:
          attenuationClass === 'blocked'
            ? 'blocked'
            : attenuationClass === 'low-power'
              ? 'low-power'
              : attenuationClass === 'attenuated'
                ? 'attenuated'
                : 'transmitted',
        transmittedPowerMw: outgoingPowerMw,
        lostPowerMw: roundMm(ray.powerMw - outgoingPowerMw),
        acceptanceFraction: transmissionPercent / 100,
        wasClipped: false,
        partialAcceptance: transmissionPercent < 99,
        internalOpticalPathMm: 0,
        outputPolarization: ray.polarization,
        filterTransmissionClass: estimate.transmissionClass,
        note: `${createNote(candidate.spec)} • ${estimate.transmissionClass} ${estimate.transmissionPercent.toFixed(1)}%`,
        outgoing:
          outgoingPowerMw > MIN_POWER_MW
            ? [
                {
                  attenuationClass,
                  branchKind: 'continued',
                  directionMm: ray.directionMm,
                  originMm: addVectors(
                    candidate.hitPointMm,
                    scaleVector(ray.directionMm, RAY_EPSILON_MM),
                  ),
                  pathMode: 'continue',
                  pathRole: ray.pathRole,
                  polarization: ray.polarization,
                  powerMw: outgoingPowerMw,
                  wavelengthNm: ray.wavelengthNm,
                  bandwidthNm: ray.bandwidthNm,
                  beamDiameterMm: propagatedBeamDiameterMm,
                  generation: ray.generation,
                  outcomeClass:
                    attenuationClass === 'low-power'
                      ? 'low-power'
                      : attenuationClass === 'attenuated'
                        ? 'attenuated'
                        : 'transmitted',
                },
              ]
            : [],
      }
    }
    case 'iris': {
      const apertureMm =
        candidate.component.config.iris?.apertureMm ??
        candidate.spec.physics.defaultApertureMm
      const passFraction = Math.min(
        1,
        Math.max(0, (apertureMm / Math.max(propagatedBeamDiameterMm, 0.1)) ** 2),
      )
      const outgoingPowerMw = roundMm(ray.powerMw * passFraction)
      const powerPercent = roundMm((outgoingPowerMw / ray.sourcePowerMw) * 100)
      const attenuationClass = classifyAttenuationClass({
        acceptanceFraction: passFraction,
        powerPercent,
        blocked: outgoingPowerMw <= MIN_POWER_MW,
        wasClipped: passFraction < 0.999,
      })

      return {
        interactionKind: outgoingPowerMw > MIN_POWER_MW ? 'transmission' : 'blocked',
        outcomeClass:
          outgoingPowerMw <= MIN_POWER_MW
            ? 'blocked'
            : passFraction < 0.999
              ? 'clipped'
              : 'transmitted',
        transmittedPowerMw: outgoingPowerMw,
        lostPowerMw: roundMm(ray.powerMw - outgoingPowerMw),
        acceptanceFraction: passFraction,
        wasClipped: passFraction < 0.999,
        partialAcceptance: passFraction > 0 && passFraction < 0.999,
        internalOpticalPathMm: 0,
        outputPolarization: ray.polarization,
        note: `${createNote(candidate.spec)} • aperture ${apertureMm.toFixed(1)} mm`,
        outgoing:
          outgoingPowerMw > MIN_POWER_MW
            ? [
                {
                  attenuationClass,
                  branchKind: 'continued',
                  directionMm: ray.directionMm,
                  originMm: addVectors(
                    candidate.hitPointMm,
                    scaleVector(ray.directionMm, RAY_EPSILON_MM),
                  ),
                  pathMode: 'continue',
                  pathRole: ray.pathRole,
                  polarization: ray.polarization,
                  powerMw: outgoingPowerMw,
                  wavelengthNm: ray.wavelengthNm,
                  bandwidthNm: ray.bandwidthNm,
                  beamDiameterMm: propagatedBeamDiameterMm,
                  generation: ray.generation,
                  outcomeClass:
                    attenuationClass === 'low-power'
                      ? 'low-power'
                      : passFraction < 0.999
                        ? 'clipped'
                        : 'transmitted',
                },
              ]
            : [],
      }
    }
    case 'bbo': {
      const bboConfig = candidate.component.config.bboCrystal
      const metrics = deriveBboMetrics({
        beamDiameterMm: propagatedBeamDiameterMm,
        bandwidthNm: ray.bandwidthNm,
        interactionMode: bboConfig?.interactionMode ?? 'estimated',
        phaseMatchingAngleDeg:
          bboConfig?.phaseMatchingAngleDeg ??
          candidate.spec.physics.defaultPhaseMatchingAngleDeg,
        thicknessUm:
          bboConfig?.thicknessUm ?? candidate.spec.physics.defaultThicknessUm,
        wavelengthNm: ray.wavelengthNm,
      })
      const polarizationSummary = deriveBboPolarizationSummary({
        axisLocalDeg: bboConfig?.polarizationAxisLocalDeg ?? 0,
        polarization: ray.polarization,
      })
      const compatibilityFactor = polarizationSummary.compatibilityPercent / 100
      const effectiveShgPercent = roundMm(
        metrics.estimatedEfficiencyPercent * compatibilityFactor,
      )
      const effectiveFundamentalPercent = roundMm(
        clamp(
          metrics.fundamentalTransmissionPercent +
            (metrics.estimatedEfficiencyPercent - effectiveShgPercent),
          0,
          99,
        ),
      )
      const shgPowerMw = roundMm(ray.powerMw * (effectiveShgPercent / 100))
      const fundamentalPowerMw = roundMm(
        ray.powerMw * (effectiveFundamentalPercent / 100),
      )
      const lostPowerMw = roundMm(
        ray.powerMw - fundamentalPowerMw - shgPowerMw,
      )
      const outgoing: OutgoingRayTemplate[] = []

      if (fundamentalPowerMw > MIN_POWER_MW) {
        outgoing.push({
          attenuationClass: classifyAttenuationClass({
            acceptanceFraction: effectiveFundamentalPercent / 100,
            powerPercent: roundMm((fundamentalPowerMw / ray.sourcePowerMw) * 100),
          }),
          branchKind: 'continued',
          directionMm: ray.directionMm,
          originMm: addVectors(
            candidate.hitPointMm,
            scaleVector(ray.directionMm, RAY_EPSILON_MM),
          ),
          pathMode: 'continue',
          pathRole: ray.pathRole,
          polarization: ray.polarization,
          powerMw: fundamentalPowerMw,
          wavelengthNm: ray.wavelengthNm,
          bandwidthNm: ray.bandwidthNm,
          beamDiameterMm: propagatedBeamDiameterMm,
          generation: ray.generation,
          outcomeClass: effectiveFundamentalPercent < 95 ? 'attenuated' : 'transmitted',
        })
      }

      if (shgPowerMw > MIN_POWER_MW) {
        outgoing.push({
          attenuationClass: classifyAttenuationClass({
            acceptanceFraction: effectiveShgPercent / 100,
            powerPercent: roundMm((shgPowerMw / ray.sourcePowerMw) * 100),
          }),
          branchKind: 'generated-shg',
          directionMm: ray.directionMm,
          originMm: addVectors(
            candidate.hitPointMm,
            scaleVector(ray.directionMm, RAY_EPSILON_MM),
          ),
          pathMode: 'branch',
          pathRole: 'shg',
          polarization: ray.polarization,
          powerMw: shgPowerMw,
          wavelengthNm: metrics.shgWavelengthNm,
          bandwidthNm: Math.max(0.5, roundMm(ray.bandwidthNm / 2)),
          beamDiameterMm: Math.max(0.2, roundMm(propagatedBeamDiameterMm * 0.92)),
          generation: ray.generation + 1,
          outcomeClass: 'generated-shg',
        })
      }

      return {
        interactionKind: 'shg',
        outcomeClass: shgPowerMw > MIN_POWER_MW ? 'generated-shg' : 'attenuated',
        transmittedPowerMw: fundamentalPowerMw,
        generatedPowerMw: shgPowerMw,
        lostPowerMw,
        outputWavelengthNm: metrics.shgWavelengthNm,
        acceptanceFraction: compatibilityFactor,
        wasClipped: false,
        partialAcceptance: compatibilityFactor < 0.999,
        internalOpticalPathMm: 0,
        outputPolarization: ray.polarization,
        note: `${createNote(candidate.spec)} • ${polarizationSummary.compatibilityPercent.toFixed(1)}% polarization compatibility`,
        outgoing,
      }
    }
    case 'attenuator': {
      const transmissionPercent =
        (candidate.component.config.attenuator?.transmissionPercent ??
          candidate.spec.physics.transmissionPercent) *
        (candidate.spec.physics.supportedWavelengthNm
          ? getRangeFactor(ray.wavelengthNm, candidate.spec.physics.supportedWavelengthNm)
          : 1)
      const outgoingPowerMw = roundMm(ray.powerMw * (transmissionPercent / 100))
      const powerPercent = roundMm((outgoingPowerMw / ray.sourcePowerMw) * 100)
      const attenuationClass = classifyAttenuationClass({
        acceptanceFraction: transmissionPercent / 100,
        powerPercent,
        blocked: outgoingPowerMw <= MIN_POWER_MW,
      })

      return {
        interactionKind: outgoingPowerMw > MIN_POWER_MW ? 'transmission' : 'blocked',
        outcomeClass:
          outgoingPowerMw <= MIN_POWER_MW
            ? 'blocked'
            : attenuationClass === 'low-power'
              ? 'low-power'
              : 'attenuated',
        transmittedPowerMw: outgoingPowerMw,
        lostPowerMw: roundMm(ray.powerMw - outgoingPowerMw),
        acceptanceFraction: transmissionPercent / 100,
        wasClipped: false,
        partialAcceptance: transmissionPercent < 99,
        internalOpticalPathMm: 0,
        outputPolarization: ray.polarization,
        note: `${createNote(candidate.spec)} • ND ${transmissionPercent.toFixed(1)}%`,
        outgoing:
          outgoingPowerMw > MIN_POWER_MW
            ? [
                {
                  attenuationClass,
                  branchKind: 'continued',
                  directionMm: ray.directionMm,
                  originMm: addVectors(
                    candidate.hitPointMm,
                    scaleVector(ray.directionMm, RAY_EPSILON_MM),
                  ),
                  pathMode: 'continue',
                  pathRole: ray.pathRole,
                  polarization: ray.polarization,
                  powerMw: outgoingPowerMw,
                  wavelengthNm: ray.wavelengthNm,
                  bandwidthNm: ray.bandwidthNm,
                  beamDiameterMm: propagatedBeamDiameterMm,
                  generation: ray.generation,
                  outcomeClass:
                    attenuationClass === 'low-power' ? 'low-power' : 'attenuated',
                },
              ]
            : [],
      }
    }
    case 'polarizer': {
      const transformed = applyPolarizerToSnapshot({
        polarization: ray.polarization,
        axisLocalDeg: candidate.component.config.polarizer?.axisLocalDeg ?? 0,
        extinctionRatio: candidate.component.config.polarizer?.extinctionRatio ?? candidate.spec.physics.extinctionRatio,
      })
      const insertionLossScale = 1 - ((candidate.component.config.polarizer?.insertionLossPercent ?? 0) / 100)
      const transmissionPercent = roundMm(
        100 *
          transformed.transmissionFraction *
          Math.max(0, insertionLossScale) *
          (candidate.spec.physics.supportedWavelengthNm
            ? getRangeFactor(ray.wavelengthNm, candidate.spec.physics.supportedWavelengthNm)
            : 1),
      )
      const outgoingPowerMw = roundMm(ray.powerMw * (transmissionPercent / 100))
      const powerPercent = roundMm((outgoingPowerMw / ray.sourcePowerMw) * 100)
      const attenuationClass = classifyAttenuationClass({
        acceptanceFraction: transmissionPercent / 100,
        powerPercent,
        blocked: outgoingPowerMw <= MIN_POWER_MW,
      })

      return {
        interactionKind: outgoingPowerMw > MIN_POWER_MW ? 'transmission' : 'blocked',
        outcomeClass:
          outgoingPowerMw <= MIN_POWER_MW
            ? 'blocked'
            : attenuationClass === 'low-power'
              ? 'low-power'
              : 'attenuated',
        transmittedPowerMw: outgoingPowerMw,
        lostPowerMw: roundMm(ray.powerMw - outgoingPowerMw),
        acceptanceFraction: transmissionPercent / 100,
        wasClipped: false,
        partialAcceptance: transmissionPercent < 99,
        internalOpticalPathMm: 0,
        outputPolarization: transformed.polarization,
        note: `${createNote(candidate.spec)} • axis ${(candidate.component.config.polarizer?.axisLocalDeg ?? 0).toFixed(1)}°`,
        outgoing:
          outgoingPowerMw > MIN_POWER_MW
            ? [
                {
                  attenuationClass,
                  branchKind: 'continued',
                  directionMm: ray.directionMm,
                  originMm: addVectors(candidate.hitPointMm, scaleVector(ray.directionMm, RAY_EPSILON_MM)),
                  pathMode: 'continue',
                  pathRole: ray.pathRole,
                  polarization: transformed.polarization,
                  powerMw: outgoingPowerMw,
                  wavelengthNm: ray.wavelengthNm,
                  bandwidthNm: ray.bandwidthNm,
                  beamDiameterMm: propagatedBeamDiameterMm,
                  generation: ray.generation,
                  outcomeClass:
                    attenuationClass === 'low-power' ? 'low-power' : 'attenuated',
                },
              ]
            : [],
      }
    }
    case 'waveplate': {
      const transformed = applyWaveplateToSnapshot({
        polarization: ray.polarization,
        axisLocalDeg: candidate.component.config.waveplate?.axisLocalDeg ?? 0,
        retardanceDeg:
          candidate.component.config.waveplate?.retardanceDeg ??
          candidate.spec.physics.defaultRetardanceDeg,
      })
      const transmissionPercent =
        Math.max(
          0,
          candidate.spec.physics.transmissionPercent -
            (candidate.component.config.waveplate?.insertionLossPercent ?? 0),
        ) *
        (candidate.spec.physics.supportedWavelengthNm
          ? getRangeFactor(ray.wavelengthNm, candidate.spec.physics.supportedWavelengthNm)
          : 1)
      const outgoingPowerMw = roundMm(ray.powerMw * (transmissionPercent / 100))
      const powerPercent = roundMm((outgoingPowerMw / ray.sourcePowerMw) * 100)
      const attenuationClass = classifyAttenuationClass({
        acceptanceFraction: transmissionPercent / 100,
        powerPercent,
        blocked: outgoingPowerMw <= MIN_POWER_MW,
      })

      return {
        interactionKind: outgoingPowerMw > MIN_POWER_MW ? 'transmission' : 'blocked',
        outcomeClass:
          outgoingPowerMw <= MIN_POWER_MW
            ? 'blocked'
            : attenuationClass === 'low-power'
              ? 'low-power'
              : 'attenuated',
        transmittedPowerMw: outgoingPowerMw,
        lostPowerMw: roundMm(ray.powerMw - outgoingPowerMw),
        acceptanceFraction: transmissionPercent / 100,
        wasClipped: false,
        partialAcceptance: transmissionPercent < 99,
        internalOpticalPathMm: 0,
        outputPolarization: transformed,
        note: `${createNote(candidate.spec)} • axis ${(candidate.component.config.waveplate?.axisLocalDeg ?? 0).toFixed(1)}° • retardance ${(candidate.component.config.waveplate?.retardanceDeg ?? candidate.spec.physics.defaultRetardanceDeg).toFixed(1)}°`,
        outgoing:
          outgoingPowerMw > MIN_POWER_MW
            ? [
                {
                  attenuationClass,
                  branchKind: 'continued',
                  directionMm: ray.directionMm,
                  originMm: addVectors(candidate.hitPointMm, scaleVector(ray.directionMm, RAY_EPSILON_MM)),
                  pathMode: 'continue',
                  pathRole: ray.pathRole,
                  polarization: transformed,
                  powerMw: outgoingPowerMw,
                  wavelengthNm: ray.wavelengthNm,
                  bandwidthNm: ray.bandwidthNm,
                  beamDiameterMm: propagatedBeamDiameterMm,
                  generation: ray.generation,
                  outcomeClass:
                    attenuationClass === 'low-power'
                      ? 'low-power'
                      : attenuationClass === 'attenuated'
                        ? 'attenuated'
                        : 'transmitted',
                },
              ]
            : [],
      }
    }
    case 'pass-through': {
      const transmissionPercent =
        candidate.spec.physics.transmissionPercent *
        (candidate.spec.physics.supportedWavelengthNm
          ? getRangeFactor(
              ray.wavelengthNm,
              candidate.spec.physics.supportedWavelengthNm,
            )
          : 1)
      const outgoingPowerMw = roundMm(ray.powerMw * (transmissionPercent / 100))
      const powerPercent = roundMm((outgoingPowerMw / ray.sourcePowerMw) * 100)
      const attenuationClass = classifyAttenuationClass({
        acceptanceFraction: transmissionPercent / 100,
        powerPercent,
      })

      return {
        interactionKind: outgoingPowerMw > MIN_POWER_MW ? 'transmission' : 'blocked',
        outcomeClass:
          outgoingPowerMw <= MIN_POWER_MW
            ? 'blocked'
            : attenuationClass === 'low-power'
              ? 'low-power'
              : attenuationClass === 'attenuated'
                ? 'attenuated'
                : 'transmitted',
        transmittedPowerMw: outgoingPowerMw,
        lostPowerMw: roundMm(ray.powerMw - outgoingPowerMw),
        acceptanceFraction: transmissionPercent / 100,
        wasClipped: false,
        partialAcceptance: transmissionPercent < 99,
        internalOpticalPathMm: 0,
        outputPolarization: ray.polarization,
        note: createNote(candidate.spec),
        outgoing:
          outgoingPowerMw > MIN_POWER_MW
            ? [
                {
                  attenuationClass,
                  branchKind: 'continued',
                  directionMm: ray.directionMm,
                  originMm: addVectors(
                    candidate.hitPointMm,
                    scaleVector(ray.directionMm, RAY_EPSILON_MM),
                  ),
                  pathMode: 'continue',
                  pathRole: ray.pathRole,
                  polarization: ray.polarization,
                  powerMw: outgoingPowerMw,
                  wavelengthNm: ray.wavelengthNm,
                  bandwidthNm: ray.bandwidthNm,
                  beamDiameterMm: propagatedBeamDiameterMm,
                  generation: ray.generation,
                  outcomeClass:
                    attenuationClass === 'low-power'
                      ? 'low-power'
                      : attenuationClass === 'attenuated'
                        ? 'attenuated'
                        : 'transmitted',
                },
              ]
            : [],
      }
    }
    case 'lens': {
      const transmissionPercent =
        candidate.spec.physics.transmissionPercent *
        getRangeFactor(
          ray.wavelengthNm,
          candidate.spec.physics.supportedWavelengthNm,
        )
      const outgoingPowerMw = roundMm(ray.powerMw * (transmissionPercent / 100))
      const powerPercent = roundMm((outgoingPowerMw / ray.sourcePowerMw) * 100)
      const attenuationClass = classifyAttenuationClass({
        acceptanceFraction: transmissionPercent / 100,
        powerPercent,
      })
      const focalLengthMm =
        candidate.component.config.lens?.focalLengthMm ??
        candidate.spec.physics.defaultFocalLengthMm
      const clearApertureMm =
        candidate.component.config.lens?.clearApertureMm ??
        candidate.spec.physics.defaultClearApertureMm

      return {
        interactionKind: outgoingPowerMw > MIN_POWER_MW ? 'transmission' : 'blocked',
        outcomeClass:
          outgoingPowerMw <= MIN_POWER_MW
            ? 'blocked'
            : attenuationClass === 'low-power'
              ? 'low-power'
              : attenuationClass === 'attenuated'
                ? 'attenuated'
                : 'transmitted',
        transmittedPowerMw: outgoingPowerMw,
        lostPowerMw: roundMm(ray.powerMw - outgoingPowerMw),
        acceptanceFraction: transmissionPercent / 100,
        wasClipped: false,
        partialAcceptance: transmissionPercent < 99,
        internalOpticalPathMm: 0,
        outputPolarization: ray.polarization,
        note: `${createNote(candidate.spec)} • f ${focalLengthMm.toFixed(1)} mm • CA ${clearApertureMm.toFixed(1)} mm`,
        outgoing:
          outgoingPowerMw > MIN_POWER_MW
            ? [
                {
                  attenuationClass,
                  branchKind: 'continued',
                  directionMm: ray.directionMm,
                  originMm: addVectors(
                    candidate.hitPointMm,
                    scaleVector(ray.directionMm, RAY_EPSILON_MM),
                  ),
                  pathMode: 'continue',
                  pathRole: ray.pathRole,
                  polarization: ray.polarization,
                  powerMw: outgoingPowerMw,
                  wavelengthNm: ray.wavelengthNm,
                  bandwidthNm: ray.bandwidthNm,
                  beamDiameterMm: propagatedBeamDiameterMm,
                  generation: ray.generation,
                  outcomeClass:
                    attenuationClass === 'low-power'
                      ? 'low-power'
                      : attenuationClass === 'attenuated'
                        ? 'attenuated'
                        : 'transmitted',
                },
              ]
            : [],
      }
    }
    case 'terminal': {
      const capturedPowerMw = roundMm(
        ray.powerMw * ((100 - candidate.spec.physics.transmissionPercent) / 100),
      )

      return {
        interactionKind: 'terminal',
        outcomeClass:
          candidate.spec.physics.role === 'beam-dump' ? 'blocked' : 'attenuated',
        transmittedPowerMw: roundMm(ray.powerMw - capturedPowerMw),
        capturedPowerMw,
        lostPowerMw: capturedPowerMw,
        acceptanceFraction: 1,
        wasClipped: false,
        partialAcceptance: false,
        internalOpticalPathMm: 0,
        outputPolarization: ray.polarization,
        note: createNote(candidate.spec),
        outgoing: [],
      }
    }
    case 'delay-line': {
      const transmissionPercent =
        candidate.spec.physics.transmissionPercent *
        (candidate.spec.physics.supportedWavelengthNm
          ? getRangeFactor(ray.wavelengthNm, candidate.spec.physics.supportedWavelengthNm)
          : 1)
      const outgoingPowerMw = roundMm(ray.powerMw * (transmissionPercent / 100))
      const internalOpticalPathMm = getDelayLineInternalPathMm(candidate.component)
      const attenuationClass = classifyAttenuationClass({
        acceptanceFraction: transmissionPercent / 100,
        powerPercent: roundMm((outgoingPowerMw / ray.sourcePowerMw) * 100),
        blocked: outgoingPowerMw <= MIN_POWER_MW,
      })

      return {
        interactionKind: outgoingPowerMw > MIN_POWER_MW ? 'transmission' : 'blocked',
        outcomeClass:
          outgoingPowerMw <= MIN_POWER_MW
            ? 'blocked'
            : attenuationClass === 'low-power'
              ? 'low-power'
              : attenuationClass === 'attenuated'
                ? 'attenuated'
                : 'transmitted',
        transmittedPowerMw: outgoingPowerMw,
        lostPowerMw: roundMm(ray.powerMw - outgoingPowerMw),
        acceptanceFraction: transmissionPercent / 100,
        wasClipped: false,
        partialAcceptance: transmissionPercent < 99,
        internalOpticalPathMm,
        outputPolarization: ray.polarization,
        note: `${createNote(candidate.spec)} • ${candidate.component.config.delayLine?.positionMm?.toFixed(2) ?? '0.00'} mm scan`,
        outgoing:
          outgoingPowerMw > MIN_POWER_MW
            ? [
                {
                  attenuationClass,
                  branchKind: 'continued',
                  directionMm: ray.directionMm,
                  originMm: addVectors(candidate.hitPointMm, scaleVector(ray.directionMm, RAY_EPSILON_MM)),
                  pathMode: 'continue',
                  pathRole: ray.pathRole,
                  polarization: ray.polarization,
                  powerMw: outgoingPowerMw,
                  wavelengthNm: ray.wavelengthNm,
                  bandwidthNm: ray.bandwidthNm,
                  beamDiameterMm: propagatedBeamDiameterMm,
                  generation: ray.generation,
                  outcomeClass:
                    attenuationClass === 'low-power'
                      ? 'low-power'
                      : attenuationClass === 'attenuated'
                        ? 'attenuated'
                        : 'transmitted',
                },
              ]
            : [],
      }
    }
    case 'relay': {
      const transmissionPercent =
        candidate.spec.physics.transmissionPercent *
        (candidate.spec.physics.supportedWavelengthNm
          ? getRangeFactor(ray.wavelengthNm, candidate.spec.physics.supportedWavelengthNm)
          : 1)
      const outgoingPowerMw = roundMm(ray.powerMw * (transmissionPercent / 100))
      const attenuationClass = classifyAttenuationClass({
        acceptanceFraction: transmissionPercent / 100,
        powerPercent: roundMm((outgoingPowerMw / ray.sourcePowerMw) * 100),
        blocked: outgoingPowerMw <= MIN_POWER_MW,
      })

      return {
        interactionKind: outgoingPowerMw > MIN_POWER_MW ? 'transmission' : 'blocked',
        outcomeClass:
          outgoingPowerMw <= MIN_POWER_MW
            ? 'blocked'
            : attenuationClass === 'low-power'
              ? 'low-power'
              : attenuationClass === 'attenuated'
                ? 'attenuated'
                : 'transmitted',
        transmittedPowerMw: outgoingPowerMw,
        lostPowerMw: roundMm(ray.powerMw - outgoingPowerMw),
        acceptanceFraction: transmissionPercent / 100,
        wasClipped: false,
        partialAcceptance: transmissionPercent < 99,
        internalOpticalPathMm: 0,
        outputPolarization: ray.polarization,
        note: `${createNote(candidate.spec)} • 2D relay only`,
        outgoing:
          outgoingPowerMw > MIN_POWER_MW
            ? [
                {
                  attenuationClass,
                  branchKind: 'continued',
                  directionMm: ray.directionMm,
                  originMm: addVectors(candidate.hitPointMm, scaleVector(ray.directionMm, RAY_EPSILON_MM)),
                  pathMode: 'continue',
                  pathRole: ray.pathRole,
                  polarization: ray.polarization,
                  powerMw: outgoingPowerMw,
                  wavelengthNm: ray.wavelengthNm,
                  bandwidthNm: ray.bandwidthNm,
                  beamDiameterMm: propagatedBeamDiameterMm,
                  generation: ray.generation,
                  outcomeClass:
                    attenuationClass === 'low-power'
                      ? 'low-power'
                      : attenuationClass === 'attenuated'
                        ? 'attenuated'
                        : 'transmitted',
                },
              ]
            : [],
      }
    }
    case 'telescope': {
      const transmissionPercent =
        candidate.spec.physics.transmissionPercent *
        (candidate.spec.physics.supportedWavelengthNm
          ? getRangeFactor(ray.wavelengthNm, candidate.spec.physics.supportedWavelengthNm)
          : 1)
      const outgoingPowerMw = roundMm(ray.powerMw * (transmissionPercent / 100))
      const internalOpticalPathMm = roundMm(candidate.component.config.telescope?.separationMm ?? candidate.spec.physics.defaultSeparationMm)
      const attenuationClass = classifyAttenuationClass({
        acceptanceFraction: transmissionPercent / 100,
        powerPercent: roundMm((outgoingPowerMw / ray.sourcePowerMw) * 100),
        blocked: outgoingPowerMw <= MIN_POWER_MW,
      })

      return {
        interactionKind: outgoingPowerMw > MIN_POWER_MW ? 'transmission' : 'blocked',
        outcomeClass:
          outgoingPowerMw <= MIN_POWER_MW
            ? 'blocked'
            : attenuationClass === 'low-power'
              ? 'low-power'
              : attenuationClass === 'attenuated'
                ? 'attenuated'
                : 'transmitted',
        transmittedPowerMw: outgoingPowerMw,
        lostPowerMw: roundMm(ray.powerMw - outgoingPowerMw),
        acceptanceFraction: transmissionPercent / 100,
        wasClipped: false,
        partialAcceptance: transmissionPercent < 99,
        internalOpticalPathMm,
        outputPolarization: ray.polarization,
        note: `${createNote(candidate.spec)} • sep ${(candidate.component.config.telescope?.separationMm ?? candidate.spec.physics.defaultSeparationMm).toFixed(1)} mm`,
        outgoing:
          outgoingPowerMw > MIN_POWER_MW
            ? [
                {
                  attenuationClass,
                  branchKind: 'continued',
                  directionMm: ray.directionMm,
                  originMm: addVectors(candidate.hitPointMm, scaleVector(ray.directionMm, RAY_EPSILON_MM)),
                  pathMode: 'continue',
                  pathRole: ray.pathRole,
                  polarization: ray.polarization,
                  powerMw: outgoingPowerMw,
                  wavelengthNm: ray.wavelengthNm,
                  bandwidthNm: ray.bandwidthNm,
                  beamDiameterMm: propagatedBeamDiameterMm,
                  generation: ray.generation,
                  outcomeClass:
                    attenuationClass === 'low-power'
                      ? 'low-power'
                      : attenuationClass === 'attenuated'
                        ? 'attenuated'
                        : 'transmitted',
                },
              ]
            : [],
      }
    }
    case 'opa-white-light': {
      const efficiencyPercent =
        candidate.component.config.opa?.conversionEfficiencyPercent ??
        candidate.spec.physics.defaultConversionEfficiencyPercent
      const outgoingPowerMw = roundMm(ray.powerMw * (efficiencyPercent / 100))
      const attenuationClass = classifyAttenuationClass({
        acceptanceFraction: efficiencyPercent / 100,
        powerPercent: roundMm((outgoingPowerMw / ray.sourcePowerMw) * 100),
        blocked: outgoingPowerMw <= MIN_POWER_MW,
      })
      const nextBandwidthNm = Math.max(
        candidate.spec.physics.defaultOutputBandwidthNm,
        roundMm(ray.bandwidthNm * (candidate.component.config.opa?.bandwidthScale ?? 4)),
      )
      const nextWavelengthNm =
        candidate.component.config.opa?.targetWavelengthNm ??
        candidate.spec.physics.defaultOutputWavelengthNm

      return {
        interactionKind: outgoingPowerMw > MIN_POWER_MW ? 'transmission' : 'blocked',
        outcomeClass:
          outgoingPowerMw <= MIN_POWER_MW
            ? 'blocked'
            : 'attenuated',
        transmittedPowerMw: outgoingPowerMw,
        lostPowerMw: roundMm(ray.powerMw - outgoingPowerMw),
        acceptanceFraction: efficiencyPercent / 100,
        wasClipped: false,
        partialAcceptance: efficiencyPercent < 99,
        internalOpticalPathMm: 0,
        outputPolarization: ray.polarization,
        outputWavelengthNm: nextWavelengthNm,
        note: `${createNote(candidate.spec)} • WL ${(nextWavelengthNm).toFixed(1)} nm / ${nextBandwidthNm.toFixed(1)} nm`,
        outgoing:
          outgoingPowerMw > MIN_POWER_MW
            ? [
                {
                  attenuationClass,
                  branchKind: 'continued',
                  directionMm: ray.directionMm,
                  originMm: addVectors(candidate.hitPointMm, scaleVector(ray.directionMm, RAY_EPSILON_MM)),
                  pathMode: 'continue',
                  pathRole: ray.pathRole,
                  polarization: ray.polarization,
                  powerMw: outgoingPowerMw,
                  wavelengthNm: nextWavelengthNm,
                  bandwidthNm: nextBandwidthNm,
                  beamDiameterMm: propagatedBeamDiameterMm,
                  generation: ray.generation + 1,
                  outcomeClass: attenuationClass === 'low-power' ? 'low-power' : 'attenuated',
                },
              ]
            : [],
      }
    }
    default:
      return undefined
  }
}

function traceOpaModule(
  scene: SceneDocument,
  candidate: IntersectionCandidate,
  ray: RayState,
  propagatedBeamDiameterMm: number,
  opaInputsByComponent: Map<string, OpaInputState>,
  emittedOpaKeys: Set<string>,
): TraceResolution | undefined {
  const physics = candidate.spec.physics

  if (
    physics.kind !== 'opa-combiner' &&
    physics.kind !== 'opa-gain'
  ) {
    return undefined
  }

  const currentInputs = opaInputsByComponent.get(candidate.component.id) ?? {}
  const role = getOpaPortRole(candidate.component, candidate.hitPointMm)
  const nextInputs: OpaInputState = {
    ...currentInputs,
    ...(role
      ? {
          [role]: createOpaInputSampleFromRay(
            candidate.component,
            ray,
            propagatedBeamDiameterMm,
          ),
        }
      : {}),
  }

  if (!nextInputs.pump) {
    nextInputs.pump = resolveLinkedOpaInput(scene, candidate.component.config.opa?.pumpLink)
  }
  if (!nextInputs.seed) {
    nextInputs.seed = resolveLinkedOpaInput(scene, candidate.component.config.opa?.seedLink)
  }
  if (!nextInputs.signal) {
    nextInputs.signal = resolveLinkedOpaInput(scene, candidate.component.config.opa?.signalLink)
  }

  opaInputsByComponent.set(candidate.component.id, nextInputs)

  const readyInputs =
    physics.kind === 'opa-combiner'
      ? nextInputs.pump && nextInputs.seed
      : nextInputs.pump && (nextInputs.seed ?? nextInputs.signal)

  const emissionKey = `${candidate.component.id}:${physics.kind}:${nextInputs.pump?.pathId ?? 'pump'}:${nextInputs.seed?.pathId ?? nextInputs.signal?.pathId ?? 'seed'}`

  if (!readyInputs || emittedOpaKeys.has(emissionKey)) {
    return {
      interactionKind: 'blocked',
      outcomeClass: 'blocked',
      acceptanceFraction: 0,
      wasClipped: false,
      partialAcceptance: true,
      internalOpticalPathMm: 0,
      outputPolarization: ray.polarization,
      note: `${createNote(candidate.spec)} • waiting for ${!nextInputs.pump ? 'pump' : 'seed'}`,
      outgoing: [],
    }
  }

  emittedOpaKeys.add(emissionKey)
  const inputSeed = nextInputs.seed ?? nextInputs.signal!
  const pump = nextInputs.pump!
  const conversionEfficiencyPercent =
    candidate.component.config.opa?.conversionEfficiencyPercent ??
    (physics.kind === 'opa-gain' ? physics.defaultConversionEfficiencyPercent : 90)
  const outgoingPowerMw =
    physics.kind === 'opa-combiner'
      ? roundMm((pump.powerMw + inputSeed.powerMw) * 0.5 * (conversionEfficiencyPercent / 100))
      : roundMm(
          Math.min(pump.powerMw, inputSeed.powerMw * 4) *
            (conversionEfficiencyPercent / 100),
        )
  const outputMode = candidate.component.config.opa?.outputMode ?? 'signal+idler'
  const signalWavelengthNm =
    candidate.component.config.opa?.signalWavelengthNm ??
    candidate.component.config.opa?.targetWavelengthNm ??
    (physics.kind === 'opa-gain' ? physics.defaultSignalWavelengthNm : inputSeed.wavelengthNm)
  const idlerWavelengthNm =
    candidate.component.config.opa?.idlerWavelengthNm ??
    (physics.kind === 'opa-gain'
      ? physics.defaultIdlerWavelengthNm
      : Math.max(350, roundMm((pump.wavelengthNm * inputSeed.wavelengthNm) / Math.max(1, Math.abs(pump.wavelengthNm - inputSeed.wavelengthNm)))))
  const outputBandwidthNm =
    candidate.component.config.opa?.outputBandwidthNm ??
    (physics.kind === 'opa-gain'
      ? physics.defaultBandwidthNm
      : Math.max(pump.bandwidthNm, inputSeed.bandwidthNm))
  const attenuationClass = classifyAttenuationClass({
    acceptanceFraction: conversionEfficiencyPercent / 100,
    powerPercent: 100,
    blocked: outgoingPowerMw <= MIN_POWER_MW,
  })
  const outputPolarization = combineOpaPolarizations([pump, inputSeed])
  const outputOriginMm = addVectors(
    candidate.hitPointMm,
    scaleVector(ray.directionMm, RAY_EPSILON_MM),
  )
  const outputDivergenceMrad = inputSeed.divergenceMrad
  const outputBeamDiameterMm = inputSeed.beamDiameterMm
  const outgoing: OutgoingRayTemplate[] = []

  if (outgoingPowerMw > MIN_POWER_MW) {
    if (physics.kind === 'opa-combiner' || outputMode === 'signal' || outputMode === 'signal+idler') {
      outgoing.push({
        attenuationClass,
        branchKind: 'root',
        directionMm: ray.directionMm,
        originMm: outputOriginMm,
        pathMode: 'branch',
        pathRole: 'fundamental',
        polarization: outputPolarization,
        powerMw: outputMode === 'signal+idler' && physics.kind === 'opa-gain'
          ? roundMm(outgoingPowerMw * 0.62)
          : outgoingPowerMw,
        wavelengthNm: signalWavelengthNm,
        bandwidthNm: outputBandwidthNm,
        beamDiameterMm: outputBeamDiameterMm,
        generation: Math.max(pump.divergenceMrad, inputSeed.divergenceMrad) > 0 ? ray.generation + 1 : ray.generation + 1,
        outcomeClass: 'transmitted',
        sourceComponentId: candidate.component.id,
        sourceLabel: candidate.component.label,
        sourcePowerMw: outgoingPowerMw,
        divergenceMrad: outputDivergenceMrad,
      })
    }

    if (physics.kind === 'opa-gain' && (outputMode === 'idler' || outputMode === 'signal+idler')) {
      outgoing.push({
        attenuationClass,
        branchKind: 'root',
        directionMm: ray.directionMm,
        originMm: outputOriginMm,
        pathMode: 'branch',
        pathRole: 'fundamental',
        polarization: outputPolarization,
        powerMw:
          outputMode === 'signal+idler' ? roundMm(outgoingPowerMw * 0.38) : outgoingPowerMw,
        wavelengthNm: idlerWavelengthNm,
        bandwidthNm: outputBandwidthNm,
        beamDiameterMm: outputBeamDiameterMm,
        generation: ray.generation + 1,
        outcomeClass: 'transmitted',
        sourceComponentId: candidate.component.id,
        sourceLabel: candidate.component.label,
        sourcePowerMw: outgoingPowerMw,
        divergenceMrad: outputDivergenceMrad,
      })
    }
  }

  return {
    interactionKind: outgoing.length > 0 ? 'transmission' : 'blocked',
    outcomeClass: outgoing.length > 0 ? 'transmitted' : 'blocked',
    transmittedPowerMw: outgoingPowerMw,
    lostPowerMw: roundMm(ray.powerMw),
    acceptanceFraction: conversionEfficiencyPercent / 100,
    wasClipped: false,
    partialAcceptance: outgoing.length === 0,
    internalOpticalPathMm: 0,
    outputPolarization,
    outputWavelengthNm: signalWavelengthNm,
    note:
      physics.kind === 'opa-combiner'
        ? `${createNote(candidate.spec)} • pump+seed combined`
        : `${createNote(candidate.spec)} • ${outputMode} generated`,
    outgoing,
  }
}

function buildBranchResults(
  sourcePowerMw: number,
  branches: Array<{
    beamId: string
    branchKind: BeamBranchKind
    outcomeClass: BeamOutcomeClass
    pathId: string
    pathRole: 'fundamental' | 'shg'
    powerMw: number
    wavelengthNm: number
  }>,
) {
  return branches.map(
    (branch) =>
      ({
        beamId: branch.beamId,
        pathId: branch.pathId,
        branchKind: branch.branchKind,
        outcomeClass: branch.outcomeClass,
        pathRole: branch.pathRole,
        powerMw: roundMm(branch.powerMw),
        powerPercent: roundMm((branch.powerMw / sourcePowerMw) * 100),
        wavelengthNm: branch.wavelengthNm,
      }) satisfies BeamBranchResult,
  )
}

function getContentTag(pathRole: 'fundamental' | 'shg'): BeamContentTag {
  return pathRole === 'shg' ? 'shg' : 'fundamental'
}

export function traceSceneBeams(scene: SceneDocument): BeamTraceResult {
  const queue: RayState[] = []
  const segments: BeamSegment[] = []
  const events: BeamInteractionEvent[] = []
  const opaInputsByComponent = new Map<string, OpaInputState>()
  const emittedOpaKeys = new Set<string>()
  let beamIndex = 0
  let pathIndex = 0
  let segmentIndex = 0
  let eventIndex = 0

  for (const component of scene.components) {
    const sourceConfig = component.config.source

    if (!sourceConfig?.isEnabled) {
      continue
    }

    const ray = createSourceRay(component, sourceConfig, {
      beamId: `beam-${(beamIndex += 1)}`,
      pathId: `path-${(pathIndex += 1)}`,
    })

    if (ray) {
      queue.push(ray)
    }
  }

  while (queue.length > 0) {
    const ray = queue.shift()

    if (!ray || ray.depth > MAX_TRACE_DEPTH || ray.powerMw <= MIN_POWER_MW) {
      continue
    }

    const intersection = findNearestIntersection(ray, scene.components)

    if (!intersection) {
      segments.push(
        makeSegment({
          endMm: getEscapedSegmentEndMm(scene, ray),
          id: `segment-${(segmentIndex += 1)}`,
          internalOpticalPathMm: 0,
          powerMw: ray.powerMw,
          ray,
          startMm: ray.originMm,
          status: 'escaped',
        }),
      )
      continue
    }

    const propagatedBeamDiameterMm = getBeamDiameterAtDistanceMm(
      ray.beamDiameterMm,
      ray.divergenceMrad,
      intersection.rayDistanceMm,
    )

    const resolution =
      traceMirror(scene, intersection, ray) ??
      traceBeamsplitter(scene, intersection, ray) ??
      traceOpaModule(
        scene,
        intersection,
        ray,
        propagatedBeamDiameterMm,
        opaInputsByComponent,
        emittedOpaKeys,
      ) ??
      tracePassThrough(scene, intersection, ray)

    if (!resolution) {
      continue
    }

    const inputSegment = makeSegment({
      endMm: intersection.hitPointMm,
      id: `segment-${(segmentIndex += 1)}`,
      internalOpticalPathMm: resolution.internalOpticalPathMm,
      powerMw: ray.powerMw,
      ray: {
        ...ray,
        beamDiameterMm: propagatedBeamDiameterMm,
      },
      startMm: ray.originMm,
      status: 'propagated',
    })

    segments.push(inputSegment)

    const eventId = `event-${(eventIndex += 1)}`
    const resolvedBranches: Array<{
      beamId: string
      branchKind: BeamBranchKind
      outcomeClass: BeamOutcomeClass
      pathId: string
      pathRole: 'fundamental' | 'shg'
      powerMw: number
      wavelengthNm: number
    }> = []

    for (const outgoing of resolution.outgoing) {
      const beamId = `beam-${(beamIndex += 1)}`
      const pathId =
        outgoing.pathMode === 'continue' ? ray.pathId : `path-${(pathIndex += 1)}`

      resolvedBranches.push({
        beamId,
        branchKind: outgoing.branchKind,
        outcomeClass: outgoing.outcomeClass,
        pathId,
        pathRole: outgoing.pathRole,
        powerMw: outgoing.powerMw,
        wavelengthNm: outgoing.wavelengthNm,
      })

      queue.push({
        beamId,
        beamDiameterMm: outgoing.beamDiameterMm,
        bandwidthNm: outgoing.bandwidthNm,
        branchKind: outgoing.branchKind,
        depth: ray.depth + 1,
        directionMm: outgoing.directionMm,
        generation: outgoing.generation,
        originMm: addVectors(
          outgoing.originMm,
          scaleVector(outgoing.directionMm, RAY_EPSILON_MM),
        ),
        pathId,
        pathRole: outgoing.pathRole,
        polarization: outgoing.polarization,
        powerMw: outgoing.powerMw,
        sourceComponentId: outgoing.sourceComponentId ?? ray.sourceComponentId,
        sourceLabel: outgoing.sourceLabel ?? ray.sourceLabel,
        sourcePowerMw: outgoing.sourcePowerMw ?? ray.sourcePowerMw,
        wavelengthNm: outgoing.wavelengthNm,
        attenuationClass: outgoing.attenuationClass,
        divergenceMrad: outgoing.divergenceMrad ?? ray.divergenceMrad,
        opticalPathMm: inputSegment.opticalPathMm,
        timeDelayFs: inputSegment.timeDelayFs,
        parentInteractionId: eventId,
      })
    }

    events.push({
      id: eventId,
      pathId: ray.pathId,
      inputBeamId: ray.beamId,
      inputSegmentId: inputSegment.id,
      sourceComponentId: ray.sourceComponentId,
      sourceLabel: ray.sourceLabel,
      componentId: intersection.component.id,
      componentType: intersection.component.type,
      componentLabel: intersection.component.label,
      hitPointMm: intersection.hitPointMm,
      incidenceAngleDeg: intersection.incidenceAngleDeg,
      interactionKind: resolution.interactionKind,
      physicsKind: intersection.spec.physics.kind,
      outcomeClass: resolution.outcomeClass,
      incomingPowerMw: roundMm(ray.powerMw),
      reflectedPowerMw: resolution.reflectedPowerMw,
      transmittedPowerMw: resolution.transmittedPowerMw,
      generatedPowerMw: resolution.generatedPowerMw,
      capturedPowerMw: resolution.capturedPowerMw,
      lostPowerMw: resolution.lostPowerMw,
      wavelengthNm: ray.wavelengthNm,
      bandwidthNm: ray.bandwidthNm,
      outputWavelengthNm: resolution.outputWavelengthNm,
      branchResults: buildBranchResults(ray.sourcePowerMw, resolvedBranches),
      polarization: ray.polarization,
      outputPolarization: resolution.outputPolarization,
      filterTransmissionClass: resolution.filterTransmissionClass,
      acceptanceFraction: roundMm(resolution.acceptanceFraction),
      wasClipped: resolution.wasClipped,
      partialAcceptance: resolution.partialAcceptance,
      geometricLengthMm: inputSegment.geometricLengthMm,
      internalOpticalPathMm: inputSegment.internalOpticalPathMm,
      opticalPathMm: inputSegment.opticalPathMm,
      timeDelayFs: inputSegment.timeDelayFs,
      note: resolution.note,
    })
  }

  const pathSummaryMap = new Map<string, BeamPathSummary>()

  for (const segment of segments) {
    const existing = pathSummaryMap.get(segment.pathId)

    if (!existing) {
      pathSummaryMap.set(segment.pathId, {
        pathId: segment.pathId,
        sourceComponentId: segment.sourceComponentId,
        sourceLabel:
          scene.components.find((component) => component.id === segment.sourceComponentId)
            ?.label ?? 'Source',
        wavelengthNm: segment.wavelengthNm,
        bandwidthNm: segment.bandwidthNm,
        startPowerMw: segment.powerMw,
        finalPowerMw: segment.powerMw,
        pathRole: segment.pathRole,
        branchKind: segment.branchKind,
        segmentIds: [segment.id],
        interactionIds: [],
        outcomeClass: segment.outcomeClass,
        totalOpticalPathMm: segment.opticalPathMm,
        finalTimeDelayFs: segment.timeDelayFs,
      })
      continue
    }

    existing.segmentIds.push(segment.id)
    existing.finalPowerMw = segment.powerMw
    existing.outcomeClass = segment.outcomeClass
    existing.totalOpticalPathMm = segment.opticalPathMm
    existing.finalTimeDelayFs = segment.timeDelayFs
  }

  for (const event of events) {
    const summary = pathSummaryMap.get(event.pathId)

    if (!summary) {
      continue
    }

    summary.interactionIds.push(event.id)

    const continuesPath = event.branchResults.some(
      (branch) => branch.pathId === event.pathId,
    )

    if (!continuesPath) {
      summary.finalPowerMw = 0
      summary.outcomeClass = event.outcomeClass
      summary.totalOpticalPathMm = event.opticalPathMm
      summary.finalTimeDelayFs = event.timeDelayFs
    }
  }

  const summariesBySource = new Map<string, BeamSourceSummary>()

  for (const component of scene.components) {
    const sourceConfig = component.config.source

    if (!sourceConfig?.isEnabled) {
      if (component.type !== 'opa-module') {
        continue
      }
    }

    summariesBySource.set(component.id, {
      sourceComponentId: component.id,
      sourceLabel: component.label,
      wavelengthNm: sourceConfig?.wavelengthNm ?? component.config.opa?.targetWavelengthNm ?? 0,
      bandwidthNm: sourceConfig?.bandwidthNm ?? component.config.opa?.outputBandwidthNm ?? 0,
      powerMw: roundMm(
        sourceConfig
          ? sourceConfig.powerMw * (sourceConfig.normalizedPowerPercent / 100)
          : 0,
      ),
      generatedShgPowerMw: 0,
      terminalCount: 0,
      polarizationTag: sourceConfig
        ? createPolarizationSnapshot(sourceConfig.polarization).tag
        : 'Generated optical state',
    })
  }

  for (const event of events) {
    const summary = summariesBySource.get(event.sourceComponentId)

    if (!summary) {
      summariesBySource.set(event.sourceComponentId, {
        sourceComponentId: event.sourceComponentId,
        sourceLabel: event.sourceLabel,
        wavelengthNm: event.outputWavelengthNm ?? event.wavelengthNm,
        bandwidthNm: event.bandwidthNm,
        powerMw: event.transmittedPowerMw ?? event.generatedPowerMw ?? event.incomingPowerMw,
        generatedShgPowerMw: event.generatedPowerMw ?? 0,
        terminalCount: event.interactionKind === 'terminal' ? 1 : 0,
        polarizationTag: event.outputPolarization?.tag ?? event.polarization.tag,
      })
      continue
    }

    summary.generatedShgPowerMw = roundMm(
      summary.generatedShgPowerMw + (event.generatedPowerMw ?? 0),
    )

    if (event.interactionKind === 'terminal') {
      summary.terminalCount += 1
    }
  }

  const terminalCapturesMap = new Map<string, TerminalCaptureHit[]>()

  for (const event of events) {
    const spec = getResolvedComponentSpec(event.componentType)

    if (spec.physics.kind !== 'terminal') {
      continue
    }

    const sourceSummary = summariesBySource.get(event.sourceComponentId)
    const capturedPowerMw = event.capturedPowerMw ?? event.lostPowerMw ?? 0
    const hit: TerminalCaptureHit = {
      interactionId: event.id,
      pathId: event.pathId,
      sourceComponentId: event.sourceComponentId,
      sourceLabel: event.sourceLabel,
      beamId: event.inputBeamId,
      wavelengthNm: event.wavelengthNm,
      bandwidthNm:
        pathSummaryMap.get(event.pathId)?.bandwidthNm ?? sourceSummary?.bandwidthNm ?? 0,
      powerMw: capturedPowerMw,
      powerPercent:
        sourceSummary && sourceSummary.powerMw > 0
          ? roundMm((capturedPowerMw / sourceSummary.powerMw) * 100)
          : 0,
      contentTag: getContentTag(
        pathSummaryMap.get(event.pathId)?.pathRole ?? 'fundamental',
      ),
      polarizationTag: event.polarization.tag,
      note: event.note,
    }

    terminalCapturesMap.set(event.componentId, [
      ...(terminalCapturesMap.get(event.componentId) ?? []),
      hit,
    ])
  }

  const terminalCaptures = Array.from(terminalCapturesMap.entries()).map(
    ([componentId, hits]) => {
      const component = scene.components.find((item) => item.id === componentId)
      const spec = component
        ? getResolvedComponentSpec(component.type, component.variantId)
        : undefined
      const fundamentalCapturedPowerMw = roundMm(
        hits
          .filter((hit) => hit.contentTag === 'fundamental')
          .reduce((total, hit) => total + hit.powerMw, 0),
      )
      const shgCapturedPowerMw = roundMm(
        hits
          .filter((hit) => hit.contentTag === 'shg')
          .reduce((total, hit) => total + hit.powerMw, 0),
      )
      const contentKinds = Array.from(
        new Set(
          hits.map((hit) => (hit.contentTag === 'mixed' ? 'mixed' : hit.contentTag)),
        ),
      ) as BeamContentTag[]

      return {
        componentId,
        componentLabel: component?.label ?? 'Terminal',
        componentType: component?.type ?? 'detector',
        role: spec?.physics.kind === 'terminal' ? spec.physics.role : 'detector',
        totalCapturedPowerMw: roundMm(hits.reduce((total, hit) => total + hit.powerMw, 0)),
        fundamentalCapturedPowerMw,
        shgCapturedPowerMw,
        mixedContent:
          contentKinds.includes('fundamental') && contentKinds.includes('shg'),
        hits,
      }
    },
  )

  const opticInteractionSummaries = scene.components
    .map((component) => ({
      componentId: component.id,
      componentLabel: component.label,
      componentType: component.type,
      interactions: events.filter((event) => event.componentId === component.id),
    }))
    .filter((summary) => summary.interactions.length > 0)

  return {
    segments,
    events,
    summaries: Array.from(summariesBySource.values()),
    pathSummaries: Array.from(pathSummaryMap.values()),
    terminalCaptures,
    opticInteractionSummaries,
  }
}

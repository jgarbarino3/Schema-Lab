import { getResolvedComponentSpec } from './componentCatalog'
import { roundMm } from './geometry'
import type {
  BeamPathSummary,
  BeamTraceResult,
  ComplexQMm,
  ComponentInstance,
  GaussianApertureStatus,
  GaussianComponentWarning,
  GaussianInteractionAnalysis,
  GaussianLocalReadout,
  GaussianPathAnalysis,
  GaussianPathTableRow,
  GaussianSegmentAnalysis,
  GaussianSourceSummary,
  GaussianTraceResult,
  GaussianWaistMarker,
  ResolvedComponentSpec,
  SceneDocument,
  SourceConfig,
} from './types'

const MIN_LENGTH_MM = 1e-6
const MIN_Q_IMAG_MM = 1e-6
const MIN_RADIUS_MM = 1e-6
const MIN_DIVERGENCE_RAD = 1e-9

function wavelengthNmToMm(wavelengthNm: number) {
  return wavelengthNm * 1e-6
}

function reciprocalComplex(q: ComplexQMm): ComplexQMm {
  const denominator = q.realMm ** 2 + q.imagMm ** 2

  if (denominator <= 0) {
    return {
      realMm: 0,
      imagMm: -1 / MIN_Q_IMAG_MM,
    }
  }

  return {
    realMm: q.realMm / denominator,
    imagMm: -q.imagMm / denominator,
  }
}

function createQ(realMm: number, imagMm: number): ComplexQMm {
  return {
    realMm: roundMm(realMm),
    imagMm: roundMm(Math.max(imagMm, MIN_Q_IMAG_MM)),
  }
}

function propagateFreeSpace(q: ComplexQMm, distanceMm: number) {
  return createQ(q.realMm + distanceMm, q.imagMm)
}

function applyThinLens(q: ComplexQMm, focalLengthMm: number) {
  const inverseQ = reciprocalComplex(q)
  const inverseOut = {
    realMm: inverseQ.realMm - 1 / Math.max(Math.abs(focalLengthMm), MIN_LENGTH_MM),
    imagMm: inverseQ.imagMm,
  }

  return reciprocalComplex(inverseOut)
}

function createLocalReadout(
  q: ComplexQMm,
  wavelengthNm: number,
): GaussianLocalReadout {
  const wavelengthMm = wavelengthNmToMm(wavelengthNm)
  const safeQ = createQ(q.realMm, q.imagMm)
  const inverseQ = reciprocalComplex(safeQ)
  const curvatureInverse = inverseQ.realMm
  const safeInverseImag = Math.min(inverseQ.imagMm, -MIN_Q_IMAG_MM)
  const rayleighRangeMm = Math.max(safeQ.imagMm, MIN_Q_IMAG_MM)
  const waistRadiusMm = Math.max(
    Math.sqrt((wavelengthMm * rayleighRangeMm) / Math.PI),
    MIN_RADIUS_MM,
  )
  const spotRadiusMm = Math.max(
    Math.sqrt(-wavelengthMm / (Math.PI * safeInverseImag)),
    waistRadiusMm,
  )

  return {
    wavelengthNm: roundMm(wavelengthNm),
    q: safeQ,
    spotRadiusMm: roundMm(spotRadiusMm),
    beamDiameterMm: roundMm(spotRadiusMm * 2),
    waistRadiusMm: roundMm(waistRadiusMm),
    waistOffsetMm: roundMm(-safeQ.realMm),
    rayleighRangeMm: roundMm(rayleighRangeMm),
    radiusOfCurvatureMm:
      Math.abs(curvatureInverse) < 1e-9
        ? undefined
        : roundMm(1 / curvatureInverse),
  }
}

function createQFromPhysicalReadout(args: {
  radiusOfCurvatureMm?: number
  spotRadiusMm: number
  wavelengthNm: number
}) {
  const wavelengthMm = wavelengthNmToMm(args.wavelengthNm)
  const inverseReal =
    args.radiusOfCurvatureMm === undefined ? 0 : 1 / args.radiusOfCurvatureMm
  const inverseImag = -wavelengthMm / (Math.PI * Math.max(args.spotRadiusMm, MIN_RADIUS_MM) ** 2)

  return reciprocalComplex({
    realMm: inverseReal,
    imagMm: inverseImag,
  })
}

function getSegmentLengthMm(startMm: { x: number; y: number }, endMm: { x: number; y: number }) {
  return Math.hypot(endMm.x - startMm.x, endMm.y - startMm.y)
}

function createDerivedSourceState(source: SourceConfig) {
  const localRadiusMm = Math.max(source.beamDiameterMm / 2, MIN_RADIUS_MM)
  const thetaRad = Math.max(source.divergenceMrad / 1000, MIN_DIVERGENCE_RAD)
  const wavelengthMm = wavelengthNmToMm(source.wavelengthNm)
  const impliedWaistRadiusMm = Math.max(
    wavelengthMm / (Math.PI * thetaRad),
    MIN_RADIUS_MM,
  )

  if (localRadiusMm < impliedWaistRadiusMm) {
    const launch = createLocalReadout(
      createQ(0, (Math.PI * impliedWaistRadiusMm ** 2) / wavelengthMm),
      source.wavelengthNm,
    )

    return {
      launch,
      warning:
        'Source diameter was smaller than the ideal Gaussian waist implied by divergence; launch state was clamped to the minimum waist-compatible beam.',
    }
  }

  const rayleighRangeMm = (Math.PI * impliedWaistRadiusMm ** 2) / wavelengthMm
  const distanceFromWaistMm =
    rayleighRangeMm *
    Math.sqrt(
      Math.max(0, (localRadiusMm / impliedWaistRadiusMm) ** 2 - 1),
    )

  return {
    launch: createLocalReadout(
      createQ(distanceFromWaistMm, rayleighRangeMm),
      source.wavelengthNm,
    ),
  }
}

function createExplicitSourceState(source: SourceConfig) {
  const waistRadiusMm = Math.max(source.waistRadiusMm ?? source.beamDiameterMm / 2, MIN_RADIUS_MM)
  const waistOffsetMm = source.waistOffsetMm ?? 0
  const wavelengthMm = wavelengthNmToMm(source.wavelengthNm)
  const rayleighRangeMm = (Math.PI * waistRadiusMm ** 2) / wavelengthMm

  return {
    launch: createLocalReadout(
      createQ(-waistOffsetMm, rayleighRangeMm),
      source.wavelengthNm,
    ),
  }
}

function createSourceSummary(
  component: ComponentInstance,
): GaussianSourceSummary | undefined {
  const source = component.config.source

  if (!source) {
    return undefined
  }

  const analysis =
    source.gaussianInputMode === 'explicit-waist'
      ? createExplicitSourceState(source)
      : createDerivedSourceState(source)

  return {
    sourceComponentId: component.id,
    sourceLabel: component.label,
    inputMode: source.gaussianInputMode,
    launch: analysis.launch,
    warning:
      'warning' in analysis && typeof analysis.warning === 'string'
        ? analysis.warning
        : undefined,
  } satisfies GaussianSourceSummary
}

function getApertureMm(
  component: ComponentInstance,
  spec: ResolvedComponentSpec,
) {
  switch (spec.physics.kind) {
    case 'iris':
      return component.config.iris?.apertureMm ?? spec.physics.defaultApertureMm
    case 'lens':
      return (
        component.config.lens?.clearApertureMm ??
        spec.physics.defaultClearApertureMm ??
        spec.physics.opticalApertureMm
      )
    default:
      return spec.physics.opticalApertureMm
  }
}

export function classifyGaussianApertureStatus(
  beamDiameterMm: number,
  apertureMm: number,
): GaussianApertureStatus {
  if (beamDiameterMm <= 0.7 * apertureMm) {
    return 'clear'
  }

  if (beamDiameterMm <= apertureMm) {
    return 'near-limit'
  }

  return 'overfill'
}

function strongestGaussianStatus(
  current: GaussianApertureStatus,
  next: GaussianApertureStatus,
) {
  const priority: Record<GaussianApertureStatus, number> = {
    clear: 0,
    'near-limit': 1,
    overfill: 2,
  }

  return priority[next] > priority[current] ? next : current
}

function createBranchSeed(args: {
  branchPathId: string
  eventPathId: string
  wavelengthNm: number
  pathSummary: BeamPathSummary
  postOpticReadout: GaussianLocalReadout
  branchRole: 'fundamental' | 'shg'
}) {
  if (args.branchRole === 'shg') {
    return createQFromPhysicalReadout({
      radiusOfCurvatureMm: args.postOpticReadout.radiusOfCurvatureMm,
      spotRadiusMm: args.postOpticReadout.spotRadiusMm,
      wavelengthNm: args.wavelengthNm,
    })
  }

  return args.postOpticReadout.q
}

export function analyzeGaussianPaths(
  scene: SceneDocument,
  beamTrace: BeamTraceResult,
): GaussianTraceResult {
  const componentById = new Map(
    scene.components.map((component) => [component.id, component] as const),
  )
  const segmentById = new Map(
    beamTrace.segments.map((segment) => [segment.id, segment] as const),
  )
  const eventByInputSegmentId = new Map(
    beamTrace.events.map((event) => [event.inputSegmentId, event] as const),
  )
  const pathById = new Map(
    beamTrace.pathSummaries.map((path) => [path.pathId, path] as const),
  )

  const sources = scene.components
    .filter((component) => component.config.source?.isEnabled)
    .reduce<GaussianSourceSummary[]>((summaries, component) => {
      const summary = createSourceSummary(component)

      if (summary) {
        summaries.push(summary)
      }

      return summaries
    }, [])

  const pathSeeds = new Map<string, ComplexQMm>()
  const pathQueue: string[] = []

  for (const summary of beamTrace.pathSummaries) {
    if (summary.branchKind !== 'root') {
      continue
    }

    const sourceSummary = sources.find(
      (item) => item.sourceComponentId === summary.sourceComponentId,
    )

    if (!sourceSummary) {
      continue
    }

    pathSeeds.set(summary.pathId, sourceSummary.launch.q)
    pathQueue.push(summary.pathId)
  }

  const processedPaths = new Set<string>()
  const segmentAnalyses: GaussianSegmentAnalysis[] = []
  const interactionAnalyses: GaussianInteractionAnalysis[] = []
  const pathAnalyses: GaussianPathAnalysis[] = []
  const componentWarnings = new Map<string, GaussianComponentWarning>()

  while (pathQueue.length > 0) {
    const pathId = pathQueue.shift()

    if (!pathId || processedPaths.has(pathId)) {
      continue
    }

    const seedQ = pathSeeds.get(pathId)
    const pathSummary = pathById.get(pathId)

    if (!seedQ || !pathSummary) {
      continue
    }

    processedPaths.add(pathId)

    let currentQ = seedQ
    let currentDistanceMm = 0
    let finalReadout = createLocalReadout(currentQ, pathSummary.wavelengthNm)
    const pathSegmentIds: string[] = []
    const pathInteractionIds: string[] = []

    for (const segmentId of pathSummary.segmentIds) {
      const segment = segmentById.get(segmentId)

      if (!segment) {
        continue
      }

      const lengthMm = getSegmentLengthMm(segment.startMm, segment.endMm)
      const startReadout = createLocalReadout(currentQ, segment.wavelengthNm)
      const propagatedQ = propagateFreeSpace(currentQ, lengthMm)
      const endReadout = createLocalReadout(propagatedQ, segment.wavelengthNm)

      segmentAnalyses.push({
        segmentId: segment.id,
        pathId: segment.pathId,
        sourceComponentId: segment.sourceComponentId,
        lengthMm: roundMm(lengthMm),
        startDistanceMm: roundMm(currentDistanceMm),
        endDistanceMm: roundMm(currentDistanceMm + lengthMm),
        start: startReadout,
        end: endReadout,
      })

      pathSegmentIds.push(segment.id)
      currentDistanceMm += lengthMm
      finalReadout = endReadout

      const event = eventByInputSegmentId.get(segment.id)

      if (!event) {
        currentQ = propagatedQ
        continue
      }

      const component = componentById.get(event.componentId)
      const spec = component
        ? getResolvedComponentSpec(component.type, component.variantId)
        : undefined
      const apertureMm =
        component && spec ? getApertureMm(component, spec) : undefined
      const apertureStatus =
        apertureMm && apertureMm > 0
          ? classifyGaussianApertureStatus(endReadout.beamDiameterMm, apertureMm)
          : undefined
      const postOpticQ =
        component &&
        spec?.physics.kind === 'lens' &&
        component.config.lens?.focalLengthMm !== undefined
          ? applyThinLens(propagatedQ, component.config.lens.focalLengthMm)
          : component && spec?.physics.kind === 'lens'
            ? applyThinLens(propagatedQ, spec.physics.defaultFocalLengthMm)
            : propagatedQ
      const outputLocal =
        component && spec?.physics.kind === 'lens'
          ? createLocalReadout(postOpticQ, event.wavelengthNm)
          : undefined

      const interactionEntry: GaussianInteractionAnalysis = {
        interactionId: event.id,
        pathId: event.pathId,
        componentId: event.componentId,
        componentLabel: event.componentLabel,
        componentType: event.componentType,
        pathRole: pathSummary.pathRole,
        branchKind: pathSummary.branchKind,
        hitDistanceMm: roundMm(currentDistanceMm),
        local: endReadout,
        outputLocal,
        apertureMm: apertureMm ? roundMm(apertureMm) : undefined,
        apertureStatus,
        note: apertureStatus
          ? `${apertureStatus} aperture check`
          : undefined,
      }

      interactionAnalyses.push(interactionEntry)
      pathInteractionIds.push(event.id)

      if (component && apertureStatus && apertureStatus !== 'clear') {
        const existing = componentWarnings.get(component.id)

        if (!existing) {
          componentWarnings.set(component.id, {
            componentId: component.id,
            componentLabel: component.label,
            componentType: component.type,
            strongestStatus: apertureStatus,
            interactions: [interactionEntry],
          })
        } else {
          existing.strongestStatus = strongestGaussianStatus(
            existing.strongestStatus,
            apertureStatus,
          )
          existing.interactions.push(interactionEntry)
        }
      }

      currentQ = propagatedQ

      for (const branch of event.branchResults) {
        const branchSourcePath = pathById.get(branch.pathId)

        if (!branchSourcePath) {
          continue
        }

        const postOpticReadout =
          branch.pathId === pathId
            ? createLocalReadout(postOpticQ, branch.wavelengthNm)
            : branch.pathRole === 'shg'
              ? createLocalReadout(
                  createQFromPhysicalReadout({
                    radiusOfCurvatureMm: endReadout.radiusOfCurvatureMm,
                    spotRadiusMm: endReadout.spotRadiusMm,
                    wavelengthNm: branch.wavelengthNm,
                  }),
                  branch.wavelengthNm,
                )
              : createLocalReadout(postOpticQ, branch.wavelengthNm)

        const branchQ = createBranchSeed({
          branchPathId: branch.pathId,
          eventPathId: event.pathId,
          wavelengthNm: branch.wavelengthNm,
          pathSummary: branchSourcePath,
          postOpticReadout,
          branchRole: branch.pathRole,
        })

        if (branch.pathId === pathId) {
          currentQ = branchQ
          finalReadout = postOpticReadout
          continue
        }

        if (!pathSeeds.has(branch.pathId)) {
          pathSeeds.set(branch.pathId, branchQ)
          pathQueue.push(branch.pathId)
        }
      }
    }

    pathAnalyses.push({
      pathId: pathSummary.pathId,
      sourceComponentId: pathSummary.sourceComponentId,
      sourceLabel: pathSummary.sourceLabel,
      pathRole: pathSummary.pathRole,
      wavelengthNm: pathSummary.wavelengthNm,
      launch: createLocalReadout(seedQ, pathSummary.wavelengthNm),
      final: finalReadout,
      segmentIds: pathSegmentIds,
      interactionIds: pathInteractionIds,
    })
  }

  return {
    sources,
    pathAnalyses,
    segmentAnalyses,
    interactionAnalyses,
    componentWarnings: Array.from(componentWarnings.values()),
  }
}

export function getGaussianPathAnalysis(
  gaussianTrace: GaussianTraceResult,
  pathId?: string,
) {
  return pathId
    ? gaussianTrace.pathAnalyses.find((analysis) => analysis.pathId === pathId)
    : undefined
}

export function getGaussianSegmentAnalysis(
  gaussianTrace: GaussianTraceResult,
  segmentId?: string,
) {
  return segmentId
    ? gaussianTrace.segmentAnalyses.find((analysis) => analysis.segmentId === segmentId)
    : undefined
}

export function getGaussianInteractionAnalysis(
  gaussianTrace: GaussianTraceResult,
  interactionId?: string,
) {
  return interactionId
    ? gaussianTrace.interactionAnalyses.find(
        (analysis) => analysis.interactionId === interactionId,
      )
    : undefined
}

export function getGaussianSourceSummary(
  gaussianTrace: GaussianTraceResult,
  sourceComponentId?: string,
) {
  return sourceComponentId
    ? gaussianTrace.sources.find(
        (analysis) => analysis.sourceComponentId === sourceComponentId,
      )
    : undefined
}

export function getGaussianPathTableRows(
  beamTrace: BeamTraceResult,
  gaussianTrace: GaussianTraceResult,
  pathId?: string,
): GaussianPathTableRow[] {
  if (!pathId) {
    return []
  }

  const path = getGaussianPathAnalysis(gaussianTrace, pathId)

  if (!path) {
    return []
  }

  const segmentAnalysisById = new Map(
    gaussianTrace.segmentAnalyses.map((analysis) => [analysis.segmentId, analysis] as const),
  )
  const interactionAnalysisById = new Map(
    gaussianTrace.interactionAnalyses.map(
      (analysis) => [analysis.interactionId, analysis] as const,
    ),
  )
  const rows: GaussianPathTableRow[] = []

  for (const segmentId of path.segmentIds) {
    const segmentAnalysis = segmentAnalysisById.get(segmentId)

    if (!segmentAnalysis) {
      continue
    }

    rows.push({
      id: `${segmentId}:segment`,
      beamDiameterMm: segmentAnalysis.end.beamDiameterMm,
      curvatureMm: segmentAnalysis.end.radiusOfCurvatureMm,
      kind: 'segment',
      label: `Segment ${segmentId}`,
      rayleighRangeMm: segmentAnalysis.end.rayleighRangeMm,
      spotRadiusMm: segmentAnalysis.end.spotRadiusMm,
      waistOffsetMm: segmentAnalysis.end.waistOffsetMm,
      waistRadiusMm: segmentAnalysis.end.waistRadiusMm,
      zPositionMm: segmentAnalysis.endDistanceMm,
    })

    const event = beamTrace.events.find(
      (candidate) => candidate.inputSegmentId === segmentId && candidate.pathId === pathId,
    )
    const interactionAnalysis = event
      ? interactionAnalysisById.get(event.id)
      : undefined

    if (!event || !interactionAnalysis) {
      continue
    }

    rows.push({
      id: `${event.id}:interaction`,
      apertureStatus: interactionAnalysis.apertureStatus,
      beamDiameterMm: interactionAnalysis.local.beamDiameterMm,
      curvatureMm: interactionAnalysis.local.radiusOfCurvatureMm,
      kind: 'interaction',
      label: event.componentLabel,
      rayleighRangeMm: interactionAnalysis.local.rayleighRangeMm,
      spotRadiusMm: interactionAnalysis.local.spotRadiusMm,
      waistOffsetMm: interactionAnalysis.local.waistOffsetMm,
      waistRadiusMm: interactionAnalysis.local.waistRadiusMm,
      zPositionMm: interactionAnalysis.hitDistanceMm,
    })
  }

  return rows
}

export function getGaussianWaistMarkers(
  beamTrace: BeamTraceResult,
  gaussianTrace: GaussianTraceResult,
  pathId?: string,
): GaussianWaistMarker[] {
  if (!pathId) {
    return []
  }

  const segmentById = new Map(
    beamTrace.segments.map((segment) => [segment.id, segment] as const),
  )

  return gaussianTrace.segmentAnalyses.reduce<GaussianWaistMarker[]>((markers, analysis) => {
    if (analysis.pathId !== pathId) {
      return markers
    }

    const segment = segmentById.get(analysis.segmentId)

    if (!segment) {
      return markers
    }

    const waistOffsetMm = analysis.start.waistOffsetMm

    if (waistOffsetMm < 0 || waistOffsetMm > analysis.lengthMm) {
      return markers
    }

    markers.push({
      pathId,
      pointMm: {
        x: segment.startMm.x + segment.directionMm.x * waistOffsetMm,
        y: segment.startMm.y + segment.directionMm.y * waistOffsetMm,
      },
      segmentId: analysis.segmentId,
      waistRadiusMm: analysis.start.waistRadiusMm,
      zPositionMm: roundMm(analysis.startDistanceMm + waistOffsetMm),
    })

    return markers
  }, [])
}

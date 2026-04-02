import { deriveBboMetrics, deriveBboPolarizationSummary } from './bbo'
import { getResolvedComponentSpec } from './componentCatalog'
import { getFilterTransmissionEstimate } from './beamTracing'
import { createPolarizationSnapshot } from './polarization'
import type {
  BeamInteractionEvent,
  BeamPathSummary,
  BeamSegment,
  BeamTraceResult,
  ComponentInstance,
  FilterTransmissionClass,
  ResolvedComponentSpec,
  SceneBeamSettings,
  SceneDocument,
} from './types'

export interface SelectedBeamInspection {
  path?: BeamPathSummary
  segment?: BeamSegment
  interaction?: BeamInteractionEvent
}

export function getBeamSelection(
  trace: BeamTraceResult,
  selection: {
    interactionId?: string
    pathId?: string
    segmentId?: string
  },
): SelectedBeamInspection {
  const segment = selection.segmentId
    ? trace.segments.find((item) => item.id === selection.segmentId)
    : undefined
  const path = (selection.pathId ?? segment?.pathId)
    ? trace.pathSummaries.find(
        (item) => item.pathId === (selection.pathId ?? segment?.pathId),
      )
    : undefined
  const interaction = selection.interactionId
    ? trace.events.find((item) => item.id === selection.interactionId)
    : segment?.parentInteractionId
      ? trace.events.find((item) => item.id === segment.parentInteractionId)
      : path
        ? trace.events.find((item) => item.pathId === path.pathId)
        : undefined

  return {
    path,
    segment,
    interaction,
  }
}

export function getSourceSummaryForComponent(
  trace: BeamTraceResult,
  componentId: string,
) {
  return trace.summaries.find((summary) => summary.sourceComponentId === componentId)
}

export function getPathSummaryForComponent(
  trace: BeamTraceResult,
  componentId: string,
) {
  return trace.pathSummaries.filter((summary) => summary.sourceComponentId === componentId)
}

export function getOpticInteractionSummary(
  trace: BeamTraceResult,
  componentId: string,
) {
  return trace.opticInteractionSummaries.find(
    (summary) => summary.componentId === componentId,
  )
}

export function getTerminalCaptureSummary(
  trace: BeamTraceResult,
  componentId: string,
) {
  return trace.terminalCaptures.find((summary) => summary.componentId === componentId)
}

export function getFilterInspectorReadout(args: {
  componentId: string
  referenceWavelengthNm: number
  strongestIncomingPowerMw: number
  spec: ResolvedComponentSpec
}) {
  const estimate = getFilterTransmissionEstimate(args.spec, args.referenceWavelengthNm)

  return {
    referenceWavelengthNm: args.referenceWavelengthNm,
    transmissionPercent: estimate.transmissionPercent,
    transmissionClass: estimate.transmissionClass,
    lostPowerMw: Number(
      (
        args.strongestIncomingPowerMw *
        (1 - estimate.transmissionPercent / 100)
      ).toFixed(2),
    ),
  }
}

export function getFilterReadout(args: {
  component: ComponentInstance
  scene: SceneDocument
  trace: BeamTraceResult
}) {
  const strongestEvent = getOpticInteractionSummary(args.trace, args.component.id)
    ?.interactions.slice()
    .sort((left, right) => right.incomingPowerMw - left.incomingPowerMw)[0]
  const componentSpec = getResolvedComponentSpec(
    args.component.type,
    args.component.variantId,
  )

  return getFilterInspectorReadout({
    componentId: args.component.id,
    referenceWavelengthNm: strongestEvent?.wavelengthNm ?? 800,
    strongestIncomingPowerMw: strongestEvent?.incomingPowerMw ?? 0,
    spec: componentSpec,
  })
}

export function getBboInspectorReadout(args: {
  beamSettings: SceneBeamSettings
  component: ComponentInstance
  incomingPolarization?: BeamTraceResult['events'][number]['polarization']
  strongestIncomingPowerMw?: number
  strongestIncomingWavelengthNm?: number
  strongestIncomingBandwidthNm?: number
}) {
  if (!args.component.config.bboCrystal) {
    return undefined
  }

  const polarization =
    args.incomingPolarization ??
    createPolarizationSnapshot(args.component.config.source?.polarization)
  const metrics = deriveBboMetrics({
    beamDiameterMm: args.beamSettings.defaultBeamDiameterMm,
    bandwidthNm:
      args.strongestIncomingBandwidthNm ?? 10,
    interactionMode: args.component.config.bboCrystal.interactionMode,
    phaseMatchingAngleDeg: args.component.config.bboCrystal.phaseMatchingAngleDeg,
    thicknessUm: args.component.config.bboCrystal.thicknessUm,
    wavelengthNm: args.strongestIncomingWavelengthNm ?? 800,
  })
  const polarizationSummary = deriveBboPolarizationSummary({
    axisLocalDeg: args.component.config.bboCrystal.polarizationAxisLocalDeg,
    polarization,
  })

  return {
    metrics,
    polarizationSummary,
    strongestIncomingPowerMw: args.strongestIncomingPowerMw ?? 0,
  }
}

export function getBboReadout(args: {
  component: ComponentInstance
  scene: SceneDocument
  trace: BeamTraceResult
}) {
  const strongestEvent = getOpticInteractionSummary(args.trace, args.component.id)
    ?.interactions.slice()
    .sort((left, right) => right.incomingPowerMw - left.incomingPowerMw)[0]
  const incomingSource = args.scene.components.find(
    (item) => item.id === strongestEvent?.sourceComponentId,
  )

  return getBboInspectorReadout({
    beamSettings: args.scene.beamSettings,
    component: args.component,
    incomingPolarization: strongestEvent?.polarization,
    strongestIncomingBandwidthNm:
      incomingSource?.config.source?.bandwidthNm ??
      10,
    strongestIncomingPowerMw: strongestEvent?.incomingPowerMw,
    strongestIncomingWavelengthNm: strongestEvent?.wavelengthNm,
  })
}

export function classifyFilterClassTone(transmissionClass: FilterTransmissionClass) {
  switch (transmissionClass) {
    case 'passband':
      return 'pass'
    case 'partial':
      return 'partial'
    case 'stopband':
      return 'stop'
  }
}

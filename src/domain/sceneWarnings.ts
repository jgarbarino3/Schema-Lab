import { getResolvedComponentSpecForInstance } from './componentCatalog'
import { getGaussianPathAnalysis } from './gaussian'
import { inspectSceneComponentPlacement } from './placement'
import type {
  BeamTraceResult,
  GaussianTraceResult,
  SceneDocument,
  SceneWarning,
} from './types'

function createWarningId(parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(':')
}

export function deriveSceneWarnings(
  scene: SceneDocument,
  beamTrace: BeamTraceResult,
  gaussianTrace: GaussianTraceResult,
): SceneWarning[] {
  const warnings: SceneWarning[] = []

  for (const component of scene.components) {
    const spec = getResolvedComponentSpecForInstance(component)
    const placement = inspectSceneComponentPlacement(scene, component, spec)

    if (placement.reason === 'off-hole') {
      warnings.push({
        id: createWarningId(['placement', component.id, placement.reason]),
        category: 'mechanical',
        severity: 'warning',
        tier: 'simple',
        message: `${component.label} is off the breadboard hole field.`,
        componentId: component.id,
        highlightTarget: {
          componentIds: [component.id],
        },
      })
    }

    if (placement.reason === 'support-outside-board') {
      warnings.push({
        id: createWarningId(['placement', component.id, placement.reason]),
        category: 'mechanical',
        severity: 'critical',
        tier: 'simple',
        message: `${component.label} support extends outside the allowed board or source-lane region.`,
        componentId: component.id,
        highlightTarget: {
          componentIds: [component.id],
        },
      })
    }

    if (placement.reason === 'footprint-overhang') {
      warnings.push({
        id: createWarningId(['placement', component.id, placement.reason]),
        category: 'mechanical',
        severity: 'warning',
        tier: 'simple',
        message: `${component.label} footprint hangs outside the allowed region.`,
        componentId: component.id,
        highlightTarget: {
          componentIds: [component.id],
        },
      })
    }

    if (placement.reason === 'occupied' || placement.isOccupied) {
      warnings.push({
        id: createWarningId(['placement', component.id, 'occupied']),
        category: 'mechanical',
        severity: 'warning',
        tier: 'simple',
        message: `${component.label} overlaps another component's support envelope.`,
        componentId: component.id,
        highlightTarget: {
          componentIds: [component.id],
        },
      })
    }

    if (spec.mount.mode === 'clamp-capable' && !placement.isOnHole) {
      warnings.push({
        id: createWarningId(['placement', component.id, 'external-restraint']),
        category: 'mechanical',
        severity: 'warning',
        tier: 'simple',
        message: `${component.label} is off-hole and would need a clamp or other external restraint.`,
        componentId: component.id,
        highlightTarget: {
          componentIds: [component.id],
        },
      })
    }

    const source = component.config.source

    if (source?.isEnabled && source.firstTargetComponentId) {
      const targetHit = beamTrace.events.some(
        (event) =>
          event.sourceComponentId === component.id &&
          event.componentId === source.firstTargetComponentId,
      )

      if (!targetHit) {
        warnings.push({
          id: createWarningId(['source-target', component.id, source.firstTargetComponentId]),
          category: 'optical',
          severity: 'warning',
          tier: 'advanced',
          message: `${component.label} does not currently reach its chosen first target.`,
          componentId: component.id,
          sourceComponentId: component.id,
          highlightTarget: {
            componentIds: [component.id, source.firstTargetComponentId],
            sourceComponentIds: [component.id],
          },
        })
      }
    }

    if (component.config.delayLine) {
      const positionMm = component.config.delayLine.positionMm
      const travelMm = component.config.delayLine.travelMm

      if (positionMm < 0 || positionMm > travelMm) {
        warnings.push({
          id: createWarningId(['delay-range', component.id]),
          category: 'optical',
          severity: 'warning',
          tier: 'advanced',
          message: `${component.label} scan position is outside its configured travel range.`,
          componentId: component.id,
          highlightTarget: {
            componentIds: [component.id],
          },
        })
      }
    }

    if (component.type === 'telescope' && component.config.telescope) {
      const { element1Mm, element2Mm, separationMm } = component.config.telescope

      if (Math.abs(element1Mm) < 1e-6 || Math.abs(element2Mm) < 1e-6 || separationMm <= 0) {
        warnings.push({
          id: createWarningId(['telescope-config', component.id]),
          category: 'optical',
          severity: 'warning',
          tier: 'advanced',
          message: `${component.label} has an invalid telescope spacing or element value.`,
          componentId: component.id,
          highlightTarget: {
            componentIds: [component.id],
          },
        })
      }
    }

    if (component.type === 'opa-module' && component.config.opa) {
      const role = component.config.opa.role
      const interactions = beamTrace.events.filter((event) => event.componentId === component.id)
      const hasPump = interactions.some((event) => event.note?.includes('pump')) || !!component.config.opa.pumpLink?.sourceComponentId
      const hasSeed =
        interactions.some((event) => event.note?.includes('seed')) ||
        !!component.config.opa.seedLink?.sourceComponentId ||
        !!component.config.opa.signalLink?.sourceComponentId

      if ((role === 'combiner' || role === 'gain') && (!hasPump || !hasSeed)) {
        warnings.push({
          id: createWarningId(['opa-inputs', component.id]),
          category: 'optical',
          severity: 'warning',
          tier: 'advanced',
          message: `${component.label} is missing one or more required OPA inputs.`,
          componentId: component.id,
          highlightTarget: {
            componentIds: [component.id],
          },
        })
      }
    }
  }

  for (const componentWarning of gaussianTrace.componentWarnings) {
    if (componentWarning.strongestStatus !== 'overfill') {
      continue
    }

    const strongestInteraction =
      componentWarning.interactions.find(
        (interaction) => interaction.apertureStatus === 'overfill',
      ) ?? componentWarning.interactions[0]
    const path = getGaussianPathAnalysis(
      gaussianTrace,
      strongestInteraction?.pathId,
    )

    warnings.push({
      id: createWarningId(['gaussian-overfill', componentWarning.componentId]),
      category: 'optical',
      severity: 'critical',
      tier: 'advanced',
      message: `${componentWarning.componentLabel} is overfilled by the current Gaussian beam envelope.`,
      componentId: componentWarning.componentId,
      interactionId: strongestInteraction?.interactionId,
      pathId: strongestInteraction?.pathId ?? path?.pathId,
      sourceComponentId: path?.sourceComponentId,
      highlightTarget: {
        componentIds: [componentWarning.componentId],
        interactionIds: strongestInteraction?.interactionId
          ? [strongestInteraction.interactionId]
          : undefined,
        pathIds: strongestInteraction?.pathId ? [strongestInteraction.pathId] : undefined,
        sourceComponentIds: path?.sourceComponentId
          ? [path.sourceComponentId]
          : undefined,
      },
    })
  }

  for (const event of beamTrace.events) {
    const component = scene.components.find((item) => item.id === event.componentId)

    if (!component) {
      continue
    }

    const spec = getResolvedComponentSpecForInstance(component)
    const supportedWindow =
      'supportedWavelengthNm' in spec.physics ? spec.physics.supportedWavelengthNm : undefined

    if (
      supportedWindow &&
      (event.wavelengthNm < supportedWindow.minNm || event.wavelengthNm > supportedWindow.maxNm)
    ) {
      warnings.push({
        id: createWarningId(['wavelength-window', component.id, event.pathId]),
        category: 'optical',
        severity: 'warning',
        tier: 'advanced',
        message: `${component.label} is being used outside its nominal wavelength support window.`,
        componentId: component.id,
        interactionId: event.id,
        pathId: event.pathId,
        sourceComponentId: event.sourceComponentId,
        highlightTarget: {
          componentIds: [component.id],
          interactionIds: [event.id],
          pathIds: [event.pathId],
          sourceComponentIds: [event.sourceComponentId],
        },
      })
    }
  }

  return warnings
}

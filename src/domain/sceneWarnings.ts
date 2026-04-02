import { getResolvedComponentSpec } from './componentCatalog'
import { getGaussianPathAnalysis } from './gaussian'
import { inspectComponentPlacement } from './placement'
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
    const spec = getResolvedComponentSpec(component.type, component.variantId)
    const placement = inspectComponentPlacement(scene.breadboard, component, spec)

    if (placement.reason === 'off-hole') {
      warnings.push({
        id: createWarningId(['placement', component.id, placement.reason]),
        category: 'mechanical',
        severity: 'warning',
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

  return warnings
}

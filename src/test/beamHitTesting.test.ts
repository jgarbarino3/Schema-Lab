import { describe, expect, it } from 'vitest'
import { getNearestBeamSegmentHit } from '../canvas/beamHitTesting'
import { createBreadboardFromPreset } from '../domain/breadboardPresets'
import { traceSceneBeams } from '../domain/beamTracing'
import {
  createDefaultComponentConfig,
  getComponentDefinition,
} from '../domain/componentCatalog'
import { worldToScreen } from '../domain/geometry'
import { createEmptyScene } from '../domain/serialization'
import type { ComponentInstance, ComponentType, SceneDocument } from '../domain/types'

function makeComponent(
  type: ComponentType,
  overrides: Partial<ComponentInstance> = {},
): ComponentInstance {
  const definition = getComponentDefinition(type)

  return {
    id: overrides.id ?? `${type}-1`,
    type,
    label: overrides.label ?? definition.defaultLabel,
    variantId: overrides.variantId ?? definition.defaultVariantId,
    anchorMm: overrides.anchorMm ?? { x: 100, y: 100 },
    rotationQuarterTurns: overrides.rotationQuarterTurns ?? 0,
    config:
      overrides.config ??
      createDefaultComponentConfig(type, overrides.variantId ?? definition.defaultVariantId),
  }
}

function makeScene(components: ComponentInstance[]): SceneDocument {
  const scene = createEmptyScene()

  scene.workspace = {
    kind: 'single-breadboard',
    breadboard: createBreadboardFromPreset('metric-300-square'),
  }
  scene.components = components

  return scene
}

function makeEnabledSource() {
  const source = makeComponent('laser-source', {
    anchorMm: { x: -60, y: 137.5 },
  })

  return {
    ...source,
    config: {
      ...source.config,
      source: {
        ...source.config.source!,
        bandwidthNm: 10,
        isEnabled: true,
        normalizedPowerPercent: 100,
        powerMw: 100,
        wavelengthNm: 800,
      },
    },
  }
}

describe('beam hit testing', () => {
  it('chooses the nearest beam segment from a screen-space hit point', () => {
    const source = makeEnabledSource()
    const beamsplitter = makeComponent('beamsplitter', {
      id: 'bs-1',
      anchorMm: { x: 100, y: 137.5 },
      config: {
        ...createDefaultComponentConfig('beamsplitter'),
        beamSplitter: {
          lossPercent: 2,
          reflectPercent: 50,
        },
      },
    })
    const trace = traceSceneBeams(makeScene([source, beamsplitter]))
    const reflectedSegment = trace.segments.find(
      (segment) => segment.branchKind === 'reflected',
    )

    expect(reflectedSegment).toBeDefined()

    const viewport = {
      zoomPxPerMm: 2.4,
      cameraCenterMm: { x: 90, y: 137.5 },
      canvasSizePx: { width: 1200, height: 900 },
    }
    const startPx = worldToScreen(reflectedSegment!.startMm, viewport)
    const endPx = worldToScreen(reflectedSegment!.endMm, viewport)
    const hit = getNearestBeamSegmentHit(
      trace,
      viewport,
      {
        x: (startPx.x + endPx.x) / 2 + 3,
        y: (startPx.y + endPx.y) / 2 + 2,
      },
      18,
    )

    expect(hit?.segment.id).toBe(reflectedSegment?.id)
  })
})

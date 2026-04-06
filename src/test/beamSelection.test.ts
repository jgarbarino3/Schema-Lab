import { describe, expect, it } from 'vitest'
import { createBreadboardFromPreset } from '../domain/breadboardPresets'
import {
  getBeamSelectionSnapshot,
  getNearestBeamSegmentHit,
} from '../domain/beamSelection'
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

function makeEnabledSource(overrides: Partial<ComponentInstance> = {}) {
  const source = makeComponent('laser-source', {
    anchorMm: { x: -60, y: 137.5 },
    ...overrides,
  })

  return {
    ...source,
    config: {
      ...source.config,
      source: {
        ...source.config.source!,
        isEnabled: true,
        wavelengthNm: 800,
        bandwidthNm: 10,
        powerMw: 100,
        normalizedPowerPercent: 100,
      },
    },
  }
}

describe('beam selection snapshot', () => {
  it('resolves path and parent interaction from a selected segment id', () => {
    const source = makeEnabledSource()
    const beamsplitter = makeComponent('beamsplitter', {
      id: 'bs-1',
      anchorMm: { x: 100, y: 137.5 },
      config: {
        ...createDefaultComponentConfig('beamsplitter'),
        beamSplitter: {
          reflectPercent: 50,
          lossPercent: 2,
        },
      },
    })
    const trace = traceSceneBeams(makeScene([source, beamsplitter]))
    const reflectedSegment = trace.segments.find(
      (segment) => segment.branchKind === 'reflected',
    )

    expect(reflectedSegment).toBeDefined()

    const snapshot = getBeamSelectionSnapshot(trace, {
      segmentId: reflectedSegment?.id,
    })

    expect(snapshot.segment?.id).toBe(reflectedSegment?.id)
    expect(snapshot.path?.pathId).toBe(reflectedSegment?.pathId)
    expect(snapshot.interaction?.id).toBe(reflectedSegment?.parentInteractionId)
  })

  it('resolves path context from an interaction id without an explicit path id', () => {
    const source = makeEnabledSource()
    const detector = makeComponent('detector', {
      id: 'detector-1',
      anchorMm: { x: 180, y: 137.5 },
    })
    const trace = traceSceneBeams(makeScene([source, detector]))
    const captureEvent = trace.events.find(
      (event) => event.componentId === detector.id,
    )

    expect(captureEvent).toBeDefined()

    const snapshot = getBeamSelectionSnapshot(trace, {
      interactionId: captureEvent?.id,
    })

    expect(snapshot.interaction?.id).toBe(captureEvent?.id)
    expect(snapshot.path?.pathId).toBe(captureEvent?.pathId)
    expect(snapshot.segment?.id).toBeUndefined()
  })

  it('returns an empty snapshot for unknown ids', () => {
    const trace = traceSceneBeams(makeScene([makeEnabledSource()]))

    expect(
      getBeamSelectionSnapshot(trace, {
        segmentId: 'missing-segment',
        interactionId: 'missing-event',
        pathId: 'missing-path',
      }),
    ).toEqual({
      interaction: undefined,
      path: undefined,
      segment: undefined,
    })
  })

  it('chooses the nearest beam segment from a screen-space hit point', () => {
    const source = makeEnabledSource()
    const beamsplitter = makeComponent('beamsplitter', {
      id: 'bs-1',
      anchorMm: { x: 100, y: 137.5 },
      config: {
        ...createDefaultComponentConfig('beamsplitter'),
        beamSplitter: {
          reflectPercent: 50,
          lossPercent: 2,
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

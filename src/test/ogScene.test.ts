import { describe, expect, it } from 'vitest'
import { traceSceneBeams } from '../domain/beamTracing'
import { analyzeGaussianPaths } from '../domain/gaussian'
import { getOgSceneVariant, isOgModeSearch } from '../domain/ogMode'
import { createOgScene, OG_SELECTED_COMPONENT_ID } from '../domain/ogScene'
import { deriveSceneWarnings } from '../domain/sceneWarnings'

describe('OG scene', () => {
  it('builds a deterministic single-board scene for social capture', () => {
    const scene = createOgScene()

    expect(scene.metadata.name).toBe('Schema-Lab OG Scene')
    expect(scene.workspace.kind).toBe('single-breadboard')
    expect(scene.components.some((component) => component.id === OG_SELECTED_COMPONENT_ID)).toBe(true)
    expect(
      scene.components.map((component) => component.id),
    ).toEqual([
      'tutorial-attenuator',
      'tutorial-waveplate',
      'tutorial-polarizer',
      'tutorial-pickoff',
      'tutorial-pickoff-detector',
      'tutorial-mirror-lift',
      'tutorial-mirror-sample-rail',
      'tutorial-lens',
      'tutorial-iris',
      'tutorial-sample-holder',
      'tutorial-sample',
      'tutorial-detector',
      'tutorial-source',
    ])
    expect(scene.annotations).toHaveLength(1)
    expect(scene.annotations[0]?.kind).toBe('text')
    expect(scene.components.find((component) => component.id === 'tutorial-sample-holder')?.label).toBe(
      'BBO FROG Gate',
    )
    expect(scene.components.find((component) => component.id === 'tutorial-detector')?.label).toBe(
      'SHG Spectrometer',
    )
  })

  it('stays warning-clean and traces active beam paths', () => {
    const scene = createOgScene()
    const beamTrace = traceSceneBeams(scene)
    const gaussianTrace = analyzeGaussianPaths(scene, beamTrace)
    const warnings = deriveSceneWarnings(scene, beamTrace, gaussianTrace)
    const selectedWarnings = warnings.filter(
      (warning) => warning.componentId === OG_SELECTED_COMPONENT_ID,
    )
    const criticalWarnings = warnings.filter(
      (warning) => warning.severity === 'critical',
    )

    expect(beamTrace.pathSummaries.length).toBeGreaterThanOrEqual(2)
    expect(selectedWarnings).toEqual([])
    expect(criticalWarnings).toEqual([])
    expect(
      beamTrace.events
        .filter((event) => event.interactionKind === 'reflection')
        .map((event) => event.componentId),
    ).toEqual(['tutorial-mirror-lift', 'tutorial-mirror-sample-rail'])
    expect(
      beamTrace.events.some(
        (event) =>
          event.componentId === 'tutorial-pickoff-detector' &&
          event.interactionKind === 'terminal',
      ),
    ).toBe(true)
    expect(
      beamTrace.events.some(
        (event) =>
          event.componentId === 'tutorial-detector' &&
          event.interactionKind === 'terminal',
      ),
    ).toBe(true)
  })
})

describe('OG mode query detection', () => {
  it('matches only the intended hidden query flag', () => {
    expect(isOgModeSearch('?og=1')).toBe(true)
    expect(isOgModeSearch('?foo=bar&og=1')).toBe(true)
    expect(isOgModeSearch('?og=0')).toBe(false)
    expect(isOgModeSearch('')).toBe(false)
  })

  it('parses the optional OG scene variant', () => {
    expect(getOgSceneVariant('?og=1')).toBe('tutorial')
    expect(getOgSceneVariant('?og=1&og-scene=tutorial')).toBe('tutorial')
    expect(getOgSceneVariant('?og=1&og-scene=other')).toBe('tutorial')
    expect(getOgSceneVariant('?og=1&og-scene=hero')).toBe('hero')
  })
})

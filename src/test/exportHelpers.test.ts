import { describe, expect, it } from 'vitest'
import { createDefaultComponentConfig, getComponentDefinition } from '../domain/componentCatalog'
import { traceSceneBeams } from '../domain/beamTracing'
import { createSceneDxf } from '../domain/dxfExport'
import { analyzeGaussianPaths } from '../domain/gaussian'
import { createSingleImagePptxBlob } from '../domain/pptxExport'
import { createEmptyScene } from '../domain/serialization'
import { createSceneSvg } from '../domain/svgExport'
import { createTutorialScene, TUTORIAL_FOCUS_COMPONENT_ID } from '../domain/tutorialScene'

describe('export helpers', () => {
  it('creates mm-native layered SVG output from resolved scene geometry', () => {
    const scene = createEmptyScene()
    const mirrorDefinition = getComponentDefinition('mirror')

    scene.components.push({
      id: 'mirror-1',
      type: 'mirror',
      label: 'Mirror 1',
      variantId: mirrorDefinition.defaultVariantId,
      anchorMm: { x: 125, y: 125 },
      rotationQuarterTurns: 0,
      config: createDefaultComponentConfig('mirror'),
    })

    const beamTrace = traceSceneBeams(scene)
    const gaussianTrace = analyzeGaussianPaths(scene, beamTrace)
    const svgMarkup = createSceneSvg({
      beamTrace,
      gaussianTrace,
      renderMode: 'realistic',
      scene,
      scope: 'breadboard-only',
      showGaussianEnvelope: false,
    })

    expect(svgMarkup).toContain('<svg')
    expect(svgMarkup).toContain('width="370mm"')
    expect(svgMarkup).toContain('id="breadboards-layer"')
    expect(svgMarkup).toContain('id="components-layer"')
    expect(svgMarkup).toContain('Mirror 1')
  })

  it('creates DXF output with millimeter units and layout layers', () => {
    const scene = createEmptyScene()
    const mirrorDefinition = getComponentDefinition('mirror')

    scene.components.push({
      id: 'mirror-1',
      type: 'mirror',
      label: 'Mirror 1',
      variantId: mirrorDefinition.defaultVariantId,
      anchorMm: { x: 125, y: 125 },
      rotationQuarterTurns: 0,
      config: createDefaultComponentConfig('mirror'),
    })

    const beamTrace = traceSceneBeams(scene)
    const gaussianTrace = analyzeGaussianPaths(scene, beamTrace)
    const dxfMarkup = createSceneDxf({
      beamTrace,
      gaussianTrace,
      renderMode: 'realistic',
      scene,
      scope: 'breadboard-only',
      showGaussianEnvelope: false,
    })

    expect(dxfMarkup).toContain('$INSUNITS')
    expect(dxfMarkup).toContain('TABLE')
    expect(dxfMarkup).toContain('BREADBOARD')
    expect(dxfMarkup).toContain('COMPONENTS')
  })

  it('creates a deterministic tutorial scene with the expected focus component', () => {
    const scene = createTutorialScene()

    expect(scene.workspace.kind).toBe('single-breadboard')
    if (scene.workspace.kind !== 'single-breadboard') {
      throw new Error('Tutorial scene should stay in single-breadboard mode')
    }
    expect(scene.workspace.breadboard.widthMm).toBe(425)
    expect(
      scene.components.some((component) => component.id === TUTORIAL_FOCUS_COMPONENT_ID),
    ).toBe(true)
    expect(
      scene.components.filter((component) => component.config.source?.isEnabled).length,
    ).toBe(2)
  })

  it('packages a raster image into a PPTX blob', async () => {
    const pngDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9lJawAAAAASUVORK5CYII='

    const blob = await createSingleImagePptxBlob(pngDataUrl)
    const bytes = new Uint8Array(await blob.arrayBuffer())

    expect(blob.type).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    )
    expect(String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0)).toBe('PK')
  })
})

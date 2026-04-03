import { describe, expect, it } from 'vitest'
import { createDefaultComponentConfig, getComponentDefinition } from '../domain/componentCatalog'
import { traceSceneBeams } from '../domain/beamTracing'
import { createExportViewport } from '../domain/exportLayout'
import { analyzeGaussianPaths } from '../domain/gaussian'
import { createSingleImagePptxBlob } from '../domain/pptxExport'
import { createEmptyScene } from '../domain/serialization'
import { createSceneSvg } from '../domain/svgExport'

describe('export helpers', () => {
  it('creates layered SVG output from resolved scene geometry', () => {
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
    const viewport = createExportViewport(scene, 'breadboard-only', {
      width: 1800,
      height: 1200,
    })
    const svgMarkup = createSceneSvg({
      beamTrace,
      gaussianTrace,
      renderMode: 'realistic',
      scene,
      scope: 'breadboard-only',
      showGaussianEnvelope: false,
      viewport,
    })

    expect(svgMarkup).toContain('<svg')
    expect(svgMarkup).toContain('id="breadboard-layer"')
    expect(svgMarkup).toContain('id="component-layer"')
    expect(svgMarkup).toContain('Mirror 1')
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

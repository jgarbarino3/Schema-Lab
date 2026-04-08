import { describe, expect, it } from 'vitest'
import { createDefaultComponentConfig, getComponentDefinition } from '../domain/componentCatalog'
import { traceSceneBeams } from '../domain/beamTracing'
import { createSceneDxf } from '../domain/dxfExport'
import { analyzeGaussianPaths } from '../domain/gaussian'
import { createSingleImagePptxBlob } from '../domain/pptxExport'
import { createEmptyScene } from '../domain/serialization'
import { createSceneSvg } from '../domain/svgExport'
import { createTutorialScene, TUTORIAL_FOCUS_COMPONENT_ID } from '../domain/tutorialScene'
import { convertSceneToOpticalTable, createBreadboardInstance } from '../domain/workspace'
import { createBreadboardFromPreset } from '../domain/breadboardPresets'

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

  it('exports text and shape annotations in SVG and DXF output', () => {
    const scene = createEmptyScene()
    scene.annotations = [
      {
        id: 'text-1',
        kind: 'text',
        anchorMm: { x: 38, y: 42 },
        widthMm: 64,
        text: 'Pump note',
        style: {
          fontFamily: 'clean-sans',
          fontSizeMm: 5.4,
          color: '#ffeeaa',
          bold: true,
          italic: true,
          underline: true,
          align: 'left',
        },
      },
      {
        id: 'shape-1',
        kind: 'shape',
        shapeKind: 'rectangle',
        boundsMm: {
          x: 32,
          y: 34,
          width: 92,
          height: 20,
        },
        strokeColor: '#00eeff',
        fillColor: 'transparent',
        strokeWidthMm: 1,
      },
      {
        id: 'shape-2',
        kind: 'shape',
        shapeKind: 'arrow',
        startMm: { x: 124, y: 92 },
        endMm: { x: 170, y: 120 },
        strokeColor: '#ff00ff',
        fillColor: '#ff00ff',
        strokeWidthMm: 1,
      },
    ]

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
    const dxfMarkup = createSceneDxf({
      beamTrace,
      gaussianTrace,
      renderMode: 'realistic',
      scene,
      scope: 'breadboard-only',
      showGaussianEnvelope: false,
    })

    expect(svgMarkup).toContain('Pump note')
    expect(svgMarkup).toContain('font-style="italic"')
    expect(svgMarkup).toContain('id="shape-1"')
    expect(svgMarkup).toContain('shape-2-head')
    expect(dxfMarkup).toContain('Pump note')
    expect(dxfMarkup).toContain('LWPOLYLINE')
    expect(dxfMarkup).toContain('TEXT')
  })

  it('does not emit source-lane visuals in optical-table SVG exports', () => {
    const scene = convertSceneToOpticalTable(createEmptyScene())

    if (scene.workspace.kind !== 'optical-table') {
      throw new Error('expected optical-table workspace')
    }

    scene.workspace.breadboards.push(
      createBreadboardInstance({
        id: 'breadboard-2',
        label: 'Breadboard 2',
        model: createBreadboardFromPreset('metric-300-square'),
        anchorMm: { x: 2280, y: 520 },
      }),
    )

    scene.components.push({
      id: 'laser-1',
      type: 'laser-source',
      label: 'Laser Source 1',
      variantId: 'compact-table-source',
      anchorMm: { x: 420, y: 360 },
      hostSurfaceId: 'optical-table',
      rotationQuarterTurns: 0,
      config: createDefaultComponentConfig('laser-source', 'compact-table-source'),
    })

    const beamTrace = traceSceneBeams(scene)
    const gaussianTrace = analyzeGaussianPaths(scene, beamTrace)
    const svgMarkup = createSceneSvg({
      beamTrace,
      gaussianTrace,
      renderMode: 'realistic',
      scene,
      scope: 'full-scheme',
      showGaussianEnvelope: false,
    })

    expect(svgMarkup).toContain('<svg')
    expect(svgMarkup).not.toContain('Source Lane')
    expect(svgMarkup).not.toContain('source-lanes-layer')
    expect(svgMarkup).not.toContain('sources at ±')
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

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
import {
  DEFAULT_SIMPLE_ICON_STYLE,
  type BeamSegment,
  type BeamTraceResult,
  type GaussianSegmentAnalysis,
  type GaussianTraceResult,
  type PolarizationSnapshot,
} from '../domain/types'

const DEFAULT_POLARIZATION: PolarizationSnapshot = {
  basis: 'ray-local',
  dominantAxis: 'in-plane',
  inPlaneAmplitude: 1,
  inPlaneFraction: 1,
  outOfPlaneAmplitude: 0,
  outOfPlaneFraction: 0,
  presetId: 'linear-in-plane',
  relativePhaseDeg: 0,
  tag: 'Linear in-plane',
}

function makeBeamSegment(
  id: string,
  sourceComponentId: string,
  startMm: { x: number; y: number },
  endMm: { x: number; y: number },
): BeamSegment {
  const lengthMm = Math.hypot(endMm.x - startMm.x, endMm.y - startMm.y)

  return {
    id,
    attenuationClass: 'normal',
    bandwidthNm: 10,
    beamDiameterMm: 2,
    beamId: `${id}-beam`,
    branchKind: 'root',
    directionMm: {
      x: lengthMm > 0 ? (endMm.x - startMm.x) / lengthMm : 1,
      y: lengthMm > 0 ? (endMm.y - startMm.y) / lengthMm : 0,
    },
    effectiveOpticalLengthMm: lengthMm,
    endMm,
    generation: 0,
    geometricLengthMm: lengthMm,
    internalOpticalPathMm: 0,
    opticalPathMm: lengthMm,
    outcomeClass: 'escaped',
    pathId: `${id}-path`,
    pathRole: 'fundamental',
    polarization: DEFAULT_POLARIZATION,
    powerMw: 10,
    powerPercent: 100,
    sourceComponentId,
    startMm,
    status: 'escaped',
    timeDelayFs: 0,
    wavelengthNm: 800,
  }
}

function makeGaussianSegmentAnalysis(segment: BeamSegment): GaussianSegmentAnalysis {
  const localReadout = {
    beamDiameterMm: 2,
    q: { realMm: 0, imagMm: 1 },
    rayleighRangeMm: 100,
    spotRadiusMm: 1,
    waistOffsetMm: 0,
    waistRadiusMm: 1,
    wavelengthNm: segment.wavelengthNm,
  }

  return {
    segmentId: segment.id,
    effectiveOpticalLengthMm: segment.effectiveOpticalLengthMm,
    end: localReadout,
    endDistanceMm: segment.geometricLengthMm,
    endTimeDelayFs: 0,
    geometricLengthMm: segment.geometricLengthMm,
    internalOpticalPathMm: 0,
    lengthMm: segment.geometricLengthMm,
    pathId: segment.pathId,
    sourceComponentId: segment.sourceComponentId,
    start: localReadout,
    startDistanceMm: 0,
    startTimeDelayFs: 0,
  }
}

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
      simpleIconStyle: DEFAULT_SIMPLE_ICON_STYLE,
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
      simpleIconStyle: DEFAULT_SIMPLE_ICON_STYLE,
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
        backgroundColor: 'rgba(18, 27, 35, 0.94)',
        borderColor: '#75abc5',
        hidden: false,
        layerBand: 'above-components',
        locked: false,
        widthMm: 64,
        text: 'Pump note',
        variant: 'note-card',
        style: {
          fontFamily: 'clean-sans',
          fontSizeMm: 5.4,
          color: '#ffeeaa',
          bold: true,
          italic: true,
          underline: true,
          align: 'left',
        },
        zIndex: 0,
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
        hidden: false,
        layerBand: 'above-components',
        locked: false,
        strokeWidthMm: 1,
        zIndex: 1,
      },
      {
        id: 'shape-2',
        kind: 'shape',
        shapeKind: 'arrow',
        startMm: { x: 124, y: 92 },
        endMm: { x: 170, y: 120 },
        strokeColor: '#ff00ff',
        fillColor: '#ff00ff',
        hidden: false,
        layerBand: 'above-components',
        locked: false,
        strokeWidthMm: 1,
        zIndex: 2,
      },
    ]

    const beamTrace = traceSceneBeams(scene)
    const gaussianTrace = analyzeGaussianPaths(scene, beamTrace)
    const svgMarkup = createSceneSvg({
      beamTrace,
      gaussianTrace,
      renderMode: 'realistic',
      scene,
      simpleIconStyle: DEFAULT_SIMPLE_ICON_STYLE,
      scope: 'breadboard-only',
      showGaussianEnvelope: false,
    })
    const dxfMarkup = createSceneDxf({
      beamTrace,
      gaussianTrace,
      renderMode: 'realistic',
      scene,
      simpleIconStyle: DEFAULT_SIMPLE_ICON_STYLE,
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
      simpleIconStyle: DEFAULT_SIMPLE_ICON_STYLE,
      scope: 'full-scheme',
      showGaussianEnvelope: false,
    })

    expect(svgMarkup).toContain('<svg')
    expect(svgMarkup).not.toContain('Source Lane')
    expect(svgMarkup).not.toContain('source-lanes-layer')
    expect(svgMarkup).not.toContain('sources at ±')
  })

  it('scopes breadboard-only SVG export to the selected breadboard', () => {
    const scene = convertSceneToOpticalTable(createEmptyScene())

    if (scene.workspace.kind !== 'optical-table') {
      throw new Error('expected optical-table workspace')
    }

    const primaryBreadboard = scene.workspace.breadboards[0]
    if (!primaryBreadboard) {
      throw new Error('expected primary breadboard')
    }

    scene.workspace.breadboards.push(
      createBreadboardInstance({
        id: 'breadboard-2',
        label: 'Breadboard 2',
        model: createBreadboardFromPreset('metric-300-square'),
        anchorMm: { x: 2280, y: 520 },
      }),
    )

    const mirrorDefinition = getComponentDefinition('mirror')
    scene.components = [
      {
        id: 'mirror-on-board-1',
        type: 'mirror',
        label: 'M1',
        variantId: mirrorDefinition.defaultVariantId,
        anchorMm: {
          x: primaryBreadboard.anchorMm.x + 100,
          y: primaryBreadboard.anchorMm.y + 100,
        },
        hostSurfaceId: primaryBreadboard.id,
        rotationQuarterTurns: 0,
        config: createDefaultComponentConfig('mirror'),
      },
      {
        id: 'mirror-on-board-2',
        type: 'mirror',
        label: 'M2',
        variantId: mirrorDefinition.defaultVariantId,
        anchorMm: { x: 2355, y: 595 },
        hostSurfaceId: 'breadboard-2',
        rotationQuarterTurns: 0,
        config: createDefaultComponentConfig('mirror'),
      },
    ]
    scene.annotations = [
      {
        id: 'inside-note',
        kind: 'text',
        anchorMm: {
          x: primaryBreadboard.anchorMm.x + 40,
          y: primaryBreadboard.anchorMm.y + 45,
        },
        backgroundColor: 'transparent',
        borderColor: '#000000',
        hidden: false,
        layerBand: 'above-components',
        locked: false,
        text: 'Inside board 1',
        variant: 'plain',
        widthMm: 60,
        style: {
          align: 'left',
          bold: false,
          color: '#111111',
          fontFamily: 'clean-sans',
          fontSizeMm: 5,
          italic: false,
          underline: false,
        },
        zIndex: 0,
      },
      {
        id: 'outside-note',
        kind: 'text',
        anchorMm: { x: 2340, y: 565 },
        backgroundColor: 'transparent',
        borderColor: '#000000',
        hidden: false,
        layerBand: 'above-components',
        locked: false,
        text: 'Outside board 2',
        variant: 'plain',
        widthMm: 60,
        style: {
          align: 'left',
          bold: false,
          color: '#111111',
          fontFamily: 'clean-sans',
          fontSizeMm: 5,
          italic: false,
          underline: false,
        },
        zIndex: 0,
      },
    ]

    const insideSegment = makeBeamSegment(
      'inside-segment',
      'mirror-on-board-1',
      { x: primaryBreadboard.anchorMm.x + 30, y: primaryBreadboard.anchorMm.y + 85 },
      { x: primaryBreadboard.anchorMm.x + 230, y: primaryBreadboard.anchorMm.y + 85 },
    )
    const outsideSegment = makeBeamSegment(
      'outside-segment',
      'mirror-on-board-2',
      { x: 2310, y: 585 },
      { x: 2450, y: 585 },
    )
    const beamTrace: BeamTraceResult = {
      events: [],
      opticInteractionSummaries: [],
      pathSummaries: [],
      segments: [insideSegment, outsideSegment],
      summaries: [],
      terminalCaptures: [],
    }
    const gaussianTrace: GaussianTraceResult = {
      componentWarnings: [],
      interactionAnalyses: [],
      pathAnalyses: [],
      segmentAnalyses: [
        makeGaussianSegmentAnalysis(insideSegment),
        makeGaussianSegmentAnalysis(outsideSegment),
      ],
      sources: [],
    }

    const svgMarkup = createSceneSvg({
      beamTrace,
      breadboardSurfaceId: primaryBreadboard.id,
      gaussianTrace,
      renderMode: 'realistic',
      scene,
      simpleIconStyle: DEFAULT_SIMPLE_ICON_STYLE,
      scope: 'breadboard-only',
      showGaussianEnvelope: true,
    })

    expect(svgMarkup).toContain('M1')
    expect(svgMarkup).toContain('Inside board 1')
    expect(svgMarkup).toContain('beam-inside-segment')
    expect(svgMarkup).toContain('gaussian-inside-segment')
    expect(svgMarkup).not.toContain('M2')
    expect(svgMarkup).not.toContain('Outside board 2')
    expect(svgMarkup).not.toContain('beam-outside-segment')
    expect(svgMarkup).not.toContain('gaussian-outside-segment')
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

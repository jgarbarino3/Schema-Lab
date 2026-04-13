import { describe, expect, it } from 'vitest'
import {
  applyAutoCalibrationToWorkspaceConfig,
  autoCalibrateRasterImport,
  autoCalibrateSvgImport,
} from '../domain/importAutoCalibration'
import type {
  RasterImportDocument,
  SvgImportDocument,
  SvgImportElement,
  SvgImportWorkspaceConfig,
  SvgImportWorkspaceDetection,
} from '../domain/svgImport'

function makeHoleElement(id: string, centerX: number, centerY: number): SvgImportElement {
  const radius = 2
  return {
    bounds: {
      x: centerX - radius,
      y: centerY - radius,
      width: radius * 2,
      height: radius * 2,
    },
    center: { x: centerX, y: centerY },
    hints: [],
    id,
    isClosed: true,
    kind: 'circle',
    points: [
      { x: centerX - radius, y: centerY },
      { x: centerX, y: centerY - radius },
      { x: centerX + radius, y: centerY },
      { x: centerX, y: centerY + radius },
      { x: centerX - radius, y: centerY },
    ],
    polylines: [[
      { x: centerX - radius, y: centerY },
      { x: centerX, y: centerY - radius },
      { x: centerX + radius, y: centerY },
      { x: centerX, y: centerY + radius },
      { x: centerX - radius, y: centerY },
    ]],
    rotationDeg: 0,
    segments: [],
  }
}

function makeSvgGridDocument(): {
  detection: SvgImportWorkspaceDetection
  document: SvgImportDocument
  workspaceConfig: SvgImportWorkspaceConfig
} {
  const boardBounds = { x: 0, y: 0, width: 350, height: 350 }
  const elements: SvgImportElement[] = []

  for (let row = 0; row < 14; row += 1) {
    for (let column = 0; column < 14; column += 1) {
      elements.push(
        makeHoleElement(
          `hole-${row}-${column}`,
          12.5 + column * 25,
          12.5 + row * 25,
        ),
      )
    }
  }

  return {
    detection: {
      breadboardCandidates: [
        {
          boundsUnits: boardBounds,
          centerUnits: { x: 175, y: 175 },
          confidence: 0.9,
          containedElementIds: elements.map((element) => element.id),
          holeGridEvidence: elements.length,
          id: 'board-1',
          kind: 'breadboard',
          nestingDepth: 0,
          outlinePoints: [
            { x: 0, y: 0 },
            { x: 350, y: 0 },
            { x: 350, y: 350 },
            { x: 0, y: 350 },
            { x: 0, y: 0 },
          ],
          rectilinearScore: 1,
          rotationDeg: 0,
          sourceElementIds: [],
        },
      ],
      orphanElementIds: [],
      warnings: [],
      workspaceKind: 'single-breadboard',
    },
    document: {
      bounds: boardBounds,
      elements,
      scale: {
        baseMmPerUnit: 1,
        isReliable: false,
        sourceUnit: 'mm',
      },
      sourceKind: 'svg',
      svgText: '<svg />',
    },
    workspaceConfig: {
      workspaceKind: 'single-breadboard',
      breadboards: [
        {
          boundsUnits: boardBounds,
          id: 'breadboard-1',
          kind: 'breadboard',
          label: 'Breadboard',
          physicalHeightMm: 300,
          physicalWidthMm: 300,
        },
      ],
    },
  }
}

function makeRasterDocument(width: number, height: number): RasterImportDocument {
  return {
    bounds: { x: 0, y: 0, width, height },
    imageDataUrl: 'data:image/png;base64,stub',
    imageHeightPx: height,
    imageWidthPx: width,
    scale: {
      baseMmPerUnit: 1,
      isReliable: false,
      sourceUnit: 'px',
    },
    sourceKind: 'raster',
  }
}

describe('import auto calibration', () => {
  it('infers SVG breadboard scale from a repeated hole grid', () => {
    const seed = makeSvgGridDocument()
    const result = autoCalibrateSvgImport(seed)

    expect(result).toBeDefined()
    expect(result?.gridColumnCount).toBe(14)
    expect(result?.gridRowCount).toBe(14)
    expect(result?.inferredMmPerUnit).toBeCloseTo(1, 4)
    expect(result?.suggestedPhysicalWidthMm).toBe(350)
    expect(result?.suggestedPhysicalHeightMm).toBe(350)
  })

  it('fits a raster hole lattice for clean top-down breadboard images', () => {
    const width = 160
    const height = 160
    const data = new Uint8ClampedArray(width * height * 4)

    for (let index = 0; index < width * height; index += 1) {
      const offset = index * 4
      data[offset] = 150
      data[offset + 1] = 150
      data[offset + 2] = 150
      data[offset + 3] = 255
    }

    for (let row = 0; row < 7; row += 1) {
      for (let column = 0; column < 7; column += 1) {
        const centerX = 20 + column * 20
        const centerY = 20 + row * 20

        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const x = centerX + offsetX
            const y = centerY + offsetY
            const pixelIndex = (y * width + x) * 4
            data[pixelIndex] = 20
            data[pixelIndex + 1] = 20
            data[pixelIndex + 2] = 20
          }
        }
      }
    }

    const result = autoCalibrateRasterImport({
      document: makeRasterDocument(width, height),
      imageData: {
        data,
        height,
        width,
      } as ImageData,
    })

    expect(result).toBeDefined()
    expect(result?.gridColumnCount).toBe(7)
    expect(result?.gridRowCount).toBe(7)
    expect(result?.inferredMmPerUnit).toBeCloseTo(1.25, 2)
    expect(result?.confidence).toBeGreaterThan(0.7)
  })

  it('applies an auto-calibration suggestion back onto the workspace config', () => {
    const seed = makeSvgGridDocument()
    const result = autoCalibrateSvgImport(seed)

    if (!result) {
      throw new Error('expected svg auto calibration result')
    }

    const nextConfig = applyAutoCalibrationToWorkspaceConfig({
      result,
      workspaceConfig: seed.workspaceConfig,
    })

    expect(nextConfig.breadboards[0].physicalWidthMm).toBe(350)
    expect(nextConfig.breadboards[0].physicalHeightMm).toBe(350)
    expect(nextConfig.breadboards[0].boundsUnits).toEqual(result.surfaceBounds)
  })
})

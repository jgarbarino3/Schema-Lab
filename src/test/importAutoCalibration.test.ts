import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
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

function decodePngFixture(relativePath: string) {
  const buffer = readFileSync(new URL(relativePath, import.meta.url))
  const signature = buffer.subarray(0, 8)
  const expectedSignature = Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
  ])

  expect(signature.equals(expectedSignature)).toBe(true)

  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idatChunks: Buffer[] = []

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    offset += length + 12

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === 'IDAT') {
      idatChunks.push(data)
    } else if (type === 'IEND') {
      break
    }
  }

  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`Unsupported PNG fixture format: bitDepth=${bitDepth}, colorType=${colorType}`)
  }

  const compressed = Buffer.concat(idatChunks)
  const inflated = inflateSync(compressed)
  const bytesPerPixel = 4
  const stride = width * bytesPerPixel
  const decoded = new Uint8ClampedArray(width * height * bytesPerPixel)
  let sourceOffset = 0

  const paethPredictor = (left: number, up: number, upLeft: number) => {
    const predictor = left + up - upLeft
    const leftDistance = Math.abs(predictor - left)
    const upDistance = Math.abs(predictor - up)
    const upLeftDistance = Math.abs(predictor - upLeft)

    if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
      return left
    }
    if (upDistance <= upLeftDistance) {
      return up
    }
    return upLeft
  }

  for (let row = 0; row < height; row += 1) {
    const filterType = inflated[sourceOffset]
    sourceOffset += 1
    const rowStart = row * stride

    for (let column = 0; column < stride; column += 1) {
      const raw = inflated[sourceOffset]
      sourceOffset += 1
      const left = column >= bytesPerPixel ? decoded[rowStart + column - bytesPerPixel] : 0
      const up = row > 0 ? decoded[rowStart + column - stride] : 0
      const upLeft =
        row > 0 && column >= bytesPerPixel
          ? decoded[rowStart + column - stride - bytesPerPixel]
          : 0

      decoded[rowStart + column] =
        filterType === 0
          ? raw
          : filterType === 1
            ? (raw + left) & 0xff
            : filterType === 2
              ? (raw + up) & 0xff
              : filterType === 3
                ? (raw + Math.floor((left + up) / 2)) & 0xff
                : (raw + paethPredictor(left, up, upLeft)) & 0xff
    }
  }

  return {
    data: decoded,
    height,
    width,
  }
}

function makeSvgFixtureSeed(relativePath: string) {
  const svgText = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  const rects = [...svgText.matchAll(/<rect[^>]*x="([^"]+)"[^>]*y="([^"]+)"[^>]*width="([^"]+)"[^>]*height="([^"]+)"/g)]
    .map((match) => ({
      height: Number(match[4]),
      width: Number(match[3]),
      x: Number(match[1]),
      y: Number(match[2]),
    }))
    .filter(
      (rect) =>
        Number.isFinite(rect.x) &&
        Number.isFinite(rect.y) &&
        Number.isFinite(rect.width) &&
        Number.isFinite(rect.height),
    )
  const boardBounds =
    rects
      .filter((rect) => rect.x > 0 && rect.y > 0)
      .sort((left, right) => right.width * right.height - left.width * left.height)[0] ?? {
      height: 560,
      width: 1120,
      x: 280,
      y: 120,
    }
  const elements = [...svgText.matchAll(/<circle[^>]*cx="([^"]+)"[^>]*cy="([^"]+)"[^>]*r="([^"]+)"/g)]
    .map((match, index) =>
      makeHoleElement(
        `fixture-hole-${index}`,
        Number(match[1]),
        Number(match[2]),
      ),
    )
    .filter(
      (element) =>
        element.center.x >= boardBounds.x &&
        element.center.x <= boardBounds.x + boardBounds.width &&
        element.center.y >= boardBounds.y &&
        element.center.y <= boardBounds.y + boardBounds.height,
    )

  const detection: SvgImportWorkspaceDetection = {
    breadboardCandidates: [
      {
        boundsUnits: boardBounds,
        centerUnits: {
          x: boardBounds.x + boardBounds.width / 2,
          y: boardBounds.y + boardBounds.height / 2,
        },
        confidence: 0.92,
        containedElementIds: elements.map((element) => element.id),
        holeGridEvidence: elements.length,
        id: 'fixture-board-1',
        kind: 'breadboard',
        nestingDepth: 0,
        outlinePoints: [
          { x: boardBounds.x, y: boardBounds.y },
          { x: boardBounds.x + boardBounds.width, y: boardBounds.y },
          {
            x: boardBounds.x + boardBounds.width,
            y: boardBounds.y + boardBounds.height,
          },
          { x: boardBounds.x, y: boardBounds.y + boardBounds.height },
          { x: boardBounds.x, y: boardBounds.y },
        ],
        rectilinearScore: 1,
        rotationDeg: 0,
        sourceElementIds: [],
      },
    ],
    orphanElementIds: [],
    warnings: [],
    workspaceKind: 'single-breadboard',
  }
  const document: SvgImportDocument = {
    bounds: boardBounds,
    elements,
    scale: {
      baseMmPerUnit: 1,
      isReliable: false,
      sourceUnit: 'px',
    },
    sourceKind: 'svg',
    svgText,
  }
  const workspaceConfig: SvgImportWorkspaceConfig = {
    workspaceKind: 'single-breadboard',
    breadboards: [
      {
        boundsUnits: boardBounds,
        id: 'breadboard-1',
        kind: 'breadboard',
        label: 'Breadboard',
        physicalHeightMm: 300,
        physicalWidthMm: 600,
      },
    ],
  }

  return {
    detection,
    document,
    workspaceConfig,
  }
}

describe('import auto calibration', () => {
  it('infers SVG breadboard scale from a repeated hole grid', () => {
    const seed = makeSvgGridDocument()
    const result = autoCalibrateSvgImport(seed)

    expect(result).toBeDefined()
    expect(result?.visibleGridColumnCount).toBe(14)
    expect(result?.visibleGridRowCount).toBe(14)
    expect(result?.gridColumnCount).toBe(14)
    expect(result?.gridRowCount).toBe(14)
    expect(result?.inferredMmPerUnit).toBeCloseTo(1, 4)
    expect(result?.suggestedPhysicalWidthMm).toBe(350)
    expect(result?.suggestedPhysicalHeightMm).toBe(350)
  })

  it('fits a raster hole lattice for clean top-down breadboard images', () => {
    const width = 700
    const height = 700
    const data = new Uint8ClampedArray(width * height * 4)

    for (let index = 0; index < width * height; index += 1) {
      const offset = index * 4
      data[offset] = 246
      data[offset + 1] = 247
      data[offset + 2] = 248
      data[offset + 3] = 255
    }

    for (let y = 70; y < 630; y += 1) {
      for (let x = 70; x < 630; x += 1) {
        const pixelIndex = (y * width + x) * 4
        data[pixelIndex] = 200
        data[pixelIndex + 1] = 204
        data[pixelIndex + 2] = 209
      }
    }

    for (let row = 0; row < 14; row += 1) {
      for (let column = 0; column < 14; column += 1) {
        const centerX = 90 + column * 40
        const centerY = 90 + row * 40

        for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
          for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
            const x = centerX + offsetX
            const y = centerY + offsetY
            const pixelIndex = (y * width + x) * 4
            data[pixelIndex] = 235
            data[pixelIndex + 1] = 235
            data[pixelIndex + 2] = 235
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
    expect(result?.visibleGridColumnCount).toBe(14)
    expect(result?.visibleGridRowCount).toBe(14)
    expect(result?.gridColumnCount).toBe(14)
    expect(result?.gridRowCount).toBe(14)
    expect(result?.inferredMmPerUnit).toBeCloseTo(0.625, 2)
    expect(result?.confidence).toBeGreaterThan(0.7)
  })

  it('infers the full board from an occluded week1 SVG fixture', () => {
    const fixture = makeSvgFixtureSeed('./fixtures/zscan_800_week1_power_only.svg')
    const result = autoCalibrateSvgImport(fixture)

    expect(result).toBeDefined()
    expect(result?.visibleGridColumnCount).toBe(22)
    expect(result?.visibleGridRowCount).toBe(11)
    expect(result?.gridColumnCount).toBe(24)
    expect(result?.gridRowCount).toBe(12)
    expect(result?.suggestedPhysicalWidthMm).toBe(600)
    expect(result?.suggestedPhysicalHeightMm).toBe(300)
    expect(result?.surfaceBounds.width).toBeCloseTo(
      (result?.gridColumnCount ?? 0) * (result?.pitchSourceUnits ?? 0),
      5,
    )
    expect(result?.note).toMatch(/Visible hole fit found 22 × 11/i)
  })

  it('ignores decorative circles and still infers the full board', () => {
    const seed = makeSvgGridDocument()
    const decoratedDocument: SvgImportDocument = {
      ...seed.document,
      elements: [
        ...seed.document.elements,
        makeHoleElement('decorative-a', 100, 100),
        makeHoleElement('decorative-b', 101.5, 150),
        makeHoleElement('decorative-c', 178.5, 225),
      ],
    }
    const result = autoCalibrateSvgImport({
      detection: seed.detection,
      document: decoratedDocument,
      workspaceConfig: seed.workspaceConfig,
    })

    expect(result).toBeDefined()
    expect(result?.visibleGridColumnCount).toBe(14)
    expect(result?.visibleGridRowCount).toBe(14)
    expect(result?.gridColumnCount).toBe(14)
    expect(result?.gridRowCount).toBe(14)
  })

  it('infers the full board from the provided PNG fixture', () => {
    const imageData = decodePngFixture('./fixtures/zscan_800_week1_power_only.png')
    const result = autoCalibrateRasterImport({
      document: makeRasterDocument(imageData.width, imageData.height),
      imageData: imageData as ImageData,
    })

    expect(result).toBeDefined()
    expect(result?.gridColumnCount).toBe(24)
    expect(result?.gridRowCount).toBe(12)
    expect(result?.suggestedPhysicalWidthMm).toBe(600)
    expect(result?.suggestedPhysicalHeightMm).toBe(300)
    expect(result?.visibleGridColumnCount).toBeGreaterThanOrEqual(20)
    expect(result?.visibleGridRowCount).toBeGreaterThanOrEqual(4)
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

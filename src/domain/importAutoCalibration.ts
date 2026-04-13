import { roundMm } from './geometry'
import type { BoundsMm, Vector2Mm } from './types'
import type {
  ImportSourceKind,
  RasterImportDocument,
  SvgImportDocument,
  SvgImportWorkspaceConfig,
  SvgImportWorkspaceDetection,
} from './svgImport'

export const DEFAULT_IMPORT_HOLE_PITCH_MM = 25

export interface ImportAutoCalibrationResult {
  confidence: number
  detectedHoleCount: number
  gridColumnCount: number
  gridRowCount: number
  holeCenters: Vector2Mm[]
  inferredMmPerUnit: number
  note?: string
  pitchSourceUnits: number
  sourceKind: ImportSourceKind
  surfaceBounds: BoundsMm
  suggestedPhysicalHeightMm: number
  suggestedPhysicalWidthMm: number
}

interface HoleGridFit {
  confidence: number
  gridColumnCount: number
  gridRowCount: number
  note?: string
  pitchSourceUnits: number
  surfaceBounds: BoundsMm
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function boundsContainPoint(bounds: BoundsMm, point: Vector2Mm, padding = 0) {
  return (
    point.x >= bounds.x - padding &&
    point.x <= bounds.x + bounds.width + padding &&
    point.y >= bounds.y - padding &&
    point.y <= bounds.y + bounds.height + padding
  )
}

function median(values: number[]) {
  if (values.length === 0) {
    return undefined
  }

  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function clusterAxisValues(values: number[], tolerance: number) {
  if (values.length === 0) {
    return []
  }

  const sorted = [...values].sort((left, right) => left - right)
  const clusters: Array<{ center: number; values: number[] }> = [
    { center: sorted[0], values: [sorted[0]] },
  ]

  for (let index = 1; index < sorted.length; index += 1) {
    const value = sorted[index]
    const currentCluster = clusters[clusters.length - 1]

    if (Math.abs(value - currentCluster.center) <= tolerance) {
      currentCluster.values.push(value)
      currentCluster.center =
        currentCluster.values.reduce((sum, sample) => sum + sample, 0) /
        currentCluster.values.length
      continue
    }

    clusters.push({ center: value, values: [value] })
  }

  return clusters
}

function computeSpacingUniformity(spacings: number[], pitch: number) {
  if (spacings.length === 0 || pitch <= 1e-6) {
    return 0
  }

  const meanRelativeDeviation =
    spacings.reduce((sum, spacing) => sum + Math.abs(spacing - pitch) / pitch, 0) /
    spacings.length

  return clamp01(1 - meanRelativeDeviation * 2.2)
}

function roundAutoSizeMm(lengthMm: number) {
  const rawMm = Math.max(DEFAULT_IMPORT_HOLE_PITCH_MM, lengthMm)

  if (rawMm >= 200) {
    return roundMm(Math.round(rawMm / 25) * 25)
  }

  return roundMm(Math.round(rawMm / 5) * 5)
}

function fitHoleGrid(args: {
  candidateBounds?: BoundsMm
  points: Vector2Mm[]
}): HoleGridFit | undefined {
  const { candidateBounds, points } = args

  if (points.length < 12) {
    return undefined
  }

  const workingBounds =
    candidateBounds ??
    {
      x: Math.min(...points.map((point) => point.x)),
      y: Math.min(...points.map((point) => point.y)),
      width:
        Math.max(...points.map((point) => point.x)) -
        Math.min(...points.map((point) => point.x)),
      height:
        Math.max(...points.map((point) => point.y)) -
        Math.min(...points.map((point) => point.y)),
    }
  const pitchGuess =
    Math.min(workingBounds.width, workingBounds.height) /
    Math.max(4, Math.sqrt(points.length))
  const tolerance = Math.max(0.8, pitchGuess * 0.24)
  const xClusters = clusterAxisValues(
    points.map((point) => point.x),
    tolerance,
  )
  const yClusters = clusterAxisValues(
    points.map((point) => point.y),
    tolerance,
  )

  if (xClusters.length < 4 || yClusters.length < 4) {
    return undefined
  }

  const xSpacings = xClusters
    .slice(1)
    .map((cluster, index) => cluster.center - xClusters[index].center)
    .filter((spacing) => spacing > tolerance * 1.2)
  const ySpacings = yClusters
    .slice(1)
    .map((cluster, index) => cluster.center - yClusters[index].center)
    .filter((spacing) => spacing > tolerance * 1.2)
  const xPitch = median(xSpacings)
  const yPitch = median(ySpacings)

  if (!xPitch || !yPitch) {
    return undefined
  }

  const axisMismatch = Math.abs(xPitch - yPitch) / Math.max(xPitch, yPitch, 1e-6)
  if (axisMismatch > 0.26) {
    return undefined
  }

  const pitchSourceUnits = (xPitch + yPitch) / 2
  const uniformity = Math.min(
    computeSpacingUniformity(xSpacings, pitchSourceUnits),
    computeSpacingUniformity(ySpacings, pitchSourceUnits),
  )
  const occupancy =
    points.length / Math.max(1, xClusters.length * yClusters.length)
  const countConfidence = clamp01(
    Math.min(xClusters.length, yClusters.length) / 10,
  )
  const confidence = clamp01(
    uniformity * 0.56 +
      clamp01(occupancy) * 0.24 +
      countConfidence * 0.2,
  )
  const derivedBounds = {
    x: xClusters[0].center - pitchSourceUnits / 2,
    y: yClusters[0].center - pitchSourceUnits / 2,
    width:
      xClusters[xClusters.length - 1].center - xClusters[0].center + pitchSourceUnits,
    height:
      yClusters[yClusters.length - 1].center - yClusters[0].center + pitchSourceUnits,
  }

  return {
    confidence,
    gridColumnCount: xClusters.length,
    gridRowCount: yClusters.length,
    note:
      confidence < 0.74
        ? 'Hole grid confidence is low. Confirm the inferred sizes before importing.'
        : undefined,
    pitchSourceUnits,
    surfaceBounds: candidateBounds ?? derivedBounds,
  }
}

function buildResult(args: {
  fit: HoleGridFit
  holeCenters: Vector2Mm[]
  sourceKind: ImportSourceKind
}): ImportAutoCalibrationResult {
  const { fit, holeCenters, sourceKind } = args
  const inferredMmPerUnit =
    DEFAULT_IMPORT_HOLE_PITCH_MM / fit.pitchSourceUnits

  return {
    confidence: fit.confidence,
    detectedHoleCount: holeCenters.length,
    gridColumnCount: fit.gridColumnCount,
    gridRowCount: fit.gridRowCount,
    holeCenters,
    inferredMmPerUnit,
    note: fit.note,
    pitchSourceUnits: fit.pitchSourceUnits,
    sourceKind,
    surfaceBounds: fit.surfaceBounds,
    suggestedPhysicalHeightMm: roundAutoSizeMm(
      fit.surfaceBounds.height * inferredMmPerUnit,
    ),
    suggestedPhysicalWidthMm: roundAutoSizeMm(
      fit.surfaceBounds.width * inferredMmPerUnit,
    ),
  }
}

export function autoCalibrateSvgImport(args: {
  detection: SvgImportWorkspaceDetection
  document: SvgImportDocument
  workspaceConfig: SvgImportWorkspaceConfig
}): ImportAutoCalibrationResult | undefined {
  const { detection, document, workspaceConfig } = args
  const boardSurface =
    workspaceConfig.breadboards[0] ??
    (detection.breadboardCandidates[0]
      ? {
          boundsUnits: detection.breadboardCandidates[0].boundsUnits,
        }
      : undefined)

  if (!boardSurface) {
    return undefined
  }

  const candidateBounds = boardSurface.boundsUnits
  const candidateArea = Math.max(
    candidateBounds.width * candidateBounds.height,
    1e-6,
  )
  const maxHoleArea = candidateArea * 0.003
  const maxHoleEdge = Math.max(
    4,
    Math.min(candidateBounds.width, candidateBounds.height) * 0.075,
  )
  const holeCenters = document.elements
    .filter((element) => {
      const area = Math.max(element.bounds.width * element.bounds.height, 1e-6)
      const aspectRatio =
        Math.max(element.bounds.width, element.bounds.height) /
        Math.max(1e-6, Math.min(element.bounds.width, element.bounds.height))

      return (
        element.isClosed &&
        boundsContainPoint(candidateBounds, element.center, 1.2) &&
        element.bounds.width <= maxHoleEdge &&
        element.bounds.height <= maxHoleEdge &&
        area <= maxHoleArea &&
        aspectRatio <= 1.45
      )
    })
    .map((element) => element.center)

  const fit = fitHoleGrid({
    candidateBounds,
    points: holeCenters,
  })

  if (!fit) {
    return undefined
  }

  return buildResult({
    fit,
    holeCenters,
    sourceKind: 'svg',
  })
}

export function detectRasterHoleCenters(args: {
  data: Uint8ClampedArray
  height: number
  width: number
}): Vector2Mm[] {
  const { data, height, width } = args
  const intensities = new Float32Array(width * height)

  for (let index = 0; index < width * height; index += 1) {
    const pixelOffset = index * 4
    intensities[index] =
      data[pixelOffset] * 0.2126 +
      data[pixelOffset + 1] * 0.7152 +
      data[pixelOffset + 2] * 0.0722
  }

  const candidateMask = new Uint8Array(width * height)

  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      let neighborhoodSum = 0

      for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
        for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
          neighborhoodSum +=
            intensities[(y + offsetY) * width + (x + offsetX)]
        }
      }

      const localMean = neighborhoodSum / 25
      const intensity = intensities[y * width + x]

      if (intensity <= localMean - 15) {
        candidateMask[y * width + x] = 1
      }
    }
  }

  const visited = new Uint8Array(width * height)
  const centers: Vector2Mm[] = []
  const maxComponentArea = Math.max(
    10,
    Math.round((width * height) * 0.0012),
  )

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startIndex = y * width + x
      if (candidateMask[startIndex] === 0 || visited[startIndex] === 1) {
        continue
      }

      const queue = [startIndex]
      visited[startIndex] = 1
      let area = 0
      let minX = x
      let maxX = x
      let minY = y
      let maxY = y
      let sumX = 0
      let sumY = 0

      while (queue.length > 0) {
        const current = queue.pop()
        if (current === undefined) {
          continue
        }

        const currentX = current % width
        const currentY = Math.floor(current / width)
        area += 1
        minX = Math.min(minX, currentX)
        maxX = Math.max(maxX, currentX)
        minY = Math.min(minY, currentY)
        maxY = Math.max(maxY, currentY)
        sumX += currentX
        sumY += currentY

        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            if (offsetX === 0 && offsetY === 0) {
              continue
            }

            const neighborX = currentX + offsetX
            const neighborY = currentY + offsetY

            if (
              neighborX < 0 ||
              neighborX >= width ||
              neighborY < 0 ||
              neighborY >= height
            ) {
              continue
            }

            const neighborIndex = neighborY * width + neighborX
            if (
              candidateMask[neighborIndex] === 1 &&
              visited[neighborIndex] === 0
            ) {
              visited[neighborIndex] = 1
              queue.push(neighborIndex)
            }
          }
        }
      }

      const componentWidth = maxX - minX + 1
      const componentHeight = maxY - minY + 1
      const aspectRatio =
        Math.max(componentWidth, componentHeight) /
        Math.max(1, Math.min(componentWidth, componentHeight))
      const maxEdge = Math.max(componentWidth, componentHeight)

      if (
        area >= 4 &&
        area <= maxComponentArea &&
        aspectRatio <= 1.8 &&
        maxEdge <= Math.max(16, Math.min(width, height) * 0.04)
      ) {
        centers.push({
          x: sumX / area,
          y: sumY / area,
        })
      }
    }
  }

  return centers
}

export function autoCalibrateRasterImport(args: {
  document: RasterImportDocument
  imageData: ImageData
}): ImportAutoCalibrationResult | undefined {
  const { document, imageData } = args
  const holeCenters = detectRasterHoleCenters({
    data: imageData.data,
    height: imageData.height,
    width: imageData.width,
  })
  const fit = fitHoleGrid({
    points: holeCenters,
  })

  if (!fit) {
    return undefined
  }

  return buildResult({
    fit,
    holeCenters,
    sourceKind: document.sourceKind,
  })
}

export function rescaleAutoCalibrationResult(
  result: ImportAutoCalibrationResult,
  scaleFactor: number,
): ImportAutoCalibrationResult {
  if (Math.abs(scaleFactor - 1) <= 1e-6) {
    return result
  }

  return {
    ...result,
    holeCenters: result.holeCenters.map((point) => ({
      x: point.x / scaleFactor,
      y: point.y / scaleFactor,
    })),
    inferredMmPerUnit: result.inferredMmPerUnit * scaleFactor,
    pitchSourceUnits: result.pitchSourceUnits / scaleFactor,
    surfaceBounds: {
      x: result.surfaceBounds.x / scaleFactor,
      y: result.surfaceBounds.y / scaleFactor,
      width: result.surfaceBounds.width / scaleFactor,
      height: result.surfaceBounds.height / scaleFactor,
    },
  }
}

function cloneWorkspaceConfig(
  config: SvgImportWorkspaceConfig,
): SvgImportWorkspaceConfig {
  return JSON.parse(JSON.stringify(config)) as SvgImportWorkspaceConfig
}

export function applyAutoCalibrationToWorkspaceConfig(args: {
  result: ImportAutoCalibrationResult
  workspaceConfig: SvgImportWorkspaceConfig
}): SvgImportWorkspaceConfig {
  const { result } = args
  const nextConfig = cloneWorkspaceConfig(args.workspaceConfig)
  const mmPerUnit = result.inferredMmPerUnit

  if (nextConfig.breadboards[0]) {
    nextConfig.breadboards[0].boundsUnits = result.surfaceBounds
    nextConfig.breadboards[0].physicalWidthMm =
      result.suggestedPhysicalWidthMm
    nextConfig.breadboards[0].physicalHeightMm =
      result.suggestedPhysicalHeightMm
  }

  if (nextConfig.table) {
    nextConfig.table.physicalWidthMm = roundAutoSizeMm(
      nextConfig.table.boundsUnits.width * mmPerUnit,
    )
    nextConfig.table.physicalHeightMm = roundAutoSizeMm(
      nextConfig.table.boundsUnits.height * mmPerUnit,
    )
  }

  nextConfig.breadboards = nextConfig.breadboards.map((surface, index) =>
    index === 0
      ? surface
      : {
          ...surface,
          physicalWidthMm: roundAutoSizeMm(
            surface.boundsUnits.width * mmPerUnit,
          ),
          physicalHeightMm: roundAutoSizeMm(
            surface.boundsUnits.height * mmPerUnit,
          ),
        },
  )

  return nextConfig
}

export function createRasterImportWorkspaceDetection(args: {
  autoCalibration?: ImportAutoCalibrationResult
  document: RasterImportDocument
}): SvgImportWorkspaceDetection {
  const { autoCalibration, document } = args

  if (autoCalibration) {
    return {
      breadboardCandidates: [
        {
          boundsUnits: autoCalibration.surfaceBounds,
          centerUnits: {
            x:
              autoCalibration.surfaceBounds.x +
              autoCalibration.surfaceBounds.width / 2,
            y:
              autoCalibration.surfaceBounds.y +
              autoCalibration.surfaceBounds.height / 2,
          },
          confidence: autoCalibration.confidence,
          containedElementIds: [],
          holeGridEvidence: autoCalibration.detectedHoleCount,
          id: 'raster-breadboard-1',
          kind: 'breadboard',
          nestingDepth: 0,
          outlinePoints: [
            {
              x: autoCalibration.surfaceBounds.x,
              y: autoCalibration.surfaceBounds.y,
            },
            {
              x:
                autoCalibration.surfaceBounds.x +
                autoCalibration.surfaceBounds.width,
              y: autoCalibration.surfaceBounds.y,
            },
            {
              x:
                autoCalibration.surfaceBounds.x +
                autoCalibration.surfaceBounds.width,
              y:
                autoCalibration.surfaceBounds.y +
                autoCalibration.surfaceBounds.height,
            },
            {
              x: autoCalibration.surfaceBounds.x,
              y:
                autoCalibration.surfaceBounds.y +
                autoCalibration.surfaceBounds.height,
            },
            {
              x: autoCalibration.surfaceBounds.x,
              y: autoCalibration.surfaceBounds.y,
            },
          ],
          rectilinearScore: 0.9,
          rotationDeg: 0,
          sourceElementIds: [],
        },
      ],
      orphanElementIds: [],
      warnings:
        autoCalibration.confidence < 0.74
          ? [
              autoCalibration.note ??
                'Auto-calibration found a weak hole grid. Confirm the proposed surface size.',
            ]
          : [],
      workspaceKind: 'single-breadboard',
    }
  }

  return {
    breadboardCandidates: [
      {
        boundsUnits: document.bounds,
        centerUnits: {
          x: document.bounds.x + document.bounds.width / 2,
          y: document.bounds.y + document.bounds.height / 2,
        },
        confidence: 0.2,
        containedElementIds: [],
        holeGridEvidence: 0,
        id: 'raster-document-bounds',
        kind: 'breadboard',
        nestingDepth: 0,
        outlinePoints: [
          { x: document.bounds.x, y: document.bounds.y },
          {
            x: document.bounds.x + document.bounds.width,
            y: document.bounds.y,
          },
          {
            x: document.bounds.x + document.bounds.width,
            y: document.bounds.y + document.bounds.height,
          },
          {
            x: document.bounds.x,
            y: document.bounds.y + document.bounds.height,
          },
          { x: document.bounds.x, y: document.bounds.y },
        ],
        rectilinearScore: 0.35,
        rotationDeg: 0,
        sourceElementIds: [],
      },
    ],
    orphanElementIds: [],
    warnings: [
      'Raster drawings do not carry reliable physical units. Use auto-calibration or enter exact sizes manually.',
    ],
    workspaceKind: 'single-breadboard',
  }
}

export function createInitialRasterImportWorkspaceConfig(args: {
  autoCalibration?: ImportAutoCalibrationResult
  document: RasterImportDocument
}): SvgImportWorkspaceConfig {
  const { autoCalibration, document } = args

  if (autoCalibration) {
    return {
      workspaceKind: 'single-breadboard',
      breadboards: [
        {
          boundsUnits: autoCalibration.surfaceBounds,
          id: 'breadboard-1',
          kind: 'breadboard',
          label: 'Breadboard',
          physicalHeightMm: autoCalibration.suggestedPhysicalHeightMm,
          physicalWidthMm: autoCalibration.suggestedPhysicalWidthMm,
        },
      ],
    }
  }

  const widthMm = 350
  const aspectRatio =
    document.bounds.width > 0
      ? document.bounds.height / document.bounds.width
      : 1

  return {
    workspaceKind: 'single-breadboard',
    breadboards: [
      {
        boundsUnits: document.bounds,
        id: 'breadboard-1',
        kind: 'breadboard',
        label: 'Breadboard',
        physicalHeightMm: roundAutoSizeMm(widthMm * aspectRatio),
        physicalWidthMm: widthMm,
      },
    ],
  }
}

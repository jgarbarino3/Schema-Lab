import { getComponentDefinition } from './componentCatalog'
import type { ImportAutoCalibrationResult } from './importAutoCalibration'
import type { BoundsMm, Vector2Mm } from './types'

export interface RasterImportCandidate {
  bounds: BoundsMm
  center: Vector2Mm
  id: string
  label: string
  suggestions: Array<{
    componentType: ReturnType<typeof getComponentDefinition>['type']
    confidence: number
    reason: string
    source: 'heuristic'
  }>
}

interface ConnectedComponent {
  maxX: number
  maxY: number
  minX: number
  minY: number
  pixelCount: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function createMask(imageData: ImageData, calibration?: ImportAutoCalibrationResult) {
  const { data, height, width } = imageData
  const mask = new Uint8Array(width * height)
  const boardBounds = calibration?.surfaceBounds ?? {
    x: 0,
    y: 0,
    width,
    height,
  }
  const boardMinX = clamp(Math.floor(boardBounds.x), 0, width - 1)
  const boardMaxX = clamp(Math.ceil(boardBounds.x + boardBounds.width), 0, width)
  const boardMinY = clamp(Math.floor(boardBounds.y), 0, height - 1)
  const boardMaxY = clamp(Math.ceil(boardBounds.y + boardBounds.height), 0, height)
  const holeRadius = calibration?.pitchSourceUnits
    ? Math.max(1.6, calibration.pitchSourceUnits * 0.19)
    : 0

  for (let y = boardMinY; y < boardMaxY; y += 1) {
    for (let x = boardMinX; x < boardMaxX; x += 1) {
      const offset = (y * width + x) * 4
      const r = data[offset]
      const g = data[offset + 1]
      const b = data[offset + 2]
      const alpha = data[offset + 3]

      if (alpha < 32) {
        continue
      }

      const maxChannel = Math.max(r, g, b)
      const minChannel = Math.min(r, g, b)
      const channelSpread = maxChannel - minChannel
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
      const isColored =
        maxChannel >= 110 &&
        channelSpread >= 42 &&
        !(luma > 215 && channelSpread < 64)

      if (!isColored) {
        continue
      }

      mask[y * width + x] = 1
    }
  }

  if (calibration && holeRadius > 0 && calibration.holeCenters.length > 0) {
    const squaredRadius = holeRadius * holeRadius
    for (const center of calibration.holeCenters) {
      const minX = clamp(Math.floor(center.x - holeRadius), 0, width - 1)
      const maxX = clamp(Math.ceil(center.x + holeRadius), 0, width - 1)
      const minY = clamp(Math.floor(center.y - holeRadius), 0, height - 1)
      const maxY = clamp(Math.ceil(center.y + holeRadius), 0, height - 1)

      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const dx = x - center.x
          const dy = y - center.y
          if (dx * dx + dy * dy <= squaredRadius) {
            mask[y * width + x] = 0
          }
        }
      }
    }
  }

  return {
    boardBounds: {
      x: boardMinX,
      y: boardMinY,
      width: Math.max(1, boardMaxX - boardMinX),
      height: Math.max(1, boardMaxY - boardMinY),
    },
    mask,
  }
}

function dilate(mask: Uint8Array, width: number, height: number, passes = 1) {
  let current = mask

  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.slice()

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x

        if (current[index]) {
          continue
        }

        if (
          current[index - 1] ||
          current[index + 1] ||
          current[index - width] ||
          current[index + width]
        ) {
          next[index] = 1
        }
      }
    }

    current = next
  }

  return current
}

function findConnectedComponents(mask: Uint8Array, width: number) {
  const visited = new Uint8Array(mask.length)
  const components: ConnectedComponent[] = []

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || visited[index]) {
      continue
    }

    const queue = [index]
    visited[index] = 1
    let minX = index % width
    let maxX = minX
    let minY = Math.floor(index / width)
    let maxY = minY
    let pixelCount = 0

    while (queue.length > 0) {
      const current = queue.pop()!
      const x = current % width
      const y = Math.floor(current / width)
      pixelCount += 1
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)

      const neighbors = [
        current - 1,
        current + 1,
        current - width,
        current + width,
      ]

      for (const neighbor of neighbors) {
        if (neighbor < 0 || neighbor >= mask.length) {
          continue
        }

        const neighborX = neighbor % width
        const neighborY = Math.floor(neighbor / width)
        if (Math.abs(neighborX - x) + Math.abs(neighborY - y) !== 1) {
          continue
        }

        if (!mask[neighbor] || visited[neighbor]) {
          continue
        }

        visited[neighbor] = 1
        queue.push(neighbor)
      }
    }

    components.push({
      maxX,
      maxY,
      minX,
      minY,
      pixelCount,
    })
  }

  return components
}

function buildSuggestions(width: number, height: number) {
  const aspectRatio = width / Math.max(height, 1)
  const nearSquare = aspectRatio >= 0.7 && aspectRatio <= 1.45
  const wideRect = aspectRatio >= 1.7
  const tallRect = aspectRatio <= 0.58
  const suggestions: RasterImportCandidate['suggestions'] = []

  if (wideRect) {
    suggestions.push({
      componentType: 'sample-holder',
      confidence: 0.34,
      reason: 'Wide compact raster cluster resembles a mounted stage or holder.',
      source: 'heuristic',
    })
    suggestions.push({
      componentType: 'delay-stage',
      confidence: 0.22,
      reason: 'Wide elongated cluster may be a translation or delay stage body.',
      source: 'heuristic',
    })
  } else if (nearSquare) {
    suggestions.push({
      componentType: 'mirror',
      confidence: 0.28,
      reason: 'Compact near-square raster cluster resembles a mounted optic.',
      source: 'heuristic',
    })
    suggestions.push({
      componentType: 'beamsplitter',
      confidence: 0.2,
      reason: 'Compact near-square raster cluster may be a splitter symbol.',
      source: 'heuristic',
    })
  } else if (tallRect) {
    suggestions.push({
      componentType: 'detector',
      confidence: 0.2,
      reason: 'Tall compact raster cluster may be a detector or pickup target.',
      source: 'heuristic',
    })
  } else {
    suggestions.push({
      componentType: 'iris',
      confidence: 0.18,
      reason: 'Compact raster cluster may be a generic optic footprint.',
      source: 'heuristic',
    })
  }

  return suggestions
}

export function detectRasterImportCandidates(args: {
  autoCalibration?: ImportAutoCalibrationResult
  imageData: ImageData
}): RasterImportCandidate[] {
  const { autoCalibration, imageData } = args
  const { width, height } = imageData
  const { boardBounds, mask } = createMask(imageData, autoCalibration)
  const dilatedMask = dilate(mask, width, height, 1)
  const components = findConnectedComponents(dilatedMask, width)
  const boardArea = Math.max(1, boardBounds.width * boardBounds.height)

  return components
    .filter((component) => {
      const candidateWidth = component.maxX - component.minX + 1
      const candidateHeight = component.maxY - component.minY + 1
      const area = candidateWidth * candidateHeight
      const density = component.pixelCount / Math.max(area, 1)
      const aspectRatio = candidateWidth / Math.max(candidateHeight, 1)
      const relativeArea = area / boardArea

      if (component.pixelCount < 18 || area < 36) {
        return false
      }

      if (relativeArea > 0.22) {
        return false
      }

      if (candidateWidth < 6 || candidateHeight < 6) {
        return false
      }

      if (aspectRatio > 7 && candidateHeight < 16) {
        return false
      }

      if (aspectRatio < 0.14 && candidateWidth < 16) {
        return false
      }

      if (density > 0.88 && area > 450) {
        return false
      }

      return true
    })
    .sort((left, right) => left.minX - right.minX)
    .map((component, index) => {
      const bounds = {
        x: component.minX,
        y: component.minY,
        width: component.maxX - component.minX + 1,
        height: component.maxY - component.minY + 1,
      }

      return {
        bounds,
        center: {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        },
        id: `raster-candidate-${index + 1}`,
        label: `Candidate ${index + 1}`,
        suggestions: buildSuggestions(bounds.width, bounds.height),
      } satisfies RasterImportCandidate
    })
}

export function rescaleRasterImportCandidates(
  candidates: RasterImportCandidate[],
  scaleFactor: number,
) {
  if (Math.abs(scaleFactor - 1) <= 1e-6) {
    return candidates
  }

  return candidates.map((candidate) => ({
    ...candidate,
    bounds: {
      x: candidate.bounds.x / scaleFactor,
      y: candidate.bounds.y / scaleFactor,
      width: candidate.bounds.width / scaleFactor,
      height: candidate.bounds.height / scaleFactor,
    },
    center: {
      x: candidate.center.x / scaleFactor,
      y: candidate.center.y / scaleFactor,
    },
  }))
}

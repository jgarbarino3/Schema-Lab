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
  const boardPadding = calibration?.pitchSourceUnits
    ? Math.max(6, calibration.pitchSourceUnits * 0.8)
    : 8
  const boardMinX = clamp(Math.floor(boardBounds.x - boardPadding), 0, width - 1)
  const boardMaxX = clamp(
    Math.ceil(boardBounds.x + boardBounds.width + boardPadding),
    0,
    width,
  )
  const boardMinY = clamp(Math.floor(boardBounds.y - boardPadding), 0, height - 1)
  const boardMaxY = clamp(
    Math.ceil(boardBounds.y + boardBounds.height + boardPadding),
    0,
    height,
  )
  const holeRadiusFactor = calibration?.sourceKind === 'raster' ? 0.11 : 0.19
  const holeRadius = calibration?.pitchSourceUnits
    ? Math.max(1.2, calibration.pitchSourceUnits * holeRadiusFactor)
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
      const leftOffset = offset - (x > 0 ? 4 : 0)
      const rightOffset = offset + (x < width - 1 ? 4 : 0)
      const topOffset = offset - (y > 0 ? width * 4 : 0)
      const bottomOffset = offset + (y < height - 1 ? width * 4 : 0)
      const localContrast = Math.max(
        Math.abs(luma - (0.2126 * data[leftOffset] + 0.7152 * data[leftOffset + 1] + 0.0722 * data[leftOffset + 2])),
        Math.abs(luma - (0.2126 * data[rightOffset] + 0.7152 * data[rightOffset + 1] + 0.0722 * data[rightOffset + 2])),
        Math.abs(luma - (0.2126 * data[topOffset] + 0.7152 * data[topOffset + 1] + 0.0722 * data[topOffset + 2])),
        Math.abs(luma - (0.2126 * data[bottomOffset] + 0.7152 * data[bottomOffset + 1] + 0.0722 * data[bottomOffset + 2])),
      )
      const isCoolColored =
        maxChannel >= 92 &&
        channelSpread >= 20 &&
        (b - r >= 16 || g - r >= 14)
      const isNeutralStroke =
        channelSpread <= 42 &&
        localContrast >= 26 &&
        (luma <= 150 || luma >= 164)
      const isWarmBeamLike =
        maxChannel >= 120 &&
        channelSpread >= 30 &&
        ((r > g + 22 && r > b + 36) ||
          (r > 150 && g > 110 && b < 150 && r - b > 28))
      const isColored =
        maxChannel >= 110 &&
        channelSpread >= 42 &&
        !(luma > 215 && channelSpread < 64)

      if (!((isColored && !isWarmBeamLike) || isCoolColored || isNeutralStroke)) {
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

function buildSuggestions(width: number, height: number, density: number) {
  const aspectRatio = width / Math.max(height, 1)
  const nearSquare = aspectRatio >= 0.72 && aspectRatio <= 1.38
  const wideRect = aspectRatio >= 1.75
  const tallRect = aspectRatio <= 0.58
  const suggestions: RasterImportCandidate['suggestions'] = []

  if (nearSquare) {
    suggestions.push({
      componentType: 'mirror',
      confidence: density <= 0.42 ? 0.64 : 0.56,
      reason: 'Compact square raster cluster resembles a mounted mirror symbol.',
      source: 'heuristic',
    })
    suggestions.push({
      componentType: 'beamsplitter',
      confidence: density <= 0.42 ? 0.46 : 0.36,
      reason: 'Compact square raster cluster may be a beamsplitter symbol.',
      source: 'heuristic',
    })
    if (density <= 0.34) {
      suggestions.push({
        componentType: 'iris',
        confidence: 0.42,
        reason: 'Low-density square raster cluster may be an iris or aperture symbol.',
        source: 'heuristic',
      })
    }
  } else if (tallRect) {
    suggestions.push({
      componentType: 'attenuator',
      confidence: 0.52,
      reason: 'Tall compact raster cluster resembles a variable attenuator symbol.',
      source: 'heuristic',
    })
    suggestions.push({
      componentType: 'detector',
      confidence: 0.3,
      reason: 'Tall compact raster cluster may be a detector or pickup symbol.',
      source: 'heuristic',
    })
  } else if (wideRect) {
    suggestions.push({
      componentType: aspectRatio >= 2.7 ? 'filter' : 'translation-stage',
      confidence: aspectRatio >= 2.7 ? 0.46 : 0.38,
      reason:
        aspectRatio >= 2.7
          ? 'Wide elongated raster cluster resembles a filter or attenuator body.'
          : 'Wide compact raster cluster resembles a translation-stage body.',
      source: 'heuristic',
    })
    suggestions.push({
      componentType: 'support-hardware',
      confidence: 0.28,
      reason: 'Wide elongated raster cluster may be support hardware rather than an optic.',
      source: 'heuristic',
    })
  } else {
    suggestions.push({
      componentType: 'iris',
      confidence: 0.24,
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
  const dilatedMask = dilate(
    mask,
    width,
    height,
    autoCalibration?.sourceKind === 'raster' ? 0 : 1,
  )
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

      if (component.pixelCount < 10 || area < 20) {
        return false
      }

      if (relativeArea > 0.32) {
        return false
      }

      if (candidateWidth < 4 || candidateHeight < 4) {
        return false
      }

      if (aspectRatio > 10 && candidateHeight < 24) {
        return false
      }

      if (aspectRatio < 0.1 && candidateWidth < 24) {
        return false
      }

      if (density > 0.88 && area > 450) {
        return false
      }

      if (density < 0.06 && area > 900) {
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
      const area = bounds.width * bounds.height
      const density = component.pixelCount / Math.max(area, 1)

      return {
        bounds,
        center: {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        },
        id: `raster-candidate-${index + 1}`,
        label: `Candidate ${index + 1}`,
        suggestions: buildSuggestions(bounds.width, bounds.height, density),
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

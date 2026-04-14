import { BREADBOARD_PRESETS } from './breadboardPresets'
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

type BoardInferenceSource =
  | 'bounds-extrapolation'
  | 'preset-snap'
  | 'visible-grid'

export interface ImportAutoCalibrationResult {
  boardInferenceConfidence: number
  confidence: number
  detectedHoleCount: number
  gridColumnCount: number
  gridRowCount: number
  holeCenters: Vector2Mm[]
  inferredMmPerUnit: number
  inferenceSource: BoardInferenceSource
  latticeConfidence: number
  note?: string
  pitchSourceUnits: number
  sourceKind: ImportSourceKind
  surfaceBounds: BoundsMm
  suggestedPhysicalHeightMm: number
  suggestedPhysicalWidthMm: number
  visibleGridColumnCount: number
  visibleGridRowCount: number
}

interface HoleGridFit {
  boardInferenceConfidence: number
  confidence: number
  gridColumnCount: number
  gridRowCount: number
  holeCenters: Vector2Mm[]
  inferredMmPerUnit: number
  inferenceSource: BoardInferenceSource
  latticeConfidence: number
  note?: string
  pitchSourceUnits: number
  surfaceBounds: BoundsMm
  suggestedPhysicalHeightMm: number
  suggestedPhysicalWidthMm: number
  visibleGridColumnCount: number
  visibleGridRowCount: number
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

function percentile(values: number[], ratio: number) {
  if (values.length === 0) {
    return undefined
  }

  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * ratio)),
  )

  return sorted[index]
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

function getDenseClusters(clusters: Array<{ center: number; values: number[] }>) {
  if (clusters.length === 0) {
    return clusters
  }

  const supports = clusters.map((cluster) => cluster.values.length)
  const supportMedian = median(supports) ?? 1
  const minimumSupport = Math.max(2, Math.ceil(supportMedian * 0.25))
  const denseClusters = clusters.filter(
    (cluster) => cluster.values.length >= minimumSupport,
  )

  return denseClusters.length >= 4 ? denseClusters : clusters
}

function findNearestClusterCenter(
  value: number,
  clusters: Array<{ center: number; values: number[] }>,
  tolerance: number,
) {
  let closestCenter: number | undefined
  let closestDistance = Number.POSITIVE_INFINITY

  for (const cluster of clusters) {
    const distance = Math.abs(cluster.center - value)
    if (distance <= tolerance && distance < closestDistance) {
      closestCenter = cluster.center
      closestDistance = distance
    }
  }

  return closestCenter
}

function estimateDominantPitch(
  clusters: Array<{ center: number; values: number[] }>,
  tolerance: number,
) {
  const supportThreshold = Math.max(
    4,
    Math.ceil(percentile(clusters.map((cluster) => cluster.values.length), 0.65) ?? 4),
  )
  const dominantClusters = clusters.filter(
    (cluster) => cluster.values.length >= supportThreshold,
  )
  const sourceClusters =
    dominantClusters.length >= 4 ? dominantClusters : clusters
  const spacings = sourceClusters
    .slice(1)
    .map((cluster, index) => cluster.center - sourceClusters[index].center)
    .filter((spacing) => spacing > tolerance * 2)

  if (spacings.length === 0) {
    return undefined
  }

  return median(spacings)
}

function getRegularClusters(
  clusters: Array<{ center: number; values: number[] }>,
  tolerance: number,
) {
  if (clusters.length < 4) {
    return clusters
  }

  const pitch = estimateDominantPitch(clusters, tolerance)
  if (!pitch) {
    return clusters
  }

  let bestClusters = clusters
  let bestScore = 0

  for (const originCluster of clusters) {
    const buckets = new Map<
      number,
      { cluster: { center: number; values: number[] }; residual: number }
    >()

    for (const cluster of clusters) {
      const index = Math.round((cluster.center - originCluster.center) / pitch)
      const expectedCenter = originCluster.center + index * pitch
      const residual = Math.abs(cluster.center - expectedCenter)

      if (residual > tolerance * 1.35) {
        continue
      }

      const existing = buckets.get(index)
      if (
        !existing ||
        cluster.values.length > existing.cluster.values.length ||
        residual < existing.residual
      ) {
        buckets.set(index, { cluster, residual })
      }
    }

    const selectedClusters = [...buckets.values()]
      .map((entry) => entry.cluster)
      .sort((left, right) => left.center - right.center)

    if (selectedClusters.length < 4) {
      continue
    }

    const score =
      selectedClusters.reduce(
        (sum, cluster) => sum + cluster.values.length,
        0,
      ) +
      selectedClusters.length * selectedClusters.length

    if (score > bestScore) {
      bestScore = score
      bestClusters = selectedClusters
    }
  }

  return bestClusters
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

function createBoundsFromCenter(args: {
  center: Vector2Mm
  height: number
  width: number
}) {
  return {
    x: args.center.x - args.width / 2,
    y: args.center.y - args.height / 2,
    width: args.width,
    height: args.height,
  }
}

function getSurfaceCenter(bounds: BoundsMm) {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  }
}

function buildGridSurfaceBounds(args: {
  candidateBounds?: BoundsMm
  pitchSourceUnits: number
  totalColumns: number
  totalRows: number
  visibleColumns: number
  visibleRows: number
  xClusters: Array<{ center: number; values: number[] }>
  yClusters: Array<{ center: number; values: number[] }>
}) {
  const {
    candidateBounds,
    pitchSourceUnits,
    totalColumns,
    totalRows,
    visibleColumns,
    visibleRows,
    xClusters,
    yClusters,
  } = args
  const firstVisibleX = xClusters[0]?.center ?? 0
  const lastVisibleX = xClusters[xClusters.length - 1]?.center ?? firstVisibleX
  const firstVisibleY = yClusters[0]?.center ?? 0
  const lastVisibleY = yClusters[yClusters.length - 1]?.center ?? firstVisibleY
  const hiddenColumns = Math.max(0, totalColumns - visibleColumns)
  const hiddenRows = Math.max(0, totalRows - visibleRows)
  const candidateCenter = candidateBounds
    ? getSurfaceCenter(candidateBounds)
    : undefined
  const fallbackLeftHiddenColumns = Math.floor(hiddenColumns / 2)
  const fallbackTopHiddenRows = Math.floor(hiddenRows / 2)

  const chooseHiddenCount = (options: {
    candidateCenter?: number
    hiddenCount: number
    pitch: number
    totalSpan: number
    visibleStart: number
  }) => {
    if (!options.candidateCenter) {
      return 0
    }

    let bestHiddenBefore = 0
    let bestScore = Number.POSITIVE_INFINITY

    for (let hiddenBefore = 0; hiddenBefore <= options.hiddenCount; hiddenBefore += 1) {
      const start =
        options.visibleStart - (hiddenBefore + 0.5) * options.pitch
      const center = start + options.totalSpan / 2
      const score = Math.abs(center - options.candidateCenter)
      if (score < bestScore) {
        bestScore = score
        bestHiddenBefore = hiddenBefore
      }
    }

    return bestHiddenBefore
  }

  const leftHiddenColumns =
    hiddenColumns > 0
      ? chooseHiddenCount({
          candidateCenter: candidateCenter?.x,
          hiddenCount: hiddenColumns,
          pitch: pitchSourceUnits,
          totalSpan: totalColumns * pitchSourceUnits,
          visibleStart: firstVisibleX,
        })
      : fallbackLeftHiddenColumns
  const topHiddenRows =
    hiddenRows > 0
      ? chooseHiddenCount({
          candidateCenter: candidateCenter?.y,
          hiddenCount: hiddenRows,
          pitch: pitchSourceUnits,
          totalSpan: totalRows * pitchSourceUnits,
          visibleStart: firstVisibleY,
        })
      : fallbackTopHiddenRows

  const surfaceBounds = {
    x: firstVisibleX - (leftHiddenColumns + 0.5) * pitchSourceUnits,
    y: firstVisibleY - (topHiddenRows + 0.5) * pitchSourceUnits,
    width: totalColumns * pitchSourceUnits,
    height: totalRows * pitchSourceUnits,
  }

  const visibleCenter = {
    x: (firstVisibleX + lastVisibleX) / 2,
    y: (firstVisibleY + lastVisibleY) / 2,
  }
  const centeredFallbackBounds = createBoundsFromCenter({
    center: visibleCenter,
    height: totalRows * pitchSourceUnits,
    width: totalColumns * pitchSourceUnits,
  })

  return candidateBounds
    ? surfaceBounds
    : centeredFallbackBounds
}

function getBreadboardPresetOrientations() {
  return BREADBOARD_PRESETS.flatMap((preset) => {
    const orientations = [
      {
        heightMm: preset.breadboard.heightMm,
        presetId: preset.id,
        widthMm: preset.breadboard.widthMm,
      },
    ]

    if (preset.breadboard.widthMm !== preset.breadboard.heightMm) {
      orientations.push({
        heightMm: preset.breadboard.widthMm,
        presetId: preset.id,
        widthMm: preset.breadboard.heightMm,
      })
    }

    return orientations.map((orientation) => ({
      ...orientation,
      gridColumnCount: Math.round(orientation.widthMm / DEFAULT_IMPORT_HOLE_PITCH_MM),
      gridRowCount: Math.round(orientation.heightMm / DEFAULT_IMPORT_HOLE_PITCH_MM),
    }))
  })
}

function choosePresetSnap(args: {
  estimatedHeightMm: number
  estimatedWidthMm: number
  visibleColumns: number
  visibleRows: number
}) {
  const { estimatedHeightMm, estimatedWidthMm, visibleColumns, visibleRows } = args
  const estimatedAspectRatio =
    estimatedHeightMm > 1e-6 ? estimatedWidthMm / estimatedHeightMm : 1
  let bestMatch:
    | {
        confidence: number
        gridColumnCount: number
        gridRowCount: number
        heightMm: number
        presetId: string
        widthMm: number
      }
    | undefined

  for (const preset of getBreadboardPresetOrientations()) {
    if (
      preset.gridColumnCount < visibleColumns ||
      preset.gridRowCount < visibleRows
    ) {
      continue
    }

    const widthError = Math.abs(estimatedWidthMm - preset.widthMm) / preset.widthMm
    const heightError = Math.abs(estimatedHeightMm - preset.heightMm) / preset.heightMm
    const presetAspectRatio =
      preset.heightMm > 1e-6 ? preset.widthMm / preset.heightMm : 1
    const aspectError =
      Math.abs(estimatedAspectRatio - presetAspectRatio) /
      Math.max(presetAspectRatio, 1e-6)
    const hiddenPenalty =
      (preset.gridColumnCount - visibleColumns + preset.gridRowCount - visibleRows) /
      Math.max(1, preset.gridColumnCount + preset.gridRowCount)
    const score =
      widthError * 0.42 +
      heightError * 0.42 +
      aspectError * 0.12 +
      hiddenPenalty * 0.04

    if (score > 0.18) {
      continue
    }

    const confidence = clamp01(1 - score / 0.18)
    if (!bestMatch || confidence > bestMatch.confidence) {
      bestMatch = {
        confidence,
        gridColumnCount: preset.gridColumnCount,
        gridRowCount: preset.gridRowCount,
        heightMm: preset.heightMm,
        presetId: preset.presetId,
        widthMm: preset.widthMm,
      }
    }
  }

  return bestMatch
}

function inferBoardFit(args: {
  candidateBounds?: BoundsMm
  pitchSourceUnits: number
  visibleColumns: number
  visibleRows: number
  xClusters: Array<{ center: number; values: number[] }>
  yClusters: Array<{ center: number; values: number[] }>
}) {
  const {
    candidateBounds,
    pitchSourceUnits,
    visibleColumns,
    visibleRows,
    xClusters,
    yClusters,
  } = args
  const fallbackBounds = {
    x: xClusters[0].center - pitchSourceUnits / 2,
    y: yClusters[0].center - pitchSourceUnits / 2,
    width:
      xClusters[xClusters.length - 1].center - xClusters[0].center + pitchSourceUnits,
    height:
      yClusters[yClusters.length - 1].center - yClusters[0].center + pitchSourceUnits,
  }
  const boundsForSizing = candidateBounds ?? fallbackBounds
  const pitchBasedMmPerUnit =
    DEFAULT_IMPORT_HOLE_PITCH_MM / Math.max(pitchSourceUnits, 1e-6)
  const estimatedWidthMm = boundsForSizing.width * pitchBasedMmPerUnit
  const estimatedHeightMm = boundsForSizing.height * pitchBasedMmPerUnit
  const presetSnap = choosePresetSnap({
    estimatedHeightMm,
    estimatedWidthMm,
    visibleColumns,
    visibleRows,
  })

  if (presetSnap) {
    return {
      boardInferenceConfidence: presetSnap.confidence,
      gridColumnCount: presetSnap.gridColumnCount,
      gridRowCount: presetSnap.gridRowCount,
      inferenceSource: 'preset-snap' as const,
      note:
        visibleColumns !== presetSnap.gridColumnCount ||
        visibleRows !== presetSnap.gridRowCount
          ? `Visible hole fit found ${visibleColumns} × ${visibleRows}. The full board was inferred as ${presetSnap.gridColumnCount} × ${presetSnap.gridRowCount} using the fitted pitch and a matching breadboard size.`
          : undefined,
      suggestedPhysicalHeightMm: presetSnap.heightMm,
      suggestedPhysicalWidthMm: presetSnap.widthMm,
      surfaceBounds: buildGridSurfaceBounds({
        candidateBounds,
        pitchSourceUnits,
        totalColumns: presetSnap.gridColumnCount,
        totalRows: presetSnap.gridRowCount,
        visibleColumns,
        visibleRows,
        xClusters,
        yClusters,
      }),
    }
  }

  const inferredColumns = Math.max(
    visibleColumns,
    Math.round(boundsForSizing.width / Math.max(pitchSourceUnits, 1e-6)),
  )
  const inferredRows = Math.max(
    visibleRows,
    Math.round(boundsForSizing.height / Math.max(pitchSourceUnits, 1e-6)),
  )
  const boardInferenceConfidence = clamp01(
    0.52 +
      Math.min(
        0.24,
        Math.max(0, visibleColumns / Math.max(inferredColumns, 1)) * 0.12 +
          Math.max(0, visibleRows / Math.max(inferredRows, 1)) * 0.12,
      ),
  )

  return {
    boardInferenceConfidence,
    gridColumnCount: inferredColumns,
    gridRowCount: inferredRows,
    inferenceSource: visibleColumns === inferredColumns && visibleRows === inferredRows
      ? ('visible-grid' as const)
      : ('bounds-extrapolation' as const),
    note:
      visibleColumns !== inferredColumns || visibleRows !== inferredRows
        ? `Visible hole fit found ${visibleColumns} × ${visibleRows}. The full board estimate was expanded to ${inferredColumns} × ${inferredRows} using the board bounds and fitted pitch.`
        : undefined,
    suggestedPhysicalHeightMm: roundAutoSizeMm(
      inferredRows * DEFAULT_IMPORT_HOLE_PITCH_MM,
    ),
    suggestedPhysicalWidthMm: roundAutoSizeMm(
      inferredColumns * DEFAULT_IMPORT_HOLE_PITCH_MM,
    ),
    surfaceBounds: buildGridSurfaceBounds({
      candidateBounds,
      pitchSourceUnits,
      totalColumns: inferredColumns,
      totalRows: inferredRows,
      visibleColumns,
      visibleRows,
      xClusters,
      yClusters,
    }),
  }
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
  const rawXClusters = clusterAxisValues(
    points.map((point) => point.x),
    tolerance,
  )
  const rawYClusters = clusterAxisValues(
    points.map((point) => point.y),
    tolerance,
  )
  const xClusters = getRegularClusters(getDenseClusters(rawXClusters), tolerance)
  const yClusters = getRegularClusters(getDenseClusters(rawYClusters), tolerance)

  if (xClusters.length < 4 || yClusters.length < 4) {
    return undefined
  }

  const gridPoints = points.filter((point) => {
    const alignedX = findNearestClusterCenter(point.x, xClusters, tolerance)
    const alignedY = findNearestClusterCenter(point.y, yClusters, tolerance)

    return alignedX !== undefined && alignedY !== undefined
  })
  const filteredXClusters = clusterAxisValues(
    gridPoints.map((point) => point.x),
    tolerance,
  )
  const filteredYClusters = clusterAxisValues(
    gridPoints.map((point) => point.y),
    tolerance,
  )
  const finalXClusters = getRegularClusters(
    getDenseClusters(filteredXClusters),
    tolerance,
  )
  const finalYClusters = getRegularClusters(
    getDenseClusters(filteredYClusters),
    tolerance,
  )
  const fallbackXClusters = xClusters
  const fallbackYClusters = yClusters
  const visibleXClusters = xClusters
  const visibleYClusters = yClusters
  const resolvedXClusters =
    finalXClusters.length >= 4 ? finalXClusters : fallbackXClusters
  const resolvedYClusters =
    finalYClusters.length >= 4 ? finalYClusters : fallbackYClusters
  const xSpacings = resolvedXClusters
    .slice(1)
    .map((cluster, index) => cluster.center - resolvedXClusters[index].center)
    .filter((spacing) => spacing > tolerance * 1.2)
  const ySpacings = resolvedYClusters
    .slice(1)
    .map((cluster, index) => cluster.center - resolvedYClusters[index].center)
    .filter((spacing) => spacing > tolerance * 1.2)
  let xPitch = median(xSpacings)
  let yPitch = median(ySpacings)
  let axisMismatch =
    xPitch && yPitch
      ? Math.abs(xPitch - yPitch) / Math.max(xPitch, yPitch, 1e-6)
      : Number.POSITIVE_INFINITY

  if ((!xPitch || !yPitch || axisMismatch > 0.26) && (resolvedXClusters !== fallbackXClusters || resolvedYClusters !== fallbackYClusters)) {
    const fallbackXSpacings = fallbackXClusters
      .slice(1)
      .map((cluster, index) => cluster.center - fallbackXClusters[index].center)
      .filter((spacing) => spacing > tolerance * 1.2)
    const fallbackYSpacings = fallbackYClusters
      .slice(1)
      .map((cluster, index) => cluster.center - fallbackYClusters[index].center)
      .filter((spacing) => spacing > tolerance * 1.2)
    xPitch = median(fallbackXSpacings)
    yPitch = median(fallbackYSpacings)
    axisMismatch =
      xPitch && yPitch
        ? Math.abs(xPitch - yPitch) / Math.max(xPitch, yPitch, 1e-6)
        : Number.POSITIVE_INFINITY
  }

  if (!xPitch || !yPitch || axisMismatch > 0.26) {
    return undefined
  }

  const pitchSourceUnits = (xPitch + yPitch) / 2
  const uniformity = Math.min(
    computeSpacingUniformity(xSpacings, pitchSourceUnits),
    computeSpacingUniformity(ySpacings, pitchSourceUnits),
  )
  const occupancy =
    gridPoints.length / Math.max(1, resolvedXClusters.length * resolvedYClusters.length)
  const countConfidence = clamp01(
    Math.min(resolvedXClusters.length, resolvedYClusters.length) / 10,
  )
  const latticeConfidence = clamp01(
    uniformity * 0.56 +
      clamp01(occupancy) * 0.24 +
      countConfidence * 0.2,
  )
  const boardFit = inferBoardFit({
    candidateBounds,
    pitchSourceUnits,
    visibleColumns: visibleXClusters.length,
    visibleRows: visibleYClusters.length,
    xClusters: visibleXClusters,
    yClusters: visibleYClusters,
  })
  const confidence = clamp01(
    latticeConfidence * 0.68 + boardFit.boardInferenceConfidence * 0.32,
  )

  return {
    boardInferenceConfidence: boardFit.boardInferenceConfidence,
    confidence,
    gridColumnCount: boardFit.gridColumnCount,
    gridRowCount: boardFit.gridRowCount,
    holeCenters: gridPoints,
    inferredMmPerUnit: DEFAULT_IMPORT_HOLE_PITCH_MM / pitchSourceUnits,
    inferenceSource: boardFit.inferenceSource,
    latticeConfidence,
    note:
      boardFit.note ??
      (confidence < 0.74
        ? 'Hole grid confidence is low. Confirm the inferred sizes before importing.'
        : undefined),
    pitchSourceUnits,
    surfaceBounds: boardFit.surfaceBounds,
    suggestedPhysicalHeightMm: boardFit.suggestedPhysicalHeightMm,
    suggestedPhysicalWidthMm: boardFit.suggestedPhysicalWidthMm,
    visibleGridColumnCount: visibleXClusters.length,
    visibleGridRowCount: visibleYClusters.length,
  }
}

function buildResult(args: {
  fit: HoleGridFit
  sourceKind: ImportSourceKind
}): ImportAutoCalibrationResult {
  const { fit, sourceKind } = args

  return {
    boardInferenceConfidence: fit.boardInferenceConfidence,
    confidence: fit.confidence,
    detectedHoleCount: fit.holeCenters.length,
    gridColumnCount: fit.gridColumnCount,
    gridRowCount: fit.gridRowCount,
    holeCenters: fit.holeCenters,
    inferredMmPerUnit: fit.inferredMmPerUnit,
    inferenceSource: fit.inferenceSource,
    latticeConfidence: fit.latticeConfidence,
    note: fit.note,
    pitchSourceUnits: fit.pitchSourceUnits,
    sourceKind,
    surfaceBounds: fit.surfaceBounds,
    suggestedPhysicalHeightMm: fit.suggestedPhysicalHeightMm,
    suggestedPhysicalWidthMm: fit.suggestedPhysicalWidthMm,
    visibleGridColumnCount: fit.visibleGridColumnCount,
    visibleGridRowCount: fit.visibleGridRowCount,
  }
}

export function autoCalibrateSvgImport(args: {
  detection: SvgImportWorkspaceDetection
  document: SvgImportDocument
  workspaceConfig: SvgImportWorkspaceConfig
}): ImportAutoCalibrationResult | undefined {
  const { detection, document, workspaceConfig } = args
  const candidateBoundsList = [
    ...workspaceConfig.breadboards.map((surface) => surface.boundsUnits),
    ...detection.breadboardCandidates.map((candidate) => candidate.boundsUnits),
  ].filter((bounds) => bounds.width > 0 && bounds.height > 0)
  const seenBounds = new Set<string>()
  const uniqueCandidateBounds = candidateBoundsList.filter((bounds) => {
    const signature = [
      roundMm(bounds.x),
      roundMm(bounds.y),
      roundMm(bounds.width),
      roundMm(bounds.height),
    ].join(':')
    if (seenBounds.has(signature)) {
      return false
    }
    seenBounds.add(signature)
    return true
  })

  if (uniqueCandidateBounds.length === 0) {
    return undefined
  }
  let bestResult: ImportAutoCalibrationResult | undefined
  let bestRank = Number.NEGATIVE_INFINITY

  for (const candidateBounds of uniqueCandidateBounds) {
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
      continue
    }

    const result = buildResult({
      fit,
      sourceKind: 'svg',
    })
    const hiddenExpansion =
      Math.max(0, result.gridColumnCount - result.visibleGridColumnCount) +
      Math.max(0, result.gridRowCount - result.visibleGridRowCount)
    const rank =
      result.confidence +
      (result.inferenceSource === 'preset-snap' ? 0.14 : 0) -
      hiddenExpansion * 0.018

    if (
      !bestResult ||
      rank > bestRank + 1e-6 ||
      (Math.abs(rank - bestRank) <= 1e-6 &&
        result.detectedHoleCount > bestResult.detectedHoleCount)
    ) {
      bestResult = result
      bestRank = rank
    }
  }

  return bestResult
}

export function detectRasterHoleCenters(args: {
  candidateBounds?: BoundsMm
  data: Uint8ClampedArray
  height: number
  width: number
}): Vector2Mm[] {
  const { candidateBounds, data, height, width } = args
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
      const pixelOffset = (y * width + x) * 4
      const red = data[pixelOffset]
      const green = data[pixelOffset + 1]
      const blue = data[pixelOffset + 2]
      const colorSpread = Math.max(red, green, blue) - Math.min(red, green, blue)

      if (colorSpread <= 24 && intensity >= localMean + 6) {
        candidateMask[y * width + x] = 1
      }
    }
  }

  const visited = new Uint8Array(width * height)
  const centers: Vector2Mm[] = []
  const scanBounds = candidateBounds
    ? {
        minX: Math.max(0, Math.floor(candidateBounds.x)),
        maxX: Math.min(width - 1, Math.ceil(candidateBounds.x + candidateBounds.width)),
        minY: Math.max(0, Math.floor(candidateBounds.y)),
        maxY: Math.min(height - 1, Math.ceil(candidateBounds.y + candidateBounds.height)),
      }
    : {
        minX: 0,
        maxX: width - 1,
        minY: 0,
        maxY: height - 1,
      }
  const scanArea =
    Math.max(1, scanBounds.maxX - scanBounds.minX + 1) *
    Math.max(1, scanBounds.maxY - scanBounds.minY + 1)
  const scanWidth = Math.max(1, scanBounds.maxX - scanBounds.minX + 1)
  const scanHeight = Math.max(1, scanBounds.maxY - scanBounds.minY + 1)
  const maxComponentArea = Math.max(
    10,
    Math.round(scanArea * 0.00055),
  )

  for (let y = scanBounds.minY; y <= scanBounds.maxY; y += 1) {
    for (let x = scanBounds.minX; x <= scanBounds.maxX; x += 1) {
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
        maxEdge <= Math.max(12, Math.min(scanWidth, scanHeight) * 0.028)
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

function estimateRasterBoardBounds(args: {
  data: Uint8ClampedArray
  height: number
  width: number
}): BoundsMm | undefined {
  const { data, height, width } = args
  const histogram = new Uint32Array(256)

  for (let index = 0; index < width * height; index += 1) {
    const pixelOffset = index * 4
    const intensity = Math.round(
      data[pixelOffset] * 0.2126 +
        data[pixelOffset + 1] * 0.7152 +
        data[pixelOffset + 2] * 0.0722,
    )
    histogram[intensity] += 1
  }

  let dominantIntensity = 96
  let dominantCount = 0
  for (let intensity = 35; intensity <= 220; intensity += 1) {
    if (histogram[intensity] > dominantCount) {
      dominantCount = histogram[intensity]
      dominantIntensity = intensity
    }
  }

  const tolerance = 18
  const rowScores = new Float32Array(height)
  const columnScores = new Float32Array(width)

  for (let y = 0; y < height; y += 1) {
    let rowMatches = 0
    for (let x = 0; x < width; x += 1) {
      const pixelOffset = (y * width + x) * 4
      const intensity =
        data[pixelOffset] * 0.2126 +
        data[pixelOffset + 1] * 0.7152 +
        data[pixelOffset + 2] * 0.0722
      if (Math.abs(intensity - dominantIntensity) <= tolerance) {
        rowMatches += 1
        columnScores[x] += 1
      }
    }
    rowScores[y] = rowMatches / Math.max(width, 1)
  }

  for (let x = 0; x < width; x += 1) {
    columnScores[x] /= Math.max(height, 1)
  }

  const findLargestRun = (scores: Float32Array, minimumScore: number) => {
    let currentStart = -1
    const runs: Array<{ end: number; start: number }> = []

    for (let index = 0; index < scores.length; index += 1) {
      if (scores[index] >= minimumScore) {
        if (currentStart < 0) {
          currentStart = index
        }
      } else if (currentStart >= 0) {
        runs.push({ end: index - 1, start: currentStart })
        currentStart = -1
      }
    }

    if (currentStart >= 0) {
      runs.push({ end: scores.length - 1, start: currentStart })
    }

    if (runs.length === 0) {
      return undefined
    }

    const mergedRuns: Array<{ end: number; start: number }> = [runs[0]]
    for (let index = 1; index < runs.length; index += 1) {
      const previous = mergedRuns[mergedRuns.length - 1]
      const current = runs[index]
      if (current.start - previous.end <= 8) {
        previous.end = current.end
      } else {
        mergedRuns.push({ ...current })
      }
    }

    return mergedRuns.sort(
      (left, right) => right.end - right.start - (left.end - left.start),
    )[0]
  }

  const rowRun = findLargestRun(rowScores, 0.34)
  const columnRun = findLargestRun(columnScores, 0.3)

  if (!rowRun || !columnRun) {
    return undefined
  }

  return {
    x: columnRun.start,
    y: rowRun.start,
    width: columnRun.end - columnRun.start + 1,
    height: rowRun.end - rowRun.start + 1,
  }
}

export function autoCalibrateRasterImport(args: {
  document: RasterImportDocument
  imageData: ImageData
}): ImportAutoCalibrationResult | undefined {
  const { document, imageData } = args
  const candidateBounds = estimateRasterBoardBounds({
    data: imageData.data,
    height: imageData.height,
    width: imageData.width,
  })
  const holeCenters = detectRasterHoleCenters({
    candidateBounds,
    data: imageData.data,
    height: imageData.height,
    width: imageData.width,
  })
  const fit = fitHoleGrid({
    candidateBounds,
    points: holeCenters,
  })

  if (!fit) {
    return undefined
  }

  return buildResult({
    fit,
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

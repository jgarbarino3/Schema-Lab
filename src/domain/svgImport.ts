import {
  COMPONENT_DEFINITIONS,
  createDefaultComponentConfig,
  getComponentDefinition,
  getResolvedComponentSpec,
} from './componentCatalog'
import { createAutoNumberedComponentLabel } from './componentLabels'
import { normalizeQuarterTurns, rotatePointQuarterTurns, roundMm } from './geometry'
import {
  getSurfacePlacementModel,
  reconcileComponentAnchorForScene,
} from './placement'
import { getDefaultBreadboard } from './breadboardPresets'
import type {
  BoundsMm,
  BreadboardModel,
  ComponentInstance,
  ComponentType,
  OpticalTableWorkspace,
  QuarterTurn,
  SceneDocument,
  Vector2Mm,
} from './types'
import {
  OPTICAL_TABLE_SURFACE_ID,
  SINGLE_BREADBOARD_SURFACE_ID,
} from './types'
import {
  createBreadboardInstance,
  createDefaultOpticalTable,
  getBreadboardAnchorForCenterMm,
} from './workspace'

export type SvgImportMode = 'append-breadboard' | 'merge' | 'replace'
export type SvgImportProfile = 'strict' | 'guided'
export type SvgCalibrationMode = 'simple' | 'advanced'
export type ImportSourceKind = 'svg' | 'raster'
export type ImportPreviewMode = 'source' | 'live-board'
export type ImportPreviewConfirmIntent =
  | 'board-only'
  | 'quick-import'
  | 'modified-import'

interface Matrix2D {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

interface ParsedLength {
  unit: string
  value: number
}

export interface SvgImportScaleInfo {
  baseMmPerUnit: number
  isReliable: boolean
  reason?: string
  sourceUnit: string
}

export type SvgImportElementKind =
  | 'line'
  | 'polyline'
  | 'polygon'
  | 'rect'
  | 'circle'
  | 'ellipse'
  | 'path'

export interface SvgImportElementSegment {
  end: Vector2Mm
  polylineIndex: number
  start: Vector2Mm
}

export interface SvgImportElement {
  bounds: BoundsMm
  center: Vector2Mm
  hints: string[]
  id: string
  isClosed: boolean
  kind: SvgImportElementKind
  polylines: Vector2Mm[][]
  points: Vector2Mm[]
  rotationDeg: number
  segments: SvgImportElementSegment[]
  stroke?: string
  strokeWidth?: number
}

export interface SvgImportDocument {
  bounds: BoundsMm
  elements: SvgImportElement[]
  scale: SvgImportScaleInfo
  sourceKind: 'svg'
  svgText: string
  viewBox?: BoundsMm
}

export interface RasterImportDocument {
  bounds: BoundsMm
  imageDataUrl: string
  imageHeightPx: number
  imageWidthPx: number
  scale: SvgImportScaleInfo
  sourceKind: 'raster'
}

export type ImportPreviewDocument = SvgImportDocument | RasterImportDocument

export interface SvgCalibrationSample {
  distanceMm: number
  end: Vector2Mm
  start: Vector2Mm
}

export interface SvgCalibrationRequest {
  mode: SvgCalibrationMode
  samples: SvgCalibrationSample[]
}

export interface SvgImportSuggestion {
  componentType: ComponentType
  confidence: number
  reason: string
  source: 'deterministic' | 'heuristic'
}

export interface SvgImportRecognizedElement {
  elementId: string
  source: 'deterministic' | 'heuristic' | 'manual'
  suggestion: SvgImportSuggestion
}

export interface SvgImportSurfaceCandidate {
  boundsUnits: BoundsMm
  centerUnits: Vector2Mm
  confidence: number
  containedElementIds: string[]
  holeGridEvidence: number
  id: string
  kind: 'breadboard' | 'table' | 'unknown-rectilinear'
  nestingDepth: number
  outlinePoints: Vector2Mm[]
  rectilinearScore: number
  rotationDeg: number
  sourceElementIds: string[]
}

export interface SvgImportWorkspaceDetection {
  breadboardCandidates: SvgImportSurfaceCandidate[]
  orphanElementIds: string[]
  tableCandidate?: SvgImportSurfaceCandidate
  warnings: string[]
  workspaceKind: 'optical-table' | 'single-breadboard' | 'unknown'
}

export interface SvgImportWorkspaceSurfaceConfig {
  boundsUnits: BoundsMm
  candidateId?: string
  id: string
  kind: 'breadboard' | 'table'
  label: string
  physicalHeightMm: number
  physicalWidthMm: number
}

export interface SvgImportWorkspaceConfig {
  breadboards: SvgImportWorkspaceSurfaceConfig[]
  table?: SvgImportWorkspaceSurfaceConfig
  workspaceKind: 'optical-table' | 'single-breadboard'
}

export interface SvgImportReviewItem {
  allowKeepAsLinework: boolean
  bounds: BoundsMm
  center: Vector2Mm
  elementId?: string
  id: string
  kind: 'ambiguous-symbol' | 'linework-fragment' | 'missing-junction'
  label: string
  sourceElementIds: string[]
  suggestedRotationDeg?: number
  suggestions: SvgImportSuggestion[]
}

export type SvgImportResolutionDisposition = 'component' | 'linework' | 'skip'
export type SvgImportGeneralReviewItem = SvgImportReviewItem
export type SvgImportAmbiguousElement = SvgImportReviewItem

export type ImportPreviewItemKind =
  | 'ambiguous-symbol'
  | 'linework-fragment'
  | 'missing-junction'
  | 'raster-candidate'
  | 'recognized-component'

export interface ImportPreviewItem {
  allowKeepAsLinework: boolean
  bounds: BoundsMm
  center: Vector2Mm
  componentType?: ComponentType
  disposition: SvgImportResolutionDisposition
  editability: {
    canMove: boolean
    canReassign: boolean
    canRotate: boolean
  }
  elementId?: string
  id: string
  isStrongMatch: boolean
  kind: ImportPreviewItemKind
  label: string
  rotationQuarterTurns: QuarterTurn
  sourceElementIds: string[]
  sourceKind: ImportSourceKind
  suggestions: SvgImportSuggestion[]
  variantId?: string
}

export interface SvgImportAnnotationSegment {
  color: string
  elementId: string
  end: Vector2Mm
  strokeWidth: number
  start: Vector2Mm
}

export interface SvgImportAnalysis {
  ambiguous: SvgImportAmbiguousElement[]
  annotationSegments: SvgImportAnnotationSegment[]
  recognized: SvgImportRecognizedElement[]
  reviewItems: SvgImportReviewItem[]
  warnings: string[]
  workspaceDetection: SvgImportWorkspaceDetection
}

export interface SvgImportManualResolution {
  componentType?: ComponentType
  disposition: SvgImportResolutionDisposition
  elementId?: string
  reviewItemId: string
  variantId?: string
}

export interface SvgImportApplyResult {
  actionIntent: SvgImportActionIntent
  draftComponentIdsByPreviewItemId: Map<string, string>
  importedAnnotations: number
  importedComponents: number
  scene: SceneDocument
  unresolvedAmbiguousElements: number
  warnings: string[]
}

export type SvgImportPreviewMode = 'source' | 'live-board'
export type SvgImportActionIntent = 'board-only' | 'quick-import' | 'modified-import'

export interface SvgImportDraftSession {
  actionIntent: SvgImportActionIntent
  analysis: SvgImportAnalysis
  appendBreadboardCenterMm?: Vector2Mm
  baselineAppendBreadboardCenterMm?: Vector2Mm
  baselineHostSurfaceId?: string
  baselineMode: SvgImportMode
  baselinePreviewItems: ImportPreviewItem[]
  baselineWorkspaceConfig?: SvgImportWorkspaceConfig
  document: ImportPreviewDocument
  draftComponentIdsByPreviewItemId: Map<string, string>
  hostSurfaceId?: string
  millimetersPerUnit: number
  mode: SvgImportMode
  previewMode: SvgImportPreviewMode
  workingAppendBreadboardCenterMm?: Vector2Mm
  workingHostSurfaceId?: string
  workingMode: SvgImportMode
  workingPreviewItems: ImportPreviewItem[]
  workingWorkspaceConfig?: SvgImportWorkspaceConfig
  workspaceConfig?: SvgImportWorkspaceConfig
}

export interface ImportPreviewDraftScene {
  actionIntent: SvgImportActionIntent
  componentIdByPreviewItemId: Record<string, string>
  importedComponentIds: string[]
  previewItemIdByComponentId: Record<string, string>
  previewMode: SvgImportPreviewMode
  scene: SceneDocument
  targetsByHostSurfaceId: Record<string, ImportPreviewPlacementTarget>
}

interface SvgImportElementMetrics {
  angleToCardinalDeg: number
  angleToDiagonalDeg: number
  aspectRatio: number
  diagonalMm: number
  heightMm: number
  pathLengthMm: number
  segmentCount: number
  smallestDimensionMm: number
  strokeWidthMm: number
  widthMm: number
}

interface SvgImportHeuristicContext {
  beamLineElementIds: Set<string>
  concentricCountById: Map<string, number>
  crossingLineCountById: Map<string, number>
  decorativeOpenElementIds: Set<string>
  enclosedOpenLineCountById: Map<string, number>
  junctionReviewItems: SvgImportReviewItem[]
  lineworkReviewElementIds: Set<string>
  metricsById: Map<string, SvgImportElementMetrics>
}

const SVG_DEFAULT_MM_PER_UNIT = 25.4 / 96
const AUTO_HEURISTIC_CONFIDENCE_THRESHOLD = 0.86
const AUTO_HEURISTIC_MARGIN_THRESHOLD = 0.15
const DEFAULT_ANNOTATION_COLOR = '#00ff00'
const DEFAULT_ANNOTATION_STROKE_MM = 0.8
const MAX_SUGGESTIONS_PER_AMBIGUITY = 5
const MAX_REASONABLE_MIRROR_LENGTH_MM = 45
const BEAM_LINE_MIN_LENGTH_MM = 12
const BEAM_LINE_MAX_STROKE_MM = 1.8
const BEAM_LINE_MIN_ASPECT_RATIO = 6
const DECORATIVE_LINE_BOUNDARY_PADDING_MM = 1.4
const DECORATIVE_LINE_MAX_DIAGONAL_RATIO = 1.45
const NEAR_CONNECTED_GAP_MM = 3.2
const NEAR_CONNECTED_LINE_REVIEW_GAP_MM = 4.4
const JUNCTION_TURN_MIN_DEG = 54
const JUNCTION_TURN_MAX_DEG = 126
const SURFACE_CANDIDATE_MIN_EDGE_UNITS = 24
const SURFACE_CANDIDATE_MIN_AREA_RATIO = 0.035
const BEAM_HINT_KEYWORDS = [' beam ', ' ray ', ' path ', 'trajectory']
const OPEN_GEOMETRY_DETERMINISTIC_TYPES: ComponentType[] = ['mirror', 'curved-mirror']

const COMPONENT_KEYWORD_MAP: Array<{
  keywords: string[]
  type: ComponentType
}> = [
  { type: 'laser-source', keywords: ['laser', 'pump', 'seed', 'source'] },
  {
    type: 'beamsplitter',
    keywords: ['beam splitter', 'beamsplitter', ' bs ', 'splitter'],
  },
  { type: 'curved-mirror', keywords: ['curved mirror', 'concave', 'convex'] },
  { type: 'mirror', keywords: [' mirror', ' m1', ' m2', ' m3'] },
  {
    type: 'folded-mirror-pair',
    keywords: ['folded mirror pair', 'retroreflector', 'corner cube', 'frog delay'],
  },
  { type: 'lens', keywords: [' lens', ' l1', ' l2', 'focal'] },
  {
    type: 'filter',
    keywords: ['filter', 'longpass', 'shortpass', 'bandpass', 'fgb37', 'fgb39'],
  },
  {
    type: 'attenuator',
    keywords: ['attenuator', 'neutral density', ' nd ', 'ndl 10c 2', 'variable attenuator'],
  },
  { type: 'polarizer', keywords: ['polarizer', 'polariser', 'pol'] },
  { type: 'waveplate', keywords: ['waveplate', 'hwp', 'qwp', 'lambda'] },
  { type: 'iris', keywords: ['iris', 'aperture', 'ida12'] },
  { type: 'bbo-crystal', keywords: ['bbo', 'crystal'] },
  { type: 'telescope', keywords: ['telescope', 'compressor', 'expander'] },
  { type: 'opa-module', keywords: ['opa', 'parametric amplifier'] },
  {
    type: 'sample-holder',
    keywords: ['sample holder', 'sample mount', 'platform mount', 'kinematic platform', 'km100'],
  },
  {
    type: 'translation-stage',
    keywords: [
      'translation stage',
      'sample stage',
      ' xy ',
      ' xyz ',
      'pt1 m',
      'pt3 m',
      'st1xy',
      'translator',
    ],
  },
  { type: 'delay-stage', keywords: ['delay line', 'delay stage', 'm 112', 'ls 180'] },
  { type: 'sample', keywords: ['sample', 'substrate', 'crystal', 'tin'] },
  { type: 'fiber-coupler', keywords: ['fiber', 'fibre', 'coupler', 'mm fiber'] },
  { type: 'spectrometer', keywords: ['spectrometer', 'cct10'] },
  { type: 'detector', keywords: ['detector', 'photodiode', 'pd ', 's120vc', 'bc207vis'] },
  { type: 'beam-dump', keywords: ['beam dump', 'dump'] },
  { type: 'optic-mount', keywords: ['optic mount', 'mount'] },
  { type: 'support-hardware', keywords: ['support'] },
]

interface SvgImportTextHint {
  position: Vector2Mm
  value: string
}

function identityMatrix(): Matrix2D {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
}

function multiplyMatrices(parent: Matrix2D, child: Matrix2D): Matrix2D {
  return {
    a: parent.a * child.a + parent.c * child.b,
    b: parent.b * child.a + parent.d * child.b,
    c: parent.a * child.c + parent.c * child.d,
    d: parent.b * child.c + parent.d * child.d,
    e: parent.a * child.e + parent.c * child.f + parent.e,
    f: parent.b * child.e + parent.d * child.f + parent.f,
  }
}

function translateMatrix(x: number, y: number): Matrix2D {
  return { a: 1, b: 0, c: 0, d: 1, e: x, f: y }
}

function scaleMatrix(x: number, y: number): Matrix2D {
  return { a: x, b: 0, c: 0, d: y, e: 0, f: 0 }
}

function rotateMatrix(angleDeg: number): Matrix2D {
  const angleRad = (angleDeg * Math.PI) / 180
  const cosValue = Math.cos(angleRad)
  const sinValue = Math.sin(angleRad)

  return {
    a: cosValue,
    b: sinValue,
    c: -sinValue,
    d: cosValue,
    e: 0,
    f: 0,
  }
}

function skewXMatrix(angleDeg: number): Matrix2D {
  const tangent = Math.tan((angleDeg * Math.PI) / 180)
  return { a: 1, b: 0, c: tangent, d: 1, e: 0, f: 0 }
}

function skewYMatrix(angleDeg: number): Matrix2D {
  const tangent = Math.tan((angleDeg * Math.PI) / 180)
  return { a: 1, b: tangent, c: 0, d: 1, e: 0, f: 0 }
}

function applyMatrixToPoint(point: Vector2Mm, matrix: Matrix2D): Vector2Mm {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  }
}

function parseNumber(value: string | null | undefined, fallback = 0) {
  if (!value) {
    return fallback
  }

  const parsedValue = Number.parseFloat(value)
  return Number.isFinite(parsedValue) ? parsedValue : fallback
}

function parseLength(value: string | null | undefined): ParsedLength | undefined {
  if (!value) {
    return undefined
  }

  const trimmed = value.trim()
  const match = trimmed.match(/^([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)([a-zA-Z%]*)$/)

  if (!match) {
    return undefined
  }

  const numericValue = Number.parseFloat(match[1])

  if (!Number.isFinite(numericValue)) {
    return undefined
  }

  return {
    value: numericValue,
    unit: (match[2] || 'unitless').toLowerCase(),
  }
}

function convertLengthToMillimeters(
  parsedLength: ParsedLength,
  documentUnits?: string,
): {
  isReliable: boolean
  millimeters: number
  sourceUnit: string
} {
  const resolvedUnit =
    parsedLength.unit === 'unitless' && documentUnits
      ? documentUnits.toLowerCase()
      : parsedLength.unit

  switch (resolvedUnit) {
    case 'mm':
      return {
        millimeters: parsedLength.value,
        isReliable: true,
        sourceUnit: 'mm',
      }
    case 'cm':
      return {
        millimeters: parsedLength.value * 10,
        isReliable: true,
        sourceUnit: 'cm',
      }
    case 'in':
      return {
        millimeters: parsedLength.value * 25.4,
        isReliable: true,
        sourceUnit: 'in',
      }
    case 'pt':
      return {
        millimeters: (parsedLength.value * 25.4) / 72,
        isReliable: true,
        sourceUnit: 'pt',
      }
    case 'pc':
      return {
        millimeters: (parsedLength.value * 25.4) / 6,
        isReliable: true,
        sourceUnit: 'pc',
      }
    case 'px':
    case 'unitless':
    default:
      return {
        millimeters: parsedLength.value * SVG_DEFAULT_MM_PER_UNIT,
        isReliable: false,
        sourceUnit: resolvedUnit,
      }
  }
}

function parseViewBox(viewBoxValue: string | null): BoundsMm | undefined {
  if (!viewBoxValue) {
    return undefined
  }

  const values = viewBoxValue
    .trim()
    .split(/[\s,]+/)
    .map((token) => Number.parseFloat(token))

  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    return undefined
  }

  return {
    x: values[0],
    y: values[1],
    width: values[2],
    height: values[3],
  }
}

function deriveScaleInfo(svgElement: Element, viewBox?: BoundsMm): SvgImportScaleInfo {
  const widthLength = parseLength(svgElement.getAttribute('width'))
  const heightLength = parseLength(svgElement.getAttribute('height'))
  const documentUnits = svgElement.getAttribute('inkscape:document-units') ?? undefined
  const widthMeasurement =
    widthLength && viewBox && viewBox.width > 0
      ? convertLengthToMillimeters(widthLength, documentUnits)
      : undefined
  const heightMeasurement =
    heightLength && viewBox && viewBox.height > 0
      ? convertLengthToMillimeters(heightLength, documentUnits)
      : undefined
  const widthScale =
    widthMeasurement && viewBox ? widthMeasurement.millimeters / viewBox.width : undefined
  const heightScale =
    heightMeasurement && viewBox ? heightMeasurement.millimeters / viewBox.height : undefined

  if (widthScale && heightScale) {
    const averageScale = (widthScale + heightScale) / 2
    const mismatchRatio =
      Math.abs(widthScale - heightScale) / Math.max(averageScale, 1e-9)
    const reliable =
      widthMeasurement?.isReliable &&
      heightMeasurement?.isReliable &&
      mismatchRatio <= 0.03

    return {
      baseMmPerUnit: averageScale,
      isReliable: Boolean(reliable),
      reason: reliable
        ? undefined
        : mismatchRatio > 0.03
          ? 'Width/height scaling mismatch needs calibration.'
          : 'SVG uses non-physical or ambiguous units.',
      sourceUnit: widthMeasurement?.sourceUnit ?? heightMeasurement?.sourceUnit ?? 'px',
    }
  }

  if (widthScale && widthMeasurement) {
    return {
      baseMmPerUnit: widthScale,
      isReliable: widthMeasurement.isReliable,
      reason: widthMeasurement.isReliable
        ? undefined
        : 'Width is expressed in non-physical units.',
      sourceUnit: widthMeasurement.sourceUnit,
    }
  }

  if (heightScale && heightMeasurement) {
    return {
      baseMmPerUnit: heightScale,
      isReliable: heightMeasurement.isReliable,
      reason: heightMeasurement.isReliable
        ? undefined
        : 'Height is expressed in non-physical units.',
      sourceUnit: heightMeasurement.sourceUnit,
    }
  }

  return {
    baseMmPerUnit: SVG_DEFAULT_MM_PER_UNIT,
    isReliable: false,
    reason: 'SVG lacks explicit physical width/height units.',
    sourceUnit: 'px',
  }
}

function parseTransformList(value: string | null | undefined): Matrix2D {
  if (!value) {
    return identityMatrix()
  }

  const transformPattern = /([a-zA-Z]+)\(([^)]+)\)/g
  let result = identityMatrix()
  let match: RegExpExecArray | null

  while ((match = transformPattern.exec(value))) {
    const transformName = match[1].toLowerCase()
    const args = match[2]
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((token) => Number.parseFloat(token))
      .filter((token) => Number.isFinite(token))

    let localMatrix = identityMatrix()

    if (transformName === 'matrix' && args.length >= 6) {
      localMatrix = {
        a: args[0],
        b: args[1],
        c: args[2],
        d: args[3],
        e: args[4],
        f: args[5],
      }
    } else if (transformName === 'translate') {
      localMatrix = translateMatrix(args[0] ?? 0, args[1] ?? 0)
    } else if (transformName === 'scale') {
      localMatrix = scaleMatrix(args[0] ?? 1, args[1] ?? args[0] ?? 1)
    } else if (transformName === 'rotate' && args.length > 0) {
      const rotation = rotateMatrix(args[0])

      if (args.length >= 3) {
        localMatrix = multiplyMatrices(
          multiplyMatrices(translateMatrix(args[1], args[2]), rotation),
          translateMatrix(-args[1], -args[2]),
        )
      } else {
        localMatrix = rotation
      }
    } else if (transformName === 'skewx' && args.length > 0) {
      localMatrix = skewXMatrix(args[0])
    } else if (transformName === 'skewy' && args.length > 0) {
      localMatrix = skewYMatrix(args[0])
    }

    result = multiplyMatrices(result, localMatrix)
  }

  return result
}

function normalizeHintValue(value: string) {
  return ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
}

function parseStyleMap(styleText: string | null | undefined) {
  if (!styleText) {
    return new Map<string, string>()
  }

  const styleMap = new Map<string, string>()

  for (const declaration of styleText.split(';')) {
    const [rawProperty, rawValue] = declaration.split(':')

    if (!rawProperty || !rawValue) {
      continue
    }

    styleMap.set(rawProperty.trim().toLowerCase(), rawValue.trim())
  }

  return styleMap
}

function isElementVisible(element: Element) {
  const style = parseStyleMap(element.getAttribute('style'))
  const display =
    (element.getAttribute('display') ?? style.get('display') ?? '').toLowerCase()
  const visibility =
    (element.getAttribute('visibility') ?? style.get('visibility') ?? '').toLowerCase()
  const opacity = parseNumber(element.getAttribute('opacity') ?? style.get('opacity'), 1)

  return display !== 'none' && visibility !== 'hidden' && opacity > 0
}

function collectElementHints(element: Element, inheritedHints: string[]) {
  const hintValues = [...inheritedHints]
  const attributes = ['id', 'class', 'inkscape:label', 'label', 'data-name', 'name']

  for (const attribute of attributes) {
    const value = element.getAttribute(attribute)

    if (value && value.trim()) {
      hintValues.push(value.trim())
    }
  }

  for (const child of Array.from(element.children)) {
    const tagName = child.tagName.toLowerCase()

    if ((tagName === 'title' || tagName === 'desc') && child.textContent?.trim()) {
      hintValues.push(child.textContent.trim())
    }
  }

  return Array.from(new Set(hintValues))
}

function parseCoordinateList(value: string | null | undefined) {
  if (!value) {
    return []
  }

  return value
    .trim()
    .split(/[\s,]+/)
    .map((token) => Number.parseFloat(token))
    .filter((token) => Number.isFinite(token))
}

function collectTextHints(
  element: Element,
  inheritedMatrix: Matrix2D,
): SvgImportTextHint[] {
  const tagName = element.tagName.toLowerCase()

  if (tagName !== 'text' && tagName !== 'tspan') {
    return []
  }

  const value = element.textContent?.replace(/\s+/g, ' ').trim()
  if (!value) {
    return []
  }

  const xValues = parseCoordinateList(element.getAttribute('x'))
  const yValues = parseCoordinateList(element.getAttribute('y'))
  if (xValues.length === 0 || yValues.length === 0) {
    return []
  }

  return [
    {
      position: applyMatrixToPoint(
        {
          x: xValues[0],
          y: yValues[0],
        },
        inheritedMatrix,
      ),
      value,
    },
  ]
}

function pointDistanceToBounds(point: Vector2Mm, bounds: BoundsMm) {
  const dx =
    point.x < bounds.x
      ? bounds.x - point.x
      : point.x > bounds.x + bounds.width
        ? point.x - (bounds.x + bounds.width)
        : 0
  const dy =
    point.y < bounds.y
      ? bounds.y - point.y
      : point.y > bounds.y + bounds.height
        ? point.y - (bounds.y + bounds.height)
        : 0

  return Math.hypot(dx, dy)
}

function attachNearbyTextHints(
  elements: SvgImportElement[],
  textHints: SvgImportTextHint[],
) {
  if (elements.length === 0 || textHints.length === 0) {
    return elements
  }

  const assignedTextHints = new Map<string, string[]>()

  for (const textHint of textHints) {
    let bestElementId: string | undefined
    let bestScore = Number.POSITIVE_INFINITY

    for (const element of elements) {
      const distance = pointDistanceToBounds(textHint.position, element.bounds)
      const distanceThreshold = Math.max(
        70,
        Math.max(element.bounds.width, element.bounds.height) * 4,
      )

      if (distance > distanceThreshold) {
        continue
      }

      const openGeometryPenalty =
        !element.isClosed && element.kind !== 'path' && element.kind !== 'polygon' ? 18 : 0
      const largeSurfacePenalty =
        element.bounds.width * element.bounds.height > 120000 ? 36 : 0
      const score = distance + openGeometryPenalty + largeSurfacePenalty

      if (score < bestScore) {
        bestScore = score
        bestElementId = element.id
      }
    }

    if (!bestElementId) {
      continue
    }

    const nextHints = assignedTextHints.get(bestElementId) ?? []
    nextHints.push(textHint.value)
    assignedTextHints.set(bestElementId, nextHints)
  }

  return elements.map((element) => {
    const matchingTextHints = assignedTextHints.get(element.id)
    if (!matchingTextHints || matchingTextHints.length === 0) {
      return element
    }

    return {
      ...element,
      hints: Array.from(new Set([...element.hints, ...matchingTextHints])),
    }
  })
}

function extractStroke(element: Element) {
  const style = parseStyleMap(element.getAttribute('style'))
  const rawStroke = element.getAttribute('stroke') ?? style.get('stroke')

  if (!rawStroke || rawStroke === 'none') {
    return undefined
  }

  return rawStroke
}

function extractStrokeWidth(element: Element) {
  const style = parseStyleMap(element.getAttribute('style'))
  const rawStrokeWidth = element.getAttribute('stroke-width') ?? style.get('stroke-width')

  if (!rawStrokeWidth) {
    return undefined
  }

  const parsed = parseLength(rawStrokeWidth)

  if (!parsed) {
    return undefined
  }

  return parsed.value
}

function parsePointsAttribute(value: string | null | undefined): Vector2Mm[] {
  if (!value) {
    return []
  }

  const numbers = value
    .trim()
    .split(/[\s,]+/)
    .map((token) => Number.parseFloat(token))
    .filter((token) => Number.isFinite(token))
  const points: Vector2Mm[] = []

  for (let index = 0; index < numbers.length - 1; index += 2) {
    points.push({ x: numbers[index], y: numbers[index + 1] })
  }

  return points
}

function isCommandToken(token: string) {
  return /^[a-zA-Z]$/.test(token)
}

function createSegmentsFromPolylines(polylines: Vector2Mm[][]): SvgImportElementSegment[] {
  const segments: SvgImportElementSegment[] = []

  polylines.forEach((polyline, polylineIndex) => {
    for (let index = 1; index < polyline.length; index += 1) {
      const start = polyline[index - 1]
      const end = polyline[index]

      if (computeSegmentLength(start, end) <= 1e-6) {
        continue
      }

      segments.push({
        polylineIndex,
        start,
        end,
      })
    }
  })

  return segments
}

function parsePathPoints(pathData: string | null | undefined): {
  isClosed: boolean
  polylines: Vector2Mm[][]
  points: Vector2Mm[]
  segments: SvgImportElementSegment[]
} {
  if (!pathData) {
    return { points: [], polylines: [], segments: [], isClosed: false }
  }

  const tokens =
    pathData.match(/[a-zA-Z]|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g) ?? []
  let cursor = { x: 0, y: 0 }
  let subpathStart = { x: 0, y: 0 }
  let index = 0
  let command = ''
  let isClosed = false
  const polylines: Vector2Mm[][] = []
  let currentPolyline: Vector2Mm[] | undefined

  const readNumber = () => {
    if (index >= tokens.length) {
      return undefined
    }

    const value = Number.parseFloat(tokens[index])

    if (!Number.isFinite(value)) {
      return undefined
    }

    index += 1
    return value
  }

  while (index < tokens.length) {
    const nextToken = tokens[index]

    if (isCommandToken(nextToken)) {
      command = nextToken
      index += 1
    }

    if (!command) {
      break
    }

    const isRelative = command === command.toLowerCase()

    if (command.toLowerCase() === 'm') {
      const x = readNumber()
      const y = readNumber()

      if (x === undefined || y === undefined) {
        break
      }

      cursor = isRelative ? { x: cursor.x + x, y: cursor.y + y } : { x, y }
      subpathStart = cursor
      currentPolyline = [{ ...cursor }]
      polylines.push(currentPolyline)

      while (index < tokens.length && !isCommandToken(tokens[index])) {
        const lineX = readNumber()
        const lineY = readNumber()

        if (lineX === undefined || lineY === undefined) {
          break
        }

        cursor = isRelative
          ? { x: cursor.x + lineX, y: cursor.y + lineY }
          : { x: lineX, y: lineY }
        currentPolyline.push({ ...cursor })
      }

      continue
    }

    if (command.toLowerCase() === 'z') {
      cursor = { ...subpathStart }
      currentPolyline?.push({ ...cursor })
      isClosed = true
      continue
    }

    const consumeEndpoint = (x: number | undefined, y: number | undefined) => {
      if (x === undefined || y === undefined) {
        return false
      }

      cursor = isRelative ? { x: cursor.x + x, y: cursor.y + y } : { x, y }
      if (!currentPolyline) {
        currentPolyline = [{ ...cursor }]
        polylines.push(currentPolyline)
      } else {
        currentPolyline.push({ ...cursor })
      }
      return true
    }

    if (command.toLowerCase() === 'l') {
      while (index < tokens.length && !isCommandToken(tokens[index])) {
        if (!consumeEndpoint(readNumber(), readNumber())) {
          break
        }
      }
      continue
    }

    if (command.toLowerCase() === 'h') {
      while (index < tokens.length && !isCommandToken(tokens[index])) {
        const value = readNumber()

        if (value === undefined) {
          break
        }

        cursor = isRelative
          ? { x: cursor.x + value, y: cursor.y }
          : { x: value, y: cursor.y }
        currentPolyline?.push({ ...cursor })
      }
      continue
    }

    if (command.toLowerCase() === 'v') {
      while (index < tokens.length && !isCommandToken(tokens[index])) {
        const value = readNumber()

        if (value === undefined) {
          break
        }

        cursor = isRelative
          ? { x: cursor.x, y: cursor.y + value }
          : { x: cursor.x, y: value }
        currentPolyline?.push({ ...cursor })
      }
      continue
    }

    if (command.toLowerCase() === 'c') {
      while (index < tokens.length && !isCommandToken(tokens[index])) {
        readNumber()
        readNumber()
        readNumber()
        readNumber()

        if (!consumeEndpoint(readNumber(), readNumber())) {
          break
        }
      }
      continue
    }

    if (command.toLowerCase() === 's' || command.toLowerCase() === 'q') {
      while (index < tokens.length && !isCommandToken(tokens[index])) {
        readNumber()
        readNumber()

        if (!consumeEndpoint(readNumber(), readNumber())) {
          break
        }
      }
      continue
    }

    if (command.toLowerCase() === 't') {
      while (index < tokens.length && !isCommandToken(tokens[index])) {
        if (!consumeEndpoint(readNumber(), readNumber())) {
          break
        }
      }
      continue
    }

    if (command.toLowerCase() === 'a') {
      while (index < tokens.length && !isCommandToken(tokens[index])) {
        readNumber()
        readNumber()
        readNumber()
        readNumber()
        readNumber()

        if (!consumeEndpoint(readNumber(), readNumber())) {
          break
        }
      }
      continue
    }

    while (index < tokens.length && !isCommandToken(tokens[index])) {
      index += 1
    }
  }

  const points = polylines.flatMap((polyline) => polyline)

  return {
    polylines,
    points,
    segments: createSegmentsFromPolylines(polylines),
    isClosed,
  }
}

function sampleEllipsePoints(
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  segments = 24,
): Vector2Mm[] {
  const points: Vector2Mm[] = []

  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2
    points.push({
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY,
    })
  }

  return points
}

function computeBounds(points: Vector2Mm[]): BoundsMm | undefined {
  if (points.length === 0) {
    return undefined
  }

  let minX = points[0].x
  let minY = points[0].y
  let maxX = points[0].x
  let maxY = points[0].y

  for (const point of points.slice(1)) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  }
}

function estimateRotationDeg(points: Vector2Mm[]) {
  if (points.length < 2) {
    return 0
  }

  let longestLength = 0
  let rotationDeg = 0

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const dx = current.x - previous.x
    const dy = current.y - previous.y
    const length = Math.hypot(dx, dy)

    if (length > longestLength) {
      longestLength = length
      rotationDeg = (Math.atan2(dy, dx) * 180) / Math.PI
    }
  }

  return rotationDeg
}

function normalizeRotationDeg(rotationDeg: number) {
  let normalized = rotationDeg % 360

  if (normalized < 0) {
    normalized += 360
  }

  return normalized
}

function buildGeometryFromPolylines(
  kind: SvgImportElementKind,
  polylines: Vector2Mm[][],
  isClosed: boolean,
) {
  return {
    kind,
    isClosed,
    polylines,
    points: polylines.flatMap((polyline) => polyline),
    segments: createSegmentsFromPolylines(polylines),
  }
}

function parseElementGeometry(
  element: Element,
  matrix: Matrix2D,
): {
  isClosed: boolean
  kind: SvgImportElementKind
  polylines: Vector2Mm[][]
  points: Vector2Mm[]
  segments: SvgImportElementSegment[]
} | null {
  const tagName = element.tagName.toLowerCase()

  if (tagName === 'line') {
    return buildGeometryFromPolylines(
      'line',
      [
        [
          {
            x: parseNumber(element.getAttribute('x1')),
            y: parseNumber(element.getAttribute('y1')),
          },
          {
            x: parseNumber(element.getAttribute('x2')),
            y: parseNumber(element.getAttribute('y2')),
          },
        ].map((point) => applyMatrixToPoint(point, matrix)),
      ],
      false,
    )
  }

  if (tagName === 'polyline') {
    return buildGeometryFromPolylines(
      'polyline',
      [
        parsePointsAttribute(element.getAttribute('points')).map((point) =>
          applyMatrixToPoint(point, matrix),
        ),
      ],
      false,
    )
  }

  if (tagName === 'polygon') {
    const polygonPoints = parsePointsAttribute(element.getAttribute('points'))

    if (polygonPoints.length > 0) {
      polygonPoints.push({ ...polygonPoints[0] })
    }

    return buildGeometryFromPolylines(
      'polygon',
      [polygonPoints.map((point) => applyMatrixToPoint(point, matrix))],
      true,
    )
  }

  if (tagName === 'rect') {
    const x = parseNumber(element.getAttribute('x'))
    const y = parseNumber(element.getAttribute('y'))
    const width = Math.max(0, parseNumber(element.getAttribute('width')))
    const height = Math.max(0, parseNumber(element.getAttribute('height')))

    return buildGeometryFromPolylines(
      'rect',
      [
        [
          { x, y },
          { x: x + width, y },
          { x: x + width, y: y + height },
          { x, y: y + height },
          { x, y },
        ].map((point) => applyMatrixToPoint(point, matrix)),
      ],
      true,
    )
  }

  if (tagName === 'circle') {
    const centerX = parseNumber(element.getAttribute('cx'))
    const centerY = parseNumber(element.getAttribute('cy'))
    const radius = Math.max(0, parseNumber(element.getAttribute('r')))

    return buildGeometryFromPolylines(
      'circle',
      [
        sampleEllipsePoints(centerX, centerY, radius, radius).map((point) =>
          applyMatrixToPoint(point, matrix),
        ),
      ],
      true,
    )
  }

  if (tagName === 'ellipse') {
    const centerX = parseNumber(element.getAttribute('cx'))
    const centerY = parseNumber(element.getAttribute('cy'))
    const radiusX = Math.max(0, parseNumber(element.getAttribute('rx')))
    const radiusY = Math.max(0, parseNumber(element.getAttribute('ry')))

    return buildGeometryFromPolylines(
      'ellipse',
      [
        sampleEllipsePoints(centerX, centerY, radiusX, radiusY).map((point) =>
          applyMatrixToPoint(point, matrix),
        ),
      ],
      true,
    )
  }

  if (tagName === 'path') {
    const pathPoints = parsePathPoints(element.getAttribute('d'))

    return {
      kind: 'path',
      isClosed: pathPoints.isClosed,
      polylines: pathPoints.polylines.map((polyline) =>
        polyline.map((point) => applyMatrixToPoint(point, matrix)),
      ),
      points: pathPoints.points.map((point) => applyMatrixToPoint(point, matrix)),
      segments: createSegmentsFromPolylines(
        pathPoints.polylines.map((polyline) =>
          polyline.map((point) => applyMatrixToPoint(point, matrix)),
        ),
      ),
    }
  }

  return null
}

function unionBounds(boundsA: BoundsMm, boundsB: BoundsMm): BoundsMm {
  const minX = Math.min(boundsA.x, boundsB.x)
  const minY = Math.min(boundsA.y, boundsB.y)
  const maxX = Math.max(boundsA.x + boundsA.width, boundsB.x + boundsB.width)
  const maxY = Math.max(boundsA.y + boundsA.height, boundsB.y + boundsB.height)

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function parseSvgElements(svgRoot: Element): SvgImportElement[] {
  const elements: SvgImportElement[] = []
  const textHints: SvgImportTextHint[] = []

  const visitNode = (
    currentNode: Element,
    inheritedMatrix: Matrix2D,
    inheritedHints: string[],
  ) => {
    if (!isElementVisible(currentNode)) {
      return
    }

    const localMatrix = parseTransformList(currentNode.getAttribute('transform'))
    const currentMatrix = multiplyMatrices(inheritedMatrix, localMatrix)
    const currentHints = collectElementHints(currentNode, inheritedHints)
    textHints.push(...collectTextHints(currentNode, currentMatrix))
    const geometry = parseElementGeometry(currentNode, currentMatrix)

    if (geometry && geometry.points.length >= 2) {
      const bounds = computeBounds(geometry.points)

      if (bounds) {
        elements.push({
          id: currentNode.getAttribute('id') ?? `${geometry.kind}-${elements.length + 1}`,
          kind: geometry.kind,
          isClosed: geometry.isClosed,
          polylines: geometry.polylines,
          points: geometry.points,
          bounds,
          center: {
            x: bounds.x + bounds.width / 2,
            y: bounds.y + bounds.height / 2,
          },
          rotationDeg: normalizeRotationDeg(estimateRotationDeg(geometry.points)),
          segments: geometry.segments,
          hints: currentHints,
          stroke: extractStroke(currentNode),
          strokeWidth: extractStrokeWidth(currentNode),
        })
      }
    }

    for (const child of Array.from(currentNode.children)) {
      visitNode(child, currentMatrix, currentHints)
    }
  }

  visitNode(svgRoot, identityMatrix(), [])
  return attachNearbyTextHints(elements, textHints)
}

function scoreRectilinearCandidate(element: SvgImportElement) {
  if (!element.isClosed) {
    return 0
  }

  if (element.kind === 'rect') {
    return 1
  }

  const width = Math.max(1e-6, element.bounds.width)
  const height = Math.max(1e-6, element.bounds.height)
  const filledAreaRatio = boundsArea(element.bounds) / Math.max(width * height, 1e-6)
  const perimeter = 2 * (width + height)
  const perimeterRatio = computeElementPathLengthMm(element, 1) / Math.max(perimeter, 1e-6)

  return Math.max(
    0,
    Math.min(
      1,
      1 - Math.abs(1 - Math.min(1.2, filledAreaRatio)) * 0.35 - Math.abs(1 - perimeterRatio) * 0.45,
    ),
  )
}

function suggestPhysicalSizeMm(lengthUnits: number, baseMmPerUnit: number) {
  const rawMm = Math.max(25, lengthUnits * baseMmPerUnit)

  if (rawMm >= 200) {
    return roundMm(Math.round(rawMm / 25) * 25)
  }

  return roundMm(Math.round(rawMm / 5) * 5)
}

function createSurfaceCandidateFromBounds(args: {
  boundsUnits: BoundsMm
  document: SvgImportDocument
  id: string
  kind: SvgImportSurfaceCandidate['kind']
}): SvgImportSurfaceCandidate {
  const { boundsUnits, document, id, kind } = args

  return {
    boundsUnits,
    centerUnits: {
      x: roundMm(boundsUnits.x + boundsUnits.width / 2),
      y: roundMm(boundsUnits.y + boundsUnits.height / 2),
    },
    confidence: kind === 'unknown-rectilinear' ? 0.28 : 0.42,
    containedElementIds: document.elements
      .filter((element) => boundsContainBounds(boundsUnits, element.bounds, 0))
      .map((element) => element.id),
    holeGridEvidence: 0,
    id,
    kind,
    nestingDepth: 0,
    outlinePoints: [
      { x: boundsUnits.x, y: boundsUnits.y },
      { x: boundsUnits.x + boundsUnits.width, y: boundsUnits.y },
      { x: boundsUnits.x + boundsUnits.width, y: boundsUnits.y + boundsUnits.height },
      { x: boundsUnits.x, y: boundsUnits.y + boundsUnits.height },
      { x: boundsUnits.x, y: boundsUnits.y },
    ],
    rectilinearScore: 1,
    rotationDeg: 0,
    sourceElementIds: [],
  }
}

export function detectSvgImportWorkspace(document: SvgImportDocument): SvgImportWorkspaceDetection {
  const documentArea = Math.max(boundsArea(document.bounds), 1e-6)
  const closedCandidates = document.elements
    .filter((element) => {
      const areaRatio = boundsArea(element.bounds) / documentArea

      return (
        element.isClosed &&
        element.bounds.width >= SURFACE_CANDIDATE_MIN_EDGE_UNITS &&
        element.bounds.height >= SURFACE_CANDIDATE_MIN_EDGE_UNITS &&
        areaRatio >= SURFACE_CANDIDATE_MIN_AREA_RATIO &&
        scoreRectilinearCandidate(element) >= 0.58
      )
    })
    .map((element) => {
      const containedElementIds = document.elements
        .filter((candidate) => candidate.id !== element.id && boundsContainBounds(element.bounds, candidate.bounds, 0))
        .map((candidate) => candidate.id)
      const holeGridEvidence = document.elements.filter((candidate) => {
        const candidateArea = boundsArea(candidate.bounds)

        return (
          candidate.id !== element.id &&
          boundsContainBounds(element.bounds, candidate.bounds, 0) &&
          candidateArea > 0 &&
          candidateArea <= boundsArea(element.bounds) * 0.0025
        )
      }).length

      return {
        boundsUnits: element.bounds,
        centerUnits: element.center,
        confidence: 0,
        containedElementIds,
        holeGridEvidence,
        id: element.id,
        kind: 'unknown-rectilinear' as const,
        nestingDepth: 0,
        outlinePoints: element.points,
        rectilinearScore: scoreRectilinearCandidate(element),
        rotationDeg: element.rotationDeg,
        sourceElementIds: [element.id],
      }
    })
    .sort((left, right) => boundsArea(right.boundsUnits) - boundsArea(left.boundsUnits))

  const backgroundFrameCandidateIds = new Set(
    closedCandidates
      .filter((candidate) => {
        const areaRatio = boundsArea(candidate.boundsUnits) / documentArea
        if (areaRatio < 0.88) {
          return false
        }

        const matchesDocumentFrame =
          Math.abs(candidate.boundsUnits.x - document.bounds.x) <= 1 &&
          Math.abs(candidate.boundsUnits.y - document.bounds.y) <= 1 &&
          Math.abs(candidate.boundsUnits.width - document.bounds.width) <= 1 &&
          Math.abs(candidate.boundsUnits.height - document.bounds.height) <= 1

        if (!matchesDocumentFrame) {
          return false
        }

        const nestedChildren = closedCandidates.filter(
          (other) =>
            other.id !== candidate.id &&
            boundsContainBounds(candidate.boundsUnits, other.boundsUnits, 0) &&
            boundsArea(other.boundsUnits) < boundsArea(candidate.boundsUnits) * 0.86,
        )

        if (nestedChildren.length !== 1) {
          return false
        }

        const child = nestedChildren[0]
        const childAreaRatio =
          boundsArea(child.boundsUnits) / Math.max(boundsArea(candidate.boundsUnits), 1e-6)
        const childWidthRatio =
          child.boundsUnits.width / Math.max(candidate.boundsUnits.width, 1e-6)
        const childHeightRatio =
          child.boundsUnits.height / Math.max(candidate.boundsUnits.height, 1e-6)
        const childCarriesGrid =
          child.holeGridEvidence >= 6 &&
          child.holeGridEvidence >= candidate.holeGridEvidence * 0.72

        return (
          childAreaRatio >= 0.34 &&
          childWidthRatio >= 0.5 &&
          childHeightRatio >= 0.5 &&
          childCarriesGrid
        )
      })
      .map((candidate) => candidate.id),
  )

  if (closedCandidates.length === 0) {
    return {
      breadboardCandidates: [],
      orphanElementIds: document.elements.map((element) => element.id),
      warnings: ['No large rectilinear board/table outlines were detected. Using full SVG bounds as the import surface.'],
      workspaceKind: 'unknown',
    }
  }

  const candidates = closedCandidates
    .filter((candidate) => !backgroundFrameCandidateIds.has(candidate.id))
    .map((candidate) => {
      const nestingDepth = closedCandidates.filter(
      (other) =>
        other.id !== candidate.id &&
        boundsContainBounds(other.boundsUnits, candidate.boundsUnits, 0),
      ).length
      const containsOtherCandidateCount = closedCandidates.filter(
      (other) =>
        other.id !== candidate.id &&
        boundsContainBounds(candidate.boundsUnits, other.boundsUnits, 0),
      ).length
      const baseConfidence = Math.min(
        0.96,
        candidate.rectilinearScore * 0.52 +
          Math.min(0.26, containsOtherCandidateCount * 0.12) +
          Math.min(0.18, candidate.holeGridEvidence * 0.01),
      )

      return {
        ...candidate,
        confidence: baseConfidence,
        nestingDepth,
        kind:
          candidate.holeGridEvidence >= 6
            ? ('breadboard' as const)
            : containsOtherCandidateCount >= 2
              ? ('table' as const)
              : ('unknown-rectilinear' as const),
      }
    })

  const tableCandidate = candidates.find((candidate) => {
    const containsBoardLikeChildren = candidates.filter(
      (other) =>
        other.id !== candidate.id &&
        boundsContainBounds(candidate.boundsUnits, other.boundsUnits, 0) &&
        boundsArea(other.boundsUnits) < boundsArea(candidate.boundsUnits) * 0.82,
    ).length

    return candidate.kind === 'table' || containsBoardLikeChildren >= 2
  })

  const breadboardCandidates = (tableCandidate
    ? candidates.filter(
        (candidate) =>
          candidate.id !== tableCandidate.id &&
          boundsContainBounds(tableCandidate.boundsUnits, candidate.boundsUnits, 0) &&
          boundsArea(candidate.boundsUnits) < boundsArea(tableCandidate.boundsUnits) * 0.82,
      )
    : candidates
  )
    .filter((candidate) => candidate.rectilinearScore >= 0.58)
    .map((candidate, index) => ({
      ...candidate,
      confidence: Math.min(0.95, candidate.confidence + (candidate.holeGridEvidence >= 6 ? 0.18 : 0.06)),
      kind: 'breadboard' as const,
      id: candidate.id || `breadboard-candidate-${index + 1}`,
    }))

  const orphanElementIds = document.elements
    .filter(
      (element) =>
        !breadboardCandidates.some((candidate) => candidate.sourceElementIds.includes(element.id)) &&
        tableCandidate?.sourceElementIds.includes(element.id) !== true,
    )
    .map((element) => element.id)

  const warnings: string[] = []
  if (tableCandidate && breadboardCandidates.length === 0) {
    warnings.push('Detected a likely table outline, but no breadboard outlines inside it.')
  }
  if (!tableCandidate && breadboardCandidates.length > 1) {
    warnings.push('Detected multiple breadboard-like outlines without a clear enclosing table outline.')
  }

  return {
    breadboardCandidates,
    orphanElementIds,
    tableCandidate,
    warnings,
    workspaceKind:
      breadboardCandidates.length > 1 || tableCandidate
        ? 'optical-table'
        : breadboardCandidates.length === 1
          ? 'single-breadboard'
          : 'unknown',
  }
}

function createWorkspaceSurfaceConfig(args: {
  boundsUnits: BoundsMm
  candidateId?: string
  id: string
  kind: 'breadboard' | 'table'
  label: string
  physicalHeightMm: number
  physicalWidthMm: number
}): SvgImportWorkspaceSurfaceConfig {
  return {
    boundsUnits: args.boundsUnits,
    candidateId: args.candidateId,
    id: args.id,
    kind: args.kind,
    label: args.label,
    physicalHeightMm: roundMm(Math.max(25, args.physicalHeightMm)),
    physicalWidthMm: roundMm(Math.max(25, args.physicalWidthMm)),
  }
}

export function createInitialSvgImportWorkspaceConfig(args: {
  detection: SvgImportWorkspaceDetection
  document: SvgImportDocument
}): SvgImportWorkspaceConfig {
  const { detection, document } = args
  const fallbackSurface = createSurfaceCandidateFromBounds({
    boundsUnits: document.bounds,
    document,
    id: 'document-bounds',
    kind: detection.workspaceKind === 'optical-table' ? 'table' : 'breadboard',
  })

  if (detection.workspaceKind === 'optical-table') {
    const tableCandidate = detection.tableCandidate ?? fallbackSurface
    const breadboardCandidates =
      detection.breadboardCandidates.length > 0
        ? detection.breadboardCandidates
        : [
            createSurfaceCandidateFromBounds({
              boundsUnits: {
                x: tableCandidate.boundsUnits.x + tableCandidate.boundsUnits.width * 0.32,
                y: tableCandidate.boundsUnits.y + tableCandidate.boundsUnits.height * 0.3,
                width: tableCandidate.boundsUnits.width * 0.36,
                height: tableCandidate.boundsUnits.height * 0.4,
              },
              document,
              id: 'synthetic-board-1',
              kind: 'breadboard',
            }),
          ]

    return {
      workspaceKind: 'optical-table',
      table: createWorkspaceSurfaceConfig({
        boundsUnits: tableCandidate.boundsUnits,
        candidateId: tableCandidate.id,
        id: 'table-primary',
        kind: 'table',
        label: 'Optical Table',
        physicalHeightMm: suggestPhysicalSizeMm(
          tableCandidate.boundsUnits.height,
          document.scale.baseMmPerUnit,
        ),
        physicalWidthMm: suggestPhysicalSizeMm(
          tableCandidate.boundsUnits.width,
          document.scale.baseMmPerUnit,
        ),
      }),
      breadboards: breadboardCandidates.map((candidate, index) =>
        createWorkspaceSurfaceConfig({
          boundsUnits: candidate.boundsUnits,
          candidateId: candidate.id,
          id: `breadboard-${index + 1}`,
          kind: 'breadboard',
          label: `Breadboard ${index + 1}`,
          physicalHeightMm: suggestPhysicalSizeMm(
            candidate.boundsUnits.height,
            document.scale.baseMmPerUnit,
          ),
          physicalWidthMm: suggestPhysicalSizeMm(
            candidate.boundsUnits.width,
            document.scale.baseMmPerUnit,
          ),
        }),
      ),
    }
  }

  const boardCandidate = detection.breadboardCandidates[0] ?? fallbackSurface

  return {
    workspaceKind: 'single-breadboard',
    breadboards: [
      createWorkspaceSurfaceConfig({
        boundsUnits: boardCandidate.boundsUnits,
        candidateId: boardCandidate.id,
        id: 'breadboard-1',
        kind: 'breadboard',
        label: 'Breadboard',
        physicalHeightMm: suggestPhysicalSizeMm(
          boardCandidate.boundsUnits.height,
          document.scale.baseMmPerUnit,
        ),
        physicalWidthMm: suggestPhysicalSizeMm(
          boardCandidate.boundsUnits.width,
          document.scale.baseMmPerUnit,
        ),
      }),
    ],
  }
}

function getPrimaryWorkspaceSurfaceConfig(config: SvgImportWorkspaceConfig) {
  return config.workspaceKind === 'optical-table' ? config.table : config.breadboards[0]
}

function copyScene(scene: SceneDocument): SceneDocument {
  return JSON.parse(JSON.stringify(scene)) as SceneDocument
}

function cloneVector2Mm(point?: Vector2Mm) {
  if (!point) {
    return undefined
  }

  return {
    x: point.x,
    y: point.y,
  }
}

function cloneWorkspaceSurfaceConfig(
  surface: SvgImportWorkspaceSurfaceConfig,
): SvgImportWorkspaceSurfaceConfig {
  return {
    ...surface,
    boundsUnits: {
      ...surface.boundsUnits,
    },
  }
}

function cloneWorkspaceConfig(
  config?: SvgImportWorkspaceConfig,
): SvgImportWorkspaceConfig | undefined {
  if (!config) {
    return undefined
  }

  return {
    breadboards: config.breadboards.map((surface) => cloneWorkspaceSurfaceConfig(surface)),
    table: config.table ? cloneWorkspaceSurfaceConfig(config.table) : undefined,
    workspaceKind: config.workspaceKind,
  }
}

function clonePreviewItem(item: ImportPreviewItem): ImportPreviewItem {
  return {
    ...item,
    bounds: {
      ...item.bounds,
    },
    center: {
      ...item.center,
    },
    editability: {
      ...item.editability,
    },
    sourceElementIds: [...item.sourceElementIds],
    suggestions: item.suggestions.map((suggestion) => ({ ...suggestion })),
  }
}

function clonePreviewItems(items: ImportPreviewItem[]) {
  return items.map((item) => clonePreviewItem(item))
}

function snapshotPreviewItem(item: ImportPreviewItem) {
  return {
    allowKeepAsLinework: item.allowKeepAsLinework,
    bounds: item.bounds,
    center: item.center,
    componentType: item.componentType,
    disposition: item.disposition,
    elementId: item.elementId,
    id: item.id,
    kind: item.kind,
    rotationQuarterTurns: item.rotationQuarterTurns,
    sourceElementIds: item.sourceElementIds,
    sourceKind: item.sourceKind,
    variantId: item.variantId,
  }
}

function snapshotWorkspaceSurfaceConfig(surface: SvgImportWorkspaceSurfaceConfig) {
  return {
    boundsUnits: surface.boundsUnits,
    candidateId: surface.candidateId,
    id: surface.id,
    kind: surface.kind,
    label: surface.label,
    physicalHeightMm: surface.physicalHeightMm,
    physicalWidthMm: surface.physicalWidthMm,
  }
}

function snapshotWorkspaceConfig(config?: SvgImportWorkspaceConfig) {
  if (!config) {
    return undefined
  }

  return {
    breadboards: config.breadboards.map((surface) => snapshotWorkspaceSurfaceConfig(surface)),
    table: config.table ? snapshotWorkspaceSurfaceConfig(config.table) : undefined,
    workspaceKind: config.workspaceKind,
  }
}

function areImportSnapshotsEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function createReplaceSceneTemplate(
  scene: SceneDocument,
  workspaceOverride?: SceneDocument['workspace'],
) {
  const nextScene = copyScene(scene)
  nextScene.workspace = workspaceOverride ?? nextScene.workspace
  nextScene.metadata = {
    ...nextScene.metadata,
    name: `${scene.metadata.name} (SVG Import)`,
  }
  nextScene.components = []
  nextScene.annotations = []
  return nextScene
}

function createAppendBreadboardSceneTemplate(args: {
  centerMm?: Vector2Mm
  importWorkspace?: SvgImportWorkspaceConfig
  scene: SceneDocument
}) {
  const nextScene = copyScene(args.scene)

  if (
    nextScene.workspace.kind !== 'optical-table' ||
    !args.importWorkspace ||
    args.importWorkspace.breadboards.length === 0
  ) {
    return nextScene
  }

  const importedSurface = args.importWorkspace.breadboards[0]
  const breadboardModel = createBreadboardModelFromImportSurface(importedSurface)
  const centerMm =
    args.centerMm ?? {
      x: roundMm(nextScene.workspace.table.widthMm / 2),
      y: roundMm(nextScene.workspace.table.heightMm / 2),
    }
  const anchorMm = getBreadboardAnchorForCenterMm(breadboardModel, centerMm)
  const existingIds = new Set(nextScene.workspace.breadboards.map((breadboard) => breadboard.id))
  let suffix = nextScene.workspace.breadboards.length + 1
  let nextId = importedSurface.id || `breadboard-${suffix}`

  while (existingIds.has(nextId)) {
    suffix += 1
    nextId = `breadboard-${suffix}`
  }

  nextScene.workspace = {
    ...nextScene.workspace,
    breadboards: [
      ...nextScene.workspace.breadboards,
      createBreadboardInstance({
        anchorMm,
        id: nextId,
        label: importedSurface.label || `Breadboard ${suffix}`,
        model: breadboardModel,
      }),
    ],
  }

  return nextScene
}

function computeSegmentLength(start: Vector2Mm, end: Vector2Mm) {
  return Math.hypot(end.x - start.x, end.y - start.y)
}

function normalizeHalfTurnAngle(angleDeg: number) {
  let normalized = angleDeg % 180

  if (normalized < 0) {
    normalized += 180
  }

  return normalized
}

function angleDistanceHalfTurn(angleA: number, angleB: number) {
  const difference = Math.abs(normalizeHalfTurnAngle(angleA) - normalizeHalfTurnAngle(angleB))
  return Math.min(difference, 180 - difference)
}

function distancePointToSegment(point: Vector2Mm, segmentStart: Vector2Mm, segmentEnd: Vector2Mm) {
  const segmentDx = segmentEnd.x - segmentStart.x
  const segmentDy = segmentEnd.y - segmentStart.y
  const segmentLengthSquared = segmentDx * segmentDx + segmentDy * segmentDy

  if (segmentLengthSquared <= 1e-9) {
    return computeSegmentLength(point, segmentStart)
  }

  const projection =
    ((point.x - segmentStart.x) * segmentDx + (point.y - segmentStart.y) * segmentDy) /
    segmentLengthSquared
  const clampedProjection = Math.max(0, Math.min(1, projection))
  const projectedPoint = {
    x: segmentStart.x + segmentDx * clampedProjection,
    y: segmentStart.y + segmentDy * clampedProjection,
  }

  return computeSegmentLength(point, projectedPoint)
}

function boundsContainBounds(outerBounds: BoundsMm, innerBounds: BoundsMm, paddingUnits = 0) {
  const outerLeft = outerBounds.x - paddingUnits
  const outerTop = outerBounds.y - paddingUnits
  const outerRight = outerBounds.x + outerBounds.width + paddingUnits
  const outerBottom = outerBounds.y + outerBounds.height + paddingUnits
  const innerLeft = innerBounds.x
  const innerTop = innerBounds.y
  const innerRight = innerBounds.x + innerBounds.width
  const innerBottom = innerBounds.y + innerBounds.height

  return (
    innerLeft >= outerLeft &&
    innerRight <= outerRight &&
    innerTop >= outerTop &&
    innerBottom <= outerBottom
  )
}

function computeElementPathLengthMm(element: SvgImportElement, millimetersPerUnit: number) {
  const pathLengthUnits = element.segments.reduce(
    (sum, segment) => sum + computeSegmentLength(segment.start, segment.end),
    0,
  )

  return pathLengthUnits * millimetersPerUnit
}

function computeElementMetrics(
  element: SvgImportElement,
  millimetersPerUnit: number,
): SvgImportElementMetrics {
  const widthMm = element.bounds.width * millimetersPerUnit
  const heightMm = element.bounds.height * millimetersPerUnit
  const diagonalMm = Math.hypot(widthMm, heightMm)
  const smallestDimensionMm = Math.max(0, Math.min(widthMm, heightMm))
  const largestDimensionMm = Math.max(widthMm, heightMm)
  const segmentCount = Math.max(0, element.points.length - 1)

  return {
    widthMm,
    heightMm,
    diagonalMm,
    smallestDimensionMm,
    segmentCount,
    pathLengthMm: computeElementPathLengthMm(element, millimetersPerUnit),
    aspectRatio: largestDimensionMm / Math.max(0.2, smallestDimensionMm),
    strokeWidthMm: Math.max(
      0.1,
      (element.strokeWidth ?? DEFAULT_ANNOTATION_STROKE_MM) * millimetersPerUnit,
    ),
    angleToCardinalDeg: Math.min(
      angleDistanceHalfTurn(element.rotationDeg, 0),
      angleDistanceHalfTurn(element.rotationDeg, 90),
    ),
    angleToDiagonalDeg: Math.min(
      angleDistanceHalfTurn(element.rotationDeg, 45),
      angleDistanceHalfTurn(element.rotationDeg, 135),
    ),
  }
}

function incrementMapCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1)
}

interface SvgImportTerminalPoint {
  directionDeg: number
  elementId: string
  isStart: boolean
  point: Vector2Mm
  polylineIndex: number
}

function boundsArea(bounds: BoundsMm) {
  return Math.max(0, bounds.width) * Math.max(0, bounds.height)
}

function boundsContainsPoint(bounds: BoundsMm, point: Vector2Mm, paddingUnits = 0) {
  return (
    point.x >= bounds.x - paddingUnits &&
    point.x <= bounds.x + bounds.width + paddingUnits &&
    point.y >= bounds.y - paddingUnits &&
    point.y <= bounds.y + bounds.height + paddingUnits
  )
}

function expandBounds(bounds: BoundsMm, paddingUnits: number): BoundsMm {
  return {
    x: bounds.x - paddingUnits,
    y: bounds.y - paddingUnits,
    width: bounds.width + paddingUnits * 2,
    height: bounds.height + paddingUnits * 2,
  }
}

function computeAngleDeg(start: Vector2Mm, end: Vector2Mm) {
  return normalizeRotationDeg((Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI)
}

function getElementTerminalPoints(element: SvgImportElement): SvgImportTerminalPoint[] {
  if (element.isClosed) {
    return []
  }

  const terminals: SvgImportTerminalPoint[] = []

  element.polylines.forEach((polyline, polylineIndex) => {
    if (polyline.length < 2) {
      return
    }

    terminals.push({
      elementId: element.id,
      isStart: true,
      point: polyline[0],
      polylineIndex,
      directionDeg: computeAngleDeg(polyline[0], polyline[1]),
    })
    terminals.push({
      elementId: element.id,
      isStart: false,
      point: polyline[polyline.length - 1],
      polylineIndex,
      directionDeg: computeAngleDeg(polyline[polyline.length - 2], polyline[polyline.length - 1]),
    })
  })

  return terminals
}

function createReviewBoundsAroundPoints(points: Vector2Mm[], paddingUnits: number) {
  const bounds = computeBounds(points)

  return bounds ? expandBounds(bounds, paddingUnits) : undefined
}

function createMissingJunctionReviewItem(args: {
  id: string
  left: SvgImportTerminalPoint
  right: SvgImportTerminalPoint
  millimetersPerUnit: number
}): SvgImportReviewItem | undefined {
  const midpoint = {
    x: roundMm((args.left.point.x + args.right.point.x) / 2),
    y: roundMm((args.left.point.y + args.right.point.y) / 2),
  }
  const bounds = createReviewBoundsAroundPoints(
    [args.left.point, args.right.point, midpoint],
    Math.max(1.5, 4 / Math.max(args.millimetersPerUnit, 1e-6)),
  )

  if (!bounds) {
    return undefined
  }

  return {
    allowKeepAsLinework: true,
    bounds,
    center: midpoint,
    id: args.id,
    kind: 'missing-junction',
    label: 'Potential missing beam-turn optic',
    sourceElementIds: [args.left.elementId, args.right.elementId],
    suggestions: [
      {
        componentType: 'mirror',
        confidence: 0.72,
        reason: 'Near-orthogonal beam lines often indicate a steering mirror at the turn.',
        source: 'heuristic',
      },
      {
        componentType: 'beamsplitter',
        confidence: 0.54,
        reason: 'A missing plate optic can also produce a beam turn at a near-right-angle junction.',
        source: 'heuristic',
      },
    ],
  }
}

function buildHeuristicContext(
  document: SvgImportDocument,
  millimetersPerUnit: number,
): SvgImportHeuristicContext {
  const metricsById = new Map<string, SvgImportElementMetrics>()

  for (const element of document.elements) {
    metricsById.set(element.id, computeElementMetrics(element, millimetersPerUnit))
  }

  const openElements = document.elements.filter(
    (element) => !element.isClosed && (element.kind === 'line' || element.kind === 'polyline' || element.kind === 'path'),
  )
  const closedElements = document.elements.filter((element) => element.isClosed)
  const beamLineElementIds = new Set<string>()
  const decorativeOpenElementIds = new Set<string>()
  const concentricCountById = new Map<string, number>()
  const crossingLineCountById = new Map<string, number>()
  const enclosedOpenLineCountById = new Map<string, number>()
  const junctionReviewItems: SvgImportReviewItem[] = []
  const lineworkReviewElementIds = new Set<string>()

  for (const element of openElements) {
    const metrics = metricsById.get(element.id)

    if (!metrics) {
      continue
    }

    const hintCorpus = toNormalizedHintCorpus(element.hints)
    const hasBeamHint = BEAM_HINT_KEYWORDS.some((keyword) => hintCorpus.includes(keyword))
    const isLongThinCardinalStroke =
      metrics.pathLengthMm >= BEAM_LINE_MIN_LENGTH_MM &&
      metrics.strokeWidthMm <= BEAM_LINE_MAX_STROKE_MM &&
      metrics.aspectRatio >= BEAM_LINE_MIN_ASPECT_RATIO &&
      metrics.angleToCardinalDeg <= 14
    const isPolylineBeamCandidate =
      metrics.pathLengthMm >= BEAM_LINE_MIN_LENGTH_MM * 1.2 &&
      metrics.strokeWidthMm <= BEAM_LINE_MAX_STROKE_MM &&
      metrics.segmentCount >= 3

    if (hasBeamHint || isLongThinCardinalStroke || isPolylineBeamCandidate) {
      beamLineElementIds.add(element.id)
    }
  }

  const terminals = openElements.flatMap((element) => getElementTerminalPoints(element))
  const junctionKeys = new Set<string>()

  for (let leftIndex = 0; leftIndex < terminals.length; leftIndex += 1) {
    const leftTerminal = terminals[leftIndex]
    const leftMetrics = metricsById.get(leftTerminal.elementId)

    if (!leftMetrics) {
      continue
    }

    for (let rightIndex = leftIndex + 1; rightIndex < terminals.length; rightIndex += 1) {
      const rightTerminal = terminals[rightIndex]

      if (leftTerminal.elementId === rightTerminal.elementId) {
        continue
      }

      const rightMetrics = metricsById.get(rightTerminal.elementId)

      if (!rightMetrics) {
        continue
      }

      const gapMm =
        computeSegmentLength(leftTerminal.point, rightTerminal.point) * millimetersPerUnit

      if (gapMm > NEAR_CONNECTED_LINE_REVIEW_GAP_MM) {
        continue
      }

      const bothThin =
        leftMetrics.strokeWidthMm <= BEAM_LINE_MAX_STROKE_MM * 1.4 &&
        rightMetrics.strokeWidthMm <= BEAM_LINE_MAX_STROKE_MM * 1.4 &&
        leftMetrics.pathLengthMm >= 4 &&
        rightMetrics.pathLengthMm >= 4

      if (!bothThin) {
        continue
      }

      const leftIsBeam = beamLineElementIds.has(leftTerminal.elementId)
      const rightIsBeam = beamLineElementIds.has(rightTerminal.elementId)

      if (gapMm <= NEAR_CONNECTED_GAP_MM && (leftIsBeam || rightIsBeam)) {
        beamLineElementIds.add(leftTerminal.elementId)
        beamLineElementIds.add(rightTerminal.elementId)
      } else if (leftIsBeam || rightIsBeam) {
        if (!leftIsBeam) {
          lineworkReviewElementIds.add(leftTerminal.elementId)
        }
        if (!rightIsBeam) {
          lineworkReviewElementIds.add(rightTerminal.elementId)
        }
      }

      const turnDeltaDeg = angleDistanceHalfTurn(
        leftTerminal.directionDeg,
        rightTerminal.directionDeg,
      )
      const midpoint = {
        x: (leftTerminal.point.x + rightTerminal.point.x) / 2,
        y: (leftTerminal.point.y + rightTerminal.point.y) / 2,
      }
      const overlapsClosedGeometry = closedElements.some((closedElement) =>
        boundsContainsPoint(
          closedElement.bounds,
          midpoint,
          Math.max(1.2, 4 / Math.max(millimetersPerUnit, 1e-6)),
        ),
      )

      if (
        gapMm <= NEAR_CONNECTED_LINE_REVIEW_GAP_MM &&
        turnDeltaDeg >= JUNCTION_TURN_MIN_DEG &&
        turnDeltaDeg <= JUNCTION_TURN_MAX_DEG &&
        (leftIsBeam || rightIsBeam) &&
        !overlapsClosedGeometry
      ) {
        const junctionKey = [leftTerminal.elementId, rightTerminal.elementId].sort().join('::')

        if (!junctionKeys.has(junctionKey)) {
          const reviewItem = createMissingJunctionReviewItem({
            id: `junction-${junctionKeys.size + 1}`,
            left: leftTerminal,
            millimetersPerUnit,
            right: rightTerminal,
          })

          if (reviewItem) {
            junctionReviewItems.push(reviewItem)
            junctionKeys.add(junctionKey)
          }
        }
      }
    }
  }

  const decorativePaddingUnits = DECORATIVE_LINE_BOUNDARY_PADDING_MM / Math.max(millimetersPerUnit, 1e-6)

  for (const openElement of openElements) {
    const openMetrics = metricsById.get(openElement.id)

    if (!openMetrics || beamLineElementIds.has(openElement.id)) {
      continue
    }

    for (const closedElement of closedElements) {
      if (closedElement.id === openElement.id) {
        continue
      }

      const closedMetrics = metricsById.get(closedElement.id)

      if (!closedMetrics || closedMetrics.diagonalMm < 8) {
        continue
      }

      if (
        boundsContainBounds(
          closedElement.bounds,
          openElement.bounds,
          decorativePaddingUnits,
        ) &&
        openMetrics.pathLengthMm <=
          closedMetrics.diagonalMm * DECORATIVE_LINE_MAX_DIAGONAL_RATIO
      ) {
        decorativeOpenElementIds.add(openElement.id)
        incrementMapCount(enclosedOpenLineCountById, closedElement.id)
        break
      }
    }
  }

  const circleLikeElements = closedElements.filter(
    (element) => element.kind === 'circle' || element.kind === 'ellipse',
  )

  for (let outerIndex = 0; outerIndex < circleLikeElements.length; outerIndex += 1) {
    const firstElement = circleLikeElements[outerIndex]
    const firstMetrics = metricsById.get(firstElement.id)

    if (!firstMetrics) {
      continue
    }

    const firstRadiusMm = Math.max(0.5, Math.max(firstMetrics.widthMm, firstMetrics.heightMm) / 2)

    for (let innerIndex = outerIndex + 1; innerIndex < circleLikeElements.length; innerIndex += 1) {
      const secondElement = circleLikeElements[innerIndex]
      const secondMetrics = metricsById.get(secondElement.id)

      if (!secondMetrics) {
        continue
      }

      const secondRadiusMm = Math.max(0.5, Math.max(secondMetrics.widthMm, secondMetrics.heightMm) / 2)
      const centerDistanceMm =
        computeSegmentLength(firstElement.center, secondElement.center) * millimetersPerUnit

      if (
        centerDistanceMm <= Math.max(1.5, Math.min(firstRadiusMm, secondRadiusMm) * 0.35) &&
        Math.abs(firstRadiusMm - secondRadiusMm) >= 1.2
      ) {
        incrementMapCount(concentricCountById, firstElement.id)
        incrementMapCount(concentricCountById, secondElement.id)
      }
    }
  }

  for (const circleLikeElement of circleLikeElements) {
    const circleMetrics = metricsById.get(circleLikeElement.id)

    if (!circleMetrics) {
      continue
    }

    const radiusMm = Math.max(0.8, Math.max(circleMetrics.widthMm, circleMetrics.heightMm) / 2)

    for (const openElement of openElements) {
      const openMetrics = metricsById.get(openElement.id)

      if (!openMetrics || openMetrics.pathLengthMm < radiusMm * 1.2) {
        continue
      }

      let crossesCenter = false

      for (let index = 1; index < openElement.points.length; index += 1) {
        const distanceUnits = distancePointToSegment(
          circleLikeElement.center,
          openElement.points[index - 1],
          openElement.points[index],
        )
        const distanceMm = distanceUnits * millimetersPerUnit

        if (distanceMm <= radiusMm * 0.24) {
          crossesCenter = true
          break
        }
      }

      if (crossesCenter) {
        incrementMapCount(crossingLineCountById, circleLikeElement.id)
      }
    }
  }

  return {
    metricsById,
    beamLineElementIds,
    decorativeOpenElementIds,
    concentricCountById,
    crossingLineCountById,
    enclosedOpenLineCountById,
    junctionReviewItems,
    lineworkReviewElementIds,
  }
}

function toNormalizedHintCorpus(hints: string[]) {
  return hints.map((hint) => normalizeHintValue(hint)).join(' ')
}

function inferDeterministicTypeFromHints(hints: string[]): ComponentType | undefined {
  const corpus = toNormalizedHintCorpus(hints)

  for (const entry of COMPONENT_KEYWORD_MAP) {
    if (
      entry.keywords.some((keyword) => corpus.includes(normalizeHintValue(keyword)))
    ) {
      return entry.type
    }
  }

  return undefined
}

function isOpenGeometryElement(element: SvgImportElement) {
  return !element.isClosed && (element.kind === 'line' || element.kind === 'polyline' || element.kind === 'path')
}

function pushSuggestion(
  scores: Map<ComponentType, SvgImportSuggestion>,
  suggestion: SvgImportSuggestion,
) {
  const existing = scores.get(suggestion.componentType)

  if (!existing || suggestion.confidence > existing.confidence) {
    scores.set(suggestion.componentType, suggestion)
  }
}

function createHeuristicSuggestions(
  element: SvgImportElement,
  context: SvgImportHeuristicContext,
  options?: {
    allowDeterministicHintBoost: boolean
  },
): SvgImportSuggestion[] {
  const metrics = context.metricsById.get(element.id)

  if (!metrics) {
    return []
  }

  const deterministicType = options?.allowDeterministicHintBoost
    ? inferDeterministicTypeFromHints(element.hints)
    : undefined
  const isBeamLine = context.beamLineElementIds.has(element.id)
  const isDecorativeOpenElement = context.decorativeOpenElementIds.has(element.id)

  if ((isBeamLine || isDecorativeOpenElement) && !deterministicType) {
    return []
  }

  const largestDimensionMm = Math.max(metrics.widthMm, metrics.heightMm)
  const smallestDimensionMm = Math.min(metrics.widthMm, metrics.heightMm)
  const aspectRatio = metrics.aspectRatio
  const enclosedOpenLineCount = context.enclosedOpenLineCountById.get(element.id) ?? 0
  const hintCorpus = toNormalizedHintCorpus(element.hints)
  const hasStageHint =
    hintCorpus.includes(' stage ') ||
    hintCorpus.includes(' translation ') ||
    hintCorpus.includes(' pt1 ') ||
    hintCorpus.includes(' pt3 ') ||
    hintCorpus.includes(' st1xy ') ||
    hintCorpus.includes(' delay ')
  const crossingLineCount = context.crossingLineCountById.get(element.id) ?? 0
  const concentricCount = context.concentricCountById.get(element.id) ?? 0
  const scores = new Map<ComponentType, SvgImportSuggestion>()

  if (
    !element.isClosed &&
    (element.kind === 'line' || (metrics.segmentCount <= 2 && metrics.pathLengthMm >= 6)) &&
    metrics.pathLengthMm <= MAX_REASONABLE_MIRROR_LENGTH_MM &&
    metrics.angleToDiagonalDeg <= 17 &&
    metrics.angleToDiagonalDeg < metrics.angleToCardinalDeg
  ) {
    const confidence =
      metrics.angleToDiagonalDeg <= 9 && metrics.pathLengthMm <= 32 ? 0.84 : 0.68
    pushSuggestion(scores, {
      componentType: 'mirror',
      confidence,
      reason:
        confidence >= 0.8
          ? 'Diagonal short line matches a planar mirror edge.'
          : 'Diagonal line resembles a mirror element.',
      source: 'heuristic',
    })
  }

  if ((element.kind === 'circle' || element.kind === 'ellipse') && largestDimensionMm >= 6) {
    const lensConfidence = crossingLineCount > 0 || concentricCount > 0 ? 0.56 : 0.74
    pushSuggestion(scores, {
      componentType: 'lens',
      confidence: lensConfidence,
      reason: 'Circular or elliptical optic symbol often maps to a lens.',
      source: 'heuristic',
    })

    if (crossingLineCount > 0) {
      pushSuggestion(scores, {
        componentType: 'polarizer',
        confidence: 0.84,
        reason: 'Circle crossed by a line strongly resembles a polarizer symbol.',
        source: 'heuristic',
      })
      pushSuggestion(scores, {
        componentType: 'waveplate',
        confidence: 0.76,
        reason: 'Circle crossed by a line can represent a waveplate.',
        source: 'heuristic',
      })
    }

    if (concentricCount > 0) {
      pushSuggestion(scores, {
        componentType: 'iris',
        confidence: 0.9,
        reason: 'Concentric circular rings strongly indicate an iris/aperture.',
        source: 'heuristic',
      })
    }
  }

  if (
    (element.kind === 'rect' || element.kind === 'polygon') &&
    largestDimensionMm >= 8 &&
    aspectRatio <= 1.5
  ) {
    pushSuggestion(scores, {
      componentType: 'beamsplitter',
      confidence: Math.min(0.88, 0.68 + enclosedOpenLineCount * 0.09),
      reason:
        enclosedOpenLineCount > 0
          ? 'Near-square plate with internal linework resembles a beamsplitter symbol.'
          : 'Near-square plate geometry resembles a beamsplitter plate.',
      source: 'heuristic',
    })
  }

  if (element.kind === 'rect' && aspectRatio >= 1.8 && smallestDimensionMm >= 4) {
    pushSuggestion(scores, {
      componentType: 'filter',
      confidence: 0.72,
      reason: 'Elongated plate-like rectangle resembles a filter optic.',
      source: 'heuristic',
    })
  }

  if ((element.kind === 'polygon' || element.kind === 'polyline') && element.points.length <= 5) {
    pushSuggestion(scores, {
      componentType: 'attenuator',
      confidence: 0.66,
      reason: 'Short triangular/polyline mark resembles an attenuator symbol.',
      source: 'heuristic',
    })
    pushSuggestion(scores, {
      componentType: 'beam-dump',
      confidence: 0.7,
      reason: 'Filled triangular marks can represent a beam dump.',
      source: 'heuristic',
    })
    pushSuggestion(scores, {
      componentType: 'detector',
      confidence: 0.56,
      reason: 'Triangular readout symbol can map to detector glyphs.',
      source: 'heuristic',
    })
  }

  if ((element.kind === 'rect' || element.kind === 'path') && largestDimensionMm >= 18) {
    const stageConfidence =
      hasStageHint
        ? enclosedOpenLineCount > 0 || aspectRatio >= 1.8
          ? 0.84
          : 0.72
        : enclosedOpenLineCount > 1 || aspectRatio >= 2.8
          ? 0.62
          : 0.48
    pushSuggestion(scores, {
      componentType: 'translation-stage',
      confidence: stageConfidence,
      reason:
        stageConfidence >= 0.7
          ? 'Large rectangular body with internal guides resembles a translation or delay stage.'
          : 'Larger rectangular hardware can map to translation-stage symbols.',
      source: 'heuristic',
    })

    if (stageConfidence < 0.7) {
      pushSuggestion(scores, {
        componentType: 'support-hardware',
        confidence: 0.5,
        reason: 'Large rectangular geometry may indicate generic support hardware.',
        source: 'heuristic',
      })
    }
  }

  if (deterministicType) {
    pushSuggestion(scores, {
      componentType: deterministicType,
      confidence: 0.96,
      reason: 'Keyword match from labels/ids.',
      source: 'deterministic',
    })
  }

  for (const entry of COMPONENT_KEYWORD_MAP) {
    if (!entry.keywords.some((keyword) => hintCorpus.includes(normalizeHintValue(keyword)))) {
      continue
    }

    const existing = scores.get(entry.type)
    if (!existing) {
      pushSuggestion(scores, {
        componentType: entry.type,
        confidence: 0.62,
        reason: 'Label hint boosts this component family.',
        source: 'heuristic',
      })
      continue
    }

    pushSuggestion(scores, {
      ...existing,
      confidence: Math.min(0.98, existing.confidence + 0.16),
      reason: `${existing.reason} Label hints support this mapping.`,
    })
  }

  return [...scores.values()].sort((left, right) => right.confidence - left.confidence)
}

function buildAnnotationSegmentsForElement(
  element: SvgImportElement,
): SvgImportAnnotationSegment[] {
  if (element.kind !== 'line' && element.kind !== 'polyline' && element.kind !== 'path') {
    return []
  }

  if (element.isClosed || element.segments.length === 0) {
    return []
  }

  return element.segments.map((segment) => ({
      elementId: element.id,
      start: segment.start,
      end: segment.end,
      color: element.stroke ?? DEFAULT_ANNOTATION_COLOR,
      strokeWidth: element.strokeWidth ?? DEFAULT_ANNOTATION_STROKE_MM,
    }))
}

function angleDeltaDegrees(angleA: number, angleB: number) {
  const raw = Math.abs(((angleA - angleB + 180) % 360) - 180)
  return raw < 0 ? raw + 360 : raw
}

function toQuarterTurn(rotationDeg: number): QuarterTurn {
  const quarterTurn = Math.round(rotationDeg / 90)
  return normalizeQuarterTurns(quarterTurn as QuarterTurn)
}

function createComponentId(type: ComponentType, existingIds: Set<string>): string {
  let nextId = ''

  do {
    const suffix =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10)
    nextId = `${type}-${suffix}`
  } while (existingIds.has(nextId))

  existingIds.add(nextId)
  return nextId
}

function reserveComponentId(id: string, existingIds: Set<string>) {
  existingIds.add(id)
  return id
}

function createImportPreviewDraftComponentId(previewItemId: string) {
  return `import-preview-${previewItemId}`
}

function getDraftComponentIdForPreviewItem(
  previewItemId: string,
  draftComponentIdsByPreviewItemId?: Map<string, string> | Record<string, string>,
) {
  if (!draftComponentIdsByPreviewItemId) {
    return undefined
  }

  return draftComponentIdsByPreviewItemId instanceof Map
    ? draftComponentIdsByPreviewItemId.get(previewItemId)
    : draftComponentIdsByPreviewItemId[previewItemId]
}

function ensureDraftComponentIdForPreviewItem(
  previewItemId: string,
  draftComponentIdsByPreviewItemId: Map<string, string> | Record<string, string> | undefined,
  existingIds: Set<string>,
) {
  const existingId = getDraftComponentIdForPreviewItem(
    previewItemId,
    draftComponentIdsByPreviewItemId,
  )

  if (existingId) {
    return reserveComponentId(existingId, existingIds)
  }

  const nextId = createImportPreviewDraftComponentId(previewItemId)
  if (draftComponentIdsByPreviewItemId instanceof Map) {
    draftComponentIdsByPreviewItemId.set(previewItemId, nextId)
  } else if (draftComponentIdsByPreviewItemId) {
    draftComponentIdsByPreviewItemId[previewItemId] = nextId
  }

  return reserveComponentId(nextId, existingIds)
}

function createAnnotationId(existingIds: Set<string>) {
  let index = existingIds.size + 1
  let nextId = `line-import-${index}`

  while (existingIds.has(nextId)) {
    index += 1
    nextId = `line-import-${index}`
  }

  existingIds.add(nextId)
  return nextId
}

function createBreadboardModelFromImportSurface(surface: SvgImportWorkspaceSurfaceConfig): BreadboardModel {
  const base = getDefaultBreadboard()

  return {
    ...base,
    label: surface.label,
    widthMm: roundMm(surface.physicalWidthMm),
    heightMm: roundMm(surface.physicalHeightMm),
  }
}

function createWorkspaceFromImportConfig(config: SvgImportWorkspaceConfig): OpticalTableWorkspace | SceneDocument['workspace'] {
  if (config.workspaceKind === 'single-breadboard') {
    const primaryBoard = config.breadboards[0]

    return {
      kind: 'single-breadboard',
      breadboard: createBreadboardModelFromImportSurface(primaryBoard),
    }
  }

  const tableBase = createDefaultOpticalTable()
  const tableSurface = config.table
  const tableModel = {
    ...tableBase,
    label: tableSurface?.label ?? tableBase.label,
    widthMm: roundMm(tableSurface?.physicalWidthMm ?? tableBase.widthMm),
    heightMm: roundMm(tableSurface?.physicalHeightMm ?? tableBase.heightMm),
  }
  const scaleMmPerUnit = resolveSvgImportScaleMmPerUnit({
    document: {
      bounds: tableSurface?.boundsUnits ?? { x: 0, y: 0, width: tableModel.widthMm, height: tableModel.heightMm },
      elements: [],
      scale: { baseMmPerUnit: 1, isReliable: true, sourceUnit: 'mm' },
      sourceKind: 'svg',
      svgText: '',
    },
    workspaceConfig: config,
  })

  return {
    kind: 'optical-table',
    table: tableModel,
    breadboards: config.breadboards.map((surface, index) => {
      const breadboardModel = createBreadboardModelFromImportSurface(surface)
      const centerMm = {
        x: roundMm(
          ((surface.boundsUnits.x - (tableSurface?.boundsUnits.x ?? 0)) + surface.boundsUnits.width / 2) *
            scaleMmPerUnit,
        ),
        y: roundMm(
          ((surface.boundsUnits.y - (tableSurface?.boundsUnits.y ?? 0)) + surface.boundsUnits.height / 2) *
            scaleMmPerUnit,
        ),
      }

      return createBreadboardInstance({
        anchorMm: getBreadboardAnchorForCenterMm(breadboardModel, centerMm),
        id: surface.id || `breadboard-${index + 1}`,
        label: surface.label,
        model: breadboardModel,
      })
    }),
  }
}

export interface ImportPreviewPlacementTarget {
  boundsUnits: BoundsMm
  hostSurfaceId: string
  localOriginMm: Vector2Mm
  rotationQuarterTurns: QuarterTurn
  surfaceOriginMm: Vector2Mm
}

function getImportPlacementTargets(args: {
  baseScene: SceneDocument
  document: SvgImportDocument
  hostSurfaceId?: string
  millimetersPerUnit: number
  mode: SvgImportMode
  workspaceConfig?: SvgImportWorkspaceConfig
}) {
  const { baseScene, document, hostSurfaceId, millimetersPerUnit, mode, workspaceConfig } = args
  const targetsById = new Map<string, ImportPreviewPlacementTarget>()
  const primarySurface = workspaceConfig ? getPrimaryWorkspaceSurfaceConfig(workspaceConfig) : undefined

  if (
    mode === 'append-breadboard' &&
    workspaceConfig &&
    baseScene.workspace.kind === 'optical-table'
  ) {
    const appendedBreadboard = baseScene.workspace.breadboards[baseScene.workspace.breadboards.length - 1]
    const importedSurface = workspaceConfig.breadboards[0]

    if (appendedBreadboard && importedSurface) {
      const surface = getSurfacePlacementModel(baseScene, appendedBreadboard.id)
      const target: ImportPreviewPlacementTarget = {
        boundsUnits: importedSurface.boundsUnits,
        hostSurfaceId: appendedBreadboard.id,
        localOriginMm: { x: 0, y: 0 },
        rotationQuarterTurns: surface.rotationQuarterTurns,
        surfaceOriginMm: surface.originMm,
      }

      return {
        primaryTarget: target,
        targetsById: new Map([[appendedBreadboard.id, target]]),
      }
    }
  }

  if (mode === 'replace' && workspaceConfig) {
    if (workspaceConfig.workspaceKind === 'optical-table') {
      const tableSurface = workspaceConfig.table

      if (tableSurface) {
        const surface = getSurfacePlacementModel(baseScene, OPTICAL_TABLE_SURFACE_ID)
        targetsById.set(OPTICAL_TABLE_SURFACE_ID, {
          boundsUnits: tableSurface.boundsUnits,
          hostSurfaceId: OPTICAL_TABLE_SURFACE_ID,
          localOriginMm: { x: 0, y: 0 },
          rotationQuarterTurns: surface.rotationQuarterTurns,
          surfaceOriginMm: surface.originMm,
        })
      }

      workspaceConfig.breadboards.forEach((surfaceConfig) => {
        const surface = getSurfacePlacementModel(baseScene, surfaceConfig.id)
        targetsById.set(surfaceConfig.id, {
          boundsUnits: surfaceConfig.boundsUnits,
          hostSurfaceId: surfaceConfig.id,
          localOriginMm: { x: 0, y: 0 },
          rotationQuarterTurns: surface.rotationQuarterTurns,
          surfaceOriginMm: surface.originMm,
        })
      })

      return {
        primaryTarget: targetsById.get(workspaceConfig.breadboards[0]?.id ?? OPTICAL_TABLE_SURFACE_ID),
        targetsById,
      }
    }

    const surface = getSurfacePlacementModel(baseScene, SINGLE_BREADBOARD_SURFACE_ID)
    const boardSurface = workspaceConfig.breadboards[0]
    const singleTarget: ImportPreviewPlacementTarget = {
      boundsUnits: boardSurface?.boundsUnits ?? document.bounds,
      hostSurfaceId: SINGLE_BREADBOARD_SURFACE_ID,
      localOriginMm: { x: 0, y: 0 },
      rotationQuarterTurns: surface.rotationQuarterTurns,
      surfaceOriginMm: surface.originMm,
    }

    return {
      primaryTarget: singleTarget,
      targetsById: new Map([[SINGLE_BREADBOARD_SURFACE_ID, singleTarget]]),
    }
  }

  const surface = getSurfacePlacementModel(baseScene, hostSurfaceId)
  const importWidthMm = (primarySurface?.physicalWidthMm ?? document.bounds.width * millimetersPerUnit)
  const importHeightMm = (primarySurface?.physicalHeightMm ?? document.bounds.height * millimetersPerUnit)
  const target: ImportPreviewPlacementTarget = {
    boundsUnits: primarySurface?.boundsUnits ?? document.bounds,
    hostSurfaceId: surface.hostSurfaceId,
    localOriginMm: {
      x: roundMm((surface.breadboard.widthMm - importWidthMm) / 2),
      y: roundMm((surface.breadboard.heightMm - importHeightMm) / 2),
    },
    rotationQuarterTurns: surface.rotationQuarterTurns,
    surfaceOriginMm: surface.originMm,
  }

  return {
    primaryTarget: target,
    targetsById: new Map([[surface.hostSurfaceId, target]]),
  }
}

function getPlacementTargetForElement(args: {
  element: SvgImportElement
  primaryTarget?: ImportPreviewPlacementTarget
  targetsById: Map<string, ImportPreviewPlacementTarget>
}) {
  const { element, primaryTarget, targetsById } = args
  const breadboardTargets = [...targetsById.values()].filter(
    (target) => target.hostSurfaceId !== OPTICAL_TABLE_SURFACE_ID,
  )
  const containingBreadboards = breadboardTargets.filter((target) =>
    boundsContainsPoint(target.boundsUnits, element.center, 0),
  )

  if (containingBreadboards.length > 0) {
    return containingBreadboards.sort(
      (left, right) => boundsArea(left.boundsUnits) - boundsArea(right.boundsUnits),
    )[0]
  }

  return targetsById.get(OPTICAL_TABLE_SURFACE_ID) ?? primaryTarget
}

function getPlacementTargetForPoint(args: {
  point: Vector2Mm
  primaryTarget?: ImportPreviewPlacementTarget
  targetsById: Map<string, ImportPreviewPlacementTarget>
}) {
  const { point, primaryTarget, targetsById } = args
  const breadboardTargets = [...targetsById.values()].filter(
    (target) => target.hostSurfaceId !== OPTICAL_TABLE_SURFACE_ID,
  )
  const containingBreadboards = breadboardTargets.filter((target) =>
    boundsContainsPoint(target.boundsUnits, point, 0),
  )

  if (containingBreadboards.length > 0) {
    return containingBreadboards.sort(
      (left, right) => boundsArea(left.boundsUnits) - boundsArea(right.boundsUnits),
    )[0]
  }

  return targetsById.get(OPTICAL_TABLE_SURFACE_ID) ?? primaryTarget
}

function mapSvgPointToWorldMm(args: {
  importBounds: BoundsMm
  millimetersPerUnit: number
  point: Vector2Mm
  targetOriginLocalMm: Vector2Mm
  targetRotationQuarterTurns: QuarterTurn
  targetSurfaceOriginMm: Vector2Mm
}): Vector2Mm {
  const localPoint = {
    x:
      args.targetOriginLocalMm.x +
      (args.point.x - args.importBounds.x) * args.millimetersPerUnit,
    y:
      args.targetOriginLocalMm.y +
      (args.point.y - args.importBounds.y) * args.millimetersPerUnit,
  }
  const rotatedPoint = rotatePointQuarterTurns(localPoint, args.targetRotationQuarterTurns)

  return {
    x: roundMm(args.targetSurfaceOriginMm.x + rotatedPoint.x),
    y: roundMm(args.targetSurfaceOriginMm.y + rotatedPoint.y),
  }
}

export function mapWorldPointToImportPoint(args: {
  millimetersPerUnit: number
  pointMm: Vector2Mm
  target: ImportPreviewPlacementTarget
}) {
  const localRotatedPoint = {
    x: args.pointMm.x - args.target.surfaceOriginMm.x,
    y: args.pointMm.y - args.target.surfaceOriginMm.y,
  }
  const localPoint = rotatePointQuarterTurns(
    localRotatedPoint,
    normalizeQuarterTurns((4 - args.target.rotationQuarterTurns) as QuarterTurn),
  )

  return {
    x: roundMm(
      args.target.boundsUnits.x +
        (localPoint.x - args.target.localOriginMm.x) / args.millimetersPerUnit,
    ),
    y: roundMm(
      args.target.boundsUnits.y +
        (localPoint.y - args.target.localOriginMm.y) / args.millimetersPerUnit,
    ),
  }
}

export function parseSvgImportDocument(svgText: string): SvgImportDocument {
  if (typeof DOMParser === 'undefined') {
    throw new Error('SVG import requires browser DOMParser support.')
  }

  const parser = new DOMParser()
  const parsedDocument = parser.parseFromString(svgText, 'image/svg+xml')
  const parseError =
    typeof parsedDocument.querySelector === 'function'
      ? parsedDocument.querySelector('parsererror')
      : parsedDocument.getElementsByTagName?.('parsererror')?.[0]

  if (parseError) {
    throw new Error('SVG could not be parsed. Please check that the file is valid SVG XML.')
  }

  const svgRoot = parsedDocument.documentElement

  if (!svgRoot || svgRoot.tagName.toLowerCase() !== 'svg') {
    throw new Error('The selected file does not contain a valid <svg> root element.')
  }

  const viewBox = parseViewBox(svgRoot.getAttribute('viewBox'))
  const elements = parseSvgElements(svgRoot)

  if (elements.length === 0) {
    throw new Error('No supported geometric SVG elements were found for import.')
  }

  const bounds = elements
    .map((element) => element.bounds)
    .reduce((accumulator, current) => unionBounds(accumulator, current))

  return {
    svgText,
    viewBox,
    elements,
    bounds,
    scale: deriveScaleInfo(svgRoot, viewBox),
    sourceKind: 'svg',
  }
}

export function resolveSvgImportScaleMmPerUnit(args: {
  calibration?: SvgCalibrationRequest
  document: ImportPreviewDocument
  workspaceConfig?: SvgImportWorkspaceConfig
}) {
  const { calibration, document, workspaceConfig } = args
  const primarySurface = workspaceConfig ? getPrimaryWorkspaceSurfaceConfig(workspaceConfig) : undefined

  if (primarySurface) {
    const widthScale =
      primarySurface.boundsUnits.width > 1e-6
        ? primarySurface.physicalWidthMm / primarySurface.boundsUnits.width
        : undefined
    const heightScale =
      primarySurface.boundsUnits.height > 1e-6
        ? primarySurface.physicalHeightMm / primarySurface.boundsUnits.height
        : undefined
    const validScales = [widthScale, heightScale].filter(
      (value): value is number => value !== undefined && Number.isFinite(value) && value > 0,
    )

    if (validScales.length > 0) {
      return validScales.reduce((sum, value) => sum + value, 0) / validScales.length
    }
  }

  if (!calibration || calibration.samples.length === 0) {
    return document.scale.baseMmPerUnit
  }

  const ratios: number[] = []

  for (const sample of calibration.samples) {
    const unitDistance = computeSegmentLength(sample.start, sample.end)

    if (unitDistance <= 1e-9 || sample.distanceMm <= 0) {
      continue
    }

    ratios.push(sample.distanceMm / unitDistance)
  }

  if (ratios.length === 0) {
    return document.scale.baseMmPerUnit
  }

  return ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length
}

export function analyzeSvgImportDocument(args: {
  document: SvgImportDocument
  millimetersPerUnit: number
  profile: SvgImportProfile
  workspaceDetection?: SvgImportWorkspaceDetection
}): SvgImportAnalysis {
  const { document, millimetersPerUnit, profile } = args
  const recognized: SvgImportRecognizedElement[] = []
  const reviewItems: SvgImportReviewItem[] = []
  const warnings: string[] = []
  const mappedElementIds = new Set<string>()
  const heuristicContext = buildHeuristicContext(document, millimetersPerUnit)

  for (const element of document.elements) {
    const deterministicType = inferDeterministicTypeFromHints(element.hints)
    const shouldAllowDeterministicType =
      !deterministicType ||
      !isOpenGeometryElement(element) ||
      OPEN_GEOMETRY_DETERMINISTIC_TYPES.includes(deterministicType)

    if (deterministicType && shouldAllowDeterministicType) {
      const suggestion: SvgImportSuggestion = {
        componentType: deterministicType,
        confidence: 0.98,
        reason: 'Deterministic label/id keyword match.',
        source: 'deterministic',
      }
      recognized.push({
        elementId: element.id,
        source: 'deterministic',
        suggestion,
      })
      mappedElementIds.add(element.id)
      continue
    }

    const heuristicSuggestions = createHeuristicSuggestions(element, heuristicContext, {
      allowDeterministicHintBoost: shouldAllowDeterministicType,
    })
      .filter((suggestion) => suggestion.confidence >= 0.42)
      .slice(0, MAX_SUGGESTIONS_PER_AMBIGUITY)

    if (heuristicSuggestions.length === 0) {
      continue
    }

    const topSuggestion = heuristicSuggestions[0]
    const nextSuggestion = heuristicSuggestions[1]

    if (
      profile === 'guided' &&
      topSuggestion.confidence >= AUTO_HEURISTIC_CONFIDENCE_THRESHOLD &&
      topSuggestion.source === 'heuristic' &&
      (!nextSuggestion ||
        topSuggestion.confidence - nextSuggestion.confidence >=
          AUTO_HEURISTIC_MARGIN_THRESHOLD)
    ) {
      recognized.push({
        elementId: element.id,
        source: 'heuristic',
        suggestion: topSuggestion,
      })
      mappedElementIds.add(element.id)
      warnings.push(
        `${element.id}: auto-mapped to ${getComponentDefinition(topSuggestion.componentType).familyLabel} from heuristic match.`,
      )
      continue
    }

    reviewItems.push({
      allowKeepAsLinework:
        heuristicContext.lineworkReviewElementIds.has(element.id) && isOpenGeometryElement(element),
      bounds: element.bounds,
      center: element.center,
      elementId: element.id,
      id: `element-${element.id}`,
      kind:
        heuristicContext.lineworkReviewElementIds.has(element.id) && isOpenGeometryElement(element)
          ? 'linework-fragment'
          : 'ambiguous-symbol',
      label:
        heuristicContext.lineworkReviewElementIds.has(element.id) && isOpenGeometryElement(element)
          ? `Review thin line fragment: ${element.hints[0] ?? element.id}`
          : element.hints[0] ?? element.id,
      sourceElementIds: [element.id],
      suggestions: heuristicSuggestions,
    })
  }

  reviewItems.push(...heuristicContext.junctionReviewItems)

  const annotationSegments: SvgImportAnnotationSegment[] = []

  for (const element of document.elements) {
    if (mappedElementIds.has(element.id)) {
      continue
    }

    if (heuristicContext.decorativeOpenElementIds.has(element.id)) {
      continue
    }

    for (const segment of buildAnnotationSegmentsForElement(element)) {
      const segmentLengthMm =
        computeSegmentLength(segment.start, segment.end) * millimetersPerUnit

      if (segmentLengthMm >= 6) {
        annotationSegments.push(segment)
      }
    }
  }

  return {
    recognized,
    ambiguous: reviewItems,
    annotationSegments,
    reviewItems,
    warnings,
    workspaceDetection: args.workspaceDetection ?? detectSvgImportWorkspace(document),
  }
}

export function createImportPreviewItemsFromSvgAnalysis(args: {
  analysis: SvgImportAnalysis
  document: SvgImportDocument
}): ImportPreviewItem[] {
  const { analysis, document } = args
  const elementById = new Map(document.elements.map((element) => [element.id, element]))
  const surfaceSourceElementIds = new Set<string>([
    ...(analysis.workspaceDetection.tableCandidate?.sourceElementIds ?? []),
    ...analysis.workspaceDetection.breadboardCandidates.flatMap(
      (candidate) => candidate.sourceElementIds,
    ),
  ])
  const previewItems: ImportPreviewItem[] = []

  for (const recognized of analysis.recognized) {
    if (surfaceSourceElementIds.has(recognized.elementId)) {
      continue
    }

    const element = elementById.get(recognized.elementId)

    if (!element) {
      continue
    }

    const useElementRotation =
      isOpenGeometryElement(element) &&
      (recognized.suggestion.componentType === 'mirror' ||
        recognized.suggestion.componentType === 'curved-mirror')

    previewItems.push({
      allowKeepAsLinework: false,
      bounds: element.bounds,
      center: element.center,
      componentType: recognized.suggestion.componentType,
      disposition: 'component',
      editability: {
        canMove: true,
        canReassign: true,
        canRotate: true,
      },
      elementId: element.id,
      id: `recognized-${element.id}`,
      isStrongMatch: true,
      kind: 'recognized-component',
      label: element.hints[0] ?? getComponentDefinition(recognized.suggestion.componentType).familyLabel,
      rotationQuarterTurns: useElementRotation ? toQuarterTurn(element.rotationDeg) : 0,
      sourceElementIds: [element.id],
      sourceKind: 'svg',
      suggestions: [recognized.suggestion],
    })
  }

  for (const reviewItem of analysis.reviewItems) {
    if (reviewItem.elementId && surfaceSourceElementIds.has(reviewItem.elementId)) {
      continue
    }
    if (
      reviewItem.sourceElementIds.length > 0 &&
      reviewItem.sourceElementIds.every((elementId) =>
        surfaceSourceElementIds.has(elementId),
      )
    ) {
      continue
    }

    const topSuggestion = reviewItem.suggestions[0]
    const shouldSeedAsComponent =
      reviewItem.kind === 'ambiguous-symbol' &&
      !reviewItem.allowKeepAsLinework &&
      topSuggestion !== undefined &&
      topSuggestion.confidence >= 0.66

    previewItems.push({
      allowKeepAsLinework: reviewItem.allowKeepAsLinework,
      bounds: reviewItem.bounds,
      center: reviewItem.center,
      componentType: shouldSeedAsComponent ? topSuggestion.componentType : undefined,
      disposition: shouldSeedAsComponent
        ? 'component'
        : reviewItem.allowKeepAsLinework
          ? 'linework'
          : 'skip',
      editability: {
        canMove: true,
        canReassign: true,
        canRotate: true,
      },
      elementId: reviewItem.elementId,
      id: reviewItem.id,
      isStrongMatch: false,
      kind: reviewItem.kind,
      label: reviewItem.label,
      rotationQuarterTurns: toQuarterTurn(reviewItem.suggestedRotationDeg ?? 0),
      sourceElementIds: reviewItem.sourceElementIds,
      sourceKind: 'svg',
      suggestions: reviewItem.suggestions,
    })
  }

  return previewItems
}

export function createImportPreviewItemsFromRasterCandidates(args: {
  candidates: Array<{
    bounds: BoundsMm
    center: Vector2Mm
    id: string
    label: string
    suggestions: SvgImportSuggestion[]
  }>
}): ImportPreviewItem[] {
  return args.candidates.map((candidate) => {
    const topSuggestion = candidate.suggestions[0]
    const shouldAutoAssign = Boolean(
      topSuggestion && topSuggestion.confidence >= 0.58,
    )

    return {
    allowKeepAsLinework: false,
    bounds: candidate.bounds,
    center: candidate.center,
    componentType: topSuggestion?.componentType,
    disposition: shouldAutoAssign ? 'component' : 'skip',
    editability: {
      canMove: true,
      canReassign: true,
      canRotate: true,
    },
    id: candidate.id,
    isStrongMatch: shouldAutoAssign,
    kind: 'raster-candidate',
    label: candidate.label,
    rotationQuarterTurns: 0,
    sourceElementIds: [],
    sourceKind: 'raster',
    suggestions: candidate.suggestions,
  }})
}

export function createSvgImportDraftSession(args: {
  analysis: SvgImportAnalysis
  appendBreadboardCenterMm?: Vector2Mm
  actionIntent?: SvgImportActionIntent
  document: ImportPreviewDocument
  hostSurfaceId?: string
  millimetersPerUnit: number
  mode: SvgImportMode
  previewItems?: ImportPreviewItem[]
  previewMode?: SvgImportPreviewMode
  workspaceConfig?: SvgImportWorkspaceConfig
}): SvgImportDraftSession {
  const baselinePreviewItems =
    args.previewItems ??
    (args.document.sourceKind === 'svg'
      ? createImportPreviewItemsFromSvgAnalysis({
          analysis: args.analysis,
          document: args.document,
        })
      : [])
  const workingPreviewItems = clonePreviewItems(baselinePreviewItems)
  const baselineWorkspaceConfig = cloneWorkspaceConfig(args.workspaceConfig)
  const workingWorkspaceConfig = cloneWorkspaceConfig(args.workspaceConfig)
  const baselineAppendBreadboardCenterMm = cloneVector2Mm(args.appendBreadboardCenterMm)
  const workingAppendBreadboardCenterMm = cloneVector2Mm(args.appendBreadboardCenterMm)

  return {
    actionIntent: args.actionIntent ?? 'quick-import',
    analysis: args.analysis,
    appendBreadboardCenterMm: workingAppendBreadboardCenterMm,
    baselineAppendBreadboardCenterMm,
    baselineHostSurfaceId: args.hostSurfaceId,
    baselineMode: args.mode,
    baselinePreviewItems: clonePreviewItems(baselinePreviewItems),
    baselineWorkspaceConfig,
    document: args.document,
    draftComponentIdsByPreviewItemId: new Map(),
    hostSurfaceId: args.hostSurfaceId,
    millimetersPerUnit: args.millimetersPerUnit,
    mode: args.mode,
    previewMode: args.previewMode ?? 'source',
    workingAppendBreadboardCenterMm,
    workingHostSurfaceId: args.hostSurfaceId,
    workingMode: args.mode,
    workingPreviewItems,
    workingWorkspaceConfig,
    workspaceConfig: workingWorkspaceConfig,
  }
}

export function isSvgImportDraftSessionDirty(session: SvgImportDraftSession) {
  return (
    !areImportSnapshotsEqual(
      session.baselinePreviewItems.map((item) => snapshotPreviewItem(item)),
      session.workingPreviewItems.map((item) => snapshotPreviewItem(item)),
    ) ||
    !areImportSnapshotsEqual(
      snapshotWorkspaceConfig(session.baselineWorkspaceConfig),
      snapshotWorkspaceConfig(session.workingWorkspaceConfig),
    ) ||
    !areImportSnapshotsEqual(
      session.baselineAppendBreadboardCenterMm,
      session.workingAppendBreadboardCenterMm,
    ) ||
    session.baselineHostSurfaceId !== session.workingHostSurfaceId ||
    session.baselineMode !== session.workingMode
  )
}

function createSurfaceOnlyImportShim(document: ImportPreviewDocument): SvgImportDocument {
  return {
    bounds: document.bounds,
    elements: [],
    scale: document.scale,
    sourceKind: 'svg',
    svgText: '',
    viewBox: document.bounds,
  }
}

function createEmptyImportAnalysis(workspaceDetection: SvgImportWorkspaceDetection): SvgImportAnalysis {
  return {
    ambiguous: [],
    annotationSegments: [],
    recognized: [],
    reviewItems: [],
    warnings: [],
    workspaceDetection,
  }
}

function buildSvgImportSceneCore(args: {
  analysis: SvgImportAnalysis
  actionIntent?: SvgImportActionIntent
  document: SvgImportDocument
  appendBreadboardCenterMm?: Vector2Mm
  hostSurfaceId?: string
  manualResolutions?: SvgImportManualResolution[]
  millimetersPerUnit: number
  mode: SvgImportMode
  previewItems?: ImportPreviewItem[]
  scene: SceneDocument
  draftComponentIdsByPreviewItemId?: Map<string, string> | Record<string, string>
  workspaceConfig?: SvgImportWorkspaceConfig
}): SvgImportApplyResult {
  const {
    analysis,
    actionIntent = 'quick-import',
    appendBreadboardCenterMm,
    document,
    hostSurfaceId,
    manualResolutions = [],
    millimetersPerUnit,
    mode,
    previewItems,
    scene,
    draftComponentIdsByPreviewItemId = new Map<string, string>(),
    workspaceConfig,
  } = args
  const workspaceOverride =
    mode === 'replace' && workspaceConfig ? createWorkspaceFromImportConfig(workspaceConfig) : undefined
  const baseScene =
    mode === 'replace'
      ? createReplaceSceneTemplate(scene, workspaceOverride)
      : mode === 'append-breadboard'
        ? createAppendBreadboardSceneTemplate({
            centerMm: appendBreadboardCenterMm,
            importWorkspace: workspaceConfig,
            scene,
          })
      : copyScene(scene)
  const { primaryTarget, targetsById } = getImportPlacementTargets({
    baseScene,
    document,
    hostSurfaceId,
    millimetersPerUnit,
    mode,
    workspaceConfig,
  })
  const mappedRecognized = new Map<
    string,
    { previewItem?: ImportPreviewItem; suggestion: SvgImportSuggestion; variantId?: string }
  >()
  const suppressedAnnotationElementIds = new Set<string>()
  const reviewItemById = new Map(analysis.reviewItems.map((item) => [item.id, item]))
  const injectedComponents: Array<{
    previewItem: ImportPreviewItem
    componentType: ComponentType
    variantId?: string
  }> = []

  if (previewItems && previewItems.length > 0) {
    for (const item of previewItems) {
      if (item.disposition === 'skip') {
        item.sourceElementIds.forEach((elementId) => {
          suppressedAnnotationElementIds.add(elementId)
        })
        continue
      }

      if (item.disposition === 'linework') {
        continue
      }

      if (!item.componentType) {
        continue
      }

      const suggestion =
        item.suggestions[0] ??
        ({
          componentType: item.componentType,
          confidence: item.isStrongMatch ? 1 : 0.52,
          reason: item.isStrongMatch
            ? 'Imported from auto-confirmed preview match.'
            : 'Assigned during import preview review.',
          source: item.isStrongMatch ? 'heuristic' : 'deterministic',
        } satisfies SvgImportSuggestion)

      if (item.elementId) {
        mappedRecognized.set(item.elementId, {
          previewItem: item,
          suggestion: {
            ...suggestion,
            componentType: item.componentType,
          },
          variantId: item.variantId,
        })
        continue
      }

      injectedComponents.push({
        componentType: item.componentType,
        previewItem: item,
        variantId: item.variantId,
      })
    }
  } else {
    for (const recognized of analysis.recognized) {
      mappedRecognized.set(recognized.elementId, {
        suggestion: recognized.suggestion,
      })
    }

    for (const resolution of manualResolutions) {
      const reviewItem = reviewItemById.get(resolution.reviewItemId)

      if (!reviewItem) {
        continue
      }

      if (resolution.disposition === 'skip') {
        reviewItem.sourceElementIds.forEach((elementId) => {
          suppressedAnnotationElementIds.add(elementId)
        })
        continue
      }

      if (resolution.disposition === 'linework') {
        continue
      }

      if (!resolution.componentType) {
        continue
      }

      if (reviewItem.elementId) {
        mappedRecognized.set(reviewItem.elementId, {
          suggestion: {
            componentType: resolution.componentType,
            confidence: 1,
            reason: 'Manually resolved during import review.',
            source: 'deterministic',
          },
          variantId: resolution.variantId,
        })
        continue
      }

      injectedComponents.push({
        componentType: resolution.componentType,
        previewItem: {
          allowKeepAsLinework: reviewItem.allowKeepAsLinework,
          bounds: reviewItem.bounds,
          center: reviewItem.center,
          disposition: 'component',
          editability: {
            canMove: true,
            canReassign: true,
            canRotate: true,
          },
          id: reviewItem.id,
          isStrongMatch: false,
          kind: reviewItem.kind,
          label: reviewItem.label,
          rotationQuarterTurns: toQuarterTurn(reviewItem.suggestedRotationDeg ?? 0),
          sourceElementIds: reviewItem.sourceElementIds,
          sourceKind: 'svg',
          suggestions: reviewItem.suggestions,
          variantId: resolution.variantId,
        },
        variantId: resolution.variantId,
      })
    }
  }

  const unresolvedAmbiguousElements = previewItems
    ? 0
    : analysis.reviewItems.filter(
        (item) =>
          !manualResolutions.some((resolution) => resolution.reviewItemId === item.id) &&
          (!item.elementId || !mappedRecognized.has(item.elementId)),
      ).length
  const elementById = new Map(document.elements.map((element) => [element.id, element]))
  const targetByElementId = new Map(
    document.elements.map((element) => [
      element.id,
      getPlacementTargetForElement({
        element,
        primaryTarget,
        targetsById,
      }),
    ]),
  )
  const warnings = [...analysis.warnings]
  const existingComponentIds = new Set(baseScene.components.map((component) => component.id))
  const existingAnnotationIds = new Set(baseScene.annotations.map((annotation) => annotation.id))
  const resolvedDraftComponentIdsByPreviewItemId =
    draftComponentIdsByPreviewItemId instanceof Map
      ? draftComponentIdsByPreviewItemId
      : new Map(Object.entries(draftComponentIdsByPreviewItemId))

  if (actionIntent === 'board-only') {
    return {
      actionIntent,
      draftComponentIdsByPreviewItemId: resolvedDraftComponentIdsByPreviewItemId,
      importedAnnotations: 0,
      importedComponents: 0,
      scene: baseScene,
      unresolvedAmbiguousElements: 0,
      warnings,
    }
  }

  for (const [elementId, resolution] of mappedRecognized.entries()) {
    const element = elementById.get(elementId)
    const previewItem = resolution.previewItem
    const target =
      (previewItem
        ? getPlacementTargetForPoint({
            point: previewItem.center,
            primaryTarget,
            targetsById,
          })
        : undefined) ??
      targetByElementId.get(elementId) ??
      primaryTarget

    if (!element || !target) {
      continue
    }

    const worldAnchor = mapSvgPointToWorldMm({
      importBounds: target.boundsUnits,
      millimetersPerUnit,
      point: previewItem?.center ?? element.center,
      targetOriginLocalMm: target.localOriginMm,
      targetRotationQuarterTurns: target.rotationQuarterTurns,
      targetSurfaceOriginMm: target.surfaceOriginMm,
    })
    const useElementRotation =
      previewItem === undefined &&
      isOpenGeometryElement(element) &&
      (resolution.suggestion.componentType === 'mirror' ||
        resolution.suggestion.componentType === 'curved-mirror')
    const localQuarterTurn =
      previewItem?.rotationQuarterTurns ?? (useElementRotation ? toQuarterTurn(element.rotationDeg) : 0)
    const worldQuarterTurn = normalizeQuarterTurns(
      (localQuarterTurn + target.rotationQuarterTurns) as QuarterTurn,
    )

    if (useElementRotation) {
      const snappedRotationDeg = worldQuarterTurn * 90
      const rawWorldRotationDeg =
        element.rotationDeg + target.rotationQuarterTurns * 90
      const rotationDeltaDeg = angleDeltaDegrees(rawWorldRotationDeg, snappedRotationDeg)

      if (rotationDeltaDeg > 0.75) {
        warnings.push(
          `${element.id}: rotation ${rawWorldRotationDeg.toFixed(1)}° snapped to ${snappedRotationDeg}° to fit quarter-turn component constraints.`,
        )
      }
    }

    const definition = getComponentDefinition(resolution.suggestion.componentType)
    const variantId =
      resolution.variantId ??
      getResolvedComponentSpec(
        resolution.suggestion.componentType,
        definition.defaultVariantId,
      ).variantId
    const componentDraft: ComponentInstance = {
      id: previewItem
        ? ensureDraftComponentIdForPreviewItem(
            previewItem.id,
            draftComponentIdsByPreviewItemId,
            existingComponentIds,
          )
        : createComponentId(resolution.suggestion.componentType, existingComponentIds),
      type: resolution.suggestion.componentType,
      label: createAutoNumberedComponentLabel(
        baseScene.components,
        resolution.suggestion.componentType,
        variantId,
      ),
      variantId,
      anchorMm: worldAnchor,
      hostSurfaceId: target.hostSurfaceId,
      rotationQuarterTurns: worldQuarterTurn,
      config: createDefaultComponentConfig(
        resolution.suggestion.componentType,
        variantId,
      ),
    }

    componentDraft.anchorMm = reconcileComponentAnchorForScene(componentDraft, baseScene)
    baseScene.components.push(componentDraft)
  }

  for (const injected of injectedComponents) {
    const sourceTarget =
      injected.previewItem.sourceElementIds[0]
        ? targetByElementId.get(injected.previewItem.sourceElementIds[0])
        : undefined
    const target =
      getPlacementTargetForPoint({
        point: injected.previewItem.center,
        primaryTarget,
        targetsById,
      }) ??
      sourceTarget ??
      primaryTarget

    if (!target) {
      continue
    }

    const definition = getComponentDefinition(injected.componentType)
    const variantId =
      injected.variantId ??
      getResolvedComponentSpec(injected.componentType, definition.defaultVariantId).variantId
    const componentDraft: ComponentInstance = {
      id: ensureDraftComponentIdForPreviewItem(
        injected.previewItem.id,
        draftComponentIdsByPreviewItemId,
        existingComponentIds,
      ),
      type: injected.componentType,
      label: createAutoNumberedComponentLabel(
        baseScene.components,
        injected.componentType,
        variantId,
      ),
      variantId,
      anchorMm: mapSvgPointToWorldMm({
        importBounds: target.boundsUnits,
        millimetersPerUnit,
        point: injected.previewItem.center,
        targetOriginLocalMm: target.localOriginMm,
        targetRotationQuarterTurns: target.rotationQuarterTurns,
        targetSurfaceOriginMm: target.surfaceOriginMm,
      }),
      hostSurfaceId: target.hostSurfaceId,
      rotationQuarterTurns: normalizeQuarterTurns(
        (injected.previewItem.rotationQuarterTurns +
          target.rotationQuarterTurns) as QuarterTurn,
      ),
      config: createDefaultComponentConfig(injected.componentType, variantId),
    }

    componentDraft.anchorMm = reconcileComponentAnchorForScene(componentDraft, baseScene)
    baseScene.components.push(componentDraft)
  }

  const mappedElementIdSet = new Set(mappedRecognized.keys())

  for (const segment of analysis.annotationSegments) {
    if (
      mappedElementIdSet.has(segment.elementId) ||
      suppressedAnnotationElementIds.has(segment.elementId)
    ) {
      continue
    }

    const target = targetByElementId.get(segment.elementId) ?? primaryTarget

    if (!target) {
      continue
    }

    const startMm = mapSvgPointToWorldMm({
      importBounds: target.boundsUnits,
      millimetersPerUnit,
      point: segment.start,
      targetOriginLocalMm: target.localOriginMm,
      targetRotationQuarterTurns: target.rotationQuarterTurns,
      targetSurfaceOriginMm: target.surfaceOriginMm,
    })
    const endMm = mapSvgPointToWorldMm({
      importBounds: target.boundsUnits,
      millimetersPerUnit,
      point: segment.end,
      targetOriginLocalMm: target.localOriginMm,
      targetRotationQuarterTurns: target.rotationQuarterTurns,
      targetSurfaceOriginMm: target.surfaceOriginMm,
    })
    const strokeWidthMm = Math.max(
      0.35,
      Math.min(2.4, segment.strokeWidth * millimetersPerUnit),
    )

    baseScene.annotations.push({
      id: createAnnotationId(existingAnnotationIds),
      kind: 'line',
      startMm,
      endMm,
      color: segment.color || DEFAULT_ANNOTATION_COLOR,
      hidden: false,
      layerBand: 'below-components',
      locked: false,
      strokeWidthMm: roundMm(strokeWidthMm),
      zIndex: baseScene.annotations.length,
    })
  }

  if (unresolvedAmbiguousElements > 0) {
    warnings.push(
      `${unresolvedAmbiguousElements} ambiguous SVG element${
        unresolvedAmbiguousElements === 1 ? '' : 's'
      } were skipped.`,
    )
  }

  return {
    actionIntent,
    draftComponentIdsByPreviewItemId: resolvedDraftComponentIdsByPreviewItemId,
    scene: baseScene,
    warnings,
    importedComponents: mappedRecognized.size + injectedComponents.length,
    importedAnnotations:
      baseScene.annotations.length -
      (mode === 'replace' ? 0 : scene.annotations.length),
    unresolvedAmbiguousElements,
  }
}

export function applySvgImportToScene(args: {
  analysis: SvgImportAnalysis
  document: SvgImportDocument
  appendBreadboardCenterMm?: Vector2Mm
  draftComponentIdsByPreviewItemId?: Map<string, string> | Record<string, string>
  hostSurfaceId?: string
  manualResolutions?: SvgImportManualResolution[]
  millimetersPerUnit: number
  mode: SvgImportMode
  previewItems?: ImportPreviewItem[]
  scene: SceneDocument
  actionIntent?: SvgImportActionIntent
  workspaceConfig?: SvgImportWorkspaceConfig
}): SvgImportApplyResult {
  return buildSvgImportSceneCore({
    analysis: args.analysis,
    actionIntent: args.actionIntent,
    appendBreadboardCenterMm: args.appendBreadboardCenterMm,
    document: args.document,
    draftComponentIdsByPreviewItemId: args.draftComponentIdsByPreviewItemId,
    hostSurfaceId: args.hostSurfaceId,
    manualResolutions: args.manualResolutions,
    millimetersPerUnit: args.millimetersPerUnit,
    mode: args.mode,
    previewItems: args.previewItems,
    scene: args.scene,
    workspaceConfig: args.workspaceConfig,
  })
}

export function createImportPreviewDraftScene(args: {
  analysis?: SvgImportAnalysis
  appendBreadboardCenterMm?: Vector2Mm
  actionIntent?: SvgImportActionIntent
  document: ImportPreviewDocument
  hostSurfaceId?: string
  millimetersPerUnit: number
  mode: SvgImportMode
  previewItems: ImportPreviewItem[]
  previewMode?: SvgImportPreviewMode
  scene: SceneDocument
  workspaceConfig?: SvgImportWorkspaceConfig
}): ImportPreviewDraftScene {
  const document =
    args.document.sourceKind === 'svg'
      ? args.document
      : createSurfaceOnlyImportShim(args.document)
  const analysis =
    args.document.sourceKind === 'svg'
      ? args.analysis ?? createEmptyImportAnalysis(detectSvgImportWorkspace(document))
      : createEmptyImportAnalysis({
        breadboardCandidates: [],
        orphanElementIds: [],
        warnings: [],
          workspaceKind: args.workspaceConfig?.workspaceKind ?? 'single-breadboard',
        })
  const componentIdByPreviewItemId = Object.fromEntries(
    args.previewItems
      .filter((item) => item.disposition === 'component' && item.componentType)
      .map((item) => [item.id, createImportPreviewDraftComponentId(item.id)]),
  )
  const previewItemIdByComponentId = Object.fromEntries(
    Object.entries(componentIdByPreviewItemId).map(([previewItemId, componentId]) => [
      componentId,
      previewItemId,
    ]),
  )
  const result = applySvgImportToScene({
    analysis,
    actionIntent: args.actionIntent ?? 'quick-import',
    appendBreadboardCenterMm: args.appendBreadboardCenterMm,
    document,
    draftComponentIdsByPreviewItemId: componentIdByPreviewItemId,
    hostSurfaceId: args.hostSurfaceId,
    millimetersPerUnit: args.millimetersPerUnit,
    mode: args.mode,
    previewItems: args.previewItems,
    scene: args.scene,
    workspaceConfig: args.workspaceConfig,
  })
  const { targetsById } = getImportPlacementTargets({
    baseScene: result.scene,
    document,
    hostSurfaceId: args.hostSurfaceId,
    millimetersPerUnit: args.millimetersPerUnit,
    mode: args.mode,
    workspaceConfig: args.workspaceConfig,
  })

  return {
    actionIntent: args.actionIntent ?? 'quick-import',
    componentIdByPreviewItemId,
    importedComponentIds: Object.values(componentIdByPreviewItemId),
    previewItemIdByComponentId,
    previewMode: args.previewMode ?? 'source',
    scene: result.scene,
    targetsByHostSurfaceId: Object.fromEntries(targetsById),
  }
}

export function buildSvgImportDraftScene(args: {
  scene: SceneDocument
  session: SvgImportDraftSession
}): ImportPreviewDraftScene {
  const previewItems =
    args.session.actionIntent === 'board-only'
      ? []
      : args.session.actionIntent === 'modified-import'
        ? args.session.workingPreviewItems
        : args.session.baselinePreviewItems

  const result = createImportPreviewDraftScene({
    actionIntent: args.session.actionIntent,
    analysis: args.session.analysis,
    appendBreadboardCenterMm: args.session.workingAppendBreadboardCenterMm,
    document: args.session.document,
    hostSurfaceId: args.session.workingHostSurfaceId,
    millimetersPerUnit: args.session.millimetersPerUnit,
    mode: args.session.workingMode,
    previewItems,
    previewMode: args.session.previewMode,
    scene: args.scene,
    workspaceConfig: args.session.workingWorkspaceConfig ?? args.session.workspaceConfig,
  })

  for (const [previewItemId, componentId] of Object.entries(result.componentIdByPreviewItemId)) {
    args.session.draftComponentIdsByPreviewItemId.set(previewItemId, componentId)
  }

  return result
}

export function listSvgImportComponentChoices() {
  return COMPONENT_DEFINITIONS.map((definition) => ({
    type: definition.type,
    label: definition.familyLabel,
  }))
}

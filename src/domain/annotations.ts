import {
  getBoundsCenterMm,
  normalizeQuarterTurns,
  rotatePointAroundCenterQuarterTurns,
  roundMm,
} from './geometry'
import type {
  AnnotationFontFamily,
  AnnotationLayerBand,
  AnnotationShapeKind,
  AnnotationText,
  AnnotationTextStyle,
  AnnotationTextVariant,
  ArrowShapeAnnotation,
  BoundsMm,
  DiamondShapeAnnotation,
  EllipseShapeAnnotation,
  RectangleShapeAnnotation,
  RoundedRectangleShapeAnnotation,
  SceneAnnotation,
  ShapeAnnotation,
  Vector2Mm,
} from './types'

export const ANNOTATION_FONT_OPTIONS: Array<{
  id: AnnotationFontFamily
  label: string
  stack: string
}> = [
  {
    id: 'clean-sans',
    label: 'Clean Sans',
    stack: '"IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif',
  },
  {
    id: 'serif',
    label: 'Serif',
    stack: '"IBM Plex Serif", "Iowan Old Style", Georgia, serif',
  },
  {
    id: 'mono',
    label: 'Mono',
    stack: '"IBM Plex Mono", "SFMono-Regular", monospace',
  },
  {
    id: 'soft-display',
    label: 'Soft Display',
    stack: '"Avenir Next Rounded", "Trebuchet MS", "Gill Sans", sans-serif',
  },
]

export const ANNOTATION_TEXT_VARIANT_OPTIONS: Array<{
  id: AnnotationTextVariant
  label: string
}> = [
  { id: 'plain', label: 'Text' },
  { id: 'sticky-note', label: 'Sticky' },
  { id: 'note-card', label: 'Card' },
  { id: 'callout-bubble', label: 'Callout' },
]

export const ANNOTATION_SHAPE_OPTIONS: Array<{
  id: AnnotationShapeKind
  label: string
}> = [
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'rounded-rectangle', label: 'Rounded' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'arrow', label: 'Arrow' },
]

export const DEFAULT_ANNOTATION_TEXT_STYLE: AnnotationTextStyle = {
  fontFamily: 'clean-sans',
  fontSizeMm: 5.6,
  color: '#e7f5ff',
  bold: false,
  italic: false,
  underline: false,
  align: 'left',
}

export const DEFAULT_ANNOTATION_LAYER_BAND: AnnotationLayerBand = 'above-components'
export const DEFAULT_ANNOTATION_TEXT_VARIANT: AnnotationTextVariant = 'plain'
export const DEFAULT_ANNOTATION_SHAPE_KIND: AnnotationShapeKind = 'rectangle'
export const DEFAULT_ANNOTATION_SHAPE_STROKE = '#8fe3ff'
export const DEFAULT_ANNOTATION_SHAPE_FILL = 'rgba(97, 180, 218, 0.18)'
export const DEFAULT_ANNOTATION_STROKE_WIDTH_MM = 0.9
export const DEFAULT_TEXT_ANNOTATION_WIDTH_MM = 72
export const DEFAULT_TEXT_ANNOTATION_VALUE = 'Double-click to edit'
export const MIN_TEXT_ANNOTATION_WIDTH_MM = 18
export const MAX_TEXT_ANNOTATION_WIDTH_MM = 260
export const MIN_SHAPE_SIZE_MM = 8
export const MAX_SHAPE_SIZE_MM = 320
export const TEXT_WIDTH_STEP_MM = 8
export const SHAPE_SIZE_STEP_MM = 6
export const ANNOTATION_DRAG_GUIDE_THRESHOLD_MM = 4.5

export interface AnnotationGuideLine {
  axis: 'horizontal' | 'vertical'
  fromMm: Vector2Mm
  toMm: Vector2Mm
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function createAnnotationBase(id: string, zIndex: number) {
  return {
    id,
    hidden: false,
    layerBand: DEFAULT_ANNOTATION_LAYER_BAND,
    locked: false,
    zIndex,
  }
}

function getStickyNoteDefaults() {
  return {
    backgroundColor: '#f4d56b',
    borderColor: '#d6b14d',
    textColor: '#16202a',
    widthMm: 66,
  }
}

function getNoteCardDefaults() {
  return {
    backgroundColor: 'rgba(18, 27, 35, 0.94)',
    borderColor: '#75abc5',
    textColor: '#e8f7ff',
    widthMm: 84,
  }
}

function getCalloutDefaults() {
  return {
    backgroundColor: 'rgba(18, 27, 35, 0.94)',
    borderColor: '#75abc5',
    textColor: '#e8f7ff',
    widthMm: 84,
  }
}

export function getAnnotationFontStack(fontFamily: AnnotationFontFamily) {
  return (
    ANNOTATION_FONT_OPTIONS.find((option) => option.id === fontFamily)?.stack ??
    ANNOTATION_FONT_OPTIONS[0]!.stack
  )
}

export function getAnnotationFontWeight(style: AnnotationTextStyle) {
  return style.bold ? 700 : 400
}

export function getAnnotationFontStyle(style: AnnotationTextStyle) {
  if (style.bold && style.italic) {
    return 'bold italic'
  }

  if (style.bold) {
    return 'bold'
  }

  if (style.italic) {
    return 'italic'
  }

  return 'normal'
}

export function getAnnotationLineHeightMm(style: AnnotationTextStyle) {
  return roundMm(style.fontSizeMm * 1.24)
}

function getAverageGlyphWidthFactor(fontFamily: AnnotationFontFamily) {
  switch (fontFamily) {
    case 'serif':
      return 0.58
    case 'mono':
      return 0.61
    case 'soft-display':
      return 0.6
    case 'clean-sans':
    default:
      return 0.56
  }
}

export function measureTextLineWidthMm(
  line: string,
  style: AnnotationTextStyle,
) {
  if (!line) {
    return 0
  }

  const baseFactor = getAverageGlyphWidthFactor(style.fontFamily)
  const boldFactor = style.bold ? 0.04 : 0
  const italicFactor = style.italic ? 0.015 : 0
  const widthMm =
    line.length * style.fontSizeMm * (baseFactor + boldFactor + italicFactor)

  return roundMm(widthMm)
}

export function getTextAnnotationPaddingMm(
  annotationOrVariant: Pick<AnnotationText, 'variant' | 'style'> | AnnotationTextVariant,
) {
  const variant =
    typeof annotationOrVariant === 'string'
      ? annotationOrVariant
      : annotationOrVariant.variant
  const fontSizeMm =
    typeof annotationOrVariant === 'string'
      ? DEFAULT_ANNOTATION_TEXT_STYLE.fontSizeMm
      : annotationOrVariant.style.fontSizeMm

  switch (variant) {
    case 'sticky-note':
      return {
        x: roundMm(Math.max(4.8, fontSizeMm * 0.9)),
        y: roundMm(Math.max(4.2, fontSizeMm * 0.74)),
      }
    case 'note-card':
    case 'callout-bubble':
      return {
        x: roundMm(Math.max(4.6, fontSizeMm * 0.82)),
        y: roundMm(Math.max(4, fontSizeMm * 0.7)),
      }
    case 'plain':
    default:
      return {
        x: roundMm(Math.max(0.2, fontSizeMm * 0.06)),
        y: roundMm(Math.max(0.2, fontSizeMm * 0.05)),
      }
  }
}

export function getTextAnnotationCornerRadiusMm(variant: AnnotationTextVariant) {
  switch (variant) {
    case 'sticky-note':
      return 3.6
    case 'note-card':
      return 4.4
    case 'callout-bubble':
      return 6
    case 'plain':
    default:
      return 0
  }
}

export function getTextAnnotationBodyWidthMm(annotation: AnnotationText) {
  const padding = getTextAnnotationPaddingMm(annotation)
  return Math.max(MIN_TEXT_ANNOTATION_WIDTH_MM, roundMm(annotation.widthMm - padding.x * 2))
}

export function wrapAnnotationText(
  text: string,
  style: AnnotationTextStyle,
  widthMm: number,
) {
  const normalizedText = text.replaceAll('\r\n', '\n')
  const maxWidthMm = Math.max(MIN_TEXT_ANNOTATION_WIDTH_MM, widthMm)
  const paragraphs = normalizedText.split('\n')
  const lines: string[] = []

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push('')
      continue
    }

    const words = paragraph.split(/\s+/).filter(Boolean)
    let currentLine = ''

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word

      if (currentLine && measureTextLineWidthMm(candidate, style) > maxWidthMm) {
        lines.push(currentLine)
        currentLine = word
        continue
      }

      currentLine = candidate
    }

    lines.push(currentLine)
  }

  return lines.length > 0 ? lines : ['']
}

export function getTextAnnotationHeightMm(annotation: AnnotationText) {
  const padding = getTextAnnotationPaddingMm(annotation)
  const lineCount = Math.max(
    1,
    wrapAnnotationText(
      annotation.text,
      annotation.style,
      getTextAnnotationBodyWidthMm(annotation),
    ).length,
  )
  const lineHeightMm = getAnnotationLineHeightMm(annotation.style)
  const bodyHeightMm =
    lineCount * lineHeightMm + Math.max(1.8, annotation.style.fontSizeMm * 0.22)
  const tailHeightMm =
    annotation.variant === 'callout-bubble' && annotation.tailMm ? 9.5 : 0

  return roundMm(bodyHeightMm + padding.y * 2 + tailHeightMm)
}

export function getTextAnnotationBoundsMm(annotation: AnnotationText): BoundsMm {
  return {
    x: annotation.anchorMm.x,
    y: annotation.anchorMm.y,
    width: annotation.widthMm,
    height: getTextAnnotationHeightMm(annotation),
  }
}

export function getTextAnnotationBodyBoundsMm(annotation: AnnotationText): BoundsMm {
  const bounds = getTextAnnotationBoundsMm(annotation)

  if (annotation.variant !== 'callout-bubble' || !annotation.tailMm) {
    return bounds
  }

  return {
    ...bounds,
    height: roundMm(bounds.height - 9.5),
  }
}

export function getTextAnnotationTextOriginMm(annotation: AnnotationText): Vector2Mm {
  const padding = getTextAnnotationPaddingMm(annotation)

  return {
    x: roundMm(annotation.anchorMm.x + padding.x),
    y: roundMm(annotation.anchorMm.y + padding.y),
  }
}

export function getTextLineStartX(
  annotation: AnnotationText,
  lineWidthMm: number,
) {
  const textOrigin = getTextAnnotationTextOriginMm(annotation)
  const bodyWidthMm = getTextAnnotationBodyWidthMm(annotation)

  switch (annotation.style.align) {
    case 'center':
      return roundMm(textOrigin.x + (bodyWidthMm - lineWidthMm) / 2)
    case 'right':
      return roundMm(textOrigin.x + bodyWidthMm - lineWidthMm)
    case 'left':
    default:
      return textOrigin.x
  }
}

export function getUnderlineOffsetMm(style: AnnotationTextStyle) {
  return roundMm(style.fontSizeMm * 0.88)
}

export function getTextAnnotationTailPointsMm(annotation: AnnotationText) {
  if (annotation.variant !== 'callout-bubble' || !annotation.tailMm) {
    return undefined
  }

  const bodyBounds = getTextAnnotationBodyBoundsMm(annotation)
  const baseCenterX = clamp(
    annotation.tailMm.x,
    bodyBounds.x + 12,
    bodyBounds.x + bodyBounds.width - 12,
  )
  const baseWidthMm = clamp(bodyBounds.width * 0.16, 10, 18)
  const baseY = bodyBounds.y + bodyBounds.height

  return [
    { x: roundMm(baseCenterX - baseWidthMm / 2), y: roundMm(baseY - 0.5) },
    { x: roundMm(baseCenterX + baseWidthMm / 2), y: roundMm(baseY - 0.5) },
    { x: roundMm(annotation.tailMm.x), y: roundMm(annotation.tailMm.y) },
  ]
}

export function getArrowAnnotationBoundsMm(annotation: ArrowShapeAnnotation): BoundsMm {
  const paddingMm = Math.max(3.5, annotation.strokeWidthMm * 2.4)
  const minimumX = Math.min(annotation.startMm.x, annotation.endMm.x)
  const minimumY = Math.min(annotation.startMm.y, annotation.endMm.y)
  const maximumX = Math.max(annotation.startMm.x, annotation.endMm.x)
  const maximumY = Math.max(annotation.startMm.y, annotation.endMm.y)

  return {
    x: roundMm(minimumX - paddingMm),
    y: roundMm(minimumY - paddingMm),
    width: roundMm(maximumX - minimumX + paddingMm * 2),
    height: roundMm(maximumY - minimumY + paddingMm * 2),
  }
}

export function getDiamondPointsMm(annotation: DiamondShapeAnnotation) {
  const { x, y, width, height } = annotation.boundsMm
  return [
    { x: roundMm(x + width / 2), y },
    { x: roundMm(x + width), y: roundMm(y + height / 2) },
    { x: roundMm(x + width / 2), y: roundMm(y + height) },
    { x, y: roundMm(y + height / 2) },
  ]
}

export function getShapeAnnotationBoundsMm(annotation: ShapeAnnotation): BoundsMm {
  if (annotation.shapeKind === 'arrow') {
    return getArrowAnnotationBoundsMm(annotation)
  }

  return annotation.boundsMm
}

export function getAnnotationBoundsMm(annotation: SceneAnnotation): BoundsMm {
  switch (annotation.kind) {
    case 'line': {
      const paddingMm = Math.max(1.6, annotation.strokeWidthMm * 1.8)
      const minimumX = Math.min(annotation.startMm.x, annotation.endMm.x)
      const minimumY = Math.min(annotation.startMm.y, annotation.endMm.y)
      const maximumX = Math.max(annotation.startMm.x, annotation.endMm.x)
      const maximumY = Math.max(annotation.startMm.y, annotation.endMm.y)

      return {
        x: roundMm(minimumX - paddingMm),
        y: roundMm(minimumY - paddingMm),
        width: roundMm(maximumX - minimumX + paddingMm * 2),
        height: roundMm(maximumY - minimumY + paddingMm * 2),
      }
    }
    case 'text':
      return getTextAnnotationBoundsMm(annotation)
    case 'shape':
      return getShapeAnnotationBoundsMm(annotation)
  }
}

export function getAnnotationOriginMm(annotation: SceneAnnotation): Vector2Mm {
  switch (annotation.kind) {
    case 'line':
      return annotation.startMm
    case 'text':
      return annotation.anchorMm
    case 'shape':
      return annotation.shapeKind === 'arrow'
        ? annotation.startMm
        : {
            x: annotation.boundsMm.x,
            y: annotation.boundsMm.y,
          }
  }
}

export function sortAnnotationsByZIndex<T extends SceneAnnotation>(annotations: T[]) {
  return [...annotations].sort((left, right) => {
    if (left.zIndex === right.zIndex) {
      return left.id.localeCompare(right.id)
    }

    return left.zIndex - right.zIndex
  })
}

export function reindexAnnotations<T extends SceneAnnotation>(annotations: T[]): T[] {
  return sortAnnotationsByZIndex(annotations).map((annotation, index) => ({
    ...annotation,
    zIndex: index,
  }))
}

export function translateAnnotation(
  annotation: SceneAnnotation,
  deltaMm: Vector2Mm,
): SceneAnnotation {
  switch (annotation.kind) {
    case 'line':
      return {
        ...annotation,
        startMm: {
          x: roundMm(annotation.startMm.x + deltaMm.x),
          y: roundMm(annotation.startMm.y + deltaMm.y),
        },
        endMm: {
          x: roundMm(annotation.endMm.x + deltaMm.x),
          y: roundMm(annotation.endMm.y + deltaMm.y),
        },
      }
    case 'text':
      return {
        ...annotation,
        anchorMm: {
          x: roundMm(annotation.anchorMm.x + deltaMm.x),
          y: roundMm(annotation.anchorMm.y + deltaMm.y),
        },
        tailMm: annotation.tailMm
          ? {
              x: roundMm(annotation.tailMm.x + deltaMm.x),
              y: roundMm(annotation.tailMm.y + deltaMm.y),
            }
          : undefined,
      }
    case 'shape':
      if (annotation.shapeKind === 'arrow') {
        return {
          ...annotation,
          startMm: {
            x: roundMm(annotation.startMm.x + deltaMm.x),
            y: roundMm(annotation.startMm.y + deltaMm.y),
          },
          endMm: {
            x: roundMm(annotation.endMm.x + deltaMm.x),
            y: roundMm(annotation.endMm.y + deltaMm.y),
          },
        }
      }

      return {
        ...annotation,
        boundsMm: {
          ...annotation.boundsMm,
          x: roundMm(annotation.boundsMm.x + deltaMm.x),
          y: roundMm(annotation.boundsMm.y + deltaMm.y),
        },
      }
  }
}

export function rotateAnnotationAroundCenterQuarterTurns(
  annotation: SceneAnnotation,
  centerMm: Vector2Mm,
  quarterTurns: 0 | 1 | 2 | 3,
): SceneAnnotation {
  const normalizedQuarterTurns = normalizeQuarterTurns(quarterTurns)

  if (normalizedQuarterTurns === 0) {
    return annotation
  }

  switch (annotation.kind) {
    case 'line':
      return {
        ...annotation,
        startMm: rotatePointAroundCenterQuarterTurns(
          annotation.startMm,
          centerMm,
          normalizedQuarterTurns,
        ),
        endMm: rotatePointAroundCenterQuarterTurns(
          annotation.endMm,
          centerMm,
          normalizedQuarterTurns,
        ),
      }
    case 'text':
      return {
        ...annotation,
        anchorMm: rotatePointAroundCenterQuarterTurns(
          annotation.anchorMm,
          centerMm,
          normalizedQuarterTurns,
        ),
        tailMm: annotation.tailMm
          ? rotatePointAroundCenterQuarterTurns(
              annotation.tailMm,
              centerMm,
              normalizedQuarterTurns,
            )
          : undefined,
      }
    case 'shape':
      if (annotation.shapeKind === 'arrow') {
        return {
          ...annotation,
          startMm: rotatePointAroundCenterQuarterTurns(
            annotation.startMm,
            centerMm,
            normalizedQuarterTurns,
          ),
          endMm: rotatePointAroundCenterQuarterTurns(
            annotation.endMm,
            centerMm,
            normalizedQuarterTurns,
          ),
        }
      }

      {
        const boundsCenter = getBoundsCenterMm(annotation.boundsMm)
        const rotatedCenter = rotatePointAroundCenterQuarterTurns(
          boundsCenter,
          centerMm,
          normalizedQuarterTurns,
        )
        const nextWidth =
          normalizedQuarterTurns % 2 === 1
            ? annotation.boundsMm.height
            : annotation.boundsMm.width
        const nextHeight =
          normalizedQuarterTurns % 2 === 1
            ? annotation.boundsMm.width
            : annotation.boundsMm.height

        return {
          ...annotation,
          boundsMm: {
            x: roundMm(rotatedCenter.x - nextWidth / 2),
            y: roundMm(rotatedCenter.y - nextHeight / 2),
            width: roundMm(nextWidth),
            height: roundMm(nextHeight),
          },
        }
      }
  }
}

export function resizeTextAnnotationWidth(
  annotation: AnnotationText,
  widthMm: number,
): AnnotationText {
  return {
    ...annotation,
    widthMm: roundMm(
      clamp(widthMm, MIN_TEXT_ANNOTATION_WIDTH_MM, MAX_TEXT_ANNOTATION_WIDTH_MM),
    ),
  }
}

export function normalizeRectLikeBounds(boundsMm: BoundsMm): BoundsMm {
  const widthMm = clamp(Math.abs(boundsMm.width), MIN_SHAPE_SIZE_MM, MAX_SHAPE_SIZE_MM)
  const heightMm = clamp(Math.abs(boundsMm.height), MIN_SHAPE_SIZE_MM, MAX_SHAPE_SIZE_MM)
  const x = boundsMm.width >= 0 ? boundsMm.x : boundsMm.x - widthMm
  const y = boundsMm.height >= 0 ? boundsMm.y : boundsMm.y - heightMm

  return {
    x: roundMm(x),
    y: roundMm(y),
    width: roundMm(widthMm),
    height: roundMm(heightMm),
  }
}

export function resizeShapeAnnotationBounds(
  annotation:
    | RectangleShapeAnnotation
    | RoundedRectangleShapeAnnotation
    | EllipseShapeAnnotation
    | DiamondShapeAnnotation,
  boundsMm: BoundsMm,
) {
  return {
    ...annotation,
    boundsMm: normalizeRectLikeBounds(boundsMm),
  }
}

export function updateArrowAnnotationEndpoint(
  annotation: ArrowShapeAnnotation,
  endpoint: 'start' | 'end',
  pointMm: Vector2Mm,
) {
  return endpoint === 'start'
    ? {
        ...annotation,
        startMm: {
          x: roundMm(pointMm.x),
          y: roundMm(pointMm.y),
        },
      }
    : {
        ...annotation,
        endMm: {
          x: roundMm(pointMm.x),
          y: roundMm(pointMm.y),
        },
      }
}

export function updateTextAnnotationTail(
  annotation: AnnotationText,
  tailMm: Vector2Mm,
) {
  if (annotation.variant !== 'callout-bubble') {
    return annotation
  }

  return {
    ...annotation,
    tailMm: {
      x: roundMm(tailMm.x),
      y: roundMm(tailMm.y),
    },
  }
}

function scaleRectLikeBounds(boundsMm: BoundsMm, deltaMm: number) {
  const nextWidth = clamp(boundsMm.width + deltaMm, MIN_SHAPE_SIZE_MM, MAX_SHAPE_SIZE_MM)
  const nextHeight = clamp(boundsMm.height + deltaMm, MIN_SHAPE_SIZE_MM, MAX_SHAPE_SIZE_MM)
  const widthDelta = nextWidth - boundsMm.width
  const heightDelta = nextHeight - boundsMm.height

  return {
    x: roundMm(boundsMm.x - widthDelta / 2),
    y: roundMm(boundsMm.y - heightDelta / 2),
    width: roundMm(nextWidth),
    height: roundMm(nextHeight),
  }
}

export function stepTextAnnotationWidth(
  annotation: AnnotationText,
  direction: 1 | -1,
) {
  return resizeTextAnnotationWidth(
    annotation,
    annotation.widthMm + TEXT_WIDTH_STEP_MM * direction,
  )
}

export function stepShapeAnnotationSize(
  annotation: ShapeAnnotation,
  direction: 1 | -1,
) {
  if (annotation.shapeKind === 'arrow') {
    const dx = annotation.endMm.x - annotation.startMm.x
    const dy = annotation.endMm.y - annotation.startMm.y
    const length = Math.hypot(dx, dy) || 1
    const nextLength = clamp(length + SHAPE_SIZE_STEP_MM * direction, 16, MAX_SHAPE_SIZE_MM)
    const scale = nextLength / length
    const center = {
      x: roundMm((annotation.startMm.x + annotation.endMm.x) / 2),
      y: roundMm((annotation.startMm.y + annotation.endMm.y) / 2),
    }

    return {
      ...annotation,
      startMm: {
        x: roundMm(center.x - (dx * scale) / 2),
        y: roundMm(center.y - (dy * scale) / 2),
      },
      endMm: {
        x: roundMm(center.x + (dx * scale) / 2),
        y: roundMm(center.y + (dy * scale) / 2),
      },
    }
  }

  return {
    ...annotation,
    boundsMm: scaleRectLikeBounds(annotation.boundsMm, SHAPE_SIZE_STEP_MM * direction),
  }
}

export function updateAnnotationVisibility<T extends SceneAnnotation>(
  annotation: T,
  hidden: boolean,
): T {
  return { ...annotation, hidden }
}

export function updateAnnotationLock<T extends SceneAnnotation>(
  annotation: T,
  locked: boolean,
): T {
  return { ...annotation, locked }
}

export function updateAnnotationLayerBand<T extends SceneAnnotation>(
  annotation: T,
  layerBand: AnnotationLayerBand,
): T {
  return { ...annotation, layerBand }
}

export function moveAnnotationInStack<T extends SceneAnnotation>(
  annotations: T[],
  annotationId: string,
  direction: 'forward' | 'backward' | 'front' | 'back',
) {
  const ordered = reindexAnnotations(annotations)
  const index = ordered.findIndex((annotation) => annotation.id === annotationId)

  if (index < 0) {
    return ordered
  }

  const [annotation] = ordered.splice(index, 1)

  switch (direction) {
    case 'front':
      ordered.push(annotation)
      break
    case 'back':
      ordered.unshift(annotation)
      break
    case 'forward':
      ordered.splice(Math.min(index + 1, ordered.length), 0, annotation)
      break
    case 'backward':
      ordered.splice(Math.max(0, index - 1), 0, annotation)
      break
  }

  return reindexAnnotations(ordered)
}

export function getAnnotationSelectionAnchorMm(annotation: SceneAnnotation) {
  const bounds = getAnnotationBoundsMm(annotation)

  return {
    x: roundMm(bounds.x + bounds.width / 2),
    y: bounds.y,
  }
}

export function clampAnnotationFontSizeMm(fontSizeMm: number) {
  return roundMm(clamp(fontSizeMm, 3.2, 18))
}

export function createDefaultTextAnnotation(
  id: string,
  anchorMm: Vector2Mm,
  variant: AnnotationTextVariant = DEFAULT_ANNOTATION_TEXT_VARIANT,
  zIndex = 0,
): AnnotationText {
  const roundedAnchor = {
    x: roundMm(anchorMm.x),
    y: roundMm(anchorMm.y),
  }

  switch (variant) {
    case 'sticky-note': {
      const defaults = getStickyNoteDefaults()
      return {
        ...createAnnotationBase(id, zIndex),
        kind: 'text',
        variant,
        anchorMm: roundedAnchor,
        backgroundColor: defaults.backgroundColor,
        borderColor: defaults.borderColor,
        widthMm: defaults.widthMm,
        text: 'Sticky note',
        style: {
          ...DEFAULT_ANNOTATION_TEXT_STYLE,
          color: defaults.textColor,
        },
      }
    }
    case 'note-card': {
      const defaults = getNoteCardDefaults()
      return {
        ...createAnnotationBase(id, zIndex),
        kind: 'text',
        variant,
        anchorMm: roundedAnchor,
        backgroundColor: defaults.backgroundColor,
        borderColor: defaults.borderColor,
        widthMm: defaults.widthMm,
        text: 'Note card',
        style: {
          ...DEFAULT_ANNOTATION_TEXT_STYLE,
          color: defaults.textColor,
        },
      }
    }
    case 'callout-bubble': {
      const defaults = getCalloutDefaults()
      return {
        ...createAnnotationBase(id, zIndex),
        kind: 'text',
        variant,
        anchorMm: roundedAnchor,
        backgroundColor: defaults.backgroundColor,
        borderColor: defaults.borderColor,
        tailMm: {
          x: roundMm(roundedAnchor.x + defaults.widthMm * 0.35),
          y: roundMm(roundedAnchor.y + 46),
        },
        widthMm: defaults.widthMm,
        text: 'Callout',
        style: {
          ...DEFAULT_ANNOTATION_TEXT_STYLE,
          color: defaults.textColor,
        },
      }
    }
    case 'plain':
    default:
      return {
        ...createAnnotationBase(id, zIndex),
        kind: 'text',
        variant: 'plain',
        anchorMm: roundedAnchor,
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        widthMm: DEFAULT_TEXT_ANNOTATION_WIDTH_MM,
        text: DEFAULT_TEXT_ANNOTATION_VALUE,
        style: { ...DEFAULT_ANNOTATION_TEXT_STYLE },
      }
  }
}

export function createDefaultShapeAnnotation(
  id: string,
  anchorMm: Vector2Mm,
  shapeKind: AnnotationShapeKind = DEFAULT_ANNOTATION_SHAPE_KIND,
  zIndex = 0,
): ShapeAnnotation {
  if (shapeKind === 'arrow') {
    return {
      ...createAnnotationBase(id, zIndex),
      kind: 'shape',
      shapeKind,
      startMm: {
        x: roundMm(anchorMm.x),
        y: roundMm(anchorMm.y),
      },
      endMm: {
        x: roundMm(anchorMm.x + 42),
        y: roundMm(anchorMm.y + 24),
      },
      strokeColor: DEFAULT_ANNOTATION_SHAPE_STROKE,
      fillColor: DEFAULT_ANNOTATION_SHAPE_STROKE,
      strokeWidthMm: DEFAULT_ANNOTATION_STROKE_WIDTH_MM,
    }
  }

  const isWideRect = shapeKind === 'rectangle' || shapeKind === 'rounded-rectangle'

  return {
    ...createAnnotationBase(id, zIndex),
    kind: 'shape',
    shapeKind,
    boundsMm: {
      x: roundMm(anchorMm.x),
      y: roundMm(anchorMm.y),
      width: isWideRect ? 40 : 34,
      height: 24,
    },
    strokeColor: DEFAULT_ANNOTATION_SHAPE_STROKE,
    fillColor: DEFAULT_ANNOTATION_SHAPE_FILL,
    strokeWidthMm: DEFAULT_ANNOTATION_STROKE_WIDTH_MM,
  }
}

export function getAnnotationKindLabel(annotation: SceneAnnotation) {
  if (annotation.kind === 'line') {
    return 'Line'
  }

  if (annotation.kind === 'shape') {
    switch (annotation.shapeKind) {
      case 'rounded-rectangle':
        return 'Rounded Rectangle'
      default:
        return annotation.shapeKind
          .split('-')
          .map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`)
          .join(' ')
    }
  }

  switch (annotation.variant) {
    case 'sticky-note':
      return 'Sticky Note'
    case 'note-card':
      return 'Note Card'
    case 'callout-bubble':
      return 'Callout Bubble'
    case 'plain':
    default:
      return 'Text'
  }
}

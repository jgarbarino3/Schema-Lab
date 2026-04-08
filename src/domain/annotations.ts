import { roundMm } from './geometry'
import type {
  AnnotationFontFamily,
  AnnotationShapeKind,
  AnnotationText,
  AnnotationTextStyle,
  ArrowShapeAnnotation,
  BoundsMm,
  RectangleShapeAnnotation,
  EllipseShapeAnnotation,
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

export const ANNOTATION_SHAPE_OPTIONS: Array<{
  id: AnnotationShapeKind
  label: string
}> = [
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'ellipse', label: 'Ellipse' },
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

export const DEFAULT_ANNOTATION_SHAPE_KIND: AnnotationShapeKind = 'rectangle'
export const DEFAULT_ANNOTATION_SHAPE_STROKE = '#8fe3ff'
export const DEFAULT_ANNOTATION_SHAPE_FILL = 'rgba(97, 180, 218, 0.18)'
export const DEFAULT_ANNOTATION_STROKE_WIDTH_MM = 0.9
export const DEFAULT_TEXT_ANNOTATION_WIDTH_MM = 72
export const DEFAULT_TEXT_ANNOTATION_VALUE = 'Double-click to edit'
export const MIN_TEXT_ANNOTATION_WIDTH_MM = 18
export const MIN_SHAPE_SIZE_MM = 8

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
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

      if (
        currentLine &&
        measureTextLineWidthMm(candidate, style) > maxWidthMm
      ) {
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
  const lineCount = Math.max(
    1,
    wrapAnnotationText(annotation.text, annotation.style, annotation.widthMm).length,
  )

  return roundMm(
    lineCount * getAnnotationLineHeightMm(annotation.style) +
      Math.max(1.8, annotation.style.fontSizeMm * 0.22),
  )
}

export function getTextAnnotationBoundsMm(annotation: AnnotationText): BoundsMm {
  return {
    x: annotation.anchorMm.x,
    y: annotation.anchorMm.y,
    width: annotation.widthMm,
    height: getTextAnnotationHeightMm(annotation),
  }
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

export function resizeTextAnnotationWidth(
  annotation: AnnotationText,
  widthMm: number,
): AnnotationText {
  return {
    ...annotation,
    widthMm: roundMm(Math.max(MIN_TEXT_ANNOTATION_WIDTH_MM, widthMm)),
  }
}

export function normalizeRectLikeBounds(boundsMm: BoundsMm): BoundsMm {
  const widthMm = Math.max(MIN_SHAPE_SIZE_MM, Math.abs(boundsMm.width))
  const heightMm = Math.max(MIN_SHAPE_SIZE_MM, Math.abs(boundsMm.height))
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
  annotation: RectangleShapeAnnotation | EllipseShapeAnnotation,
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

export function getTextLineStartX(
  annotation: AnnotationText,
  lineWidthMm: number,
) {
  const bounds = getTextAnnotationBoundsMm(annotation)

  switch (annotation.style.align) {
    case 'center':
      return roundMm(bounds.x + (bounds.width - lineWidthMm) / 2)
    case 'right':
      return roundMm(bounds.x + bounds.width - lineWidthMm)
    case 'left':
    default:
      return bounds.x
  }
}

export function getUnderlineOffsetMm(style: AnnotationTextStyle) {
  return roundMm(style.fontSizeMm * 0.88)
}

export function createDefaultTextAnnotation(
  id: string,
  anchorMm: Vector2Mm,
): AnnotationText {
  return {
    id,
    kind: 'text',
    anchorMm: {
      x: roundMm(anchorMm.x),
      y: roundMm(anchorMm.y),
    },
    widthMm: DEFAULT_TEXT_ANNOTATION_WIDTH_MM,
    text: DEFAULT_TEXT_ANNOTATION_VALUE,
    style: { ...DEFAULT_ANNOTATION_TEXT_STYLE },
  }
}

export function createDefaultShapeAnnotation(
  id: string,
  anchorMm: Vector2Mm,
  shapeKind: AnnotationShapeKind = DEFAULT_ANNOTATION_SHAPE_KIND,
): ShapeAnnotation {
  if (shapeKind === 'arrow') {
    return {
      id,
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

  return {
    id,
    kind: 'shape',
    shapeKind,
    boundsMm: {
      x: roundMm(anchorMm.x),
      y: roundMm(anchorMm.y),
      width: shapeKind === 'rectangle' ? 40 : 34,
      height: shapeKind === 'rectangle' ? 24 : 24,
    },
    strokeColor: DEFAULT_ANNOTATION_SHAPE_STROKE,
    fillColor: DEFAULT_ANNOTATION_SHAPE_FILL,
    strokeWidthMm: DEFAULT_ANNOTATION_STROKE_WIDTH_MM,
  }
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


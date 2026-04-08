import type { KonvaEventObject } from 'konva/lib/Node'
import { Arrow, Circle, Ellipse, Group, Layer, Line, Rect, Text } from 'react-konva'
import {
  getAnnotationFontStyle,
  getAnnotationFontStack,
  getAnnotationLineHeightMm,
  getAnnotationOriginMm,
  getArrowAnnotationBoundsMm,
  getTextAnnotationBoundsMm,
  getTextLineStartX,
  getUnderlineOffsetMm,
  measureTextLineWidthMm,
  wrapAnnotationText,
} from '../domain/annotations'
import { screenToWorld, worldToScreen } from '../domain/geometry'
import type {
  ActiveTool,
  AnnotationText,
  SceneAnnotation,
  ScreenPointPx,
  ShapeAnnotation,
  ViewportState,
} from '../domain/types'

interface AnnotationsLayerProps {
  activeTool: ActiveTool
  annotations: SceneAnnotation[]
  editingTextAnnotationId?: string
  onAnnotationToolClick?: (
    event?: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => void
  onResizeSelectedShape?: (
    update: {
      boundsMm?: {
        x?: number
        y?: number
        width?: number
        height?: number
      }
      endMm?: { x: number; y: number }
      startMm?: { x: number; y: number }
    },
  ) => void
  onResizeSelectedText?: (widthMm: number) => void
  onSelectAnnotation: (annotationId: string) => void
  onStartTextEditing: (annotationId: string) => void
  onTranslateAnnotation: (annotationId: string, deltaMm: { x: number; y: number }) => void
  selectedAnnotationId?: string
  viewport: ViewportState
}

function isAnnotationSelectionTool(activeTool: ActiveTool) {
  return activeTool === 'select'
}

function getSelectionStroke(isSelected: boolean) {
  return isSelected ? '#8ecedf' : '#6a8590'
}

function createDragDeltaMm(
  screenPointPx: ScreenPointPx,
  originMm: { x: number; y: number },
  viewport: ViewportState,
) {
  const nextOriginMm = screenToWorld(screenPointPx, viewport)

  return {
    x: nextOriginMm.x - originMm.x,
    y: nextOriginMm.y - originMm.y,
  }
}

function renderTextUnderlines(annotation: AnnotationText) {
  if (!annotation.style.underline) {
    return null
  }

  const bounds = getTextAnnotationBoundsMm(annotation)
  const wrappedLines = wrapAnnotationText(
    annotation.text,
    annotation.style,
    annotation.widthMm,
  )
  const lineHeightMm = getAnnotationLineHeightMm(annotation.style)
  const underlineOffsetMm = getUnderlineOffsetMm(annotation.style)

  return wrappedLines.map((line, index) => {
    if (!line) {
      return null
    }

    const lineWidthMm = Math.min(
      annotation.widthMm,
      measureTextLineWidthMm(line, annotation.style),
    )
    const lineStartX = getTextLineStartX(annotation, lineWidthMm) - bounds.x
    const underlineY = index * lineHeightMm + underlineOffsetMm

    return (
      <Line
        key={`${annotation.id}-underline-${index}`}
        listening={false}
        points={[lineStartX, underlineY, lineStartX + lineWidthMm, underlineY]}
        stroke={annotation.style.color}
        strokeWidth={Math.max(0.28, annotation.style.fontSizeMm * 0.08)}
      />
    )
  })
}

function TextAnnotationNode({
  activeTool,
  annotation,
  isEditing,
  isSelected,
  onAnnotationToolClick,
  onResizeSelectedText,
  onSelectAnnotation,
  onStartTextEditing,
  onTranslateAnnotation,
  viewport,
}: {
  activeTool: ActiveTool
  annotation: AnnotationText
  isEditing: boolean
  isSelected: boolean
  onAnnotationToolClick?: (
    event?: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => void
  onResizeSelectedText?: (widthMm: number) => void
  onSelectAnnotation: (annotationId: string) => void
  onStartTextEditing: (annotationId: string) => void
  onTranslateAnnotation: (annotationId: string, deltaMm: { x: number; y: number }) => void
  viewport: ViewportState
}) {
  const bounds = getTextAnnotationBoundsMm(annotation)
  const wrappedText = wrapAnnotationText(annotation.text, annotation.style, annotation.widthMm)
  const lineHeight = getAnnotationLineHeightMm(annotation.style) / annotation.style.fontSizeMm
  const screenAnchorPx = worldToScreen(annotation.anchorMm, viewport)
  const originMm = getAnnotationOriginMm(annotation)
  const selectionStroke = getSelectionStroke(isSelected)

  return (
    <Group
      draggable={isSelected && isAnnotationSelectionTool(activeTool) && !isEditing}
      dragDistance={1}
      onClick={(event) => {
        event.cancelBubble = true
        if (!isAnnotationSelectionTool(activeTool)) {
          onAnnotationToolClick?.(event)
          return
        }

        onSelectAnnotation(annotation.id)
      }}
      onDblClick={(event) => {
        event.cancelBubble = true
        onStartTextEditing(annotation.id)
      }}
      onDblTap={(event) => {
        event.cancelBubble = true
        onStartTextEditing(annotation.id)
      }}
      onDragEnd={(event) => {
        event.cancelBubble = true
        onTranslateAnnotation(
          annotation.id,
          createDragDeltaMm(
            { x: event.target.x(), y: event.target.y() },
            originMm,
            viewport,
          ),
        )
      }}
      onMouseDown={(event) => {
        if (isSelected && isAnnotationSelectionTool(activeTool)) {
          event.cancelBubble = true
        }
      }}
      onTap={(event) => {
        event.cancelBubble = true
        if (!isAnnotationSelectionTool(activeTool)) {
          onAnnotationToolClick?.(event)
          return
        }

        onSelectAnnotation(annotation.id)
      }}
      scaleX={viewport.zoomPxPerMm}
      scaleY={viewport.zoomPxPerMm}
      x={screenAnchorPx.x}
      y={screenAnchorPx.y}
    >
      <Rect
        fill="rgba(0, 0, 0, 0.001)"
        height={bounds.height}
        width={bounds.width}
        x={0}
        y={0}
      />
      {isSelected ? (
        <Rect
          dash={[4, 3]}
          fill="rgba(143, 212, 239, 0.05)"
          height={bounds.height}
          listening={false}
          stroke={selectionStroke}
          strokeWidth={0.7}
          width={bounds.width}
          x={0}
          y={0}
        />
      ) : null}
      {!isEditing ? (
        <>
          <Text
            align={annotation.style.align}
            fill={annotation.style.color}
            fontFamily={getAnnotationFontStack(annotation.style.fontFamily)}
            fontSize={annotation.style.fontSizeMm}
            fontStyle={getAnnotationFontStyle(annotation.style)}
            lineHeight={lineHeight}
            listening={false}
            text={wrappedText.join('\n')}
            width={annotation.widthMm}
            x={0}
            y={0}
          />
          {renderTextUnderlines(annotation)}
        </>
      ) : null}
      {isSelected && !isEditing && isAnnotationSelectionTool(activeTool) ? (
        <Circle
          draggable
          fill="#8ccfdf"
          onDragMove={(event) => {
            event.cancelBubble = true
            const absolutePosition = event.target.getAbsolutePosition()
            const nextWorldPoint = screenToWorld(
              {
                x: absolutePosition.x,
                y: absolutePosition.y,
              },
              viewport,
            )
            onResizeSelectedText?.(nextWorldPoint.x - annotation.anchorMm.x)
          }}
          onMouseDown={(event) => {
            event.cancelBubble = true
          }}
          onTouchStart={(event) => {
            event.cancelBubble = true
          }}
          radius={2.1}
          stroke="#0e222a"
          strokeWidth={0.5}
          x={bounds.width}
          y={bounds.height / 2}
        />
      ) : null}
    </Group>
  )
}

function ShapeAnnotationNode({
  activeTool,
  annotation,
  isSelected,
  onAnnotationToolClick,
  onResizeSelectedShape,
  onSelectAnnotation,
  onTranslateAnnotation,
  viewport,
}: {
  activeTool: ActiveTool
  annotation: ShapeAnnotation
  isSelected: boolean
  onAnnotationToolClick?: (
    event?: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => void
  onResizeSelectedShape?: (
    update: {
      boundsMm?: {
        x?: number
        y?: number
        width?: number
        height?: number
      }
      endMm?: { x: number; y: number }
      startMm?: { x: number; y: number }
    },
  ) => void
  onSelectAnnotation: (annotationId: string) => void
  onTranslateAnnotation: (annotationId: string, deltaMm: { x: number; y: number }) => void
  viewport: ViewportState
}) {
  const originMm = getAnnotationOriginMm(annotation)
  const screenOriginPx = worldToScreen(originMm, viewport)
  const selectionStroke = getSelectionStroke(isSelected)
  const localBounds =
    annotation.shapeKind === 'arrow'
      ? (() => {
          const bounds = getArrowAnnotationBoundsMm(annotation)
          return {
            x: bounds.x - annotation.startMm.x,
            y: bounds.y - annotation.startMm.y,
            width: bounds.width,
            height: bounds.height,
          }
        })()
      : {
          x: 0,
          y: 0,
          width: annotation.boundsMm.width,
          height: annotation.boundsMm.height,
        }
  const arrowEndLocal =
    annotation.shapeKind === 'arrow'
      ? {
          x: annotation.endMm.x - annotation.startMm.x,
          y: annotation.endMm.y - annotation.startMm.y,
        }
      : undefined

  return (
    <Group
      draggable={isSelected && isAnnotationSelectionTool(activeTool)}
      dragDistance={1}
      onClick={(event) => {
        event.cancelBubble = true
        if (!isAnnotationSelectionTool(activeTool)) {
          onAnnotationToolClick?.(event)
          return
        }

        onSelectAnnotation(annotation.id)
      }}
      onDragEnd={(event) => {
        event.cancelBubble = true
        onTranslateAnnotation(
          annotation.id,
          createDragDeltaMm(
            { x: event.target.x(), y: event.target.y() },
            originMm,
            viewport,
          ),
        )
      }}
      onMouseDown={(event) => {
        if (isSelected && isAnnotationSelectionTool(activeTool)) {
          event.cancelBubble = true
        }
      }}
      onTap={(event) => {
        event.cancelBubble = true
        if (!isAnnotationSelectionTool(activeTool)) {
          onAnnotationToolClick?.(event)
          return
        }

        onSelectAnnotation(annotation.id)
      }}
      scaleX={viewport.zoomPxPerMm}
      scaleY={viewport.zoomPxPerMm}
      x={screenOriginPx.x}
      y={screenOriginPx.y}
    >
      {annotation.shapeKind === 'rectangle' ? (
        <Rect
          fill={annotation.fillColor}
          height={annotation.boundsMm.height}
          stroke={annotation.strokeColor}
          strokeWidth={annotation.strokeWidthMm}
          width={annotation.boundsMm.width}
          x={0}
          y={0}
        />
      ) : null}

      {annotation.shapeKind === 'ellipse' ? (
        <Ellipse
          fill={annotation.fillColor}
          radiusX={annotation.boundsMm.width / 2}
          radiusY={annotation.boundsMm.height / 2}
          stroke={annotation.strokeColor}
          strokeWidth={annotation.strokeWidthMm}
          x={annotation.boundsMm.width / 2}
          y={annotation.boundsMm.height / 2}
        />
      ) : null}

      {annotation.shapeKind === 'arrow' && arrowEndLocal ? (
        <Arrow
          fill={annotation.fillColor}
          lineCap="round"
          lineJoin="round"
          points={[0, 0, arrowEndLocal.x, arrowEndLocal.y]}
          pointerLength={Math.max(4, annotation.strokeWidthMm * 5)}
          pointerWidth={Math.max(4.5, annotation.strokeWidthMm * 6)}
          stroke={annotation.strokeColor}
          strokeWidth={annotation.strokeWidthMm}
        />
      ) : null}

      {isSelected ? (
        <Rect
          dash={[4, 3]}
          fill="rgba(143, 212, 239, 0.04)"
          height={localBounds.height}
          listening={false}
          stroke={selectionStroke}
          strokeWidth={0.7}
          width={localBounds.width}
          x={localBounds.x}
          y={localBounds.y}
        />
      ) : null}

      {isSelected &&
      annotation.shapeKind !== 'arrow' &&
      isAnnotationSelectionTool(activeTool) ? (
        <Circle
          draggable
          fill="#8ccfdf"
          onDragMove={(event) => {
            event.cancelBubble = true
            const absolutePosition = event.target.getAbsolutePosition()
            const nextWorldPoint = screenToWorld(
              {
                x: absolutePosition.x,
                y: absolutePosition.y,
              },
              viewport,
            )

            onResizeSelectedShape?.({
              boundsMm: {
                width: nextWorldPoint.x - annotation.boundsMm.x,
                height: nextWorldPoint.y - annotation.boundsMm.y,
              },
            })
          }}
          onMouseDown={(event) => {
            event.cancelBubble = true
          }}
          onTouchStart={(event) => {
            event.cancelBubble = true
          }}
          radius={2.1}
          stroke="#0e222a"
          strokeWidth={0.5}
          x={annotation.boundsMm.width}
          y={annotation.boundsMm.height}
        />
      ) : null}

      {isSelected &&
      annotation.shapeKind === 'arrow' &&
      arrowEndLocal &&
      isAnnotationSelectionTool(activeTool) ? (
        <>
          <Circle
            draggable
            fill="#8ccfdf"
            onDragMove={(event) => {
              event.cancelBubble = true
              const absolutePosition = event.target.getAbsolutePosition()
              onResizeSelectedShape?.({
                startMm: screenToWorld(
                  {
                    x: absolutePosition.x,
                    y: absolutePosition.y,
                  },
                  viewport,
                ),
              })
            }}
            onMouseDown={(event) => {
              event.cancelBubble = true
            }}
            onTouchStart={(event) => {
              event.cancelBubble = true
            }}
            radius={2.1}
            stroke="#0e222a"
            strokeWidth={0.5}
            x={0}
            y={0}
          />
          <Circle
            draggable
            fill="#8ccfdf"
            onDragMove={(event) => {
              event.cancelBubble = true
              const absolutePosition = event.target.getAbsolutePosition()
              onResizeSelectedShape?.({
                endMm: screenToWorld(
                  {
                    x: absolutePosition.x,
                    y: absolutePosition.y,
                  },
                  viewport,
                ),
              })
            }}
            onMouseDown={(event) => {
              event.cancelBubble = true
            }}
            onTouchStart={(event) => {
              event.cancelBubble = true
            }}
            radius={2.1}
            stroke="#0e222a"
            strokeWidth={0.5}
            x={arrowEndLocal.x}
            y={arrowEndLocal.y}
          />
        </>
      ) : null}
    </Group>
  )
}

export function AnnotationsLayer({
  activeTool,
  annotations,
  editingTextAnnotationId,
  onAnnotationToolClick,
  onResizeSelectedShape,
  onResizeSelectedText,
  onSelectAnnotation,
  onStartTextEditing,
  onTranslateAnnotation,
  selectedAnnotationId,
  viewport,
}: AnnotationsLayerProps) {
  const visibleAnnotations = annotations.filter((annotation) => annotation.kind !== 'line')

  if (visibleAnnotations.length === 0) {
    return null
  }

  return (
    <Layer>
      {visibleAnnotations.map((annotation) =>
        annotation.kind === 'text' ? (
          <TextAnnotationNode
            activeTool={activeTool}
            annotation={annotation}
            isEditing={editingTextAnnotationId === annotation.id}
            isSelected={selectedAnnotationId === annotation.id}
            key={annotation.id}
            onAnnotationToolClick={onAnnotationToolClick}
            onResizeSelectedText={onResizeSelectedText}
            onSelectAnnotation={onSelectAnnotation}
            onStartTextEditing={onStartTextEditing}
            onTranslateAnnotation={onTranslateAnnotation}
            viewport={viewport}
          />
        ) : (
          <ShapeAnnotationNode
            activeTool={activeTool}
            annotation={annotation}
            isSelected={selectedAnnotationId === annotation.id}
            key={annotation.id}
            onAnnotationToolClick={onAnnotationToolClick}
            onResizeSelectedShape={onResizeSelectedShape}
            onSelectAnnotation={onSelectAnnotation}
            onTranslateAnnotation={onTranslateAnnotation}
            viewport={viewport}
          />
        ),
      )}
    </Layer>
  )
}

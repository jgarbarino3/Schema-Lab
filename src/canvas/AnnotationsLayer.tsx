import type { KonvaEventObject } from 'konva/lib/Node'
import { Arrow, Circle, Ellipse, Group, Layer, Line, Rect, Text } from 'react-konva'
import {
  getAnnotationFontStyle,
  getAnnotationFontStack,
  getAnnotationLineHeightMm,
  getAnnotationOriginMm,
  getArrowAnnotationBoundsMm,
  getDiamondPointsMm,
  getTextAnnotationBodyBoundsMm,
  getTextAnnotationBodyWidthMm,
  getTextAnnotationBoundsMm,
  getTextAnnotationCornerRadiusMm,
  getTextAnnotationTailPointsMm,
  getTextAnnotationTextOriginMm,
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
  Vector2Mm,
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
  onUpdateSelectedText?: (update: {
    tailMm?: Vector2Mm
    widthMm?: number
  }) => void
  onSelectAnnotation: (annotationId: string) => void
  onStartTextEditing: (annotationId: string) => void
  onTranslateAnnotation: (annotationId: string, deltaMm: { x: number; y: number }) => void
  onClearGuides?: () => void
  selectedAnnotationId?: string
  resolveDragPositionPx?: (
    annotationId: string,
    screenPointPx: ScreenPointPx,
  ) => ScreenPointPx
  viewport: ViewportState
}

function isAnnotationSelectionTool(activeTool: ActiveTool) {
  return activeTool === 'select'
}

function getSelectionStroke(isSelected: boolean) {
  return isSelected ? '#8ecedf' : '#4d6570'
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

  const wrappedLines = wrapAnnotationText(
    annotation.text,
    annotation.style,
    getTextAnnotationBodyWidthMm(annotation),
  )
  const lineHeightMm = getAnnotationLineHeightMm(annotation.style)
  const underlineOffsetMm = getUnderlineOffsetMm(annotation.style)
  const textOriginMm = getTextAnnotationTextOriginMm(annotation)

  return wrappedLines.map((line, index) => {
    if (!line) {
      return null
    }

    const lineWidthMm = Math.min(
      getTextAnnotationBodyWidthMm(annotation),
      measureTextLineWidthMm(line, annotation.style),
    )
    const lineStartX = getTextLineStartX(annotation, lineWidthMm) - annotation.anchorMm.x
    const underlineY =
      textOriginMm.y -
      annotation.anchorMm.y +
      index * lineHeightMm +
      underlineOffsetMm

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

function renderTextAnnotationBackground(annotation: AnnotationText) {
  if (annotation.variant === 'plain') {
    return null
  }

  const bodyBounds = getTextAnnotationBodyBoundsMm(annotation)
  const localX = bodyBounds.x - annotation.anchorMm.x
  const localY = bodyBounds.y - annotation.anchorMm.y
  const cornerRadius = getTextAnnotationCornerRadiusMm(annotation.variant)

  if (annotation.variant === 'callout-bubble') {
    const tailPoints = getTextAnnotationTailPointsMm(annotation)

    return (
      <>
        <Rect
          cornerRadius={cornerRadius}
          fill={annotation.backgroundColor}
          height={bodyBounds.height}
          stroke={annotation.borderColor}
          strokeWidth={0.7}
          width={bodyBounds.width}
          x={localX}
          y={localY}
        />
        {tailPoints ? (
          <Line
            closed
            fill={annotation.backgroundColor}
            points={tailPoints.flatMap((point) => [
              point.x - annotation.anchorMm.x,
              point.y - annotation.anchorMm.y,
            ])}
            stroke={annotation.borderColor}
            strokeWidth={0.7}
          />
        ) : null}
      </>
    )
  }

  return (
    <>
      <Rect
        cornerRadius={cornerRadius}
        fill={annotation.backgroundColor}
        height={bodyBounds.height}
        shadowBlur={annotation.variant === 'sticky-note' ? 7 : 9}
        shadowColor="rgba(0,0,0,0.3)"
        shadowOpacity={0.26}
        stroke={annotation.borderColor}
        strokeWidth={0.7}
        width={bodyBounds.width}
        x={localX}
        y={localY}
      />
      {annotation.variant === 'sticky-note' ? (
        <Line
          closed
          fill="rgba(255,255,255,0.16)"
          listening={false}
          points={[
            localX + bodyBounds.width - 10,
            localY,
            localX + bodyBounds.width,
            localY,
            localX + bodyBounds.width,
            localY + 10,
          ]}
          stroke="rgba(0,0,0,0.08)"
          strokeWidth={0.45}
        />
      ) : null}
      {annotation.variant === 'note-card' ? (
        <Rect
          cornerRadius={cornerRadius}
          fill="rgba(255,255,255,0.03)"
          height={4.2}
          listening={false}
          width={bodyBounds.width}
          x={localX}
          y={localY}
        />
      ) : null}
    </>
  )
}

function TextAnnotationNode({
  activeTool,
  annotation,
  isEditing,
  isSelected,
  onAnnotationToolClick,
  onSelectAnnotation,
  onStartTextEditing,
  onTranslateAnnotation,
  onUpdateSelectedText,
  onClearGuides,
  resolveDragPositionPx,
  viewport,
}: {
  activeTool: ActiveTool
  annotation: AnnotationText
  isEditing: boolean
  isSelected: boolean
  onAnnotationToolClick?: (
    event?: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => void
  onSelectAnnotation: (annotationId: string) => void
  onStartTextEditing: (annotationId: string) => void
  onTranslateAnnotation: (annotationId: string, deltaMm: { x: number; y: number }) => void
  onUpdateSelectedText?: (update: { tailMm?: Vector2Mm; widthMm?: number }) => void
  onClearGuides?: () => void
  resolveDragPositionPx?: (
    annotationId: string,
    screenPointPx: ScreenPointPx,
  ) => ScreenPointPx
  viewport: ViewportState
}) {
  const bounds = getTextAnnotationBoundsMm(annotation)
  const bodyBounds = getTextAnnotationBodyBoundsMm(annotation)
  const wrappedText = wrapAnnotationText(
    annotation.text,
    annotation.style,
    getTextAnnotationBodyWidthMm(annotation),
  )
  const lineHeight = getAnnotationLineHeightMm(annotation.style) / annotation.style.fontSizeMm
  const screenAnchorPx = worldToScreen(annotation.anchorMm, viewport)
  const originMm = getAnnotationOriginMm(annotation)
  const selectionStroke = getSelectionStroke(isSelected)
  const textOriginMm = getTextAnnotationTextOriginMm(annotation)

  return (
    <Group
      draggable={
        isAnnotationSelectionTool(activeTool) && !isEditing && !annotation.locked
      }
      dragDistance={2}
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
        onClearGuides?.()
      }}
      onDragStart={(event) => {
        event.cancelBubble = true
        onSelectAnnotation(annotation.id)
      }}
      onMouseDown={(event) => {
        if (isAnnotationSelectionTool(activeTool)) {
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
      dragBoundFunc={
        isAnnotationSelectionTool(activeTool) && !isEditing && !annotation.locked && resolveDragPositionPx
          ? (position) => resolveDragPositionPx(annotation.id, position)
          : undefined
      }
    >
      <Rect
        fill="rgba(0, 0, 0, 0.001)"
        height={bounds.height}
        width={bounds.width}
        x={0}
        y={0}
      />

      {renderTextAnnotationBackground(annotation)}

      {isSelected ? (
        <Rect
          dash={[4, 3]}
          fill="rgba(143, 212, 239, 0.04)"
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
            width={getTextAnnotationBodyWidthMm(annotation)}
            x={textOriginMm.x - annotation.anchorMm.x}
            y={textOriginMm.y - annotation.anchorMm.y}
          />
          {renderTextUnderlines(annotation)}
        </>
      ) : null}

      {isSelected &&
      !isEditing &&
      isAnnotationSelectionTool(activeTool) &&
      !annotation.locked ? (
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
            onUpdateSelectedText?.({
              widthMm: nextWorldPoint.x - annotation.anchorMm.x,
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
          x={bodyBounds.width}
          y={bodyBounds.height / 2}
        />
      ) : null}

      {isSelected &&
      !isEditing &&
      annotation.variant === 'callout-bubble' &&
      annotation.tailMm &&
      isAnnotationSelectionTool(activeTool) &&
      !annotation.locked ? (
        <Circle
          draggable
          fill="#f5d28c"
          onDragMove={(event) => {
            event.cancelBubble = true
            const absolutePosition = event.target.getAbsolutePosition()
            onUpdateSelectedText?.({
              tailMm: screenToWorld(
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
          radius={2.25}
          stroke="#132028"
          strokeWidth={0.5}
          x={annotation.tailMm.x - annotation.anchorMm.x}
          y={annotation.tailMm.y - annotation.anchorMm.y}
        />
      ) : null}
    </Group>
  )
}

function renderShapeBody(annotation: ShapeAnnotation) {
  switch (annotation.shapeKind) {
    case 'rectangle':
      return (
        <Rect
          fill={annotation.fillColor}
          height={annotation.boundsMm.height}
          stroke={annotation.strokeColor}
          strokeWidth={annotation.strokeWidthMm}
          width={annotation.boundsMm.width}
          x={0}
          y={0}
        />
      )
    case 'rounded-rectangle':
      return (
        <Rect
          cornerRadius={Math.min(5.2, Math.min(annotation.boundsMm.width, annotation.boundsMm.height) * 0.18)}
          fill={annotation.fillColor}
          height={annotation.boundsMm.height}
          stroke={annotation.strokeColor}
          strokeWidth={annotation.strokeWidthMm}
          width={annotation.boundsMm.width}
          x={0}
          y={0}
        />
      )
    case 'ellipse':
      return (
        <Ellipse
          fill={annotation.fillColor}
          radiusX={annotation.boundsMm.width / 2}
          radiusY={annotation.boundsMm.height / 2}
          stroke={annotation.strokeColor}
          strokeWidth={annotation.strokeWidthMm}
          x={annotation.boundsMm.width / 2}
          y={annotation.boundsMm.height / 2}
        />
      )
    case 'diamond':
      return (
        <Line
          closed
          fill={annotation.fillColor}
          points={getDiamondPointsMm(annotation).flatMap((point) => [
            point.x - annotation.boundsMm.x,
            point.y - annotation.boundsMm.y,
          ])}
          stroke={annotation.strokeColor}
          strokeWidth={annotation.strokeWidthMm}
        />
      )
    case 'arrow':
      return (
        <Arrow
          fill={annotation.fillColor}
          lineCap="round"
          lineJoin="round"
          points={[
            0,
            0,
            annotation.endMm.x - annotation.startMm.x,
            annotation.endMm.y - annotation.startMm.y,
          ]}
          pointerLength={Math.max(4, annotation.strokeWidthMm * 5)}
          pointerWidth={Math.max(4.5, annotation.strokeWidthMm * 6)}
          stroke={annotation.strokeColor}
          strokeWidth={annotation.strokeWidthMm}
        />
      )
  }
}

function ShapeAnnotationNode({
  activeTool,
  annotation,
  isSelected,
  onAnnotationToolClick,
  onResizeSelectedShape,
  onSelectAnnotation,
  onTranslateAnnotation,
  onClearGuides,
  resolveDragPositionPx,
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
  onClearGuides?: () => void
  resolveDragPositionPx?: (
    annotationId: string,
    screenPointPx: ScreenPointPx,
  ) => ScreenPointPx
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
      draggable={isAnnotationSelectionTool(activeTool) && !annotation.locked}
      dragDistance={2}
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
        onClearGuides?.()
      }}
      onDragStart={(event) => {
        event.cancelBubble = true
        onSelectAnnotation(annotation.id)
      }}
      onMouseDown={(event) => {
        if (isAnnotationSelectionTool(activeTool)) {
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
      dragBoundFunc={
        isAnnotationSelectionTool(activeTool) && !annotation.locked && resolveDragPositionPx
          ? (position) => resolveDragPositionPx(annotation.id, position)
          : undefined
      }
    >
      {renderShapeBody(annotation)}

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
      isAnnotationSelectionTool(activeTool) &&
      !annotation.locked ? (
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
      isAnnotationSelectionTool(activeTool) &&
      !annotation.locked ? (
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
  onSelectAnnotation,
  onStartTextEditing,
  onTranslateAnnotation,
  onUpdateSelectedText,
  onClearGuides,
  resolveDragPositionPx,
  selectedAnnotationId,
  viewport,
}: AnnotationsLayerProps) {
  const visibleAnnotations = annotations.filter(
    (annotation): annotation is AnnotationText | ShapeAnnotation =>
      annotation.kind !== 'line' && !annotation.hidden,
  )

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
            onSelectAnnotation={onSelectAnnotation}
            onStartTextEditing={onStartTextEditing}
            onTranslateAnnotation={onTranslateAnnotation}
            onUpdateSelectedText={onUpdateSelectedText}
            onClearGuides={onClearGuides}
            resolveDragPositionPx={resolveDragPositionPx}
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
            onClearGuides={onClearGuides}
            resolveDragPositionPx={resolveDragPositionPx}
            viewport={viewport}
          />
        ),
      )}
    </Layer>
  )
}

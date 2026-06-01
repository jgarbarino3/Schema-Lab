import { Fragment, memo } from 'react'
import type { KonvaEventObject } from 'konva/lib/Node'
import { Layer, Line, Rect } from 'react-konva'
import { AnnotationsLayer } from '../AnnotationsLayer'
import { BeamLayer } from '../BeamLayer'
import { ComponentsLayer } from '../ComponentsLayer'
import { GaussianEnvelopeLayer } from '../GaussianEnvelopeLayer'
import { RulerLayer } from '../RulerLayer'
import { worldToScreen } from '../../domain/geometry'
import {
  getSurfaceMountPlaneOffsetMm,
} from '../../domain/workspace'
import type {
  SelectionState,
} from '../../state/editorStore'
import type {
  ActiveTool,
  BoundsMm,
  BeamTraceResult,
  GaussianTraceResult,
  HighlightSelectionState,
  PendingBreadboardPlacementState,
  PendingPlacementState,
  SceneAnnotation,
  SceneDocument,
  ScreenPointPx,
  RenderMode,
  SimpleIconStyle,
  SnapMode,
  Vector2Mm,
  ViewportState,
} from '../../domain/types'
import type { SimpleGlyphAppearance } from '../ComponentNode'
import {
  getProjectedBoundsLinePoints,
  projectWorldPointToScreen,
} from './tableViewProjection'

export interface LiveSceneBreadboardDragPreviewState {
  breadboardId: string
  candidateAnchorMm: Vector2Mm
}

export interface LiveSceneComponentDragPreviewState {
  componentId: string
  candidateAnchorMm: Vector2Mm
  hostSurfaceId?: string
}

export interface LiveSceneInteractionState {
  activeTool: ActiveTool
  breadboardDragPreview?: LiveSceneBreadboardDragPreviewState
  cursorWorldMm?: Vector2Mm
  dragPreview?: LiveSceneComponentDragPreviewState
  editingTextAnnotationId?: string
  editingTextDraftText?: string
  focusedBreadboardId?: string
  highlightDragBoundsMm?: BoundsMm
  highlightSelection?: HighlightSelectionState
  hoveredBeamSegmentId?: string
  hoveredComponentId?: string
  isSpacePanning: boolean
  lineColor: string
  lineDrawStartMm?: Vector2Mm
  pendingBreadboardPlacement?: PendingBreadboardPlacementState
  pendingPlacement?: PendingPlacementState
  selectedBeamInteractionId?: string
  selectedBeamPathId?: string
  selectedBeamSegmentId?: string
  showBeamDetails: boolean
}

export interface LiveSceneLayersProps {
  annotationGuideLines: Array<{ fromMm: Vector2Mm; toMm: Vector2Mm }>
  aboveBandAnnotations: SceneAnnotation[]
  beamTrace: BeamTraceResult
  gaussianTrace: GaussianTraceResult
  highlightedAnnotationIds: string[]
  highlightedComponentIds: string[]
  highlightedInteractionIds: string[]
  highlightedPathIds: string[]
  interaction: LiveSceneInteractionState
  onAnnotationToolClick: (event?: KonvaEventObject<MouseEvent | TouchEvent>) => void
  onBeginComponentDrag: (componentId: string) => void
  onCommitComponentDrag: (
    componentId: string,
    anchorMm?: { x: number; y: number },
  ) => void
  onClearBeamInspectionSelection: () => void
  onClearAnnotationGuides?: () => void
  onHoverBeamSegment: (segmentId?: string) => void
  onHoverComponent: (componentId?: string) => void
  onLineToolClick: (event?: KonvaEventObject<MouseEvent | TouchEvent>) => void
  onOpenAnnotationContextMenu?: (pointPx: ScreenPointPx) => void
  onOpenComponentContextMenu?: (pointPx: ScreenPointPx) => void
  onSelectAnnotation: (annotationId: string) => void
  onSelectBeamSegment: (
    segmentId: string,
    pathId: string,
    interactionId?: string,
  ) => void
  onSelectComponent: (componentId: string) => void
  onStartTextEditing: (annotationId: string) => void
  onTranslateAnnotation: (annotationId: string, deltaMm: { x: number; y: number }) => void
  onUpdateComponentDrag: (
    componentId: string,
    anchorMm: { x: number; y: number },
  ) => void
  resolveAnnotationDragPositionPx?: (
    annotationId: string,
    positionPx: ScreenPointPx,
  ) => ScreenPointPx
  onUpdateSelectedGeometryOverride: (update: { widthMm?: number; heightMm?: number }) => void
  onUpdateSelectedShapeAnnotation: (update: {
    boundsMm?: { x?: number; y?: number; width?: number; height?: number }
    endMm?: { x: number; y: number }
    startMm?: { x: number; y: number }
  }) => void
  onUpdateSelectedTextAnnotation: (update: { tailMm?: Vector2Mm; widthMm?: number }) => void
  renderMode: RenderMode
  scene: SceneDocument
  selection: SelectionState
  showGaussianEnvelope: boolean
  showLabels: boolean
  showPostHolders: boolean
  simpleGlyphAppearances?: Record<string, SimpleGlyphAppearance>
  simpleIconStyle?: SimpleIconStyle
  sourceGuide?:
    | {
        alignmentAxis?: 'horizontal' | 'vertical'
        sourcePointMm: Vector2Mm
        sourceSurfaceId?: string
        targetPointMm: Vector2Mm
        targetSurfaceId?: string
      }
    | undefined
  snapMode: SnapMode
  useProjectedTableView?: boolean
  viewport: ViewportState
  belowBandAnnotations: SceneAnnotation[]
}

export const LiveSceneLayers = memo(function LiveSceneLayers({
  annotationGuideLines,
  aboveBandAnnotations,
  beamTrace,
  gaussianTrace,
  highlightedAnnotationIds,
  highlightedComponentIds,
  highlightedInteractionIds,
  highlightedPathIds,
  interaction,
  onAnnotationToolClick,
  onBeginComponentDrag,
  onCommitComponentDrag,
  onClearBeamInspectionSelection,
  onClearAnnotationGuides,
  onHoverBeamSegment,
  onHoverComponent,
  onLineToolClick,
  onOpenAnnotationContextMenu,
  onOpenComponentContextMenu,
  onSelectAnnotation,
  onSelectBeamSegment,
  onSelectComponent,
  onStartTextEditing,
  onTranslateAnnotation,
  onUpdateComponentDrag,
  resolveAnnotationDragPositionPx,
  onUpdateSelectedGeometryOverride,
  onUpdateSelectedShapeAnnotation,
  onUpdateSelectedTextAnnotation,
  renderMode,
  scene,
  selection,
  showGaussianEnvelope,
  showLabels,
  showPostHolders,
  simpleGlyphAppearances,
  simpleIconStyle = 'enhanced',
  sourceGuide,
  snapMode,
  useProjectedTableView = false,
  viewport,
  belowBandAnnotations,
}: LiveSceneLayersProps) {
  const isPanMode = interaction.activeTool === 'pan' || interaction.isSpacePanning
  const isHighlightTool =
    interaction.activeTool === 'highlight' && !interaction.isSpacePanning
  const isLineTool = interaction.activeTool === 'line' && !interaction.isSpacePanning
  const isTextTool = interaction.activeTool === 'text' && !interaction.isSpacePanning
  const isShapeTool = interaction.activeTool === 'shape' && !interaction.isSpacePanning
  const isAnnotationPlacementTool = isLineTool || isTextTool || isShapeTool
  const belowBandLineAnnotations = belowBandAnnotations.filter(
    (annotation): annotation is Extract<SceneAnnotation, { kind: 'line' }> =>
      annotation.kind === 'line',
  )
  const aboveBandLineAnnotations = aboveBandAnnotations.filter(
    (annotation): annotation is Extract<SceneAnnotation, { kind: 'line' }> =>
      annotation.kind === 'line',
  )
  const projectScenePoint = (
    pointMm: Vector2Mm,
    options?: {
      elevationMm?: number
      surfaceId?: string
    },
  ) => {
    if (!useProjectedTableView) {
      return worldToScreen(pointMm, viewport)
    }

    return projectWorldPointToScreen(
      pointMm,
      viewport,
      options?.elevationMm ??
        (options?.surfaceId
          ? getSurfaceMountPlaneOffsetMm(scene, options.surfaceId)
          : 0),
    )
  }

  return (
    <>
      {showGaussianEnvelope ? (
        <GaussianEnvelopeLayer
          beamTrace={beamTrace}
          gaussianTrace={gaussianTrace}
          hoveredSegmentId={interaction.hoveredBeamSegmentId}
          scene={scene}
          selectedPathId={interaction.selectedBeamPathId}
          useProjectedTableView={useProjectedTableView}
          viewport={viewport}
        />
      ) : null}

      <BeamLayer
        beamTrace={beamTrace}
        gaussianTrace={gaussianTrace}
        hoveredSegmentId={interaction.hoveredBeamSegmentId}
        highlightedInteractionIds={highlightedInteractionIds}
        highlightedPathIds={highlightedPathIds}
        onHoverSegment={onHoverBeamSegment}
        onSelectSegment={onSelectBeamSegment}
        selectedInteractionId={interaction.selectedBeamInteractionId}
        selectedPathId={interaction.selectedBeamPathId}
        selectedSegmentId={interaction.selectedBeamSegmentId}
        scene={scene}
        showDetails={interaction.showBeamDetails}
        useProjectedTableView={useProjectedTableView}
        viewport={viewport}
      />

      {belowBandLineAnnotations.length > 0 ? (
        <Layer>
          {belowBandLineAnnotations.map((line) => {
              const startPx = projectScenePoint(line.startMm)
              const endPx = projectScenePoint(line.endMm)
              const linePoints = [startPx.x, startPx.y, endPx.x, endPx.y]
              const strokeWidth = Math.max(1.5, line.strokeWidthMm * viewport.zoomPxPerMm)
              const isSelected =
                selection.type === 'annotation' && selection.annotationId === line.id

              return (
                <Fragment key={line.id}>
                  <Line
                    lineCap="round"
                    opacity={0.001}
                    points={linePoints}
                    stroke="#ffffff"
                    strokeWidth={Math.max(14, strokeWidth + 10)}
                    onClick={() => {
                      onClearBeamInspectionSelection()
                      onClearAnnotationGuides?.()
                      onSelectAnnotation(line.id)
                    }}
                    onContextMenu={(event) => {
                      if (!('clientX' in event.evt) || !('clientY' in event.evt)) {
                        return
                      }

                      event.cancelBubble = true
                      event.evt.preventDefault()
                      onClearBeamInspectionSelection()
                      onSelectAnnotation(line.id)
                      onOpenAnnotationContextMenu?.({
                        x: event.evt.clientX,
                        y: event.evt.clientY,
                      })
                    }}
                    onTap={() => {
                      onClearBeamInspectionSelection()
                      onClearAnnotationGuides?.()
                      onSelectAnnotation(line.id)
                    }}
                  />
                  {isSelected ? (
                    <Line
                      key={`${line.id}-selection`}
                      lineCap="round"
                      listening={false}
                      points={linePoints}
                      stroke="#8ecedf"
                      strokeWidth={strokeWidth + 4}
                      opacity={0.24}
                    />
                  ) : null}
                  <Line
                    lineCap="round"
                    listening={false}
                    points={linePoints}
                    shadowBlur={4}
                    shadowColor={line.color}
                    shadowOpacity={0.3}
                    stroke={line.color}
                    strokeWidth={strokeWidth}
                  />
                </Fragment>
              )
            })}
        </Layer>
      ) : null}

      <ComponentsLayer
        breadboardDragPreview={interaction.breadboardDragPreview}
        components={scene.components}
        dragPreview={interaction.dragPreview}
        hoveredComponentId={interaction.hoveredComponentId}
        highlightedComponentIds={highlightedComponentIds}
        isHighlightTool={isHighlightTool}
        isLineTool={isAnnotationPlacementTool}
        isPanMode={isPanMode}
        onBeginComponentDrag={onBeginComponentDrag}
        onCommitComponentDrag={onCommitComponentDrag}
        onHoverComponent={onHoverComponent}
        onOpenComponentContextMenu={(componentId, pointPx) => {
          onClearBeamInspectionSelection()
          onSelectComponent(componentId)
          onOpenComponentContextMenu?.(pointPx)
        }}
        onLineToolClick={onLineToolClick}
        onResizeComponent={(_, update) => onUpdateSelectedGeometryOverride(update)}
        onSelectComponent={onSelectComponent}
        onUpdateComponentDrag={onUpdateComponentDrag}
        pendingPlacement={interaction.pendingPlacement}
        renderMode={renderMode}
        scene={scene}
        showLabels={showLabels}
        showPostHolders={showPostHolders}
        selectedComponentId={
          selection.type === 'component' ? selection.componentId : undefined
        }
        snapMode={snapMode}
        simpleGlyphAppearances={simpleGlyphAppearances}
        simpleIconStyle={simpleIconStyle}
        viewport={viewport}
        useProjectedTableView={useProjectedTableView}
      />

      <AnnotationsLayer
        activeTool={interaction.activeTool}
        annotations={belowBandAnnotations.filter((annotation) => annotation.kind !== 'line')}
        editingTextAnnotationId={interaction.editingTextAnnotationId}
        editingTextDraftText={interaction.editingTextDraftText}
        highlightedAnnotationIds={highlightedAnnotationIds}
        onAnnotationToolClick={onAnnotationToolClick}
        onOpenContextMenu={(annotationId, pointPx) => {
          onClearBeamInspectionSelection()
          onSelectAnnotation(annotationId)
          onOpenAnnotationContextMenu?.(pointPx)
        }}
        onResizeSelectedShape={onUpdateSelectedShapeAnnotation}
        onUpdateSelectedText={onUpdateSelectedTextAnnotation}
        onSelectAnnotation={onSelectAnnotation}
        onStartTextEditing={onStartTextEditing}
        onTranslateAnnotation={onTranslateAnnotation}
        onClearGuides={onClearAnnotationGuides}
        resolveDragPositionPx={resolveAnnotationDragPositionPx}
        selectedAnnotationId={
          selection.type === 'annotation' ? selection.annotationId : undefined
        }
        viewport={viewport}
      />

      {aboveBandLineAnnotations.length > 0 ? (
        <Layer>
          {aboveBandLineAnnotations.map((line) => {
              const startPx = projectScenePoint(line.startMm)
              const endPx = projectScenePoint(line.endMm)
              const linePoints = [startPx.x, startPx.y, endPx.x, endPx.y]
              const strokeWidth = Math.max(1.5, line.strokeWidthMm * viewport.zoomPxPerMm)
              const isSelected =
                selection.type === 'annotation' && selection.annotationId === line.id
              const isHighlighted = highlightedAnnotationIds.includes(line.id)

              return (
                <Fragment key={line.id}>
                  <Line
                    lineCap="round"
                    opacity={0.001}
                    points={linePoints}
                    stroke="#ffffff"
                    strokeWidth={Math.max(14, strokeWidth + 10)}
                    onClick={() => {
                      onClearBeamInspectionSelection()
                      onClearAnnotationGuides?.()
                      onSelectAnnotation(line.id)
                    }}
                    onContextMenu={(event) => {
                      if (!('clientX' in event.evt) || !('clientY' in event.evt)) {
                        return
                      }

                      event.cancelBubble = true
                      event.evt.preventDefault()
                      onClearBeamInspectionSelection()
                      onSelectAnnotation(line.id)
                      onOpenAnnotationContextMenu?.({
                        x: event.evt.clientX,
                        y: event.evt.clientY,
                      })
                    }}
                    onTap={() => {
                      onClearBeamInspectionSelection()
                      onClearAnnotationGuides?.()
                      onSelectAnnotation(line.id)
                    }}
                  />
                  {isSelected || isHighlighted ? (
                    <Line
                      key={`${line.id}-selection`}
                      lineCap="round"
                      listening={false}
                      points={linePoints}
                      stroke={isSelected ? '#8ecedf' : '#f0cb87'}
                      strokeWidth={strokeWidth + 4}
                      opacity={0.24}
                    />
                  ) : null}
                  <Line
                    lineCap="round"
                    listening={false}
                    points={linePoints}
                    shadowBlur={4}
                    shadowColor={line.color}
                    shadowOpacity={0.3}
                    stroke={line.color}
                    strokeWidth={strokeWidth}
                  />
                </Fragment>
              )
            })}
        </Layer>
      ) : null}

      <AnnotationsLayer
        activeTool={interaction.activeTool}
        annotations={aboveBandAnnotations.filter((annotation) => annotation.kind !== 'line')}
        editingTextAnnotationId={interaction.editingTextAnnotationId}
        editingTextDraftText={interaction.editingTextDraftText}
        highlightedAnnotationIds={highlightedAnnotationIds}
        onAnnotationToolClick={onAnnotationToolClick}
        onOpenContextMenu={(annotationId, pointPx) => {
          onClearBeamInspectionSelection()
          onSelectAnnotation(annotationId)
          onOpenAnnotationContextMenu?.(pointPx)
        }}
        onResizeSelectedShape={onUpdateSelectedShapeAnnotation}
        onUpdateSelectedText={onUpdateSelectedTextAnnotation}
        onSelectAnnotation={onSelectAnnotation}
        onStartTextEditing={onStartTextEditing}
        onTranslateAnnotation={onTranslateAnnotation}
        onClearGuides={onClearAnnotationGuides}
        resolveDragPositionPx={resolveAnnotationDragPositionPx}
        selectedAnnotationId={
          selection.type === 'annotation' ? selection.annotationId : undefined
        }
        viewport={viewport}
      />

      <Layer listening={false}>
        {sourceGuide ? (
          <Line
            dash={sourceGuide.alignmentAxis ? [10, 5] : [7, 6]}
            lineCap="round"
            points={[
              projectScenePoint(sourceGuide.sourcePointMm, {
                surfaceId: sourceGuide.sourceSurfaceId,
              }).x,
              projectScenePoint(sourceGuide.sourcePointMm, {
                surfaceId: sourceGuide.sourceSurfaceId,
              }).y,
              projectScenePoint(sourceGuide.targetPointMm, {
                surfaceId: sourceGuide.targetSurfaceId,
              }).x,
              projectScenePoint(sourceGuide.targetPointMm, {
                surfaceId: sourceGuide.targetSurfaceId,
              }).y,
            ]}
            shadowBlur={sourceGuide.alignmentAxis ? 12 : 7}
            shadowColor={sourceGuide.alignmentAxis ? '#7ad2ff' : '#61b8df'}
            shadowOpacity={0.32}
            stroke={sourceGuide.alignmentAxis ? '#8fe3ff' : '#5eb4da'}
            strokeWidth={sourceGuide.alignmentAxis ? 2.6 : 1.8}
          />
        ) : null}

        {annotationGuideLines.map((guide, index) => {
          const startPx = projectScenePoint(guide.fromMm)
          const endPx = projectScenePoint(guide.toMm)

          return (
            <Line
              dash={[9, 5]}
              key={`${guide.fromMm.x}-${guide.fromMm.y}-${guide.toMm.x}-${guide.toMm.y}-${index}`}
              lineCap="round"
              points={[startPx.x, startPx.y, endPx.x, endPx.y]}
              shadowBlur={10}
              shadowColor="#7ad2ff"
              shadowOpacity={0.26}
              stroke="#8fe3ff"
              strokeWidth={1.8}
            />
          )
        })}

        {interaction.lineDrawStartMm && interaction.cursorWorldMm ? (() => {
          const startPx = projectScenePoint(interaction.lineDrawStartMm)
          const endPx = projectScenePoint(interaction.cursorWorldMm)

          return (
            <Line
              dash={[6, 4]}
              lineCap="round"
              points={[startPx.x, startPx.y, endPx.x, endPx.y]}
              shadowBlur={4}
              shadowColor={interaction.lineColor}
              shadowOpacity={0.3}
              stroke={interaction.lineColor}
              strokeWidth={Math.max(1.5, 0.8 * viewport.zoomPxPerMm)}
            />
          )
        })() : null}

        {interaction.highlightSelection ? (() => {
          return useProjectedTableView ? (
            <Line
              closed
              dash={[10, 6]}
              fill="rgba(240, 202, 138, 0.08)"
              points={getProjectedBoundsLinePoints(
                interaction.highlightSelection.boundsMm,
                viewport,
                0,
              )}
              shadowBlur={10}
              shadowColor="#f0cb87"
              shadowOpacity={0.14}
              stroke="#f0cb87"
              strokeWidth={1.5}
            />
          ) : (
            <Rect
              dash={[10, 6]}
              fill="rgba(240, 202, 138, 0.08)"
              height={interaction.highlightSelection.boundsMm.height * viewport.zoomPxPerMm}
              shadowBlur={10}
              shadowColor="#f0cb87"
              shadowOpacity={0.14}
              stroke="#f0cb87"
              strokeWidth={1.5}
              width={interaction.highlightSelection.boundsMm.width * viewport.zoomPxPerMm}
              x={worldToScreen(
                {
                  x: interaction.highlightSelection.boundsMm.x,
                  y: interaction.highlightSelection.boundsMm.y,
                },
                viewport,
              ).x}
              y={worldToScreen(
                {
                  x: interaction.highlightSelection.boundsMm.x,
                  y: interaction.highlightSelection.boundsMm.y,
                },
                viewport,
              ).y}
            />
          )
        })() : null}

        {interaction.highlightDragBoundsMm ? (() => {
          return useProjectedTableView ? (
            <Line
              closed
              dash={[8, 5]}
              fill="rgba(125, 200, 228, 0.08)"
              points={getProjectedBoundsLinePoints(
                interaction.highlightDragBoundsMm,
                viewport,
                0,
              )}
              shadowBlur={10}
              shadowColor="#7dc8e4"
              shadowOpacity={0.16}
              stroke="#9adcf0"
              strokeWidth={1.25}
            />
          ) : (
            <Rect
              dash={[8, 5]}
              fill="rgba(125, 200, 228, 0.08)"
              height={interaction.highlightDragBoundsMm.height * viewport.zoomPxPerMm}
              shadowBlur={10}
              shadowColor="#7dc8e4"
              shadowOpacity={0.16}
              stroke="#9adcf0"
              strokeWidth={1.25}
              width={interaction.highlightDragBoundsMm.width * viewport.zoomPxPerMm}
              x={worldToScreen(
                {
                  x: interaction.highlightDragBoundsMm.x,
                  y: interaction.highlightDragBoundsMm.y,
                },
                viewport,
              ).x}
              y={worldToScreen(
                {
                  x: interaction.highlightDragBoundsMm.x,
                  y: interaction.highlightDragBoundsMm.y,
                },
                viewport,
              ).y}
            />
          )
        })() : null}

        <RulerLayer
          cursorScreenPx={
            interaction.cursorWorldMm
              ? projectScenePoint(interaction.cursorWorldMm)
              : undefined
          }
          renderInLayer={false}
          viewport={viewport}
        />
      </Layer>
    </>
  )
})

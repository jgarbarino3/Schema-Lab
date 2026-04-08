import { useEffect, useMemo, useRef } from 'react'
import type { KonvaEventObject } from 'konva/lib/Node'
import type Konva from 'konva'
import { Layer, Line, Rect, Stage } from 'react-konva'
import { AnnotationsLayer } from './AnnotationsLayer'
import { screenToWorld, worldToScreen } from '../domain/geometry'
import { getSourceGuideSnapshot } from '../domain/placement'
import { SINGLE_BREADBOARD_SURFACE_ID } from '../domain/types'
import type {
  BeamTraceResult,
  GaussianTraceResult,
  SceneAnnotation,
  ScreenPointPx,
} from '../domain/types'
import { useEditorStore } from '../state/editorStore'
import {
  getBreadboardInstances,
  getOpticalTable,
  getWorkspacePrimaryBreadboard,
} from '../domain/workspace'
import { BeamLayer } from './BeamLayer'
import { BreadboardLayer } from './BreadboardLayer'
import { ComponentsLayer } from './ComponentsLayer'
import { GaussianEnvelopeLayer } from './GaussianEnvelopeLayer'
import { RulerLayer } from './RulerLayer'

interface SchemaStageProps {
  beamTrace: BeamTraceResult
  gaussianTrace: GaussianTraceResult
  highlightedComponentIds?: string[]
  highlightedInteractionIds?: string[]
  highlightedPathIds?: string[]
  showLabels?: boolean
  showPostHolders?: boolean
  onStageReady?: (stage: Konva.Stage | null) => void
}

export function SchemaStage({
  beamTrace,
  gaussianTrace,
  highlightedComponentIds = [],
  highlightedInteractionIds = [],
  highlightedPathIds = [],
  showLabels = true,
  showPostHolders = false,
  onStageReady,
}: SchemaStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<Konva.Stage | null>(null)
  const panStateRef = useRef<{
    didMove: boolean
    lastPointPx?: ScreenPointPx
  }>({
    didMove: false,
  })
  const pinchStateRef = useRef<{
    isActive: boolean
    previousDistancePx?: number
    previousMidpointPx?: ScreenPointPx
  }>({
    isActive: false,
  })
  const scene = useEditorStore((state) => state.scene)
  const primaryBreadboard = useMemo(() => getWorkspacePrimaryBreadboard(scene), [scene])
  const opticalTable = useMemo(() => getOpticalTable(scene), [scene])
  const breadboardInstances = useMemo(() => getBreadboardInstances(scene), [scene])
  const selection = useEditorStore((state) => state.selection)
  const snapMode = useEditorStore((state) => state.snapMode)
  const renderMode = useEditorStore((state) => state.renderMode)
  const viewport = useEditorStore((state) => state.viewport)
  const interaction = useEditorStore((state) => state.interaction)
  const setViewportSize = useEditorStore((state) => state.setViewportSize)
  const panViewportByScreenDelta = useEditorStore(
    (state) => state.panViewportByScreenDelta,
  )
  const applyPinchViewport = useEditorStore((state) => state.applyPinchViewport)
  const zoomAtScreenPoint = useEditorStore((state) => state.zoomAtScreenPoint)
  const selectBreadboard = useEditorStore((state) => state.selectBreadboard)
  const selectOpticalTable = useEditorStore((state) => state.selectOpticalTable)
  const selectComponent = useEditorStore((state) => state.selectComponent)
  const selectAnnotation = useEditorStore((state) => state.selectAnnotation)
  const beginComponentDrag = useEditorStore((state) => state.beginComponentDrag)
  const addShapeAnnotationAt = useEditorStore((state) => state.addShapeAnnotationAt)
  const addTextAnnotationAt = useEditorStore((state) => state.addTextAnnotationAt)
  const updatePendingPlacementAnchor = useEditorStore(
    (state) => state.updatePendingPlacementAnchor,
  )
  const updatePendingBreadboardAnchor = useEditorStore(
    (state) => state.updatePendingBreadboardAnchor,
  )
  const commitPendingPlacement = useEditorStore(
    (state) => state.commitPendingPlacement,
  )
  const commitPendingBreadboardPlacement = useEditorStore(
    (state) => state.commitPendingBreadboardPlacement,
  )
  const updateComponentDrag = useEditorStore((state) => state.updateComponentDrag)
  const commitComponentDrag = useEditorStore((state) => state.commitComponentDrag)
  const updateSelectedGeometryOverride = useEditorStore(
    (state) => state.updateSelectedGeometryOverride,
  )
  const updateSelectedShapeAnnotation = useEditorStore(
    (state) => state.updateSelectedShapeAnnotation,
  )
  const updateSelectedTextAnnotation = useEditorStore(
    (state) => state.updateSelectedTextAnnotation,
  )
  const translateSelectedAnnotation = useEditorStore(
    (state) => state.translateSelectedAnnotation,
  )
  const startTextAnnotationEditing = useEditorStore(
    (state) => state.startTextAnnotationEditing,
  )
  const setHoveredComponentId = useEditorStore(
    (state) => state.setHoveredComponentId,
  )
  const setHoveredBeamSegmentId = useEditorStore(
    (state) => state.setHoveredBeamSegmentId,
  )
  const selectBeamSegment = useEditorStore((state) => state.selectBeamSegment)
  const clearBeamInspectionSelection = useEditorStore(
    (state) => state.clearBeamInspectionSelection,
  )
  const setCursorWorldMm = useEditorStore((state) => state.setCursorWorldMm)
  const setPointerPanning = useEditorStore((state) => state.setPointerPanning)
  const startLineDrawAt = useEditorStore((state) => state.startLineDrawAt)
  const commitLineDraw = useEditorStore((state) => state.commitLineDraw)
  const beginBreadboardDrag = useEditorStore((state) => state.beginBreadboardDrag)
  const updateBreadboardDrag = useEditorStore((state) => state.updateBreadboardDrag)
  const commitBreadboardDrag = useEditorStore((state) => state.commitBreadboardDrag)

  const getStagePointerWorldMm = (
    event?: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    const pointerPosition =
      event?.target.getStage()?.getPointerPosition() ??
      stageRef.current?.getPointerPosition()

    if (!pointerPosition) {
      return undefined
    }

    return screenToWorld(pointerPosition, viewport)
  }

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    const container = containerRef.current
    const resizeObserver = new ResizeObserver((entries) => {
      const nextEntry = entries[0]

      if (!nextEntry) {
        return
      }

      const { width, height } = nextEntry.contentRect

      setViewportSize({
        width: Math.floor(width),
        height: Math.floor(height),
      })
    })

    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [setViewportSize])

  const isPanMode = interaction.activeTool === 'pan' || interaction.isSpacePanning
  const isLineTool = interaction.activeTool === 'line' && !interaction.isSpacePanning
  const isTextTool = interaction.activeTool === 'text' && !interaction.isSpacePanning
  const isShapeTool = interaction.activeTool === 'shape' && !interaction.isSpacePanning
  const isAnnotationPlacementTool = isLineTool || isTextTool || isShapeTool
  const sourceGuide = useMemo(() => {
    if (interaction.pendingPlacement?.draft.config.source) {
      return getSourceGuideSnapshot({
        candidateAnchorMm: interaction.pendingPlacement.candidateAnchorMm,
        scene,
        source: interaction.pendingPlacement.draft,
        targetId: interaction.pendingPlacement.draft.config.source.firstTargetComponentId,
      })
    }

    if (interaction.dragPreview) {
      const draggingSource = scene.components.find(
        (component) =>
          component.id === interaction.dragPreview?.componentId &&
          component.config.source,
      )

      if (draggingSource?.config.source) {
        return getSourceGuideSnapshot({
          candidateAnchorMm: interaction.dragPreview.candidateAnchorMm,
          scene,
          source: draggingSource,
          targetId: draggingSource.config.source.firstTargetComponentId,
        })
      }
    }

    if (selection.type !== 'component') {
      return undefined
    }

    const selectedSource = scene.components.find(
      (component) =>
        component.id === selection.componentId && component.config.source,
    )

    if (!selectedSource?.config.source?.firstTargetComponentId) {
      return undefined
    }

    return getSourceGuideSnapshot({
      scene,
      source: selectedSource,
      targetId: selectedSource.config.source.firstTargetComponentId,
    })
  }, [
    interaction.dragPreview,
    interaction.pendingPlacement,
    scene,
    selection,
  ])
  const stageCursor = useMemo(() => {
    if (interaction.isPointerPanning) {
      return 'grabbing'
    }

    if (isPanMode) {
      return 'grab'
    }

    return 'crosshair'
  }, [interaction.isPointerPanning, isPanMode])

  const preventNativeTouchDefault = (event: TouchEvent) => {
    if (event.cancelable) {
      event.preventDefault()
    }
  }

  const endPinchGesture = () => {
    pinchStateRef.current = {
      isActive: false,
      previousDistancePx: undefined,
      previousMidpointPx: undefined,
    }
  }

  const getTouchPointPx = (touch: Touch, element: HTMLDivElement): ScreenPointPx => {
    const rect = element.getBoundingClientRect()

    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    }
  }

  const getPinchSnapshot = (
    targetTouches: TouchList,
    element: HTMLDivElement,
  ) => {
    if (targetTouches.length < 2) {
      return undefined
    }

    const firstPointPx = getTouchPointPx(targetTouches[0]!, element)
    const secondPointPx = getTouchPointPx(targetTouches[1]!, element)
    const distancePx = Math.hypot(
      secondPointPx.x - firstPointPx.x,
      secondPointPx.y - firstPointPx.y,
    )

    if (!Number.isFinite(distancePx) || distancePx <= 0) {
      return undefined
    }

    return {
      distancePx,
      midpointPx: {
        x: (firstPointPx.x + secondPointPx.x) / 2,
        y: (firstPointPx.y + secondPointPx.y) / 2,
      },
    }
  }

  const handleWheel = (event: KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault()

    const pointerPosition = event.target.getStage()?.getPointerPosition()

    if (!pointerPosition) {
      return
    }

    if (event.evt.ctrlKey || event.evt.metaKey) {
      const zoomFactor = Math.exp(-event.evt.deltaY * 0.0025)
      zoomAtScreenPoint(pointerPosition, zoomFactor)
      return
    }

    panViewportByScreenDelta({
      x: event.evt.deltaX,
      y: event.evt.deltaY,
    })
  }

  const updateCursorFromStage = (
    event: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    const pointerPosition = event.target.getStage()?.getPointerPosition()

    if (!pointerPosition) {
      return
    }

    setCursorWorldMm(screenToWorld(pointerPosition, viewport))
  }

  const isBackgroundPanTarget = (
    event: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    let currentNode: Konva.Node | null = event.target

    while (currentNode) {
      if (
        ('hasName' in currentNode && currentNode.hasName('stage-background-hit')) ||
        ('hasName' in currentNode && currentNode.hasName('breadboard-hit'))
      ) {
        return true
      }

      currentNode = currentNode.getParent()
    }

    return event.target === event.target.getStage()
  }

  const startPointerPan = (
    event: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    const pointerPosition = event.target.getStage()?.getPointerPosition()

    if (!pointerPosition) {
      return
    }

    panStateRef.current = {
      didMove: false,
      lastPointPx: pointerPosition,
    }
    setPointerPanning(true)
    setHoveredComponentId(undefined)
  }

  const stopPointerPan = () => {
    panStateRef.current = {
      didMove: panStateRef.current.didMove,
      lastPointPx: undefined,
    }
    setPointerPanning(false)
  }

  useEffect(() => {
    const contentElement = containerRef.current?.querySelector('.konvajs-content')
    const listenerOptions = {
      capture: true,
      passive: false,
    } as const

    if (!(contentElement instanceof HTMLDivElement)) {
      return
    }

    const beginPinchGesture = (pinchSnapshot: {
      distancePx: number
      midpointPx: ScreenPointPx
    }) => {
      if (interaction.isPointerPanning) {
        stopPointerPan()
      }

      setHoveredComponentId(undefined)
      setHoveredBeamSegmentId(undefined)
      pinchStateRef.current = {
        isActive: true,
        previousDistancePx: pinchSnapshot.distancePx,
        previousMidpointPx: pinchSnapshot.midpointPx,
      }
    }

    const handleNativeTouchStart = (event: TouchEvent) => {
      const pinchSnapshot = getPinchSnapshot(event.touches, contentElement)

      if (pinchSnapshot) {
        preventNativeTouchDefault(event)
        beginPinchGesture(pinchSnapshot)
      }
    }

    const handleNativeTouchMove = (event: TouchEvent) => {
      const pinchSnapshot = getPinchSnapshot(event.touches, contentElement)
      if (!pinchSnapshot) {
        return
      }

      preventNativeTouchDefault(event)

      if (!pinchStateRef.current.isActive) {
        beginPinchGesture(pinchSnapshot)
        return
      }

      const previousDistancePx = pinchStateRef.current.previousDistancePx
      const previousMidpointPx = pinchStateRef.current.previousMidpointPx

      if (!previousDistancePx || !previousMidpointPx) {
        beginPinchGesture(pinchSnapshot)
        return
      }

      applyPinchViewport(
        previousMidpointPx,
        pinchSnapshot.midpointPx,
        pinchSnapshot.distancePx / previousDistancePx,
      )
      pinchStateRef.current = {
        isActive: true,
        previousDistancePx: pinchSnapshot.distancePx,
        previousMidpointPx: pinchSnapshot.midpointPx,
      }
    }

    const handleNativeTouchEnd = (event: TouchEvent) => {
      if (pinchStateRef.current.isActive && event.touches.length >= 2) {
        const pinchSnapshot = getPinchSnapshot(event.touches, contentElement)

        if (pinchSnapshot) {
          pinchStateRef.current = {
            isActive: true,
            previousDistancePx: pinchSnapshot.distancePx,
            previousMidpointPx: pinchSnapshot.midpointPx,
          }
          return
        }
      }

      endPinchGesture()
    }

    contentElement.addEventListener('touchstart', handleNativeTouchStart, listenerOptions)
    contentElement.addEventListener('touchmove', handleNativeTouchMove, listenerOptions)
    contentElement.addEventListener('touchend', handleNativeTouchEnd, listenerOptions)
    contentElement.addEventListener('touchcancel', handleNativeTouchEnd, listenerOptions)

    return () => {
      endPinchGesture()
      contentElement.removeEventListener(
        'touchstart',
        handleNativeTouchStart,
        listenerOptions,
      )
      contentElement.removeEventListener(
        'touchmove',
        handleNativeTouchMove,
        listenerOptions,
      )
      contentElement.removeEventListener(
        'touchend',
        handleNativeTouchEnd,
        listenerOptions,
      )
      contentElement.removeEventListener(
        'touchcancel',
        handleNativeTouchEnd,
        listenerOptions,
      )
    }
  }, [
    applyPinchViewport,
    interaction.isPointerPanning,
    setHoveredBeamSegmentId,
    setHoveredComponentId,
    setPointerPanning,
    viewport.canvasSizePx.height,
    viewport.canvasSizePx.width,
  ])

  const handleStagePointerDown = (
    event: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    if (
      event.evt instanceof TouchEvent &&
      (pinchStateRef.current.isActive || event.evt.touches.length !== 1)
    ) {
      return
    }

    updateCursorFromStage(event)

    if (
      event.evt instanceof TouchEvent &&
      !isPanMode &&
      !isBackgroundPanTarget(event)
    ) {
      return
    }

    if (!isPanMode && event.evt instanceof MouseEvent && event.evt.button !== 1) {
      return
    }

    event.evt.preventDefault()
    startPointerPan(event)
  }

  const handleStagePointerMove = (
    event: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    if (
      event.evt instanceof TouchEvent &&
      (pinchStateRef.current.isActive || event.evt.touches.length !== 1)
    ) {
      return
    }

    updateCursorFromStage(event)

    if (
      !interaction.isPointerPanning &&
      (interaction.pendingPlacement || interaction.pendingBreadboardPlacement) &&
      !isPanMode
    ) {
      const pointerPosition = event.target.getStage()?.getPointerPosition()

      if (pointerPosition) {
        const pointerWorldMm = screenToWorld(pointerPosition, viewport)

        if (interaction.pendingBreadboardPlacement) {
          updatePendingBreadboardAnchor(pointerWorldMm)
        } else {
          updatePendingPlacementAnchor(pointerWorldMm)
        }
      }
    }

    if (!interaction.isPointerPanning) {
      return
    }

    const pointerPosition = event.target.getStage()?.getPointerPosition()
    const lastPointPx = panStateRef.current.lastPointPx

    if (!pointerPosition || !lastPointPx) {
      return
    }

    const deltaPx = {
      x: pointerPosition.x - lastPointPx.x,
      y: pointerPosition.y - lastPointPx.y,
    }

    if (deltaPx.x === 0 && deltaPx.y === 0) {
      return
    }

    panStateRef.current = {
      didMove: true,
      lastPointPx: pointerPosition,
    }
    panViewportByScreenDelta({
      x: -deltaPx.x,
      y: -deltaPx.y,
    })
  }

  const handleStagePointerUp = (
    event?: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    if (event) {
      updateCursorFromStage(event)
    }

    if (!interaction.isPointerPanning) {
      return
    }

    stopPointerPan()
  }

  const handleAnnotationToolClick = (
    event?: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    const pointerMm = getStagePointerWorldMm(event)

    if (!pointerMm) {
      return
    }

    if (isLineTool) {
      if (interaction.lineDrawStartMm) {
        commitLineDraw(pointerMm)
      } else {
        startLineDrawAt(pointerMm)
      }
      return
    }

    if (isTextTool) {
      addTextAnnotationAt(pointerMm)
      return
    }

    if (isShapeTool) {
      addShapeAnnotationAt(pointerMm)
    }
  }

  const handleBackgroundSelect = (
    event?: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    if (event) {
      updateCursorFromStage(event)
    }

    if (isPanMode || panStateRef.current.didMove) {
      panStateRef.current.didMove = false
      return
    }

    if (isAnnotationPlacementTool) {
      handleAnnotationToolClick(event)
      return
    }

    if (interaction.pendingBreadboardPlacement) {
      clearBeamInspectionSelection()
      commitPendingBreadboardPlacement(getStagePointerWorldMm())
      return
    }

    if (interaction.pendingPlacement) {
      clearBeamInspectionSelection()
      commitPendingPlacement(getStagePointerWorldMm())
      return
    }

    clearBeamInspectionSelection()
    if (scene.workspace.kind === 'optical-table') {
      selectOpticalTable()
      return
    }

    selectBreadboard(SINGLE_BREADBOARD_SURFACE_ID)
  }

  const handleOpticalTableSelect = (
    event?: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    if (isPanMode || panStateRef.current.didMove) {
      panStateRef.current.didMove = false
      return
    }

    if (isAnnotationPlacementTool) {
      handleAnnotationToolClick(event)
      return
    }

    if (interaction.pendingBreadboardPlacement) {
      clearBeamInspectionSelection()
      commitPendingBreadboardPlacement(getStagePointerWorldMm())
      return
    }

    if (interaction.pendingPlacement) {
      clearBeamInspectionSelection()
      commitPendingPlacement(getStagePointerWorldMm())
      return
    }

    clearBeamInspectionSelection()
    selectOpticalTable()
  }

  const handleBreadboardSelect = (
    surfaceId: string,
    event?: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    if (isPanMode || panStateRef.current.didMove) {
      panStateRef.current.didMove = false
      return
    }

    if (isAnnotationPlacementTool) {
      handleAnnotationToolClick(event)
      return
    }

    if (interaction.pendingPlacement) {
      clearBeamInspectionSelection()
      commitPendingPlacement(getStagePointerWorldMm())
      return
    }

    clearBeamInspectionSelection()
    selectBreadboard(surfaceId)
  }

  const opticalTableBoard =
    opticalTable
      ? {
          label: opticalTable.label,
          widthMm: opticalTable.widthMm,
          heightMm: opticalTable.heightMm,
          holeSpacingMm: opticalTable.holeSpacingMm,
          edgeMarginMm: opticalTable.edgeMarginMm,
          thicknessMm: opticalTable.thicknessMm,
          finish: 'clear-anodized' as const,
          holeDensity: opticalTable.holeDensity,
          counterborePattern: opticalTable.counterborePattern,
        }
      : undefined

  return (
    <div className="schema-stage" ref={containerRef} style={{ cursor: stageCursor }}>
      {viewport.canvasSizePx.width > 0 && viewport.canvasSizePx.height > 0 ? (
        <Stage
          ref={(stage) => {
            stageRef.current = stage
            onStageReady?.(stage)
          }}
          height={viewport.canvasSizePx.height}
          onContextMenu={(event) => {
            event.evt.preventDefault()
          }}
          onMouseDown={handleStagePointerDown}
          onMouseLeave={() => {
            stopPointerPan()
            setCursorWorldMm(undefined)
            setHoveredComponentId(undefined)
            setHoveredBeamSegmentId(undefined)
          }}
          onMouseMove={handleStagePointerMove}
          onMouseUp={handleStagePointerUp}
          onTouchEnd={handleStagePointerUp}
          onTouchMove={handleStagePointerMove}
          onTouchStart={handleStagePointerDown}
          onWheel={handleWheel}
          width={viewport.canvasSizePx.width}
        >
          <Layer>
            <Rect
              fillRadialGradientStartPoint={{ x: viewport.canvasSizePx.width / 2, y: viewport.canvasSizePx.height / 2 }}
              fillRadialGradientStartRadius={0}
              fillRadialGradientEndPoint={{ x: viewport.canvasSizePx.width / 2, y: viewport.canvasSizePx.height / 2 }}
              fillRadialGradientEndRadius={Math.max(viewport.canvasSizePx.width, viewport.canvasSizePx.height)}
              fillRadialGradientColorStops={[0, '#111920', 1, '#0b1014']}
              height={viewport.canvasSizePx.height}
              name="stage-background-hit"
              onClick={(event) => handleBackgroundSelect(event)}
              onTap={(event) => handleBackgroundSelect(event)}
              width={viewport.canvasSizePx.width}
              x={0}
              y={0}
            />

            {opticalTableBoard ? (
              <BreadboardLayer
                anchorMm={{ x: 0, y: 0 }}
                breadboard={opticalTableBoard}
                isFocused={false}
                isSelected={selection.type === 'optical-table'}
                onSelect={(event) => handleOpticalTableSelect(event)}
                palette={{
                  boardFill: '#a8b0b6',
                  boardStroke: '#d4dae0',
                  holeFill: '#6f777f',
                  labelColor: '#16202a',
                }}
                renderInLayer={false}
                showLabels={showLabels}
                showSourceLanes={false}
                viewport={viewport}
              />
            ) : (
              <BreadboardLayer
                anchorMm={{ x: 0, y: 0 }}
                breadboard={primaryBreadboard}
                isFocused
                isSelected={
                  selection.type === 'breadboard' &&
                  selection.surfaceId === SINGLE_BREADBOARD_SURFACE_ID
                }
                onSelect={(event) => {
                  handleBackgroundSelect(event)
                }}
                renderInLayer={false}
                showLabels={showLabels}
                viewport={viewport}
              />
            )}

            {breadboardInstances.map((breadboard) => (
              <BreadboardLayer
                anchorMm={
                  interaction.breadboardDragPreview?.breadboardId === breadboard.id
                    ? interaction.breadboardDragPreview.candidateAnchorMm
                    : breadboard.anchorMm
                }
                breadboard={{
                  ...breadboard.model,
                  label: breadboard.label,
                }}
                draggable={!isPanMode && !isAnnotationPlacementTool}
                isFocused={interaction.focusedBreadboardId === breadboard.id}
                isSelected={
                  selection.type === 'breadboard' &&
                  selection.surfaceId === breadboard.id
                }
                key={breadboard.id}
                onDragEnd={(screenPointPx) =>
                  commitBreadboardDrag(breadboard.id, screenToWorld(screenPointPx, viewport))
                }
                onDragMove={(screenPointPx) =>
                  updateBreadboardDrag(breadboard.id, screenToWorld(screenPointPx, viewport))
                }
                onDragStart={() => beginBreadboardDrag(breadboard.id)}
                onSelect={(event) => handleBreadboardSelect(breadboard.id, event)}
                renderInLayer={false}
                rotationQuarterTurns={breadboard.rotationQuarterTurns}
                showLabels={showLabels}
                viewport={viewport}
              />
            ))}

            {interaction.pendingBreadboardPlacement ? (
              <BreadboardLayer
                anchorMm={interaction.pendingBreadboardPlacement.candidateAnchorMm}
                breadboard={interaction.pendingBreadboardPlacement.model}
                isSelected
                onSelect={() => undefined}
                opacity={0.72}
                palette={{
                  boardFill: '#25313a',
                  boardStroke: '#8fd4ef',
                  holeFill: '#111820',
                  labelColor: '#d7edf6',
                }}
                renderInLayer={false}
                rotationQuarterTurns={
                  interaction.pendingBreadboardPlacement.rotationQuarterTurns
                }
                showLabels={showLabels}
                showSourceLanes={false}
                viewport={viewport}
              />
            ) : null}
          </Layer>

          {interaction.showGaussianEnvelope ? (
            <GaussianEnvelopeLayer
              beamTrace={beamTrace}
              gaussianTrace={gaussianTrace}
              hoveredSegmentId={interaction.hoveredBeamSegmentId}
              selectedPathId={interaction.selectedBeamPathId}
              viewport={viewport}
            />
          ) : null}

          <BeamLayer
            beamTrace={beamTrace}
            gaussianTrace={gaussianTrace}
            hoveredSegmentId={interaction.hoveredBeamSegmentId}
            highlightedInteractionIds={highlightedInteractionIds}
            highlightedPathIds={highlightedPathIds}
            onHoverSegment={setHoveredBeamSegmentId}
            onSelectSegment={selectBeamSegment}
            selectedInteractionId={interaction.selectedBeamInteractionId}
            selectedPathId={interaction.selectedBeamPathId}
            selectedSegmentId={interaction.selectedBeamSegmentId}
            showDetails={interaction.showBeamDetails}
            viewport={viewport}
          />

          {scene.annotations.some((annotation) => annotation.kind === 'line') ||
          interaction.lineDrawStartMm ? (
            <Layer>
              {scene.annotations
                .filter((annotation): annotation is Extract<SceneAnnotation, { kind: 'line' }> => annotation.kind === 'line')
                .map((line) => {
                const startPx = worldToScreen(line.startMm, viewport)
                const endPx = worldToScreen(line.endMm, viewport)

                return (
                  <Line
                    key={line.id}
                    lineCap="round"
                    listening={false}
                    points={[startPx.x, startPx.y, endPx.x, endPx.y]}
                    shadowBlur={4}
                    shadowColor={line.color}
                    shadowOpacity={0.3}
                    stroke={line.color}
                    strokeWidth={Math.max(1.5, line.strokeWidthMm * viewport.zoomPxPerMm)}
                  />
                )
              })}
              {interaction.lineDrawStartMm && interaction.cursorWorldMm ? (() => {
                const startPx = worldToScreen(interaction.lineDrawStartMm, viewport)
                const endPx = worldToScreen(interaction.cursorWorldMm, viewport)

                return (
                  <Line
                    dash={[6, 4]}
                    lineCap="round"
                    listening={false}
                    points={[startPx.x, startPx.y, endPx.x, endPx.y]}
                    shadowBlur={4}
                    shadowColor={interaction.lineColor}
                    shadowOpacity={0.3}
                    stroke={interaction.lineColor}
                    strokeWidth={Math.max(1.5, 0.8 * viewport.zoomPxPerMm)}
                  />
                )
              })() : null}
            </Layer>
          ) : null}

          {sourceGuide ? (
            <Layer listening={false}>
              <Line
                dash={sourceGuide.alignmentAxis ? [10, 5] : [7, 6]}
                lineCap="round"
                points={[
                  worldToScreen(sourceGuide.sourcePointMm, viewport).x,
                  worldToScreen(sourceGuide.sourcePointMm, viewport).y,
                  worldToScreen(sourceGuide.targetPointMm, viewport).x,
                  worldToScreen(sourceGuide.targetPointMm, viewport).y,
                ]}
                shadowBlur={sourceGuide.alignmentAxis ? 12 : 7}
                shadowColor={sourceGuide.alignmentAxis ? '#7ad2ff' : '#61b8df'}
                shadowOpacity={0.32}
                stroke={sourceGuide.alignmentAxis ? '#8fe3ff' : '#5eb4da'}
                strokeWidth={sourceGuide.alignmentAxis ? 2.6 : 1.8}
              />
            </Layer>
          ) : null}

          <ComponentsLayer
            breadboardDragPreview={interaction.breadboardDragPreview}
            components={scene.components}
            dragPreview={interaction.dragPreview}
            hoveredComponentId={interaction.hoveredComponentId}
            highlightedComponentIds={highlightedComponentIds}
            isLineTool={isAnnotationPlacementTool}
            isPanMode={isPanMode}
            onBeginComponentDrag={beginComponentDrag}
            onCommitComponentDrag={commitComponentDrag}
            onHoverComponent={setHoveredComponentId}
            onLineToolClick={handleAnnotationToolClick}
            onResizeComponent={(_, update) => updateSelectedGeometryOverride(update)}
            onSelectComponent={selectComponent}
            onUpdateComponentDrag={updateComponentDrag}
            pendingPlacement={interaction.pendingPlacement}
            renderMode={renderMode}
            scene={scene}
            showLabels={showLabels}
            showPostHolders={showPostHolders}
            selectedComponentId={
              selection.type === 'component' ? selection.componentId : undefined
            }
            snapMode={snapMode}
            viewport={viewport}
          />

          <AnnotationsLayer
            activeTool={interaction.activeTool}
            annotations={scene.annotations}
            editingTextAnnotationId={interaction.editingTextAnnotationId}
            onAnnotationToolClick={handleAnnotationToolClick}
            onResizeSelectedShape={updateSelectedShapeAnnotation}
            onResizeSelectedText={(widthMm) =>
              updateSelectedTextAnnotation({ widthMm })
            }
            onSelectAnnotation={selectAnnotation}
            onStartTextEditing={startTextAnnotationEditing}
            onTranslateAnnotation={(annotationId, deltaMm) => {
              const selectedAnnotationId =
                selection.type === 'annotation' ? selection.annotationId : undefined

              if (selectedAnnotationId !== annotationId) {
                selectAnnotation(annotationId)
              }
              translateSelectedAnnotation(deltaMm)
            }}
            selectedAnnotationId={
              selection.type === 'annotation' ? selection.annotationId : undefined
            }
            viewport={viewport}
          />

          <RulerLayer 
            cursorScreenPx={
              interaction.cursorWorldMm
                ? worldToScreen(interaction.cursorWorldMm, viewport)
                : undefined
            }
            viewport={viewport} 
          />
        </Stage>
      ) : null}
    </div>
  )
}

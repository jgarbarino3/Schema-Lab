import { useEffect, useMemo, useRef } from 'react'
import type { KonvaEventObject } from 'konva/lib/Node'
import type Konva from 'konva'
import { Layer, Rect, Stage } from 'react-konva'
import { screenToWorld } from '../domain/geometry'
import type { BeamTraceResult, GaussianTraceResult, ScreenPointPx } from '../domain/types'
import { useEditorStore } from '../state/editorStore'
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
}

export function SchemaStage({
  beamTrace,
  gaussianTrace,
  highlightedComponentIds = [],
  highlightedInteractionIds = [],
  highlightedPathIds = [],
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
  const selection = useEditorStore((state) => state.selection)
  const snapMode = useEditorStore((state) => state.snapMode)
  const viewport = useEditorStore((state) => state.viewport)
  const interaction = useEditorStore((state) => state.interaction)
  const setViewportSize = useEditorStore((state) => state.setViewportSize)
  const panViewportByScreenDelta = useEditorStore(
    (state) => state.panViewportByScreenDelta,
  )
  const applyPinchViewport = useEditorStore((state) => state.applyPinchViewport)
  const zoomAtScreenPoint = useEditorStore((state) => state.zoomAtScreenPoint)
  const selectBreadboard = useEditorStore((state) => state.selectBreadboard)
  const selectComponent = useEditorStore((state) => state.selectComponent)
  const beginComponentDrag = useEditorStore((state) => state.beginComponentDrag)
  const updatePendingPlacementAnchor = useEditorStore(
    (state) => state.updatePendingPlacementAnchor,
  )
  const commitPendingPlacement = useEditorStore(
    (state) => state.commitPendingPlacement,
  )
  const updateComponentDrag = useEditorStore((state) => state.updateComponentDrag)
  const commitComponentDrag = useEditorStore((state) => state.commitComponentDrag)
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

  const getStagePointerWorldMm = () => {
    const pointerPosition = stageRef.current?.getPointerPosition()

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
  const stageCursor = useMemo(() => {
    if (interaction.isPointerPanning) {
      return 'grabbing'
    }

    return isPanMode ? 'grab' : 'crosshair'
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
      preventNativeTouchDefault(event)

      const pinchSnapshot = getPinchSnapshot(event.touches, contentElement)

      if (pinchSnapshot) {
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

    if (!interaction.isPointerPanning && interaction.pendingPlacement && !isPanMode) {
      const pointerPosition = event.target.getStage()?.getPointerPosition()

      if (pointerPosition) {
        updatePendingPlacementAnchor(screenToWorld(pointerPosition, viewport))
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

    if (interaction.pendingPlacement) {
      clearBeamInspectionSelection()
      commitPendingPlacement(getStagePointerWorldMm())
      return
    }

    clearBeamInspectionSelection()
    selectBreadboard()
  }

  return (
    <div className="schema-stage" ref={containerRef} style={{ cursor: stageCursor }}>
      {viewport.canvasSizePx.width > 0 && viewport.canvasSizePx.height > 0 ? (
        <Stage
          ref={(stage) => {
            stageRef.current = stage
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
              fill="#0b1014"
              height={viewport.canvasSizePx.height}
              onClick={(event) => handleBackgroundSelect(event)}
              onTap={(event) => handleBackgroundSelect(event)}
              width={viewport.canvasSizePx.width}
              x={0}
              y={0}
            />
          </Layer>

          <BreadboardLayer
            breadboard={scene.breadboard}
            isSelected={selection.type === 'breadboard'}
            onSelect={handleBackgroundSelect}
            viewport={viewport}
          />

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

          <ComponentsLayer
            breadboard={scene.breadboard}
            components={scene.components}
            dragPreview={interaction.dragPreview}
            hoveredComponentId={interaction.hoveredComponentId}
            highlightedComponentIds={highlightedComponentIds}
            isPanMode={isPanMode}
            onBeginComponentDrag={beginComponentDrag}
            onCommitComponentDrag={commitComponentDrag}
            onHoverComponent={setHoveredComponentId}
            onSelectComponent={selectComponent}
            onUpdateComponentDrag={updateComponentDrag}
            pendingPlacement={interaction.pendingPlacement}
            selectedComponentId={
              selection.type === 'component' ? selection.componentId : undefined
            }
            snapMode={snapMode}
            viewport={viewport}
          />

          <RulerLayer viewport={viewport} />
        </Stage>
      ) : null}
    </div>
  )
}

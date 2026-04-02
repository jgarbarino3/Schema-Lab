import { useEffect, useMemo, useRef } from 'react'
import type { KonvaEventObject } from 'konva/lib/Node'
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
}

export function SchemaStage({ beamTrace, gaussianTrace }: SchemaStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const panStateRef = useRef<{
    didMove: boolean
    lastPointPx?: ScreenPointPx
  }>({
    didMove: false,
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
  const zoomAtScreenPoint = useEditorStore((state) => state.zoomAtScreenPoint)
  const selectBreadboard = useEditorStore((state) => state.selectBreadboard)
  const selectComponent = useEditorStore((state) => state.selectComponent)
  const beginComponentDrag = useEditorStore((state) => state.beginComponentDrag)
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

  const handleStagePointerDown = (
    event: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
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
    updateCursorFromStage(event)

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

  const handleBackgroundSelect = () => {
    if (isPanMode || panStateRef.current.didMove) {
      panStateRef.current.didMove = false
      return
    }

    clearBeamInspectionSelection()
    selectBreadboard()
  }

  return (
    <div className="schema-stage" ref={containerRef} style={{ cursor: stageCursor }}>
      {viewport.canvasSizePx.width > 0 && viewport.canvasSizePx.height > 0 ? (
        <Stage
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
              onClick={handleBackgroundSelect}
              onTap={handleBackgroundSelect}
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
            hoveredSegmentId={interaction.hoveredBeamSegmentId}
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
            isPanMode={isPanMode}
            onBeginComponentDrag={beginComponentDrag}
            onCommitComponentDrag={commitComponentDrag}
            onHoverComponent={setHoveredComponentId}
            onSelectComponent={selectComponent}
            onUpdateComponentDrag={updateComponentDrag}
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

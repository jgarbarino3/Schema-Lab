import { useEffect, useRef } from 'react'
import type { KonvaEventObject } from 'konva/lib/Node'
import { Layer, Rect, Stage } from 'react-konva'
import { useEditorStore } from '../state/editorStore'
import { BreadboardLayer } from './BreadboardLayer'
import { ComponentsLayer } from './ComponentsLayer'

export function SchemaStage() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const scene = useEditorStore((state) => state.scene)
  const selection = useEditorStore((state) => state.selection)
  const viewport = useEditorStore((state) => state.viewport)
  const setViewportSize = useEditorStore((state) => state.setViewportSize)
  const panViewportByScreenDelta = useEditorStore(
    (state) => state.panViewportByScreenDelta,
  )
  const zoomAtScreenPoint = useEditorStore((state) => state.zoomAtScreenPoint)
  const selectBreadboard = useEditorStore((state) => state.selectBreadboard)
  const selectComponent = useEditorStore((state) => state.selectComponent)
  const moveComponent = useEditorStore((state) => state.moveComponent)

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

  return (
    <div className="schema-stage" ref={containerRef}>
      {viewport.canvasSizePx.width > 0 && viewport.canvasSizePx.height > 0 ? (
        <Stage
          height={viewport.canvasSizePx.height}
          onContextMenu={(event) => {
            event.evt.preventDefault()
          }}
          onWheel={handleWheel}
          width={viewport.canvasSizePx.width}
        >
          <Layer>
            <Rect
              fill="#0b1014"
              height={viewport.canvasSizePx.height}
              onClick={() => {
                selectBreadboard()
              }}
              onTap={() => {
                selectBreadboard()
              }}
              width={viewport.canvasSizePx.width}
              x={0}
              y={0}
            />
          </Layer>

          <BreadboardLayer
            breadboard={scene.breadboard}
            isSelected={selection.type === 'breadboard'}
            onSelect={selectBreadboard}
            viewport={viewport}
          />

          <ComponentsLayer
            components={scene.components}
            onMoveComponent={moveComponent}
            onSelectComponent={selectComponent}
            selectedComponentId={
              selection.type === 'component' ? selection.componentId : undefined
            }
            viewport={viewport}
          />
        </Stage>
      ) : null}
    </div>
  )
}

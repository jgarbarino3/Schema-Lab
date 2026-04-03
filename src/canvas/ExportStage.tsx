import { useEffect, useRef } from 'react'
import type Konva from 'konva'
import { Layer, Rect, Stage } from 'react-konva'
import type {
  BeamTraceResult,
  GaussianTraceResult,
  RenderMode,
  SceneDocument,
  ViewportState,
} from '../domain/types'
import { BeamLayer } from './BeamLayer'
import { BreadboardLayer } from './BreadboardLayer'
import { ComponentsLayer } from './ComponentsLayer'
import { GaussianEnvelopeLayer } from './GaussianEnvelopeLayer'

interface ExportStageProps {
  beamTrace: BeamTraceResult
  gaussianTrace: GaussianTraceResult
  onReady: (stage: Konva.Stage | null) => void
  renderMode: RenderMode
  scene: SceneDocument
  showGaussianEnvelope: boolean
  viewport: ViewportState
}

export function ExportStage({
  beamTrace,
  gaussianTrace,
  onReady,
  renderMode,
  scene,
  showGaussianEnvelope,
  viewport,
}: ExportStageProps) {
  const stageRef = useRef<Konva.Stage | null>(null)

  useEffect(() => {
    onReady(stageRef.current)
  }, [onReady, viewport])

  return (
    <div
      aria-hidden="true"
      style={{
        left: -10000,
        pointerEvents: 'none',
        position: 'fixed',
        top: -10000,
      }}
    >
      <Stage
        ref={(stage) => {
          stageRef.current = stage
        }}
        height={viewport.canvasSizePx.height}
        width={viewport.canvasSizePx.width}
      >
        <Layer>
          <Rect
            fill="#0b1014"
            height={viewport.canvasSizePx.height}
            width={viewport.canvasSizePx.width}
            x={0}
            y={0}
          />
        </Layer>

        <BreadboardLayer
          breadboard={scene.breadboard}
          isSelected={false}
          onSelect={() => undefined}
          viewport={viewport}
        />

        {showGaussianEnvelope ? (
          <GaussianEnvelopeLayer
            beamTrace={beamTrace}
            gaussianTrace={gaussianTrace}
            viewport={viewport}
          />
        ) : null}

        <BeamLayer
          beamTrace={beamTrace}
          gaussianTrace={gaussianTrace}
          onHoverSegment={() => undefined}
          onSelectSegment={() => undefined}
          showDetails={false}
          viewport={viewport}
        />

        <ComponentsLayer
          breadboard={scene.breadboard}
          components={scene.components}
          highlightedComponentIds={[]}
          isPanMode={false}
          onBeginComponentDrag={() => undefined}
          onCommitComponentDrag={() => undefined}
          onHoverComponent={() => undefined}
          onSelectComponent={() => undefined}
          onUpdateComponentDrag={() => undefined}
          renderMode={renderMode}
          snapMode="none"
          viewport={viewport}
        />
      </Stage>
    </div>
  )
}

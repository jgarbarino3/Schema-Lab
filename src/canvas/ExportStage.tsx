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
import {
  getBreadboardInstance,
  getBreadboardInstances,
  getHostSurfaceIdForComponent,
  getOpticalTable,
  getWorkspacePrimaryBreadboard,
} from '../domain/workspace'
import type { ExportScope } from '../domain/exportLayout'

interface ExportStageProps {
  beamTrace: BeamTraceResult
  breadboardSurfaceId?: string
  gaussianTrace: GaussianTraceResult
  onReady: (stage: Konva.Stage | null) => void
  renderMode: RenderMode
  scene: SceneDocument
  scope: ExportScope
  showGaussianEnvelope: boolean
  viewport: ViewportState
}

export function ExportStage({
  beamTrace,
  breadboardSurfaceId,
  gaussianTrace,
  onReady,
  renderMode,
  scene,
  scope,
  showGaussianEnvelope,
  viewport,
}: ExportStageProps) {
  const stageRef = useRef<Konva.Stage | null>(null)
  const primaryBreadboard = getWorkspacePrimaryBreadboard(scene)
  const opticalTable = getOpticalTable(scene)
  const breadboardInstances = getBreadboardInstances(scene)
  const exportBreadboardInstance =
    scene.workspace.kind === 'optical-table'
      ? getBreadboardInstance(scene, breadboardSurfaceId) ?? breadboardInstances[0]
      : undefined
  const showTableSurface = !(
    scope === 'breadboard-only' && scene.workspace.kind === 'optical-table'
  )
  const breadboardsToRender =
    scope === 'breadboard-only' && exportBreadboardInstance
      ? [exportBreadboardInstance]
      : breadboardInstances
  const componentsToRender =
    scope === 'breadboard-only' && exportBreadboardInstance
      ? scene.components.filter(
          (component) =>
            getHostSurfaceIdForComponent(scene, component) === exportBreadboardInstance.id,
        )
      : scene.components
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

        {opticalTableBoard && showTableSurface ? (
          <BreadboardLayer
            anchorMm={{ x: 0, y: 0 }}
            breadboard={opticalTableBoard}
            isSelected={false}
            onSelect={() => undefined}
            palette={{
              boardFill: '#a8b0b6',
              boardStroke: '#d4dae0',
              holeFill: '#6f777f',
              labelColor: '#16202a',
            }}
            showSourceLanes={false}
            viewport={viewport}
          />
        ) : (
          <BreadboardLayer
            anchorMm={{ x: 0, y: 0 }}
            breadboard={primaryBreadboard}
            isSelected={false}
            onSelect={() => undefined}
            viewport={viewport}
          />
        )}

        {breadboardsToRender.map((breadboard) => (
          <BreadboardLayer
            anchorMm={breadboard.anchorMm}
            breadboard={{
              ...breadboard.model,
              label: breadboard.label,
            }}
            isSelected={false}
            key={breadboard.id}
            onSelect={() => undefined}
            rotationQuarterTurns={breadboard.rotationQuarterTurns}
            viewport={viewport}
          />
        ))}

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
          components={componentsToRender}
          highlightedComponentIds={[]}
          isPanMode={false}
          onBeginComponentDrag={() => undefined}
          onCommitComponentDrag={() => undefined}
          onHoverComponent={() => undefined}
          onResizeComponent={() => undefined}
          onSelectComponent={() => undefined}
          onUpdateComponentDrag={() => undefined}
          renderMode={renderMode}
          scene={scene}
          snapMode="none"
          viewport={viewport}
        />
      </Stage>
    </div>
  )
}

import { useEffect, useRef } from 'react'
import type Konva from 'konva'
import { Layer, Line, Rect, Stage } from 'react-konva'
import { sortAnnotationsByZIndex } from '../domain/annotations'
import { getScopedExportScene } from '../domain/exportScope'
import { worldToScreen } from '../domain/geometry'
import type { ExportScope, ResolvedExportView } from '../domain/exportLayout'
import type { BeamTraceResult, GaussianTraceResult, RenderMode, SceneAnnotation, SceneDocument, SimpleIconStyle, ViewportState } from '../domain/types'
import { getBreadboardInstances, getOpticalTable, getWorkspacePrimaryBreadboard } from '../domain/workspace'
import { AnnotationsLayer } from './AnnotationsLayer'
import { BeamLayer } from './BeamLayer'
import { BreadboardLayer } from './BreadboardLayer'
import { ComponentsLayer } from './ComponentsLayer'
import type { SimpleGlyphAppearance } from './ComponentNode'
import { GaussianEnvelopeLayer } from './GaussianEnvelopeLayer'
import { getBeamSegmentScreenObstacles } from './labelLayout'
import { fitPresentationStage } from './presentationSvgExport'
import { ProjectedSurfaceLayer } from './renderers/ProjectedSurfaceLayer'
import { createLiveBreadboardSurfaceDescriptor, createLiveOpticalTableSurfaceDescriptor } from './renderers/surfaceDescriptors'
import { projectWorldPointToScreen } from './renderers/tableViewProjection'

interface ExportStageProps {
  beamTrace: BeamTraceResult
  breadboardSurfaceId?: string
  gaussianTrace: GaussianTraceResult
  onReady: (stage: Konva.Stage | null) => void
  renderMode: RenderMode
  scene: SceneDocument
  scope: ExportScope
  showLabels?: boolean
  showPostHolders?: boolean
  showGaussianEnvelope: boolean
  simpleGlyphAppearances?: Record<string, SimpleGlyphAppearance>
  simpleIconStyle?: SimpleIconStyle
  view?: ResolvedExportView
  viewport: ViewportState
}

const ignore = () => undefined

function ExportAnnotations({ annotations, sceneView, viewport }: {
  annotations: SceneAnnotation[]
  sceneView: ResolvedExportView
  viewport: ViewportState
}) {
  const lines = annotations.filter((annotation): annotation is Extract<SceneAnnotation, { kind: 'line' }> => annotation.kind === 'line')
  const project = sceneView === 'angled'
    ? (point: { x: number; y: number }) => projectWorldPointToScreen(point, viewport)
    : (point: { x: number; y: number }) => worldToScreen(point, viewport)
  return <>
    {lines.length > 0 ? <Layer>
      {lines.map(line => {
        const start = project(line.startMm)
        const end = project(line.endMm)
        return <Line key={line.id} id={'annotation-' + line.id} points={[start.x, start.y, end.x, end.y]} stroke={line.color} strokeWidth={Math.max(1.5, line.strokeWidthMm * viewport.zoomPxPerMm)} lineCap="round" listening={false} />
      })}
    </Layer> : null}
    <AnnotationsLayer activeTool="select" annotations={annotations.filter(annotation => annotation.kind !== 'line')} onSelectAnnotation={ignore} onStartTextEditing={ignore} onTranslateAnnotation={ignore} viewport={viewport} />
  </>
}

export function ExportStage({
  beamTrace, breadboardSurfaceId, gaussianTrace, onReady, renderMode, scene, scope,
  showLabels = true, showPostHolders = false, showGaussianEnvelope,
  simpleGlyphAppearances, simpleIconStyle = 'enhanced', view = 'top-down', viewport,
}: ExportStageProps) {
  const stageRef = useRef<Konva.Stage | null>(null)
  const scoped = getScopedExportScene({ beamTrace, breadboardSurfaceId, gaussianTrace, scene, scope })
  const primaryBreadboard = getWorkspacePrimaryBreadboard(scene)
  const opticalTable = getOpticalTable(scene)
  const boardOnly = scope === 'breadboard-only' && scene.workspace.kind === 'optical-table'
  const breadboards = boardOnly
    ? scoped.exportBreadboardInstance ? [scoped.exportBreadboardInstance] : []
    : getBreadboardInstances(scene)
  // Export owns a derived scene. Removing a board's base elevation preserves
  // relative component heights without changing the user's saved geometry.
  const renderScene: SceneDocument = {
    ...scene,
    components: scoped.components,
    annotations: scoped.annotations,
    workspace: boardOnly && scene.workspace.kind === 'optical-table'
      ? { ...scene.workspace, breadboards: breadboards.map(board => ({ ...board, mountPlaneOffsetMm: view === 'angled' ? 0 : board.mountPlaneOffsetMm })) }
      : scene.workspace,
  }
  const angled = view === 'angled'
  const annotations = sortAnnotationsByZIndex(scoped.annotations)
  const below = annotations.filter(annotation => annotation.layerBand === 'below-components')
  const above = annotations.filter(annotation => annotation.layerBand === 'above-components')

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    fitPresentationStage(stage)
    onReady(stage)
  }, [onReady, viewport, scene, view, showLabels, showPostHolders])

  return <div aria-hidden="true" style={{ left: -10000, pointerEvents: 'none', position: 'fixed', top: -10000 }}>
    <Stage ref={stageRef} height={viewport.canvasSizePx.height} width={viewport.canvasSizePx.width}>
      <Layer name="export-background">
        <Rect fill="#0b1014" height={viewport.canvasSizePx.height} width={viewport.canvasSizePx.width} />
      </Layer>
      <Layer name="surfaces">
        {scene.workspace.kind === 'single-breadboard' ? <BreadboardLayer breadboard={primaryBreadboard} isSelected={false} onSelect={ignore} renderInLayer={false} showLabels={showLabels} viewport={viewport} /> : null}
        {opticalTable && !boardOnly ? angled
          ? <ProjectedSurfaceLayer surface={createLiveOpticalTableSurfaceDescriptor(opticalTable)} isSelected={false} onSelect={ignore} showLabels={showLabels} viewport={viewport} />
          : <BreadboardLayer breadboard={{ ...opticalTable, finish: 'clear-anodized' }} isSelected={false} onSelect={ignore} palette={{ boardFill: '#a8b0b6', boardStroke: '#d4dae0', holeFill: '#6f777f', labelColor: '#16202a' }} renderInLayer={false} showLabels={showLabels} viewport={viewport} />
          : null}
        {breadboards.map(board => angled
          ? <ProjectedSurfaceLayer key={board.id} anchorMm={board.anchorMm} elevationMm={boardOnly ? 0 : board.mountPlaneOffsetMm} surface={createLiveBreadboardSurfaceDescriptor({ anchorMm: board.anchorMm, breadboard: board.model, id: board.id, label: board.label, rotationQuarterTurns: board.rotationQuarterTurns })} isSelected={false} onSelect={ignore} showLabels={showLabels} viewport={viewport} />
          : <BreadboardLayer key={board.id} anchorMm={board.anchorMm} breadboard={{ ...board.model, label: board.label }} rotationQuarterTurns={board.rotationQuarterTurns} isSelected={false} onSelect={ignore} renderInLayer={false} showLabels={showLabels} viewport={viewport} />)}
      </Layer>
      {showGaussianEnvelope ? <GaussianEnvelopeLayer beamTrace={scoped.beamTrace} gaussianTrace={scoped.gaussianTrace} scene={renderScene} useProjectedTableView={angled} viewport={viewport} /> : null}
      <BeamLayer beamTrace={scoped.beamTrace} gaussianTrace={scoped.gaussianTrace} onHoverSegment={ignore} onSelectSegment={ignore} renderMode={renderMode} scene={renderScene} showDetails={false} showComponentLabels={showLabels} useProjectedTableView={angled} viewport={viewport} />
      <ExportAnnotations annotations={below} sceneView={view} viewport={viewport} />
      <ComponentsLayer components={scoped.components} highlightedComponentIds={[]} isPanMode={false} onBeginComponentDrag={ignore} onCommitComponentDrag={ignore} onHoverComponent={ignore} onResizeComponent={ignore} onSelectComponent={ignore} onUpdateComponentDrag={ignore} labelObstacles={angled ? [] : getBeamSegmentScreenObstacles(scoped.beamTrace, viewport)} renderMode={renderMode} scene={renderScene} showLabels={showLabels} showPostHolders={showPostHolders} simpleGlyphAppearances={simpleGlyphAppearances} simpleIconStyle={simpleIconStyle} snapMode="none" useProjectedTableView={angled} viewport={viewport} />
      <ExportAnnotations annotations={above} sceneView={view} viewport={viewport} />
    </Stage>
  </div>
}

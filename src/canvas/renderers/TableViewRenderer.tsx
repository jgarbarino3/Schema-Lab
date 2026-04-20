import type { KonvaEventObject } from 'konva/lib/Node'
import { Layer, Rect } from 'react-konva'
import { BreadboardLayer } from '../BreadboardLayer'
import { screenToWorld } from '../../domain/geometry'
import { SINGLE_BREADBOARD_SURFACE_ID } from '../../domain/types'
import type { SceneDocument, ViewportState } from '../../domain/types'
import { getBreadboardInstances, getOpticalTable } from '../../domain/workspace'
import type { SelectionState } from '../../state/editorStore'
import { LiveSceneLayers, type LiveSceneLayersProps } from './LiveSceneLayers'
import { LiveSurfaceLayer } from './LiveSurfaceLayer'
import { ProjectedSurfaceLayer } from './ProjectedSurfaceLayer'
import {
  createLiveBreadboardSurfaceDescriptor,
  createLiveOpticalTableSurfaceDescriptor,
} from './surfaceDescriptors'
import {
  projectScreenPointToWorld,
  shouldUseProjectedTableView,
} from './tableViewProjection'

interface TableViewRendererProps extends LiveSceneLayersProps {
  highlightedBreadboardIds: string[]
  onBackgroundSelect: (
    event?: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => void
  onCommitBreadboardDrag: (breadboardId: string, anchorMm?: { x: number; y: number }) => void
  onSelectBreadboard: (
    surfaceId: string,
    event?: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => void
  onSelectOpticalTable: (event?: KonvaEventObject<MouseEvent | TouchEvent>) => void
  onUpdateBreadboardDrag: (breadboardId: string, anchorMm: { x: number; y: number }) => void
  onBeginBreadboardDrag: (breadboardId: string) => void
  scene: SceneDocument
  selection: SelectionState
  showLabels: boolean
  showPostHolders: boolean
  viewport: ViewportState
}

export function TableViewRenderer({
  highlightedBreadboardIds,
  interaction,
  onBackgroundSelect,
  onBeginBreadboardDrag,
  onCommitBreadboardDrag,
  onSelectBreadboard,
  onSelectOpticalTable,
  onUpdateBreadboardDrag,
  scene,
  selection,
  showLabels,
  showPostHolders,
  viewport,
  ...sceneLayersProps
}: TableViewRendererProps) {
  if (scene.workspace.kind !== 'optical-table') {
    return null
  }

  const opticalTable = getOpticalTable(scene)
  const breadboardInstances = getBreadboardInstances(scene)
  const isPanMode = interaction.activeTool === 'pan' || interaction.isSpacePanning
  const isHighlightTool =
    interaction.activeTool === 'highlight' && !interaction.isSpacePanning
  const isLineTool = interaction.activeTool === 'line' && !interaction.isSpacePanning
  const isTextTool = interaction.activeTool === 'text' && !interaction.isSpacePanning
  const isShapeTool = interaction.activeTool === 'shape' && !interaction.isSpacePanning
  const isAnnotationPlacementTool = isLineTool || isTextTool || isShapeTool
  const useProjectedTableView = shouldUseProjectedTableView(
    scene,
    sceneLayersProps.renderMode,
    'table-view',
  )

  return (
    <>
      <Layer>
        <Rect
          fillRadialGradientStartPoint={{
            x: viewport.canvasSizePx.width / 2,
            y: viewport.canvasSizePx.height / 2,
          }}
          fillRadialGradientStartRadius={0}
          fillRadialGradientEndPoint={{
            x: viewport.canvasSizePx.width / 2,
            y: viewport.canvasSizePx.height / 2,
          }}
          fillRadialGradientEndRadius={Math.max(
            viewport.canvasSizePx.width,
            viewport.canvasSizePx.height,
          )}
          fillRadialGradientColorStops={[0, '#111920', 1, '#0b1014']}
          height={viewport.canvasSizePx.height}
          name="stage-background-hit"
          onClick={(event) => onBackgroundSelect(event)}
          onTap={(event) => onBackgroundSelect(event)}
          width={viewport.canvasSizePx.width}
          x={0}
          y={0}
        />

        {opticalTable ? (
          useProjectedTableView ? (
            <ProjectedSurfaceLayer
              anchorMm={{ x: 0, y: 0 }}
              elevationMm={0}
              isSelected={selection.type === 'optical-table'}
              onSelect={onSelectOpticalTable}
              showLabels={showLabels}
              surface={createLiveOpticalTableSurfaceDescriptor(opticalTable)}
              viewport={viewport}
            />
          ) : (
            <LiveSurfaceLayer
              anchorMm={{ x: 0, y: 0 }}
              isSelected={selection.type === 'optical-table'}
              onSelect={onSelectOpticalTable}
              showLabels={showLabels}
              surface={createLiveOpticalTableSurfaceDescriptor(opticalTable)}
              viewport={viewport}
            />
          )
        ) : null}

        {breadboardInstances.map((breadboard) => (
          useProjectedTableView ? (
            <ProjectedSurfaceLayer
              anchorMm={
                interaction.breadboardDragPreview?.breadboardId === breadboard.id
                  ? interaction.breadboardDragPreview.candidateAnchorMm
                  : breadboard.anchorMm
              }
              draggable={
                !isPanMode &&
                !isHighlightTool &&
                !isAnnotationPlacementTool &&
                !interaction.pendingPlacement &&
                !interaction.pendingBreadboardPlacement
              }
              elevationMm={breadboard.mountPlaneOffsetMm}
              isFocused={interaction.focusedBreadboardId === breadboard.id}
              isHighlighted={highlightedBreadboardIds.includes(breadboard.id)}
              isSelected={
                selection.type === 'breadboard' && selection.surfaceId === breadboard.id
              }
              key={breadboard.id}
              onDragEnd={(screenPointPx) =>
                onCommitBreadboardDrag(
                  breadboard.id,
                  projectScreenPointToWorld(
                    screenPointPx,
                    viewport,
                    breadboard.mountPlaneOffsetMm,
                  ),
                )
              }
              onDragMove={(screenPointPx) =>
                onUpdateBreadboardDrag(
                  breadboard.id,
                  projectScreenPointToWorld(
                    screenPointPx,
                    viewport,
                    breadboard.mountPlaneOffsetMm,
                  ),
                )
              }
              onDragStart={() => onBeginBreadboardDrag(breadboard.id)}
              onSelect={(event) => onSelectBreadboard(breadboard.id, event)}
              showLabels={showLabels}
              surface={createLiveBreadboardSurfaceDescriptor({
                anchorMm:
                  interaction.breadboardDragPreview?.breadboardId === breadboard.id
                    ? interaction.breadboardDragPreview.candidateAnchorMm
                    : breadboard.anchorMm,
                breadboard: breadboard.model,
                id: breadboard.id,
                label: breadboard.label,
                rotationQuarterTurns: breadboard.rotationQuarterTurns,
              })}
              viewport={viewport}
            />
          ) : (
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
              draggable={
                !isPanMode &&
                !isHighlightTool &&
                !isAnnotationPlacementTool &&
                !interaction.pendingPlacement &&
                !interaction.pendingBreadboardPlacement
              }
              isFocused={interaction.focusedBreadboardId === breadboard.id}
              isHighlighted={highlightedBreadboardIds.includes(breadboard.id)}
              isSelected={
                selection.type === 'breadboard' && selection.surfaceId === breadboard.id
              }
              key={breadboard.id}
              onDragEnd={(screenPointPx) =>
                onCommitBreadboardDrag(breadboard.id, screenToWorld(screenPointPx, viewport))
              }
              onDragMove={(screenPointPx) =>
                onUpdateBreadboardDrag(breadboard.id, screenToWorld(screenPointPx, viewport))
              }
              onDragStart={() => onBeginBreadboardDrag(breadboard.id)}
              onSelect={(event) => onSelectBreadboard(breadboard.id, event)}
              renderInLayer={false}
              rotationQuarterTurns={breadboard.rotationQuarterTurns}
              showLabels={showLabels}
              viewport={viewport}
            />
          )
        ))}

        {interaction.pendingBreadboardPlacement ? (
          useProjectedTableView ? (
            <ProjectedSurfaceLayer
              anchorMm={interaction.pendingBreadboardPlacement.candidateAnchorMm}
              elevationMm={interaction.pendingBreadboardPlacement.model.thicknessMm}
              isSelected
              onSelect={onSelectOpticalTable}
              opacity={0.72}
              showLabels={showLabels}
              surface={createLiveBreadboardSurfaceDescriptor({
                anchorMm: interaction.pendingBreadboardPlacement.candidateAnchorMm,
                breadboard: interaction.pendingBreadboardPlacement.model,
                id: `${SINGLE_BREADBOARD_SURFACE_ID}-pending`,
                label: interaction.pendingBreadboardPlacement.label,
                palette: {
                  boardFill: '#25313a',
                  boardStroke: '#8fd4ef',
                  holeFill: '#111820',
                  labelColor: '#d7edf6',
                },
                rotationQuarterTurns:
                  interaction.pendingBreadboardPlacement.rotationQuarterTurns,
              })}
              viewport={viewport}
            />
          ) : (
            <LiveSurfaceLayer
              anchorMm={interaction.pendingBreadboardPlacement.candidateAnchorMm}
              isSelected
              onSelect={onSelectOpticalTable}
              opacity={0.72}
              showLabels={showLabels}
              surface={createLiveBreadboardSurfaceDescriptor({
                anchorMm: interaction.pendingBreadboardPlacement.candidateAnchorMm,
                breadboard: interaction.pendingBreadboardPlacement.model,
                id: `${SINGLE_BREADBOARD_SURFACE_ID}-pending`,
                label: interaction.pendingBreadboardPlacement.label,
                palette: {
                  boardFill: '#25313a',
                  boardStroke: '#8fd4ef',
                  holeFill: '#111820',
                  labelColor: '#d7edf6',
                },
                rotationQuarterTurns:
                  interaction.pendingBreadboardPlacement.rotationQuarterTurns,
              })}
              viewport={viewport}
            />
          )
        ) : null}
      </Layer>

      <LiveSceneLayers
        {...sceneLayersProps}
        interaction={interaction}
        scene={scene}
        selection={selection}
        showLabels={showLabels}
        showPostHolders={showPostHolders}
        viewport={viewport}
        useProjectedTableView={useProjectedTableView}
      />
    </>
  )
}

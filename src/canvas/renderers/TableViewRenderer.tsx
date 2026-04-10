import type { KonvaEventObject } from 'konva/lib/Node'
import { Layer } from 'react-konva'
import { BreadboardLayer } from '../BreadboardLayer'
import { screenToWorld } from '../../domain/geometry'
import { SINGLE_BREADBOARD_SURFACE_ID } from '../../domain/types'
import type { SceneDocument, ViewportState } from '../../domain/types'
import { getBreadboardInstances, getOpticalTable } from '../../domain/workspace'
import type { SelectionState } from '../../state/editorStore'
import { LiveSceneLayers, type LiveSceneLayersProps } from './LiveSceneLayers'
import { LiveSurfaceLayer } from './LiveSurfaceLayer'
import {
  createLiveBreadboardSurfaceDescriptor,
  createLiveOpticalTableSurfaceDescriptor,
} from './surfaceDescriptors'

interface TableViewRendererProps extends LiveSceneLayersProps {
  highlightedBreadboardIds: string[]
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
  const isLineTool = interaction.activeTool === 'line' && !interaction.isSpacePanning
  const isTextTool = interaction.activeTool === 'text' && !interaction.isSpacePanning
  const isShapeTool = interaction.activeTool === 'shape' && !interaction.isSpacePanning
  const isAnnotationPlacementTool = isLineTool || isTextTool || isShapeTool

  return (
    <>
      <Layer>
        {opticalTable ? (
          <LiveSurfaceLayer
            anchorMm={{ x: 0, y: 0 }}
            isSelected={selection.type === 'optical-table'}
            onSelect={onSelectOpticalTable}
            showLabels={showLabels}
            surface={createLiveOpticalTableSurfaceDescriptor(opticalTable)}
            viewport={viewport}
          />
        ) : null}

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
            draggable={
              !isPanMode &&
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
        ))}

        {interaction.pendingBreadboardPlacement ? (
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
      />
    </>
  )
}

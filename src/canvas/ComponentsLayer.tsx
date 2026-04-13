import { memo } from 'react'
import type { KonvaEventObject } from 'konva/lib/Node'
import { Circle, Layer, Rect } from 'react-konva'
import {
  annotateScenePlacementOccupancy,
  resolveScenePlacement,
} from '../domain/placement'
import { screenToWorld, worldToScreen } from '../domain/geometry'
import {
  getDefaultSurfaceId,
  getSurfaceSupportCompensationMm,
  resolveTopmostSurfaceIdAtWorldPoint,
} from '../domain/workspace'
import type {
  ComponentInstance,
  PendingPlacementState,
  RenderMode,
  SceneDocument,
  ScreenPointPx,
  SnapMode,
  ViewportState,
} from '../domain/types'
import { ComponentNodeView, type SimpleGlyphAppearance } from './ComponentNode'

interface DragPreviewState {
  componentId: string
  candidateAnchorMm: { x: number; y: number }
  componentIds?: string[]
  hostSurfaceId?: string
}

interface BreadboardDragPreviewState {
  breadboardId: string
  candidateAnchorMm: { x: number; y: number }
}

interface ComponentsLayerProps {
  breadboardDragPreview?: BreadboardDragPreviewState
  components: ComponentInstance[]
  dragPreview?: DragPreviewState
  hoveredComponentId?: string
  highlightedComponentIds?: string[]
  isLineTool?: boolean
  isPanMode: boolean
  showLabels?: boolean
  showPostHolders?: boolean
  onBeginComponentDrag: (componentId: string) => void
  onCommitComponentDrag: (
    componentId: string,
    anchorMm?: { x: number; y: number },
  ) => void
  onHoverComponent: (componentId?: string) => void
  onOpenComponentContextMenu?: (
    componentId: string,
    pointPx: ScreenPointPx,
  ) => void
  onLineToolClick?: (
    event?: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => void
  onSelectComponent: (componentId: string) => void
  onResizeComponent?: (
    componentId: string,
    update: { widthMm?: number; heightMm?: number },
  ) => void
  onUpdateComponentDrag: (
    componentId: string,
    anchorMm: { x: number; y: number },
  ) => void
  pendingPlacement?: PendingPlacementState
  renderMode: RenderMode
  scene: SceneDocument
  selectedComponentId?: string
  snapMode: SnapMode
  simpleGlyphAppearances?: Record<string, SimpleGlyphAppearance>
  viewport: ViewportState
}

function getPreviewAccent(status: 'valid' | 'snapped' | 'warning') {
  switch (status) {
    case 'snapped':
      return '#96d8ee'
    case 'warning':
      return '#f5d28c'
    case 'valid':
    default:
      return '#b7d8e4'
  }
}

function resolvePreviewHostSurfaceId(
  scene: SceneDocument,
  component: Pick<ComponentInstance, 'hostSurfaceId'>,
  candidateAnchorMm: { x: number; y: number },
) {
  if (scene.workspace.kind !== 'optical-table') {
    return component.hostSurfaceId ?? getDefaultSurfaceId(scene)
  }

  return (
    resolveTopmostSurfaceIdAtWorldPoint(scene, candidateAnchorMm) ??
    component.hostSurfaceId ??
    getDefaultSurfaceId(scene)
  )
}

export const ComponentsLayer = memo(function ComponentsLayer({
  breadboardDragPreview,
  components,
  dragPreview,
  hoveredComponentId,
  highlightedComponentIds,
  isLineTool = false,
  isPanMode,
  showLabels = true,
  showPostHolders = false,
  onBeginComponentDrag,
  onCommitComponentDrag,
  onHoverComponent,
  onOpenComponentContextMenu,
  onLineToolClick,
  onResizeComponent,
  onSelectComponent,
  onUpdateComponentDrag,
  pendingPlacement,
  renderMode,
  scene,
  selectedComponentId,
  snapMode,
  simpleGlyphAppearances,
  viewport,
}: ComponentsLayerProps) {
  const previewedComponent = dragPreview
    ? components.find((component) => component.id === dragPreview.componentId)
    : undefined
  const draggedComponentIds =
    dragPreview?.componentIds?.length ? dragPreview.componentIds : undefined
  const draggedComponentIdSet = draggedComponentIds
    ? new Set(draggedComponentIds)
    : undefined
  const breadboardDragDeltaMm =
    scene.workspace.kind === 'optical-table' && breadboardDragPreview
      ? (() => {
          const breadboard = scene.workspace.breadboards.find(
            (candidate) => candidate.id === breadboardDragPreview.breadboardId,
          )

          return breadboard
            ? {
                x:
                  breadboardDragPreview.candidateAnchorMm.x - breadboard.anchorMm.x,
                y:
                  breadboardDragPreview.candidateAnchorMm.y - breadboard.anchorMm.y,
              }
            : undefined
        })()
      : undefined
  const previewHostSurfaceId =
    previewedComponent && dragPreview
      ? dragPreview.hostSurfaceId ??
        resolvePreviewHostSurfaceId(
          scene,
          previewedComponent,
          dragPreview.candidateAnchorMm,
        )
      : undefined
  const previewComponent =
    previewedComponent && previewHostSurfaceId
      ? {
          ...previewedComponent,
          hostSurfaceId: previewHostSurfaceId,
        }
      : undefined
  const previewPlacement =
    previewComponent && dragPreview
      ? annotateScenePlacementOccupancy({
          scene,
          components,
          ignoreComponentId: previewComponent.id,
          hostSurfaceId: previewComponent.hostSurfaceId,
          result: resolveScenePlacement({
            scene,
            candidateAnchorMm: dragPreview.candidateAnchorMm,
            component: previewComponent,
            phase: 'drag',
            snapMode,
          }),
        })
      : undefined
  const previewHoleMm =
    previewPlacement?.snapPreviewHoleMm ?? previewPlacement?.snappedHoleMm
  const previewAccent = previewPlacement
    ? getPreviewAccent(previewPlacement.status)
    : undefined
  const pendingPlacementResult = pendingPlacement
    ? annotateScenePlacementOccupancy({
        scene,
        components,
        ignoreComponentId: pendingPlacement.draft.id,
        hostSurfaceId: pendingPlacement.draft.hostSurfaceId,
        result: resolveScenePlacement({
          scene,
          candidateAnchorMm: pendingPlacement.candidateAnchorMm,
          component: pendingPlacement.draft,
          phase: 'drag',
          snapMode,
        }),
      })
    : undefined
  const pendingPreviewHoleMm =
    pendingPlacementResult?.snapPreviewHoleMm ??
    pendingPlacementResult?.snappedHoleMm
  const pendingPreviewAccent = pendingPlacementResult
    ? getPreviewAccent(pendingPlacementResult.status)
    : undefined

  return (
    <Layer>
      {components.map((component) => (
        <ComponentNodeView
          isHighlighted={highlightedComponentIds?.includes(component.id)}
          instance={(() => {
            const breadboardShiftedComponent =
              breadboardDragDeltaMm &&
              component.hostSurfaceId === breadboardDragPreview?.breadboardId
                ? {
                    ...component,
                    anchorMm: {
                      x: component.anchorMm.x + breadboardDragDeltaMm.x,
                      y: component.anchorMm.y + breadboardDragDeltaMm.y,
                    },
                  }
                : component

            if (
              !dragPreview ||
              !previewedComponent ||
              !draggedComponentIdSet?.has(component.id)
            ) {
              return breadboardShiftedComponent
            }

            if (component.id === dragPreview.componentId) {
              return {
                ...breadboardShiftedComponent,
                anchorMm: dragPreview.candidateAnchorMm,
              }
            }

            return {
              ...breadboardShiftedComponent,
              anchorMm: {
                x: dragPreview.candidateAnchorMm.x + (component.anchorMm.x - previewedComponent.anchorMm.x),
                y: dragPreview.candidateAnchorMm.y + (component.anchorMm.y - previewedComponent.anchorMm.y),
              },
            }
          })()}
          isDragEnabled={!isPanMode && !isLineTool}
          isHovered={component.id === hoveredComponentId}
          isSelected={component.id === selectedComponentId}
          showLabels={showLabels}
          showPostHolders={showPostHolders}
          key={component.id}
          onDragEnd={(componentId, screenPointPx) => {
            onCommitComponentDrag(componentId, screenToWorld(screenPointPx, viewport))
          }}
          onDragMove={(componentId, screenPointPx) => {
            onUpdateComponentDrag(componentId, screenToWorld(screenPointPx, viewport))
          }}
          onDragStart={onBeginComponentDrag}
          onHoverChange={isPanMode ? undefined : onHoverComponent}
          onOpenContextMenu={
            onOpenComponentContextMenu
              ? (componentId, event) => {
                  if (!('clientX' in event.evt) || !('clientY' in event.evt)) {
                    return
                  }

                  onOpenComponentContextMenu(componentId, {
                    x: event.evt.clientX,
                    y: event.evt.clientY,
                  })
                }
              : undefined
          }
          onResize={isPanMode || isLineTool ? undefined : onResizeComponent}
          onSelect={
            isPanMode
              ? undefined
              : isLineTool
                ? (_componentId, event) => onLineToolClick?.(event)
                : onSelectComponent
          }
          placementStatus={
            dragPreview?.componentId === component.id
              ? previewPlacement?.status
              : undefined
          }
          renderMode={renderMode}
          simpleGlyphAppearance={simpleGlyphAppearances?.[component.id]}
          surfaceSupportCompensationMm={getSurfaceSupportCompensationMm(
            scene,
            component.hostSurfaceId,
          )}
          resolveDragPositionPx={
            snapMode === 'always'
              ? (screenPointPx: ScreenPointPx) => {
                  const candidateAnchorMm = screenToWorld(screenPointPx, viewport)
                  const candidateComponent = {
                    ...component,
                    hostSurfaceId: resolvePreviewHostSurfaceId(
                      scene,
                      component,
                      candidateAnchorMm,
                    ),
                  }
                  const placement = resolveScenePlacement({
                    scene,
                    candidateAnchorMm,
                    component: candidateComponent,
                    phase: 'drag',
                    snapMode,
                  })

                  return worldToScreen(placement.resolvedAnchorMm, viewport)
                }
              : undefined
          }
          viewport={viewport}
        />
      ))}

      {pendingPlacement && pendingPlacementResult ? (
        <>
          <ComponentNodeView
            instance={{
              ...pendingPlacement.draft,
              anchorMm: pendingPlacementResult.resolvedAnchorMm,
              rotationQuarterTurns: pendingPlacement.draft.rotationQuarterTurns,
            }}
            isPreview
            isSelected={false}
            placementStatus={pendingPlacementResult.status}
            renderMode={renderMode}
            simpleGlyphAppearance={simpleGlyphAppearances?.[pendingPlacement.draft.id]}
            showLabels={showLabels}
            surfaceSupportCompensationMm={getSurfaceSupportCompensationMm(
              scene,
              pendingPlacement.draft.hostSurfaceId,
            )}
            viewport={viewport}
          />

          {pendingPreviewHoleMm ? (
            <Circle
              fill="rgba(0, 0, 0, 0)"
              listening={false}
              radius={7}
              stroke={pendingPreviewAccent}
              strokeWidth={1.2}
              x={worldToScreen(pendingPreviewHoleMm, viewport).x}
              y={worldToScreen(pendingPreviewHoleMm, viewport).y}
            />
          ) : null}

          <Rect
            dash={[5, 3]}
            fill="rgba(0, 0, 0, 0)"
            height={pendingPlacementResult.supportBoundsMm.height * viewport.zoomPxPerMm}
            listening={false}
            stroke={pendingPreviewAccent}
            strokeWidth={1}
            width={pendingPlacementResult.supportBoundsMm.width * viewport.zoomPxPerMm}
            x={worldToScreen(
              {
                x: pendingPlacementResult.supportBoundsMm.x,
                y: pendingPlacementResult.supportBoundsMm.y,
              },
              viewport,
            ).x}
            y={worldToScreen(
              {
                x: pendingPlacementResult.supportBoundsMm.x,
                y: pendingPlacementResult.supportBoundsMm.y,
              },
              viewport,
            ).y}
          />
        </>
      ) : null}

      {previewedComponent && previewPlacement ? (
        <>
          <ComponentNodeView
            instance={{
              ...previewedComponent,
              anchorMm: previewPlacement.resolvedAnchorMm,
            }}
            isPreview
            isSelected={false}
            placementStatus={previewPlacement.status}
            renderMode={renderMode}
            simpleGlyphAppearance={simpleGlyphAppearances?.[previewedComponent.id]}
            showLabels={showLabels}
            viewport={viewport}
          />

          {previewHoleMm ? (
            <Circle
              fill="rgba(0, 0, 0, 0)"
              listening={false}
              radius={6}
              stroke={previewAccent}
              strokeWidth={1.2}
              x={worldToScreen(previewHoleMm, viewport).x}
              y={worldToScreen(previewHoleMm, viewport).y}
            />
          ) : null}

          <Rect
            dash={[5, 3]}
            fill="rgba(0, 0, 0, 0)"
            height={previewPlacement.supportBoundsMm.height * viewport.zoomPxPerMm}
            listening={false}
            stroke={previewAccent}
            strokeWidth={1}
            width={previewPlacement.supportBoundsMm.width * viewport.zoomPxPerMm}
            x={worldToScreen(
              {
                x: previewPlacement.supportBoundsMm.x,
                y: previewPlacement.supportBoundsMm.y,
              },
              viewport,
            ).x}
            y={worldToScreen(
              {
                x: previewPlacement.supportBoundsMm.x,
                y: previewPlacement.supportBoundsMm.y,
              },
              viewport,
            ).y}
          />
        </>
      ) : null}
    </Layer>
  )
})

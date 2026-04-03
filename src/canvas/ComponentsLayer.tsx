import { Circle, Layer, Rect } from 'react-konva'
import { annotatePlacementOccupancy, resolveComponentPlacement } from '../domain/placement'
import { screenToWorld, worldToScreen } from '../domain/geometry'
import type {
  BreadboardModel,
  ComponentInstance,
  PendingPlacementState,
  RenderMode,
  ScreenPointPx,
  SnapMode,
  ViewportState,
} from '../domain/types'
import { ComponentNode } from './ComponentNode'

interface DragPreviewState {
  componentId: string
  candidateAnchorMm: { x: number; y: number }
}

interface ComponentsLayerProps {
  breadboard: BreadboardModel
  components: ComponentInstance[]
  dragPreview?: DragPreviewState
  hoveredComponentId?: string
  highlightedComponentIds?: string[]
  isPanMode: boolean
  onBeginComponentDrag: (componentId: string) => void
  onCommitComponentDrag: (
    componentId: string,
    anchorMm?: { x: number; y: number },
  ) => void
  onHoverComponent: (componentId?: string) => void
  onSelectComponent: (componentId: string) => void
  onUpdateComponentDrag: (
    componentId: string,
    anchorMm: { x: number; y: number },
  ) => void
  pendingPlacement?: PendingPlacementState
  renderMode: RenderMode
  selectedComponentId?: string
  snapMode: SnapMode
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

export function ComponentsLayer({
  breadboard,
  components,
  dragPreview,
  hoveredComponentId,
  highlightedComponentIds,
  isPanMode,
  onBeginComponentDrag,
  onCommitComponentDrag,
  onHoverComponent,
  onSelectComponent,
  onUpdateComponentDrag,
  pendingPlacement,
  renderMode,
  selectedComponentId,
  snapMode,
  viewport,
}: ComponentsLayerProps) {
  const previewedComponent = dragPreview
    ? components.find((component) => component.id === dragPreview.componentId)
    : undefined
  const previewPlacement =
    previewedComponent && dragPreview
      ? annotatePlacementOccupancy({
          breadboard,
          components,
          ignoreComponentId: previewedComponent.id,
          result: resolveComponentPlacement({
            breadboard,
            candidateAnchorMm: dragPreview.candidateAnchorMm,
            component: previewedComponent,
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
    ? annotatePlacementOccupancy({
        breadboard,
        components,
        ignoreComponentId: pendingPlacement.draft.id,
        result: resolveComponentPlacement({
          breadboard,
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
        <ComponentNode
          isHighlighted={highlightedComponentIds?.includes(component.id)}
          instance={component}
          isDragEnabled={!isPanMode}
          isHovered={component.id === hoveredComponentId}
          isSelected={component.id === selectedComponentId}
          key={component.id}
          onDragEnd={(componentId, screenPointPx) => {
            onCommitComponentDrag(componentId, screenToWorld(screenPointPx, viewport))
          }}
          onDragMove={(componentId, screenPointPx) => {
            onUpdateComponentDrag(componentId, screenToWorld(screenPointPx, viewport))
          }}
          onDragStart={onBeginComponentDrag}
          onHoverChange={isPanMode ? undefined : onHoverComponent}
          onSelect={isPanMode ? undefined : onSelectComponent}
          placementStatus={
            dragPreview?.componentId === component.id
              ? previewPlacement?.status
              : undefined
          }
          renderMode={renderMode}
          resolveDragPositionPx={
            snapMode === 'always'
              ? (screenPointPx: ScreenPointPx) => {
                  const placement = resolveComponentPlacement({
                    breadboard,
                    candidateAnchorMm: screenToWorld(screenPointPx, viewport),
                    component,
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
          <ComponentNode
            instance={{
              ...pendingPlacement.draft,
              anchorMm: pendingPlacementResult.resolvedAnchorMm,
              rotationQuarterTurns: pendingPlacement.draft.rotationQuarterTurns,
            }}
            isPreview
            isSelected={false}
            placementStatus={pendingPlacementResult.status}
            renderMode={renderMode}
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
          <ComponentNode
            instance={{
              ...previewedComponent,
              anchorMm: previewPlacement.resolvedAnchorMm,
            }}
            isPreview
            isSelected={false}
            placementStatus={previewPlacement.status}
            renderMode={renderMode}
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
}

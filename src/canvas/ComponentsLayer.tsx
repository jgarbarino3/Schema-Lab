import { memo, useMemo } from 'react'
import type { KonvaEventObject } from 'konva/lib/Node'
import { Circle, Group, Layer, Line, Rect, Text } from 'react-konva'
import {
  annotateScenePlacementOccupancy,
  inspectSceneComponentPlacement,
  resolveScenePlacement,
} from '../domain/placement'
import { screenToWorld, worldToScreen } from '../domain/geometry'
import {
  getDefaultSurfaceId,
  getSurfaceMountPlaneOffsetMm,
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
import { ComponentNode, type SimpleGlyphAppearance } from './ComponentNode'
import { ProjectedComponentNode } from './ProjectedComponentNode'
import {
  getProjectedBoundsAabb,
  getProjectedBoundsLinePoints,
  projectWorldPointToScreen,
  resolveProjectedScreenPointToWorld,
} from './renderers/tableViewProjection'
import {
  getComponentLabelPlacements,
  getProjectedComponentLabelPlacements,
} from './labelLayout'
import type { BoundsPx } from './labelLayout'

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
  isHighlightTool?: boolean
  isLineTool?: boolean
  isPanMode: boolean
  labelObstacles?: BoundsPx[]
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
  simpleGlyphAppearances?: Record<string, SimpleGlyphAppearance>
  snapMode: SnapMode
  useProjectedTableView?: boolean
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
  isHighlightTool = false,
  isLineTool = false,
  isPanMode,
  labelObstacles,
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
  simpleGlyphAppearances,
  snapMode,
  useProjectedTableView = false,
  viewport,
}: ComponentsLayerProps) {
  const previewedComponent = dragPreview
    ? components.find((component) => component.id === dragPreview.componentId)
    : undefined
  const componentById = useMemo(
    () => new Map(components.map((component) => [component.id, component] as const)),
    [components],
  )
  const getDepth = useMemo(
    () => (component: ComponentInstance) => {
      let depth = 0
      let current = component
      const visited = new Set<string>()

      while (current.attachment?.parentComponentId && !visited.has(current.id)) {
        visited.add(current.id)
        const parent = componentById.get(current.attachment.parentComponentId)

        if (!parent) {
          break
        }

        depth += 1
        current = parent
      }

      return depth
    },
    [componentById],
  )
  const draggedComponentIds =
    dragPreview?.componentIds?.length ? dragPreview.componentIds : undefined
  const interactiveComponentIdSet = useMemo(
    () =>
      highlightedComponentIds?.length
        ? new Set(highlightedComponentIds)
        : undefined,
    [highlightedComponentIds],
  )
  const draggedComponentIdSet = draggedComponentIds
    ? new Set(draggedComponentIds)
    : undefined
  const previewDragDeltaMm =
    dragPreview && previewedComponent
      ? {
          x: dragPreview.candidateAnchorMm.x - previewedComponent.anchorMm.x,
          y: dragPreview.candidateAnchorMm.y - previewedComponent.anchorMm.y,
        }
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
          component: previewComponent,
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
        component: pendingPlacement.draft,
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
  const isDraggedSubtreeMember = useMemo(
    () => (componentId: string) => {
      if (!draggedComponentIdSet) {
        return false
      }

      let current = componentById.get(componentId)

      while (current) {
        if (draggedComponentIdSet.has(current.id)) {
          return true
        }

        current = current.attachment?.parentComponentId
          ? componentById.get(current.attachment.parentComponentId)
          : undefined
      }

      return false
    },
    [componentById, draggedComponentIdSet],
  )
  const displayedComponents = useMemo(
    () =>
      components.map((component) => {
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
          !previewDragDeltaMm ||
          !isDraggedSubtreeMember(component.id)
        ) {
          return breadboardShiftedComponent
        }

        if (component.id === dragPreview.componentId) {
          return {
            ...breadboardShiftedComponent,
            anchorMm: dragPreview.candidateAnchorMm,
            hostSurfaceId:
              previewHostSurfaceId ?? breadboardShiftedComponent.hostSurfaceId,
          }
        }

        return {
          ...breadboardShiftedComponent,
          anchorMm: {
            x: breadboardShiftedComponent.anchorMm.x + previewDragDeltaMm.x,
            y: breadboardShiftedComponent.anchorMm.y + previewDragDeltaMm.y,
          },
        }
      }),
    [
      breadboardDragDeltaMm,
      breadboardDragPreview?.breadboardId,
      components,
      dragPreview,
      isDraggedSubtreeMember,
      previewDragDeltaMm,
      previewHostSurfaceId,
      previewedComponent,
    ],
  )
  const orderedComponents = useMemo(() => {
    if (!useProjectedTableView) {
      return [...displayedComponents].sort(
        (left, right) => getDepth(left) - getDepth(right),
      )
    }

    return [...displayedComponents].sort((left, right) => {
      const leftElevationMm = getSurfaceMountPlaneOffsetMm(scene, left.hostSurfaceId)
      const rightElevationMm = getSurfaceMountPlaneOffsetMm(scene, right.hostSurfaceId)

      if (leftElevationMm !== rightElevationMm) {
        return leftElevationMm - rightElevationMm
      }

      const leftSupportBoundsMm = inspectSceneComponentPlacement(scene, left).supportBoundsMm
      const rightSupportBoundsMm = inspectSceneComponentPlacement(scene, right).supportBoundsMm
      const leftAabb = getProjectedBoundsAabb(
        leftSupportBoundsMm,
        viewport,
        leftElevationMm,
      )
      const rightAabb = getProjectedBoundsAabb(
        rightSupportBoundsMm,
        viewport,
        rightElevationMm,
      )
      const leftBottomPx = leftAabb.y + leftAabb.height
      const rightBottomPx = rightAabb.y + rightAabb.height

      if (leftBottomPx !== rightBottomPx) {
        return leftBottomPx - rightBottomPx
      }

      return getDepth(left) - getDepth(right)
    })
  }, [displayedComponents, getDepth, scene, useProjectedTableView, viewport])
  const componentLabelPlacements = useMemo(
    () =>
      showLabels
        ? useProjectedTableView
          ? getProjectedComponentLabelPlacements({
              additionalObstacles: labelObstacles,
              components: orderedComponents,
              highlightedComponentIds,
              scene,
              selectedComponentId,
              viewport,
            })
          : getComponentLabelPlacements({
              additionalObstacles: labelObstacles,
              components: orderedComponents,
              highlightedComponentIds,
              renderMode,
              selectedComponentId,
              viewport,
            })
        : [],
    [
      highlightedComponentIds,
      labelObstacles,
      orderedComponents,
      renderMode,
      scene,
      selectedComponentId,
      showLabels,
      useProjectedTableView,
      viewport,
    ],
  )

  const resolveAnchorFromScreenPoint = useMemo(
    () =>
      (
        screenPointPx: ScreenPointPx,
        options?: {
          preferredElevationMm?: number
          preferredSurfaceId?: string
        },
      ) => {
        if (!useProjectedTableView) {
          return screenToWorld(screenPointPx, viewport)
        }

        return resolveProjectedScreenPointToWorld(scene, viewport, screenPointPx, options)
          .worldPointMm
      },
    [scene, useProjectedTableView, viewport],
  )

  const projectAnchorToScreenPoint = useMemo(
    () =>
      (anchorMm: { x: number; y: number }, elevationMm = 0) =>
        useProjectedTableView
          ? projectWorldPointToScreen(anchorMm, viewport, elevationMm)
          : worldToScreen(anchorMm, viewport),
    [useProjectedTableView, viewport],
  )

  const renderPreviewSupportBounds = (
    boundsMm: { x: number; y: number; width: number; height: number },
    stroke: string | undefined,
    elevationMm: number,
  ) =>
    useProjectedTableView ? (
      <Line
        closed
        dash={[5, 3]}
        fill="rgba(0, 0, 0, 0)"
        listening={false}
        points={getProjectedBoundsLinePoints(boundsMm, viewport, elevationMm)}
        stroke={stroke}
        strokeWidth={1}
      />
    ) : (
      <Rect
        dash={[5, 3]}
        fill="rgba(0, 0, 0, 0)"
        height={boundsMm.height * viewport.zoomPxPerMm}
        listening={false}
        stroke={stroke}
        strokeWidth={1}
        width={boundsMm.width * viewport.zoomPxPerMm}
        x={worldToScreen({ x: boundsMm.x, y: boundsMm.y }, viewport).x}
        y={worldToScreen({ x: boundsMm.x, y: boundsMm.y }, viewport).y}
      />
    )

  return (
    <Layer>
      {orderedComponents.map((component) => {
        const baseProps = {
          instance: component,
          isDragEnabled:
            !interactiveComponentIdSet || interactiveComponentIdSet.has(component.id)
              ? !isPanMode && !isLineTool && !isHighlightTool
              : false,
          isHighlighted: highlightedComponentIds?.includes(component.id),
          isHovered: component.id === hoveredComponentId,
          isSelected: component.id === selectedComponentId,
          onDragEnd:
            !interactiveComponentIdSet || interactiveComponentIdSet.has(component.id)
              ? (componentId: string, screenPointPx: ScreenPointPx) => {
                  onCommitComponentDrag(
                    componentId,
                    resolveAnchorFromScreenPoint(screenPointPx, {
                      preferredSurfaceId: component.hostSurfaceId,
                    }),
                  )
                }
              : undefined,
          onDragMove:
            !interactiveComponentIdSet || interactiveComponentIdSet.has(component.id)
              ? (componentId: string, screenPointPx: ScreenPointPx) => {
                  onUpdateComponentDrag(
                    componentId,
                    resolveAnchorFromScreenPoint(screenPointPx, {
                      preferredSurfaceId: component.hostSurfaceId,
                    }),
                  )
                }
              : undefined,
          onDragStart:
            !interactiveComponentIdSet || interactiveComponentIdSet.has(component.id)
              ? onBeginComponentDrag
              : undefined,
          onHoverChange:
            isPanMode ||
            (interactiveComponentIdSet !== undefined &&
              !interactiveComponentIdSet.has(component.id))
              ? undefined
              : onHoverComponent,
          onOpenContextMenu:
            onOpenComponentContextMenu &&
            (!interactiveComponentIdSet || interactiveComponentIdSet.has(component.id))
              ? (componentId: string, event: KonvaEventObject<MouseEvent | TouchEvent>) => {
                  if (!('clientX' in event.evt) || !('clientY' in event.evt)) {
                    return
                  }

                  onOpenComponentContextMenu(componentId, {
                    x: event.evt.clientX,
                    y: event.evt.clientY,
                  })
                }
              : undefined,
          onResize:
            isPanMode ||
            isLineTool ||
            isHighlightTool ||
            (interactiveComponentIdSet !== undefined &&
              !interactiveComponentIdSet.has(component.id))
              ? undefined
              : onResizeComponent,
          onSelect:
            isPanMode
              ? undefined
              : isHighlightTool
                ? undefined
              : isLineTool
                ? (_componentId: string, event?: KonvaEventObject<MouseEvent | TouchEvent>) =>
                    onLineToolClick?.(event)
                : interactiveComponentIdSet !== undefined &&
                    !interactiveComponentIdSet.has(component.id)
                  ? undefined
                  : onSelectComponent,
          placementStatus:
            dragPreview?.componentId === component.id
              ? previewPlacement?.status
              : undefined,
          renderMode,
          resolveDragPositionPx:
            snapMode === 'always'
              ? (screenPointPx: ScreenPointPx) => {
                  const candidateAnchorMm = resolveAnchorFromScreenPoint(screenPointPx, {
                    preferredSurfaceId: component.hostSurfaceId,
                  })
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

                  return projectAnchorToScreenPoint(
                    placement.resolvedAnchorMm,
                    getSurfaceMountPlaneOffsetMm(
                      scene,
                      candidateComponent.hostSurfaceId,
                    ),
                  )
                }
              : undefined,
          showLabels: false,
          showPostHolders,
          surfaceSupportCompensationMm: getSurfaceSupportCompensationMm(
            scene,
            component.hostSurfaceId,
          ),
          viewport,
        }

        return useProjectedTableView ? (
          <ProjectedComponentNode
            key={component.id}
            {...baseProps}
            surfaceElevationMm={getSurfaceMountPlaneOffsetMm(scene, component.hostSurfaceId)}
          />
        ) : (
          <ComponentNode
            key={component.id}
            {...baseProps}
            simpleGlyphAppearance={simpleGlyphAppearances?.[component.id]}
          />
        )
      })}

      {pendingPlacement && pendingPlacementResult ? (
        <>
          {useProjectedTableView ? (
            <ProjectedComponentNode
              instance={{
                ...pendingPlacement.draft,
                anchorMm: pendingPlacementResult.resolvedAnchorMm,
                rotationQuarterTurns: pendingPlacement.draft.rotationQuarterTurns,
              }}
              isPreview
              isSelected={false}
              placementStatus={pendingPlacementResult.status}
              renderMode={renderMode}
              showLabels={showLabels}
              surfaceElevationMm={getSurfaceMountPlaneOffsetMm(
                scene,
                pendingPlacement.draft.hostSurfaceId,
              )}
              surfaceSupportCompensationMm={getSurfaceSupportCompensationMm(
                scene,
                pendingPlacement.draft.hostSurfaceId,
              )}
              viewport={viewport}
            />
          ) : (
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
              showLabels={showLabels}
              simpleGlyphAppearance={simpleGlyphAppearances?.[pendingPlacement.draft.id]}
              surfaceSupportCompensationMm={getSurfaceSupportCompensationMm(
                scene,
                pendingPlacement.draft.hostSurfaceId,
              )}
              viewport={viewport}
            />
          )}

          {pendingPreviewHoleMm ? (
            <Circle
              fill="rgba(0, 0, 0, 0)"
              listening={false}
              radius={7}
              stroke={pendingPreviewAccent}
              strokeWidth={1.2}
              x={
                projectAnchorToScreenPoint(
                  pendingPreviewHoleMm,
                  getSurfaceMountPlaneOffsetMm(
                    scene,
                    pendingPlacement.draft.hostSurfaceId,
                  ),
                ).x
              }
              y={
                projectAnchorToScreenPoint(
                  pendingPreviewHoleMm,
                  getSurfaceMountPlaneOffsetMm(
                    scene,
                    pendingPlacement.draft.hostSurfaceId,
                  ),
                ).y
              }
            />
          ) : null}

          {renderPreviewSupportBounds(
            pendingPlacementResult.supportBoundsMm,
            pendingPreviewAccent,
            getSurfaceMountPlaneOffsetMm(scene, pendingPlacement.draft.hostSurfaceId),
          )}
        </>
      ) : null}

      {previewedComponent && previewPlacement ? (
        <>
          {useProjectedTableView ? (
            <ProjectedComponentNode
              instance={{
                ...previewedComponent,
                anchorMm: previewPlacement.resolvedAnchorMm,
                hostSurfaceId:
                  previewComponent?.hostSurfaceId ?? previewedComponent.hostSurfaceId,
              }}
              isPreview
              isSelected={false}
              placementStatus={previewPlacement.status}
              renderMode={renderMode}
              showLabels={showLabels}
              surfaceElevationMm={getSurfaceMountPlaneOffsetMm(
                scene,
                previewComponent?.hostSurfaceId ?? previewedComponent.hostSurfaceId,
              )}
              viewport={viewport}
            />
          ) : (
            <ComponentNode
              instance={{
                ...previewedComponent,
                anchorMm: previewPlacement.resolvedAnchorMm,
                hostSurfaceId:
                  previewComponent?.hostSurfaceId ?? previewedComponent.hostSurfaceId,
              }}
              isPreview
              isSelected={false}
              placementStatus={previewPlacement.status}
              renderMode={renderMode}
              showLabels={showLabels}
              simpleGlyphAppearance={simpleGlyphAppearances?.[previewedComponent.id]}
              viewport={viewport}
            />
          )}

          {previewHoleMm ? (
            <Circle
              fill="rgba(0, 0, 0, 0)"
              listening={false}
              radius={6}
              stroke={previewAccent}
              strokeWidth={1.2}
              x={
                projectAnchorToScreenPoint(
                  previewHoleMm,
                  getSurfaceMountPlaneOffsetMm(
                    scene,
                    previewComponent?.hostSurfaceId ?? previewedComponent.hostSurfaceId,
                  ),
                ).x
              }
              y={
                projectAnchorToScreenPoint(
                  previewHoleMm,
                  getSurfaceMountPlaneOffsetMm(
                    scene,
                    previewComponent?.hostSurfaceId ?? previewedComponent.hostSurfaceId,
                  ),
                ).y
              }
            />
          ) : null}

          {renderPreviewSupportBounds(
            previewPlacement.supportBoundsMm,
            previewAccent,
            getSurfaceMountPlaneOffsetMm(
              scene,
              previewComponent?.hostSurfaceId ?? previewedComponent.hostSurfaceId,
            ),
          )}
        </>
      ) : null}

      {componentLabelPlacements.map((label) => {
        const isSelected = label.id === selectedComponentId
        const isHighlighted = highlightedComponentIds?.includes(label.id)
        const needsLeader = label.side !== 'below'

        return (
          <Group key={`${label.id}-screen-label`}>
            {needsLeader ? (
              <Line
                dash={[4, 3]}
                listening={false}
                opacity={0.42}
                points={[
                  label.leaderStartPx.x,
                  label.leaderStartPx.y,
                  label.leaderEndPx.x,
                  label.leaderEndPx.y,
                ]}
                stroke={isHighlighted ? '#f5d28c' : '#a8c7d4'}
                strokeWidth={1}
              />
            ) : null}
            <Text
              align="center"
              fill={
                isSelected
                  ? 'rgba(244, 251, 255, 0.9)'
                  : isHighlighted
                    ? 'rgba(255, 242, 198, 0.88)'
                    : renderMode === 'simple'
                      ? 'rgba(236, 242, 247, 0.9)'
                      : 'rgba(230, 237, 242, 0.78)'
              }
              fontFamily="IBM Plex Sans, Avenir Next, Segoe UI, sans-serif"
              fontSize={label.fontSizePx}
              fontStyle={renderMode === 'simple' || isSelected || isHighlighted ? 'bold' : 'normal'}
              height={label.bounds.height}
              lineHeight={label.lineHeightPx / label.fontSizePx}
              listening={false}
              shadowBlur={5}
              shadowColor="#071016"
              shadowOpacity={0.82}
              text={label.lines.join('\n')}
              width={label.bounds.width}
              x={label.bounds.x}
              y={label.bounds.y}
            />
          </Group>
        )
      })}
    </Layer>
  )
})

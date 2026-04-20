import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KonvaEventObject } from 'konva/lib/Node'
import type Konva from 'konva'
import { Stage } from 'react-konva'
import {
  ANNOTATION_DRAG_GUIDE_THRESHOLD_MM,
  getAnnotationBoundsMm,
  getAnnotationOriginMm,
  translateAnnotation,
} from '../domain/annotations'
import { boundsFromPointsMm, screenToWorld, worldToScreen } from '../domain/geometry'
import { sortAnnotationsByZIndex } from '../domain/annotations'
import { getSourceGuideSnapshot, inspectSceneComponentPlacement } from '../domain/placement'
import { OPTICAL_TABLE_SURFACE_ID, SINGLE_BREADBOARD_SURFACE_ID } from '../domain/types'
import type {
  BeamTraceResult,
  GaussianTraceResult,
  ScreenPointPx,
  Vector2Mm,
} from '../domain/types'
import { useEditorStore } from '../state/editorStore'
import {
  getBreadboardInstances,
  getOpticalTable,
  getSurfaceMountPlaneOffsetMm,
  getWorkspacePrimaryBreadboard,
} from '../domain/workspace'
import { BoardFocusRenderer } from './renderers/BoardFocusRenderer'
import { TableViewRenderer } from './renderers/TableViewRenderer'
import {
  projectWorldPointToScreen,
  resolveProjectedScreenPointToWorld,
  shouldUseProjectedTableView,
} from './renderers/tableViewProjection'

interface AlignmentReference {
  axis: 'horizontal' | 'vertical'
  ownerId?: string
  rangeEnd: number
  rangeStart: number
  value: number
}

interface AlignmentResolution {
  guide?: { fromMm: Vector2Mm; toMm: Vector2Mm }
  offsetMm: number
}

const HIGHLIGHT_CAPTURE_THRESHOLD_MM = 4

function hasMeaningfulHighlightArea(startMm: Vector2Mm, endMm: Vector2Mm) {
  const boundsMm = boundsFromPointsMm(startMm, endMm)

  return (
    boundsMm.width >= HIGHLIGHT_CAPTURE_THRESHOLD_MM ||
    boundsMm.height >= HIGHLIGHT_CAPTURE_THRESHOLD_MM
  )
}

function getBoundsAlignmentAnchors(bounds: {
  height: number
  width: number
  x: number
  y: number
}) {
  return {
    horizontal: [
      { value: bounds.y, spanStart: bounds.x, spanEnd: bounds.x + bounds.width },
      {
        value: bounds.y + bounds.height / 2,
        spanStart: bounds.x,
        spanEnd: bounds.x + bounds.width,
      },
      {
        value: bounds.y + bounds.height,
        spanStart: bounds.x,
        spanEnd: bounds.x + bounds.width,
      },
    ],
    vertical: [
      { value: bounds.x, spanStart: bounds.y, spanEnd: bounds.y + bounds.height },
      {
        value: bounds.x + bounds.width / 2,
        spanStart: bounds.y,
        spanEnd: bounds.y + bounds.height,
      },
      {
        value: bounds.x + bounds.width,
        spanStart: bounds.y,
        spanEnd: bounds.y + bounds.height,
      },
    ],
  }
}

function resolveAlignmentForAxis(
  anchors: Array<{ spanEnd: number; spanStart: number; value: number }>,
  references: AlignmentReference[],
  axis: 'horizontal' | 'vertical',
) {
  let bestMatch: {
    anchor: { spanEnd: number; spanStart: number; value: number }
    deltaMm: number
    reference: AlignmentReference
  } | null = null

  for (const anchor of anchors) {
    for (const reference of references) {
      if (reference.axis !== axis) {
        continue
      }

      const deltaMm = reference.value - anchor.value
      const distanceMm = Math.abs(deltaMm)

      if (distanceMm > ANNOTATION_DRAG_GUIDE_THRESHOLD_MM) {
        continue
      }

      if (!bestMatch || distanceMm < Math.abs(bestMatch.deltaMm)) {
        bestMatch = {
          anchor,
          deltaMm,
          reference,
        }
      }
    }
  }

  if (!bestMatch) {
    return { offsetMm: 0 } satisfies AlignmentResolution
  }

  const dampedOffsetMm = bestMatch.deltaMm * 0.55
  const lineStart = Math.min(
    bestMatch.anchor.spanStart + dampedOffsetMm,
    bestMatch.reference.rangeStart,
  )
  const lineEnd = Math.max(
    bestMatch.anchor.spanEnd + dampedOffsetMm,
    bestMatch.reference.rangeEnd,
  )

  return {
    offsetMm: dampedOffsetMm,
    guide:
      axis === 'vertical'
        ? {
            fromMm: { x: bestMatch.reference.value, y: lineStart },
            toMm: { x: bestMatch.reference.value, y: lineEnd },
          }
        : {
            fromMm: { x: lineStart, y: bestMatch.reference.value },
            toMm: { x: lineEnd, y: bestMatch.reference.value },
          },
  } satisfies AlignmentResolution
}

interface SchemaStageProps {
  beamTrace: BeamTraceResult
  highlightedAnnotationIds?: string[]
  gaussianTrace: GaussianTraceResult
  highlightedBreadboardIds?: string[]
  highlightedComponentIds?: string[]
  highlightedInteractionIds?: string[]
  highlightedPathIds?: string[]
  onOpenAnnotationContextMenu?: (pointPx: ScreenPointPx) => void
  onOpenCanvasContextMenu?: (pointPx: ScreenPointPx) => void
  onOpenComponentContextMenu?: (pointPx: ScreenPointPx) => void
  showLabels?: boolean
  showPostHolders?: boolean
  onStageReady?: (stage: Konva.Stage | null) => void
}

export function SchemaStage({
  beamTrace,
  gaussianTrace,
  highlightedAnnotationIds = [],
  highlightedBreadboardIds = [],
  highlightedComponentIds = [],
  highlightedInteractionIds = [],
  highlightedPathIds = [],
  onOpenAnnotationContextMenu,
  onOpenCanvasContextMenu,
  onOpenComponentContextMenu,
  showLabels = true,
  showPostHolders = false,
  onStageReady,
}: SchemaStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<Konva.Stage | null>(null)
  const panStateRef = useRef<{
    didMove: boolean
    lastPointPx?: ScreenPointPx
  }>({
    didMove: false,
  })
  const pinchStateRef = useRef<{
    isActive: boolean
    previousDistancePx?: number
    previousMidpointPx?: ScreenPointPx
  }>({
    isActive: false,
  })
  const highlightGestureRef = useRef<{
    suppressNextEmptyClickReset: boolean
  }>({
    suppressNextEmptyClickReset: false,
  })
  const highlightDragRef = useRef<{
    startMm?: Vector2Mm
  }>({})
  const scene = useEditorStore((state) => state.scene)
  const primaryBreadboard = useMemo(() => getWorkspacePrimaryBreadboard(scene), [scene])
  const opticalTable = useMemo(() => getOpticalTable(scene), [scene])
  const breadboardInstances = useMemo(() => getBreadboardInstances(scene), [scene])
  const selection = useEditorStore((state) => state.selection)
  const snapMode = useEditorStore((state) => state.snapMode)
  const renderMode = useEditorStore((state) => state.renderMode)
  const simpleGlyphAppearances = useEditorStore(
    (state) => state.simpleGlyphAppearances,
  )
  const viewport = useEditorStore((state) => state.viewport)
  const interaction = useEditorStore((state) => state.interaction)
  const setViewportSize = useEditorStore((state) => state.setViewportSize)
  const panViewportByScreenDelta = useEditorStore(
    (state) => state.panViewportByScreenDelta,
  )
  const applyPinchViewport = useEditorStore((state) => state.applyPinchViewport)
  const zoomAtScreenPoint = useEditorStore((state) => state.zoomAtScreenPoint)
  const selectBreadboard = useEditorStore((state) => state.selectBreadboard)
  const selectOpticalTable = useEditorStore((state) => state.selectOpticalTable)
  const selectComponent = useEditorStore((state) => state.selectComponent)
  const selectAnnotation = useEditorStore((state) => state.selectAnnotation)
  const commitHighlightSelectionBounds = useEditorStore(
    (state) => state.commitHighlightSelectionBounds,
  )
  const beginComponentDrag = useEditorStore((state) => state.beginComponentDrag)
  const addShapeAnnotationAt = useEditorStore((state) => state.addShapeAnnotationAt)
  const addTextAnnotationAt = useEditorStore((state) => state.addTextAnnotationAt)
  const updatePendingPlacementAnchor = useEditorStore(
    (state) => state.updatePendingPlacementAnchor,
  )
  const updatePendingBreadboardAnchor = useEditorStore(
    (state) => state.updatePendingBreadboardAnchor,
  )
  const commitPendingPlacement = useEditorStore(
    (state) => state.commitPendingPlacement,
  )
  const commitPendingBreadboardPlacement = useEditorStore(
    (state) => state.commitPendingBreadboardPlacement,
  )
  const commitComponentDrag = useEditorStore((state) => state.commitComponentDrag)
  const updateSelectedGeometryOverride = useEditorStore(
    (state) => state.updateSelectedGeometryOverride,
  )
  const updateSelectedShapeAnnotation = useEditorStore(
    (state) => state.updateSelectedShapeAnnotation,
  )
  const updateSelectedTextAnnotation = useEditorStore(
    (state) => state.updateSelectedTextAnnotation,
  )
  const translateSelectedAnnotation = useEditorStore(
    (state) => state.translateSelectedAnnotation,
  )
  const startTextAnnotationEditing = useEditorStore(
    (state) => state.startTextAnnotationEditing,
  )
  const selectBeamSegment = useEditorStore((state) => state.selectBeamSegment)
  const clearBeamInspectionSelection = useEditorStore(
    (state) => state.clearBeamInspectionSelection,
  )
  const clearHighlightSelection = useEditorStore(
    (state) => state.clearHighlightSelection,
  )
  const startLineDrawAt = useEditorStore((state) => state.startLineDrawAt)
  const commitLineDraw = useEditorStore((state) => state.commitLineDraw)
  const beginBreadboardDrag = useEditorStore((state) => state.beginBreadboardDrag)
  const commitBreadboardDrag = useEditorStore((state) => state.commitBreadboardDrag)
  const setActiveTool = useEditorStore((state) => state.setActiveTool)
  const [hoveredComponentId, setHoveredComponentId] = useState<string>()
  const [hoveredBeamSegmentId, setHoveredBeamSegmentId] = useState<string>()
  const [cursorWorldMm, setCursorWorldMm] = useState<Vector2Mm>()
  const [isPointerPanning, setPointerPanning] = useState(false)
  const [dragPreview, setDragPreview] = useState<{
    componentId: string
    candidateAnchorMm: Vector2Mm
    componentIds?: string[]
    hostSurfaceId?: string
  }>()
  const [breadboardDragPreview, setBreadboardDragPreview] = useState<{
    breadboardId: string
    candidateAnchorMm: Vector2Mm
  }>()
  const [highlightDragStartMm, setHighlightDragStartMm] = useState<Vector2Mm>()
  const [highlightDragBoundsMm, setHighlightDragBoundsMm] = useState<{
    height: number
    width: number
    x: number
    y: number
  }>()
  const [annotationGuideLines, setAnnotationGuideLines] = useState<
    Array<{ fromMm: Vector2Mm; toMm: Vector2Mm }>
  >([])

  const getStagePointerWorldMm = (
    event?: KonvaEventObject<MouseEvent | TouchEvent>,
    options?: {
      preferredElevationMm?: number
      preferredSurfaceId?: string
    },
  ) => {
    const pointerPosition =
      event?.target.getStage()?.getPointerPosition() ??
      stageRef.current?.getPointerPosition()

    if (!pointerPosition) {
      return undefined
    }

    return resolveScreenPointToWorldMm(pointerPosition, options)
  }

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

  const effectiveDragPreview = dragPreview
  const effectiveBreadboardDragPreview = breadboardDragPreview
  const isPanMode = interaction.activeTool === 'pan' || interaction.isSpacePanning
  const isHighlightTool =
    interaction.activeTool === 'highlight' && !interaction.isSpacePanning
  const isLineTool = interaction.activeTool === 'line' && !interaction.isSpacePanning
  const isTextTool = interaction.activeTool === 'text' && !interaction.isSpacePanning
  const isShapeTool = interaction.activeTool === 'shape' && !interaction.isSpacePanning
  const isAnnotationPlacementTool = isLineTool || isTextTool || isShapeTool
  const sourceGuide = useMemo(() => {
    if (interaction.pendingPlacement?.draft.config.source) {
      return getSourceGuideSnapshot({
        candidateAnchorMm: interaction.pendingPlacement.candidateAnchorMm,
        scene,
        source: interaction.pendingPlacement.draft,
        targetId: interaction.pendingPlacement.draft.config.source.firstTargetComponentId,
      })
    }

    if (effectiveDragPreview) {
      const draggingSource = scene.components.find(
        (component) =>
          component.id === effectiveDragPreview.componentId &&
          component.config.source,
      )

      if (draggingSource?.config.source) {
        return getSourceGuideSnapshot({
          candidateAnchorMm: effectiveDragPreview.candidateAnchorMm,
          scene,
          source: draggingSource,
          targetId: draggingSource.config.source.firstTargetComponentId,
        })
      }
    }

    if (selection.type !== 'component') {
      return undefined
    }

    const selectedSource = scene.components.find(
      (component) =>
        component.id === selection.componentId && component.config.source,
    )

    if (!selectedSource?.config.source?.firstTargetComponentId) {
      return undefined
    }

    return getSourceGuideSnapshot({
      scene,
      source: selectedSource,
      targetId: selectedSource.config.source.firstTargetComponentId,
    })
  }, [
    effectiveDragPreview,
    interaction.pendingPlacement,
    scene,
    selection,
  ])
  const stageCursor = useMemo(() => {
    if (isPointerPanning) {
      return 'grabbing'
    }

    if (isPanMode) {
      return 'grab'
    }

    return 'crosshair'
  }, [isPanMode, isPointerPanning])
  const useProjectedTableView = useMemo(
    () =>
      shouldUseProjectedTableView(
        scene,
        renderMode,
        interaction.workspaceViewMode,
      ),
    [interaction.workspaceViewMode, renderMode, scene],
  )
  const resolveScreenPointToWorldMm = useCallback(
    (
      pointPx: ScreenPointPx,
      options?: {
        preferredElevationMm?: number
        preferredSurfaceId?: string
      },
    ) => {
      if (!useProjectedTableView) {
        return screenToWorld(pointPx, viewport)
      }

      return resolveProjectedScreenPointToWorld(scene, viewport, pointPx, options)
        .worldPointMm
    },
    [scene, useProjectedTableView, viewport],
  )
  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    ;(
      window as Window & {
        __SCHEMA_LAB_VIEW_TOOLS__?: {
          screenToWorld: (
            pointPx: ScreenPointPx,
            options?: { elevationMm?: number; surfaceId?: string },
          ) => Vector2Mm
          usesProjectedTableView: () => boolean
          worldToStage: (
            pointMm: Vector2Mm,
            options?: { elevationMm?: number; surfaceId?: string },
          ) => ScreenPointPx
        }
      }
    ).__SCHEMA_LAB_VIEW_TOOLS__ = {
      screenToWorld: (pointPx, options) =>
        resolveScreenPointToWorldMm(pointPx, {
          preferredElevationMm: options?.elevationMm,
          preferredSurfaceId: options?.surfaceId,
        }),
      usesProjectedTableView: () => useProjectedTableView,
      worldToStage: (pointMm, options) => {
        if (!useProjectedTableView) {
          return worldToScreen(pointMm, viewport)
        }

        return projectWorldPointToScreen(
          pointMm,
          viewport,
          options?.elevationMm ??
            (options?.surfaceId
              ? getSurfaceMountPlaneOffsetMm(scene, options.surfaceId)
              : 0),
        )
      },
    }
  }, [resolveScreenPointToWorldMm, scene, useProjectedTableView, viewport])
  const liveInteraction = useMemo(
    () => ({
      activeTool: interaction.activeTool,
      breadboardDragPreview: effectiveBreadboardDragPreview,
      cursorWorldMm,
      dragPreview: effectiveDragPreview,
      editingTextAnnotationId: interaction.editingTextAnnotationId,
      editingTextDraftText: interaction.editingTextDraftText,
      focusedBreadboardId: interaction.focusedBreadboardId,
      highlightDragBoundsMm,
      highlightSelection: interaction.highlightSelection,
      hoveredBeamSegmentId,
      hoveredComponentId,
      isSpacePanning: interaction.isSpacePanning,
      lineColor: interaction.lineColor,
      lineDrawStartMm: interaction.lineDrawStartMm,
      pendingBreadboardPlacement: interaction.pendingBreadboardPlacement,
      pendingPlacement: interaction.pendingPlacement,
      selectedBeamInteractionId: interaction.selectedBeamInteractionId,
      selectedBeamPathId: interaction.selectedBeamPathId,
      selectedBeamSegmentId: interaction.selectedBeamSegmentId,
      showBeamDetails: interaction.showBeamDetails,
    }),
    [
      cursorWorldMm,
      effectiveBreadboardDragPreview,
      effectiveDragPreview,
      highlightDragBoundsMm,
      hoveredBeamSegmentId,
      hoveredComponentId,
      interaction.activeTool,
      interaction.editingTextAnnotationId,
      interaction.editingTextDraftText,
      interaction.focusedBreadboardId,
      interaction.highlightSelection,
      interaction.isSpacePanning,
      interaction.lineColor,
      interaction.lineDrawStartMm,
      interaction.pendingBreadboardPlacement,
      interaction.pendingPlacement,
      interaction.selectedBeamInteractionId,
      interaction.selectedBeamPathId,
      interaction.selectedBeamSegmentId,
      interaction.showBeamDetails,
    ],
  )
  const belowBandAnnotations = useMemo(
    () =>
      sortAnnotationsByZIndex(
        scene.annotations.filter(
          (annotation) => !annotation.hidden && annotation.layerBand === 'below-components',
        ),
      ),
    [scene.annotations],
  )
  const aboveBandAnnotations = useMemo(
    () =>
      sortAnnotationsByZIndex(
        scene.annotations.filter(
          (annotation) => !annotation.hidden && annotation.layerBand === 'above-components',
        ),
      ),
    [scene.annotations],
  )
  const annotationAlignmentReferences = useMemo(() => {
    const references: AlignmentReference[] = []

    if (scene.workspace.kind === 'single-breadboard') {
      const bounds = {
        x: 0,
        y: 0,
        width: primaryBreadboard.widthMm,
        height: primaryBreadboard.heightMm,
      }
      const anchors = getBoundsAlignmentAnchors(bounds)

      references.push(
        ...anchors.vertical.map((anchor) => ({
          axis: 'vertical' as const,
          ownerId: SINGLE_BREADBOARD_SURFACE_ID,
          value: anchor.value,
          rangeStart: anchor.spanStart,
          rangeEnd: anchor.spanEnd,
        })),
        ...anchors.horizontal.map((anchor) => ({
          axis: 'horizontal' as const,
          ownerId: SINGLE_BREADBOARD_SURFACE_ID,
          value: anchor.value,
          rangeStart: anchor.spanStart,
          rangeEnd: anchor.spanEnd,
        })),
      )
    }

    if (opticalTable) {
      const tableBounds = {
        x: 0,
        y: 0,
        width: opticalTable.widthMm,
        height: opticalTable.heightMm,
      }
      const anchors = getBoundsAlignmentAnchors(tableBounds)
      references.push(
        ...anchors.vertical.map((anchor) => ({
          axis: 'vertical' as const,
          ownerId: 'optical-table',
          value: anchor.value,
          rangeStart: anchor.spanStart,
          rangeEnd: anchor.spanEnd,
        })),
        ...anchors.horizontal.map((anchor) => ({
          axis: 'horizontal' as const,
          ownerId: 'optical-table',
          value: anchor.value,
          rangeStart: anchor.spanStart,
          rangeEnd: anchor.spanEnd,
        })),
      )
    }

    for (const breadboard of breadboardInstances) {
      const bounds = {
        x: breadboard.anchorMm.x,
        y: breadboard.anchorMm.y,
        width: breadboard.model.widthMm,
        height: breadboard.model.heightMm,
      }
      const anchors = getBoundsAlignmentAnchors(bounds)
      references.push(
        ...anchors.vertical.map((anchor) => ({
          axis: 'vertical' as const,
          ownerId: breadboard.id,
          value: anchor.value,
          rangeStart: anchor.spanStart,
          rangeEnd: anchor.spanEnd,
        })),
        ...anchors.horizontal.map((anchor) => ({
          axis: 'horizontal' as const,
          ownerId: breadboard.id,
          value: anchor.value,
          rangeStart: anchor.spanStart,
          rangeEnd: anchor.spanEnd,
        })),
      )
    }

    for (const component of scene.components) {
      const bounds = inspectSceneComponentPlacement(scene, component).supportBoundsMm
      const anchors = getBoundsAlignmentAnchors(bounds)
      references.push(
        ...anchors.vertical.map((anchor) => ({
          axis: 'vertical' as const,
          ownerId: component.id,
          value: anchor.value,
          rangeStart: anchor.spanStart,
          rangeEnd: anchor.spanEnd,
        })),
        ...anchors.horizontal.map((anchor) => ({
          axis: 'horizontal' as const,
          ownerId: component.id,
          value: anchor.value,
          rangeStart: anchor.spanStart,
          rangeEnd: anchor.spanEnd,
        })),
      )
    }

    for (const annotation of scene.annotations) {
      if (annotation.hidden) {
        continue
      }

      const bounds = getAnnotationBoundsMm(annotation)
      const anchors = getBoundsAlignmentAnchors(bounds)
      references.push(
        ...anchors.vertical.map((anchor) => ({
          axis: 'vertical' as const,
          ownerId: annotation.id,
          value: anchor.value,
          rangeStart: anchor.spanStart,
          rangeEnd: anchor.spanEnd,
        })),
        ...anchors.horizontal.map((anchor) => ({
          axis: 'horizontal' as const,
          ownerId: annotation.id,
          value: anchor.value,
          rangeStart: anchor.spanStart,
          rangeEnd: anchor.spanEnd,
        })),
      )
    }

    for (const segment of beamTrace.segments) {
      if (Math.abs(segment.startMm.y - segment.endMm.y) <= 0.8) {
        references.push({
          axis: 'horizontal',
          ownerId: `beam:${segment.id}`,
          value: (segment.startMm.y + segment.endMm.y) / 2,
          rangeStart: Math.min(segment.startMm.x, segment.endMm.x),
          rangeEnd: Math.max(segment.startMm.x, segment.endMm.x),
        })
      }

      if (Math.abs(segment.startMm.x - segment.endMm.x) <= 0.8) {
        references.push({
          axis: 'vertical',
          ownerId: `beam:${segment.id}`,
          value: (segment.startMm.x + segment.endMm.x) / 2,
          rangeStart: Math.min(segment.startMm.y, segment.endMm.y),
          rangeEnd: Math.max(segment.startMm.y, segment.endMm.y),
        })
      }
    }

    return references
  }, [beamTrace.segments, breadboardInstances, opticalTable, primaryBreadboard, scene])

  const clearAnnotationGuides = useCallback(() => {
    setAnnotationGuideLines([])
  }, [])

  const resolveAnnotationDragPositionPx = useCallback(
    (annotationId: string, screenPointPx: ScreenPointPx) => {
      const baseAnnotation = scene.annotations.find(
        (annotation) =>
          annotation.id === annotationId &&
          annotation.kind !== 'line' &&
          !annotation.hidden,
      )

      if (!baseAnnotation || baseAnnotation.locked) {
        return screenPointPx
      }

      const candidateOriginMm = screenToWorld(screenPointPx, viewport)
      const baseOriginMm = getAnnotationOriginMm(baseAnnotation)
      const candidateAnnotation = translateAnnotation(baseAnnotation, {
        x: candidateOriginMm.x - baseOriginMm.x,
        y: candidateOriginMm.y - baseOriginMm.y,
      })
      const candidateBounds = getAnnotationBoundsMm(candidateAnnotation)
      const anchors = getBoundsAlignmentAnchors(candidateBounds)
      const relevantReferences = annotationAlignmentReferences.filter(
        (reference) => reference.ownerId !== annotationId,
      )
      const xResolution = resolveAlignmentForAxis(
        anchors.vertical,
        relevantReferences,
        'vertical',
      )
      const yResolution = resolveAlignmentForAxis(
        anchors.horizontal,
        relevantReferences,
        'horizontal',
      )

      setAnnotationGuideLines(
        [xResolution.guide, yResolution.guide].filter(
          (guide): guide is { fromMm: Vector2Mm; toMm: Vector2Mm } => Boolean(guide),
        ),
      )

      const adjustedAnnotation = translateAnnotation(candidateAnnotation, {
        x: xResolution.offsetMm,
        y: yResolution.offsetMm,
      })

      return worldToScreen(getAnnotationOriginMm(adjustedAnnotation), viewport)
    },
    [annotationAlignmentReferences, scene.annotations, viewport],
  )

  const preventNativeTouchDefault = (event: TouchEvent) => {
    if (event.cancelable) {
      event.preventDefault()
    }
  }

  const endPinchGesture = () => {
    pinchStateRef.current = {
      isActive: false,
      previousDistancePx: undefined,
      previousMidpointPx: undefined,
    }
  }

  const getTouchPointPx = (touch: Touch, element: HTMLDivElement): ScreenPointPx => {
    const rect = element.getBoundingClientRect()

    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    }
  }

  const getPinchSnapshot = (
    targetTouches: TouchList,
    element: HTMLDivElement,
  ) => {
    if (targetTouches.length < 2) {
      return undefined
    }

    const firstPointPx = getTouchPointPx(targetTouches[0]!, element)
    const secondPointPx = getTouchPointPx(targetTouches[1]!, element)
    const distancePx = Math.hypot(
      secondPointPx.x - firstPointPx.x,
      secondPointPx.y - firstPointPx.y,
    )

    if (!Number.isFinite(distancePx) || distancePx <= 0) {
      return undefined
    }

    return {
      distancePx,
      midpointPx: {
        x: (firstPointPx.x + secondPointPx.x) / 2,
        y: (firstPointPx.y + secondPointPx.y) / 2,
      },
    }
  }

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

    setCursorWorldMm(resolveScreenPointToWorldMm(pointerPosition))
  }

  const isBackgroundPanTarget = (
    event: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    let currentNode: Konva.Node | null = event.target

    while (currentNode) {
      if (
        ('hasName' in currentNode && currentNode.hasName('stage-background-hit')) ||
        ('hasName' in currentNode && currentNode.hasName('breadboard-hit'))
      ) {
        return true
      }

      currentNode = currentNode.getParent()
    }

    return event.target === event.target.getStage()
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

  const resolveClientPointToWorldMm = useCallback(
    (clientPoint: { x: number; y: number }) => {
      const stageContainer = stageRef.current?.container()

      if (!stageContainer) {
        return undefined
      }

      const stageRect = stageContainer.getBoundingClientRect()

      if (stageRect.width <= 0 || stageRect.height <= 0) {
        return undefined
      }

      return resolveScreenPointToWorldMm({
        x:
          ((clientPoint.x - stageRect.left) / stageRect.width) *
          viewport.canvasSizePx.width,
        y:
          ((clientPoint.y - stageRect.top) / stageRect.height) *
          viewport.canvasSizePx.height,
      })
    },
    [resolveScreenPointToWorldMm, viewport.canvasSizePx.height, viewport.canvasSizePx.width],
  )

  useEffect(() => {
    if (!isHighlightTool) {
      return
    }

    const finalizeHighlightFromClientPoint = (clientPoint?: { x: number; y: number }) => {
      const activeHighlightStartMm = highlightDragRef.current.startMm

      if (!activeHighlightStartMm) {
        return
      }

      const pointerMm = clientPoint
        ? resolveClientPointToWorldMm(clientPoint) ?? activeHighlightStartMm
        : activeHighlightStartMm

      highlightGestureRef.current.suppressNextEmptyClickReset = hasMeaningfulHighlightArea(
        activeHighlightStartMm,
        pointerMm,
      )
      commitHighlightSelectionBounds(activeHighlightStartMm, pointerMm)
      highlightDragRef.current.startMm = undefined
      setHighlightDragBoundsMm(undefined)
      setHighlightDragStartMm(undefined)
      clearAnnotationGuides()
    }

    const handleNativeMouseUp = (event: MouseEvent) => {
      finalizeHighlightFromClientPoint({
        x: event.clientX,
        y: event.clientY,
      })
    }

    const handleNativeTouchEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0]

      finalizeHighlightFromClientPoint(
        touch
          ? {
              x: touch.clientX,
              y: touch.clientY,
            }
          : undefined,
      )
    }

    window.addEventListener('mouseup', handleNativeMouseUp, true)
    window.addEventListener('touchend', handleNativeTouchEnd, true)
    window.addEventListener('touchcancel', handleNativeTouchEnd, true)

    return () => {
      window.removeEventListener('mouseup', handleNativeMouseUp, true)
      window.removeEventListener('touchend', handleNativeTouchEnd, true)
      window.removeEventListener('touchcancel', handleNativeTouchEnd, true)
    }
  }, [
    clearAnnotationGuides,
    commitHighlightSelectionBounds,
    isHighlightTool,
    resolveClientPointToWorldMm,
  ])

  useEffect(() => {
    const contentElement = containerRef.current?.querySelector('.konvajs-content')
    const listenerOptions = {
      capture: true,
      passive: false,
    } as const

    if (!(contentElement instanceof HTMLDivElement)) {
      return
    }

    const beginPinchGesture = (pinchSnapshot: {
      distancePx: number
      midpointPx: ScreenPointPx
    }) => {
      if (isPointerPanning) {
        stopPointerPan()
      }

      setHoveredComponentId(undefined)
      setHoveredBeamSegmentId(undefined)
      pinchStateRef.current = {
        isActive: true,
        previousDistancePx: pinchSnapshot.distancePx,
        previousMidpointPx: pinchSnapshot.midpointPx,
      }
    }

    const handleNativeTouchStart = (event: TouchEvent) => {
      const pinchSnapshot = getPinchSnapshot(event.touches, contentElement)

      if (pinchSnapshot) {
        preventNativeTouchDefault(event)
        beginPinchGesture(pinchSnapshot)
      }
    }

    const handleNativeTouchMove = (event: TouchEvent) => {
      const pinchSnapshot = getPinchSnapshot(event.touches, contentElement)
      if (!pinchSnapshot) {
        return
      }

      preventNativeTouchDefault(event)

      if (!pinchStateRef.current.isActive) {
        beginPinchGesture(pinchSnapshot)
        return
      }

      const previousDistancePx = pinchStateRef.current.previousDistancePx
      const previousMidpointPx = pinchStateRef.current.previousMidpointPx

      if (!previousDistancePx || !previousMidpointPx) {
        beginPinchGesture(pinchSnapshot)
        return
      }

      applyPinchViewport(
        previousMidpointPx,
        pinchSnapshot.midpointPx,
        pinchSnapshot.distancePx / previousDistancePx,
      )
      pinchStateRef.current = {
        isActive: true,
        previousDistancePx: pinchSnapshot.distancePx,
        previousMidpointPx: pinchSnapshot.midpointPx,
      }
    }

    const handleNativeTouchEnd = (event: TouchEvent) => {
      if (pinchStateRef.current.isActive && event.touches.length >= 2) {
        const pinchSnapshot = getPinchSnapshot(event.touches, contentElement)

        if (pinchSnapshot) {
          pinchStateRef.current = {
            isActive: true,
            previousDistancePx: pinchSnapshot.distancePx,
            previousMidpointPx: pinchSnapshot.midpointPx,
          }
          return
        }
      }

      endPinchGesture()
    }

    contentElement.addEventListener('touchstart', handleNativeTouchStart, listenerOptions)
    contentElement.addEventListener('touchmove', handleNativeTouchMove, listenerOptions)
    contentElement.addEventListener('touchend', handleNativeTouchEnd, listenerOptions)
    contentElement.addEventListener('touchcancel', handleNativeTouchEnd, listenerOptions)

    return () => {
      endPinchGesture()
      contentElement.removeEventListener(
        'touchstart',
        handleNativeTouchStart,
        listenerOptions,
      )
      contentElement.removeEventListener(
        'touchmove',
        handleNativeTouchMove,
        listenerOptions,
      )
      contentElement.removeEventListener(
        'touchend',
        handleNativeTouchEnd,
        listenerOptions,
      )
      contentElement.removeEventListener(
        'touchcancel',
        handleNativeTouchEnd,
        listenerOptions,
      )
    }
  }, [
    applyPinchViewport,
    isPointerPanning,
    setHoveredBeamSegmentId,
    setHoveredComponentId,
    viewport.canvasSizePx.height,
    viewport.canvasSizePx.width,
  ])

  const handleStagePointerDown = (
    event: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    if (
      event.evt instanceof TouchEvent &&
      (pinchStateRef.current.isActive || event.evt.touches.length !== 1)
    ) {
      return
    }

    updateCursorFromStage(event)

    if (isHighlightTool) {
      if (event.evt instanceof MouseEvent && event.evt.button !== 0) {
        return
      }

      const pointerMm = getStagePointerWorldMm(event)

      if (!pointerMm) {
        return
      }

      highlightGestureRef.current.suppressNextEmptyClickReset = false
      highlightDragRef.current.startMm = pointerMm
      event.evt.preventDefault()
      setHighlightDragStartMm(pointerMm)
      setHighlightDragBoundsMm({
        x: pointerMm.x,
        y: pointerMm.y,
        width: 0,
        height: 0,
      })
      return
    }

    if (
      event.evt instanceof TouchEvent &&
      !isPanMode &&
      !isBackgroundPanTarget(event)
    ) {
      return
    }

    if (!isPanMode && event.evt instanceof MouseEvent && event.evt.button !== 1) {
      return
    }

    event.evt.preventDefault()
    startPointerPan(event)
  }

  const handleStagePointerMove = (
    event: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    if (
      event.evt instanceof TouchEvent &&
      (pinchStateRef.current.isActive || event.evt.touches.length !== 1)
    ) {
      return
    }

    updateCursorFromStage(event)

    if (isHighlightTool) {
      const pointerMm = getStagePointerWorldMm(event)
      const activeHighlightStartMm =
        highlightDragRef.current.startMm ?? highlightDragStartMm

      if (pointerMm && activeHighlightStartMm) {
        setHighlightDragBoundsMm(boundsFromPointsMm(activeHighlightStartMm, pointerMm))
      }

      return
    }

    if (
      !isPointerPanning &&
      (interaction.pendingPlacement || interaction.pendingBreadboardPlacement) &&
      !isPanMode
    ) {
      const pointerPosition = event.target.getStage()?.getPointerPosition()

      if (pointerPosition) {
        const pointerWorldMm = interaction.pendingBreadboardPlacement
          ? resolveScreenPointToWorldMm(pointerPosition, {
              preferredElevationMm:
                interaction.pendingBreadboardPlacement.model.thicknessMm,
              preferredSurfaceId: OPTICAL_TABLE_SURFACE_ID,
            })
          : resolveScreenPointToWorldMm(pointerPosition, {
              preferredSurfaceId: interaction.pendingPlacement?.draft.hostSurfaceId,
            })

        if (interaction.pendingBreadboardPlacement) {
          updatePendingBreadboardAnchor(pointerWorldMm)
        } else {
          updatePendingPlacementAnchor(pointerWorldMm)
        }
      }
    }

    if (!isPointerPanning) {
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

    const activeHighlightStartMm =
      highlightDragRef.current.startMm ?? highlightDragStartMm

    if (isHighlightTool && activeHighlightStartMm) {
      const pointerMm = getStagePointerWorldMm(event) ?? activeHighlightStartMm
      highlightGestureRef.current.suppressNextEmptyClickReset = hasMeaningfulHighlightArea(
        activeHighlightStartMm,
        pointerMm,
      )
      commitHighlightSelectionBounds(activeHighlightStartMm, pointerMm)
      highlightDragRef.current.startMm = undefined
      setHighlightDragBoundsMm(undefined)
      setHighlightDragStartMm(undefined)
      clearAnnotationGuides()
      return
    }

    if (!isPointerPanning) {
      return
    }

    stopPointerPan()
    clearAnnotationGuides()
  }

  const handleAnnotationToolClick = (
    event?: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    const pointerMm = getStagePointerWorldMm(event)

    if (!pointerMm) {
      return
    }

    if (isLineTool) {
      if (interaction.lineDrawStartMm) {
        commitLineDraw(pointerMm)
      } else {
        startLineDrawAt(pointerMm)
      }
      return
    }

    if (isTextTool) {
      addTextAnnotationAt(pointerMm)
      return
    }

    if (isShapeTool) {
      addShapeAnnotationAt(pointerMm)
    }
  }

  const handleBackgroundSelect = (
    event?: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    if (event) {
      updateCursorFromStage(event)
    }

    if (isPanMode || panStateRef.current.didMove) {
      panStateRef.current.didMove = false
      return
    }

    if (isAnnotationPlacementTool) {
      handleAnnotationToolClick(event)
      return
    }

    if (isHighlightTool) {
      if (highlightGestureRef.current.suppressNextEmptyClickReset) {
        highlightGestureRef.current.suppressNextEmptyClickReset = false
        return
      }

      clearHighlightSelection()
      setActiveTool('select')
      clearBeamInspectionSelection()
      clearAnnotationGuides()
      if (scene.workspace.kind === 'optical-table') {
        selectOpticalTable()
        return
      }

      selectBreadboard(SINGLE_BREADBOARD_SURFACE_ID)
      return
    }

    if (interaction.pendingBreadboardPlacement) {
      clearBeamInspectionSelection()
      commitPendingBreadboardPlacement(
        getStagePointerWorldMm(event, {
          preferredElevationMm: interaction.pendingBreadboardPlacement.model.thicknessMm,
          preferredSurfaceId: OPTICAL_TABLE_SURFACE_ID,
        }),
      )
      return
    }

    if (interaction.pendingPlacement) {
      clearBeamInspectionSelection()
      commitPendingPlacement(
        getStagePointerWorldMm(event, {
          preferredSurfaceId: interaction.pendingPlacement.draft.hostSurfaceId,
        }),
      )
      return
    }

    clearBeamInspectionSelection()
    if (scene.workspace.kind === 'optical-table') {
      selectOpticalTable()
      clearAnnotationGuides()
      return
    }

    clearAnnotationGuides()
    selectBreadboard(SINGLE_BREADBOARD_SURFACE_ID)
  }

  const handleOpticalTableSelect = (
    event?: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    if (isPanMode || panStateRef.current.didMove) {
      panStateRef.current.didMove = false
      return
    }

    if (isAnnotationPlacementTool) {
      handleAnnotationToolClick(event)
      return
    }

    if (isHighlightTool) {
      if (highlightGestureRef.current.suppressNextEmptyClickReset) {
        highlightGestureRef.current.suppressNextEmptyClickReset = false
        return
      }

      clearHighlightSelection()
      setActiveTool('select')
      clearBeamInspectionSelection()
      clearAnnotationGuides()
      selectOpticalTable()
      return
    }

    if (interaction.pendingBreadboardPlacement) {
      clearBeamInspectionSelection()
      commitPendingBreadboardPlacement(
        getStagePointerWorldMm(event, {
          preferredElevationMm: interaction.pendingBreadboardPlacement.model.thicknessMm,
          preferredSurfaceId: OPTICAL_TABLE_SURFACE_ID,
        }),
      )
      return
    }

    if (interaction.pendingPlacement) {
      clearBeamInspectionSelection()
      commitPendingPlacement(
        getStagePointerWorldMm(event, {
          preferredSurfaceId: interaction.pendingPlacement.draft.hostSurfaceId,
        }),
      )
      return
    }

    clearBeamInspectionSelection()
    clearAnnotationGuides()
    selectOpticalTable()
  }

  const handleBreadboardSelect = (
    surfaceId: string,
    event?: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    if (isPanMode || panStateRef.current.didMove) {
      panStateRef.current.didMove = false
      return
    }

    if (isAnnotationPlacementTool) {
      handleAnnotationToolClick(event)
      return
    }

    if (isHighlightTool) {
      if (highlightGestureRef.current.suppressNextEmptyClickReset) {
        highlightGestureRef.current.suppressNextEmptyClickReset = false
        return
      }

      clearHighlightSelection()
      setActiveTool('select')
      clearBeamInspectionSelection()
      clearAnnotationGuides()
      selectBreadboard(surfaceId)
      return
    }

    if (interaction.pendingPlacement) {
      clearBeamInspectionSelection()
      commitPendingPlacement(
        getStagePointerWorldMm(event, {
          preferredSurfaceId: interaction.pendingPlacement.draft.hostSurfaceId,
        }),
      )
      return
    }

    clearBeamInspectionSelection()
    clearAnnotationGuides()
    selectBreadboard(surfaceId)
  }

  const handleBeginComponentDrag = useCallback(
    (componentId: string) => {
      beginComponentDrag(componentId)
      const nextDragPreview = useEditorStore.getState().interaction.dragPreview

      if (!nextDragPreview || nextDragPreview.componentId !== componentId) {
        return
      }

      setDragPreview(nextDragPreview)
    },
    [beginComponentDrag],
  )

  const handleUpdateComponentDrag = useCallback(
    (componentId: string, anchorMm: Vector2Mm) => {
      setDragPreview((currentPreview) => ({
        componentId,
        candidateAnchorMm: anchorMm,
        componentIds:
          currentPreview?.componentId === componentId
            ? currentPreview.componentIds
            : undefined,
      }))
    },
    [],
  )

  const handleCommitComponentDrag = useCallback(
    (componentId: string, anchorMm?: Vector2Mm) => {
      const nextAnchorMm =
        anchorMm ??
        (dragPreview?.componentId === componentId ? dragPreview.candidateAnchorMm : undefined)

      commitComponentDrag(componentId, nextAnchorMm)
      setDragPreview(undefined)
    },
    [commitComponentDrag, dragPreview],
  )

  const handleBeginBreadboardDrag = useCallback(
    (breadboardId: string) => {
      beginBreadboardDrag(breadboardId)
      const breadboard = breadboardInstances.find((item) => item.id === breadboardId)

      if (!breadboard) {
        return
      }

      setBreadboardDragPreview({
        breadboardId,
        candidateAnchorMm: breadboard.anchorMm,
      })
    },
    [beginBreadboardDrag, breadboardInstances],
  )

  const handleUpdateBreadboardDrag = useCallback(
    (breadboardId: string, anchorMm: Vector2Mm) => {
      setBreadboardDragPreview({
        breadboardId,
        candidateAnchorMm: anchorMm,
      })
    },
    [],
  )

  const handleCommitBreadboardDrag = useCallback(
    (breadboardId: string, anchorMm?: Vector2Mm) => {
      const nextAnchorMm =
        anchorMm ??
        (breadboardDragPreview?.breadboardId === breadboardId
          ? breadboardDragPreview.candidateAnchorMm
          : undefined)

      commitBreadboardDrag(breadboardId, nextAnchorMm)
      setBreadboardDragPreview(undefined)
    },
    [breadboardDragPreview, commitBreadboardDrag],
  )

  useEffect(() => {
    if (!isHighlightTool) {
      highlightGestureRef.current.suppressNextEmptyClickReset = false
      highlightDragRef.current.startMm = undefined
      setHighlightDragBoundsMm(undefined)
      setHighlightDragStartMm(undefined)
    }
  }, [isHighlightTool])
  const handleRendererAnnotationContextMenu = useCallback(
    (pointPx: ScreenPointPx) => {
      clearAnnotationGuides()
      onOpenAnnotationContextMenu?.(pointPx)
    },
    [onOpenAnnotationContextMenu],
  )
  const handleRendererComponentContextMenu = useCallback(
    (pointPx: ScreenPointPx) => {
      clearAnnotationGuides()
      onOpenComponentContextMenu?.(pointPx)
    },
    [onOpenComponentContextMenu],
  )
  const handleClearRendererInspectionState = useCallback(() => {
    clearBeamInspectionSelection()
    clearAnnotationGuides()
  }, [clearBeamInspectionSelection])
  const handleRendererTranslateAnnotation = useCallback(
    (annotationId: string, deltaMm: Vector2Mm) => {
      const selectedAnnotationId =
        selection.type === 'annotation' ? selection.annotationId : undefined

      if (selectedAnnotationId !== annotationId) {
        selectAnnotation(annotationId)
      }

      translateSelectedAnnotation(deltaMm)
    },
    [selectAnnotation, selection, translateSelectedAnnotation],
  )

  return (
    <div className="schema-stage" ref={containerRef} style={{ cursor: stageCursor }}>
      {viewport.canvasSizePx.width > 0 && viewport.canvasSizePx.height > 0 ? (
        <Stage
          ref={(stage) => {
            stageRef.current = stage
            onStageReady?.(stage)
          }}
          height={viewport.canvasSizePx.height}
          onContextMenu={(event) => {
            event.evt.preventDefault()

            if (
              !onOpenCanvasContextMenu ||
              !isBackgroundPanTarget(event) ||
              !('clientX' in event.evt) ||
              !('clientY' in event.evt)
            ) {
              return
            }

            onOpenCanvasContextMenu({
              x: event.evt.clientX,
              y: event.evt.clientY,
            })
          }}
          onMouseDown={handleStagePointerDown}
          onMouseLeave={() => {
            stopPointerPan()
            setCursorWorldMm(undefined)
            setHoveredComponentId(undefined)
            setHoveredBeamSegmentId(undefined)

            if (!dragPreview) {
              setDragPreview(undefined)
            }

            if (!breadboardDragPreview) {
              setBreadboardDragPreview(undefined)
            }

            if (
              !highlightDragRef.current.startMm &&
              !dragPreview &&
              !breadboardDragPreview
            ) {
              highlightGestureRef.current.suppressNextEmptyClickReset = false
              highlightDragRef.current.startMm = undefined
              setHighlightDragBoundsMm(undefined)
              setHighlightDragStartMm(undefined)
            }
          }}
          onMouseMove={handleStagePointerMove}
          onMouseUp={handleStagePointerUp}
          onTouchEnd={handleStagePointerUp}
          onTouchMove={handleStagePointerMove}
          onTouchStart={handleStagePointerDown}
          onWheel={handleWheel}
          width={viewport.canvasSizePx.width}
        >
          {scene.workspace.kind === 'single-breadboard' ? (
            <BoardFocusRenderer
              annotationGuideLines={annotationGuideLines}
              aboveBandAnnotations={aboveBandAnnotations}
              beamTrace={beamTrace}
              belowBandAnnotations={belowBandAnnotations}
              gaussianTrace={gaussianTrace}
              highlightedAnnotationIds={highlightedAnnotationIds}
              highlightedComponentIds={highlightedComponentIds}
              highlightedInteractionIds={highlightedInteractionIds}
              highlightedPathIds={highlightedPathIds}
              interaction={liveInteraction}
              onBackgroundSelect={handleBackgroundSelect}
              onAnnotationToolClick={handleAnnotationToolClick}
              onBeginComponentDrag={handleBeginComponentDrag}
              onCommitComponentDrag={handleCommitComponentDrag}
              onClearAnnotationGuides={clearAnnotationGuides}
              onClearBeamInspectionSelection={handleClearRendererInspectionState}
              onHoverBeamSegment={setHoveredBeamSegmentId}
              onHoverComponent={setHoveredComponentId}
              onLineToolClick={handleAnnotationToolClick}
              onOpenAnnotationContextMenu={handleRendererAnnotationContextMenu}
              onOpenComponentContextMenu={handleRendererComponentContextMenu}
              onSelectAnnotation={selectAnnotation}
              onSelectBeamSegment={selectBeamSegment}
              onSelectBreadboard={(_, event) => handleBackgroundSelect(event)}
              onSelectComponent={selectComponent}
              onStartTextEditing={startTextAnnotationEditing}
              onTranslateAnnotation={handleRendererTranslateAnnotation}
              onUpdateComponentDrag={handleUpdateComponentDrag}
              resolveAnnotationDragPositionPx={resolveAnnotationDragPositionPx}
              onUpdateSelectedGeometryOverride={updateSelectedGeometryOverride}
              onUpdateSelectedShapeAnnotation={updateSelectedShapeAnnotation}
              onUpdateSelectedTextAnnotation={updateSelectedTextAnnotation}
              renderMode={renderMode}
              scene={scene}
              selection={selection}
              showGaussianEnvelope={interaction.showGaussianEnvelope}
              showLabels={showLabels}
              showPostHolders={showPostHolders}
              simpleGlyphAppearances={simpleGlyphAppearances}
              sourceGuide={sourceGuide}
              snapMode={snapMode}
              viewport={viewport}
            />
          ) : (
            <TableViewRenderer
              annotationGuideLines={annotationGuideLines}
              aboveBandAnnotations={aboveBandAnnotations}
              beamTrace={beamTrace}
              belowBandAnnotations={belowBandAnnotations}
              gaussianTrace={gaussianTrace}
              highlightedAnnotationIds={highlightedAnnotationIds}
              highlightedBreadboardIds={highlightedBreadboardIds}
              highlightedComponentIds={highlightedComponentIds}
              highlightedInteractionIds={highlightedInteractionIds}
              highlightedPathIds={highlightedPathIds}
              interaction={liveInteraction}
              onBackgroundSelect={handleBackgroundSelect}
              onAnnotationToolClick={handleAnnotationToolClick}
              onBeginBreadboardDrag={handleBeginBreadboardDrag}
              onBeginComponentDrag={handleBeginComponentDrag}
              onCommitBreadboardDrag={handleCommitBreadboardDrag}
              onCommitComponentDrag={handleCommitComponentDrag}
              onClearAnnotationGuides={clearAnnotationGuides}
              onClearBeamInspectionSelection={handleClearRendererInspectionState}
              onHoverBeamSegment={setHoveredBeamSegmentId}
              onHoverComponent={setHoveredComponentId}
              onLineToolClick={handleAnnotationToolClick}
              onOpenAnnotationContextMenu={handleRendererAnnotationContextMenu}
              onOpenComponentContextMenu={handleRendererComponentContextMenu}
              onSelectAnnotation={selectAnnotation}
              onSelectBeamSegment={selectBeamSegment}
              onSelectBreadboard={handleBreadboardSelect}
              onSelectComponent={selectComponent}
              onSelectOpticalTable={handleOpticalTableSelect}
              onStartTextEditing={startTextAnnotationEditing}
              onTranslateAnnotation={handleRendererTranslateAnnotation}
              onUpdateBreadboardDrag={handleUpdateBreadboardDrag}
              onUpdateComponentDrag={handleUpdateComponentDrag}
              resolveAnnotationDragPositionPx={resolveAnnotationDragPositionPx}
              onUpdateSelectedGeometryOverride={updateSelectedGeometryOverride}
              onUpdateSelectedShapeAnnotation={updateSelectedShapeAnnotation}
              onUpdateSelectedTextAnnotation={updateSelectedTextAnnotation}
              renderMode={renderMode}
              scene={scene}
              selection={selection}
              showGaussianEnvelope={interaction.showGaussianEnvelope}
              showLabels={showLabels}
              showPostHolders={showPostHolders}
              simpleGlyphAppearances={simpleGlyphAppearances}
              sourceGuide={sourceGuide}
              snapMode={snapMode}
              viewport={viewport}
            />
          )}
        </Stage>
      ) : null}
    </div>
  )
}

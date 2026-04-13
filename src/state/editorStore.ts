import { create } from 'zustand'
import {
  clampAnnotationFontSizeMm,
  createDefaultShapeAnnotation,
  createDefaultTextAnnotation,
  DEFAULT_ANNOTATION_TEXT_VARIANT,
  DEFAULT_ANNOTATION_SHAPE_KIND,
  getAnnotationBoundsMm,
  getArrowAnnotationBoundsMm,
  moveAnnotationInStack,
  normalizeRectLikeBounds,
  reindexAnnotations,
  resizeShapeAnnotationBounds,
  resizeTextAnnotationWidth,
  rotateAnnotationAroundCenterQuarterTurns,
  stepShapeAnnotationSize,
  stepTextAnnotationWidth,
  translateAnnotation,
  updateAnnotationLayerBand,
  updateAnnotationLock,
  updateAnnotationVisibility,
  updateArrowAnnotationEndpoint,
} from '../domain/annotations'
import { getNearestBoardCenterHole } from '../domain/breadboard'
import {
  createBreadboardFromPreset,
  findBreadboardPresetId,
} from '../domain/breadboardPresets'
import {
  createDefaultComponentConfig,
  getComponentDefinition,
  getResolvedComponentSpec,
  getResolvedComponentSpecForInstance,
  isStageComponentType,
  isOpticalTarget,
  isPostMountedType,
  shouldIncludeDefaultMount,
  supportsMountToggle,
} from '../domain/componentCatalog'
import {
  clamp,
  applyPinchViewportTransform,
  boundsFromPointsMm,
  boundsIntersectMm,
  clampViewportToKeepBoundsVisible,
  fitZoomPxPerMm,
  getBoundsCenterMm,
  LIVE_SURFACE_DETAIL_MIN_ZOOM_PX_PER_MM,
  normalizeQuarterTurns,
  panViewportByScreenDelta as panViewportByDelta,
  rotateBoundsQuarterTurns,
  rotatePointAroundCenterQuarterTurns,
  roundMm,
  unionBoundsMm,
  zoomViewportAtScreenPoint,
} from '../domain/geometry'
import {
  applySourceGuideAssist,
  alignExternalSourceToTarget,
  inspectSceneComponentPlacement,
  findDuplicatePlacement,
  getSceneWorldBoundsMm,
  getSurfacePlacementModel,
  reconcileComponentAnchorForScene,
  resolveScenePlacement,
  annotateScenePlacementOccupancy,
} from '../domain/placement'
import { getDefaultBeamSettings, createEmptyScene } from '../domain/serialization'
import { getSourcePreset } from '../domain/sourcePresets'
import {
  componentLocalToWorld,
  convertSceneToOpticalTable,
  convertSceneToSingleBreadboard,
  componentWorldToLocal,
  createBreadboardInstance,
  createFreshOpticalTableWorkspace,
  getBreadboardAnchorForCenterMm,
  getBreadboardInstance,
  getBreadboardWorldBoundsMm,
  getComponentById,
  getComponentTreeIds,
  getDefaultSurfaceId,
  getWorkspaceWorldBoundsMm,
  resolveTopmostSurfaceIdAtWorldPoint,
  surfaceLocalToWorld,
  syncAttachedComponentTransforms,
  translateComponentWorld,
} from '../domain/workspace'
import {
  DEFAULT_SIMPLE_ICON_STYLE,
  parseSimpleIconStyle,
  type SimpleIconStyle,
} from './uiPreferences'
import type {
  ActiveTool,
  AnnotationLayerBand,
  AnnotationLine,
  AnnotationShapeKind,
  AnnotationText,
  AnnotationTextStyle,
  AnnotationTextVariant,
  BeamSplitterConfig,
  BboCrystalConfig,
  BoundsMm,
  BreadboardModel,
  CanvasSizePx,
  ComponentConfig,
  ComponentInstance,
  ComponentType,
  CurvedMirrorConfig,
  DelayLineConfig,
  FlipMirrorConfig,
  HighlightSelectionState,
  OpticalTableModel,
  IrisConfig,
  LensConfig,
  OpaConfig,
  PendingBreadboardPlacementState,
  PendingPlacementState,
  PolarizerConfig,
  QuarterTurn,
  RenderMode,
  SceneAnnotation,
  SceneBeamSettings,
  SceneDocument,
  ScreenPointPx,
  ShapeAnnotation,
  SnapMode,
  SourceConfig,
  SourceLane,
  TelescopeConfig,
  ToolbarMenu,
  Vector2Mm,
  ViewportState,
  WaveplateConfig,
  WorkspaceViewMode,
} from '../domain/types'
import { OPTICAL_TABLE_SURFACE_ID, SINGLE_BREADBOARD_SURFACE_ID } from '../domain/types'

export type SelectionState =
  | { type: 'breadboard'; surfaceId: string }
  | { type: 'optical-table' }
  | { type: 'annotation'; annotationId: string }
  | { type: 'component'; componentId: string }

type ComponentUpdate = Partial<
  Pick<
    ComponentInstance,
    'label' | 'anchorMm' | 'rotationQuarterTurns' | 'finishId' | 'materialId'
  >
>

interface ComponentConfigUpdate {
  source?: Partial<SourceConfig>
  beamSplitter?: Partial<BeamSplitterConfig>
  lens?: Partial<LensConfig>
  curvedMirror?: Partial<CurvedMirrorConfig>
  flipMirror?: Partial<FlipMirrorConfig>
  attenuator?: Partial<NonNullable<ComponentConfig['attenuator']>>
  polarizer?: Partial<PolarizerConfig>
  waveplate?: Partial<WaveplateConfig>
  iris?: Partial<IrisConfig>
  bboCrystal?: Partial<BboCrystalConfig>
  delayLine?: Partial<DelayLineConfig>
  telescope?: Partial<TelescopeConfig>
  opa?: Partial<OpaConfig>
  support?: {
    includeMount: boolean
  }
}

interface DragPreviewState {
  componentId: string
  candidateAnchorMm: Vector2Mm
  componentIds?: string[]
  hostSurfaceId?: string
}

interface BreadboardDragPreview {
  breadboardId: string
  candidateAnchorMm: Vector2Mm
}

export interface InteractionState {
  activeDragComponentId?: string
  breadboardDragPreview?: BreadboardDragPreview
  bottomToolbarOffsetPx?: ScreenPointPx
  dragPreview?: DragPreviewState
  editingTextAnnotationId?: string
  editingTextDraftText?: string
  highlightDragBoundsMm?: BoundsMm
  highlightDragStartMm?: Vector2Mm
  highlightSelection?: HighlightSelectionState
  pendingPlacement?: PendingPlacementState
  pendingBreadboardPlacement?: PendingBreadboardPlacementState
  focusedBreadboardId?: string
  hoveredComponentId?: string
  hoveredBeamSegmentId?: string
  cursorWorldMm?: Vector2Mm
  activeTool: ActiveTool
  isSpacePanning: boolean
  isPointerPanning: boolean
  showBeamDetails: boolean
  showGaussianEnvelope: boolean
  selectedBeamPathId?: string
  selectedBeamSegmentId?: string
  selectedBeamInteractionId?: string
  isHelpOpen: boolean
  isWarningsOpen: boolean
  selectedWarningId?: string
  activeHostSurfaceId?: string
  dismissedWarningIds: string[]
  notice?: string
  lineDrawStartMm?: Vector2Mm
  lineColor: string
  shapeToolKind: AnnotationShapeKind
  textToolVariant: AnnotationTextVariant
  workspaceViewMode: WorkspaceViewMode
}

interface WarningFilters {
  simple: boolean
  advanced: boolean
}

export interface SimpleGlyphAppearanceState {
  color: string
  scale: number
  weight: number
}

type MountVisibilityDefaults = Partial<Record<ComponentType, boolean>>

interface SceneHistorySnapshot {
  scene: SceneDocument
  selection: SelectionState
  activeHostSurfaceId?: string
}

interface SceneHistoryState {
  past: SceneHistorySnapshot[]
  future: SceneHistorySnapshot[]
  lastCommittedAtMs?: number
  lastMergeKey?: string
}

interface LoadSceneOptions {
  history?: 'record' | 'reset'
}

interface CommitSceneHistoryOptions {
  mergeKey?: string
}

export interface EditorStore {
  scene: SceneDocument
  selection: SelectionState
  snapMode: SnapMode
  viewport: ViewportState
  renderMode: RenderMode
  simpleIconStyle: SimpleIconStyle
  warningFilters: WarningFilters
  simpleGlyphAppearances: Record<string, SimpleGlyphAppearanceState>
  openToolbarMenu?: ToolbarMenu
  mountVisibilityDefaults: MountVisibilityDefaults
  interaction: InteractionState
  history: SceneHistoryState
  canUndo: boolean
  canRedo: boolean
  selectBreadboard: (surfaceId?: string) => void
  selectOpticalTable: () => void
  selectComponent: (componentId: string) => void
  selectAnnotation: (annotationId: string) => void
  setSnapMode: (snapMode: SnapMode) => void
  setActiveTool: (tool: ActiveTool) => void
  setSpacePanning: (isPressed: boolean) => void
  setPointerPanning: (isPanning: boolean) => void
  setHoveredComponentId: (componentId?: string) => void
  setHoveredBeamSegmentId: (segmentId?: string) => void
  setCursorWorldMm: (cursorWorldMm?: Vector2Mm) => void
  setShowBeamDetails: (showBeamDetails: boolean) => void
  setShowGaussianEnvelope: (showGaussianEnvelope: boolean) => void
  setRenderMode: (renderMode: RenderMode) => void
  setSimpleIconStyle: (simpleIconStyle: SimpleIconStyle) => void
  setWarningFilter: (tier: keyof WarningFilters, isEnabled: boolean) => void
  setOpenToolbarMenu: (menu?: ToolbarMenu) => void
  beginHighlightDrag: (startMm: Vector2Mm) => void
  updateHighlightDrag: (pointMm: Vector2Mm) => void
  commitHighlightDrag: (pointMm?: Vector2Mm) => void
  commitHighlightSelectionBounds: (startMm: Vector2Mm, endMm?: Vector2Mm) => void
  clearHighlightSelection: () => void
  selectBeamSegment: (segmentId: string, pathId: string, interactionId?: string) => void
  clearBeamInspectionSelection: () => void
  setHelpOpen: (isOpen: boolean) => void
  setWarningsOpen: (isOpen: boolean) => void
  setSelectedWarningId: (warningId?: string) => void
  setNotice: (notice?: string) => void
  clearNotice: () => void
  setBottomToolbarOffset: (offsetPx?: ScreenPointPx) => void
  setViewportSize: (canvasSizePx: CanvasSizePx) => void
  setViewport: (viewport: ViewportState) => void
  panViewportByScreenDelta: (deltaPx: ScreenPointPx) => void
  applyPinchViewport: (
    previousMidpointPx: ScreenPointPx,
    nextMidpointPx: ScreenPointPx,
    zoomFactor: number,
  ) => void
  zoomAtScreenPoint: (pointPx: ScreenPointPx, zoomFactor: number) => void
  resetViewport: () => void
  addComponent: (type: ComponentType, variantId?: string) => void
  addTextAnnotationAt: (anchorMm: Vector2Mm) => void
  addShapeAnnotationAt: (anchorMm: Vector2Mm) => void
  addBreadboardInstance: (presetId: string) => void
  updatePendingPlacementAnchor: (anchorMm: Vector2Mm) => void
  commitPendingPlacement: (anchorMm?: Vector2Mm) => void
  updatePendingBreadboardAnchor: (anchorMm: Vector2Mm) => void
  commitPendingBreadboardPlacement: (anchorMm?: Vector2Mm) => void
  beginBreadboardDrag: (breadboardId: string) => void
  updateBreadboardDrag: (breadboardId: string, anchorMm: Vector2Mm) => void
  commitBreadboardDrag: (breadboardId: string, anchorMm?: Vector2Mm) => void
  updateBreadboardPosition: (breadboardId: string, anchorMm: Vector2Mm) => void
  beginComponentDrag: (componentId: string) => void
  updateComponentDrag: (componentId: string, anchorMm: Vector2Mm) => void
  commitComponentDrag: (componentId: string, anchorMm?: Vector2Mm) => void
  cancelActiveInteraction: () => void
  deleteSelectedComponent: () => void
  duplicateSelectedComponent: () => void
  deleteSelectedAnnotation: () => void
  duplicateSelectedAnnotation: () => void
  clearSurfaceContent: (args: {
    surfaceId: string
    clearComponents: boolean
    clearShapes: boolean
    clearText: boolean
    clearLines: boolean
  }) => void
  updateSelectedComponent: (update: ComponentUpdate) => void
  updateSelectedVariant: (variantId: string) => void
  updateSelectedSource: (update: Partial<SourceConfig>) => void
  applySelectedSourcePreset: (presetId: SourceConfig['presetId']) => void
  alignSelectedSourceToTarget: () => void
  updateSelectedBeamSplitter: (update: Partial<BeamSplitterConfig>) => void
  updateSelectedLens: (update: Partial<LensConfig>) => void
  updateSelectedCurvedMirror: (update: Partial<CurvedMirrorConfig>) => void
  updateSelectedFlipMirror: (update: Partial<FlipMirrorConfig>) => void
  updateSelectedAttenuator: (update: Partial<ComponentConfig['attenuator']>) => void
  updateSelectedPolarizer: (update: Partial<PolarizerConfig>) => void
  updateSelectedWaveplate: (update: Partial<WaveplateConfig>) => void
  updateSelectedIris: (update: Partial<IrisConfig>) => void
  updateSelectedBboCrystal: (update: Partial<BboCrystalConfig>) => void
  updateSelectedDelayLine: (update: Partial<DelayLineConfig>) => void
  updateSelectedTelescope: (update: Partial<TelescopeConfig>) => void
  updateSelectedOpa: (update: Partial<OpaConfig>) => void
  updateSelectedSupport: (includeMount: boolean) => void
  updateSelectedGeometryOverride: (update: {
    widthMm?: number
    heightMm?: number
  }) => void
  updateSelectedTextAnnotation: (update: {
    anchorMm?: Vector2Mm
    backgroundColor?: string
    borderColor?: string
    tailMm?: Vector2Mm
    text?: string
    variant?: AnnotationTextVariant
    widthMm?: number
  }) => void
  updateSelectedTextStyle: (update: Partial<AnnotationTextStyle>) => void
  updateSelectedShapeAnnotation: (update: {
    boundsMm?: {
      x?: number
      y?: number
      width?: number
      height?: number
    }
    endMm?: Vector2Mm
    startMm?: Vector2Mm
  }) => void
  updateSelectedShapeStyle: (update: {
    fillColor?: string
    shapeKind?: ShapeAnnotation['shapeKind']
    strokeColor?: string
    strokeWidthMm?: number
  }) => void
  updateSelectedAnnotationVisibility: (hidden: boolean) => void
  updateSelectedAnnotationLock: (locked: boolean) => void
  updateSelectedAnnotationLayerBand: (layerBand: AnnotationLayerBand) => void
  moveSelectedAnnotationInStack: (
    direction: 'forward' | 'backward' | 'front' | 'back',
  ) => void
  stepSelectedAnnotationSize: (direction: 1 | -1) => void
  translateSelectedAnnotation: (deltaMm: Vector2Mm) => void
  setShapeToolKind: (shapeKind: AnnotationShapeKind) => void
  setTextToolVariant: (variant: AnnotationTextVariant) => void
  setTextAnnotationDraftText: (text: string) => void
  startTextAnnotationEditing: (annotationId: string) => void
  finishTextAnnotationEditing: (text?: string) => void
  cancelTextAnnotationEditing: () => void
  clearSelectedGeometryOverride: () => void
  updateSelectedPostHolderDiameter: (diameterMm: number) => void
  setSelectedSimpleIconStyleOverride: (
    simpleIconStyleOverride?: SimpleIconStyle,
  ) => void
  setSimpleGlyphAppearance: (
    componentId: string,
    update: Partial<SimpleGlyphAppearanceState>,
  ) => void
  applySupportToType: (type: ComponentType, includeMount: boolean) => void
  setMountDefaultForType: (type: ComponentType, includeMount: boolean) => void
  rotateSelectedComponent: (direction: -1 | 1) => void
  rotateHighlightSelection: (direction: -1 | 1) => void
  updateBreadboard: (update: Partial<BreadboardModel>) => void
  applyBreadboardPreset: (presetId: string) => void
  updateOpticalTable: (update: Partial<OpticalTableModel>) => void
  convertWorkspaceToOpticalTable: () => void
  createFreshOpticalTable: () => void
  convertWorkspaceToSingleBreadboard: (args: {
    breadboardId?: string
    createFresh?: boolean
  }) => void
  setWorkspaceViewMode: (workspaceViewMode: WorkspaceViewMode) => void
  setFocusedBreadboardId: (breadboardId?: string) => void
  setActiveHostSurfaceId: (surfaceId?: string) => void
  dismissWarning: (warningId: string) => void
  dismissVisibleWarnings: (warningIds: string[]) => void
  restoreDismissedWarnings: () => void
  updateBeamSettings: (update: Partial<SceneBeamSettings>) => void
  setLineColor: (color: string) => void
  startLineDrawAt: (startMm: Vector2Mm) => void
  commitLineDraw: (endMm: Vector2Mm) => void
  cancelLineDraw: () => void
  deleteAnnotationLine: (lineId: string) => void
  undo: () => void
  redo: () => void
  loadScene: (scene: SceneDocument, options?: LoadSceneOptions) => void
}

const DEFAULT_CANVAS_SIZE = { width: 1280, height: 820 }
const initialScene = createEmptyScene()
const MAX_SCENE_HISTORY_ENTRIES = 100
const HISTORY_COALESCE_WINDOW_MS = 750
const RENDER_MODE_STORAGE_KEY = 'schema-lab.render-mode'
const SIMPLE_ICON_STYLE_STORAGE_KEY = 'schema-lab.simple-icon-style'
const WARNING_FILTERS_STORAGE_KEY = 'schema-lab.warning-filters'
const MOUNT_DEFAULTS_STORAGE_KEY = 'schema-lab.mount-defaults'
const VIEWPORT_SIDE_PADDING_PX = 88
const VIEWPORT_TOP_PADDING_PX = 28
const SINGLE_BREADBOARD_VIEWPORT_TOP_PADDING_PX = 66
const SINGLE_BREADBOARD_DEFAULT_ZOOM_PX_PER_MM = 1.67
const VIEWPORT_BOTTOM_PADDING_PX = 156
const BOARD_LABEL_MARGIN_MM = 18
const DEFAULT_SIMPLE_GLYPH_APPEARANCE: SimpleGlyphAppearanceState = {
  color: '#f4fbff',
  scale: 1,
  weight: 1,
}

function clampSimpleGlyphAppearanceScale(value: number) {
  return clamp(roundMm(value), 0.72, 1.46)
}

function clampSimpleGlyphAppearanceWeight(value: number) {
  return clamp(roundMm(value), 0.7, 1.58)
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readLocalStorageValue(key: string) {
  if (!canUseLocalStorage()) {
    return undefined
  }

  return window.localStorage.getItem(key) ?? undefined
}

function writeLocalStorageValue(key: string, value: string) {
  if (!canUseLocalStorage()) {
    return
  }

  window.localStorage.setItem(key, value)
}

function readRenderMode() {
  const value = readLocalStorageValue(RENDER_MODE_STORAGE_KEY)

  return value === 'realistic' ? 'realistic' : 'simple'
}

function readSimpleIconStyle(): SimpleIconStyle {
  const value = readLocalStorageValue(SIMPLE_ICON_STYLE_STORAGE_KEY)

  return parseSimpleIconStyle(value) ?? DEFAULT_SIMPLE_ICON_STYLE
}

function readWarningFilters(): WarningFilters {
  const rawValue = readLocalStorageValue(WARNING_FILTERS_STORAGE_KEY)

  if (!rawValue) {
    return {
      simple: true,
      advanced: true,
    }
  }

  try {
    const parsedValue = JSON.parse(rawValue)

    return {
      simple:
        typeof parsedValue.simple === 'boolean' ? parsedValue.simple : true,
      advanced:
        typeof parsedValue.advanced === 'boolean' ? parsedValue.advanced : true,
    }
  } catch {
    return {
      simple: true,
      advanced: true,
    }
  }
}

function readMountVisibilityDefaults(): MountVisibilityDefaults {
  const rawValue = readLocalStorageValue(MOUNT_DEFAULTS_STORAGE_KEY)

  if (!rawValue) {
    return {}
  }

  try {
    const parsedValue = JSON.parse(rawValue)

    if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
      return {}
    }

    return Object.fromEntries(
      Object.entries(parsedValue).filter(
        ([componentType, includeMount]) =>
          typeof includeMount === 'boolean' &&
          supportsMountToggle(componentType as ComponentType),
      ),
    ) as MountVisibilityDefaults
  } catch {
    return {}
  }
}

function getSafeCanvasSize(canvasSizePx: CanvasSizePx = DEFAULT_CANVAS_SIZE) {
  return {
    width: canvasSizePx.width > 0 ? canvasSizePx.width : DEFAULT_CANVAS_SIZE.width,
    height: canvasSizePx.height > 0 ? canvasSizePx.height : DEFAULT_CANVAS_SIZE.height,
  }
}

function resolveWorkspaceViewModeForScene(
  scene: SceneDocument,
  workspaceViewMode?: WorkspaceViewMode,
): WorkspaceViewMode {
  if (scene.workspace.kind !== 'optical-table') {
    return 'board-focus'
  }

  if (scene.workspace.breadboards.length === 0) {
    return 'table-view'
  }

  return workspaceViewMode ?? 'table-view'
}

function resolveFocusedBreadboardIdForScene(
  scene: SceneDocument,
  args?: {
    activeHostSurfaceId?: string
    focusedBreadboardId?: string
    selection?: SelectionState
  },
) {
  if (scene.workspace.kind !== 'optical-table') {
    return SINGLE_BREADBOARD_SURFACE_ID
  }

  const selection = args?.selection
  const selectedComponentHostSurfaceId =
    selection?.type === 'component'
      ? scene.components.find(
          (component) => component.id === selection.componentId,
        )?.hostSurfaceId
      : undefined
  const requestedIds = [
    args?.focusedBreadboardId,
    selection?.type === 'breadboard' ? selection.surfaceId : undefined,
    selectedComponentHostSurfaceId,
    args?.activeHostSurfaceId,
  ]

  for (const candidateId of requestedIds) {
    if (
      candidateId &&
      candidateId !== OPTICAL_TABLE_SURFACE_ID &&
      scene.workspace.breadboards.some((breadboard) => breadboard.id === candidateId)
    ) {
      return candidateId
    }
  }

  return scene.workspace.breadboards[0]?.id
}

function getViewportFocusBoundsMm(
  scene: SceneDocument,
  workspaceViewMode: WorkspaceViewMode,
  focusedBreadboardId?: string,
) {
  if (scene.workspace.kind === 'single-breadboard') {
    return {
      x: 0,
      y: -BOARD_LABEL_MARGIN_MM,
      width: scene.workspace.breadboard.widthMm,
      height: scene.workspace.breadboard.heightMm + BOARD_LABEL_MARGIN_MM,
    }
  }

  if (workspaceViewMode === 'board-focus') {
    const focusedBreadboard = getBreadboardInstance(scene, focusedBreadboardId)

    if (focusedBreadboard) {
      const bounds = getBreadboardWorldBoundsMm(
        focusedBreadboard.model,
        focusedBreadboard.anchorMm,
        focusedBreadboard.rotationQuarterTurns,
      )

      return {
        x: bounds.x,
        y: bounds.y - BOARD_LABEL_MARGIN_MM,
        width: bounds.width,
        height: bounds.height + BOARD_LABEL_MARGIN_MM,
      }
    }
  }

  return getWorkspaceWorldBoundsMm(scene)
}

function createViewportForBoundsWithTopBias(
  boundsMm: { x: number; y: number; width: number; height: number },
  canvasSizePx: CanvasSizePx = DEFAULT_CANVAS_SIZE,
  preferredZoomPxPerMm?: number,
  topPaddingPx = VIEWPORT_TOP_PADDING_PX,
) {
  const safeCanvasSize = {
    width: canvasSizePx.width > 0 ? canvasSizePx.width : DEFAULT_CANVAS_SIZE.width,
    height: canvasSizePx.height > 0 ? canvasSizePx.height : DEFAULT_CANVAS_SIZE.height,
  }
  const availableWidthPx = Math.max(
    1,
    safeCanvasSize.width - VIEWPORT_SIDE_PADDING_PX * 2,
  )
  const availableHeightPx = Math.max(
    1,
    safeCanvasSize.height - topPaddingPx - VIEWPORT_BOTTOM_PADDING_PX,
  )
  const fitZoomPxPerMmForBounds = fitZoomPxPerMm(
    {
      width: boundsMm.width,
      height: boundsMm.height,
    },
    {
      width: availableWidthPx,
      height: availableHeightPx,
    },
    0,
  )
  const zoomPxPerMm =
    preferredZoomPxPerMm !== undefined
      ? preferredZoomPxPerMm
      : fitZoomPxPerMmForBounds
  const cameraCenterMm = {
    x: roundMm(boundsMm.x + boundsMm.width / 2),
    y: roundMm(
      boundsMm.y +
        (safeCanvasSize.height / 2 - topPaddingPx) / zoomPxPerMm,
    ),
  }

  return {
    zoomPxPerMm,
    cameraCenterMm,
    canvasSizePx: safeCanvasSize,
  }
}

function createViewportForScene(
  scene: SceneDocument,
  canvasSizePx: CanvasSizePx = DEFAULT_CANVAS_SIZE,
  options?: {
    focusedBreadboardId?: string
    workspaceViewMode?: WorkspaceViewMode
  },
): ViewportState {
  const safeCanvasSize = getSafeCanvasSize(canvasSizePx)
  const workspaceViewMode = resolveWorkspaceViewModeForScene(
    scene,
    options?.workspaceViewMode,
  )
  const focusedBreadboardId = resolveFocusedBreadboardIdForScene(scene, {
    focusedBreadboardId: options?.focusedBreadboardId,
  })
  const focusBounds = getViewportFocusBoundsMm(
    scene,
    workspaceViewMode,
    focusedBreadboardId,
  )
  const worldBounds = getSceneWorldBoundsMm(scene)
  const preferredZoomPxPerMm =
    scene.workspace.kind === 'single-breadboard'
      ? SINGLE_BREADBOARD_DEFAULT_ZOOM_PX_PER_MM
      : scene.workspace.kind === 'optical-table' && workspaceViewMode === 'table-view'
        ? LIVE_SURFACE_DETAIL_MIN_ZOOM_PX_PER_MM
        : undefined
  const topPaddingPx =
    scene.workspace.kind === 'single-breadboard'
      ? SINGLE_BREADBOARD_VIEWPORT_TOP_PADDING_PX
      : VIEWPORT_TOP_PADDING_PX
  const baseViewport = createViewportForBoundsWithTopBias(
    focusBounds,
    safeCanvasSize,
    preferredZoomPxPerMm,
    topPaddingPx,
  )
  const tableViewFocusedBreadboard = 
    scene.workspace.kind === 'optical-table' && workspaceViewMode === 'table-view'
      ? getBreadboardInstance(scene, focusedBreadboardId)
      : undefined
  const verticallyFramedViewport = tableViewFocusedBreadboard
    ? {
        ...baseViewport,
        cameraCenterMm: {
          ...baseViewport.cameraCenterMm,
          y: roundMm(
            tableViewFocusedBreadboard.anchorMm.y +
              tableViewFocusedBreadboard.model.heightMm / 2,
          ),
        },
      }
    : baseViewport
  const minimumZoomPxPerMm = fitZoomPxPerMm(
    {
      width: worldBounds.width,
      height: worldBounds.height,
    },
    safeCanvasSize,
  )

  return baseViewport.zoomPxPerMm > minimumZoomPxPerMm
    ? verticallyFramedViewport
    : {
        ...verticallyFramedViewport,
        zoomPxPerMm: minimumZoomPxPerMm,
      }
}

function clampViewportForActiveWorkspace(args: {
  interaction: InteractionState
  scene: SceneDocument
  selection: SelectionState
  viewport: ViewportState
}) {
  const tableViewViewportWidthMm = Math.max(
    1,
    args.viewport.canvasSizePx.width / args.viewport.zoomPxPerMm,
  )
  const tableViewViewportHeightMm = Math.max(
    1,
    args.viewport.canvasSizePx.height / args.viewport.zoomPxPerMm,
  )
  const tableViewEdgePaddingMm = {
    x: roundMm(tableViewViewportWidthMm),
    y: roundMm(tableViewViewportHeightMm),
  }
  const workspaceViewMode = resolveWorkspaceViewModeForScene(
    args.scene,
    args.interaction.workspaceViewMode,
  )
  const focusedBreadboardId = resolveFocusedBreadboardIdForScene(args.scene, {
    activeHostSurfaceId: args.interaction.activeHostSurfaceId,
    focusedBreadboardId: args.interaction.focusedBreadboardId,
    selection: args.selection,
  })
  const focusBounds = getViewportFocusBoundsMm(
    args.scene,
    workspaceViewMode,
    focusedBreadboardId,
  )

  return clampViewportToKeepBoundsVisible(
    args.viewport,
    focusBounds,
    args.scene.workspace.kind === 'optical-table' && workspaceViewMode === 'table-view'
      ? { edgePaddingMm: tableViewEdgePaddingMm }
      : undefined,
  )
}

function createComponentId(type: ComponentType) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${type}-${crypto.randomUUID().slice(0, 8)}`
  }

  return `${type}-${Math.random().toString(36).slice(2, 10)}`
}

function createAnnotationId(kind: SceneAnnotation['kind']) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${kind}-${crypto.randomUUID().slice(0, 8)}`
  }

  return `${kind}-${Math.random().toString(36).slice(2, 10)}`
}

function getNextAnnotationZIndex(scene: SceneDocument) {
  return scene.annotations.reduce(
    (maximum, annotation) => Math.max(maximum, annotation.zIndex),
    -1,
  ) + 1
}

function syncBreadboardPresetId(breadboard: BreadboardModel): BreadboardModel {
  return {
    ...breadboard,
    presetId: findBreadboardPresetId(breadboard),
  }
}

function getSelectedComponent(
  scene: SceneDocument,
  selection: SelectionState,
) {
  if (selection.type !== 'component') {
    return undefined
  }

  return scene.components.find((component) => component.id === selection.componentId)
}

function getSelectedAnnotation(
  scene: SceneDocument,
  selection: SelectionState,
) {
  if (selection.type !== 'annotation') {
    return undefined
  }

  return scene.annotations.find((annotation) => annotation.id === selection.annotationId)
}

function getSurfaceBoundsForClear(
  scene: SceneDocument,
  surfaceId: string,
): BoundsMm | undefined {
  if (scene.workspace.kind === 'single-breadboard') {
    return getBreadboardWorldBoundsMm(scene.workspace.breadboard)
  }

  if (surfaceId === OPTICAL_TABLE_SURFACE_ID) {
    return getBreadboardWorldBoundsMm({
      label: scene.workspace.table.label,
      widthMm: scene.workspace.table.widthMm,
      heightMm: scene.workspace.table.heightMm,
      holeSpacingMm: scene.workspace.table.holeSpacingMm,
      edgeMarginMm: scene.workspace.table.edgeMarginMm,
      thicknessMm: scene.workspace.table.thicknessMm,
      finish: 'clear-anodized',
      holeDensity: scene.workspace.table.holeDensity,
      counterborePattern: scene.workspace.table.counterborePattern,
    })
  }

  const breadboard = scene.workspace.breadboards.find((item) => item.id === surfaceId)

  return breadboard
    ? getBreadboardWorldBoundsMm(
        breadboard.model,
        breadboard.anchorMm,
        breadboard.rotationQuarterTurns,
      )
    : undefined
}

function doBoundsIntersect(left: BoundsMm, right: BoundsMm) {
  return !(
    left.x + left.width < right.x ||
    right.x + right.width < left.x ||
    left.y + left.height < right.y ||
    right.y + right.height < left.y
  )
}

function getDefaultSelection(scene: SceneDocument): SelectionState {
  if (scene.workspace.kind === 'optical-table') {
    return scene.workspace.breadboards[0]
      ? {
          type: 'breadboard',
          surfaceId: scene.workspace.breadboards[0].id,
        }
      : { type: 'optical-table' }
  }

  return {
    type: 'breadboard',
    surfaceId: getDefaultSurfaceId(scene),
  }
}

function resolveSelectionForScene(
  scene: SceneDocument,
  selection: SelectionState,
): SelectionState {
  if (selection.type === 'annotation') {
    return scene.annotations.some((annotation) => annotation.id === selection.annotationId)
      ? selection
      : getDefaultSelection(scene)
  }

  if (selection.type === 'component') {
    return scene.components.some((component) => component.id === selection.componentId)
      ? selection
      : getDefaultSelection(scene)
  }

  if (selection.type === 'optical-table') {
    return scene.workspace.kind === 'optical-table'
      ? selection
      : getDefaultSelection(scene)
  }

  if (scene.workspace.kind === 'single-breadboard') {
    return getDefaultSelection(scene)
  }

  return scene.workspace.breadboards.some(
    (breadboard) => breadboard.id === selection.surfaceId,
  )
    ? selection
    : getDefaultSelection(scene)
}

function resolveActiveHostSurfaceId(
  scene: SceneDocument,
  selection: SelectionState,
  activeHostSurfaceId?: string,
) {
  if (scene.workspace.kind === 'single-breadboard') {
    return getDefaultSurfaceId(scene)
  }

  if (activeHostSurfaceId === OPTICAL_TABLE_SURFACE_ID) {
    return OPTICAL_TABLE_SURFACE_ID
  }

  if (
    activeHostSurfaceId &&
    scene.workspace.breadboards.some((breadboard) => breadboard.id === activeHostSurfaceId)
  ) {
    return activeHostSurfaceId
  }

  if (
    selection.type === 'breadboard' &&
    scene.workspace.breadboards.some((breadboard) => breadboard.id === selection.surfaceId)
  ) {
    return selection.surfaceId
  }

  return getDefaultSurfaceId(scene)
}

function getOpticalTargetComponents(scene: SceneDocument) {
  return scene.components.filter((component) => isOpticalTarget(component.type))
}

function describePlacementReason(reason: string) {
  switch (reason) {
    case 'off-hole':
      return 'hole-mounted component is off the breadboard hole field'
    case 'support-outside-board':
      return 'mount support extends outside the allowed placement region'
    case 'footprint-overhang':
      return 'component footprint extends outside the breadboard or launch edge'
    case 'occupied':
      return 'mount envelope overlaps another component'
    case 'outside-source-lane':
      return 'external sources must stay on the chosen launch edge'
    case 'snap-preview':
      return 'drop here to capture the highlighted snap location'
    default:
      return undefined
  }
}

function resolvePlacementForScene(args: {
  candidateAnchorMm: Vector2Mm
  component: ComponentInstance
  rotationQuarterTurns?: QuarterTurn
  scene: SceneDocument
  snapMode: SnapMode
  phase: 'drag' | 'drop' | 'inspect'
}) {
  const { candidateAnchorMm, component, rotationQuarterTurns, scene, snapMode, phase } =
    args

  return annotateScenePlacementOccupancy({
    scene,
    component,
    components: scene.components,
    ignoreComponentId: component.id,
    hostSurfaceId: component.hostSurfaceId,
    result: resolveScenePlacement({
      scene,
      candidateAnchorMm,
      component,
      phase,
      rotationQuarterTurns,
      snapMode,
    }),
  })
}

function isBoundsWithinBounds(boundsMm: BoundsMm, containerMm: BoundsMm) {
  return (
    boundsMm.x >= containerMm.x &&
    boundsMm.y >= containerMm.y &&
    boundsMm.x + boundsMm.width <= containerMm.x + containerMm.width &&
    boundsMm.y + boundsMm.height <= containerMm.y + containerMm.height
  )
}

function clampAttachedAnchorToSeat(
  seatBoundsMm: BoundsMm,
  rotatedSupportBoundsMm: BoundsMm,
  localAnchorMm: Vector2Mm,
) {
  const minX = seatBoundsMm.x - rotatedSupportBoundsMm.x
  const maxX =
    seatBoundsMm.x + seatBoundsMm.width - rotatedSupportBoundsMm.x - rotatedSupportBoundsMm.width
  const minY = seatBoundsMm.y - rotatedSupportBoundsMm.y
  const maxY =
    seatBoundsMm.y + seatBoundsMm.height - rotatedSupportBoundsMm.y - rotatedSupportBoundsMm.height

  return {
    x: roundMm(clamp(localAnchorMm.x, Math.min(minX, maxX), Math.max(minX, maxX))),
    y: roundMm(clamp(localAnchorMm.y, Math.min(minY, maxY), Math.max(minY, maxY))),
  }
}

function resolveStageAttachmentCandidate(args: {
  candidateAnchorMm: Vector2Mm
  component: ComponentInstance
  lockedParentComponentId?: string
  lockedSiteId?: string
  scene: SceneDocument
}) {
  const { candidateAnchorMm, component, lockedParentComponentId, lockedSiteId, scene } =
    args
  const componentSpec = getResolvedComponentSpecForInstance(component)

  if (componentSpec.mount.mode !== 'clamp-capable') {
    return undefined
  }

  const excludedIds = new Set(getComponentTreeIds(scene, component.id))
  const parentCandidates = lockedParentComponentId
    ? [getComponentById(scene, lockedParentComponentId)].filter(
        (candidate): candidate is ComponentInstance => Boolean(candidate),
      )
    : scene.components.filter(
        (candidate) =>
          isStageComponentType(candidate.type) && !excludedIds.has(candidate.id),
      )
  let bestMatch:
    | {
        attachment: NonNullable<ComponentInstance['attachment']>
        hostSurfaceId?: string
        anchorMm: Vector2Mm
        distanceScore: number
        rotationQuarterTurns: QuarterTurn
      }
    | undefined

  for (const parent of parentCandidates) {
    const parentSpec = getResolvedComponentSpecForInstance(parent)

    for (const mountSite of parentSpec.mountSites) {
      if (lockedSiteId && mountSite.id !== lockedSiteId) {
        continue
      }

      if (!mountSite.allowedChildMountModes.includes(componentSpec.mount.mode)) {
        continue
      }

      if (
        mountSite.allowedChildTypes &&
        !mountSite.allowedChildTypes.includes(component.type)
      ) {
        continue
      }

      const seatOccupant = scene.components.find(
        (candidate) =>
          candidate.id !== component.id &&
          candidate.attachment?.parentComponentId === parent.id &&
          candidate.attachment.parentMountSiteId === mountSite.id,
      )

      if (seatOccupant) {
        continue
      }

      const localRotationQuarterTurns = normalizeQuarterTurns(
        component.rotationQuarterTurns - parent.rotationQuarterTurns,
      ) as QuarterTurn
      const localSupportBoundsMm = rotateBoundsQuarterTurns(
        componentSpec.mount.supportBoundsMm,
        localRotationQuarterTurns,
      )
      const unclampedLocalAnchorMm = componentWorldToLocal(
        scene,
        parent.id,
        candidateAnchorMm,
      )
      const localAnchorMm =
        lockedParentComponentId && lockedSiteId
          ? clampAttachedAnchorToSeat(
              mountSite.seatBoundsMm,
              localSupportBoundsMm,
              unclampedLocalAnchorMm,
            )
          : unclampedLocalAnchorMm
      const placedSupportBoundsMm = {
        x: roundMm(localAnchorMm.x + localSupportBoundsMm.x),
        y: roundMm(localAnchorMm.y + localSupportBoundsMm.y),
        width: localSupportBoundsMm.width,
        height: localSupportBoundsMm.height,
      }

      if (!isBoundsWithinBounds(placedSupportBoundsMm, mountSite.seatBoundsMm)) {
        continue
      }

      const worldAnchorMm = componentLocalToWorld(scene, parent.id, localAnchorMm)
      const seatCenterMm = componentLocalToWorld(
        scene,
        parent.id,
        mountSite.defaultLocalAnchorMm,
      )
      const distanceScore = Math.hypot(
        seatCenterMm.x - candidateAnchorMm.x,
        seatCenterMm.y - candidateAnchorMm.y,
      )
      const attachment = {
        parentComponentId: parent.id,
        parentMountSiteId: mountSite.id,
        localAnchorMm,
        localRotationQuarterTurns,
      }
      const resolvedRotationQuarterTurns = normalizeQuarterTurns(
        parent.rotationQuarterTurns + localRotationQuarterTurns,
      ) as QuarterTurn

      if (!bestMatch || distanceScore < bestMatch.distanceScore) {
        bestMatch = {
          attachment,
          hostSurfaceId: parent.hostSurfaceId,
          anchorMm: worldAnchorMm,
          distanceScore,
          rotationQuarterTurns: resolvedRotationQuarterTurns,
        }
      }
    }
  }

  return bestMatch
}

function resolveComponentHostSurfaceIdAtPoint(
  scene: SceneDocument,
  component: Pick<ComponentInstance, 'hostSurfaceId'>,
  candidateAnchorMm: Vector2Mm,
) {
  if (scene.workspace.kind !== 'optical-table') {
    return getDefaultSurfaceId(scene)
  }

  return (
    resolveTopmostSurfaceIdAtWorldPoint(scene, candidateAnchorMm) ??
    component.hostSurfaceId ??
    getDefaultSurfaceId(scene)
  )
}

function retargetComponentHostSurfaceAtPoint(
  scene: SceneDocument,
  component: ComponentInstance,
  candidateAnchorMm: Vector2Mm,
): ComponentInstance {
  return {
    ...component,
    hostSurfaceId: resolveComponentHostSurfaceIdAtPoint(
      scene,
      component,
      candidateAnchorMm,
    ),
  }
}

function getSurfaceCenterAnchorMm(
  scene: SceneDocument,
  surfaceId: string | undefined,
) {
  const surface = getSurfacePlacementModel(scene, surfaceId)
  const centerMm = getNearestBoardCenterHole(surface.breadboard)

  return surfaceLocalToWorld(scene, surface.hostSurfaceId, centerMm)
}

function reconcileComponentsToScene(
  components: ComponentInstance[],
  scene: SceneDocument,
) {
  const nextScene = syncAttachedComponentTransforms({
    ...scene,
    components: components.map((component) =>
      component.attachment
        ? component
        : {
            ...component,
            anchorMm: reconcileComponentAnchorForScene(component, scene),
          },
    ),
  })

  return nextScene.components
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createAutoNumberedLabel(
  components: ComponentInstance[],
  type: ComponentType,
  variantId?: string,
) {
  const baseLabel =
    type === 'mirror' && variantId === 'flip-mirror'
      ? 'Flip Mirror'
      : getComponentDefinition(type).defaultLabel
  const pattern = new RegExp(`^${escapeRegExp(baseLabel)}(?: (\\d+))?$`)
  let highestIndex = 0

  for (const component of components) {
    const match = component.label.match(pattern)

    if (!match) {
      continue
    }

    highestIndex = Math.max(
      highestIndex,
      match[1] ? Number(match[1]) : 1,
    )
  }

  return `${baseLabel} ${highestIndex + 1}`
}

function createAutoNumberedBreadboardLabel(scene: SceneDocument) {
  if (scene.workspace.kind !== 'optical-table') {
    return 'Breadboard 1'
  }

  const pattern = /^Breadboard(?: (\d+))?$/
  let highestIndex = 0

  for (const breadboard of scene.workspace.breadboards) {
    const match = breadboard.label.match(pattern)

    if (!match) {
      continue
    }

    highestIndex = Math.max(highestIndex, match[1] ? Number(match[1]) : 1)
  }

  return `Breadboard ${highestIndex + 1}`
}

function clearHighlightInteractionState(interaction: InteractionState): InteractionState {
  return {
    ...interaction,
    highlightDragBoundsMm: undefined,
    highlightDragStartMm: undefined,
    highlightSelection: undefined,
  }
}

function createHighlightSelectionFromBounds(
  scene: SceneDocument,
  captureBoundsMm: BoundsMm,
): HighlightSelectionState | undefined {
  const breadboardIds =
    scene.workspace.kind === 'optical-table'
      ? scene.workspace.breadboards
          .filter((breadboard) =>
            boundsIntersectMm(
              getBreadboardWorldBoundsMm(
                breadboard.model,
                breadboard.anchorMm,
                breadboard.rotationQuarterTurns,
              ),
              captureBoundsMm,
            ),
          )
          .map((breadboard) => breadboard.id)
      : []
  const breadboardIdSet = new Set(breadboardIds)
  const componentIds: string[] = []

  for (const component of scene.components) {
    const componentBoundsMm = inspectSceneComponentPlacement(scene, component).supportBoundsMm

    if (
      (component.hostSurfaceId && breadboardIdSet.has(component.hostSurfaceId)) ||
      boundsIntersectMm(componentBoundsMm, captureBoundsMm)
    ) {
      componentIds.push(component.id)
    }
  }

  const annotationIds = scene.annotations
    .filter(
      (annotation) =>
        !annotation.hidden &&
        !annotation.locked &&
        boundsIntersectMm(getAnnotationBoundsMm(annotation), captureBoundsMm),
    )
    .map((annotation) => annotation.id)

  const selectionBoundsMm = unionBoundsMm([
    ...breadboardIds.map((breadboardId) => {
      const breadboard = getBreadboardInstance(scene, breadboardId)

      return breadboard
        ? getBreadboardWorldBoundsMm(
            breadboard.model,
            breadboard.anchorMm,
            breadboard.rotationQuarterTurns,
          )
        : undefined
    }),
    ...componentIds.map((componentId) => {
      const component = scene.components.find((candidate) => candidate.id === componentId)
      return component
        ? inspectSceneComponentPlacement(scene, component).supportBoundsMm
        : undefined
    }),
    ...annotationIds.map((annotationId) => {
      const annotation = scene.annotations.find((candidate) => candidate.id === annotationId)
      return annotation ? getAnnotationBoundsMm(annotation) : undefined
    }),
  ].filter((boundsMm): boundsMm is BoundsMm => Boolean(boundsMm)))

  if (!selectionBoundsMm) {
    return undefined
  }

  return {
    annotationIds,
    boundsMm: selectionBoundsMm,
    breadboardIds,
    componentIds,
  }
}

function getHighlightSelectionBounds(
  scene: SceneDocument,
  highlightSelection: HighlightSelectionState,
): BoundsMm | undefined {
  return unionBoundsMm([
    ...highlightSelection.breadboardIds.map((breadboardId) => {
      const breadboard = getBreadboardInstance(scene, breadboardId)
      return breadboard
        ? getBreadboardWorldBoundsMm(
            breadboard.model,
            breadboard.anchorMm,
            breadboard.rotationQuarterTurns,
          )
        : undefined
    }),
    ...highlightSelection.componentIds.map((componentId) => {
      const component = scene.components.find((candidate) => candidate.id === componentId)
      return component
        ? inspectSceneComponentPlacement(scene, component).supportBoundsMm
        : undefined
    }),
    ...highlightSelection.annotationIds.map((annotationId) => {
      const annotation = scene.annotations.find((candidate) => candidate.id === annotationId)
      return annotation ? getAnnotationBoundsMm(annotation) : undefined
    }),
  ].filter((boundsMm): boundsMm is BoundsMm => Boolean(boundsMm)))
}

function resolveDraggedComponentIds(
  scene: SceneDocument,
  interaction: InteractionState,
  component: ComponentInstance,
) {
  const highlightedComponentIds = interaction.highlightSelection?.componentIds ?? []

  if (!highlightedComponentIds.includes(component.id)) {
    return [component.id]
  }

  const resolvedIds =
    scene.workspace.kind === 'optical-table'
      ? highlightedComponentIds.filter((componentId) => {
          const candidate = scene.components.find((item) => item.id === componentId)
          return candidate?.hostSurfaceId === component.hostSurfaceId
        })
      : highlightedComponentIds
  const resolvedIdSet = new Set(resolvedIds)
  const collapsedIds = resolvedIds.filter((componentId) => {
    let current = getComponentById(scene, componentId)

    while (current?.attachment?.parentComponentId) {
      if (resolvedIdSet.has(current.attachment.parentComponentId)) {
        return false
      }

      current = getComponentById(scene, current.attachment.parentComponentId)
    }

    return true
  })

  return collapsedIds.length > 0 ? collapsedIds : [component.id]
}

function applyMountVisibilityDefault(
  component: ComponentInstance,
  mountVisibilityDefaults: MountVisibilityDefaults,
) {
  if (!supportsMountToggle(component.type)) {
    return component
  }

  const includeMount =
    mountVisibilityDefaults[component.type] ??
    shouldIncludeDefaultMount(component)

  return {
    ...component,
    config: {
      ...component.config,
      support: {
        includeMount,
      },
    },
  }
}

function normalizeGeometryOverride(
  component: ComponentInstance,
  update: {
    widthMm?: number
    heightMm?: number
  },
) {
  const baseSpec = getResolvedComponentSpec(component.type, component.variantId)
  const minimumWidthMm = Math.max(6, baseSpec.footprintBoundsMm.width * 0.35)
  const minimumHeightMm = Math.max(6, baseSpec.footprintBoundsMm.height * 0.35)
  const requestedWidthMm = update.widthMm ?? component.geometryOverride?.widthMm
  const requestedHeightMm =
    update.heightMm ?? component.geometryOverride?.heightMm
  const normalizedWidthMm =
    requestedWidthMm !== undefined
      ? roundMm(Math.max(minimumWidthMm, requestedWidthMm))
      : undefined
  const normalizedHeightMm =
    requestedHeightMm !== undefined
      ? roundMm(Math.max(minimumHeightMm, requestedHeightMm))
      : undefined
  const widthOverrideMm =
    normalizedWidthMm !== undefined &&
    Math.abs(normalizedWidthMm - baseSpec.footprintBoundsMm.width) > 0.01
      ? normalizedWidthMm
      : undefined
  const heightOverrideMm =
    normalizedHeightMm !== undefined &&
    Math.abs(normalizedHeightMm - baseSpec.footprintBoundsMm.height) > 0.01
      ? normalizedHeightMm
      : undefined

  return widthOverrideMm !== undefined || heightOverrideMm !== undefined
    ? {
        widthMm: widthOverrideMm,
        heightMm: heightOverrideMm,
      }
    : undefined
}

function createComponentDraft(
  scene: SceneDocument,
  selection: SelectionState,
  type: ComponentType,
  mountVisibilityDefaults: MountVisibilityDefaults,
  activeHostSurfaceId?: string,
  requestedVariantId?: string,
) {
  const definition = getComponentDefinition(type)
  const defaultSurfaceId =
    type === 'laser-source' && scene.workspace.kind === 'optical-table'
      ? OPTICAL_TABLE_SURFACE_ID
      : activeHostSurfaceId ?? getDefaultSurfaceId(scene)
  const variantId =
    type === 'laser-source' && scene.workspace.kind === 'optical-table'
      ? 'compact-table-source'
      : requestedVariantId ?? definition.defaultVariantId
  const selectedComponentId =
    selection.type === 'component' ? selection.componentId : undefined
  let selectedTarget: ComponentInstance | undefined

  if (selectedComponentId) {
    selectedTarget = scene.components.find(
      (component) => component.id === selectedComponentId,
    )
  }

  const targetForSource =
    selectedTarget && isOpticalTarget(selectedTarget.type)
      ? selectedTarget
      : getOpticalTargetComponents(scene)[0]
  let draft: ComponentInstance = {
    id: createComponentId(type),
    type,
    label: createAutoNumberedLabel(scene.components, type, variantId),
    variantId,
    anchorMm: (() => {
      const surface = getSurfacePlacementModel(scene, activeHostSurfaceId)
      const center = getNearestBoardCenterHole(surface.breadboard)
      return {
        x: center.x + surface.originMm.x,
        y: center.y + surface.originMm.y,
      }
    })(),
    hostSurfaceId: defaultSurfaceId,
    rotationQuarterTurns: 0,
    config: createDefaultComponentConfig(type, variantId),
  }

  draft = applyMountVisibilityDefault(draft, mountVisibilityDefaults)

  if (selectedTarget && isStageComponentType(selectedTarget.type)) {
    const selectedTargetSpec = getResolvedComponentSpecForInstance(selectedTarget)
    const draftSpec = getResolvedComponentSpecForInstance(draft)
    const defaultMountSite = selectedTargetSpec.mountSites.find(
      (mountSite) =>
        mountSite.allowedChildMountModes.includes(draftSpec.mount.mode) &&
        (!mountSite.allowedChildTypes ||
          mountSite.allowedChildTypes.includes(draft.type)) &&
        !scene.components.some(
          (candidate) =>
            candidate.attachment?.parentComponentId === selectedTarget.id &&
            candidate.attachment.parentMountSiteId === mountSite.id,
        ),
    )

    if (defaultMountSite) {
      const defaultMountAnchorMm = componentLocalToWorld(
        scene,
        selectedTarget.id,
        defaultMountSite.defaultLocalAnchorMm,
      )
      const attachmentCandidate = resolveStageAttachmentCandidate({
        candidateAnchorMm: defaultMountAnchorMm,
        component: draft,
        lockedParentComponentId: selectedTarget.id,
        lockedSiteId: defaultMountSite.id,
        scene,
      })

      if (attachmentCandidate) {
        draft = {
          ...draft,
          attachment: attachmentCandidate.attachment,
          anchorMm: attachmentCandidate.anchorMm,
          hostSurfaceId: attachmentCandidate.hostSurfaceId,
          rotationQuarterTurns: attachmentCandidate.rotationQuarterTurns,
        }
      }
    }
  }

  if (type === 'laser-source') {
    const existingSourceConfig = draft.config.source

    if (!existingSourceConfig) {
      return draft
    }

    const nextSourceConfig: SourceConfig = {
      ...existingSourceConfig,
      firstTargetComponentId: targetForSource?.id,
    }
    draft = {
      ...draft,
      config: {
        ...draft.config,
        source: nextSourceConfig,
      },
    }

    const aligned = applySourceLane(
      scene,
      draft,
      nextSourceConfig.lane ?? 'left',
      targetForSource?.id,
    )

    draft = {
      ...draft,
      anchorMm: aligned.anchorMm,
      rotationQuarterTurns: aligned.rotationQuarterTurns,
    }
  }

  return draft
}

function createBreadboardPlacementDraft(
  scene: SceneDocument,
  presetId: string,
): PendingBreadboardPlacementState | undefined {
  if (scene.workspace.kind !== 'optical-table') {
    return undefined
  }

  const model = createBreadboardFromPreset(presetId)
  const tableCenterMm = {
    x: scene.workspace.table.widthMm / 2,
    y: scene.workspace.table.heightMm / 2,
  }
  const offsetMm = scene.workspace.breadboards.length * 40
  const centerMm = {
    x: roundMm(tableCenterMm.x + offsetMm),
    y: roundMm(tableCenterMm.y + offsetMm),
  }

  return {
    presetId,
    label: createAutoNumberedBreadboardLabel(scene),
    model,
    candidateAnchorMm: getBreadboardAnchorForCenterMm(model, centerMm, 0),
    rotationQuarterTurns: 0,
  }
}

function mergeComponentConfig(
  current: ComponentConfig,
  update: ComponentConfigUpdate,
): ComponentConfig {
  return {
    source:
      update.source && current.source
        ? { ...current.source, ...update.source }
        : current.source,
    beamSplitter: update.beamSplitter
      ? {
          ...(current.beamSplitter ?? {
            reflectPercent: 50,
            lossPercent: 2,
          }),
          ...update.beamSplitter,
        }
      : current.beamSplitter,
    lens: update.lens
      ? {
          ...(current.lens ?? {
            focalLengthMm: 100,
            clearApertureMm: 22,
          }),
          ...update.lens,
        }
      : current.lens,
    curvedMirror: update.curvedMirror
      ? {
          ...(current.curvedMirror ?? {
            radiusOfCurvatureMm: 200,
            isConvex: false,
          }),
          ...update.curvedMirror,
        }
      : current.curvedMirror,
    flipMirror: update.flipMirror
      ? {
          ...(current.flipMirror ?? {
            isFlippedDown: true,
          }),
          ...update.flipMirror,
        }
      : current.flipMirror,
    attenuator: update.attenuator
      ? {
          ...(current.attenuator ?? {
            transmissionPercent: 50,
            orientation: 'horizontal' as const,
          }),
          ...update.attenuator,
        }
      : current.attenuator,
    polarizer: update.polarizer
      ? {
          ...(current.polarizer ?? {
            axisLocalDeg: 0,
            extinctionRatio: 1000,
            insertionLossPercent: 14,
          }),
          ...update.polarizer,
        }
      : current.polarizer,
    waveplate: update.waveplate
      ? {
          ...(current.waveplate ?? {
            kind: 'half' as const,
            axisLocalDeg: 0,
            retardanceDeg: 180,
            insertionLossPercent: 2,
          }),
          ...update.waveplate,
        }
      : current.waveplate,
    iris: update.iris
      ? {
          ...(current.iris ?? {
            apertureMm: 10,
          }),
          ...update.iris,
        }
      : current.iris,
    bboCrystal: update.bboCrystal
      ? {
          ...(current.bboCrystal ?? {
            crystalType: 'type-i' as const,
            interactionMode: 'estimated' as const,
            thicknessUm: 10,
            phaseMatchingAngleDeg: 29.2,
            polarizationAxisLocalDeg: 0,
          }),
          ...update.bboCrystal,
        }
      : current.bboCrystal,
    delayLine: update.delayLine
      ? {
          ...(current.delayLine ?? {
            positionMm: 0,
            travelMm: 25,
            topology: 'double-pass' as const,
            zeroDelayOffsetFs: 0,
          }),
          ...update.delayLine,
        }
      : current.delayLine,
    telescope: update.telescope
      ? {
          ...(current.telescope ?? {
            mode: 'transmission' as const,
            element1Mm: 50,
            element2Mm: 100,
            separationMm: 150,
            clearApertureMm: 25.4,
          }),
          ...update.telescope,
        }
      : current.telescope,
    opa: update.opa
      ? {
          ...(current.opa ?? {
            role: 'combiner' as const,
          }),
          ...update.opa,
        }
      : current.opa,
    support: update.support
      ? {
          ...(current.support ?? {
            includeMount: true,
          }),
          ...update.support,
        }
      : current.support,
  }
}

function applySourceLane(
  scene: SceneDocument,
  component: ComponentInstance,
  lane: SourceLane,
  targetId?: string,
) {
  const spec = getResolvedComponentSpec(component.type, component.variantId)

  if (spec.mount.mode !== 'external-source') {
    return {
      anchorMm: component.anchorMm,
      rotationQuarterTurns: component.rotationQuarterTurns,
    }
  }

  const target = scene.components.find((item) => item.id === targetId)
  const surface = getSurfacePlacementModel(
    scene,
    component.hostSurfaceId ?? getDefaultSurfaceId(scene),
  )
  const aligned = alignExternalSourceToTarget({
    breadboard: surface.breadboard,
    lane,
    source: {
      ...component,
      anchorMm: {
        x: component.anchorMm.x - surface.originMm.x,
        y: component.anchorMm.y - surface.originMm.y,
      },
    },
    target,
  })

  return {
    anchorMm: {
      x: aligned.anchorMm.x + surface.originMm.x,
      y: aligned.anchorMm.y + surface.originMm.y,
    },
    rotationQuarterTurns: aligned.rotationQuarterTurns,
  }
}

function getSourceGuideAdjustedAnchorMm(
  scene: SceneDocument,
  component: ComponentInstance,
  candidateAnchorMm: Vector2Mm,
) {
  const targetId = component.config.source?.firstTargetComponentId

  if (!targetId) {
    return candidateAnchorMm
  }

  return applySourceGuideAssist({
    candidateAnchorMm,
    scene,
    source: component,
    targetId,
  }).anchorMm
}

function updateAnnotationCollection(
  annotations: SceneAnnotation[],
  annotationId: string,
  updater: (annotation: SceneAnnotation) => SceneAnnotation | undefined,
) {
  const nextAnnotations: SceneAnnotation[] = []

  for (const annotation of annotations) {
    if (annotation.id !== annotationId) {
      nextAnnotations.push(annotation)
      continue
    }

    const nextAnnotation = updater(annotation)
    if (nextAnnotation) {
      nextAnnotations.push(nextAnnotation)
    }
  }

  return nextAnnotations
}

function isTextAnnotation(annotation: SceneAnnotation): annotation is AnnotationText {
  return annotation.kind === 'text'
}

function isShapeAnnotation(annotation: SceneAnnotation): annotation is ShapeAnnotation {
  return annotation.kind === 'shape'
}

function applyTextAnnotationUpdate(
  annotation: AnnotationText,
  update: {
    anchorMm?: Vector2Mm
    backgroundColor?: string
    borderColor?: string
    tailMm?: Vector2Mm
    text?: string
    variant?: AnnotationTextVariant
    widthMm?: number
  },
) {
  const nextAnnotation: AnnotationText = {
    ...annotation,
    anchorMm: update.anchorMm
      ? {
          x: roundMm(update.anchorMm.x),
          y: roundMm(update.anchorMm.y),
        }
      : annotation.anchorMm,
    backgroundColor: update.backgroundColor ?? annotation.backgroundColor,
    borderColor: update.borderColor ?? annotation.borderColor,
    tailMm:
      update.tailMm !== undefined
        ? {
            x: roundMm(update.tailMm.x),
            y: roundMm(update.tailMm.y),
          }
        : annotation.tailMm,
    text: update.text ?? annotation.text,
    variant: update.variant ?? annotation.variant,
  }

  return update.widthMm !== undefined
    ? resizeTextAnnotationWidth(nextAnnotation, update.widthMm)
    : nextAnnotation
}

function applyTextAnnotationStyle(
  annotation: AnnotationText,
  update: Partial<AnnotationTextStyle>,
) {
  return {
    ...annotation,
    style: {
      ...annotation.style,
      ...update,
      fontSizeMm:
        update.fontSizeMm !== undefined
          ? clampAnnotationFontSizeMm(update.fontSizeMm)
          : annotation.style.fontSizeMm,
    },
  } satisfies AnnotationText
}

function convertShapeKind(
  annotation: ShapeAnnotation,
  shapeKind: ShapeAnnotation['shapeKind'],
): ShapeAnnotation {
  if (annotation.shapeKind === shapeKind) {
    return annotation
  }

  if (shapeKind === 'arrow') {
    const bounds =
      annotation.shapeKind === 'arrow'
        ? getArrowAnnotationBoundsMm(annotation)
        : annotation.boundsMm

    return {
      ...annotation,
      kind: 'shape',
      shapeKind,
      startMm: {
        x: roundMm(bounds.x),
        y: roundMm(bounds.y),
      },
      endMm: {
        x: roundMm(bounds.x + bounds.width),
        y: roundMm(bounds.y + bounds.height),
      },
      strokeColor: annotation.strokeColor,
      fillColor: annotation.fillColor,
      strokeWidthMm: annotation.strokeWidthMm,
    }
  }

  const bounds =
    annotation.shapeKind === 'arrow'
      ? normalizeRectLikeBounds({
          x: Math.min(annotation.startMm.x, annotation.endMm.x),
          y: Math.min(annotation.startMm.y, annotation.endMm.y),
          width: Math.abs(annotation.endMm.x - annotation.startMm.x),
          height: Math.abs(annotation.endMm.y - annotation.startMm.y),
        })
      : annotation.boundsMm

  return {
    ...annotation,
    kind: 'shape',
    shapeKind,
    boundsMm: bounds,
    strokeColor: annotation.strokeColor,
    fillColor: annotation.fillColor,
    strokeWidthMm: annotation.strokeWidthMm,
  }
}

function applyShapeAnnotationUpdate(
  annotation: ShapeAnnotation,
  update: {
    boundsMm?: {
      x?: number
      y?: number
      width?: number
      height?: number
    }
    endMm?: Vector2Mm
    startMm?: Vector2Mm
  },
) {
  if (annotation.shapeKind === 'arrow') {
    let nextAnnotation: ShapeAnnotation = annotation

    if (update.startMm) {
      nextAnnotation = updateArrowAnnotationEndpoint(
        nextAnnotation,
        'start',
        update.startMm,
      )
    }

    if (update.endMm) {
      nextAnnotation = updateArrowAnnotationEndpoint(
        nextAnnotation,
        'end',
        update.endMm,
      )
    }

    return nextAnnotation
  }

  if (!update.boundsMm) {
    return annotation
  }

  return resizeShapeAnnotationBounds(annotation, {
    x: update.boundsMm.x ?? annotation.boundsMm.x,
    y: update.boundsMm.y ?? annotation.boundsMm.y,
    width: update.boundsMm.width ?? annotation.boundsMm.width,
    height: update.boundsMm.height ?? annotation.boundsMm.height,
  })
}

function translateBreadboardHostedComponents(
  scene: SceneDocument,
  breadboardId: string,
  deltaMm: Vector2Mm,
) {
  if (deltaMm.x === 0 && deltaMm.y === 0) {
    return scene.components
  }

  return syncAttachedComponentTransforms({
    ...scene,
    components: scene.components.map((component) =>
      !component.attachment && component.hostSurfaceId === breadboardId
        ? translateComponentWorld(component, deltaMm)
        : component,
    ),
  }).components
}

function createSceneHistoryState(): SceneHistoryState {
  return {
    past: [],
    future: [],
  }
}

function getSceneHistoryFlags(history: SceneHistoryState) {
  return {
    canRedo: history.future.length > 0,
    canUndo: history.past.length > 0,
  }
}

function createSceneHistorySnapshot(
  state: Pick<EditorStore, 'scene' | 'selection' | 'interaction'>,
): SceneHistorySnapshot {
  return {
    scene: state.scene,
    selection: state.selection,
    activeHostSurfaceId: state.interaction.activeHostSurfaceId,
  }
}

function pushSceneHistory(
  history: SceneHistoryState,
  snapshot: SceneHistorySnapshot,
  options: CommitSceneHistoryOptions = {},
): SceneHistoryState {
  const now = Date.now()
  const shouldCoalesce =
    history.future.length === 0 &&
    options.mergeKey !== undefined &&
    history.lastMergeKey === options.mergeKey &&
    history.lastCommittedAtMs !== undefined &&
    now - history.lastCommittedAtMs <= HISTORY_COALESCE_WINDOW_MS

  if (shouldCoalesce) {
    return {
      past: history.past,
      future: [],
      lastCommittedAtMs: now,
      lastMergeKey: options.mergeKey,
    }
  }

  const nextPast = [...history.past, snapshot]

  if (nextPast.length > MAX_SCENE_HISTORY_ENTRIES) {
    nextPast.shift()
  }

  return {
    past: nextPast,
    future: [],
    lastCommittedAtMs: now,
    lastMergeKey: options.mergeKey,
  }
}

function withCommittedScene<StatePatch extends {
  scene: SceneDocument
  selection?: SelectionState
  interaction?: InteractionState
  viewport?: ViewportState
}>(
  state: EditorStore,
  patch: StatePatch,
  options?: CommitSceneHistoryOptions,
) {
  const history = pushSceneHistory(
    state.history,
    createSceneHistorySnapshot(state),
    options,
  )
  const syncedScene = syncAttachedComponentTransforms(patch.scene)

  return {
    ...patch,
    scene: syncedScene,
    history,
    ...getSceneHistoryFlags(history),
  }
}

function withResetHistory<StatePatch extends {
  scene: SceneDocument
  selection?: SelectionState
  interaction?: InteractionState
  viewport?: ViewportState
}>(patch: StatePatch) {
  const history = createSceneHistoryState()
  const syncedScene = syncAttachedComponentTransforms(patch.scene)

  return {
    ...patch,
    scene: syncedScene,
    history,
    ...getSceneHistoryFlags(history),
  }
}

function createInteractionForScene(args: {
  activeHostSurfaceId?: string
  focusedBreadboardId?: string
  previousInteraction?: InteractionState
  scene: SceneDocument
  selection: SelectionState
  workspaceViewMode?: WorkspaceViewMode
}) {
  const workspaceViewMode = resolveWorkspaceViewModeForScene(
    args.scene,
    args.workspaceViewMode ?? args.previousInteraction?.workspaceViewMode,
  )
  const focusedBreadboardId = resolveFocusedBreadboardIdForScene(args.scene, {
    activeHostSurfaceId: args.activeHostSurfaceId ?? args.previousInteraction?.activeHostSurfaceId,
    focusedBreadboardId:
      args.focusedBreadboardId ?? args.previousInteraction?.focusedBreadboardId,
    selection: args.selection,
  })
  const resolvedActiveHostSurfaceId =
    args.scene.workspace.kind === 'optical-table' &&
    workspaceViewMode === 'board-focus' &&
    focusedBreadboardId
      ? focusedBreadboardId
      : resolveActiveHostSurfaceId(
          args.scene,
          args.selection,
          args.activeHostSurfaceId ?? args.previousInteraction?.activeHostSurfaceId,
        )

  return {
    ...initialInteraction,
    bottomToolbarOffsetPx: args.previousInteraction?.bottomToolbarOffsetPx,
    editingTextAnnotationId: undefined,
    editingTextDraftText: undefined,
    focusedBreadboardId,
    shapeToolKind: args.previousInteraction?.shapeToolKind ?? DEFAULT_ANNOTATION_SHAPE_KIND,
    textToolVariant:
      args.previousInteraction?.textToolVariant ?? DEFAULT_ANNOTATION_TEXT_VARIANT,
    workspaceViewMode,
    activeHostSurfaceId: resolvedActiveHostSurfaceId,
  } satisfies InteractionState
}

function restoreSceneHistorySnapshot(
  state: EditorStore,
  snapshot: SceneHistorySnapshot,
  history: SceneHistoryState,
) {
  const selection = resolveSelectionForScene(snapshot.scene, snapshot.selection)

  return {
    scene: snapshot.scene,
    selection,
    interaction: {
      ...createInteractionForScene({
        activeHostSurfaceId: snapshot.activeHostSurfaceId,
        previousInteraction: state.interaction,
        scene: snapshot.scene,
        selection,
      }),
      activeDragComponentId: undefined,
      dragPreview: undefined,
      hoveredBeamSegmentId: undefined,
      hoveredComponentId: undefined,
      editingTextAnnotationId: undefined,
      editingTextDraftText: undefined,
      notice: undefined,
      pendingBreadboardPlacement: undefined,
      pendingPlacement: undefined,
      selectedBeamInteractionId: undefined,
      selectedBeamPathId: undefined,
      selectedBeamSegmentId: undefined,
    },
    history,
    ...getSceneHistoryFlags(history),
  }
}

const initialInteraction: InteractionState = {
  activeTool: 'select',
  workspaceViewMode: 'board-focus',
  dismissedWarningIds: [],
  editingTextDraftText: undefined,
  isHelpOpen: false,
  isSpacePanning: false,
  isPointerPanning: false,
  isWarningsOpen: false,
  lineColor: '#ff0000',
  shapeToolKind: DEFAULT_ANNOTATION_SHAPE_KIND,
  textToolVariant: DEFAULT_ANNOTATION_TEXT_VARIANT,
  showBeamDetails: true,
  showGaussianEnvelope: false,
}
const initialRenderMode = readRenderMode()
const initialSimpleIconStyle = readSimpleIconStyle()
const initialWarningFilters = readWarningFilters()
const initialMountVisibilityDefaults = readMountVisibilityDefaults()

export const useEditorStore = create<EditorStore>((set) => ({
  scene: initialScene,
  selection: getDefaultSelection(initialScene),
  snapMode: 'onDrop',
  viewport: createViewportForScene(initialScene),
  renderMode: initialRenderMode,
  simpleIconStyle: initialSimpleIconStyle,
  warningFilters: initialWarningFilters,
  simpleGlyphAppearances: {},
  mountVisibilityDefaults: initialMountVisibilityDefaults,
  openToolbarMenu: undefined,
  interaction: createInteractionForScene({
    scene: initialScene,
    selection: getDefaultSelection(initialScene),
  }),
  history: createSceneHistoryState(),
  canUndo: false,
  canRedo: false,

  selectBreadboard: (surfaceId) => {
    set((state) => {
      const nextSurfaceId = surfaceId ?? getDefaultSurfaceId(state.scene)
      const selection = {
        type: 'breadboard' as const,
        surfaceId: nextSurfaceId,
      }
      const focusedBreadboardId =
        state.scene.workspace.kind === 'optical-table' &&
        nextSurfaceId !== OPTICAL_TABLE_SURFACE_ID
          ? nextSurfaceId
          : state.interaction.focusedBreadboardId

      return {
        selection,
        viewport:
          state.scene.workspace.kind === 'optical-table' &&
          state.interaction.workspaceViewMode === 'board-focus'
            ? createViewportForScene(state.scene, state.viewport.canvasSizePx, {
                focusedBreadboardId,
                workspaceViewMode: 'board-focus',
              })
            : state.viewport,
        interaction: clearHighlightInteractionState({
          ...state.interaction,
          activeHostSurfaceId: nextSurfaceId,
          editingTextAnnotationId: undefined,
          editingTextDraftText: undefined,
          focusedBreadboardId,
          notice: undefined,
          pendingPlacement: undefined,
          pendingBreadboardPlacement: undefined,
        }),
      }
    })
  },

  selectOpticalTable: () => {
    set((state) => ({
      selection: { type: 'optical-table' },
      interaction: clearHighlightInteractionState({
        ...state.interaction,
        activeHostSurfaceId: OPTICAL_TABLE_SURFACE_ID,
        editingTextAnnotationId: undefined,
        editingTextDraftText: undefined,
        notice: undefined,
        pendingPlacement: undefined,
        pendingBreadboardPlacement: undefined,
      }),
    }))
  },

  selectComponent: (componentId) => {
    set((state) => {
      const component = state.scene.components.find(
        (candidate) => candidate.id === componentId,
      )

      return {
        selection: { type: 'component', componentId },
        interaction: clearHighlightInteractionState({
          ...state.interaction,
          activeHostSurfaceId:
            component?.hostSurfaceId ?? state.interaction.activeHostSurfaceId,
          editingTextAnnotationId: undefined,
          editingTextDraftText: undefined,
          notice: undefined,
          pendingPlacement: undefined,
          pendingBreadboardPlacement: undefined,
        }),
      }
    })
  },

  selectAnnotation: (annotationId) => {
    set((state) => ({
      selection: { type: 'annotation', annotationId },
      interaction: clearHighlightInteractionState({
        ...state.interaction,
        activeDragComponentId: undefined,
        dragPreview: undefined,
        editingTextAnnotationId: undefined,
        editingTextDraftText: undefined,
        notice: undefined,
        pendingPlacement: undefined,
        pendingBreadboardPlacement: undefined,
      }),
    }))
  },

  setSnapMode: (snapMode) => {
    set({ snapMode })
  },

  setActiveTool: (tool) => {
    set((state) => ({
      interaction: {
        ...(tool === 'highlight'
          ? {
              ...state.interaction,
              highlightDragBoundsMm: undefined,
              highlightDragStartMm: undefined,
            }
          : clearHighlightInteractionState(state.interaction)),
        activeTool: tool,
        editingTextAnnotationId:
          tool === 'text' ? state.interaction.editingTextAnnotationId : undefined,
        editingTextDraftText:
          tool === 'text' ? state.interaction.editingTextDraftText : undefined,
        lineDrawStartMm: tool === 'line' ? state.interaction.lineDrawStartMm : undefined,
      },
    }))
  },

  setSpacePanning: (isPressed) => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        isSpacePanning: isPressed,
      },
    }))
  },

  setPointerPanning: (isPanning) => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        isPointerPanning: isPanning,
      },
    }))
  },

  setHoveredComponentId: (componentId) => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        hoveredComponentId: componentId,
      },
    }))
  },

  setHoveredBeamSegmentId: (segmentId) => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        hoveredBeamSegmentId: segmentId,
      },
    }))
  },

  setCursorWorldMm: (cursorWorldMm) => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        cursorWorldMm,
      },
    }))
  },

  setShowBeamDetails: (showBeamDetails) => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        showBeamDetails,
      },
    }))
  },

  setShowGaussianEnvelope: (showGaussianEnvelope) => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        showGaussianEnvelope,
      },
    }))
  },

  setRenderMode: (renderMode) => {
    writeLocalStorageValue(RENDER_MODE_STORAGE_KEY, renderMode)
    set({ renderMode })
  },

  setSimpleIconStyle: (simpleIconStyle) => {
    writeLocalStorageValue(SIMPLE_ICON_STYLE_STORAGE_KEY, simpleIconStyle)
    set({ simpleIconStyle })
  },

  setWarningFilter: (tier, isEnabled) => {
    set((state) => {
      const nextWarningFilters = {
        ...state.warningFilters,
        [tier]: isEnabled,
      }

      writeLocalStorageValue(
        WARNING_FILTERS_STORAGE_KEY,
        JSON.stringify(nextWarningFilters),
      )

      return {
        warningFilters: nextWarningFilters,
      }
    })
  },

  setOpenToolbarMenu: (menu) => {
    set({ openToolbarMenu: menu })
  },

  beginHighlightDrag: (startMm) => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        highlightDragBoundsMm: {
          x: startMm.x,
          y: startMm.y,
          width: 0,
          height: 0,
        },
        highlightDragStartMm: startMm,
        highlightSelection: undefined,
        notice: undefined,
      },
    }))
  },

  updateHighlightDrag: (pointMm) => {
    set((state) => {
      if (!state.interaction.highlightDragStartMm) {
        return state
      }

      return {
        interaction: {
          ...state.interaction,
          highlightDragBoundsMm: boundsFromPointsMm(
            state.interaction.highlightDragStartMm,
            pointMm,
          ),
        },
      }
    })
  },

  commitHighlightDrag: (pointMm) => {
    set((state) => {
      const startMm = state.interaction.highlightDragStartMm

      if (!startMm) {
        return state
      }

      const captureBoundsMm = boundsFromPointsMm(pointMm ?? startMm, startMm)
      const hasMeaningfulArea = captureBoundsMm.width >= 4 || captureBoundsMm.height >= 4
      const highlightSelection = hasMeaningfulArea
        ? createHighlightSelectionFromBounds(state.scene, captureBoundsMm)
        : undefined

      return {
        interaction: {
          ...state.interaction,
          highlightDragBoundsMm: undefined,
          highlightDragStartMm: undefined,
          highlightSelection,
          notice: highlightSelection
            ? `${highlightSelection.breadboardIds.length + highlightSelection.componentIds.length + highlightSelection.annotationIds.length} items highlighted.`
            : undefined,
        },
      }
    })
  },

  commitHighlightSelectionBounds: (startMm, endMm) => {
    set((state) => {
      const captureBoundsMm = boundsFromPointsMm(endMm ?? startMm, startMm)
      const hasMeaningfulArea = captureBoundsMm.width >= 4 || captureBoundsMm.height >= 4
      const highlightSelection = hasMeaningfulArea
        ? createHighlightSelectionFromBounds(state.scene, captureBoundsMm)
        : undefined

      return {
        interaction: {
          ...clearHighlightInteractionState(state.interaction),
          highlightSelection,
          notice: highlightSelection
            ? `${highlightSelection.breadboardIds.length + highlightSelection.componentIds.length + highlightSelection.annotationIds.length} items highlighted.`
            : undefined,
        },
      }
    })
  },

  clearHighlightSelection: () => {
    set((state) => ({
      interaction: clearHighlightInteractionState({
        ...state.interaction,
        notice:
          state.interaction.highlightSelection || state.interaction.highlightDragBoundsMm
            ? undefined
            : state.interaction.notice,
      }),
    }))
  },

  selectBeamSegment: (segmentId, pathId, interactionId) => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        selectedBeamSegmentId: segmentId,
        selectedBeamPathId: pathId,
        selectedBeamInteractionId: interactionId,
      },
    }))
  },

  clearBeamInspectionSelection: () => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        hoveredBeamSegmentId: undefined,
        selectedBeamSegmentId: undefined,
        selectedBeamPathId: undefined,
        selectedBeamInteractionId: undefined,
      },
    }))
  },

  setHelpOpen: (isOpen) => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        isHelpOpen: isOpen,
      },
    }))
  },

  setWarningsOpen: (isOpen) => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        isWarningsOpen: isOpen,
        selectedWarningId: isOpen ? state.interaction.selectedWarningId : undefined,
      },
    }))
  },

  setSelectedWarningId: (warningId) => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        isWarningsOpen: warningId ? true : state.interaction.isWarningsOpen,
        selectedWarningId: warningId,
      },
    }))
  },

  setNotice: (notice) => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        notice,
      },
    }))
  },

  clearNotice: () => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        notice: undefined,
      },
    }))
  },

  setBottomToolbarOffset: (bottomToolbarOffsetPx) => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        bottomToolbarOffsetPx,
      },
    }))
  },

  setViewportSize: (canvasSizePx) => {
    set((state) => {
      const safeCanvasSize = getSafeCanvasSize(canvasSizePx)
      const isBootstrappingFromDefaultCanvasSize =
        state.viewport.canvasSizePx.width === DEFAULT_CANVAS_SIZE.width &&
        state.viewport.canvasSizePx.height === DEFAULT_CANVAS_SIZE.height &&
        (safeCanvasSize.width !== DEFAULT_CANVAS_SIZE.width ||
          safeCanvasSize.height !== DEFAULT_CANVAS_SIZE.height)

      return {
        viewport: isBootstrappingFromDefaultCanvasSize
          ? createViewportForScene(state.scene, safeCanvasSize, {
              focusedBreadboardId: state.interaction.focusedBreadboardId,
              workspaceViewMode: state.interaction.workspaceViewMode,
            })
          : {
              ...state.viewport,
              canvasSizePx: safeCanvasSize,
            },
      }
    })
  },

  setViewport: (viewport) => {
    set((state) => ({
      viewport: clampViewportForActiveWorkspace({
        interaction: state.interaction,
        scene: state.scene,
        selection: state.selection,
        viewport,
      }),
    }))
  },

  panViewportByScreenDelta: (deltaPx) => {
    set((state) => {
      const nextViewport = clampViewportForActiveWorkspace({
        interaction: state.interaction,
        scene: state.scene,
        selection: state.selection,
        viewport: panViewportByDelta(state.viewport, deltaPx),
      })

      return { viewport: nextViewport }
    })
  },

  applyPinchViewport: (previousMidpointPx, nextMidpointPx, zoomFactor) => {
    set((state) => {
      const nextViewport = clampViewportForActiveWorkspace({
        interaction: state.interaction,
        scene: state.scene,
        selection: state.selection,
        viewport: applyPinchViewportTransform(
          state.viewport,
          previousMidpointPx,
          nextMidpointPx,
          zoomFactor,
        ),
      })

      return { viewport: nextViewport }
    })
  },

  zoomAtScreenPoint: (pointPx, zoomFactor) => {
    set((state) => {
      const nextViewport = clampViewportForActiveWorkspace({
        interaction: state.interaction,
        scene: state.scene,
        selection: state.selection,
        viewport: zoomViewportAtScreenPoint(state.viewport, pointPx, zoomFactor),
      })

      return { viewport: nextViewport }
    })
  },

  resetViewport: () => {
    set((state) => ({
      viewport: createViewportForScene(state.scene, state.viewport.canvasSizePx, {
        focusedBreadboardId: state.interaction.focusedBreadboardId,
        workspaceViewMode: state.interaction.workspaceViewMode,
      }),
    }))
  },

  addComponent: (type, variantId) => {
    set((state) => {
      const draft = createComponentDraft(
        state.scene,
        state.selection,
        type,
        state.mountVisibilityDefaults,
        state.interaction.activeHostSurfaceId ?? getDefaultSurfaceId(state.scene),
        variantId,
      )

      return {
        selection: getDefaultSelection(state.scene),
        interaction: clearHighlightInteractionState({
          ...state.interaction,
          activeTool: 'select' as const,
          activeHostSurfaceId: draft.hostSurfaceId,
          lineDrawStartMm: undefined,
          pendingPlacement: {
            draft,
            candidateAnchorMm: draft.anchorMm,
          },
          pendingBreadboardPlacement: undefined,
          selectedBeamInteractionId: undefined,
          selectedBeamPathId: undefined,
          selectedBeamSegmentId: undefined,
          notice: undefined,
        }),
      }
    })
  },

  addTextAnnotationAt: (anchorMm) => {
    set((state) => {
      const nextAnnotation = createDefaultTextAnnotation(
        createAnnotationId('text'),
        anchorMm,
        state.interaction.textToolVariant,
        getNextAnnotationZIndex(state.scene),
      )

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          annotations: [...state.scene.annotations, nextAnnotation],
        },
        selection: { type: 'annotation', annotationId: nextAnnotation.id },
        interaction: clearHighlightInteractionState({
          ...state.interaction,
          activeTool: 'select',
          editingTextAnnotationId: nextAnnotation.id,
          editingTextDraftText: nextAnnotation.text,
          lineDrawStartMm: undefined,
          notice: undefined,
          pendingPlacement: undefined,
          pendingBreadboardPlacement: undefined,
        }),
      })
    })
  },

  addShapeAnnotationAt: (anchorMm) => {
    set((state) => {
      const nextAnnotation = createDefaultShapeAnnotation(
        createAnnotationId('shape'),
        anchorMm,
        state.interaction.shapeToolKind,
        getNextAnnotationZIndex(state.scene),
      )

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          annotations: [...state.scene.annotations, nextAnnotation],
        },
        selection: { type: 'annotation', annotationId: nextAnnotation.id },
        interaction: clearHighlightInteractionState({
          ...state.interaction,
          activeTool: 'select',
          editingTextAnnotationId: undefined,
          editingTextDraftText: undefined,
          lineDrawStartMm: undefined,
          notice: undefined,
          pendingPlacement: undefined,
          pendingBreadboardPlacement: undefined,
        }),
      })
    })
  },

  addBreadboardInstance: (presetId) => {
    set((state) => {
      const pendingBreadboardPlacement = createBreadboardPlacementDraft(
        state.scene,
        presetId,
      )

      if (!pendingBreadboardPlacement) {
        return state
      }

      return {
        selection: { type: 'optical-table' as const },
        interaction: clearHighlightInteractionState({
          ...state.interaction,
          activeTool: 'select' as const,
          lineDrawStartMm: undefined,
          activeHostSurfaceId: OPTICAL_TABLE_SURFACE_ID,
          pendingPlacement: undefined,
          pendingBreadboardPlacement,
          selectedBeamInteractionId: undefined,
          selectedBeamPathId: undefined,
          selectedBeamSegmentId: undefined,
          notice: undefined,
        }),
      }
    })
  },

  updatePendingPlacementAnchor: (anchorMm) => {
    set((state) => {
      const pendingPlacement = state.interaction.pendingPlacement

      if (!pendingPlacement) {
        return state
      }

      const pendingAttachmentCandidate = resolveStageAttachmentCandidate({
        candidateAnchorMm: anchorMm,
        component: pendingPlacement.draft,
        scene: state.scene,
      })

      if (pendingAttachmentCandidate) {
        return {
          interaction: {
            ...state.interaction,
            pendingPlacement: {
              ...pendingPlacement,
              draft: {
                ...pendingPlacement.draft,
                attachment: pendingAttachmentCandidate.attachment,
                anchorMm: pendingAttachmentCandidate.anchorMm,
                hostSurfaceId: pendingAttachmentCandidate.hostSurfaceId,
                rotationQuarterTurns: pendingAttachmentCandidate.rotationQuarterTurns,
              },
              candidateAnchorMm: pendingAttachmentCandidate.anchorMm,
            },
            activeHostSurfaceId: pendingAttachmentCandidate.hostSurfaceId,
            focusedBreadboardId:
              pendingAttachmentCandidate.hostSurfaceId &&
              pendingAttachmentCandidate.hostSurfaceId !== OPTICAL_TABLE_SURFACE_ID
                ? pendingAttachmentCandidate.hostSurfaceId
                : state.interaction.focusedBreadboardId,
          },
        }
      }

      const retargetedDraft = retargetComponentHostSurfaceAtPoint(
        state.scene,
        pendingPlacement.draft,
        anchorMm,
      )
      const guidedAnchorMm = retargetedDraft.config.source
        ? getSourceGuideAdjustedAnchorMm(state.scene, retargetedDraft, anchorMm)
        : anchorMm
      const draft = retargetComponentHostSurfaceAtPoint(
        state.scene,
        retargetedDraft,
        guidedAnchorMm,
      )

      return {
        interaction: {
          ...state.interaction,
          pendingPlacement: {
            ...pendingPlacement,
            draft,
            candidateAnchorMm: guidedAnchorMm,
          },
          activeHostSurfaceId: draft.hostSurfaceId,
          focusedBreadboardId:
            draft.hostSurfaceId && draft.hostSurfaceId !== OPTICAL_TABLE_SURFACE_ID
              ? draft.hostSurfaceId
              : state.interaction.focusedBreadboardId,
        },
      }
    })
  },

  updatePendingBreadboardAnchor: (anchorMm) => {
    set((state) => {
      if (!state.interaction.pendingBreadboardPlacement) {
        return state
      }

      return {
        interaction: {
          ...state.interaction,
          pendingBreadboardPlacement: {
            ...state.interaction.pendingBreadboardPlacement,
            candidateAnchorMm: anchorMm,
          },
        },
      }
    })
  },

  commitPendingPlacement: (anchorMm) => {
    set((state) => {
      const pendingPlacement = state.interaction.pendingPlacement

      if (!pendingPlacement) {
        return state
      }

      const candidateAnchorMm = anchorMm ?? pendingPlacement.candidateAnchorMm
      const retargetedDraft = retargetComponentHostSurfaceAtPoint(
        state.scene,
        pendingPlacement.draft,
        candidateAnchorMm,
      )
      const guidedAnchorMm = retargetedDraft.config.source
        ? getSourceGuideAdjustedAnchorMm(
            state.scene,
            retargetedDraft,
            candidateAnchorMm,
          )
        : candidateAnchorMm
      const draft = retargetComponentHostSurfaceAtPoint(
        state.scene,
        retargetedDraft,
        guidedAnchorMm,
      )

      const placement = resolvePlacementForScene({
        candidateAnchorMm: guidedAnchorMm,
        component: draft,
        phase: 'drop',
        scene: state.scene,
        snapMode: state.snapMode,
      })
      const nextComponent: ComponentInstance = {
        ...draft,
        anchorMm: placement.resolvedAnchorMm,
      }
      const attachmentCandidate = resolveStageAttachmentCandidate({
        candidateAnchorMm: placement.resolvedAnchorMm,
        component: nextComponent,
        scene: state.scene,
      })
      const resolvedComponent = attachmentCandidate
        ? {
            ...nextComponent,
            attachment: attachmentCandidate.attachment,
            anchorMm: attachmentCandidate.anchorMm,
            hostSurfaceId: attachmentCandidate.hostSurfaceId,
            rotationQuarterTurns: attachmentCandidate.rotationQuarterTurns,
          }
        : nextComponent

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: [...state.scene.components, resolvedComponent],
        },
        selection: { type: 'component', componentId: resolvedComponent.id },
        interaction: {
          ...state.interaction,
          activeHostSurfaceId: resolvedComponent.hostSurfaceId,
          focusedBreadboardId:
            resolvedComponent.hostSurfaceId &&
            resolvedComponent.hostSurfaceId !== OPTICAL_TABLE_SURFACE_ID
              ? resolvedComponent.hostSurfaceId
              : state.interaction.focusedBreadboardId,
          pendingPlacement: undefined,
          pendingBreadboardPlacement: undefined,
          notice:
            attachmentCandidate
              ? 'Mounted optic attached to stage.'
              : describePlacementReason(placement.reason),
        },
      })
    })
  },

  commitPendingBreadboardPlacement: (anchorMm) => {
    set((state) => {
      const pendingBreadboardPlacement = state.interaction.pendingBreadboardPlacement

      if (!pendingBreadboardPlacement || state.scene.workspace.kind !== 'optical-table') {
        return state
      }

      const nextInstance = createBreadboardInstance({
        label: pendingBreadboardPlacement.label,
        model: pendingBreadboardPlacement.model,
        anchorMm: anchorMm ?? pendingBreadboardPlacement.candidateAnchorMm,
        rotationQuarterTurns: pendingBreadboardPlacement.rotationQuarterTurns,
      })

      const nextScene: SceneDocument = {
        ...state.scene,
        workspace: {
          ...state.scene.workspace,
          breadboards: [...state.scene.workspace.breadboards, nextInstance],
        },
      }

      return withCommittedScene(state, {
        scene: nextScene,
        selection: { type: 'breadboard' as const, surfaceId: nextInstance.id },
        interaction: {
          ...state.interaction,
          activeHostSurfaceId: nextInstance.id,
          focusedBreadboardId: nextInstance.id,
          pendingBreadboardPlacement: undefined,
          notice: `Placed ${nextInstance.label} on the optical table.`,
        },
      })
    })
  },

  beginBreadboardDrag: (breadboardId) => {
    set((state) => {
      if (state.scene.workspace.kind !== 'optical-table') {
        return state
      }

      const breadboard = state.scene.workspace.breadboards.find(
        (item) => item.id === breadboardId,
      )

      if (!breadboard) {
        return state
      }

      return {
        selection: { type: 'breadboard' as const, surfaceId: breadboardId },
        interaction: {
          ...state.interaction,
          activeHostSurfaceId: breadboardId,
          focusedBreadboardId: breadboardId,
          breadboardDragPreview: {
            breadboardId,
            candidateAnchorMm: breadboard.anchorMm,
          },
          notice: undefined,
        },
      }
    })
  },

  updateBreadboardDrag: (breadboardId, anchorMm) => {
    set((state) => {
      if (state.interaction.breadboardDragPreview?.breadboardId !== breadboardId) {
        return state
      }

      return {
        interaction: {
          ...state.interaction,
          breadboardDragPreview: {
            breadboardId,
            candidateAnchorMm: anchorMm,
          },
        },
      }
    })
  },

  commitBreadboardDrag: (breadboardId, anchorMm) => {
    set((state) => {
      if (state.scene.workspace.kind !== 'optical-table') {
        return state
      }

      const preview = state.interaction.breadboardDragPreview
      const finalAnchor = anchorMm ?? preview?.candidateAnchorMm

      if (!finalAnchor) {
        return state
      }
      const currentBreadboard = state.scene.workspace.breadboards.find(
        (breadboard) => breadboard.id === breadboardId,
      )

      if (!currentBreadboard) {
        return state
      }

      const roundedAnchor: Vector2Mm = {
        x: roundMm(finalAnchor.x),
        y: roundMm(finalAnchor.y),
      }
      const deltaMm = {
        x: roundMm(roundedAnchor.x - currentBreadboard.anchorMm.x),
        y: roundMm(roundedAnchor.y - currentBreadboard.anchorMm.y),
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: translateBreadboardHostedComponents(
            state.scene,
            breadboardId,
            deltaMm,
          ),
          workspace: {
            ...state.scene.workspace,
            breadboards: state.scene.workspace.breadboards.map((bb) =>
              bb.id === breadboardId
                ? { ...bb, anchorMm: roundedAnchor }
                : bb,
            ),
          },
        },
        interaction: {
          ...state.interaction,
          breadboardDragPreview: undefined,
        },
      })
    })
  },

  updateBreadboardPosition: (breadboardId, anchorMm) => {
    set((state) => {
      if (state.scene.workspace.kind !== 'optical-table') {
        return state
      }
      const currentBreadboard = state.scene.workspace.breadboards.find(
        (breadboard) => breadboard.id === breadboardId,
      )

      if (!currentBreadboard) {
        return state
      }

      const roundedAnchor: Vector2Mm = {
        x: roundMm(anchorMm.x),
        y: roundMm(anchorMm.y),
      }
      const deltaMm = {
        x: roundMm(roundedAnchor.x - currentBreadboard.anchorMm.x),
        y: roundMm(roundedAnchor.y - currentBreadboard.anchorMm.y),
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: translateBreadboardHostedComponents(
            state.scene,
            breadboardId,
            deltaMm,
          ),
          workspace: {
            ...state.scene.workspace,
            breadboards: state.scene.workspace.breadboards.map((bb) =>
              bb.id === breadboardId
                ? { ...bb, anchorMm: roundedAnchor }
                : bb,
            ),
          },
        },
      }, {
        mergeKey: `breadboard-position-${breadboardId}`,
      })
    })
  },

  beginComponentDrag: (componentId) => {
    set((state) => {
      const component = state.scene.components.find((item) => item.id === componentId)

      if (!component) {
        return state
      }

      const draggedComponentIds = resolveDraggedComponentIds(
        state.scene,
        state.interaction,
        component,
      )
      const dragLeaderId = draggedComponentIds.includes(componentId)
        ? componentId
        : draggedComponentIds[0] ?? componentId
      const dragLeader =
        state.scene.components.find((item) => item.id === dragLeaderId) ?? component

      return {
        selection: { type: 'component', componentId },
        interaction: {
          ...state.interaction,
          activeDragComponentId: componentId,
          activeHostSurfaceId:
            component.hostSurfaceId ?? state.interaction.activeHostSurfaceId,
          focusedBreadboardId:
            dragLeader.hostSurfaceId &&
            dragLeader.hostSurfaceId !== OPTICAL_TABLE_SURFACE_ID
              ? dragLeader.hostSurfaceId
              : state.interaction.focusedBreadboardId,
          dragPreview: {
            componentId: dragLeader.id,
            candidateAnchorMm: dragLeader.anchorMm,
            componentIds: draggedComponentIds,
            hostSurfaceId: dragLeader.hostSurfaceId,
          },
          notice: undefined,
        },
      }
    })
  },

  updateComponentDrag: (componentId, anchorMm) => {
    set((state) => {
      const component = state.scene.components.find((item) => item.id === componentId)

      if (!component) {
        return state
      }

      if (state.interaction.activeDragComponentId !== componentId) {
        return state
      }

      const dragLeaderId = state.interaction.dragPreview?.componentId ?? componentId
      const dragLeader =
        state.scene.components.find((item) => item.id === dragLeaderId) ?? component
      const directAttachmentDrag =
        !!component.attachment &&
        state.interaction.dragPreview?.componentIds?.length === 1 &&
        state.interaction.dragPreview.componentIds[0] === component.id

      if (directAttachmentDrag) {
        const attachmentCandidate = resolveStageAttachmentCandidate({
          candidateAnchorMm: anchorMm,
          component,
          lockedParentComponentId: component.attachment?.parentComponentId,
          lockedSiteId: component.attachment?.parentMountSiteId,
          scene: state.scene,
        })

        return {
          interaction: {
            ...state.interaction,
            activeHostSurfaceId: component.hostSurfaceId,
            focusedBreadboardId:
              component.hostSurfaceId &&
              component.hostSurfaceId !== OPTICAL_TABLE_SURFACE_ID
                ? component.hostSurfaceId
                : state.interaction.focusedBreadboardId,
            dragPreview: {
              componentId: dragLeaderId,
              candidateAnchorMm:
                attachmentCandidate?.anchorMm ?? state.interaction.dragPreview?.candidateAnchorMm ?? component.anchorMm,
              componentIds: state.interaction.dragPreview?.componentIds,
              hostSurfaceId: component.hostSurfaceId,
            },
          },
        }
      }

      const stageAttachmentCandidate =
        state.interaction.dragPreview?.componentIds?.length === 1
          ? resolveStageAttachmentCandidate({
              candidateAnchorMm: anchorMm,
              component: dragLeader,
              scene: state.scene,
            })
          : undefined

      if (stageAttachmentCandidate) {
        return {
          interaction: {
            ...state.interaction,
            activeHostSurfaceId: stageAttachmentCandidate.hostSurfaceId,
            focusedBreadboardId:
              stageAttachmentCandidate.hostSurfaceId &&
              stageAttachmentCandidate.hostSurfaceId !== OPTICAL_TABLE_SURFACE_ID
                ? stageAttachmentCandidate.hostSurfaceId
                : state.interaction.focusedBreadboardId,
            dragPreview: {
              componentId: dragLeaderId,
              candidateAnchorMm: stageAttachmentCandidate.anchorMm,
              componentIds: state.interaction.dragPreview?.componentIds,
              hostSurfaceId: stageAttachmentCandidate.hostSurfaceId,
            },
          },
        }
      }

      const retargetedComponent = retargetComponentHostSurfaceAtPoint(
        state.scene,
        dragLeader,
        anchorMm,
      )
      const guidedAnchorMm = retargetedComponent.config.source
        ? getSourceGuideAdjustedAnchorMm(
            state.scene,
            retargetedComponent,
            anchorMm,
          )
        : anchorMm
      const previewComponent = retargetComponentHostSurfaceAtPoint(
        state.scene,
        retargetedComponent,
        guidedAnchorMm,
      )

      return {
        interaction: {
          ...state.interaction,
          activeHostSurfaceId: previewComponent.hostSurfaceId,
          focusedBreadboardId:
            previewComponent.hostSurfaceId &&
            previewComponent.hostSurfaceId !== OPTICAL_TABLE_SURFACE_ID
              ? previewComponent.hostSurfaceId
              : state.interaction.focusedBreadboardId,
          dragPreview: {
            componentId: dragLeaderId,
            candidateAnchorMm: guidedAnchorMm,
            componentIds: state.interaction.dragPreview?.componentIds,
            hostSurfaceId: previewComponent.hostSurfaceId,
          },
        },
      }
    })
  },

  commitComponentDrag: (componentId, anchorMm) => {
    set((state) => {
      const component = state.scene.components.find((item) => item.id === componentId)

      if (!component || state.interaction.activeDragComponentId !== componentId) {
        return {
          interaction: {
            ...state.interaction,
            activeDragComponentId: undefined,
            dragPreview: undefined,
          },
        }
      }

      const candidateAnchorMm =
        anchorMm ??
        state.interaction.dragPreview?.candidateAnchorMm ??
        component.anchorMm
      const dragLeaderId = state.interaction.dragPreview?.componentId ?? componentId
      const dragLeader =
        state.scene.components.find((item) => item.id === dragLeaderId) ?? component
      const directAttachmentDrag =
        !!component.attachment &&
        state.interaction.dragPreview?.componentIds?.length === 1 &&
        state.interaction.dragPreview.componentIds[0] === component.id
      const canResolveSingleAttachment =
        state.interaction.dragPreview?.componentIds?.length === 1

      if (directAttachmentDrag) {
        const attachmentCandidate = resolveStageAttachmentCandidate({
          candidateAnchorMm,
          component,
          lockedParentComponentId: component.attachment?.parentComponentId,
          lockedSiteId: component.attachment?.parentMountSiteId,
          scene: state.scene,
        })

        if (!attachmentCandidate) {
          return {
            interaction: {
              ...state.interaction,
              activeDragComponentId: undefined,
              dragPreview: undefined,
            },
          }
        }

        const nextScene = syncAttachedComponentTransforms({
          ...state.scene,
          components: state.scene.components.map((item) =>
            item.id === component.id
              ? {
                  ...item,
                  attachment: attachmentCandidate.attachment,
                  anchorMm: attachmentCandidate.anchorMm,
                  hostSurfaceId: attachmentCandidate.hostSurfaceId,
                  rotationQuarterTurns: attachmentCandidate.rotationQuarterTurns,
                }
              : item,
          ),
        })
        const nextHighlightBoundsMm = state.interaction.highlightSelection
          ? getHighlightSelectionBounds(nextScene, state.interaction.highlightSelection)
          : undefined

        return withCommittedScene(state, {
          scene: nextScene,
          interaction: {
            ...state.interaction,
            activeDragComponentId: undefined,
            activeHostSurfaceId: component.hostSurfaceId,
            dragPreview: undefined,
            highlightSelection:
              state.interaction.highlightSelection && nextHighlightBoundsMm
                ? {
                    ...state.interaction.highlightSelection,
                    boundsMm: nextHighlightBoundsMm,
                  }
                : state.interaction.highlightSelection,
            notice: 'Mounted optic moved on stage.',
          },
        })
      }

      if (canResolveSingleAttachment) {
        const attachmentCandidate = resolveStageAttachmentCandidate({
          candidateAnchorMm,
          component: dragLeader,
          scene: state.scene,
        })

        if (attachmentCandidate) {
          const nextScene = syncAttachedComponentTransforms({
            ...state.scene,
            components: state.scene.components.map((item) =>
              item.id === dragLeader.id
                ? {
                    ...item,
                    attachment: attachmentCandidate.attachment,
                    anchorMm: attachmentCandidate.anchorMm,
                    hostSurfaceId: attachmentCandidate.hostSurfaceId,
                    rotationQuarterTurns: attachmentCandidate.rotationQuarterTurns,
                  }
                : item,
            ),
          })
          const nextHighlightBoundsMm = state.interaction.highlightSelection
            ? getHighlightSelectionBounds(nextScene, state.interaction.highlightSelection)
            : undefined

          return withCommittedScene(state, {
            scene: nextScene,
            interaction: {
              ...state.interaction,
              activeDragComponentId: undefined,
              activeHostSurfaceId: attachmentCandidate.hostSurfaceId,
              dragPreview: undefined,
              highlightSelection:
                state.interaction.highlightSelection && nextHighlightBoundsMm
                  ? {
                      ...state.interaction.highlightSelection,
                      boundsMm: nextHighlightBoundsMm,
                    }
                  : state.interaction.highlightSelection,
              notice: 'Mounted optic attached to stage.',
            },
          })
        }
      }

      const retargetedComponent = retargetComponentHostSurfaceAtPoint(
        state.scene,
        {
          ...dragLeader,
          hostSurfaceId:
            state.interaction.dragPreview?.hostSurfaceId ?? dragLeader.hostSurfaceId,
        },
        candidateAnchorMm,
      )
      const guidedAnchorMm = retargetedComponent.config.source
        ? getSourceGuideAdjustedAnchorMm(
            state.scene,
            retargetedComponent,
            candidateAnchorMm,
          )
        : candidateAnchorMm
      const previewComponent = retargetComponentHostSurfaceAtPoint(
        state.scene,
        retargetedComponent,
        guidedAnchorMm,
      )

      const placement = resolvePlacementForScene({
        candidateAnchorMm: guidedAnchorMm,
        component: previewComponent,
        phase: 'drop',
        scene: state.scene,
        snapMode: state.snapMode,
      })

      const draggedComponentIds =
        state.interaction.dragPreview?.componentIds?.length
          ? state.interaction.dragPreview.componentIds
          : [dragLeaderId]
      const draggedComponentIdSet = new Set(draggedComponentIds)
      const dragDeltaMm = {
        x: roundMm(placement.resolvedAnchorMm.x - dragLeader.anchorMm.x),
        y: roundMm(placement.resolvedAnchorMm.y - dragLeader.anchorMm.y),
      }
      const nextScene = {
        ...state.scene,
        components: state.scene.components.map((item) => {
          if (!draggedComponentIdSet.has(item.id)) {
            return item
          }

          if (item.id === dragLeaderId) {
            return {
              ...item,
              anchorMm: placement.resolvedAnchorMm,
              hostSurfaceId: previewComponent.hostSurfaceId,
            }
          }

          return {
            ...item,
            anchorMm: {
              x: roundMm(item.anchorMm.x + dragDeltaMm.x),
              y: roundMm(item.anchorMm.y + dragDeltaMm.y),
            },
          }
        }),
      }
      const nextHighlightBoundsMm = state.interaction.highlightSelection
        ? getHighlightSelectionBounds(nextScene, state.interaction.highlightSelection)
        : undefined

      return withCommittedScene(state, {
        scene: nextScene,
        interaction: {
          ...state.interaction,
          activeHostSurfaceId: previewComponent.hostSurfaceId,
          focusedBreadboardId:
            previewComponent.hostSurfaceId &&
            previewComponent.hostSurfaceId !== OPTICAL_TABLE_SURFACE_ID
              ? previewComponent.hostSurfaceId
              : state.interaction.focusedBreadboardId,
          activeDragComponentId: undefined,
          dragPreview: undefined,
          highlightSelection:
            state.interaction.highlightSelection && nextHighlightBoundsMm
              ? {
                  ...state.interaction.highlightSelection,
                  boundsMm: nextHighlightBoundsMm,
                }
              : state.interaction.highlightSelection,
          notice: describePlacementReason(placement.reason),
        },
      })
    })
  },

  cancelActiveInteraction: () => {
    set((state) => ({
      interaction: clearHighlightInteractionState({
        ...state.interaction,
        activeDragComponentId: undefined,
        breadboardDragPreview: undefined,
        dragPreview: undefined,
        editingTextAnnotationId: undefined,
        editingTextDraftText: undefined,
        pendingPlacement: undefined,
        pendingBreadboardPlacement: undefined,
        hoveredBeamSegmentId: undefined,
        isPointerPanning: false,
        isSpacePanning: false,
        isHelpOpen: false,
        isWarningsOpen: false,
        selectedWarningId: undefined,
        lineDrawStartMm: undefined,
        notice: undefined,
      }),
    }))
  },

  deleteSelectedComponent: () => {
    set((state) => {
      if (state.selection.type !== 'component') {
        return state
      }

      const selectedComponentId = state.selection.componentId
      const deletedComponentIdSet = new Set(
        getComponentTreeIds(state.scene, selectedComponentId),
      )

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: state.scene.components.filter(
            (component) => !deletedComponentIdSet.has(component.id),
          ),
        },
        selection: getDefaultSelection(state.scene),
        interaction: {
          ...state.interaction,
          activeDragComponentId: undefined,
          dragPreview: undefined,
          pendingBreadboardPlacement: undefined,
          notice: undefined,
        },
      })
    })
  },

  clearSurfaceContent: ({
    surfaceId,
    clearComponents,
    clearShapes,
    clearText,
    clearLines,
  }) => {
    set((state) => {
      const targetSurfaceId =
        state.scene.workspace.kind === 'single-breadboard'
          ? SINGLE_BREADBOARD_SURFACE_ID
          : surfaceId
      const surfaceBounds = getSurfaceBoundsForClear(state.scene, targetSurfaceId)

      if (!surfaceBounds) {
        return state
      }

      const nextComponents = clearComponents
        ? state.scene.components.filter((component) => {
            const componentSurfaceId =
              component.hostSurfaceId ??
              (state.scene.workspace.kind === 'single-breadboard'
                ? SINGLE_BREADBOARD_SURFACE_ID
                : undefined)
            return componentSurfaceId !== targetSurfaceId
          })
        : state.scene.components

      const nextAnnotations = state.scene.annotations.filter((annotation) => {
        if (
          (annotation.kind === 'line' && !clearLines) ||
          (annotation.kind === 'text' && !clearText) ||
          (annotation.kind === 'shape' && !clearShapes)
        ) {
          return true
        }

        return !doBoundsIntersect(getAnnotationBoundsMm(annotation), surfaceBounds)
      })

      if (
        nextComponents.length === state.scene.components.length &&
        nextAnnotations.length === state.scene.annotations.length
      ) {
        return state
      }

      const nextScene = {
        ...state.scene,
        components: nextComponents,
        annotations: reindexAnnotations(nextAnnotations),
      }

      return withCommittedScene(state, {
        scene: nextScene,
        selection: getDefaultSelection(nextScene),
        interaction: {
          ...state.interaction,
          activeDragComponentId: undefined,
          dragPreview: undefined,
          editingTextAnnotationId: undefined,
          editingTextDraftText: undefined,
          notice: undefined,
        },
      })
    })
  },

  duplicateSelectedComponent: () => {
    set((state) => {
      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent) {
        return state
      }

      const selectedTreeIds = getComponentTreeIds(state.scene, selectedComponent.id)
      const selectedTreeIdSet = new Set(selectedTreeIds)
      const selectedTree = state.scene.components.filter((component) =>
        selectedTreeIdSet.has(component.id),
      )
      const duplicateIdMap = new Map(
        selectedTree.map((component) => [component.id, createComponentId(component.type)]),
      )
      const rootDuplicateId = duplicateIdMap.get(selectedComponent.id) ?? createComponentId(selectedComponent.type)

      let rootAnchorMm = selectedComponent.anchorMm
      let rootHostSurfaceId = selectedComponent.hostSurfaceId
      let rootRotationQuarterTurns = selectedComponent.rotationQuarterTurns
      let rootAttachment = selectedComponent.attachment
      let notice: string | undefined

      if (selectedComponent.attachment) {
        const attachmentCandidate = resolveStageAttachmentCandidate({
          candidateAnchorMm: {
            x: roundMm(selectedComponent.anchorMm.x + 8),
            y: roundMm(selectedComponent.anchorMm.y + 8),
          },
          component: {
            ...selectedComponent,
            id: rootDuplicateId,
          },
          lockedParentComponentId: selectedComponent.attachment.parentComponentId,
          lockedSiteId: selectedComponent.attachment.parentMountSiteId,
          scene: state.scene,
        })

        if (!attachmentCandidate) {
          return {
            interaction: {
              ...state.interaction,
              notice: 'No nearby duplicate placement was available.',
            },
          }
        }

        rootAnchorMm = attachmentCandidate.anchorMm
        rootHostSurfaceId = attachmentCandidate.hostSurfaceId
        rootRotationQuarterTurns = attachmentCandidate.rotationQuarterTurns
        rootAttachment = attachmentCandidate.attachment
        notice = 'Mounted optic duplicated on stage.'
      } else {
        const surface = getSurfacePlacementModel(
          state.scene,
          selectedComponent.hostSurfaceId ?? getDefaultSurfaceId(state.scene),
        )
        const placement = findDuplicatePlacement({
          breadboard: surface.breadboard,
          component: {
            ...selectedComponent,
            anchorMm: {
              x: selectedComponent.anchorMm.x - surface.originMm.x,
              y: selectedComponent.anchorMm.y - surface.originMm.y,
            },
          },
          components: state.scene.components
            .filter(
              (component) =>
                (component.hostSurfaceId ?? undefined) ===
                (selectedComponent.hostSurfaceId ?? undefined),
            )
            .map((component) => ({
              ...component,
              anchorMm: {
                x: component.anchorMm.x - surface.originMm.x,
                y: component.anchorMm.y - surface.originMm.y,
              },
            })),
        })

        if (!placement) {
          return {
            interaction: {
              ...state.interaction,
              notice: 'No nearby duplicate placement was available.',
            },
          }
        }

        rootAnchorMm = {
          x: placement.resolvedAnchorMm.x + surface.originMm.x,
          y: placement.resolvedAnchorMm.y + surface.originMm.y,
        }
        rootHostSurfaceId = selectedComponent.hostSurfaceId
        rootRotationQuarterTurns = selectedComponent.rotationQuarterTurns
        rootAttachment = undefined
        notice = describePlacementReason(placement.reason)
      }

      const rootDeltaMm = {
        x: roundMm(rootAnchorMm.x - selectedComponent.anchorMm.x),
        y: roundMm(rootAnchorMm.y - selectedComponent.anchorMm.y),
      }
      const nextComponentsForLabeling = [...state.scene.components]
      const duplicates = selectedTree.map((component) => {
        const duplicate: ComponentInstance = {
          ...component,
          id: duplicateIdMap.get(component.id) ?? createComponentId(component.type),
          label: createAutoNumberedLabel(
            nextComponentsForLabeling,
            component.type,
            component.variantId,
          ),
          anchorMm: {
            x: roundMm(component.anchorMm.x + rootDeltaMm.x),
            y: roundMm(component.anchorMm.y + rootDeltaMm.y),
          },
          hostSurfaceId: rootHostSurfaceId,
          rotationQuarterTurns: component.id === selectedComponent.id
            ? rootRotationQuarterTurns
            : component.rotationQuarterTurns,
          attachment:
            component.id === selectedComponent.id
              ? rootAttachment
              : component.attachment
                ? {
                    ...component.attachment,
                    parentComponentId:
                      duplicateIdMap.get(component.attachment.parentComponentId) ??
                      component.attachment.parentComponentId,
                  }
                : undefined,
        }

        nextComponentsForLabeling.push(duplicate)
        return duplicate
      })

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: [...state.scene.components, ...duplicates],
        },
        selection: { type: 'component', componentId: rootDuplicateId },
        interaction: {
          ...state.interaction,
          notice,
        },
      })
    })
  },

  deleteSelectedAnnotation: () => {
    set((state) => {
      if (state.selection.type !== 'annotation') {
        return state
      }

      const selectedAnnotationId = state.selection.annotationId

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          annotations: state.scene.annotations.filter(
            (annotation) => annotation.id !== selectedAnnotationId,
          ),
        },
        selection: getDefaultSelection(state.scene),
        interaction: {
          ...state.interaction,
          editingTextAnnotationId:
            state.interaction.editingTextAnnotationId === selectedAnnotationId
              ? undefined
              : state.interaction.editingTextAnnotationId,
          notice: undefined,
        },
      })
    })
  },

  duplicateSelectedAnnotation: () => {
    set((state) => {
      const selectedAnnotation = getSelectedAnnotation(state.scene, state.selection)

      if (!selectedAnnotation) {
        return state
      }

      const duplicate = translateAnnotation(
        {
          ...selectedAnnotation,
          id: createAnnotationId(selectedAnnotation.kind),
          zIndex: getNextAnnotationZIndex(state.scene),
        } as SceneAnnotation,
        { x: 14, y: 14 },
      )

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          annotations: reindexAnnotations([...state.scene.annotations, duplicate]),
        },
        selection: { type: 'annotation', annotationId: duplicate.id },
        interaction: {
          ...state.interaction,
          editingTextAnnotationId: undefined,
          editingTextDraftText: undefined,
          notice: undefined,
        },
      })
    })
  },

  updateSelectedComponent: (update) => {
    set((state) => {
      if (state.interaction.pendingPlacement) {
        const pendingPlacement = state.interaction.pendingPlacement
        const nextRotationQuarterTurns =
          update.rotationQuarterTurns === undefined
            ? pendingPlacement.draft.rotationQuarterTurns
            : (normalizeQuarterTurns(update.rotationQuarterTurns) as QuarterTurn)
        const nextAnchorMm = update.anchorMm ?? pendingPlacement.candidateAnchorMm
        const nextDraft = {
          ...pendingPlacement.draft,
          label: update.label ?? pendingPlacement.draft.label,
          anchorMm: nextAnchorMm,
          finishId: update.finishId ?? pendingPlacement.draft.finishId,
          materialId: update.materialId ?? pendingPlacement.draft.materialId,
          rotationQuarterTurns: nextRotationQuarterTurns,
        }
        const placement = resolvePlacementForScene({
          candidateAnchorMm: nextAnchorMm,
          component: nextDraft,
          phase: 'drop',
          rotationQuarterTurns: nextRotationQuarterTurns,
          scene: state.scene,
          snapMode: state.snapMode,
        })

        return {
          interaction: {
            ...state.interaction,
            pendingPlacement: {
              draft: nextDraft,
              candidateAnchorMm: nextAnchorMm,
            },
            notice: describePlacementReason(placement.reason),
          },
        }
      }

      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent) {
        return state
      }

      const nextRotationQuarterTurns =
        update.rotationQuarterTurns === undefined
          ? selectedComponent.rotationQuarterTurns
          : (normalizeQuarterTurns(update.rotationQuarterTurns) as QuarterTurn)
      const nextAnchorMm = update.anchorMm ?? selectedComponent.anchorMm
      const provisionalComponent = {
        ...selectedComponent,
        label: update.label ?? selectedComponent.label,
        anchorMm: nextAnchorMm,
        finishId: update.finishId ?? selectedComponent.finishId,
        materialId: update.materialId ?? selectedComponent.materialId,
        rotationQuarterTurns: nextRotationQuarterTurns,
      }

      if (selectedComponent.attachment) {
        const attachmentCandidate = resolveStageAttachmentCandidate({
          candidateAnchorMm: nextAnchorMm,
          component: provisionalComponent,
          lockedParentComponentId: selectedComponent.attachment.parentComponentId,
          lockedSiteId: selectedComponent.attachment.parentMountSiteId,
          scene: state.scene,
        })

        if (!attachmentCandidate) {
          return {
            interaction: {
              ...state.interaction,
              notice: 'Mounted optic no longer fits on this stage seat.',
            },
          }
        }

        return withCommittedScene(
          state,
          {
            scene: {
              ...state.scene,
              components: state.scene.components.map((component) =>
                component.id === selectedComponent.id
                  ? {
                      ...component,
                      label: update.label ?? component.label,
                      attachment: attachmentCandidate.attachment,
                      anchorMm: attachmentCandidate.anchorMm,
                      finishId: update.finishId ?? component.finishId,
                      hostSurfaceId: attachmentCandidate.hostSurfaceId,
                      materialId: update.materialId ?? component.materialId,
                      rotationQuarterTurns: attachmentCandidate.rotationQuarterTurns,
                    }
                  : component,
              ),
            },
            interaction: {
              ...state.interaction,
              notice: 'Mounted optic updated on stage.',
            },
          },
          update.rotationQuarterTurns === undefined
            ? { mergeKey: `component:${selectedComponent.id}` }
            : undefined,
        )
      }

      const placement = resolvePlacementForScene({
        candidateAnchorMm: nextAnchorMm,
        component: selectedComponent,
        phase: 'drop',
        rotationQuarterTurns: nextRotationQuarterTurns,
        scene: state.scene,
        snapMode: state.snapMode,
      })
      const mergeKey =
        update.rotationQuarterTurns === undefined
          ? `component:${selectedComponent.id}`
          : undefined

      return withCommittedScene(
        state,
        {
          scene: {
            ...state.scene,
            components: state.scene.components.map((component) =>
              component.id === selectedComponent.id
                ? {
                    ...component,
                    label: update.label ?? component.label,
                    anchorMm: placement.resolvedAnchorMm,
                    finishId: update.finishId ?? component.finishId,
                    materialId: update.materialId ?? component.materialId,
                    rotationQuarterTurns: nextRotationQuarterTurns,
                  }
                : component,
            ),
          },
          interaction: {
            ...state.interaction,
            notice: describePlacementReason(placement.reason),
          },
        },
        mergeKey ? { mergeKey } : undefined,
      )
    })
  },

  updateSelectedVariant: (variantId) => {
    set((state) => {
      if (state.interaction.pendingPlacement) {
        const pendingPlacement = state.interaction.pendingPlacement
        const includeMount = pendingPlacement.draft.config.support?.includeMount
        let nextDraft: ComponentInstance = {
          ...pendingPlacement.draft,
          variantId,
          config: mergeComponentConfig(
            createDefaultComponentConfig(pendingPlacement.draft.type, variantId),
            includeMount !== undefined
              ? {
                  support: {
                    includeMount,
                  },
                }
              : {},
          ),
        }

        if (nextDraft.config.source) {
          const aligned = applySourceLane(
            state.scene,
            nextDraft,
            nextDraft.config.source.lane,
            nextDraft.config.source.firstTargetComponentId,
          )

          nextDraft = {
            ...nextDraft,
            anchorMm: aligned.anchorMm,
            rotationQuarterTurns: aligned.rotationQuarterTurns,
          }
        }

        return {
          interaction: {
            ...state.interaction,
            pendingPlacement: {
              draft: nextDraft,
              candidateAnchorMm: nextDraft.anchorMm,
            },
          },
        }
      }

      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent) {
        return state
      }

      const includeMount = selectedComponent.config.support?.includeMount
      let nextComponent: ComponentInstance = {
        ...selectedComponent,
        variantId,
        config: mergeComponentConfig(
          createDefaultComponentConfig(selectedComponent.type, variantId),
          includeMount !== undefined
            ? {
                support: {
                  includeMount,
                },
              }
            : {},
        ),
      }

      if (nextComponent.config.source) {
        const aligned = applySourceLane(
          state.scene,
          nextComponent,
          nextComponent.config.source.lane,
          nextComponent.config.source.firstTargetComponentId,
        )

        nextComponent = {
          ...nextComponent,
          anchorMm: aligned.anchorMm,
          rotationQuarterTurns: aligned.rotationQuarterTurns,
        }
      }

      if (selectedComponent.attachment) {
        const attachmentCandidate = resolveStageAttachmentCandidate({
          candidateAnchorMm: nextComponent.anchorMm,
          component: nextComponent,
          lockedParentComponentId: selectedComponent.attachment.parentComponentId,
          lockedSiteId: selectedComponent.attachment.parentMountSiteId,
          scene: state.scene,
        })

        if (!attachmentCandidate) {
          return {
            interaction: {
              ...state.interaction,
              notice: 'Selected variant no longer fits on this stage seat.',
            },
          }
        }

        nextComponent = {
          ...nextComponent,
          attachment: attachmentCandidate.attachment,
          anchorMm: attachmentCandidate.anchorMm,
          hostSurfaceId: attachmentCandidate.hostSurfaceId,
          rotationQuarterTurns: attachmentCandidate.rotationQuarterTurns,
        }
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === nextComponent.id ? nextComponent : component,
          ),
        },
      })
    })
  },

  updateSelectedSource: (update) => {
    set((state) => {
      if (state.interaction.pendingPlacement?.draft.config.source) {
        const pendingPlacement = state.interaction.pendingPlacement
        const pendingSource = pendingPlacement.draft.config.source!
        const nextSource: SourceConfig = {
          ...pendingSource,
          ...update,
        }
        const nextDraft = {
          ...pendingPlacement.draft,
          config: mergeComponentConfig(pendingPlacement.draft.config, {
            source: nextSource,
          }),
        }
        let resolvedDraft = nextDraft

        if (update.lane || update.firstTargetComponentId) {
          const aligned = applySourceLane(
            state.scene,
            nextDraft,
            nextSource.lane,
            nextSource.firstTargetComponentId,
          )

          resolvedDraft = {
            ...nextDraft,
            anchorMm: aligned.anchorMm,
            rotationQuarterTurns: aligned.rotationQuarterTurns,
          }
        }

        return {
          interaction: {
            ...state.interaction,
            pendingPlacement: {
              draft: resolvedDraft,
              candidateAnchorMm: resolvedDraft.anchorMm,
            },
          },
        }
      }

      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent?.config.source) {
        return state
      }

      const nextSource: SourceConfig = {
        ...selectedComponent.config.source!,
        ...update,
      }
      const nextComponent = {
        ...selectedComponent,
        config: mergeComponentConfig(selectedComponent.config, {
          source: nextSource,
        }),
      }
      let resolvedComponent = nextComponent

      if (update.lane || update.firstTargetComponentId) {
        const aligned = applySourceLane(
          state.scene,
          nextComponent,
          nextSource.lane,
          nextSource.firstTargetComponentId,
        )

        resolvedComponent = {
          ...nextComponent,
          anchorMm: aligned.anchorMm,
          rotationQuarterTurns: aligned.rotationQuarterTurns,
        }
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === resolvedComponent.id ? resolvedComponent : component,
          ),
        },
      }, {
        mergeKey: `source:${selectedComponent.id}`,
      })
    })
  },

  applySelectedSourcePreset: (presetId) => {
    set((state) => {
      if (state.interaction.pendingPlacement?.draft.config.source) {
        const pendingPlacement = state.interaction.pendingPlacement
        const preset = getSourcePreset(presetId)
        const pendingSource = pendingPlacement.draft.config.source!
        const nextSource: SourceConfig = {
          ...pendingSource,
          presetId: preset.id,
          wavelengthNm: preset.wavelengthNm,
          bandwidthNm: preset.bandwidthNm,
          powerMw: preset.powerMw,
          beamDiameterMm: preset.beamDiameterMm,
          divergenceMrad: preset.divergenceMrad,
        }

        return {
          interaction: {
            ...state.interaction,
            pendingPlacement: {
              ...pendingPlacement,
              draft: {
                ...pendingPlacement.draft,
                config: mergeComponentConfig(pendingPlacement.draft.config, {
                  source: nextSource,
                }),
              },
            },
          },
        }
      }

      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent?.config.source) {
        return state
      }

      const preset = getSourcePreset(presetId)
      const nextSource: SourceConfig = {
        ...selectedComponent.config.source!,
        presetId: preset.id,
        wavelengthNm: preset.wavelengthNm,
        bandwidthNm: preset.bandwidthNm,
        powerMw: preset.powerMw,
        beamDiameterMm: preset.beamDiameterMm,
        divergenceMrad: preset.divergenceMrad,
      }
      const nextComponent = {
        ...selectedComponent,
        config: mergeComponentConfig(selectedComponent.config, {
          source: nextSource,
        }),
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === nextComponent.id ? nextComponent : component,
          ),
        },
      })
    })
  },

  alignSelectedSourceToTarget: () => {
    set((state) => {
      if (state.interaction.pendingPlacement?.draft.config.source) {
        const pendingPlacement = state.interaction.pendingPlacement
        const pendingSource = pendingPlacement.draft.config.source!
        const aligned = applySourceLane(
          state.scene,
          pendingPlacement.draft,
          pendingSource.lane,
          pendingSource.firstTargetComponentId,
        )

        return {
          interaction: {
            ...state.interaction,
            pendingPlacement: {
              draft: {
                ...pendingPlacement.draft,
                anchorMm: aligned.anchorMm,
                rotationQuarterTurns: aligned.rotationQuarterTurns,
              },
              candidateAnchorMm: aligned.anchorMm,
            },
          },
        }
      }

      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent?.config.source) {
        return state
      }

      const aligned = applySourceLane(
        state.scene,
        selectedComponent,
        selectedComponent.config.source.lane,
        selectedComponent.config.source.firstTargetComponentId,
      )

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === selectedComponent.id
              ? {
                  ...component,
                  anchorMm: aligned.anchorMm,
                  rotationQuarterTurns: aligned.rotationQuarterTurns,
                }
              : component,
          ),
        },
      })
    })
  },

  updateSelectedBeamSplitter: (update) => {
    set((state) => {
      if (state.interaction.pendingPlacement?.draft.type === 'beamsplitter') {
        const pendingPlacement = state.interaction.pendingPlacement

        return {
          interaction: {
            ...state.interaction,
            pendingPlacement: {
              ...pendingPlacement,
              draft: {
                ...pendingPlacement.draft,
                config: mergeComponentConfig(pendingPlacement.draft.config, {
                  beamSplitter: {
                    ...pendingPlacement.draft.config.beamSplitter,
                    ...update,
                  },
                }),
              },
            },
          },
        }
      }

      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent || selectedComponent.type !== 'beamsplitter') {
        return state
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === selectedComponent.id
              ? {
                  ...component,
                  config: mergeComponentConfig(component.config, {
                    beamSplitter: {
                      ...component.config.beamSplitter,
                      ...update,
                    },
                  }),
                }
              : component,
          ),
        },
      }, {
        mergeKey: `beam-splitter:${selectedComponent.id}`,
      })
    })
  },

  updateSelectedLens: (update) => {
    set((state) => {
      if (state.interaction.pendingPlacement?.draft.type === 'lens') {
        const pendingPlacement = state.interaction.pendingPlacement

        return {
          interaction: {
            ...state.interaction,
            pendingPlacement: {
              ...pendingPlacement,
              draft: {
                ...pendingPlacement.draft,
                config: mergeComponentConfig(pendingPlacement.draft.config, {
                  lens: {
                    ...pendingPlacement.draft.config.lens,
                    ...update,
                  },
                }),
              },
            },
          },
        }
      }

      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent || selectedComponent.type !== 'lens') {
        return state
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === selectedComponent.id
              ? {
                  ...component,
                  config: mergeComponentConfig(component.config, {
                    lens: {
                      ...component.config.lens,
                      ...update,
                    },
                  }),
                }
              : component,
          ),
        },
      }, {
        mergeKey: `lens:${selectedComponent.id}`,
      })
    })
  },

  updateSelectedCurvedMirror: (update) => {
    set((state) => {
      if (state.interaction.pendingPlacement?.draft.type === 'mirror' || state.interaction.pendingPlacement?.draft.type === 'curved-mirror') {
        const pendingPlacement = state.interaction.pendingPlacement

        return {
          interaction: {
            ...state.interaction,
            pendingPlacement: {
              ...pendingPlacement,
              draft: {
                ...pendingPlacement.draft,
                config: mergeComponentConfig(pendingPlacement.draft.config, {
                  curvedMirror: {
                    ...pendingPlacement.draft.config.curvedMirror,
                    ...update,
                  },
                }),
              },
            },
          },
        }
      }

      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent || (selectedComponent.type !== 'mirror' && selectedComponent.type !== 'curved-mirror')) {
        return state
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === selectedComponent.id
              ? {
                  ...component,
                  config: mergeComponentConfig(component.config, {
                    curvedMirror: {
                      ...component.config.curvedMirror,
                      ...update,
                    },
                  }),
                }
              : component,
          ),
        },
      }, {
        mergeKey: `curved-mirror:${selectedComponent.id}`,
      })
    })
  },

  updateSelectedFlipMirror: (update) => {
    set((state) => {
      if (
        state.interaction.pendingPlacement?.draft.type === 'mirror' &&
        state.interaction.pendingPlacement.draft.variantId === 'flip-mirror'
      ) {
        const pendingPlacement = state.interaction.pendingPlacement

        return {
          interaction: {
            ...state.interaction,
            pendingPlacement: {
              ...pendingPlacement,
              draft: {
                ...pendingPlacement.draft,
                config: mergeComponentConfig(pendingPlacement.draft.config, {
                  flipMirror: {
                    ...pendingPlacement.draft.config.flipMirror,
                    ...update,
                  },
                }),
              },
            },
          },
        }
      }

      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (
        !selectedComponent ||
        selectedComponent.type !== 'mirror' ||
        selectedComponent.variantId !== 'flip-mirror'
      ) {
        return state
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === selectedComponent.id
              ? {
                  ...component,
                  config: mergeComponentConfig(component.config, {
                    flipMirror: {
                      ...component.config.flipMirror,
                      ...update,
                    },
                  }),
                }
              : component,
          ),
        },
      }, {
        mergeKey: `flip-mirror:${selectedComponent.id}`,
      })
    })
  },

  updateSelectedAttenuator: (update) => {
    set((state) => {
      if (state.interaction.pendingPlacement?.draft.type === 'attenuator') {
        const pendingPlacement = state.interaction.pendingPlacement

        return {
          interaction: {
            ...state.interaction,
            pendingPlacement: {
              ...pendingPlacement,
              draft: {
                ...pendingPlacement.draft,
                config: mergeComponentConfig(pendingPlacement.draft.config, {
                  attenuator: {
                    ...pendingPlacement.draft.config.attenuator,
                    ...update,
                  },
                }),
              },
            },
          },
        }
      }

      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent || selectedComponent.type !== 'attenuator') {
        return state
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === selectedComponent.id
              ? {
                  ...component,
                  config: mergeComponentConfig(component.config, {
                    attenuator: {
                      ...component.config.attenuator,
                      ...update,
                    },
                  }),
                }
              : component,
          ),
        },
      }, {
        mergeKey: `attenuator:${selectedComponent.id}`,
      })
    })
  },

  updateSelectedPolarizer: (update) => {
    set((state) => {
      if (state.interaction.pendingPlacement?.draft.type === 'polarizer') {
        const pendingPlacement = state.interaction.pendingPlacement

        return {
          interaction: {
            ...state.interaction,
            pendingPlacement: {
              ...pendingPlacement,
              draft: {
                ...pendingPlacement.draft,
                config: mergeComponentConfig(pendingPlacement.draft.config, {
                  polarizer: {
                    ...pendingPlacement.draft.config.polarizer,
                    ...update,
                  },
                }),
              },
            },
          },
        }
      }

      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent || selectedComponent.type !== 'polarizer') {
        return state
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === selectedComponent.id
              ? {
                  ...component,
                  config: mergeComponentConfig(component.config, {
                    polarizer: {
                      ...component.config.polarizer,
                      ...update,
                    },
                  }),
                }
              : component,
          ),
        },
      }, {
        mergeKey: `polarizer:${selectedComponent.id}`,
      })
    })
  },

  updateSelectedWaveplate: (update) => {
    set((state) => {
      if (state.interaction.pendingPlacement?.draft.type === 'waveplate') {
        const pendingPlacement = state.interaction.pendingPlacement

        return {
          interaction: {
            ...state.interaction,
            pendingPlacement: {
              ...pendingPlacement,
              draft: {
                ...pendingPlacement.draft,
                config: mergeComponentConfig(pendingPlacement.draft.config, {
                  waveplate: {
                    ...pendingPlacement.draft.config.waveplate,
                    ...update,
                  },
                }),
              },
            },
          },
        }
      }

      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent || selectedComponent.type !== 'waveplate') {
        return state
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === selectedComponent.id
              ? {
                  ...component,
                  config: mergeComponentConfig(component.config, {
                    waveplate: {
                      ...component.config.waveplate,
                      ...update,
                    },
                  }),
                }
              : component,
          ),
        },
      }, {
        mergeKey: `waveplate:${selectedComponent.id}`,
      })
    })
  },

  updateSelectedIris: (update) => {
    set((state) => {
      if (state.interaction.pendingPlacement?.draft.type === 'iris') {
        const pendingPlacement = state.interaction.pendingPlacement
        const spec = getResolvedComponentSpec(
          pendingPlacement.draft.type,
          pendingPlacement.draft.variantId,
        )
        const nextApertureMm = Math.min(
          update.apertureMm ?? pendingPlacement.draft.config.iris?.apertureMm ?? 10,
          spec.physics.kind === 'iris' ? spec.physics.maxApertureMm : 25,
        )

        return {
          interaction: {
            ...state.interaction,
            pendingPlacement: {
              ...pendingPlacement,
              draft: {
                ...pendingPlacement.draft,
                config: mergeComponentConfig(pendingPlacement.draft.config, {
                  iris: {
                    apertureMm: nextApertureMm,
                  },
                }),
              },
            },
          },
        }
      }

      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent || selectedComponent.type !== 'iris') {
        return state
      }

      const spec = getResolvedComponentSpec(
        selectedComponent.type,
        selectedComponent.variantId,
      )
      const nextApertureMm = Math.min(
        update.apertureMm ?? selectedComponent.config.iris?.apertureMm ?? 10,
        spec.physics.kind === 'iris' ? spec.physics.maxApertureMm : 25,
      )

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === selectedComponent.id
              ? {
                  ...component,
                  config: mergeComponentConfig(component.config, {
                    iris: {
                      apertureMm: nextApertureMm,
                    },
                  }),
                }
              : component,
          ),
        },
      }, {
        mergeKey: `iris:${selectedComponent.id}`,
      })
    })
  },

  updateSelectedBboCrystal: (update) => {
    set((state) => {
      if (state.interaction.pendingPlacement?.draft.type === 'bbo-crystal') {
        const pendingPlacement = state.interaction.pendingPlacement

        return {
          interaction: {
            ...state.interaction,
            pendingPlacement: {
              ...pendingPlacement,
              draft: {
                ...pendingPlacement.draft,
                config: mergeComponentConfig(pendingPlacement.draft.config, {
                  bboCrystal: {
                    ...pendingPlacement.draft.config.bboCrystal,
                    ...update,
                  },
                }),
              },
            },
          },
        }
      }

      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent || selectedComponent.type !== 'bbo-crystal') {
        return state
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === selectedComponent.id
              ? {
                  ...component,
                  config: mergeComponentConfig(component.config, {
                    bboCrystal: {
                      ...component.config.bboCrystal,
                      ...update,
                    },
                  }),
                }
              : component,
          ),
        },
      }, {
        mergeKey: `bbo-crystal:${selectedComponent.id}`,
      })
    })
  },

  updateSelectedDelayLine: (update) => {
    set((state) => {
      const pendingPlacement = state.interaction.pendingPlacement

      if (
        pendingPlacement &&
        (pendingPlacement.draft.type === 'delay-stage' ||
          pendingPlacement.draft.type === 'support-hardware')
      ) {
        return {
          interaction: {
            ...state.interaction,
            pendingPlacement: {
              ...pendingPlacement,
              draft: {
                ...pendingPlacement.draft,
                config: mergeComponentConfig(pendingPlacement.draft.config, {
                  delayLine: {
                    ...pendingPlacement.draft.config.delayLine,
                    ...update,
                  },
                }),
              },
            },
          },
        }
      }

      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (
        !selectedComponent ||
        (selectedComponent.type !== 'delay-stage' &&
          selectedComponent.type !== 'support-hardware')
      ) {
        return state
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === selectedComponent.id
              ? {
                  ...component,
                  config: mergeComponentConfig(component.config, {
                    delayLine: {
                      ...component.config.delayLine,
                      ...update,
                    },
                  }),
                }
              : component,
          ),
        },
      }, {
        mergeKey: `delay-line:${selectedComponent.id}`,
      })
    })
  },

  updateSelectedTelescope: (update) => {
    set((state) => {
      if (state.interaction.pendingPlacement?.draft.type === 'telescope') {
        const pendingPlacement = state.interaction.pendingPlacement

        return {
          interaction: {
            ...state.interaction,
            pendingPlacement: {
              ...pendingPlacement,
              draft: {
                ...pendingPlacement.draft,
                config: mergeComponentConfig(pendingPlacement.draft.config, {
                  telescope: {
                    ...pendingPlacement.draft.config.telescope,
                    ...update,
                  },
                }),
              },
            },
          },
        }
      }

      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent || selectedComponent.type !== 'telescope') {
        return state
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === selectedComponent.id
              ? {
                  ...component,
                  config: mergeComponentConfig(component.config, {
                    telescope: {
                      ...component.config.telescope,
                      ...update,
                    },
                  }),
                }
              : component,
          ),
        },
      }, {
        mergeKey: `telescope:${selectedComponent.id}`,
      })
    })
  },

  updateSelectedOpa: (update) => {
    set((state) => {
      if (state.interaction.pendingPlacement?.draft.type === 'opa-module') {
        const pendingPlacement = state.interaction.pendingPlacement

        return {
          interaction: {
            ...state.interaction,
            pendingPlacement: {
              ...pendingPlacement,
              draft: {
                ...pendingPlacement.draft,
                config: mergeComponentConfig(pendingPlacement.draft.config, {
                  opa: {
                    ...pendingPlacement.draft.config.opa,
                    ...update,
                  },
                }),
              },
            },
          },
        }
      }

      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent || selectedComponent.type !== 'opa-module') {
        return state
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === selectedComponent.id
              ? {
                  ...component,
                  config: mergeComponentConfig(component.config, {
                    opa: {
                      ...component.config.opa,
                      ...update,
                    },
                  }),
                }
              : component,
          ),
        },
      }, {
        mergeKey: `opa:${selectedComponent.id}`,
      })
    })
  },

  updateSelectedSupport: (includeMount) => {
    set((state) => {
      if (state.interaction.pendingPlacement && supportsMountToggle(state.interaction.pendingPlacement.draft.type)) {
        const pendingPlacement = state.interaction.pendingPlacement

        return {
          interaction: {
            ...state.interaction,
            pendingPlacement: {
              ...pendingPlacement,
              draft: {
                ...pendingPlacement.draft,
                config: mergeComponentConfig(pendingPlacement.draft.config, {
                  support: {
                    includeMount,
                  },
                }),
              },
            },
          },
        }
      }

      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent || !supportsMountToggle(selectedComponent.type)) {
        return state
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === selectedComponent.id
              ? {
                  ...component,
                  config: mergeComponentConfig(component.config, {
                    support: {
                      includeMount,
                    },
                  }),
                }
              : component,
          ),
        },
      })
    })
  },

  updateSelectedGeometryOverride: (update) => {
    set((state) => {
      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent) {
        return state
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === selectedComponent.id
              ? {
                  ...component,
                  geometryOverride: normalizeGeometryOverride(component, update),
                }
              : component,
          ),
        },
      }, {
        mergeKey: `geometry:${selectedComponent.id}`,
      })
    })
  },

  updateSelectedTextAnnotation: (update) => {
    set((state) => {
      const selectedAnnotation = getSelectedAnnotation(state.scene, state.selection)

      if (!selectedAnnotation || !isTextAnnotation(selectedAnnotation)) {
        return state
      }

      const nextVariant = update.variant ?? selectedAnnotation.variant
      const normalizedUpdate =
        update.variant && update.variant !== selectedAnnotation.variant
          ? {
              ...update,
              backgroundColor:
                update.backgroundColor ??
                createDefaultTextAnnotation('__variant__', selectedAnnotation.anchorMm, nextVariant)
                  .backgroundColor,
              borderColor:
                update.borderColor ??
                createDefaultTextAnnotation('__variant__', selectedAnnotation.anchorMm, nextVariant)
                  .borderColor,
              tailMm:
                nextVariant === 'callout-bubble'
                  ? update.tailMm ??
                    createDefaultTextAnnotation('__variant__', selectedAnnotation.anchorMm, nextVariant)
                      .tailMm
                  : undefined,
            }
          : update

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          annotations: updateAnnotationCollection(
            state.scene.annotations,
            selectedAnnotation.id,
            (annotation) =>
              isTextAnnotation(annotation)
                ? applyTextAnnotationUpdate(annotation, normalizedUpdate)
                : annotation,
          ),
        },
      }, {
        mergeKey: `annotation-text:${selectedAnnotation.id}`,
      })
    })
  },

  updateSelectedTextStyle: (update) => {
    set((state) => {
      const selectedAnnotation = getSelectedAnnotation(state.scene, state.selection)

      if (!selectedAnnotation || !isTextAnnotation(selectedAnnotation)) {
        return state
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          annotations: updateAnnotationCollection(
            state.scene.annotations,
            selectedAnnotation.id,
            (annotation) =>
              isTextAnnotation(annotation)
                ? applyTextAnnotationStyle(annotation, update)
                : annotation,
          ),
        },
      }, {
        mergeKey: `annotation-style:${selectedAnnotation.id}`,
      })
    })
  },

  updateSelectedShapeAnnotation: (update) => {
    set((state) => {
      const selectedAnnotation = getSelectedAnnotation(state.scene, state.selection)

      if (!selectedAnnotation || !isShapeAnnotation(selectedAnnotation)) {
        return state
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          annotations: updateAnnotationCollection(
            state.scene.annotations,
            selectedAnnotation.id,
            (annotation) =>
              isShapeAnnotation(annotation)
                ? applyShapeAnnotationUpdate(annotation, update)
                : annotation,
          ),
        },
      }, {
        mergeKey: `annotation-shape:${selectedAnnotation.id}`,
      })
    })
  },

  updateSelectedShapeStyle: (update) => {
    set((state) => {
      const selectedAnnotation = getSelectedAnnotation(state.scene, state.selection)

      if (!selectedAnnotation || !isShapeAnnotation(selectedAnnotation)) {
        return state
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          annotations: updateAnnotationCollection(
            state.scene.annotations,
            selectedAnnotation.id,
            (annotation) => {
              if (!isShapeAnnotation(annotation)) {
                return annotation
              }

              const reshaped = update.shapeKind
                ? convertShapeKind(annotation, update.shapeKind)
                : annotation

              return {
                ...reshaped,
                strokeColor: update.strokeColor ?? reshaped.strokeColor,
                fillColor: update.fillColor ?? reshaped.fillColor,
                strokeWidthMm:
                  update.strokeWidthMm !== undefined
                    ? Math.max(0.2, roundMm(update.strokeWidthMm))
                    : reshaped.strokeWidthMm,
              }
            },
          ),
        },
      }, {
        mergeKey: `annotation-shape-style:${selectedAnnotation.id}`,
      })
    })
  },

  updateSelectedAnnotationVisibility: (hidden) => {
    set((state) => {
      const selectedAnnotation = getSelectedAnnotation(state.scene, state.selection)

      if (!selectedAnnotation) {
        return state
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          annotations: updateAnnotationCollection(
            state.scene.annotations,
            selectedAnnotation.id,
            (annotation) => updateAnnotationVisibility(annotation, hidden),
          ),
        },
      })
    })
  },

  updateSelectedAnnotationLock: (locked) => {
    set((state) => {
      const selectedAnnotation = getSelectedAnnotation(state.scene, state.selection)

      if (!selectedAnnotation) {
        return state
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          annotations: updateAnnotationCollection(
            state.scene.annotations,
            selectedAnnotation.id,
            (annotation) => updateAnnotationLock(annotation, locked),
          ),
        },
      })
    })
  },

  updateSelectedAnnotationLayerBand: (layerBand) => {
    set((state) => {
      const selectedAnnotation = getSelectedAnnotation(state.scene, state.selection)

      if (!selectedAnnotation) {
        return state
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          annotations: updateAnnotationCollection(
            state.scene.annotations,
            selectedAnnotation.id,
            (annotation) => updateAnnotationLayerBand(annotation, layerBand),
          ),
        },
      })
    })
  },

  moveSelectedAnnotationInStack: (direction) => {
    set((state) => {
      const selectedAnnotation = getSelectedAnnotation(state.scene, state.selection)

      if (!selectedAnnotation) {
        return state
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          annotations: moveAnnotationInStack(
            state.scene.annotations,
            selectedAnnotation.id,
            direction,
          ),
        },
      })
    })
  },

  stepSelectedAnnotationSize: (direction) => {
    set((state) => {
      const selectedAnnotation = getSelectedAnnotation(state.scene, state.selection)

      if (!selectedAnnotation) {
        return state
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          annotations: updateAnnotationCollection(
            state.scene.annotations,
            selectedAnnotation.id,
            (annotation) =>
              annotation.kind === 'text'
                ? stepTextAnnotationWidth(annotation, direction)
                : annotation.kind === 'shape'
                  ? stepShapeAnnotationSize(annotation, direction)
                  : annotation,
          ),
        },
      }, {
        mergeKey: `annotation-size:${selectedAnnotation.id}`,
      })
    })
  },

  translateSelectedAnnotation: (deltaMm) => {
    set((state) => {
      const selectedAnnotation = getSelectedAnnotation(state.scene, state.selection)

      if (!selectedAnnotation) {
        return state
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          annotations: updateAnnotationCollection(
            state.scene.annotations,
            selectedAnnotation.id,
            (annotation) => translateAnnotation(annotation, deltaMm),
          ),
        },
      }, {
        mergeKey: `annotation-translate:${selectedAnnotation.id}`,
      })
    })
  },

  setShapeToolKind: (shapeToolKind) => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        shapeToolKind,
      },
    }))
  },

  setTextToolVariant: (textToolVariant) => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        textToolVariant,
      },
    }))
  },

  setTextAnnotationDraftText: (text) => {
    set((state) => {
      if (!state.interaction.editingTextAnnotationId) {
        return state
      }

      return {
        interaction: {
          ...state.interaction,
          editingTextDraftText: text,
        },
      }
    })
  },

  startTextAnnotationEditing: (annotationId) => {
    set((state) => {
      const annotation = state.scene.annotations.find((item) => item.id === annotationId)

      if (!annotation || annotation.kind !== 'text') {
        return state
      }

      return {
        selection: { type: 'annotation', annotationId },
        interaction: {
          ...state.interaction,
          activeTool: 'select',
          editingTextAnnotationId: annotationId,
          editingTextDraftText: annotation.text,
          notice: undefined,
        },
      }
    })
  },

  finishTextAnnotationEditing: (text) => {
    set((state) => {
      const annotationId = state.interaction.editingTextAnnotationId

      if (!annotationId) {
        return state
      }

      const selectedAnnotation = state.scene.annotations.find(
        (annotation) => annotation.id === annotationId,
      )

      if (!selectedAnnotation || !isTextAnnotation(selectedAnnotation)) {
        return {
          interaction: {
            ...state.interaction,
            editingTextAnnotationId: undefined,
            editingTextDraftText: undefined,
          },
        }
      }

      const nextText =
        text ??
        state.interaction.editingTextDraftText ??
        selectedAnnotation.text

      if (!nextText.trim()) {
        return withCommittedScene(state, {
          scene: {
            ...state.scene,
            annotations: state.scene.annotations.filter(
              (annotation) => annotation.id !== annotationId,
            ),
          },
          selection: getDefaultSelection(state.scene),
          interaction: {
            ...state.interaction,
            editingTextAnnotationId: undefined,
            editingTextDraftText: undefined,
            notice: undefined,
          },
        })
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          annotations: updateAnnotationCollection(
            state.scene.annotations,
            annotationId,
            (annotation) =>
              isTextAnnotation(annotation)
                ? {
                    ...annotation,
                    text: nextText,
                  }
                : annotation,
          ),
        },
        interaction: {
          ...state.interaction,
          editingTextAnnotationId: undefined,
          editingTextDraftText: undefined,
        },
      }, {
        mergeKey: `annotation-text:${annotationId}`,
      })
    })
  },

  cancelTextAnnotationEditing: () => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        editingTextAnnotationId: undefined,
        editingTextDraftText: undefined,
      },
    }))
  },

  clearSelectedGeometryOverride: () => {
    set((state) => {
      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent || !selectedComponent.geometryOverride) {
        return state
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === selectedComponent.id
              ? {
                  ...component,
                  geometryOverride: undefined,
                }
              : component,
          ),
        },
      }, {
        mergeKey: `geometry:${selectedComponent.id}`,
      })
    })
  },

  updateSelectedPostHolderDiameter: (diameterMm: number) => {
    set((state) => {
      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent || !isPostMountedType(selectedComponent.type)) {
        return state
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === selectedComponent.id
              ? {
                  ...component,
                  config: {
                    ...component.config,
                    postHolderDiameterMm: diameterMm,
                  },
                }
              : component,
          ),
        },
      }, {
        mergeKey: `post-holder-diameter:${selectedComponent.id}`,
      })
    })
  },

  setSelectedSimpleIconStyleOverride: (simpleIconStyleOverride) => {
    set((state) => {
      if (state.interaction.pendingPlacement) {
        return {
          interaction: {
            ...state.interaction,
            pendingPlacement: {
              ...state.interaction.pendingPlacement,
              draft: {
                ...state.interaction.pendingPlacement.draft,
                simpleIconStyleOverride,
              },
            },
          },
        }
      }

      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent) {
        return state
      }

      return withCommittedScene(
        state,
        {
          scene: {
            ...state.scene,
            components: state.scene.components.map((component) =>
              component.id === selectedComponent.id
                ? {
                    ...component,
                    simpleIconStyleOverride,
                  }
                : component,
            ),
          },
        },
        {
          mergeKey: `component-icon-style:${selectedComponent.id}`,
        },
      )
    })
  },

  setSimpleGlyphAppearance: (componentId, update) => {
    set((state) => {
      const previous =
        state.simpleGlyphAppearances[componentId] ?? DEFAULT_SIMPLE_GLYPH_APPEARANCE
      const next: SimpleGlyphAppearanceState = {
        color: update.color ?? previous.color,
        scale:
          update.scale !== undefined
            ? clampSimpleGlyphAppearanceScale(update.scale)
            : previous.scale,
        weight:
          update.weight !== undefined
            ? clampSimpleGlyphAppearanceWeight(update.weight)
            : previous.weight,
      }

      return {
        simpleGlyphAppearances: {
          ...state.simpleGlyphAppearances,
          [componentId]: next,
        },
      }
    })
  },

  applySupportToType: (type, includeMount) => {
    set((state) =>
      withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.type === type && supportsMountToggle(component.type)
              ? {
                  ...component,
                  config: mergeComponentConfig(component.config, {
                    support: {
                      includeMount,
                    },
                  }),
                }
              : component,
          ),
        },
        interaction:
          state.interaction.pendingPlacement?.draft.type === type &&
          supportsMountToggle(type)
            ? {
                ...state.interaction,
                pendingPlacement: {
                  ...state.interaction.pendingPlacement,
                  draft: {
                    ...state.interaction.pendingPlacement.draft,
                    config: mergeComponentConfig(
                      state.interaction.pendingPlacement.draft.config,
                      {
                        support: {
                          includeMount,
                        },
                      },
                    ),
                  },
                },
              }
            : state.interaction,
      }),
    )
  },

  setMountDefaultForType: (type, includeMount) => {
    set((state) => {
      const nextMountVisibilityDefaults = {
        ...state.mountVisibilityDefaults,
        [type]: includeMount,
      }

      writeLocalStorageValue(
        MOUNT_DEFAULTS_STORAGE_KEY,
        JSON.stringify(nextMountVisibilityDefaults),
      )

      return {
        mountVisibilityDefaults: nextMountVisibilityDefaults,
        interaction:
          state.interaction.pendingPlacement?.draft.type === type &&
          supportsMountToggle(type)
            ? {
                ...state.interaction,
                pendingPlacement: {
                  ...state.interaction.pendingPlacement,
                  draft: applyMountVisibilityDefault(
                    state.interaction.pendingPlacement.draft,
                    nextMountVisibilityDefaults,
                  ),
                },
              }
            : state.interaction,
      }
    })
  },

  rotateSelectedComponent: (direction) => {
    set((state) => {
      if (state.interaction.pendingBreadboardPlacement) {
        const pendingBreadboardPlacement = state.interaction.pendingBreadboardPlacement
        const nextRotationQuarterTurns = normalizeQuarterTurns(
          pendingBreadboardPlacement.rotationQuarterTurns + direction,
        ) as QuarterTurn
        const currentBounds = getBreadboardWorldBoundsMm(
          pendingBreadboardPlacement.model,
          pendingBreadboardPlacement.candidateAnchorMm,
          pendingBreadboardPlacement.rotationQuarterTurns,
        )
        const currentCenterMm = {
          x: currentBounds.x + currentBounds.width / 2,
          y: currentBounds.y + currentBounds.height / 2,
        }

        return {
          interaction: {
            ...state.interaction,
            pendingBreadboardPlacement: {
              ...pendingBreadboardPlacement,
              rotationQuarterTurns: nextRotationQuarterTurns,
              candidateAnchorMm: getBreadboardAnchorForCenterMm(
                pendingBreadboardPlacement.model,
                currentCenterMm,
                nextRotationQuarterTurns,
              ),
            },
            notice: 'Breadboard preview rotated.',
          },
        }
      }

      if (state.interaction.pendingPlacement) {
        const pendingPlacement = state.interaction.pendingPlacement
        const nextRotationQuarterTurns =
          pendingPlacement.draft.config.source
            ? pendingPlacement.draft.rotationQuarterTurns
            : (normalizeQuarterTurns(
                pendingPlacement.draft.rotationQuarterTurns + direction,
              ) as QuarterTurn)
        const placement = resolvePlacementForScene({
          candidateAnchorMm: pendingPlacement.candidateAnchorMm,
          component: pendingPlacement.draft,
          phase: 'drop',
          rotationQuarterTurns: nextRotationQuarterTurns,
          scene: state.scene,
          snapMode: state.snapMode,
        })

        return {
          interaction: {
            ...state.interaction,
            pendingPlacement: {
              draft: {
                ...pendingPlacement.draft,
                rotationQuarterTurns: nextRotationQuarterTurns,
              },
              candidateAnchorMm: placement.resolvedAnchorMm,
            },
            notice: describePlacementReason(placement.reason),
          },
        }
      }

      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent) {
        return state
      }

      const nextRotationQuarterTurns =
        selectedComponent.config.source
          ? selectedComponent.rotationQuarterTurns
          : (normalizeQuarterTurns(
              selectedComponent.rotationQuarterTurns + direction,
            ) as QuarterTurn)

      if (selectedComponent.attachment) {
        const attachmentCandidate = resolveStageAttachmentCandidate({
          candidateAnchorMm: selectedComponent.anchorMm,
          component: {
            ...selectedComponent,
            rotationQuarterTurns: nextRotationQuarterTurns,
          },
          lockedParentComponentId: selectedComponent.attachment.parentComponentId,
          lockedSiteId: selectedComponent.attachment.parentMountSiteId,
          scene: state.scene,
        })

        if (!attachmentCandidate) {
          return {
            interaction: {
              ...state.interaction,
              notice: 'Mounted optic no longer fits on this stage seat.',
            },
          }
        }

        return withCommittedScene(state, {
          scene: {
            ...state.scene,
            components: state.scene.components.map((component) =>
              component.id === selectedComponent.id
                ? {
                    ...component,
                    attachment: attachmentCandidate.attachment,
                    anchorMm: attachmentCandidate.anchorMm,
                    hostSurfaceId: attachmentCandidate.hostSurfaceId,
                    rotationQuarterTurns: attachmentCandidate.rotationQuarterTurns,
                  }
                : component,
            ),
          },
          interaction: {
            ...state.interaction,
            notice: 'Mounted optic rotated on stage.',
          },
        })
      }

      const placement = resolvePlacementForScene({
        candidateAnchorMm: selectedComponent.anchorMm,
        component: selectedComponent,
        phase: 'drop',
        rotationQuarterTurns: nextRotationQuarterTurns,
        scene: state.scene,
        snapMode: state.snapMode,
      })

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === selectedComponent.id
              ? {
                  ...component,
                  anchorMm: placement.resolvedAnchorMm,
                  rotationQuarterTurns: nextRotationQuarterTurns,
                }
              : component,
          ),
        },
        interaction: {
          ...state.interaction,
          notice: describePlacementReason(placement.reason),
        },
      })
    })
  },

  rotateHighlightSelection: (direction) => {
    set((state) => {
      const highlightSelection = state.interaction.highlightSelection

      if (!highlightSelection) {
        return state
      }

      const quarterTurns = normalizeQuarterTurns(direction) as QuarterTurn
      const centerMm = getBoundsCenterMm(highlightSelection.boundsMm)
      const highlightedBreadboardIds = new Set(highlightSelection.breadboardIds)
      const highlightedComponentIds = new Set(highlightSelection.componentIds)
      const highlightedAnnotationIds = new Set(highlightSelection.annotationIds)

      const nextWorkspace =
        state.scene.workspace.kind === 'optical-table'
          ? {
              ...state.scene.workspace,
              breadboards: state.scene.workspace.breadboards.map((breadboard) =>
                highlightedBreadboardIds.has(breadboard.id)
                  ? {
                      ...breadboard,
                      anchorMm: rotatePointAroundCenterQuarterTurns(
                        breadboard.anchorMm,
                        centerMm,
                        quarterTurns,
                      ),
                      rotationQuarterTurns: normalizeQuarterTurns(
                        breadboard.rotationQuarterTurns + direction,
                      ) as QuarterTurn,
                    }
                  : breadboard,
              ),
            }
          : state.scene.workspace

      const nextComponents = state.scene.components.map((component) => {
        if (!highlightedComponentIds.has(component.id)) {
          return component
        }

        const resolvedSpec = getResolvedComponentSpec(component.type, component.variantId)
        const nextRotationQuarterTurns =
          resolvedSpec.mount.mode === 'external-source'
            ? component.rotationQuarterTurns
            : (normalizeQuarterTurns(
                component.rotationQuarterTurns + direction,
              ) as QuarterTurn)

        return {
          ...component,
          anchorMm: rotatePointAroundCenterQuarterTurns(
            component.anchorMm,
            centerMm,
            quarterTurns,
          ),
          rotationQuarterTurns: nextRotationQuarterTurns,
        }
      })

      const nextAnnotations = state.scene.annotations.map((annotation) =>
        highlightedAnnotationIds.has(annotation.id)
          ? rotateAnnotationAroundCenterQuarterTurns(annotation, centerMm, quarterTurns)
          : annotation,
      )
      const nextScene: SceneDocument = {
        ...state.scene,
        components: nextComponents,
        annotations: nextAnnotations,
        workspace: nextWorkspace,
      }
      const nextBoundsMm = getHighlightSelectionBounds(nextScene, highlightSelection)

      return withCommittedScene(
        state,
        {
          scene: nextScene,
          interaction: {
            ...state.interaction,
            highlightSelection: nextBoundsMm
              ? {
                  ...highlightSelection,
                  boundsMm: nextBoundsMm,
                }
              : undefined,
            notice: 'Highlight rotated.',
          },
        },
        {
          mergeKey: 'highlight-rotate',
        },
      )
    })
  },

  updateBreadboard: (update) => {
    set((state) => {
      if (state.interaction.pendingBreadboardPlacement) {
        const pendingBreadboardPlacement = state.interaction.pendingBreadboardPlacement
        const nextModel = syncBreadboardPresetId({
          ...pendingBreadboardPlacement.model,
          ...update,
        })

        return {
          interaction: {
            ...state.interaction,
            pendingBreadboardPlacement: {
              ...pendingBreadboardPlacement,
              label: update.label ?? pendingBreadboardPlacement.label,
              model: nextModel,
            },
          },
        }
      }

      if (state.scene.workspace.kind === 'single-breadboard') {
        const nextBreadboard = syncBreadboardPresetId({
          ...state.scene.workspace.breadboard,
          ...update,
        })
        const nextScene: SceneDocument = {
          ...state.scene,
          workspace: {
            kind: 'single-breadboard',
            breadboard: nextBreadboard,
          },
        }

        return withCommittedScene(state, {
          scene: {
            ...nextScene,
            components: reconcileComponentsToScene(state.scene.components, nextScene),
          },
          interaction: {
            ...state.interaction,
            activeDragComponentId: undefined,
            dragPreview: undefined,
            pendingPlacement: undefined,
            pendingBreadboardPlacement: undefined,
          },
        }, {
          mergeKey: 'breadboard',
        })
      }

      const activeBreadboardId =
        state.interaction.activeHostSurfaceId ?? state.scene.workspace.breadboards[0]?.id
      const nextBreadboards = state.scene.workspace.breadboards.map((breadboard) =>
        breadboard.id === activeBreadboardId
          ? (() => {
              const nextModel = syncBreadboardPresetId({
                ...breadboard.model,
                ...update,
                label: update.label ?? breadboard.model.label,
              })

              return {
                ...breadboard,
                label: update.label ?? breadboard.label,
                model: nextModel,
                mountPlaneOffsetMm: nextModel.thicknessMm,
              }
            })()
          : breadboard,
      )
      const nextScene: SceneDocument = {
        ...state.scene,
        workspace: {
          ...state.scene.workspace,
          breadboards: nextBreadboards,
        },
      }

      return withCommittedScene(state, {
        scene: {
          ...nextScene,
          components: reconcileComponentsToScene(state.scene.components, nextScene),
        },
        interaction: {
          ...state.interaction,
          activeDragComponentId: undefined,
          dragPreview: undefined,
          pendingPlacement: undefined,
          pendingBreadboardPlacement: undefined,
        },
      }, {
        mergeKey: 'breadboard',
      })
    })
  },

  applyBreadboardPreset: (presetId) => {
    set((state) => {
      const nextBreadboard = createBreadboardFromPreset(presetId)
      if (state.interaction.pendingBreadboardPlacement) {
        return {
          interaction: {
            ...state.interaction,
            pendingBreadboardPlacement: {
              ...state.interaction.pendingBreadboardPlacement,
              presetId,
              model: nextBreadboard,
            },
          },
        }
      }

      if (state.scene.workspace.kind === 'single-breadboard') {
        const nextScene: SceneDocument = {
          ...state.scene,
          workspace: {
            kind: 'single-breadboard',
            breadboard: nextBreadboard,
          },
        }

        return withCommittedScene(state, {
          scene: {
            ...nextScene,
            components: reconcileComponentsToScene(state.scene.components, nextScene),
          },
          interaction: {
            ...state.interaction,
            activeDragComponentId: undefined,
            dragPreview: undefined,
            pendingPlacement: undefined,
            pendingBreadboardPlacement: undefined,
          },
        })
      }

      const activeBreadboardId =
        state.interaction.activeHostSurfaceId ?? state.scene.workspace.breadboards[0]?.id
      const nextScene: SceneDocument = {
        ...state.scene,
        workspace: {
          ...state.scene.workspace,
          breadboards: state.scene.workspace.breadboards.map((breadboard) =>
            breadboard.id === activeBreadboardId
              ? {
                  ...breadboard,
                  label: nextBreadboard.label,
                  model: nextBreadboard,
                  mountPlaneOffsetMm: nextBreadboard.thicknessMm,
                }
              : breadboard,
          ),
        },
      }

      return withCommittedScene(state, {
        scene: {
          ...nextScene,
          components: reconcileComponentsToScene(state.scene.components, nextScene),
        },
        interaction: {
          ...state.interaction,
          activeDragComponentId: undefined,
          dragPreview: undefined,
          pendingPlacement: undefined,
          pendingBreadboardPlacement: undefined,
        },
      })
    })
  },

  updateOpticalTable: (update) => {
    set((state) => {
      if (state.scene.workspace.kind !== 'optical-table') {
        return state
      }

      const nextScene: SceneDocument = {
        ...state.scene,
        workspace: {
          ...state.scene.workspace,
          table: {
            ...state.scene.workspace.table,
            ...update,
          },
        },
      }

      return withCommittedScene(state, {
        scene: nextScene,
      }, {
        mergeKey: 'optical-table',
      })
    })
  },

  convertWorkspaceToOpticalTable: () => {
    set((state) => {
      const nextScene = convertSceneToOpticalTable(state.scene)
      const nextSelection = getDefaultSelection(nextScene)
      const nextInteraction = createInteractionForScene({
        previousInteraction: state.interaction,
        scene: nextScene,
        selection: nextSelection,
        workspaceViewMode: 'table-view',
      })

      return withCommittedScene(state, {
        scene: nextScene,
        selection: nextSelection,
        viewport: createViewportForScene(nextScene, state.viewport.canvasSizePx, {
          focusedBreadboardId: nextInteraction.focusedBreadboardId,
          workspaceViewMode: nextInteraction.workspaceViewMode,
        }),
        interaction: nextInteraction,
      })
    })
  },

  createFreshOpticalTable: () => {
    set((state) => {
      const nextScene: SceneDocument = {
        ...state.scene,
        workspace: createFreshOpticalTableWorkspace(),
        components: [],
        annotations: [],
      }
      const nextSelection = getDefaultSelection(nextScene)
      const nextInteraction = createInteractionForScene({
        previousInteraction: state.interaction,
        scene: nextScene,
        selection: nextSelection,
        workspaceViewMode: 'table-view',
      })

      return withCommittedScene(state, {
        scene: nextScene,
        selection: nextSelection,
        viewport: createViewportForScene(nextScene, state.viewport.canvasSizePx, {
          focusedBreadboardId: nextInteraction.focusedBreadboardId,
          workspaceViewMode: nextInteraction.workspaceViewMode,
        }),
        interaction: nextInteraction,
      })
    })
  },

  convertWorkspaceToSingleBreadboard: ({ breadboardId, createFresh }) => {
    set((state) => {
      const nextScene = convertSceneToSingleBreadboard({
        scene: state.scene,
        breadboardId,
        createFresh,
      })
      const nextSelection = getDefaultSelection(nextScene)
      const nextInteraction = createInteractionForScene({
        previousInteraction: state.interaction,
        scene: nextScene,
        selection: nextSelection,
        workspaceViewMode: 'board-focus',
      })

      return withCommittedScene(state, {
        scene: nextScene,
        selection: nextSelection,
        viewport: createViewportForScene(nextScene, state.viewport.canvasSizePx, {
          focusedBreadboardId: nextInteraction.focusedBreadboardId,
          workspaceViewMode: nextInteraction.workspaceViewMode,
        }),
        interaction: nextInteraction,
      })
    })
  },

  setWorkspaceViewMode: (workspaceViewMode) => {
    set((state) => {
      const nextWorkspaceViewMode = resolveWorkspaceViewModeForScene(
        state.scene,
        workspaceViewMode,
      )
      const focusedBreadboardId = resolveFocusedBreadboardIdForScene(state.scene, {
        activeHostSurfaceId: state.interaction.activeHostSurfaceId,
        focusedBreadboardId: state.interaction.focusedBreadboardId,
        selection: state.selection,
      })
      const nextActiveHostSurfaceId =
        state.scene.workspace.kind === 'optical-table' &&
        nextWorkspaceViewMode === 'board-focus' &&
        focusedBreadboardId
          ? focusedBreadboardId
          : state.interaction.activeHostSurfaceId

      return {
        viewport: createViewportForScene(state.scene, state.viewport.canvasSizePx, {
          focusedBreadboardId,
          workspaceViewMode: nextWorkspaceViewMode,
        }),
        interaction: {
          ...state.interaction,
          activeHostSurfaceId: nextActiveHostSurfaceId,
          focusedBreadboardId,
          workspaceViewMode: nextWorkspaceViewMode,
        },
      }
    })
  },

  setFocusedBreadboardId: (breadboardId) => {
    set((state) => {
      const focusedBreadboardId = resolveFocusedBreadboardIdForScene(state.scene, {
        activeHostSurfaceId: breadboardId,
        focusedBreadboardId: breadboardId,
        selection: state.selection,
      })

      return {
        viewport:
          state.scene.workspace.kind === 'optical-table' &&
          state.interaction.workspaceViewMode === 'board-focus' &&
          focusedBreadboardId
            ? createViewportForScene(state.scene, state.viewport.canvasSizePx, {
                focusedBreadboardId,
                workspaceViewMode: 'board-focus',
              })
            : state.viewport,
        interaction: {
          ...state.interaction,
          activeHostSurfaceId:
            state.interaction.workspaceViewMode === 'board-focus' &&
            focusedBreadboardId
              ? focusedBreadboardId
              : state.interaction.activeHostSurfaceId,
          focusedBreadboardId,
        },
      }
    })
  },

  setActiveHostSurfaceId: (surfaceId) => {
    set((state) => {
      const nextSurfaceId = surfaceId ?? getDefaultSurfaceId(state.scene)
      const pendingPlacement = state.interaction.pendingPlacement
      const nextFocusedBreadboardId =
        nextSurfaceId !== OPTICAL_TABLE_SURFACE_ID
          ? nextSurfaceId
          : state.interaction.focusedBreadboardId

      if (!pendingPlacement) {
        return {
          interaction: {
            ...state.interaction,
            activeHostSurfaceId: nextSurfaceId,
            focusedBreadboardId: nextFocusedBreadboardId,
          },
        }
      }

      const nextCandidateAnchorMm = getSurfaceCenterAnchorMm(state.scene, nextSurfaceId)
      let nextDraft: ComponentInstance = {
        ...pendingPlacement.draft,
        hostSurfaceId: nextSurfaceId,
      }

      if (nextDraft.config.source) {
        const aligned = applySourceLane(
          state.scene,
          nextDraft,
          nextDraft.config.source.lane,
          nextDraft.config.source.firstTargetComponentId,
        )

        nextDraft = {
          ...nextDraft,
          anchorMm: aligned.anchorMm,
          rotationQuarterTurns: aligned.rotationQuarterTurns,
        }
      }

      const resolvedCandidateAnchorMm = nextDraft.config.source
        ? nextDraft.anchorMm
        : nextCandidateAnchorMm

      return {
        interaction: {
          ...state.interaction,
          activeHostSurfaceId: nextSurfaceId,
          focusedBreadboardId: nextFocusedBreadboardId,
          pendingPlacement: {
            ...pendingPlacement,
            candidateAnchorMm: resolvedCandidateAnchorMm,
            draft: nextDraft,
          },
        },
      }
    })
  },

  dismissWarning: (warningId) => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        dismissedWarningIds: state.interaction.dismissedWarningIds.includes(warningId)
          ? state.interaction.dismissedWarningIds
          : [...state.interaction.dismissedWarningIds, warningId],
      },
    }))
  },

  dismissVisibleWarnings: (warningIds) => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        dismissedWarningIds: [
          ...new Set([...state.interaction.dismissedWarningIds, ...warningIds]),
        ],
      },
    }))
  },

  restoreDismissedWarnings: () => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        dismissedWarningIds: [],
      },
    }))
  },

  updateBeamSettings: (update) => {
    set((state) =>
      withCommittedScene(state, {
        scene: {
          ...state.scene,
          beamSettings: {
            ...state.scene.beamSettings,
            ...update,
          },
        },
      }, {
        mergeKey: 'beam-settings',
      }),
    )
  },

  setLineColor: (color) => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        lineColor: color,
      },
    }))
  },

  startLineDrawAt: (startMm) => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        lineDrawStartMm: startMm,
      },
    }))
  },

  commitLineDraw: (endMm) => {
    set((state) => {
      const startMm = state.interaction.lineDrawStartMm

      if (!startMm) {
        return state
      }

      const dx = endMm.x - startMm.x
      const dy = endMm.y - startMm.y

      if (Math.sqrt(dx * dx + dy * dy) < 0.5) {
        return {
          interaction: {
            ...state.interaction,
            lineDrawStartMm: undefined,
          },
        }
      }

      const newLine: AnnotationLine = {
        id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind: 'line',
        hidden: false,
        layerBand: 'below-components',
        locked: false,
        startMm,
        endMm,
        color: state.interaction.lineColor,
        strokeWidthMm: 0.8,
        zIndex: getNextAnnotationZIndex(state.scene),
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          annotations: reindexAnnotations([...state.scene.annotations, newLine]),
        },
        interaction: {
          ...state.interaction,
          lineDrawStartMm: undefined,
        },
      })
    })
  },

  cancelLineDraw: () => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        lineDrawStartMm: undefined,
      },
    }))
  },

  deleteAnnotationLine: (lineId) => {
    set((state) =>
      withCommittedScene(state, {
        scene: {
          ...state.scene,
          annotations: state.scene.annotations.filter(
            (annotation) => annotation.id !== lineId,
          ),
        },
      }),
    )
  },

  undo: () => {
    set((state) => {
      const previousSnapshot = state.history.past[state.history.past.length - 1]

      if (!previousSnapshot) {
        return state
      }

      const currentSnapshot = createSceneHistorySnapshot(state)
      const history: SceneHistoryState = {
        past: state.history.past.slice(0, -1),
        future: [currentSnapshot, ...state.history.future],
      }

      return restoreSceneHistorySnapshot(state, previousSnapshot, history)
    })
  },

  redo: () => {
    set((state) => {
      const nextSnapshot = state.history.future[0]

      if (!nextSnapshot) {
        return state
      }

      const currentSnapshot = createSceneHistorySnapshot(state)
      const nextPast = [...state.history.past, currentSnapshot]

      if (nextPast.length > MAX_SCENE_HISTORY_ENTRIES) {
        nextPast.shift()
      }

      const history: SceneHistoryState = {
        past: nextPast,
        future: state.history.future.slice(1),
      }

      return restoreSceneHistorySnapshot(state, nextSnapshot, history)
    })
  },

  loadScene: (scene, options) => {
    set((state) => {
      const nextScene: SceneDocument = {
        ...scene,
        beamSettings: scene.beamSettings ?? getDefaultBeamSettings(),
        components: reconcileComponentsToScene(scene.components, scene),
      }
      const nextSelection = getDefaultSelection(nextScene)
      const nextInteraction = createInteractionForScene({
        previousInteraction: state.interaction,
        scene: nextScene,
        selection: nextSelection,
        workspaceViewMode:
          state.scene.workspace.kind !== nextScene.workspace.kind
            ? nextScene.workspace.kind === 'optical-table'
              ? 'table-view'
              : 'board-focus'
            : undefined,
      })
      const patch = {
        scene: nextScene,
        selection: nextSelection,
        simpleGlyphAppearances: {},
        viewport: createViewportForScene(nextScene, state.viewport.canvasSizePx, {
          focusedBreadboardId: nextInteraction.focusedBreadboardId,
          workspaceViewMode: nextInteraction.workspaceViewMode,
        }),
        interaction: nextInteraction,
      }

      return options?.history === 'reset'
        ? withResetHistory(patch)
        : withCommittedScene(state, patch)
    })
  },
}))

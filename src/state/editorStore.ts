import { create } from 'zustand'
import { getNearestBoardCenterHole } from '../domain/breadboard'
import {
  createBreadboardFromPreset,
  findBreadboardPresetId,
} from '../domain/breadboardPresets'
import {
  createDefaultComponentConfig,
  getComponentDefinition,
  getResolvedComponentSpec,
  isOpticalTarget,
  shouldIncludeDefaultMount,
  supportsMountToggle,
} from '../domain/componentCatalog'
import {
  applyPinchViewportTransform,
  fitZoomPxPerMm,
  normalizeQuarterTurns,
  panViewportByScreenDelta as panViewportByDelta,
  roundMm,
  zoomViewportAtScreenPoint,
} from '../domain/geometry'
import {
  alignExternalSourceToTarget,
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
  convertSceneToOpticalTable,
  convertSceneToSingleBreadboard,
  createBreadboardInstance,
  getBreadboardAnchorForCenterMm,
  getBreadboardWorldBoundsMm,
  getDefaultSurfaceId,
  getWorkspaceWorldBoundsMm,
} from '../domain/workspace'
import type {
  ActiveTool,
  AnnotationLine,
  BeamSplitterConfig,
  BboCrystalConfig,
  BreadboardModel,
  CanvasSizePx,
  ComponentConfig,
  ComponentInstance,
  ComponentType,
  CurvedMirrorConfig,
  DelayLineConfig,
  OpticalTableModel,
  IrisConfig,
  LensConfig,
  OpaConfig,
  PendingBreadboardPlacementState,
  PendingPlacementState,
  PolarizerConfig,
  QuarterTurn,
  RenderMode,
  SceneBeamSettings,
  SceneDocument,
  ScreenPointPx,
  SnapMode,
  SourceConfig,
  SourceLane,
  TelescopeConfig,
  ToolbarMenu,
  Vector2Mm,
  ViewportState,
  WaveplateConfig,
} from '../domain/types'
import { OPTICAL_TABLE_SURFACE_ID, SINGLE_BREADBOARD_SURFACE_ID } from '../domain/types'

export type SelectionState =
  | { type: 'breadboard'; surfaceId: string }
  | { type: 'optical-table' }
  | { type: 'component'; componentId: string }

type ComponentUpdate = Partial<
  Pick<ComponentInstance, 'label' | 'anchorMm' | 'rotationQuarterTurns'>
>

interface ComponentConfigUpdate {
  source?: Partial<SourceConfig>
  beamSplitter?: Partial<BeamSplitterConfig>
  lens?: Partial<LensConfig>
  curvedMirror?: Partial<CurvedMirrorConfig>
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
}

interface BreadboardDragPreview {
  breadboardId: string
  candidateAnchorMm: Vector2Mm
}

interface InteractionState {
  activeDragComponentId?: string
  breadboardDragPreview?: BreadboardDragPreview
  dragPreview?: DragPreviewState
  pendingPlacement?: PendingPlacementState
  pendingBreadboardPlacement?: PendingBreadboardPlacementState
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
}

interface WarningFilters {
  simple: boolean
  advanced: boolean
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

interface EditorStore {
  scene: SceneDocument
  selection: SelectionState
  snapMode: SnapMode
  viewport: ViewportState
  renderMode: RenderMode
  warningFilters: WarningFilters
  openToolbarMenu?: ToolbarMenu
  mountVisibilityDefaults: MountVisibilityDefaults
  interaction: InteractionState
  history: SceneHistoryState
  canUndo: boolean
  canRedo: boolean
  selectBreadboard: (surfaceId?: string) => void
  selectOpticalTable: () => void
  selectComponent: (componentId: string) => void
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
  setWarningFilter: (tier: keyof WarningFilters, isEnabled: boolean) => void
  setOpenToolbarMenu: (menu?: ToolbarMenu) => void
  selectBeamSegment: (segmentId: string, pathId: string, interactionId?: string) => void
  clearBeamInspectionSelection: () => void
  setHelpOpen: (isOpen: boolean) => void
  setWarningsOpen: (isOpen: boolean) => void
  setSelectedWarningId: (warningId?: string) => void
  clearNotice: () => void
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
  addComponent: (type: ComponentType) => void
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
  clearBreadboardComponents: (breadboardId?: string) => void
  clearOpticalTableComponents: () => void
  updateSelectedComponent: (update: ComponentUpdate) => void
  updateSelectedVariant: (variantId: string) => void
  updateSelectedSource: (update: Partial<SourceConfig>) => void
  applySelectedSourcePreset: (presetId: SourceConfig['presetId']) => void
  alignSelectedSourceToTarget: () => void
  updateSelectedBeamSplitter: (update: Partial<BeamSplitterConfig>) => void
  updateSelectedLens: (update: Partial<LensConfig>) => void
  updateSelectedCurvedMirror: (update: Partial<CurvedMirrorConfig>) => void
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
  applySupportToType: (type: ComponentType, includeMount: boolean) => void
  setMountDefaultForType: (type: ComponentType, includeMount: boolean) => void
  rotateSelectedComponent: (direction: -1 | 1) => void
  updateBreadboard: (update: Partial<BreadboardModel>) => void
  applyBreadboardPreset: (presetId: string) => void
  updateOpticalTable: (update: Partial<OpticalTableModel>) => void
  convertWorkspaceToOpticalTable: () => void
  convertWorkspaceToSingleBreadboard: (args: {
    breadboardId?: string
    createFresh?: boolean
  }) => void
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
const WARNING_FILTERS_STORAGE_KEY = 'schema-lab.warning-filters'
const MOUNT_DEFAULTS_STORAGE_KEY = 'schema-lab.mount-defaults'

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

function createViewportForScene(
  scene: SceneDocument,
  canvasSizePx: CanvasSizePx = DEFAULT_CANVAS_SIZE,
): ViewportState {
  const safeCanvasSize = {
    width: canvasSizePx.width > 0 ? canvasSizePx.width : DEFAULT_CANVAS_SIZE.width,
    height: canvasSizePx.height > 0 ? canvasSizePx.height : DEFAULT_CANVAS_SIZE.height,
  }
  const worldBounds = getSceneWorldBoundsMm(scene)
  const workspaceBounds = getWorkspaceWorldBoundsMm(scene)
  const centerMm = {
    x: workspaceBounds.x + workspaceBounds.width / 2,
    y: workspaceBounds.y + workspaceBounds.height / 2,
  }

  return {
    zoomPxPerMm: fitZoomPxPerMm(
      { width: worldBounds.width, height: worldBounds.height },
      safeCanvasSize,
    ),
    cameraCenterMm: centerMm,
    canvasSizePx: safeCanvasSize,
  }
}

function createComponentId(type: ComponentType) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${type}-${crypto.randomUUID().slice(0, 8)}`
  }

  return `${type}-${Math.random().toString(36).slice(2, 10)}`
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
      return 'component footprint extends outside the breadboard or source lane'
    case 'occupied':
      return 'mount envelope overlaps another component'
    case 'outside-source-lane':
      return 'external sources must stay on the source lane'
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

function reconcileComponentsToScene(
  components: ComponentInstance[],
  scene: SceneDocument,
) {
  return components.map((component) => ({
    ...component,
    anchorMm: reconcileComponentAnchorForScene(component, scene),
  }))
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createAutoNumberedLabel(
  components: ComponentInstance[],
  type: ComponentType,
) {
  const baseLabel = getComponentDefinition(type).defaultLabel
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
) {
  const definition = getComponentDefinition(type)
  const defaultSurfaceId = activeHostSurfaceId ?? getDefaultSurfaceId(scene)
  const variantId =
    type === 'laser-source' && defaultSurfaceId === OPTICAL_TABLE_SURFACE_ID
      ? 'libra'
      : definition.defaultVariantId
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
    label: createAutoNumberedLabel(scene.components, type),
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

  return {
    ...patch,
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

  return {
    ...patch,
    history,
    ...getSceneHistoryFlags(history),
  }
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
      ...state.interaction,
      activeDragComponentId: undefined,
      activeHostSurfaceId: resolveActiveHostSurfaceId(
        snapshot.scene,
        selection,
        snapshot.activeHostSurfaceId,
      ),
      dragPreview: undefined,
      hoveredBeamSegmentId: undefined,
      hoveredComponentId: undefined,
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
  dismissedWarningIds: [],
  isHelpOpen: false,
  isSpacePanning: false,
  isPointerPanning: false,
  isWarningsOpen: false,
  lineColor: '#ff3333',
  showBeamDetails: true,
  showGaussianEnvelope: false,
}
const initialRenderMode = readRenderMode()
const initialWarningFilters = readWarningFilters()
const initialMountVisibilityDefaults = readMountVisibilityDefaults()

export const useEditorStore = create<EditorStore>((set) => ({
  scene: initialScene,
  selection: getDefaultSelection(initialScene),
  snapMode: 'onDrop',
  viewport: createViewportForScene(initialScene),
  renderMode: initialRenderMode,
  warningFilters: initialWarningFilters,
  mountVisibilityDefaults: initialMountVisibilityDefaults,
  openToolbarMenu: undefined,
  interaction: {
    ...initialInteraction,
    activeHostSurfaceId: getDefaultSurfaceId(initialScene),
  },
  history: createSceneHistoryState(),
  canUndo: false,
  canRedo: false,

  selectBreadboard: (surfaceId) => {
    set((state) => ({
      selection: {
        type: 'breadboard',
        surfaceId: surfaceId ?? getDefaultSurfaceId(state.scene),
      },
      interaction: {
        ...state.interaction,
        activeHostSurfaceId: surfaceId ?? getDefaultSurfaceId(state.scene),
        notice: undefined,
        pendingPlacement: undefined,
        pendingBreadboardPlacement: undefined,
      },
    }))
  },

  selectOpticalTable: () => {
    set((state) => ({
      selection: { type: 'optical-table' },
      interaction: {
        ...state.interaction,
        activeHostSurfaceId: OPTICAL_TABLE_SURFACE_ID,
        notice: undefined,
        pendingPlacement: undefined,
        pendingBreadboardPlacement: undefined,
      },
    }))
  },

  selectComponent: (componentId) => {
    set((state) => ({
      selection: { type: 'component', componentId },
      interaction: {
        ...state.interaction,
        activeHostSurfaceId:
          state.scene.components.find((component) => component.id === componentId)
            ?.hostSurfaceId ?? state.interaction.activeHostSurfaceId,
        notice: undefined,
        pendingPlacement: undefined,
        pendingBreadboardPlacement: undefined,
      },
    }))
  },

  setSnapMode: (snapMode) => {
    set({ snapMode })
  },

  setActiveTool: (tool) => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        activeTool: tool,
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

  clearNotice: () => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        notice: undefined,
      },
    }))
  },

  setViewportSize: (canvasSizePx) => {
    set((state) => ({
      viewport: {
        ...state.viewport,
        canvasSizePx,
      },
    }))
  },

  setViewport: (viewport) => {
    set({ viewport })
  },

  panViewportByScreenDelta: (deltaPx) => {
    set((state) => ({
      viewport: panViewportByDelta(state.viewport, deltaPx),
    }))
  },

  applyPinchViewport: (previousMidpointPx, nextMidpointPx, zoomFactor) => {
    set((state) => ({
      viewport: applyPinchViewportTransform(
        state.viewport,
        previousMidpointPx,
        nextMidpointPx,
        zoomFactor,
      ),
    }))
  },

  zoomAtScreenPoint: (pointPx, zoomFactor) => {
    set((state) => ({
      viewport: zoomViewportAtScreenPoint(state.viewport, pointPx, zoomFactor),
    }))
  },

  resetViewport: () => {
    set((state) => ({
      viewport: createViewportForScene(state.scene, state.viewport.canvasSizePx),
    }))
  },

  addComponent: (type) => {
    set((state) => {
      const draft = createComponentDraft(
        state.scene,
        state.selection,
        type,
        state.mountVisibilityDefaults,
        state.interaction.activeHostSurfaceId ?? getDefaultSurfaceId(state.scene),
      )

      return {
        selection: getDefaultSelection(state.scene),
        interaction: {
          ...state.interaction,
          pendingPlacement: {
            draft,
            candidateAnchorMm: draft.anchorMm,
          },
          pendingBreadboardPlacement: undefined,
          selectedBeamInteractionId: undefined,
          selectedBeamPathId: undefined,
          selectedBeamSegmentId: undefined,
          notice: undefined,
        },
      }
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
        interaction: {
          ...state.interaction,
          activeHostSurfaceId: OPTICAL_TABLE_SURFACE_ID,
          pendingPlacement: undefined,
          pendingBreadboardPlacement,
          selectedBeamInteractionId: undefined,
          selectedBeamPathId: undefined,
          selectedBeamSegmentId: undefined,
          notice: undefined,
        },
      }
    })
  },

  updatePendingPlacementAnchor: (anchorMm) => {
    set((state) => {
      if (!state.interaction.pendingPlacement) {
        return state
      }

      return {
        interaction: {
          ...state.interaction,
          pendingPlacement: {
            ...state.interaction.pendingPlacement,
            candidateAnchorMm: anchorMm,
          },
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

      const placement = resolvePlacementForScene({
        candidateAnchorMm: anchorMm ?? pendingPlacement.candidateAnchorMm,
        component: pendingPlacement.draft,
        phase: 'drop',
        scene: state.scene,
        snapMode: state.snapMode,
      })
      const nextComponent: ComponentInstance = {
        ...pendingPlacement.draft,
        anchorMm: placement.resolvedAnchorMm,
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: [...state.scene.components, nextComponent],
        },
        selection: { type: 'component', componentId: nextComponent.id },
        interaction: {
          ...state.interaction,
          pendingPlacement: undefined,
          pendingBreadboardPlacement: undefined,
          notice: describePlacementReason(placement.reason),
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

      const roundedAnchor: Vector2Mm = {
        x: roundMm(finalAnchor.x),
        y: roundMm(finalAnchor.y),
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
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

      const roundedAnchor: Vector2Mm = {
        x: roundMm(anchorMm.x),
        y: roundMm(anchorMm.y),
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
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

      return {
        selection: { type: 'component', componentId },
        interaction: {
          ...state.interaction,
          activeDragComponentId: componentId,
          dragPreview: {
            componentId,
            candidateAnchorMm: component.anchorMm,
          },
          notice: undefined,
        },
      }
    })
  },

  updateComponentDrag: (componentId, anchorMm) => {
    set((state) => {
      if (state.interaction.activeDragComponentId !== componentId) {
        return state
      }

      return {
        interaction: {
          ...state.interaction,
          dragPreview: {
            componentId,
            candidateAnchorMm: anchorMm,
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

      const placement = resolvePlacementForScene({
        candidateAnchorMm:
          anchorMm ??
          state.interaction.dragPreview?.candidateAnchorMm ??
          component.anchorMm,
        component,
        phase: 'drop',
        scene: state.scene,
        snapMode: state.snapMode,
      })

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: state.scene.components.map((item) =>
            item.id === componentId
              ? {
                  ...item,
                  anchorMm: placement.resolvedAnchorMm,
                }
              : item,
          ),
        },
        interaction: {
          ...state.interaction,
          activeDragComponentId: undefined,
          dragPreview: undefined,
          notice: describePlacementReason(placement.reason),
        },
      })
    })
  },

  cancelActiveInteraction: () => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        activeDragComponentId: undefined,
        breadboardDragPreview: undefined,
        dragPreview: undefined,
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
      },
    }))
  },

  deleteSelectedComponent: () => {
    set((state) => {
      if (state.selection.type !== 'component') {
        return state
      }

      const selectedComponentId = state.selection.componentId

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: state.scene.components.filter(
            (component) => component.id !== selectedComponentId,
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

  clearBreadboardComponents: (breadboardId) => {
    set((state) => {
      const surfaceId =
        state.scene.workspace.kind === 'single-breadboard'
          ? SINGLE_BREADBOARD_SURFACE_ID
          : breadboardId

      if (!surfaceId) {
        return state
      }

      const remaining = state.scene.components.filter((c) => {
        const cSurface =
          c.hostSurfaceId ??
          (state.scene.workspace.kind === 'single-breadboard'
            ? SINGLE_BREADBOARD_SURFACE_ID
            : undefined)
        return cSurface !== surfaceId
      })

      if (remaining.length === state.scene.components.length) {
        return state
      }

      return withCommittedScene(state, {
        scene: { ...state.scene, components: remaining },
        selection: getDefaultSelection({ ...state.scene, components: remaining }),
        interaction: {
          ...state.interaction,
          activeDragComponentId: undefined,
          dragPreview: undefined,
          notice: undefined,
        },
      })
    })
  },

  clearOpticalTableComponents: () => {
    set((state) => {
      if (state.scene.workspace.kind !== 'optical-table') {
        return state
      }

      const remaining = state.scene.components.filter(
        (c) => c.hostSurfaceId !== OPTICAL_TABLE_SURFACE_ID,
      )

      if (remaining.length === state.scene.components.length) {
        return state
      }

      return withCommittedScene(state, {
        scene: { ...state.scene, components: remaining },
        selection: getDefaultSelection({ ...state.scene, components: remaining }),
        interaction: {
          ...state.interaction,
          activeDragComponentId: undefined,
          dragPreview: undefined,
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

      const duplicate: ComponentInstance = {
        ...selectedComponent,
        id: createComponentId(selectedComponent.type),
        label: createAutoNumberedLabel(
          state.scene.components,
          selectedComponent.type,
        ),
        anchorMm: {
          x: placement.resolvedAnchorMm.x + surface.originMm.x,
          y: placement.resolvedAnchorMm.y + surface.originMm.y,
        },
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          components: [...state.scene.components, duplicate],
        },
        selection: { type: 'component', componentId: duplicate.id },
        interaction: {
          ...state.interaction,
          notice: describePlacementReason(placement.reason),
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
      if (state.interaction.pendingPlacement?.draft.type === 'mirror') {
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

      if (!selectedComponent || selectedComponent.type !== 'mirror') {
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
        (pendingPlacement.draft.type === 'sample-stage' ||
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
        (selectedComponent.type !== 'sample-stage' &&
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
          ? {
              ...breadboard,
              label: update.label ?? breadboard.label,
              model: syncBreadboardPresetId({
                ...breadboard.model,
                ...update,
                label: update.label ?? breadboard.model.label,
              }),
            }
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

      return withCommittedScene(state, {
        scene: nextScene,
        selection: getDefaultSelection(nextScene),
        viewport: createViewportForScene(nextScene, state.viewport.canvasSizePx),
        interaction: {
          ...state.interaction,
          activeHostSurfaceId: getDefaultSurfaceId(nextScene),
          pendingPlacement: undefined,
          pendingBreadboardPlacement: undefined,
          notice: undefined,
        },
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

      return withCommittedScene(state, {
        scene: nextScene,
        selection: getDefaultSelection(nextScene),
        viewport: createViewportForScene(nextScene, state.viewport.canvasSizePx),
        interaction: {
          ...state.interaction,
          activeHostSurfaceId: getDefaultSurfaceId(nextScene),
          pendingPlacement: undefined,
          pendingBreadboardPlacement: undefined,
          notice: undefined,
        },
      })
    })
  },

  setActiveHostSurfaceId: (surfaceId) => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        activeHostSurfaceId: surfaceId ?? getDefaultSurfaceId(state.scene),
      },
    }))
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
        startMm,
        endMm,
        color: state.interaction.lineColor,
        strokeWidthMm: 0.8,
      }

      return withCommittedScene(state, {
        scene: {
          ...state.scene,
          annotations: [...state.scene.annotations, newLine],
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
          annotations: state.scene.annotations.filter((a) => a.id !== lineId),
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
      const nextInteraction: InteractionState = {
        ...initialInteraction,
        activeHostSurfaceId: getDefaultSurfaceId(nextScene),
      }
      const patch = {
        scene: nextScene,
        selection: nextSelection,
        viewport: createViewportForScene(nextScene, state.viewport.canvasSizePx),
        interaction: nextInteraction,
      }

      return options?.history === 'reset'
        ? withResetHistory(patch)
        : withCommittedScene(state, patch)
    })
  },
}))

import { create } from 'zustand'
import { getBreadboardCenterMm, getNearestBoardCenterHole } from '../domain/breadboard'
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
  zoomViewportAtScreenPoint,
} from '../domain/geometry'
import {
  alignExternalSourceToTarget,
  annotatePlacementOccupancy,
  findDuplicatePlacement,
  getSceneWorldBoundsMm,
  reconcileComponentAnchorForBreadboard,
  resolveComponentPlacement,
} from '../domain/placement'
import { getDefaultBeamSettings, createEmptyScene } from '../domain/serialization'
import { getSourcePreset } from '../domain/sourcePresets'
import type {
  ActiveTool,
  BeamSplitterConfig,
  BboCrystalConfig,
  BreadboardModel,
  CanvasSizePx,
  ComponentConfig,
  ComponentInstance,
  ComponentType,
  IrisConfig,
  LensConfig,
  PendingPlacementState,
  QuarterTurn,
  RenderMode,
  SceneBeamSettings,
  SceneDocument,
  ScreenPointPx,
  SnapMode,
  SourceConfig,
  SourceLane,
  ToolbarMenu,
  Vector2Mm,
  ViewportState,
} from '../domain/types'

export type SelectionState =
  | { type: 'breadboard' }
  | { type: 'component'; componentId: string }

type ComponentUpdate = Partial<
  Pick<ComponentInstance, 'label' | 'anchorMm' | 'rotationQuarterTurns'>
>

interface ComponentConfigUpdate {
  source?: Partial<SourceConfig>
  beamSplitter?: Partial<BeamSplitterConfig>
  lens?: Partial<LensConfig>
  iris?: Partial<IrisConfig>
  bboCrystal?: Partial<BboCrystalConfig>
  support?: {
    includeMount: boolean
  }
}

interface DragPreviewState {
  componentId: string
  candidateAnchorMm: Vector2Mm
}

interface InteractionState {
  activeDragComponentId?: string
  dragPreview?: DragPreviewState
  pendingPlacement?: PendingPlacementState
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
  notice?: string
}

interface WarningFilters {
  simple: boolean
  advanced: boolean
}

type MountVisibilityDefaults = Partial<Record<ComponentType, boolean>>

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
  selectBreadboard: () => void
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
  updatePendingPlacementAnchor: (anchorMm: Vector2Mm) => void
  commitPendingPlacement: (anchorMm?: Vector2Mm) => void
  beginComponentDrag: (componentId: string) => void
  updateComponentDrag: (componentId: string, anchorMm: Vector2Mm) => void
  commitComponentDrag: (componentId: string, anchorMm?: Vector2Mm) => void
  cancelActiveInteraction: () => void
  deleteSelectedComponent: () => void
  duplicateSelectedComponent: () => void
  updateSelectedComponent: (update: ComponentUpdate) => void
  updateSelectedVariant: (variantId: string) => void
  updateSelectedSource: (update: Partial<SourceConfig>) => void
  applySelectedSourcePreset: (presetId: SourceConfig['presetId']) => void
  alignSelectedSourceToTarget: () => void
  updateSelectedBeamSplitter: (update: Partial<BeamSplitterConfig>) => void
  updateSelectedLens: (update: Partial<LensConfig>) => void
  updateSelectedIris: (update: Partial<IrisConfig>) => void
  updateSelectedBboCrystal: (update: Partial<BboCrystalConfig>) => void
  updateSelectedSupport: (includeMount: boolean) => void
  applySupportToType: (type: ComponentType, includeMount: boolean) => void
  setMountDefaultForType: (type: ComponentType, includeMount: boolean) => void
  rotateSelectedComponent: (direction: -1 | 1) => void
  updateBreadboard: (update: Partial<BreadboardModel>) => void
  applyBreadboardPreset: (presetId: string) => void
  updateBeamSettings: (update: Partial<SceneBeamSettings>) => void
  loadScene: (scene: SceneDocument) => void
}

const DEFAULT_CANVAS_SIZE = { width: 1280, height: 820 }
const initialScene = createEmptyScene()
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

  return value === 'simple' ? 'simple' : 'realistic'
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
  const worldBounds = getSceneWorldBoundsMm(scene.breadboard)

  return {
    zoomPxPerMm: fitZoomPxPerMm(
      { width: worldBounds.width, height: worldBounds.height },
      safeCanvasSize,
    ),
    cameraCenterMm: getBreadboardCenterMm(scene.breadboard),
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

  return annotatePlacementOccupancy({
    breadboard: scene.breadboard,
    components: scene.components,
    ignoreComponentId: component.id,
    result: resolveComponentPlacement({
      breadboard: scene.breadboard,
      candidateAnchorMm,
      component,
      phase,
      rotationQuarterTurns,
      snapMode,
    }),
  })
}

function reconcileComponentsToBreadboard(
  components: ComponentInstance[],
  breadboard: BreadboardModel,
) {
  return components.map((component) => ({
    ...component,
    anchorMm: reconcileComponentAnchorForBreadboard(component, breadboard),
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

function createComponentDraft(
  scene: SceneDocument,
  selection: SelectionState,
  type: ComponentType,
  mountVisibilityDefaults: MountVisibilityDefaults,
) {
  const definition = getComponentDefinition(type)
  const variantId = definition.defaultVariantId
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
    anchorMm: getNearestBoardCenterHole(scene.breadboard),
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
  const target = scene.components.find((item) => item.id === targetId)
  const aligned = alignExternalSourceToTarget({
    breadboard: scene.breadboard,
    lane,
    source: component,
    target,
  })

  return {
    anchorMm: aligned.anchorMm,
    rotationQuarterTurns: aligned.rotationQuarterTurns,
  }
}

const initialInteraction: InteractionState = {
  activeTool: 'select',
  isHelpOpen: false,
  isSpacePanning: false,
  isPointerPanning: false,
  isWarningsOpen: false,
  showBeamDetails: true,
  showGaussianEnvelope: false,
}
const initialRenderMode = readRenderMode()
const initialWarningFilters = readWarningFilters()
const initialMountVisibilityDefaults = readMountVisibilityDefaults()

export const useEditorStore = create<EditorStore>((set) => ({
  scene: initialScene,
  selection: { type: 'breadboard' },
  snapMode: 'onDrop',
  viewport: createViewportForScene(initialScene),
  renderMode: initialRenderMode,
  warningFilters: initialWarningFilters,
  mountVisibilityDefaults: initialMountVisibilityDefaults,
  openToolbarMenu: undefined,
  interaction: initialInteraction,

  selectBreadboard: () => {
    set((state) => ({
      selection: { type: 'breadboard' },
      interaction: {
        ...state.interaction,
        notice: undefined,
        pendingPlacement: undefined,
      },
    }))
  },

  selectComponent: (componentId) => {
    set((state) => ({
      selection: { type: 'component', componentId },
      interaction: {
        ...state.interaction,
        notice: undefined,
        pendingPlacement: undefined,
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
      )

      return {
        selection: { type: 'breadboard' },
        interaction: {
          ...state.interaction,
          pendingPlacement: {
            draft,
            candidateAnchorMm: draft.anchorMm,
          },
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

      return {
        scene: {
          ...state.scene,
          components: [...state.scene.components, nextComponent],
        },
        selection: { type: 'component', componentId: nextComponent.id },
        interaction: {
          ...state.interaction,
          pendingPlacement: undefined,
          notice: describePlacementReason(placement.reason),
        },
      }
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

      return {
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
      }
    })
  },

  cancelActiveInteraction: () => {
    set((state) => ({
      interaction: {
        ...state.interaction,
        activeDragComponentId: undefined,
        dragPreview: undefined,
        pendingPlacement: undefined,
        hoveredBeamSegmentId: undefined,
        isPointerPanning: false,
        isSpacePanning: false,
        isHelpOpen: false,
        isWarningsOpen: false,
        selectedWarningId: undefined,
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

      return {
        scene: {
          ...state.scene,
          components: state.scene.components.filter(
            (component) => component.id !== selectedComponentId,
          ),
        },
        selection: { type: 'breadboard' },
        interaction: {
          ...state.interaction,
          activeDragComponentId: undefined,
          dragPreview: undefined,
          notice: undefined,
        },
      }
    })
  },

  duplicateSelectedComponent: () => {
    set((state) => {
      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent) {
        return state
      }

      const placement = findDuplicatePlacement({
        breadboard: state.scene.breadboard,
        component: selectedComponent,
        components: state.scene.components,
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
        anchorMm: placement.resolvedAnchorMm,
      }

      return {
        scene: {
          ...state.scene,
          components: [...state.scene.components, duplicate],
        },
        selection: { type: 'component', componentId: duplicate.id },
        interaction: {
          ...state.interaction,
          notice: describePlacementReason(placement.reason),
        },
      }
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

      return {
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
      }
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

      return {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === nextComponent.id ? nextComponent : component,
          ),
        },
      }
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

      return {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === resolvedComponent.id ? resolvedComponent : component,
          ),
        },
      }
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

      return {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === nextComponent.id ? nextComponent : component,
          ),
        },
      }
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

      return {
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
      }
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

      return {
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
      }
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

      return {
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
      }
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

      return {
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
      }
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

      return {
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
      }
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

      return {
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
      }
    })
  },

  applySupportToType: (type, includeMount) => {
    set((state) => ({
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
    }))
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

      return {
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
      }
    })
  },

  updateBreadboard: (update) => {
    set((state) => {
      const nextBreadboard = syncBreadboardPresetId({
        ...state.scene.breadboard,
        ...update,
      })

      return {
        scene: {
          ...state.scene,
          breadboard: nextBreadboard,
          components: reconcileComponentsToBreadboard(
            state.scene.components,
            nextBreadboard,
          ),
        },
        interaction: {
          ...state.interaction,
          activeDragComponentId: undefined,
          dragPreview: undefined,
          pendingPlacement: undefined,
        },
      }
    })
  },

  applyBreadboardPreset: (presetId) => {
    set((state) => {
      const nextBreadboard = createBreadboardFromPreset(presetId)

      return {
        scene: {
          ...state.scene,
          breadboard: nextBreadboard,
          components: reconcileComponentsToBreadboard(
            state.scene.components,
            nextBreadboard,
          ),
        },
        interaction: {
          ...state.interaction,
          activeDragComponentId: undefined,
          dragPreview: undefined,
          pendingPlacement: undefined,
        },
      }
    })
  },

  updateBeamSettings: (update) => {
    set((state) => ({
      scene: {
        ...state.scene,
        beamSettings: {
          ...state.scene.beamSettings,
          ...update,
        },
      },
    }))
  },

  loadScene: (scene) => {
    set((state) => {
      const nextBreadboard = syncBreadboardPresetId(scene.breadboard)
      const nextScene: SceneDocument = {
        ...scene,
        breadboard: nextBreadboard,
        beamSettings: scene.beamSettings ?? getDefaultBeamSettings(),
        components: reconcileComponentsToBreadboard(scene.components, nextBreadboard),
      }

      return {
        scene: nextScene,
        selection: { type: 'breadboard' },
        viewport: createViewportForScene(nextScene, state.viewport.canvasSizePx),
        interaction: initialInteraction,
      }
    })
  },
}))

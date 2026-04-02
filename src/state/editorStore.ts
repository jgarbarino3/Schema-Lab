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
  QuarterTurn,
  SceneBeamSettings,
  SceneDocument,
  ScreenPointPx,
  SnapMode,
  SourceConfig,
  SourceLane,
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
}

interface DragPreviewState {
  componentId: string
  candidateAnchorMm: Vector2Mm
}

interface InteractionState {
  activeDragComponentId?: string
  dragPreview?: DragPreviewState
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
  notice?: string
}

interface EditorStore {
  scene: SceneDocument
  selection: SelectionState
  snapMode: SnapMode
  viewport: ViewportState
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
  selectBeamSegment: (segmentId: string, pathId: string, interactionId?: string) => void
  clearBeamInspectionSelection: () => void
  setHelpOpen: (isOpen: boolean) => void
  clearNotice: () => void
  setViewportSize: (canvasSizePx: CanvasSizePx) => void
  panViewportByScreenDelta: (deltaPx: ScreenPointPx) => void
  applyPinchViewport: (
    previousMidpointPx: ScreenPointPx,
    nextMidpointPx: ScreenPointPx,
    zoomFactor: number,
  ) => void
  zoomAtScreenPoint: (pointPx: ScreenPointPx, zoomFactor: number) => void
  resetViewport: () => void
  addComponent: (type: ComponentType) => void
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
  rotateSelectedComponent: (direction: -1 | 1) => void
  updateBreadboard: (update: Partial<BreadboardModel>) => void
  applyBreadboardPreset: (presetId: string) => void
  updateBeamSettings: (update: Partial<SceneBeamSettings>) => void
  loadScene: (scene: SceneDocument) => void
}

const DEFAULT_CANVAS_SIZE = { width: 1280, height: 820 }
const initialScene = createEmptyScene()

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

function createDuplicateLabel(
  components: ComponentInstance[],
  originalLabel: string,
) {
  const baseLabel = `${originalLabel} Copy`

  if (!components.some((component) => component.label === baseLabel)) {
    return baseLabel
  }

  let nextIndex = 2

  while (
    components.some(
      (component) => component.label === `${baseLabel} ${nextIndex}`,
    )
  ) {
    nextIndex += 1
  }

  return `${baseLabel} ${nextIndex}`
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
  showBeamDetails: true,
  showGaussianEnvelope: false,
}

export const useEditorStore = create<EditorStore>((set) => ({
  scene: initialScene,
  selection: { type: 'breadboard' },
  snapMode: 'onDrop',
  viewport: createViewportForScene(initialScene),
  interaction: initialInteraction,

  selectBreadboard: () => {
    set((state) => ({
      selection: { type: 'breadboard' },
      interaction: {
        ...state.interaction,
        notice: undefined,
      },
    }))
  },

  selectComponent: (componentId) => {
    set((state) => ({
      selection: { type: 'component', componentId },
      interaction: {
        ...state.interaction,
        notice: undefined,
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
      const definition = getComponentDefinition(type)
      const variantId = definition.defaultVariantId
      const selectedComponentId =
        state.selection.type === 'component'
          ? state.selection.componentId
          : undefined
      let selectedTarget: ComponentInstance | undefined

      if (selectedComponentId) {
        selectedTarget = state.scene.components.find(
          (component) => component.id === selectedComponentId,
        )
      }
      const targetForSource =
        selectedTarget && isOpticalTarget(selectedTarget.type)
          ? selectedTarget
          : getOpticalTargetComponents(state.scene)[0]
      let nextComponent: ComponentInstance = {
        id: createComponentId(type),
        type,
        label: definition.defaultLabel,
        variantId,
        anchorMm: getNearestBoardCenterHole(state.scene.breadboard),
        rotationQuarterTurns: 0,
        config: createDefaultComponentConfig(type, variantId),
      }

      if (type === 'laser-source') {
        const existingSourceConfig = nextComponent.config.source

        if (!existingSourceConfig) {
          return state
        }

        const nextSourceConfig: SourceConfig = {
          ...existingSourceConfig,
          firstTargetComponentId: targetForSource?.id,
        }
        nextComponent = {
          ...nextComponent,
          config: {
            ...nextComponent.config,
            source: nextSourceConfig,
          },
        }

        const aligned = applySourceLane(
          state.scene,
          nextComponent,
          nextSourceConfig?.lane ?? 'left',
          targetForSource?.id,
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
          components: [...state.scene.components, nextComponent],
        },
        selection: { type: 'component', componentId: nextComponent.id },
        interaction: {
          ...state.interaction,
          notice: undefined,
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
        hoveredBeamSegmentId: undefined,
        isPointerPanning: false,
        isSpacePanning: false,
        isHelpOpen: false,
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
        label: createDuplicateLabel(state.scene.components, selectedComponent.label),
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
      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent) {
        return state
      }

      let nextComponent: ComponentInstance = {
        ...selectedComponent,
        variantId,
        config: createDefaultComponentConfig(selectedComponent.type, variantId),
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
      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent?.config.source) {
        return state
      }

      const nextSource = {
        ...selectedComponent.config.source,
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
      const selectedComponent = getSelectedComponent(state.scene, state.selection)

      if (!selectedComponent?.config.source) {
        return state
      }

      const preset = getSourcePreset(presetId)
      const nextSource: SourceConfig = {
        ...selectedComponent.config.source,
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

  rotateSelectedComponent: (direction) => {
    set((state) => {
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

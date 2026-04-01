import { create } from 'zustand'
import {
  getBreadboardCenterMm,
  getNearestBoardCenterHole,
  getNearestHole,
} from '../domain/breadboard'
import {
  createBreadboardFromPreset,
  findBreadboardPresetId,
} from '../domain/breadboardPresets'
import { getComponentDefinition } from '../domain/componentCatalog'
import {
  fitZoomPxPerMm,
  normalizeQuarterTurns,
  panViewportByScreenDelta as panViewportByDelta,
  roundMm,
  zoomViewportAtScreenPoint,
} from '../domain/geometry'
import { createEmptyScene } from '../domain/serialization'
import type {
  BreadboardModel,
  CanvasSizePx,
  ComponentInstance,
  ComponentType,
  QuarterTurn,
  SceneDocument,
  ScreenPointPx,
  SnapMode,
  Vector2Mm,
  ViewportState,
} from '../domain/types'

export type SelectionState =
  | { type: 'breadboard' }
  | { type: 'component'; componentId: string }

type MovePhase = 'drag' | 'drop'
type ComponentUpdate = Partial<Omit<ComponentInstance, 'id' | 'type'>>

interface EditorStore {
  scene: SceneDocument
  selection: SelectionState
  snapMode: SnapMode
  viewport: ViewportState
  selectBreadboard: () => void
  selectComponent: (componentId: string) => void
  setSnapMode: (snapMode: SnapMode) => void
  setViewportSize: (canvasSizePx: CanvasSizePx) => void
  panViewportByScreenDelta: (deltaPx: ScreenPointPx) => void
  zoomAtScreenPoint: (pointPx: ScreenPointPx, zoomFactor: number) => void
  resetViewport: () => void
  addComponent: (type: ComponentType) => void
  moveComponent: (
    componentId: string,
    anchorMm: Vector2Mm,
    phase: MovePhase,
  ) => void
  updateSelectedComponent: (update: ComponentUpdate) => void
  rotateSelectedComponent: (direction: -1 | 1) => void
  updateBreadboard: (update: Partial<BreadboardModel>) => void
  applyBreadboardPreset: (presetId: string) => void
  loadScene: (scene: SceneDocument) => void
}

const DEFAULT_CANVAS_SIZE = { width: 1200, height: 760 }

function createViewportForBreadboard(
  breadboard: BreadboardModel,
  canvasSizePx: CanvasSizePx = DEFAULT_CANVAS_SIZE,
): ViewportState {
  const safeCanvasSize = {
    width: canvasSizePx.width > 0 ? canvasSizePx.width : DEFAULT_CANVAS_SIZE.width,
    height:
      canvasSizePx.height > 0 ? canvasSizePx.height : DEFAULT_CANVAS_SIZE.height,
  }

  return {
    zoomPxPerMm: fitZoomPxPerMm(
      { width: breadboard.widthMm, height: breadboard.heightMm },
      safeCanvasSize,
    ),
    cameraCenterMm: getBreadboardCenterMm(breadboard),
    canvasSizePx: safeCanvasSize,
  }
}

function createComponentId(type: ComponentType) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${type}-${crypto.randomUUID().slice(0, 8)}`
  }

  return `${type}-${Math.random().toString(36).slice(2, 10)}`
}

function snapComponentsToBreadboard(
  components: ComponentInstance[],
  breadboard: BreadboardModel,
) {
  return components.map((component) => ({
    ...component,
    anchorMm: getNearestHole(breadboard, component.anchorMm),
  }))
}

function syncBreadboardPresetId(breadboard: BreadboardModel): BreadboardModel {
  return {
    ...breadboard,
    presetId: findBreadboardPresetId(breadboard),
  }
}

const initialScene = createEmptyScene()

export const useEditorStore = create<EditorStore>((set) => ({
  scene: initialScene,
  selection: { type: 'breadboard' },
  snapMode: 'always',
  viewport: createViewportForBreadboard(initialScene.breadboard),

  selectBreadboard: () => {
    set({ selection: { type: 'breadboard' } })
  },

  selectComponent: (componentId) => {
    set({ selection: { type: 'component', componentId } })
  },

  setSnapMode: (snapMode) => {
    set({ snapMode })
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

  zoomAtScreenPoint: (pointPx, zoomFactor) => {
    set((state) => ({
      viewport: zoomViewportAtScreenPoint(state.viewport, pointPx, zoomFactor),
    }))
  },

  resetViewport: () => {
    set((state) => ({
      viewport: createViewportForBreadboard(
        state.scene.breadboard,
        state.viewport.canvasSizePx,
      ),
    }))
  },

  addComponent: (type) => {
    const definition = getComponentDefinition(type)

    set((state) => {
      const nextComponent: ComponentInstance = {
        id: createComponentId(type),
        type,
        label: definition.defaultLabel,
        anchorMm: getNearestBoardCenterHole(state.scene.breadboard),
        rotationQuarterTurns: 0,
      }

      return {
        scene: {
          ...state.scene,
          components: [...state.scene.components, nextComponent],
        },
        selection: { type: 'component', componentId: nextComponent.id },
      }
    })
  },

  moveComponent: (componentId, anchorMm, phase) => {
    set((state) => {
      const shouldSnap = state.snapMode === 'always' || phase === 'drop'
      const resolvedAnchor = shouldSnap
        ? getNearestHole(state.scene.breadboard, anchorMm)
        : { x: roundMm(anchorMm.x), y: roundMm(anchorMm.y) }

      return {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === componentId
              ? { ...component, anchorMm: resolvedAnchor }
              : component,
          ),
        },
      }
    })
  },

  updateSelectedComponent: (update) => {
    set((state) => {
      if (state.selection.type !== 'component') {
        return state
      }

      const selectedComponentId = state.selection.componentId

      return {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) => {
            if (component.id !== selectedComponentId) {
              return component
            }

            return {
              ...component,
              ...update,
              anchorMm: update.anchorMm
                ? getNearestHole(state.scene.breadboard, update.anchorMm)
                : component.anchorMm,
              rotationQuarterTurns:
                update.rotationQuarterTurns === undefined
                  ? component.rotationQuarterTurns
                  : (normalizeQuarterTurns(
                      update.rotationQuarterTurns,
                    ) as QuarterTurn),
            }
          }),
        },
      }
    })
  },

  rotateSelectedComponent: (direction) => {
    set((state) => {
      if (state.selection.type !== 'component') {
        return state
      }

      const selectedComponentId = state.selection.componentId

      return {
        scene: {
          ...state.scene,
          components: state.scene.components.map((component) =>
            component.id === selectedComponentId
              ? {
                  ...component,
                  rotationQuarterTurns: normalizeQuarterTurns(
                    component.rotationQuarterTurns + direction,
                  ) as QuarterTurn,
                }
              : component,
          ),
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
          components: snapComponentsToBreadboard(
            state.scene.components,
            nextBreadboard,
          ),
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
          components: snapComponentsToBreadboard(
            state.scene.components,
            nextBreadboard,
          ),
        },
      }
    })
  },

  loadScene: (scene) => {
    set((state) => {
      const nextBreadboard = syncBreadboardPresetId(scene.breadboard)
      const nextScene: SceneDocument = {
        ...scene,
        breadboard: nextBreadboard,
        components: snapComponentsToBreadboard(scene.components, nextBreadboard),
      }

      return {
        scene: nextScene,
        selection: { type: 'breadboard' },
        viewport: createViewportForBreadboard(
          nextScene.breadboard,
          state.viewport.canvasSizePx,
        ),
      }
    })
  },
}))

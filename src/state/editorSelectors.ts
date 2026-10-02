import { useShallow } from 'zustand/react/shallow'
import { useEditorStore, type EditorStore } from './editorStore'

const selectAppInteractionState = (state: EditorStore) => ({
  activeHostSurfaceId: state.interaction.activeHostSurfaceId,
  editingTextAnnotationId: state.interaction.editingTextAnnotationId,
  focusedBreadboardId: state.interaction.focusedBreadboardId,
  isHelpOpen: state.interaction.isHelpOpen,
  isWarningsOpen: state.interaction.isWarningsOpen,
  notice: state.interaction.notice,
  pendingBreadboardPlacement: state.interaction.pendingBreadboardPlacement,
  pendingPlacement: state.interaction.pendingPlacement,
  selectedWarningId: state.interaction.selectedWarningId,
  showGaussianEnvelope: state.interaction.showGaussianEnvelope,
  workspaceViewMode: state.interaction.workspaceViewMode,
})

const selectToolbarInteractionState = (state: EditorStore) => ({
  activeTool: state.interaction.activeTool,
  isHelpOpen: state.interaction.isHelpOpen,
  isWarningsOpen: state.interaction.isWarningsOpen,
  selectedWarningId: state.interaction.selectedWarningId,
  showBeamDetails: state.interaction.showBeamDetails,
  showGaussianEnvelope: state.interaction.showGaussianEnvelope,
})

const selectToolbarWorkspaceState = (state: EditorStore) => ({
  hasBreadboards:
    state.scene.workspace.kind !== 'optical-table' ||
    state.scene.workspace.breadboards.length > 0,
})

const selectAnnotationToolState = (state: EditorStore) => ({
  activeTool: state.interaction.activeTool,
  lineColor: state.interaction.lineColor,
  shapeToolKind: state.interaction.shapeToolKind,
  textToolVariant: state.interaction.textToolVariant,
})

const selectBeamInspectionState = (state: EditorStore) => ({
  selectedBeamInteractionId: state.interaction.selectedBeamInteractionId,
  selectedBeamPathId: state.interaction.selectedBeamPathId,
  selectedBeamSegmentId: state.interaction.selectedBeamSegmentId,
})

const selectInspectorInteractionState = (state: EditorStore) => ({
  activeHostSurfaceId: state.interaction.activeHostSurfaceId,
  notice: state.interaction.notice,
  pendingBreadboardPlacement: state.interaction.pendingBreadboardPlacement,
  pendingPlacement: state.interaction.pendingPlacement,
})

export function useAppInteractionState() {
  return useEditorStore(useShallow(selectAppInteractionState))
}

export function useToolbarInteractionState() {
  return useEditorStore(useShallow(selectToolbarInteractionState))
}

export function useToolbarWorkspaceState() {
  return useEditorStore(useShallow(selectToolbarWorkspaceState))
}

export function useAnnotationToolState() {
  return useEditorStore(useShallow(selectAnnotationToolState))
}

export function useBeamInspectionState() {
  return useEditorStore(useShallow(selectBeamInspectionState))
}

export function useInspectorInteractionState() {
  return useEditorStore(useShallow(selectInspectorInteractionState))
}

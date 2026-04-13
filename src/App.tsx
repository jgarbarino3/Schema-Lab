import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import type Konva from 'konva'
import { ExportStage } from './canvas/ExportStage'
import { SchemaStage } from './canvas/SchemaStage'
import { CURRENT_VERSION } from './content/versionHistory'
import {
  getAnnotationBoundsMm,
  getTextAnnotationBodyWidthMm,
  getTextAnnotationTextOriginMm,
} from './domain/annotations'
import { traceSceneBeams } from './domain/beamTracing'
import { isOpticalTarget } from './domain/componentCatalog'
import { fitZoomPxPerMm, roundMm, worldToScreen } from './domain/geometry'
import { inspectSceneComponentPlacement } from './domain/placement'
import {
  createExportViewport,
  type ExportFormat,
  type ExportScope,
  type SvgExportPreset,
} from './domain/exportLayout'
import { analyzeGaussianPaths } from './domain/gaussian'
import { deriveSceneWarnings } from './domain/sceneWarnings'
import {
  formatSceneImportNotice,
  importSceneDocument,
} from './domain/sceneImport'
import { parseSceneDocument, serializeSceneDocument } from './domain/serialization'
import {
  analyzeSvgImportDocument,
  applySvgImportToScene,
  parseSvgImportDocument,
  resolveSvgImportScaleMmPerUnit,
  type SvgCalibrationRequest,
  type SvgImportAnalysis,
  type SvgImportDocument,
  type SvgImportManualResolution,
  type SvgImportMode,
  type SvgImportProfile,
} from './domain/svgImport'
import { createTutorialScene, TUTORIAL_FOCUS_COMPONENT_ID } from './domain/tutorialScene'
import {
  getBreadboardInstance,
  getBreadboardInstances,
  getBreadboardWorldBoundsMm,
  getOpticalTableWorldBoundsMm,
  getWorkspacePrimaryBreadboard,
} from './domain/workspace'
import type { AnnotationText } from './domain/types'
import {
  OPTICAL_TABLE_SURFACE_ID,
  SCENE_DOCUMENT_VERSION,
  SINGLE_BREADBOARD_SURFACE_ID,
} from './domain/types'
import { useEditorStore } from './state/editorStore'
import { useAppInteractionState } from './state/editorSelectors'
import { AnnotationDock } from './ui/AnnotationDock'
import { AnnotationTextEditor } from './ui/AnnotationTextEditor'
import { ClearConfirmModal, type ClearModalState } from './ui/ClearConfirmModal'
import {
  CanvasContextMenu,
  type CanvasContextMenuAction,
} from './ui/CanvasContextMenu'
import { ComponentLibrary } from './ui/ComponentLibrary'
import { ExportOptionsModal } from './ui/ExportOptionsModal'
import { FullLibraryModal } from './ui/FullLibraryModal'
import { InspectorPanel } from './ui/InspectorPanel'
import { JsonModal } from './ui/JsonModal'
import { OnboardingTour, type OnboardingStep } from './ui/OnboardingTour'
import { SvgAmbiguityModal } from './ui/SvgAmbiguityModal'
import { SvgCalibrationModal } from './ui/SvgCalibrationModal'
import { SvgImportOptionsModal } from './ui/SvgImportOptionsModal'
import { dispatchClearLibraryRecents } from './ui/libraryRecents'
import { SelectionToolbar } from './ui/SelectionToolbar'
import { Toolbar, type ExportAction } from './ui/Toolbar'
import { TutorialModal } from './ui/TutorialModal'
import { VersionHistoryModal } from './ui/VersionHistoryModal'
import { WarningReviewModal } from './ui/WarningReviewModal'
import { WorkspaceModeModal } from './ui/WorkspaceModeModal'

const ONBOARDING_SEEN_KEY = 'schema-lab.onboarding.seen'
const ONBOARDING_NEVER_SHOW_KEY = 'schema-lab.onboarding.never-show'
const LEFT_PANEL_COLLAPSED_KEY = 'schema-lab.ui.left-panel-collapsed'
const RIGHT_PANEL_COLLAPSED_KEY = 'schema-lab.ui.right-panel-collapsed'
const OPTICAL_TABLE_SNAPSHOT_KEY = 'schema-lab.workspace.optical-table-snapshot'
const EXPORT_CANVAS_WIDTH_PX = 1800
const EXPORT_CANVAS_HEIGHT_PX = 1200
const DEFAULT_SVG_PRESET: SvgExportPreset = 'engineering'
const CENTER_FRAME_SIDE_PADDING_PX = 88
const CENTER_FRAME_TOP_PADDING_PX = 28
const CENTER_FRAME_BOTTOM_PADDING_PX = 156

interface ExportRequestState {
  format: ExportFormat
  scope: ExportScope
  svgPreset?: SvgExportPreset
}

interface SvgImportPendingOptionsState {
  document: SvgImportDocument
  fileName: string
}

interface SvgImportPendingCalibrationState extends SvgImportPendingOptionsState {
  mode: SvgImportMode
  profile: SvgImportProfile
}

interface SvgImportPendingAmbiguityState {
  analysis: SvgImportAnalysis
  document: SvgImportDocument
  millimetersPerUnit: number
  mode: SvgImportMode
}

type WorkspaceModalState =
  {
      mode: 'to-single-breadboard'
    }

interface CanvasContextMenuState {
  kind: 'annotation' | 'canvas' | 'component'
  x: number
  y: number
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  )
}

function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = objectUrl
  link.download = filename
  document.body.append(link)
  link.click()
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
    link.remove()
  }, 0)
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

function readStoredFlag(key: string) {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(key) === '1'
}

function writeStoredFlag(key: string, value: boolean) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(key, value ? '1' : '0')
}

function readStoredSnapshot(key: string) {
  if (typeof window === 'undefined') {
    return undefined
  }

  return window.localStorage.getItem(key) ?? undefined
}

function writeStoredSnapshot(key: string, value?: string) {
  if (typeof window === 'undefined') {
    return
  }

  if (value === undefined) {
    window.localStorage.removeItem(key)
    return
  }

  window.localStorage.setItem(key, value)
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function createTopBiasedViewportForBounds(
  bounds: { x: number; y: number; width: number; height: number },
  viewport: { canvasSizePx: { width: number; height: number }; zoomPxPerMm: number },
) {
  const canvasWidth = Math.max(1, viewport.canvasSizePx.width)
  const canvasHeight = Math.max(1, viewport.canvasSizePx.height)
  const availableWidthPx = Math.max(1, canvasWidth - CENTER_FRAME_SIDE_PADDING_PX * 2)
  const availableHeightPx = Math.max(
    1,
    canvasHeight - CENTER_FRAME_TOP_PADDING_PX - CENTER_FRAME_BOTTOM_PADDING_PX,
  )
  const fitZoomPxPerMmForBounds = fitZoomPxPerMm(
    {
      width: bounds.width,
      height: bounds.height,
    },
    {
      width: availableWidthPx,
      height: availableHeightPx,
    },
    0,
  )
  const zoomPxPerMm = Math.min(viewport.zoomPxPerMm, fitZoomPxPerMmForBounds)

  return {
    zoomPxPerMm,
    cameraCenterMm: {
      x: roundMm(bounds.x + bounds.width / 2),
      y: roundMm(bounds.y + (canvasHeight / 2 - CENTER_FRAME_TOP_PADDING_PX) / zoomPxPerMm),
    },
  }
}

function App() {
  const scene = useEditorStore((state) => state.scene)
  const selection = useEditorStore((state) => state.selection)
  const {
    activeHostSurfaceId,
    editingTextAnnotationId,
    focusedBreadboardId,
    isHelpOpen,
    isWarningsOpen,
    notice,
    pendingBreadboardPlacement,
    pendingPlacement,
    selectedWarningId,
    showGaussianEnvelope,
    workspaceViewMode,
  } = useAppInteractionState()
  const dismissedWarningIds = useEditorStore(
    (state) => state.interaction.dismissedWarningIds,
  )
  const renderMode = useEditorStore((state) => state.renderMode)
  const simpleIconStyle = useEditorStore((state) => state.simpleIconStyle)
  const warningFilters = useEditorStore((state) => state.warningFilters)
  const openToolbarMenu = useEditorStore((state) => state.openToolbarMenu)
  const loadScene = useEditorStore((state) => state.loadScene)
  const canUndo = useEditorStore((state) => state.canUndo)
  const canRedo = useEditorStore((state) => state.canRedo)
  const convertWorkspaceToOpticalTable = useEditorStore(
    (state) => state.convertWorkspaceToOpticalTable,
  )
  const createFreshOpticalTable = useEditorStore(
    (state) => state.createFreshOpticalTable,
  )
  const convertWorkspaceToSingleBreadboard = useEditorStore(
    (state) => state.convertWorkspaceToSingleBreadboard,
  )
  const setSpacePanning = useEditorStore((state) => state.setSpacePanning)
  const setHelpOpen = useEditorStore((state) => state.setHelpOpen)
  const setOpenToolbarMenu = useEditorStore((state) => state.setOpenToolbarMenu)
  const setWarningsOpen = useEditorStore((state) => state.setWarningsOpen)
  const setActiveTool = useEditorStore((state) => state.setActiveTool)
  const setRenderMode = useEditorStore((state) => state.setRenderMode)
  const setSelectedWarningId = useEditorStore((state) => state.setSelectedWarningId)
  const addComponent = useEditorStore((state) => state.addComponent)
  const cancelActiveInteraction = useEditorStore(
    (state) => state.cancelActiveInteraction,
  )
  const deleteSelectedComponent = useEditorStore(
    (state) => state.deleteSelectedComponent,
  )
  const duplicateSelectedComponent = useEditorStore(
    (state) => state.duplicateSelectedComponent,
  )
  const deleteSelectedAnnotation = useEditorStore(
    (state) => state.deleteSelectedAnnotation,
  )
  const duplicateSelectedAnnotation = useEditorStore(
    (state) => state.duplicateSelectedAnnotation,
  )
  const moveSelectedAnnotationInStack = useEditorStore(
    (state) => state.moveSelectedAnnotationInStack,
  )
  const clearSurfaceContent = useEditorStore((state) => state.clearSurfaceContent)
  const selectBreadboard = useEditorStore((state) => state.selectBreadboard)
  const selectOpticalTable = useEditorStore((state) => state.selectOpticalTable)
  const selectComponent = useEditorStore((state) => state.selectComponent)
  const rotateSelectedComponent = useEditorStore(
    (state) => state.rotateSelectedComponent,
  )
  const rotateHighlightSelection = useEditorStore(
    (state) => state.rotateHighlightSelection,
  )
  const updateSelectedSource = useEditorStore((state) => state.updateSelectedSource)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const resetViewport = useEditorStore((state) => state.resetViewport)
  const clearHighlightSelection = useEditorStore(
    (state) => state.clearHighlightSelection,
  )
  const setWorkspaceViewMode = useEditorStore(
    (state) => state.setWorkspaceViewMode,
  )
  const setNotice = useEditorStore((state) => state.setNotice)
  const setShowGaussianEnvelope = useEditorStore(
    (state) => state.setShowGaussianEnvelope,
  )
  const finishTextAnnotationEditing = useEditorStore(
    (state) => state.finishTextAnnotationEditing,
  )
  const setTextAnnotationDraftText = useEditorStore(
    (state) => state.setTextAnnotationDraftText,
  )
  const cancelTextAnnotationEditing = useEditorStore(
    (state) => state.cancelTextAnnotationEditing,
  )
  const viewport = useEditorStore((state) => state.viewport)
  const jsonFileInputRef = useRef<HTMLInputElement | null>(null)
  const svgFileInputRef = useRef<HTMLInputElement | null>(null)
  const stageShellRef = useRef<HTMLDivElement | null>(null)
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false)
  const [jsonSeed, setJsonSeed] = useState('')
  const [jsonError, setJsonError] = useState<string | undefined>()
  const [pendingExportRequest, setPendingExportRequest] =
    useState<ExportRequestState>()
  const [exportOptionsFormat, setExportOptionsFormat] = useState<ExportFormat>()
  const [rasterExportRequest, setRasterExportRequest] =
    useState<ExportRequestState>()
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState(0)
  const [tourMode, setTourMode] = useState<'guide' | 'tutorial'>('guide')
  const [isTutorialModalOpen, setIsTutorialModalOpen] = useState(false)
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false)
  const [isFullLibraryOpen, setIsFullLibraryOpen] = useState(false)
  const [isLibraryCollapsed, setIsLibraryCollapsed] = useState(() =>
    readStoredFlag(LEFT_PANEL_COLLAPSED_KEY),
  )
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(() =>
    readStoredFlag(RIGHT_PANEL_COLLAPSED_KEY),
  )
  const [workspaceModalState, setWorkspaceModalState] =
    useState<WorkspaceModalState>()
  const [clearModalState, setClearModalState] = useState<ClearModalState>()
  const [svgImportOptionsState, setSvgImportOptionsState] =
    useState<SvgImportPendingOptionsState>()
  const [svgCalibrationState, setSvgCalibrationState] =
    useState<SvgImportPendingCalibrationState>()
  const [svgAmbiguityState, setSvgAmbiguityState] =
    useState<SvgImportPendingAmbiguityState>()
  const [contextMenuState, setContextMenuState] = useState<CanvasContextMenuState>()
  const [svgImportNotice, setSvgImportNotice] = useState<string | undefined>()
  const [showComponentLabels, setShowComponentLabels] = useState(true)
  const [showPostHolders, setShowPostHolders] = useState(false)
  const sceneJson = useMemo(() => serializeSceneDocument(scene), [scene])
  const primaryBreadboard = useMemo(() => getWorkspacePrimaryBreadboard(scene), [scene])
  const breadboardInstances = useMemo(() => getBreadboardInstances(scene), [scene])
  const beamTrace = useMemo(() => traceSceneBeams(scene), [scene])
  const gaussianTrace = useMemo(
    () => analyzeGaussianPaths(scene, beamTrace),
    [beamTrace, scene],
  )
  const sceneWarnings = useMemo(
    () => deriveSceneWarnings(scene, beamTrace, gaussianTrace),
    [beamTrace, gaussianTrace, scene],
  )
  const visibleSceneWarnings = useMemo(
    () =>
      sceneWarnings.filter(
        (warning) => !dismissedWarningIds.includes(warning.id),
      ),
    [dismissedWarningIds, sceneWarnings],
  )
  const filteredSceneWarnings = useMemo(
    () =>
      visibleSceneWarnings.filter((warning) =>
        warning.tier === 'simple'
          ? warningFilters.simple
          : warningFilters.advanced,
      ),
    [visibleSceneWarnings, warningFilters.advanced, warningFilters.simple],
  )
  const activeSources = scene.components.filter(
    (component) => component.config.source?.isEnabled,
  )
  const isWarningReviewOpen = pendingExportRequest !== undefined
  const isWorkspaceModalOpen = workspaceModalState !== undefined
  const isClearModalOpen = clearModalState !== undefined
  const isSvgImportOptionsOpen = svgImportOptionsState !== undefined
  const isSvgCalibrationOpen = svgCalibrationState !== undefined
  const isSvgAmbiguityOpen = svgAmbiguityState !== undefined
  const exportBreadboardSurfaceId =
    scene.workspace.kind === 'single-breadboard'
      ? SINGLE_BREADBOARD_SURFACE_ID
      : selection.type === 'breadboard'
        ? selection.surfaceId
        : activeHostSurfaceId &&
            activeHostSurfaceId !== OPTICAL_TABLE_SURFACE_ID
          ? activeHostSurfaceId
          : breadboardInstances[0]?.id
  const exportViewport = useMemo(() => {
    if (!rasterExportRequest) {
      return undefined
    }

    return createExportViewport(
      scene,
      rasterExportRequest.scope,
      {
        width: EXPORT_CANVAS_WIDTH_PX,
        height: EXPORT_CANVAS_HEIGHT_PX,
      },
      exportBreadboardSurfaceId,
    )
  }, [exportBreadboardSurfaceId, rasterExportRequest, scene])
  const selectedComponent =
    selection.type === 'component'
      ? scene.components.find((component) => component.id === selection.componentId)
      : undefined
  const selectedAnnotation =
    selection.type === 'annotation'
      ? scene.annotations.find((annotation) => annotation.id === selection.annotationId)
      : undefined
  const selectedCanvasAnnotation =
    selectedAnnotation && selectedAnnotation.kind !== 'line'
      ? selectedAnnotation
      : undefined
  const editingTextDraftText = useEditorStore(
    (state) => state.interaction.editingTextDraftText,
  )
  const highlightSelection = useEditorStore(
    (state) => state.interaction.highlightSelection,
  )
  const editingTextAnnotation = useMemo(
    () =>
      editingTextAnnotationId
        ? scene.annotations.find(
            (annotation): annotation is AnnotationText =>
              annotation.id === editingTextAnnotationId &&
              annotation.kind === 'text',
          )
        : undefined,
    [editingTextAnnotationId, scene.annotations],
  )
  const activeDockAnnotation = editingTextAnnotation ?? selectedCanvasAnnotation
  const focusedBreadboardInstance = useMemo(
    () =>
      scene.workspace.kind === 'optical-table'
        ? getBreadboardInstance(scene, focusedBreadboardId)
        : undefined,
    [focusedBreadboardId, scene],
  )
  const boardFocusAvailable =
    scene.workspace.kind === 'single-breadboard' || breadboardInstances.length > 0
  const opticalTargets = useMemo(
    () =>
      scene.components.filter(
        (component) =>
          isOpticalTarget(component.type) &&
          component.id !== pendingPlacement?.draft.id,
      ),
    [pendingPlacement?.draft.id, scene.components],
  )
  const selectedWarning =
    filteredSceneWarnings.find(
      (warning) => warning.id === selectedWarningId,
    ) ??
    visibleSceneWarnings.find(
    (warning) => warning.id === selectedWarningId,
  )
  const highlightedWarning =
    selectedWarning ??
    (isWarningsOpen
      ? filteredSceneWarnings[0] ?? visibleSceneWarnings[0]
      : undefined)
  const highlightedComponentIds = highlightedWarning?.highlightTarget?.componentIds ?? []
  const highlightedPathIds = highlightedWarning?.highlightTarget?.pathIds ?? []
  const highlightedInteractionIds = highlightedWarning?.highlightTarget?.interactionIds ?? []
  const stageHighlightedComponentIds = useMemo(
    () =>
      Array.from(
        new Set([
          ...highlightedComponentIds,
          ...(highlightSelection?.componentIds ?? []),
        ]),
      ),
    [highlightSelection?.componentIds, highlightedComponentIds],
  )
  const stageHighlightedAnnotationIds = useMemo(
    () => Array.from(new Set(highlightSelection?.annotationIds ?? [])),
    [highlightSelection?.annotationIds],
  )

  const guideSteps = useMemo<OnboardingStep[]>(
    () => [
      {
        title: 'Keyboard Shortcuts',
        selector: '[data-tour=\"toolbar-help\"]',
        body: (
          <>
            <p>Open the shortcuts overlay any time to see the core canvas controls without covering the workspace in instructions.</p>
          </>
        ),
      },
      {
        title: 'Workspace Modes',
        selector: '[data-tour=\"workspace-modes\"]',
        body: (
          <>
            <p>Switch between Board Focus for detail work and Table View for the broader optical-table layout without losing your place.</p>
          </>
        ),
      },
      {
        title: 'Component Library',
        selector: '[data-tour=\"component-library\"]',
        body: (
          <>
            <p>Search the library, click a family to arm placement, then place it directly on the active surface.</p>
          </>
        ),
      },
      {
        title: 'Panel Collapse',
        selector: '[data-tour=\"panel-library-toggle\"]',
        body: (
          <>
            <p>Collapse either side panel from its own header when you want more canvas space without leaving the current workflow.</p>
          </>
        ),
      },
      {
        title: 'Inspector Context',
        selector: '[data-tour=\"inspector\"]',
        body: (
          <>
            <p>The inspector changes with the current selection so you can tune board settings, component variants, or annotation details in one place.</p>
          </>
        ),
      },
      {
        title: 'Canvas Flow',
        selector: '[data-tour=\"canvas-panel\"]',
        body: (
          <>
            <p>The canvas stays visually quiet until you select or place something, then the relevant placement, selection, and source-target cues appear in context.</p>
          </>
        ),
      },
      {
        title: 'Warnings',
        selector: '[data-tour=\"toolbar-controls\"]',
        body: (
          <>
            <p>Review warnings from the top bar when the scene needs attention, then dismiss or restore them without leaving the editor.</p>
          </>
        ),
      },
      {
        title: 'Export',
        selector: '[data-tour=\"toolbar-export\"]',
        body: (
          <>
            <p>Use Export for file actions, imports, scope-aware output, raw JSON, and the board-to-table helpers. Unresolved warnings still pause downloads before output.</p>
          </>
        ),
      },
      {
        title: 'Help',
        selector: '[data-tour=\"toolbar-help\"]',
        body: (
          <>
            <p>Use the question-mark control to reopen this guide, review shortcuts, open the appendix, or jump into the tutorial without leaving the editor.</p>
          </>
        ),
      },
    ],
    [],
  )
  const tutorialSteps = useMemo<OnboardingStep[]>(
    () => [
      {
        title: 'Tutorial Scene Loaded',
        selector: '[data-tour=\"canvas-panel\"]',
        body: (
          <>
            <p>This scene combines steering optics and an inline branch so you can inspect multiple optics families in one working layout.</p>
          </>
        ),
      },
      {
        title: 'Selected Delay Stage',
        selector: '[data-tour=\"inspector\"]',
        body: (
          <>
            <p>The inspector is focused on the delay stage so you can adjust timing-related controls immediately.</p>
          </>
        ),
      },
      {
        title: 'Shortcuts and Context',
        selector: '[data-tour=\"toolbar-help\"]',
        body: (
          <>
            <p>Open the shortcuts overlay whenever you want a quick reminder of canvas navigation, edit commands, and placement controls.</p>
          </>
        ),
      },
      {
        title: 'Export Review',
        selector: '[data-tour=\"toolbar-export\"]',
        body: (
          <>
            <p>Export the tutorial once you are ready to capture the scene as presentation, engineering, or fabrication output.</p>
          </>
        ),
      },
    ],
    [],
  )
  const onboardingSteps = tourMode === 'tutorial' ? tutorialSteps : guideSteps

  useEffect(() => {
    if (typeof window !== 'undefined') {
      ;(window as Window & { __SCHEMA_LAB_STORE__?: typeof useEditorStore }).__SCHEMA_LAB_STORE__ =
        useEditorStore
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const shouldNeverShow = window.localStorage.getItem(ONBOARDING_NEVER_SHOW_KEY) === '1'
    const hasSeen = window.localStorage.getItem(ONBOARDING_SEEN_KEY) === '1'

    if (!shouldNeverShow && !hasSeen) {
      setIsOnboardingOpen(true)
    }
  }, [])

  useEffect(() => {
    if (visibleSceneWarnings.length === 0) {
      setSelectedWarningId(undefined)
      setWarningsOpen(false)
      return
    }

    if (
      selectedWarningId &&
      !visibleSceneWarnings.some(
        (warning) => warning.id === selectedWarningId,
      )
    ) {
      setSelectedWarningId(
        filteredSceneWarnings[0]?.id ?? visibleSceneWarnings[0]?.id,
      )
    }
  }, [
    filteredSceneWarnings,
    selectedWarningId,
    visibleSceneWarnings,
    setSelectedWarningId,
    setWarningsOpen,
  ])

  const markOnboardingSeen = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ONBOARDING_SEEN_KEY, '1')
    }
  }

  const handleOpenOnboarding = () => {
    markOnboardingSeen()
    setTourMode('guide')
    setOnboardingStep(0)
    setIsOnboardingOpen(true)
  }

  const handleCloseOnboarding = () => {
    markOnboardingSeen()
    setIsOnboardingOpen(false)
  }

  const handleNeverShowOnboarding = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ONBOARDING_NEVER_SHOW_KEY, '1')
      window.localStorage.setItem(ONBOARDING_SEEN_KEY, '1')
    }

    setIsOnboardingOpen(false)
  }

  const handleAdvanceOnboarding = () => {
    if (onboardingStep >= onboardingSteps.length - 1) {
      handleCloseOnboarding()
      return
    }

    setOnboardingStep((currentStep) => currentStep + 1)
  }

  const handleRetreatOnboarding = () => {
    setOnboardingStep((currentStep) => Math.max(0, currentStep - 1))
  }

  const downloadSceneJson = () => {
    const jsonBlob = new Blob([sceneJson], { type: 'application/json' })
    downloadBlob(jsonBlob, 'schema-lab-scene.json')
  }

  const handleExportAction = (action: ExportAction) => {
    if (action === 'scene-json') {
      downloadSceneJson()
      return
    }

    setExportOptionsFormat(action)
  }

  const startExport = useCallback(
    async (request: ExportRequestState) => {
      if (request.format === 'svg') {
        const { createSceneSvg } = await import('./domain/svgExport')
        const svgMarkup = createSceneSvg({
          beamTrace,
          breadboardSurfaceId: exportBreadboardSurfaceId,
          gaussianTrace,
          renderMode,
          scene,
          scope: request.scope,
          showGaussianEnvelope,
          simpleIconStyle,
          svgPreset: request.svgPreset ?? DEFAULT_SVG_PRESET,
        })
        const presetSuffix =
          request.svgPreset === 'presentation' ? '-presentation' : '-engineering'

        downloadBlob(
          new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' }),
          request.scope === 'breadboard-only'
            ? `schema-lab-breadboard${presetSuffix}.svg`
            : `schema-lab-full-scheme${presetSuffix}.svg`,
        )
        return
      }

      if (request.format === 'dxf') {
        const { createSceneDxf } = await import('./domain/dxfExport')
        const dxfMarkup = createSceneDxf({
          beamTrace,
          breadboardSurfaceId: exportBreadboardSurfaceId,
          gaussianTrace,
          renderMode,
          scene,
          scope: request.scope,
          showGaussianEnvelope,
          simpleIconStyle,
        })

        downloadBlob(
          new Blob([dxfMarkup], { type: 'application/dxf;charset=utf-8' }),
          request.scope === 'breadboard-only'
            ? 'schema-lab-breadboard.dxf'
            : 'schema-lab-full-scheme.dxf',
        )
        return
      }

      setRasterExportRequest(request)
    },
    [
      beamTrace,
      exportBreadboardSurfaceId,
      gaussianTrace,
      showGaussianEnvelope,
      simpleIconStyle,
      renderMode,
      scene,
    ],
  )

  const handleConfirmExportOptions = (request: ExportRequestState) => {
    setExportOptionsFormat(undefined)

    if (visibleSceneWarnings.length > 0) {
      setPendingExportRequest(request)
      setSelectedWarningId(
        filteredSceneWarnings[0]?.id ?? visibleSceneWarnings[0]?.id,
      )
      return
    }

    void startExport(request)
  }

  const handleRequestBoardFocus = () => {
    if (scene.workspace.kind === 'single-breadboard') {
      return
    }

    if (!boardFocusAvailable) {
      return
    }

    setWorkspaceViewMode('board-focus')
  }

  const handleRequestTableView = () => {
    if (scene.workspace.kind === 'optical-table') {
      setWorkspaceViewMode('table-view')
      return
    }

    if (scene.workspace.kind === 'single-breadboard') {
      convertWorkspaceToOpticalTable()
    }
  }

  const handleConvertCurrentToOpticalTable = () => {
    dispatchClearLibraryRecents()
    convertWorkspaceToOpticalTable()
    setWorkspaceModalState(undefined)
  }

  const handleRestoreSavedTable = () => {
    dispatchClearLibraryRecents()
    const snapshot = readStoredSnapshot(OPTICAL_TABLE_SNAPSHOT_KEY)

    if (!snapshot) {
      handleConvertCurrentToOpticalTable()
      return
    }

    const restoredScene = parseSceneDocument(snapshot)

    startTransition(() => {
      loadScene(restoredScene, { history: 'record' })
    })

    setWorkspaceModalState(undefined)
  }

  const handleStartFreshTable = () => {
    dispatchClearLibraryRecents()
    createFreshOpticalTable()
    setWorkspaceModalState(undefined)
  }

  const handleRequestStandaloneBoard = () => {
    if (scene.workspace.kind !== 'optical-table') {
      return
    }

    setWorkspaceModalState({
      mode: 'to-single-breadboard',
    })
  }

  const handleConvertToSingleBreadboard = (args: {
    breadboardId?: string
    createFresh: boolean
    preserveSnapshot: boolean
  }) => {
    if (args.createFresh) {
      dispatchClearLibraryRecents()
    }

    if (args.preserveSnapshot && scene.workspace.kind === 'optical-table') {
      writeStoredSnapshot(OPTICAL_TABLE_SNAPSHOT_KEY, sceneJson)
    } else if (!args.preserveSnapshot) {
      writeStoredSnapshot(OPTICAL_TABLE_SNAPSHOT_KEY, undefined)
    }

    convertWorkspaceToSingleBreadboard({
      breadboardId: args.breadboardId,
      createFresh: args.createFresh,
    })
    setWorkspaceModalState(undefined)
  }

  const handleRequestClearBreadboard = () => {
    if (scene.workspace.kind === 'optical-table') {
      setClearModalState({
        mode: 'select-breadboard',
        title: 'Clear Breadboard',
        description:
          'Choose a breadboard, then pick which content types to remove from that board only. You can undo afterwards if needed.',
        confirmLabel: 'Clear selected content',
        breadboards: breadboardInstances.map((breadboard) => ({
          id: breadboard.id,
          label: breadboard.label,
          dimensionsLabel: `${breadboard.model.widthMm.toFixed(0)} × ${breadboard.model.heightMm.toFixed(0)} mm`,
        })),
      })
    } else {
      setClearModalState({
        mode: 'single-breadboard',
        surfaceId: SINGLE_BREADBOARD_SURFACE_ID,
        title: 'Clear Breadboard',
        description:
          'Pick which content types to remove from the current breadboard. You can undo afterwards if needed.',
        confirmLabel: 'Clear selected content',
      })
    }
  }

  const handleRequestClearTable = () => {
    setClearModalState({
      mode: 'optical-table',
      surfaceId: OPTICAL_TABLE_SURFACE_ID,
      title: 'Clear Optical Table',
      description:
        'Pick which content types to remove from the optical table surface. Breadboard-hosted content stays untouched.',
      confirmLabel: 'Clear selected content',
    })
  }

  const handleConfirmClearSurface = (args: {
    surfaceId: string
    clearComponents: boolean
    clearLines: boolean
    clearShapes: boolean
    clearText: boolean
  }) => {
    clearSurfaceContent({
      surfaceId: args.surfaceId,
      clearComponents: args.clearComponents,
      clearLines: args.clearLines,
      clearShapes: args.clearShapes,
      clearText: args.clearText,
    })
    setClearModalState(undefined)
  }

  const handleToggleLibrary = () => {
    setIsLibraryCollapsed((current) => {
      const next = !current
      writeStoredFlag(LEFT_PANEL_COLLAPSED_KEY, next)
      return next
    })
  }

  const handleToggleInspector = () => {
    setIsInspectorCollapsed((current) => {
      const next = !current
      writeStoredFlag(RIGHT_PANEL_COLLAPSED_KEY, next)
      return next
    })
  }

  const handleCenterSelection = () => {
    const viewport = useEditorStore.getState().viewport

    const focusBoundsMm = (() => {
      if (highlightSelection) {
        return highlightSelection.boundsMm
      }

      if (selection.type === 'component') {
        const component = scene.components.find(
          (candidate) => candidate.id === selection.componentId,
        )

        if (!component) {
          return undefined
        }

        return inspectSceneComponentPlacement(scene, component).supportBoundsMm
      }

      if (selection.type === 'breadboard') {
        if (scene.workspace.kind === 'single-breadboard') {
          return getBreadboardWorldBoundsMm(primaryBreadboard)
        }

        const breadboard = breadboardInstances.find(
          (candidate) => candidate.id === selection.surfaceId,
        )

        return breadboard
          ? getBreadboardWorldBoundsMm(
              breadboard.model,
              breadboard.anchorMm,
              breadboard.rotationQuarterTurns,
            )
          : undefined
      }

      if (selection.type === 'annotation') {
        return selectedAnnotation ? getAnnotationBoundsMm(selectedAnnotation) : undefined
      }

      if (scene.workspace.kind === 'optical-table') {
        return getOpticalTableWorldBoundsMm(scene.workspace.table)
      }

      return getBreadboardWorldBoundsMm(primaryBreadboard)
    })()

    if (!focusBoundsMm) {
      return
    }

    const nextViewport = createTopBiasedViewportForBounds(focusBoundsMm, viewport)

    useEditorStore.getState().setViewport({
      ...viewport,
      ...nextViewport,
    })
  }

  const handleRotateSelection = useCallback(() => {
    if (highlightSelection) {
      rotateHighlightSelection(1)
      return
    }

    if (selection.type === 'component' || pendingPlacement || pendingBreadboardPlacement) {
      rotateSelectedComponent(1)
    }
  }, [
    highlightSelection,
    pendingBreadboardPlacement,
    pendingPlacement,
    rotateHighlightSelection,
    rotateSelectedComponent,
    selection.type,
  ])

  const handleDuplicateSelection = useCallback(() => {
    if (selection.type === 'annotation') {
      duplicateSelectedAnnotation()
      return
    }

    if (selection.type === 'component') {
      duplicateSelectedComponent()
    }
  }, [
    duplicateSelectedAnnotation,
    duplicateSelectedComponent,
    selection.type,
  ])

  const handleDeleteSelection = useCallback(() => {
    if (selection.type === 'annotation') {
      deleteSelectedAnnotation()
      return
    }

    if (selection.type === 'component') {
      deleteSelectedComponent()
    }
  }, [
    deleteSelectedAnnotation,
    deleteSelectedComponent,
    selection.type,
  ])

  const handleOpenCanvasContextMenu = useCallback(
    (state: CanvasContextMenuState) => {
      setContextMenuState({
        kind: state.kind,
        x: clamp(state.x, 12, window.innerWidth - 220),
        y: clamp(state.y, 12, window.innerHeight - 240),
      })
    },
    [],
  )

  const handleOpenTutorial = () => {
    markOnboardingSeen()
    setIsTutorialModalOpen(true)
  }

  const handleLoadTutorial = () => {
    const tutorialScene = createTutorialScene()

    loadScene(tutorialScene, { history: 'record' })
    selectComponent(TUTORIAL_FOCUS_COMPONENT_ID)
    setShowGaussianEnvelope(true)
    setTourMode('tutorial')
    setOnboardingStep(0)
    setIsTutorialModalOpen(false)
    setIsOnboardingOpen(true)
  }

  const handleClearCanvasSelection = useCallback(() => {
    if (scene.workspace.kind === 'optical-table') {
      if (workspaceViewMode === 'table-view') {
        selectOpticalTable()
        return
      }

      if (focusedBreadboardId) {
        selectBreadboard(focusedBreadboardId)
        return
      }

      selectOpticalTable()
      return
    }

    selectBreadboard(SINGLE_BREADBOARD_SURFACE_ID)
  }, [
    focusedBreadboardId,
    scene.workspace.kind,
    selectBreadboard,
    selectOpticalTable,
    workspaceViewMode,
  ])

  const textEditorPosition = useMemo(() => {
    if (!editingTextAnnotation || !stageShellRef.current) {
      return undefined
    }

    const textOriginPx = worldToScreen(
      getTextAnnotationTextOriginMm(editingTextAnnotation),
      viewport,
    )
    const widthPx = Math.max(
      120,
      getTextAnnotationBodyWidthMm(editingTextAnnotation) * viewport.zoomPxPerMm,
    )

    return {
      leftPx: clamp(
        textOriginPx.x,
        12,
        Math.max(12, stageShellRef.current.clientWidth - widthPx - 12),
      ),
      topPx: clamp(
        textOriginPx.y,
        12,
        Math.max(12, stageShellRef.current.clientHeight - 56),
      ),
      widthPx,
    }
  }, [editingTextAnnotation, viewport])

  const finalizeRasterExport = useCallback(
    async (stage: Konva.Stage, request: ExportRequestState) => {
      await nextAnimationFrame()

      const dataUrl = stage.toDataURL({
        mimeType: request.format === 'pdf' ? 'image/jpeg' : 'image/png',
        pixelRatio: 2,
        quality: 0.94,
      })

      if (request.format === 'png') {
        const response = await fetch(dataUrl)
        const blob = await response.blob()

        downloadBlob(
          blob,
          request.scope === 'breadboard-only'
            ? 'schema-lab-breadboard.png'
            : 'schema-lab-full-scheme.png',
        )
      } else if (request.format === 'pdf') {
        const { createSingleImagePdfBlob } = await import('./domain/pdfExport')
        const pdfBlob = createSingleImagePdfBlob({
          jpegDataUrl: dataUrl,
          widthPx: EXPORT_CANVAS_WIDTH_PX,
          heightPx: EXPORT_CANVAS_HEIGHT_PX,
        })

        downloadBlob(
          pdfBlob,
          request.scope === 'breadboard-only'
            ? 'schema-lab-breadboard.pdf'
            : 'schema-lab-full-scheme.pdf',
        )
      } else {
        const { createSingleImagePptxBlob } = await import('./domain/pptxExport')
        const pptxBlob = await createSingleImagePptxBlob(dataUrl)

        downloadBlob(
          pptxBlob,
          request.scope === 'breadboard-only'
            ? 'schema-lab-breadboard.pptx'
            : 'schema-lab-full-scheme.pptx',
        )
      }

      setRasterExportRequest(undefined)
    },
    [],
  )

  const handleExportStageReady = useCallback(
    (stage: Konva.Stage | null) => {
      if (!stage || !rasterExportRequest) {
        return
      }

      void finalizeRasterExport(stage, rasterExportRequest)
    },
    [finalizeRasterExport, rasterExportRequest],
  )

  useEffect(() => {
    if (!contextMenuState) {
      return
    }

    if (pendingPlacement || pendingBreadboardPlacement) {
      setContextMenuState(undefined)
    }
  }, [contextMenuState, pendingBreadboardPlacement, pendingPlacement])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === ' ' &&
        !isJsonModalOpen &&
        !isFullLibraryOpen &&
        !isSvgImportOptionsOpen &&
        !isSvgCalibrationOpen &&
        !isSvgAmbiguityOpen &&
        !isVersionHistoryOpen &&
        !isTypingTarget(event.target)
      ) {
        event.preventDefault()
        setSpacePanning(true)
        return
      }

      if (
        event.key === 'Enter' &&
        (event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLSelectElement)
      ) {
        event.preventDefault()
        event.target.blur()
        return
      }

      if (isTypingTarget(event.target)) {
        return
      }

      if (event.key === 'Escape') {
        if (isJsonModalOpen) {
          event.preventDefault()
          setJsonError(undefined)
          setIsJsonModalOpen(false)
          return
        }

        if (isFullLibraryOpen) {
          event.preventDefault()
          setIsFullLibraryOpen(false)
          return
        }

        if (isSvgAmbiguityOpen) {
          event.preventDefault()
          setSvgAmbiguityState(undefined)
          return
        }

        if (isSvgCalibrationOpen) {
          event.preventDefault()
          setSvgCalibrationState(undefined)
          return
        }

        if (isSvgImportOptionsOpen) {
          event.preventDefault()
          setSvgImportOptionsState(undefined)
          return
        }

        if (isHelpOpen) {
          event.preventDefault()
          setHelpOpen(false)
          return
        }

        if (contextMenuState) {
          event.preventDefault()
          setContextMenuState(undefined)
          return
        }

        if (openToolbarMenu) {
          event.preventDefault()
          setOpenToolbarMenu(undefined)
          return
        }

        if (exportOptionsFormat) {
          event.preventDefault()
          setExportOptionsFormat(undefined)
          return
        }

        if (isWarningReviewOpen) {
          event.preventDefault()
          setPendingExportRequest(undefined)
          return
        }

        if (isOnboardingOpen) {
          event.preventDefault()
          handleCloseOnboarding()
          return
        }

        if (isTutorialModalOpen) {
          event.preventDefault()
          setIsTutorialModalOpen(false)
          return
        }

        if (isVersionHistoryOpen) {
          event.preventDefault()
          setIsVersionHistoryOpen(false)
          return
        }

        if (isWorkspaceModalOpen) {
          event.preventDefault()
          setWorkspaceModalState(undefined)
          return
        }

        if (isClearModalOpen) {
          event.preventDefault()
          setClearModalState(undefined)
          return
        }

        if (selectedComponent || selectedAnnotation) {
          event.preventDefault()
          cancelActiveInteraction()
          handleClearCanvasSelection()
          return
        }

        event.preventDefault()
        cancelActiveInteraction()
        return
      }

      if (
        isJsonModalOpen ||
        isFullLibraryOpen ||
        isSvgImportOptionsOpen ||
        isSvgCalibrationOpen ||
        isSvgAmbiguityOpen ||
        isVersionHistoryOpen
      ) {
        return
      }

      const key = event.key.toLowerCase()
      const isModifierPressed = event.metaKey || event.ctrlKey

      if (
        isModifierPressed &&
        event.shiftKey &&
        (event.key === '?' || key === '/' || event.code === 'Slash')
      ) {
        event.preventDefault()
        setContextMenuState(undefined)
        setWarningsOpen(false)
        setOpenToolbarMenu(undefined)
        setHelpOpen(true)
        return
      }

      if (isModifierPressed && key === 'z' && !event.shiftKey) {
        if (!canUndo) {
          return
        }

        event.preventDefault()
        undo()
        return
      }

      if (isModifierPressed && (key === 'y' || (key === 'z' && event.shiftKey))) {
        if (!canRedo) {
          return
        }

        event.preventDefault()
        redo()
        return
      }

      if (editingTextAnnotationId) {
        return
      }

      if (!isModifierPressed && event.shiftKey && key === 'l') {
        event.preventDefault()
        setShowComponentLabels((current) => !current)
        return
      }

      if (!isModifierPressed && !event.shiftKey) {
        if (key === '0') {
          event.preventDefault()
          resetViewport()
          return
        }

        if (key === '1') {
          event.preventDefault()
          setRenderMode('realistic')
          return
        }

        if (key === '2') {
          event.preventDefault()
          setRenderMode('simple')
          return
        }

        if (key === 'v') {
          event.preventDefault()
          setActiveTool('select')
          return
        }

        if (key === 'h') {
          event.preventDefault()
          setActiveTool('pan')
          return
        }

        if (key === 'l') {
          event.preventDefault()
          setActiveTool('line')
          return
        }

        if (key === 't') {
          event.preventDefault()
          setActiveTool('text')
          return
        }

        if (key === 's') {
          event.preventDefault()
          setActiveTool('shape')
          return
        }

        if (key === 'q') {
          event.preventDefault()
          setActiveTool('highlight')
          return
        }
      }

      if (!selectedComponent && !selectedAnnotation && !pendingPlacement && !highlightSelection) {
        return
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedComponent) {
        event.preventDefault()
        deleteSelectedComponent()
        return
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedAnnotation) {
        event.preventDefault()
        deleteSelectedAnnotation()
        return
      }

      if (key === 'd' && selectedComponent) {
        event.preventDefault()
        duplicateSelectedComponent()
        return
      }

      if (key === 'd' && selectedAnnotation) {
        event.preventDefault()
        duplicateSelectedAnnotation()
        return
      }

      if (key === 'r' && (selectedComponent || pendingPlacement || highlightSelection)) {
        event.preventDefault()
        handleRotateSelection()
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ') {
        event.preventDefault()
        setSpacePanning(false)
      }
    }

    const handleWindowBlur = () => {
      setSpacePanning(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [
    canRedo,
    canUndo,
    cancelActiveInteraction,
    deleteSelectedComponent,
    deleteSelectedAnnotation,
    duplicateSelectedAnnotation,
    duplicateSelectedComponent,
    exportOptionsFormat,
    handleClearCanvasSelection,
    isClearModalOpen,
    contextMenuState,
    editingTextAnnotationId,
    isOnboardingOpen,
    isSvgAmbiguityOpen,
    isSvgCalibrationOpen,
    isSvgImportOptionsOpen,
    isHelpOpen,
    isFullLibraryOpen,
    isJsonModalOpen,
    isTutorialModalOpen,
    isVersionHistoryOpen,
    isWorkspaceModalOpen,
    isWarningReviewOpen,
    openToolbarMenu,
    pendingPlacement,
    redo,
    handleRotateSelection,
    highlightSelection,
    resetViewport,
    selectedComponent,
    selectedAnnotation,
    setActiveTool,
    setContextMenuState,
    setHelpOpen,
    setOpenToolbarMenu,
    setPendingExportRequest,
    setRenderMode,
    setSpacePanning,
    setSvgAmbiguityState,
    setSvgCalibrationState,
    setSvgImportOptionsState,
    setWarningsOpen,
    setShowComponentLabels,
    setWorkspaceModalState,
    undo,
  ])

  const openJsonModal = (rawText = sceneJson, error?: string) => {
    setJsonSeed(rawText)
    setJsonError(error)
    setIsJsonModalOpen(true)
  }

  const finalizeSvgImport = useCallback(
    (args: {
      analysis: SvgImportAnalysis
      document: SvgImportDocument
      manualResolutions?: SvgImportManualResolution[]
      millimetersPerUnit: number
      mode: SvgImportMode
    }) => {
      const result = applySvgImportToScene({
        analysis: args.analysis,
        document: args.document,
        hostSurfaceId: activeHostSurfaceId,
        manualResolutions: args.manualResolutions,
        millimetersPerUnit: args.millimetersPerUnit,
        mode: args.mode,
        scene,
      })

      startTransition(() => {
        loadScene(result.scene, { history: 'record' })
      })

      const summary = `Imported ${result.importedComponents} components and ${result.importedAnnotations} annotation lines from SVG.`
      setSvgImportNotice(result.warnings[0] ?? summary)
      setSvgAmbiguityState(undefined)
      setSvgCalibrationState(undefined)
      setSvgImportOptionsState(undefined)
    },
    [activeHostSurfaceId, loadScene, scene],
  )

  const runSvgImportAnalysis = useCallback(
    (args: {
      document: SvgImportDocument
      millimetersPerUnit: number
      mode: SvgImportMode
      profile: SvgImportProfile
    }) => {
      const analysis = analyzeSvgImportDocument({
        document: args.document,
        millimetersPerUnit: args.millimetersPerUnit,
        profile: args.profile,
      })

      if (analysis.ambiguous.length > 0) {
        setSvgAmbiguityState({
          analysis,
          document: args.document,
          millimetersPerUnit: args.millimetersPerUnit,
          mode: args.mode,
        })
        return
      }

      finalizeSvgImport({
        analysis,
        document: args.document,
        millimetersPerUnit: args.millimetersPerUnit,
        mode: args.mode,
      })
    },
    [finalizeSvgImport],
  )

  const importSceneJson = useCallback(
    (rawText: string) => {
      const result = importSceneDocument(rawText)
      const notice = formatSceneImportNotice({
        currentWorkspaceKind: scene.workspace.kind,
        result,
      })

      startTransition(() => {
        loadScene(result.scene, { history: 'record' })
        setNotice(notice)
      })

      setJsonError(undefined)
      setIsJsonModalOpen(false)
    },
    [loadScene, scene.workspace.kind, setNotice],
  )

  const handleImportSceneJsonFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0]

    if (!nextFile) {
      return
    }

    const rawText = await nextFile.text()

    try {
      importSceneJson(rawText)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Scene JSON could not be loaded.'

      openJsonModal(rawText, message)
    } finally {
      event.target.value = ''
    }
  }

  const handleImportSvgFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0]

    if (!nextFile) {
      return
    }

    const rawText = await nextFile.text()

    try {
      const document = parseSvgImportDocument(rawText)

      setSvgImportNotice(undefined)
      setSvgImportOptionsState({
        document,
        fileName: nextFile.name,
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'SVG could not be parsed and interpreted.'

      setSvgImportNotice(message)
    } finally {
      event.target.value = ''
    }
  }

  const handleConfirmSvgImportOptions = (payload: {
    mode: SvgImportMode
    profile: SvgImportProfile
    requireCalibration: boolean
  }) => {
    if (!svgImportOptionsState) {
      return
    }

    setSvgImportOptionsState(undefined)

    if (payload.requireCalibration) {
      setSvgCalibrationState({
        document: svgImportOptionsState.document,
        fileName: svgImportOptionsState.fileName,
        mode: payload.mode,
        profile: payload.profile,
      })
      return
    }

    runSvgImportAnalysis({
      document: svgImportOptionsState.document,
      millimetersPerUnit: resolveSvgImportScaleMmPerUnit({
        document: svgImportOptionsState.document,
      }),
      mode: payload.mode,
      profile: payload.profile,
    })
  }

  const handleConfirmSvgCalibration = (
    calibration: SvgCalibrationRequest,
    millimetersPerUnit: number,
  ) => {
    if (!svgCalibrationState) {
      return
    }

    setSvgCalibrationState(undefined)

    runSvgImportAnalysis({
      document: svgCalibrationState.document,
      millimetersPerUnit: resolveSvgImportScaleMmPerUnit({
        calibration,
        document: svgCalibrationState.document,
      }),
      mode: svgCalibrationState.mode,
      profile: svgCalibrationState.profile,
    })

    if (!Number.isFinite(millimetersPerUnit) || millimetersPerUnit <= 0) {
      setSvgImportNotice('Calibration failed. Falling back to inferred SVG scale.')
    }
  }

  const handleConfirmSvgAmbiguity = (manualResolutions: SvgImportManualResolution[]) => {
    if (!svgAmbiguityState) {
      return
    }

    finalizeSvgImport({
      analysis: svgAmbiguityState.analysis,
      document: svgAmbiguityState.document,
      manualResolutions,
      millimetersPerUnit: svgAmbiguityState.millimetersPerUnit,
      mode: svgAmbiguityState.mode,
    })
  }

  const handleLoadFromJson = (rawText: string) => {
    importSceneJson(rawText)
  }

  const selectionBoundsMm = useMemo(() => {
    if (highlightSelection) {
      return highlightSelection.boundsMm
    }

    if (selection.type === 'component') {
      const component = scene.components.find(
        (candidate) => candidate.id === selection.componentId,
      )

      return component
        ? inspectSceneComponentPlacement(scene, component).supportBoundsMm
        : undefined
    }

    if (selection.type === 'annotation') {
      return selectedAnnotation ? getAnnotationBoundsMm(selectedAnnotation) : undefined
    }

    if (selection.type === 'breadboard') {
      if (scene.workspace.kind === 'single-breadboard') {
        return getBreadboardWorldBoundsMm(primaryBreadboard)
      }

      const breadboard = breadboardInstances.find(
        (candidate) => candidate.id === selection.surfaceId,
      )

      return breadboard
        ? getBreadboardWorldBoundsMm(
            breadboard.model,
            breadboard.anchorMm,
            breadboard.rotationQuarterTurns,
          )
        : undefined
    }

    if (selection.type === 'optical-table' && scene.workspace.kind === 'optical-table') {
      return getOpticalTableWorldBoundsMm(scene.workspace.table)
    }

    return undefined
  }, [
    breadboardInstances,
    highlightSelection,
    primaryBreadboard,
    scene,
    selectedAnnotation,
    selection,
  ])

  const canCenterSelection = useMemo(() => {
    if (
      !selectionBoundsMm ||
      viewport.canvasSizePx.width <= 0 ||
      viewport.canvasSizePx.height <= 0
    ) {
      return false
    }

    const topLeftPx = worldToScreen(
      { x: selectionBoundsMm.x, y: selectionBoundsMm.y },
      viewport,
    )
    const bottomRightPx = worldToScreen(
      {
        x: selectionBoundsMm.x + selectionBoundsMm.width,
        y: selectionBoundsMm.y + selectionBoundsMm.height,
      },
      viewport,
    )
    const offscreen =
      topLeftPx.x < 48 ||
      topLeftPx.y < 48 ||
      bottomRightPx.x > viewport.canvasSizePx.width - 48 ||
      bottomRightPx.y > viewport.canvasSizePx.height - 48
    const targetViewport = createTopBiasedViewportForBounds(selectionBoundsMm, viewport)
    const farFromTargetFrame =
      Math.abs(targetViewport.cameraCenterMm.x - viewport.cameraCenterMm.x) >
        Math.max(24, selectionBoundsMm.width * 0.08) ||
      Math.abs(targetViewport.cameraCenterMm.y - viewport.cameraCenterMm.y) >
        Math.max(24, selectionBoundsMm.height * 0.08) ||
      Math.abs(targetViewport.zoomPxPerMm - viewport.zoomPxPerMm) > 0.08

    return offscreen || farFromTargetFrame
  }, [selectionBoundsMm, viewport])

  const canShowSelectionToolbar =
    !pendingPlacement &&
    !pendingBreadboardPlacement &&
    selection.type === 'component' &&
    !!selectionBoundsMm

  const selectionToolbarStyle = useMemo(() => {
    if (!canShowSelectionToolbar || !selectionBoundsMm) {
      return undefined
    }

    const topLeftPx = worldToScreen(
      { x: selectionBoundsMm.x, y: selectionBoundsMm.y },
      viewport,
    )
    const bottomRightPx = worldToScreen(
      {
        x: selectionBoundsMm.x + selectionBoundsMm.width,
        y: selectionBoundsMm.y + selectionBoundsMm.height,
      },
      viewport,
    )
    const toolbarWidthPx = 224
    const toolbarHeightPx = 58
    const centerXPx = (topLeftPx.x + bottomRightPx.x) / 2
    const fitsAbove = topLeftPx.y >= toolbarHeightPx + 20
    const rawTopPx = fitsAbove ? topLeftPx.y - toolbarHeightPx - 12 : bottomRightPx.y + 12

    return {
      left: clamp(
        centerXPx - toolbarWidthPx / 2,
        12,
        Math.max(12, viewport.canvasSizePx.width - toolbarWidthPx - 12),
      ),
      top: clamp(
        rawTopPx,
        12,
        Math.max(12, viewport.canvasSizePx.height - toolbarHeightPx - 12),
      ),
    }
  }, [canShowSelectionToolbar, selectionBoundsMm, viewport])

  const statusBoardLabel =
    scene.workspace.kind === 'optical-table'
      ? workspaceViewMode === 'table-view'
        ? scene.workspace.table.label
        : focusedBreadboardInstance?.label ?? 'Focused breadboard'
      : primaryBreadboard.label

  const contextMenuActions = useMemo<CanvasContextMenuAction[]>(() => {
    if (!contextMenuState) {
      return []
    }

    if (contextMenuState.kind === 'component') {
      if (!selectedComponent) {
        return []
      }

      return [
        { label: 'Rotate +90°', onSelect: handleRotateSelection },
        { label: 'Duplicate', onSelect: handleDuplicateSelection },
        { destructive: true, label: 'Delete', onSelect: handleDeleteSelection },
        { label: 'Center Selection', onSelect: handleCenterSelection },
      ]
    }

    if (contextMenuState.kind === 'annotation') {
      if (!selectedAnnotation) {
        return []
      }

      return [
        { label: 'Duplicate', onSelect: handleDuplicateSelection },
        { destructive: true, label: 'Delete', onSelect: handleDeleteSelection },
        { label: 'Bring Forward', onSelect: () => moveSelectedAnnotationInStack('forward') },
        { label: 'Send Backward', onSelect: () => moveSelectedAnnotationInStack('backward') },
        { label: 'Bring to Front', onSelect: () => moveSelectedAnnotationInStack('front') },
        { label: 'Send to Back', onSelect: () => moveSelectedAnnotationInStack('back') },
        { label: 'Center Selection', onSelect: handleCenterSelection },
      ]
    }

    if (highlightSelection) {
      return [
        { label: 'Rotate +90°', onSelect: handleRotateSelection },
        {
          disabled: !canCenterSelection,
          label: 'Center Selection',
          onSelect: handleCenterSelection,
        },
        { label: 'Clear Highlight', onSelect: clearHighlightSelection },
      ]
    }

    return [
      { label: 'Reset View', onSelect: resetViewport },
      {
        label: showComponentLabels ? 'Hide Labels' : 'Show Labels',
        onSelect: () => setShowComponentLabels((current) => !current),
      },
      {
        label: showPostHolders ? 'Hide Post Holders' : 'Show Post Holders',
        onSelect: () => setShowPostHolders((current) => !current),
      },
    ]
  }, [
    canCenterSelection,
    clearHighlightSelection,
    contextMenuState,
    handleCenterSelection,
    handleDeleteSelection,
    handleDuplicateSelection,
    handleRotateSelection,
    highlightSelection,
    moveSelectedAnnotationInStack,
    resetViewport,
    selectedAnnotation,
    selectedComponent,
    showComponentLabels,
    showPostHolders,
  ])

  return (
    <div className="app-shell">
      <Toolbar
        beamTrace={beamTrace}
        dismissedWarningCount={dismissedWarningIds.length}
        isBoardFocusAvailable={boardFocusAvailable}
        isWarningPulse={isWarningReviewOpen}
        onClearBreadboard={handleRequestClearBreadboard}
        onClearTable={handleRequestClearTable}
        onExportAction={handleExportAction}
        onImportSceneJson={() => jsonFileInputRef.current?.click()}
        onImportSvg={() => svgFileInputRef.current?.click()}
        onOpenOnboarding={handleOpenOnboarding}
        onOpenJson={() => openJsonModal(sceneJson)}
        onRestoreSavedTable={handleRestoreSavedTable}
        onOpenTutorial={handleOpenTutorial}
        onOpenVersionHistory={() => setIsVersionHistoryOpen(true)}
        onRequestBoardFocus={handleRequestBoardFocus}
        onRequestSingleBoard={handleRequestStandaloneBoard}
        onRequestTableView={handleRequestTableView}
        onResetView={resetViewport}
        onStartFreshTable={handleStartFreshTable}
        onToggleLabels={() => setShowComponentLabels((current) => !current)}
        onTogglePostHolders={() => setShowPostHolders((current) => !current)}
        showComponentLabels={showComponentLabels}
        showPostHolders={showPostHolders}
        toolDock={
          <AnnotationDock
            onDone={handleClearCanvasSelection}
            selectedAnnotation={activeDockAnnotation}
          />
        }
        warnings={visibleSceneWarnings}
        workspaceKind={scene.workspace.kind}
        workspaceViewMode={workspaceViewMode}
      />

      <div
        className={`workspace${isLibraryCollapsed ? ' is-library-collapsed' : ''}${isInspectorCollapsed ? ' is-inspector-collapsed' : ''}`}
      >
        <div className="workspace__left-panel">
          {!isLibraryCollapsed ? (
            <ComponentLibrary
              onCollapse={handleToggleLibrary}
              onOpenFullLibrary={() => setIsFullLibraryOpen(true)}
            />
          ) : (
            <button
              className="workspace__edge-tab workspace__edge-tab--left"
              onClick={handleToggleLibrary}
              type="button"
            >
              Library
            </button>
          )}
        </div>

        <section className="canvas-panel workspace__canvas" data-tour="canvas-panel">
          {pendingPlacement || pendingBreadboardPlacement ? (
            <div className="placement-banner" data-testid="placement-banner">
              <strong>
                Placing {pendingBreadboardPlacement?.label ?? pendingPlacement?.draft.label}
              </strong>
              <span>
                {pendingBreadboardPlacement
                  ? 'click to place on the active workspace'
                  : scene.workspace.kind === 'optical-table'
                    ? 'click to place on the active surface'
                    : 'click to place on the board'}
              </span>
              <div className="placement-banner__keys" aria-label="Placement shortcuts">
                <kbd>R</kbd>
                <span>rotate</span>
                <kbd>Esc</kbd>
                <span>cancel</span>
              </div>
              {pendingPlacement?.draft.config.source && opticalTargets.length > 0 ? (
                <label className="placement-banner__field">
                  <span>First target</span>
                  <select
                    onChange={(event) =>
                      updateSelectedSource({
                        firstTargetComponentId:
                          event.target.value === '' ? undefined : event.target.value,
                      })
                    }
                    value={pendingPlacement.draft.config.source.firstTargetComponentId ?? ''}
                  >
                    <option value="">None</option>
                    {opticalTargets.map((component) => (
                      <option key={component.id} value={component.id}>
                        {component.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}

          <div className="canvas-panel__stage-shell" ref={stageShellRef}>
            {scene.components.length === 0 &&
            scene.annotations.length === 0 &&
            !pendingPlacement &&
            !pendingBreadboardPlacement ? (
              <div className="canvas-empty-state" data-testid="canvas-empty-state">
                <strong>Click a component to get started</strong>
                <span>Search the library, place optics, then refine the selection in the inspector.</span>
              </div>
            ) : null}

            <SchemaStage
              beamTrace={beamTrace}
              gaussianTrace={gaussianTrace}
              highlightedAnnotationIds={stageHighlightedAnnotationIds}
              highlightedBreadboardIds={highlightSelection?.breadboardIds}
              highlightedComponentIds={stageHighlightedComponentIds}
              highlightedInteractionIds={highlightedInteractionIds}
              highlightedPathIds={highlightedPathIds}
              onOpenAnnotationContextMenu={(point) =>
                handleOpenCanvasContextMenu({ kind: 'annotation', ...point })
              }
              onOpenCanvasContextMenu={(point) =>
                handleOpenCanvasContextMenu({ kind: 'canvas', ...point })
              }
              onOpenComponentContextMenu={(point) =>
                handleOpenCanvasContextMenu({ kind: 'component', ...point })
              }
              showLabels={showComponentLabels}
              showPostHolders={showPostHolders}
            />

            {selectionToolbarStyle ? (
              <SelectionToolbar
                canCenter={canCenterSelection}
                canDelete={selection.type === 'component'}
                canDuplicate={selection.type === 'component'}
                canRotate={selection.type === 'component'}
                className="canvas-selection-toolbar"
                onCenter={handleCenterSelection}
                onDelete={handleDeleteSelection}
                onDuplicate={handleDuplicateSelection}
                onRotate={handleRotateSelection}
                style={selectionToolbarStyle}
              />
            ) : null}

            {editingTextAnnotation && textEditorPosition ? (
              <AnnotationTextEditor
                annotation={editingTextAnnotation}
                leftPx={textEditorPosition.leftPx}
                onCancel={cancelTextAnnotationEditing}
                onChangeText={setTextAnnotationDraftText}
                onCommit={finishTextAnnotationEditing}
                text={editingTextDraftText ?? editingTextAnnotation.text}
                topPx={textEditorPosition.topPx}
                widthPx={textEditorPosition.widthPx}
              />
            ) : null}
          </div>

          <div className="canvas-status" data-testid="canvas-status">
            <button
              aria-label={`Open Schema-Lab release history for ${CURRENT_VERSION}`}
              className="canvas-status__version"
              data-testid="status-version"
              onClick={() => setIsVersionHistoryOpen(true)}
              type="button"
            >
              {CURRENT_VERSION}
            </button>
            <span data-testid="status-counts">
              {activeSources.length} sources · {beamTrace.pathSummaries.length} paths
            </span>
            <span data-testid="status-board">Board: {statusBoardLabel}</span>
            <span data-testid="status-zoom">{viewport.zoomPxPerMm.toFixed(2)} px/mm</span>
            {notice ? (
              <span className="canvas-status__warning">{notice}</span>
            ) : null}
            {svgImportNotice ? (
              <span className="canvas-status__warning">{svgImportNotice}</span>
            ) : null}
          </div>

          <CanvasContextMenu
            actions={contextMenuActions}
            isOpen={Boolean(contextMenuState) && contextMenuActions.length > 0}
            onClose={() => setContextMenuState(undefined)}
            x={contextMenuState?.x ?? 0}
            y={contextMenuState?.y ?? 0}
          />
        </section>

        <div className="workspace__right-panel">
          {!isInspectorCollapsed ? (
            <InspectorPanel
              beamTrace={beamTrace}
              gaussianTrace={gaussianTrace}
              onCollapse={handleToggleInspector}
            />
          ) : (
            <button
              className="workspace__edge-tab workspace__edge-tab--right"
              onClick={handleToggleInspector}
              type="button"
            >
              Inspector
            </button>
          )}
        </div>
      </div>

      <input
        ref={jsonFileInputRef}
        accept=".json,application/json"
        className="visually-hidden"
        onChange={handleImportSceneJsonFile}
        type="file"
      />

      <input
        ref={svgFileInputRef}
        accept=".svg,image/svg+xml"
        className="visually-hidden"
        onChange={handleImportSvgFile}
        type="file"
      />

      {svgImportOptionsState ? (
        <SvgImportOptionsModal
          fileName={svgImportOptionsState.fileName}
          isOpen={isSvgImportOptionsOpen}
          onCancel={() => setSvgImportOptionsState(undefined)}
          onConfirm={handleConfirmSvgImportOptions}
          scaleIsReliable={svgImportOptionsState.document.scale.isReliable}
          scaleReason={svgImportOptionsState.document.scale.reason}
        />
      ) : null}

      {svgCalibrationState ? (
        <SvgCalibrationModal
          baseMmPerUnit={svgCalibrationState.document.scale.baseMmPerUnit}
          document={svgCalibrationState.document}
          isOpen={isSvgCalibrationOpen}
          onBack={() => {
            setSvgImportOptionsState({
              document: svgCalibrationState.document,
              fileName: svgCalibrationState.fileName,
            })
            setSvgCalibrationState(undefined)
          }}
          onCancel={() => setSvgCalibrationState(undefined)}
          onConfirm={handleConfirmSvgCalibration}
        />
      ) : null}

      {svgAmbiguityState ? (
        <SvgAmbiguityModal
          ambiguous={svgAmbiguityState.analysis.ambiguous}
          document={svgAmbiguityState.document}
          isOpen={isSvgAmbiguityOpen}
          onCancel={() => setSvgAmbiguityState(undefined)}
          onConfirm={handleConfirmSvgAmbiguity}
        />
      ) : null}

      <ExportOptionsModal
        defaultScope={
          scene.workspace.kind === 'optical-table' ? 'breadboard-only' : 'full-scheme'
        }
        defaultSvgPreset={DEFAULT_SVG_PRESET}
        format={exportOptionsFormat}
        isOpen={exportOptionsFormat !== undefined}
        onCancel={() => setExportOptionsFormat(undefined)}
        onConfirm={handleConfirmExportOptions}
      />

      <JsonModal
        error={jsonError}
        initialValue={jsonSeed}
        isOpen={isJsonModalOpen}
        onClose={() => {
          setJsonError(undefined)
          setIsJsonModalOpen(false)
        }}
        onLoad={handleLoadFromJson}
        schemaVersion={SCENE_DOCUMENT_VERSION}
      />

      <FullLibraryModal
        isOpen={isFullLibraryOpen}
        onArm={(type, variantId) => {
          setIsFullLibraryOpen(false)
          addComponent(type, variantId)
        }}
        onClose={() => setIsFullLibraryOpen(false)}
      />

      <WarningReviewModal
        isOpen={isWarningReviewOpen}
        onCancel={() => setPendingExportRequest(undefined)}
        onExportAnyway={() => {
          const nextRequest = pendingExportRequest

          setPendingExportRequest(undefined)

          if (!nextRequest) {
            return
          }

          void startExport(nextRequest)
        }}
        onReviewWarnings={() => {
          setPendingExportRequest(undefined)
          setWarningsOpen(true)
          setSelectedWarningId(
            filteredSceneWarnings[0]?.id ?? visibleSceneWarnings[0]?.id,
          )
        }}
        exportLabel={
          pendingExportRequest
            ? `${pendingExportRequest.scope === 'breadboard-only' ? 'Breadboard' : 'Full Scheme'} ${pendingExportRequest.format === 'svg' && pendingExportRequest.svgPreset === 'presentation' ? 'Presentation ' : pendingExportRequest.format === 'svg' ? 'Engineering ' : ''}${pendingExportRequest.format.toUpperCase()}`
            : undefined
        }
        warnings={visibleSceneWarnings}
      />

      <TutorialModal
        isOpen={isTutorialModalOpen}
        onCancel={() => setIsTutorialModalOpen(false)}
        onConfirm={handleLoadTutorial}
      />

      <VersionHistoryModal
        isOpen={isVersionHistoryOpen}
        onClose={() => setIsVersionHistoryOpen(false)}
      />

      <OnboardingTour
        currentStep={onboardingStep}
        isOpen={isOnboardingOpen}
        onClose={handleCloseOnboarding}
        onNeverShowAgain={handleNeverShowOnboarding}
        onNext={handleAdvanceOnboarding}
        onPrevious={handleRetreatOnboarding}
        steps={onboardingSteps}
      />

      <WorkspaceModeModal
        isOpen={isWorkspaceModalOpen}
        onCancel={() => setWorkspaceModalState(undefined)}
        onConvertToSingleBreadboard={handleConvertToSingleBreadboard}
        state={
          workspaceModalState
            ? {
                mode: 'to-single-breadboard',
                breadboards: breadboardInstances.map((breadboard) => ({
                  id: breadboard.id,
                  label: breadboard.label,
                  dimensionsLabel: `${breadboard.model.widthMm.toFixed(0)} × ${breadboard.model.heightMm.toFixed(0)} mm`,
                })),
              }
            : undefined
        }
      />

      <ClearConfirmModal
        isOpen={isClearModalOpen}
        onCancel={() => setClearModalState(undefined)}
        onConfirm={handleConfirmClearSurface}
        state={clearModalState}
      />

      {rasterExportRequest && exportViewport ? (
        <ExportStage
          beamTrace={beamTrace}
          breadboardSurfaceId={exportBreadboardSurfaceId}
          gaussianTrace={gaussianTrace}
          onReady={handleExportStageReady}
          renderMode={renderMode}
          scene={scene}
          scope={rasterExportRequest.scope}
          showGaussianEnvelope={showGaussianEnvelope}
          showLabels={showComponentLabels}
          viewport={exportViewport}
        />
      ) : null}
    </div>
  )
}

export default App

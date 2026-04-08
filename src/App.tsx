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
  getTextAnnotationBodyWidthMm,
  getTextAnnotationTextOriginMm,
} from './domain/annotations'
import { traceSceneBeams } from './domain/beamTracing'
import { getBeamSelectionSnapshot } from './domain/beamSelection'
import { getEffectiveHolePitchMm } from './domain/breadboard'
import { isOpticalTarget } from './domain/componentCatalog'
import { worldToScreen } from './domain/geometry'
import { inspectSceneComponentPlacement } from './domain/placement'
import {
  createExportViewport,
  type ExportFormat,
  type ExportScope,
  type SvgExportPreset,
} from './domain/exportLayout'
import { analyzeGaussianPaths, getGaussianSegmentAnalysis } from './domain/gaussian'
import { deriveSceneWarnings } from './domain/sceneWarnings'
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
import type { AnnotationText, ScreenPointPx } from './domain/types'
import {
  OPTICAL_TABLE_SURFACE_ID,
  SINGLE_BREADBOARD_SURFACE_ID,
} from './domain/types'
import { useEditorStore } from './state/editorStore'
import { AnnotationTextEditor } from './ui/AnnotationTextEditor'
import { AnnotationToolbar } from './ui/AnnotationToolbar'
import { ClearConfirmModal, type ClearModalState } from './ui/ClearConfirmModal'
import { ComponentLibrary } from './ui/ComponentLibrary'
import { ExportOptionsModal } from './ui/ExportOptionsModal'
import { InspectorPanel } from './ui/InspectorPanel'
import { JsonModal } from './ui/JsonModal'
import { OnboardingTour, type OnboardingStep } from './ui/OnboardingTour'
import { SvgAmbiguityModal } from './ui/SvgAmbiguityModal'
import { SvgCalibrationModal } from './ui/SvgCalibrationModal'
import { SvgImportOptionsModal } from './ui/SvgImportOptionsModal'
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
  | {
      mode: 'to-optical-table'
      hasSavedSnapshot: boolean
    }
  | {
      mode: 'to-single-breadboard'
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

function getBoundsCenterMm(bounds: { x: number; y: number; width: number; height: number }) {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function App() {
  const scene = useEditorStore((state) => state.scene)
  const selection = useEditorStore((state) => state.selection)
  const interaction = useEditorStore((state) => state.interaction)
  const dismissedWarningIds = useEditorStore(
    (state) => state.interaction.dismissedWarningIds,
  )
  const renderMode = useEditorStore((state) => state.renderMode)
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
  const setSelectedWarningId = useEditorStore((state) => state.setSelectedWarningId)
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
  const clearSurfaceContent = useEditorStore((state) => state.clearSurfaceContent)
  const selectBreadboard = useEditorStore((state) => state.selectBreadboard)
  const selectOpticalTable = useEditorStore((state) => state.selectOpticalTable)
  const selectComponent = useEditorStore((state) => state.selectComponent)
  const rotateSelectedComponent = useEditorStore(
    (state) => state.rotateSelectedComponent,
  )
  const updateSelectedSource = useEditorStore((state) => state.updateSelectedSource)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const resetViewport = useEditorStore((state) => state.resetViewport)
  const setBottomToolbarOffset = useEditorStore(
    (state) => state.setBottomToolbarOffset,
  )
  const setWorkspaceViewMode = useEditorStore(
    (state) => state.setWorkspaceViewMode,
  )
  const setShowGaussianEnvelope = useEditorStore(
    (state) => state.setShowGaussianEnvelope,
  )
  const finishTextAnnotationEditing = useEditorStore(
    (state) => state.finishTextAnnotationEditing,
  )
  const cancelTextAnnotationEditing = useEditorStore(
    (state) => state.cancelTextAnnotationEditing,
  )
  const viewport = useEditorStore((state) => state.viewport)
  const jsonFileInputRef = useRef<HTMLInputElement | null>(null)
  const svgFileInputRef = useRef<HTMLInputElement | null>(null)
  const stageShellRef = useRef<HTMLDivElement | null>(null)
  const bottomToolbarRef = useRef<HTMLDivElement | null>(null)
  const bottomToolbarDragRef = useRef<{
    offsetPx: ScreenPointPx
    pointerStartPx: ScreenPointPx
  } | null>(null)
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
  const selectedBeam = useMemo(
    () =>
      getBeamSelectionSnapshot(beamTrace, {
        interactionId: interaction.selectedBeamInteractionId,
        pathId: interaction.selectedBeamPathId,
        segmentId: interaction.selectedBeamSegmentId,
      }),
    [
      beamTrace,
      interaction.selectedBeamInteractionId,
      interaction.selectedBeamPathId,
      interaction.selectedBeamSegmentId,
    ],
  )
  const selectedGaussianSegment = useMemo(
    () =>
      getGaussianSegmentAnalysis(
        gaussianTrace,
        interaction.selectedBeamSegmentId,
      ),
    [gaussianTrace, interaction.selectedBeamSegmentId],
  )
  const activeSources = scene.components.filter(
    (component) => component.config.source?.isEnabled,
  )
  const pendingPlacement = interaction.pendingPlacement
  const pendingBreadboardPlacement = interaction.pendingBreadboardPlacement
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
        : interaction.activeHostSurfaceId &&
            interaction.activeHostSurfaceId !== OPTICAL_TABLE_SURFACE_ID
          ? interaction.activeHostSurfaceId
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
  const editingTextAnnotation = useMemo(
    () =>
      interaction.editingTextAnnotationId
        ? scene.annotations.find(
            (annotation): annotation is AnnotationText =>
              annotation.id === interaction.editingTextAnnotationId &&
              annotation.kind === 'text',
          )
        : undefined,
    [interaction.editingTextAnnotationId, scene.annotations],
  )
  const focusedBreadboardInstance = useMemo(
    () =>
      scene.workspace.kind === 'optical-table'
        ? getBreadboardInstance(scene, interaction.focusedBreadboardId)
        : undefined,
    [interaction.focusedBreadboardId, scene],
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
      (warning) => warning.id === interaction.selectedWarningId,
    ) ??
    visibleSceneWarnings.find(
    (warning) => warning.id === interaction.selectedWarningId,
  )
  const highlightedWarning =
    selectedWarning ??
    (interaction.isWarningsOpen
      ? filteredSceneWarnings[0] ?? visibleSceneWarnings[0]
      : undefined)
  const highlightedComponentIds = highlightedWarning?.highlightTarget?.componentIds ?? []
  const highlightedPathIds = highlightedWarning?.highlightTarget?.pathIds ?? []
  const highlightedInteractionIds = highlightedWarning?.highlightTarget?.interactionIds ?? []

  const guideSteps = useMemo<OnboardingStep[]>(
    () => [
      {
        title: 'Welcome to Schema-Lab',
        selector: '[data-tour=\"toolbar-help\"]',
        body: (
          <>
            <p>
              The Help menu is your quick reference for controls, snap behavior, sources,
              workspace switching, realistic vs simple view modes, Gaussian overlays,
              side-panel collapse, and warning review.
            </p>
            <p>
              When the scene needs attention, warnings appear in the top toolbar near this area,
              and Guide can reopen the onboarding any time.
            </p>
          </>
        ),
      },
      {
        title: 'Board Focus and Table View',
        selector: '[data-tour=\"workspace-modes\"]',
        body: (
          <>
            <p>
              Board Focus is the close-up mode for a single breadboard. Table View opens
              the full optical-table workspace so you can place customizable breadboards
              and table-mounted hardware side by side.
            </p>
            <p>
              In an optical-table workspace, switching between these two modes does not
              convert the scene. Schema-Lab remembers the focused breadboard so you can
              jump out to the full table and back without extra prompts.
            </p>
            <p>
              If you start from a single board and click Table View, Schema-Lab will offer
              to convert the current board, restore the last saved table for this browser,
              or start from a fresh empty table.
            </p>
          </>
        ),
      },
      {
        title: 'Choose a Family, Then Place It',
        selector: '[data-tour=\"component-library\"]',
        body: (
          <>
            <p>
              Clicking a family arms a pending placement instead of creating a real
              component immediately.
            </p>
            <p>
              A placement banner appears above the viewport. Move the pointer, rotate with
              <code>R</code>, then click or tap the active surface to commit.
            </p>
            <p>
              In optical-table workspaces, breadboard cards are only starting dimensions.
              You can resize and relabel any breadboard after placement from the inspector.
            </p>
            <p>
              Use Realistic for mounted hardware silhouettes or Simple for cleaner symbolic
              optics while keeping the same mechanical footprint logic underneath.
            </p>
          </>
        ),
      },
      {
        title: 'Collapse Panels from the Panels',
        selector: '[data-tour=\"panel-library-toggle\"]',
        body: (
          <>
            <p>
              The side panels now collapse from their own headers instead of the top toolbar.
              Each collapsed panel leaves a slim edge tab behind so you can reopen it without
              sacrificing central viewport space.
            </p>
            <p>
              This is the fastest way to temporarily expand the breadboard area while keeping
              your current library or inspector context intact.
            </p>
          </>
        ),
      },
      {
        title: 'Inspector States Are Explicit',
        selector: '[data-tour=\"inspector\"]',
        body: (
          <>
            <p>
              The right panel tells you whether you are editing the breadboard, a pending
              placement, the optical table, or a selected component already on the board.
            </p>
            <p>
              This is also where variants, lens values, BBO thickness and phase matching,
              mount defaults, recommended hardware, table or breadboard dimensions, delay
              scan controls, telescope settings, polarization optics, and OPA links appear.
            </p>
          </>
        ),
      },
      {
        title: 'Laser Sources and First Targets',
        selector: '[data-tour=\"canvas-panel\"]',
        body: (
          <>
            <p>
              Single-board source heads still launch from off-board edges, but optical-table
              workspaces now default to a compact table-mounted source. When other optics are
              already present, the placement banner lets you choose the first target up front.
            </p>
            <p>
              Selecting a source or dragging it now reveals the guide line to its first target,
              while Align to Target in the inspector remains the explicit one-click realignment
              control for supported source models.
            </p>
            <p>
              Once enabled, the Stage 2 beam path and Stage 3 Gaussian readouts update from
              that source.
            </p>
            <p>
              Delay stages add femtosecond path delay without bending the 2D centerline, and
              OPA blocks prefer real beam hits before falling back to linked pump or seed inputs.
            </p>
          </>
        ),
      },
      {
        title: 'Warnings and Export Review',
        selector: '[data-tour=\"toolbar-controls\"]',
        body: (
          <>
            <p>
              Warning filters separate simple mechanical issues from advanced optical ones.
              You can dismiss low-priority warnings for the current session, restore them later,
              and export review only blocks on the warnings you have not dismissed.
            </p>
          </>
        ),
      },
      {
        title: 'Vector Export and Format Options',
        selector: '[data-tour=\"toolbar-export\"]',
        body: (
          <>
            <p>
              Export now chooses a format family first, then opens a compact options dialog
              for scope and SVG preset. Engineering SVG is the clean mm-native Inkscape output,
              while DXF is the layout / CAD export for boards, holes, mounts, and components.
            </p>
            <p>
              Export will still pause if unresolved warnings remain, so you can review them
              before downloading PNG, PDF, SVG, DXF, or PPTX output.
            </p>
            <p>
              Help also documents the newer optics pass, including curved-mirror and telescope
              Gaussian behavior, delay-line scan readouts, OPA fallback links, and the current
              note that periscopes remain 2D relays until the later 3D pass.
            </p>
          </>
        ),
      },
      {
        title: 'Try the Tutorial Scene',
        selector: '[data-tour=\"toolbar-tutorial\"]',
        body: (
          <>
            <p>
              Tutorial asks before replacing the current scene, then loads a curated example
              that demonstrates steering mirrors, curved-mirror behavior, attenuation,
              polarization optics, a compact delay stage, a reflective telescope, BBO, and
              detector readout.
            </p>
            <p>
              It also explains the difference between Stage 2 deterministic tracing and Stage 3
              Gaussian / paraxial analysis so the demo doubles as a capability walkthrough.
            </p>
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
            <p>
              This example intentionally mixes a steering branch at the top with a longer inline
              branch across the middle so you can see multiple optics families working in one
              deterministic scene.
            </p>
            <p>
              The top branch shows flat-mirror steering into a curved mirror and then into a
              detector. The main branch runs through attenuation, polarization control, delay,
              reflective telescope behavior, BBO, and final detection.
            </p>
          </>
        ),
      },
      {
        title: 'Selected Delay Stage',
        selector: '[data-tour=\"inspector\"]',
        body: (
          <>
            <p>
              The inspector is focused on the compact delay stage so you can adjust stage
              position, travel, topology, and femtosecond offset immediately.
            </p>
            <p>
              In this model, Stage 2 keeps the 2D centerline fixed while the stage adds internal
              optical path length and timing delay. Stage 3 then uses that effective path length
              for downstream Gaussian readouts.
            </p>
          </>
        ),
      },
      {
        title: 'What the Engine Is Modeling',
        selector: '[data-tour=\"toolbar-help\"]',
        body: (
          <>
            <p>
              Stage 2 is the deterministic engine: it resolves geometry, beam routing, power
              loss, attenuation, simple polarization transforms, delay-line timing, and block-level
              interaction logic such as BBO SHG and OPA module handoff.
            </p>
            <p>
              Stage 3 is the analytical Gaussian layer on top of those resolved paths. It tracks
              q-parameter propagation, waist shifts, spot size, curved-mirror / telescope ABCD
              behavior, and aperture overfill warnings without replacing the Stage 2 geometry.
            </p>
          </>
        ),
      },
      {
        title: 'What Is Still Deferred',
        selector: '[data-tour=\"toolbar-export\"]',
        body: (
          <>
            <p>
              This tutorial is physically meaningful, but it is still a 2D model. Full 3D beam
              height, full nonlinear material physics, full spectrometer internals, and pulse
              chirp / GDD propagation are still intentionally deferred.
            </p>
            <p>
              When you are ready, export Engineering SVG for clean Inkscape editing or DXF for
              mechanical CAD-style layout work.
            </p>
          </>
        ),
      },
    ],
    [],
  )
  const onboardingSteps = tourMode === 'tutorial' ? tutorialSteps : guideSteps

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
      interaction.selectedWarningId &&
      !visibleSceneWarnings.some(
        (warning) => warning.id === interaction.selectedWarningId,
      )
    ) {
      setSelectedWarningId(
        filteredSceneWarnings[0]?.id ?? visibleSceneWarnings[0]?.id,
      )
    }
  }, [
    filteredSceneWarnings,
    interaction.selectedWarningId,
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
          showGaussianEnvelope: interaction.showGaussianEnvelope,
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
          showGaussianEnvelope: interaction.showGaussianEnvelope,
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
      interaction.showGaussianEnvelope,
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
      setWorkspaceModalState({
        mode: 'to-optical-table',
        hasSavedSnapshot: Boolean(readStoredSnapshot(OPTICAL_TABLE_SNAPSHOT_KEY)),
      })
    }
  }

  const handleConvertCurrentToOpticalTable = () => {
    convertWorkspaceToOpticalTable()
    setWorkspaceModalState(undefined)
  }

  const handleRestoreSavedTable = () => {
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

    const focusPointMm = (() => {
      if (selection.type === 'component') {
        const component = scene.components.find(
          (candidate) => candidate.id === selection.componentId,
        )

        if (!component) {
          return undefined
        }

        const placement = inspectSceneComponentPlacement(scene, component)
        return getBoundsCenterMm(placement.supportBoundsMm)
      }

      if (selection.type === 'breadboard') {
        if (scene.workspace.kind === 'single-breadboard') {
          return getBoundsCenterMm(getBreadboardWorldBoundsMm(primaryBreadboard))
        }

        const breadboard = breadboardInstances.find(
          (candidate) => candidate.id === selection.surfaceId,
        )

        return breadboard
          ? getBoundsCenterMm(
              getBreadboardWorldBoundsMm(
                breadboard.model,
                breadboard.anchorMm,
                breadboard.rotationQuarterTurns,
              ),
            )
          : undefined
      }

      if (scene.workspace.kind === 'optical-table') {
        return getBoundsCenterMm(getOpticalTableWorldBoundsMm(scene.workspace.table))
      }

      return getBoundsCenterMm(getBreadboardWorldBoundsMm(primaryBreadboard))
    })()

    if (!focusPointMm) {
      return
    }

    useEditorStore.getState().setViewport({
      ...viewport,
      cameraCenterMm: focusPointMm,
    })
  }

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

  const bottomToolbarStyle = (() => {
    const shell = stageShellRef.current

    if (!shell) {
      return undefined
    }

    const anchorBounds =
      scene.workspace.kind === 'single-breadboard'
        ? getBreadboardWorldBoundsMm(primaryBreadboard)
        : interaction.workspaceViewMode === 'board-focus' && focusedBreadboardInstance
          ? getBreadboardWorldBoundsMm(
              focusedBreadboardInstance.model,
              focusedBreadboardInstance.anchorMm,
              focusedBreadboardInstance.rotationQuarterTurns,
            )
          : getOpticalTableWorldBoundsMm(scene.workspace.table)
    const anchorScreenPx = worldToScreen(
      {
        x: anchorBounds.x + anchorBounds.width / 2,
        y: anchorBounds.y + anchorBounds.height,
      },
      viewport,
    )
    const toolbarWidthPx = bottomToolbarRef.current?.offsetWidth ?? 420
    const toolbarHeightPx = bottomToolbarRef.current?.offsetHeight ?? 58
    const dragOffsetPx = interaction.bottomToolbarOffsetPx ?? { x: 0, y: 0 }
    const leftPx = clamp(
      anchorScreenPx.x - toolbarWidthPx / 2 + dragOffsetPx.x,
      16,
      Math.max(16, viewport.canvasSizePx.width - toolbarWidthPx - 16),
    )
    const topPx = clamp(
      anchorScreenPx.y + 64 + dragOffsetPx.y,
      16,
      Math.max(16, viewport.canvasSizePx.height - toolbarHeightPx - 16),
    )

    return {
      left: `${leftPx}px`,
      top: `${topPx}px`,
    }
  })()

  const handleClearCanvasSelection = useCallback(() => {
    if (scene.workspace.kind === 'optical-table') {
      if (interaction.workspaceViewMode === 'table-view') {
        selectOpticalTable()
        return
      }

      if (interaction.focusedBreadboardId) {
        selectBreadboard(interaction.focusedBreadboardId)
        return
      }

      selectOpticalTable()
      return
    }

    selectBreadboard(SINGLE_BREADBOARD_SURFACE_ID)
  }, [
    interaction.focusedBreadboardId,
    interaction.workspaceViewMode,
    scene.workspace.kind,
    selectBreadboard,
    selectOpticalTable,
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

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = bottomToolbarDragRef.current

      if (!dragState) {
        return
      }

      setBottomToolbarOffset({
        x: dragState.offsetPx.x + (event.clientX - dragState.pointerStartPx.x),
        y: dragState.offsetPx.y + (event.clientY - dragState.pointerStartPx.y),
      })
    }

    const handlePointerUp = () => {
      bottomToolbarDragRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [setBottomToolbarOffset])

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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === ' ' &&
        !isJsonModalOpen &&
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

        if (interaction.isHelpOpen) {
          event.preventDefault()
          setHelpOpen(false)
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
        isSvgImportOptionsOpen ||
        isSvgCalibrationOpen ||
        isSvgAmbiguityOpen ||
        isVersionHistoryOpen
      ) {
        return
      }

      const key = event.key.toLowerCase()
      const isModifierPressed = event.metaKey || event.ctrlKey

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

      if (interaction.editingTextAnnotationId) {
        return
      }

      if (!selectedComponent && !selectedAnnotation && !pendingPlacement) {
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

      if (key === 'r' && (selectedComponent || pendingPlacement)) {
        event.preventDefault()
        rotateSelectedComponent(1)
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
    interaction.isHelpOpen,
    isOnboardingOpen,
    isSvgAmbiguityOpen,
    isSvgCalibrationOpen,
    isSvgImportOptionsOpen,
    isJsonModalOpen,
    isTutorialModalOpen,
    isVersionHistoryOpen,
    isWorkspaceModalOpen,
    isWarningReviewOpen,
    openToolbarMenu,
    pendingPlacement,
    redo,
    rotateSelectedComponent,
    selectedComponent,
    selectedAnnotation,
    setHelpOpen,
    setOpenToolbarMenu,
    setPendingExportRequest,
    setSpacePanning,
    setSvgAmbiguityState,
    setSvgCalibrationState,
    setSvgImportOptionsState,
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
        hostSurfaceId: interaction.activeHostSurfaceId,
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
    [interaction.activeHostSurfaceId, loadScene, scene],
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

  const handleImportSceneJsonFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0]

    if (!nextFile) {
      return
    }

    const rawText = await nextFile.text()

    try {
      const nextScene = parseSceneDocument(rawText)

      startTransition(() => {
        loadScene(nextScene, { history: 'record' })
      })

      setJsonError(undefined)
      setIsJsonModalOpen(false)
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
    const nextScene = parseSceneDocument(rawText)

    startTransition(() => {
      loadScene(nextScene, { history: 'record' })
    })

    setJsonError(undefined)
    setIsJsonModalOpen(false)
  }

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
        onOpenTutorial={handleOpenTutorial}
        onRequestBoardFocus={handleRequestBoardFocus}
        onRequestSingleBoard={handleRequestStandaloneBoard}
        onRequestTableView={handleRequestTableView}
        warnings={visibleSceneWarnings}
        workspaceKind={scene.workspace.kind}
        workspaceViewMode={interaction.workspaceViewMode}
      />

      <div
        className={`workspace${isLibraryCollapsed ? ' is-library-collapsed' : ''}${isInspectorCollapsed ? ' is-inspector-collapsed' : ''}`}
      >
        <div className="workspace__left-panel">
          {!isLibraryCollapsed ? (
            <ComponentLibrary onCollapse={handleToggleLibrary} />
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
          <div className="canvas-panel__header">
            <div className="canvas-panel__branding">
              <button
                aria-label={`Open Schema-Lab release history for ${CURRENT_VERSION}`}
                className="canvas-panel__version-link"
                onClick={() => setIsVersionHistoryOpen(true)}
                type="button"
              >
                {CURRENT_VERSION}
              </button>
              <p className="canvas-panel__usage">
                Use Board Focus for close-up breadboard work or Table View to
                place multiple breadboards and design a full optical stack.
              </p>
              <p className="canvas-panel__usage canvas-panel__usage--shortcuts">
                Scroll to pan • Ctrl/Cmd + scroll to zoom • Space or Hand tool to
                drag-pan • Board Focus keeps a breadboard framed • R rotate • D
                duplicate
              </p>
            </div>
            <div className="canvas-panel__annotation-dock">
              {selectedCanvasAnnotation && !editingTextAnnotation ? (
                <AnnotationToolbar
                  annotation={selectedCanvasAnnotation}
                  onDone={handleClearCanvasSelection}
                />
              ) : null}
            </div>
          </div>

          {pendingPlacement || pendingBreadboardPlacement ? (
            <div className="placement-banner">
              <strong>
                Placing:{' '}
                {pendingBreadboardPlacement?.label ?? pendingPlacement?.draft.label}
              </strong>
              <span>
                {pendingBreadboardPlacement
                  ? 'Click or tap the optical table to place'
                  : scene.workspace.kind === 'optical-table'
                    ? 'Click or tap the active surface to place'
                    : 'Click or tap the board to place'}
              </span>
              <span>R rotate • Esc cancel</span>
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
            <SchemaStage
              beamTrace={beamTrace}
              gaussianTrace={gaussianTrace}
              highlightedComponentIds={highlightedComponentIds}
              highlightedInteractionIds={highlightedInteractionIds}
              highlightedPathIds={highlightedPathIds}
              showLabels={showComponentLabels}
              showPostHolders={showPostHolders}
            />

            {editingTextAnnotation && textEditorPosition ? (
              <AnnotationTextEditor
                annotation={editingTextAnnotation}
                leftPx={textEditorPosition.leftPx}
                onCancel={cancelTextAnnotationEditing}
                onCommit={finishTextAnnotationEditing}
                topPx={textEditorPosition.topPx}
                widthPx={textEditorPosition.widthPx}
              />
            ) : null}

            <div
              aria-label="Canvas controls"
              className="canvas-toolbar"
              ref={bottomToolbarRef}
              style={bottomToolbarStyle}
            >
              <button
                aria-label="Drag canvas controls"
                className="canvas-toolbar__handle"
                onPointerDown={(event) => {
                  bottomToolbarDragRef.current = {
                    offsetPx: interaction.bottomToolbarOffsetPx ?? { x: 0, y: 0 },
                    pointerStartPx: {
                      x: event.clientX,
                      y: event.clientY,
                    },
                  }
                }}
                type="button"
              >
                Drag
              </button>
              <button
                className={showComponentLabels ? undefined : 'is-active-tool'}
                onClick={() => setShowComponentLabels((current) => !current)}
                type="button"
              >
                {showComponentLabels ? 'Hide Labels' : 'Show Labels'}
              </button>
              <button onClick={handleCenterSelection} type="button">
                Center Selection
              </button>
              <button onClick={resetViewport} type="button">
                Reset View
              </button>
              <button
                className={showPostHolders ? 'is-active-tool' : undefined}
                onClick={() => setShowPostHolders((current) => !current)}
                type="button"
              >
                {showPostHolders ? 'Hide Post Holders' : 'Show Post Holders'}
              </button>
            </div>
          </div>

          <div className="canvas-status">
            <span>
              {scene.workspace.kind === 'optical-table'
                ? interaction.workspaceViewMode === 'board-focus'
                  ? `${focusedBreadboardInstance?.label ?? 'Focused breadboard'}`
                  : `${scene.workspace.table.label}`
                : 'Board Focus'}{' '}
              {scene.workspace.kind === 'optical-table' &&
              interaction.workspaceViewMode === 'table-view'
                ? `${scene.workspace.table.widthMm.toFixed(0)} × ${scene.workspace.table.heightMm.toFixed(0)} mm`
                : `${primaryBreadboard.widthMm.toFixed(0)} × ${primaryBreadboard.heightMm.toFixed(0)} mm`}
            </span>
            <span>
              Pitch {getEffectiveHolePitchMm(primaryBreadboard).toFixed(1)} mm
            </span>
            <span>Beam mode {scene.beamSettings.beamFidelityMode}</span>
            <span>View {renderMode === 'realistic' ? 'Realistic' : 'Simple'}</span>
            <span>{activeSources.length} active sources</span>
            <span>{beamTrace.segments.length} segments</span>
            <span>{beamTrace.pathSummaries.length} paths</span>
            <span>
              Cursor{' '}
              {interaction.cursorWorldMm
                ? `(${interaction.cursorWorldMm.x.toFixed(1)}, ${interaction.cursorWorldMm.y.toFixed(1)}) mm`
                : 'off canvas'}
            </span>
            <span>
              Selection{' '}
              {pendingPlacement
                  ? `${pendingPlacement.draft.label} (pending)`
                : selectedComponent
                  ? selectedComponent.label
                  : selectedAnnotation
                    ? selectedAnnotation.kind === 'text'
                      ? 'Text Annotation'
                      : selectedAnnotation.kind === 'shape'
                        ? `${selectedAnnotation.shapeKind[0]!.toUpperCase()}${selectedAnnotation.shapeKind.slice(1)} Annotation`
                        : 'Beam Line'
                  : selection.type === 'optical-table'
                    ? scene.workspace.kind === 'optical-table'
                      ? scene.workspace.table.label
                      : primaryBreadboard.label
                    : selection.type === 'breadboard'
                      ? breadboardInstances.find(
                          (breadboard) => breadboard.id === selection.surfaceId,
                        )?.label ?? primaryBreadboard.label
                      : primaryBreadboard.label}
            </span>
            {selectedBeam.segment ? (
              <span>
            Beam {selectedBeam.segment.pathId} • {selectedBeam.segment.powerMw.toFixed(2)} mW
              </span>
            ) : null}
            {selectedGaussianSegment ? (
              <span>
                Spot radius {selectedGaussianSegment.end.spotRadiusMm.toFixed(3)} mm
              </span>
            ) : null}
            {interaction.notice ? (
              <span className="canvas-status__warning">{interaction.notice}</span>
            ) : null}
            {svgImportNotice ? (
              <span className="canvas-status__warning">{svgImportNotice}</span>
            ) : null}
          </div>
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
        onConvertCurrentToTable={handleConvertCurrentToOpticalTable}
        onConvertToSingleBreadboard={handleConvertToSingleBreadboard}
        onRestoreSavedTable={handleRestoreSavedTable}
        onStartFreshTable={handleStartFreshTable}
        state={
          workspaceModalState?.mode === 'to-single-breadboard'
            ? {
                mode: 'to-single-breadboard',
                breadboards: breadboardInstances.map((breadboard) => ({
                  id: breadboard.id,
                  label: breadboard.label,
                  dimensionsLabel: `${breadboard.model.widthMm.toFixed(0)} × ${breadboard.model.heightMm.toFixed(0)} mm`,
                })),
              }
            : workspaceModalState
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
          showGaussianEnvelope={interaction.showGaussianEnvelope}
          showLabels={showComponentLabels}
          viewport={exportViewport}
        />
      ) : null}
    </div>
  )
}

export default App

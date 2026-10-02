import {
  lazy,
  Suspense,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import type Konva from 'konva'
import { createPresentationSvg } from './canvas/presentationSvgExport'
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
  type ExportView,
  type ResolvedExportView,
  type SvgExportPreset,
} from './domain/exportLayout'
import { isAngledExportAvailable, resolveExportView } from './domain/exportView'
import { analyzeGaussianPaths } from './domain/gaussian'
import { deriveSceneWarnings } from './domain/sceneWarnings'
import {
  formatSceneImportNotice,
  importSceneDocument,
} from './domain/sceneImport'
import { parseSceneDocument, serializeSceneDocument } from './domain/serialization'
import {
  applyAutoCalibrationToWorkspaceConfig,
  autoCalibrateRasterImport,
  autoCalibrateSvgImport,
  createInitialRasterImportWorkspaceConfig,
  createRasterImportWorkspaceDetection,
  rescaleAutoCalibrationResult,
  type ImportAutoCalibrationResult,
} from './domain/importAutoCalibration'
import {
  analyzeSvgImportDocument,
  applySvgImportToScene,
  createImportPreviewItemsFromRasterCandidates,
  createImportPreviewItemsFromSvgAnalysis,
  createInitialSvgImportWorkspaceConfig,
  detectSvgImportWorkspace,
  parseSvgImportDocument,
  resolveSvgImportScaleMmPerUnit,
  type ImportPreviewDocument,
  type ImportPreviewItem,
  type RasterImportDocument,
  type SvgCalibrationRequest,
  type SvgImportAnalysis,
  type SvgImportDocument,
  type SvgImportMode,
  type SvgImportWorkspaceConfig,
  type SvgImportWorkspaceDetection,
} from './domain/svgImport'
import { type ImportConfirmAction } from './ui/importPreviewSession'
import {
  detectRasterImportCandidates,
  rescaleRasterImportCandidates,
} from './domain/rasterImportRecognition'
import { createTutorialScene, TUTORIAL_FOCUS_COMPONENT_ID } from './domain/tutorialScene'
import {
  createOgScene,
  createOgTutorialScene,
  OG_SELECTED_COMPONENT_ID,
} from './domain/ogScene'
import { getOgSceneVariant, isOgModeSearch } from './domain/ogMode'
import {
  getBreadboardInstance,
  getBreadboardInstances,
  getBreadboardWorldBoundsMm,
  getOpticalTableWorldBoundsMm,
  getSurfaceMountPlaneOffsetMm,
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
import type { ClearModalState } from './ui/ClearConfirmModal'
import {
  CanvasContextMenu,
  type CanvasContextMenuAction,
} from './ui/CanvasContextMenu'
import { ComponentLibrary } from './ui/ComponentLibrary'
import { FullLibraryModal } from './ui/FullLibraryModal'
import { InspectorPanel } from './ui/InspectorPanel'
import { OnboardingTour, type OnboardingStep } from './ui/OnboardingTour'
import { dispatchClearLibraryRecents } from './ui/libraryRecents'
import { SelectionToolbar } from './ui/SelectionToolbar'
import { Toolbar, type ExportAction } from './ui/Toolbar'
import { TutorialModal } from './ui/TutorialModal'
import { WarningReviewModal } from './ui/WarningReviewModal'
import {
  getProjectedBoundsAabb,
  shouldUseProjectedTableView,
} from './canvas/renderers/tableViewProjection'

const ClearConfirmModal = lazy(() =>
  import('./ui/ClearConfirmModal').then(({ ClearConfirmModal }) => ({
    default: ClearConfirmModal,
  })),
)
const ExportOptionsModal = lazy(() =>
  import('./ui/ExportOptionsModal').then(({ ExportOptionsModal }) => ({
    default: ExportOptionsModal,
  })),
)
const JsonModal = lazy(() =>
  import('./ui/JsonModal').then(({ JsonModal }) => ({ default: JsonModal })),
)
const SvgCalibrationModal = lazy(() =>
  import('./ui/SvgCalibrationModal').then(({ SvgCalibrationModal }) => ({
    default: SvgCalibrationModal,
  })),
)
const SvgImportOptionsModal = lazy(() =>
  import('./ui/SvgImportOptionsModal').then(({ SvgImportOptionsModal }) => ({
    default: SvgImportOptionsModal,
  })),
)
const VersionHistoryModal = lazy(() =>
  import('./ui/VersionHistoryModal').then(({ VersionHistoryModal }) => ({
    default: VersionHistoryModal,
  })),
)
const WorkspaceModeModal = lazy(() =>
  import('./ui/WorkspaceModeModal').then(({ WorkspaceModeModal }) => ({
    default: WorkspaceModeModal,
  })),
)

const ONBOARDING_SEEN_KEY = 'schema-lab.onboarding.seen'
const ONBOARDING_NEVER_SHOW_KEY = 'schema-lab.onboarding.never-show'
const MOBILE_NOTICE_DISMISSED_KEY = 'schema-lab.mobile-desktop-notice.dismissed'
const LEFT_PANEL_COLLAPSED_KEY = 'schema-lab.ui.left-panel-collapsed'
const RIGHT_PANEL_COLLAPSED_KEY = 'schema-lab.ui.right-panel-collapsed'
const OPTICAL_TABLE_SNAPSHOT_KEY = 'schema-lab.workspace.optical-table-snapshot'
const EXPORT_CANVAS_WIDTH_PX = 1800
const EXPORT_CANVAS_HEIGHT_PX = 1200
const DEFAULT_SVG_PRESET: SvgExportPreset = 'engineering'
const CENTER_FRAME_SIDE_PADDING_PX = 88
const CENTER_FRAME_TOP_PADDING_PX = 28
const CENTER_FRAME_BOTTOM_PADDING_PX = 156
const OG_CENTER_FRAME_SIDE_PADDING_PX = 80
const OG_CENTER_FRAME_TOP_PADDING_PX = 34
const OG_CENTER_FRAME_BOTTOM_PADDING_PX = 82
const OG_SOLO_BOARD_SIDE_PADDING_PX = 26
const OG_SOLO_BOARD_TOP_PADDING_PX = 10
const OG_SOLO_BOARD_BOTTOM_PADDING_PX = 16

function isMobilePhoneBrowser() {
  if (typeof navigator === 'undefined') {
    return false
  }

  const userAgent = navigator.userAgent
  return /iPhone|iPod|Windows Phone|Android.+Mobile/i.test(userAgent)
}

interface ExportRequestState {
  format: ExportFormat
  scope: ExportScope
  svgPreset?: SvgExportPreset
  view: ResolvedExportView
}

interface ExportOptionsState {
  format: ExportFormat
  scope: ExportScope
  svgPreset?: SvgExportPreset
  view: ExportView
}

interface SvgImportPendingOptionsState {
  autoCalibrationSuggestion?: ImportAutoCalibrationResult
  previewItems: ImportPreviewItem[]
  analysis?: SvgImportAnalysis
  appendBreadboardCenterMm?: { x: number; y: number }
  detection: SvgImportWorkspaceDetection
  document: ImportPreviewDocument
  fileName: string
  mode?: SvgImportMode
  workspaceConfig: SvgImportWorkspaceConfig
}

type SvgImportPendingCalibrationState = SvgImportPendingOptionsState

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

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('Image data URL could not be read.'))
    }
    reader.onerror = () => {
      reject(reader.error ?? new Error('Image data URL could not be read.'))
    }
    reader.readAsDataURL(file)
  })
}

function loadImageElement(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Raster drawing could not be decoded.'))
    image.src = dataUrl
  })
}

function createRasterImportDocument(args: {
  imageDataUrl: string
  imageHeightPx: number
  imageWidthPx: number
}): RasterImportDocument {
  return {
    bounds: {
      x: 0,
      y: 0,
      width: args.imageWidthPx,
      height: args.imageHeightPx,
    },
    imageDataUrl: args.imageDataUrl,
    imageHeightPx: args.imageHeightPx,
    imageWidthPx: args.imageWidthPx,
    scale: {
      baseMmPerUnit: 1,
      isReliable: false,
      reason:
        'Raster drawings do not carry reliable physical units. Use auto-calibration or enter the exact board size manually.',
      sourceUnit: 'px',
    },
    sourceKind: 'raster',
  }
}

function createSurfaceOnlyImportShim(document: ImportPreviewDocument): SvgImportDocument {
  return {
    bounds: document.bounds,
    elements: [],
    scale: document.scale,
    sourceKind: 'svg',
    svgText: '',
    viewBox: document.bounds,
  }
}

function applyScaleToWorkspaceConfig(
  workspaceConfig: SvgImportWorkspaceConfig,
  millimetersPerUnit: number,
) {
  const nextConfig = JSON.parse(
    JSON.stringify(workspaceConfig),
  ) as SvgImportWorkspaceConfig

  if (!Number.isFinite(millimetersPerUnit) || millimetersPerUnit <= 0) {
    return nextConfig
  }

  if (nextConfig.table) {
    nextConfig.table.physicalWidthMm = roundMm(
      nextConfig.table.boundsUnits.width * millimetersPerUnit,
    )
    nextConfig.table.physicalHeightMm = roundMm(
      nextConfig.table.boundsUnits.height * millimetersPerUnit,
    )
  }

  nextConfig.breadboards = nextConfig.breadboards.map((surface) => ({
    ...surface,
    physicalWidthMm: roundMm(surface.boundsUnits.width * millimetersPerUnit),
    physicalHeightMm: roundMm(surface.boundsUnits.height * millimetersPerUnit),
  }))

  return nextConfig
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
  options?: {
    bottomPaddingPx?: number
    sidePaddingPx?: number
    topPaddingPx?: number
  },
) {
  const canvasWidth = Math.max(1, viewport.canvasSizePx.width)
  const canvasHeight = Math.max(1, viewport.canvasSizePx.height)
  const sidePaddingPx = options?.sidePaddingPx ?? CENTER_FRAME_SIDE_PADDING_PX
  const topPaddingPx = options?.topPaddingPx ?? CENTER_FRAME_TOP_PADDING_PX
  const bottomPaddingPx = options?.bottomPaddingPx ?? CENTER_FRAME_BOTTOM_PADDING_PX
  const availableWidthPx = Math.max(1, canvasWidth - sidePaddingPx * 2)
  const availableHeightPx = Math.max(
    1,
    canvasHeight - topPaddingPx - bottomPaddingPx,
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
      y: roundMm(bounds.y + (canvasHeight / 2 - topPaddingPx) / zoomPxPerMm),
    },
  }
}

function App() {
  const isOgMode =
    typeof window !== 'undefined' && isOgModeSearch(window.location.search)
  const ogSceneVariant =
    typeof window !== 'undefined' ? getOgSceneVariant(window.location.search) : 'tutorial'
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
  const simpleGlyphAppearances = useEditorStore((state) => state.simpleGlyphAppearances)
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
  const setShowBeamDetails = useEditorStore((state) => state.setShowBeamDetails)
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
  const drawingFileInputRef = useRef<HTMLInputElement | null>(null)
  const stageShellRef = useRef<HTMLDivElement | null>(null)
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false)
  const [jsonSeed, setJsonSeed] = useState('')
  const [jsonError, setJsonError] = useState<string | undefined>()
  const [pendingExportRequest, setPendingExportRequest] =
    useState<ExportRequestState>()
  const [exportOptionsFormat, setExportOptionsFormat] = useState<ExportFormat>()
  const [rasterExportRequest, setRasterExportRequest] =
    useState<ExportRequestState>()
  const [asyncStatus, setAsyncStatus] = useState<string>()
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState(0)
  const [isMobileNoticeOpen, setIsMobileNoticeOpen] = useState(false)
  const [isTutorialModalOpen, setIsTutorialModalOpen] = useState(false)
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false)
  const [isFullLibraryOpen, setIsFullLibraryOpen] = useState(false)
  const [isLibraryCollapsed, setIsLibraryCollapsed] = useState(() =>
    isOgMode ? false : readStoredFlag(LEFT_PANEL_COLLAPSED_KEY),
  )
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(() =>
    isOgMode ? false : readStoredFlag(RIGHT_PANEL_COLLAPSED_KEY),
  )
  const [workspaceModalState, setWorkspaceModalState] =
    useState<WorkspaceModalState>()
  const [clearModalState, setClearModalState] = useState<ClearModalState>()
  const [svgImportOptionsState, setSvgImportOptionsState] =
    useState<SvgImportPendingOptionsState>()
  const [svgCalibrationState, setSvgCalibrationState] =
    useState<SvgImportPendingCalibrationState>()
  const [contextMenuState, setContextMenuState] = useState<CanvasContextMenuState>()
  const [svgImportNotice, setSvgImportNotice] = useState<string | undefined>()
  const [showComponentLabels, setShowComponentLabels] = useState(true)
  const [showPostHolders, setShowPostHolders] = useState(false)

  const openDrawingImportPicker = useCallback((accept: string) => {
    const input = drawingFileInputRef.current

    if (!input) {
      return
    }

    input.accept = accept
    input.click()
  }, [])
  const sceneJson = useMemo(() => serializeSceneDocument(scene), [scene])
  const primaryBreadboard = useMemo(() => getWorkspacePrimaryBreadboard(scene), [scene])
  const breadboardInstances = useMemo(() => getBreadboardInstances(scene), [scene])
  const currentImportTablePlacement = useMemo(
    () =>
      scene.workspace.kind === 'optical-table'
        ? {
            breadboards: scene.workspace.breadboards.map((breadboard) => ({
              bounds: getBreadboardWorldBoundsMm(
                breadboard.model,
                breadboard.anchorMm,
                breadboard.rotationQuarterTurns,
              ),
              id: breadboard.id,
              label: breadboard.label,
            })),
            tableBounds: getOpticalTableWorldBoundsMm(scene.workspace.table),
          }
        : undefined,
    [scene.workspace],
  )
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
  const highlightedComponentIds = useMemo(
    () => highlightedWarning?.highlightTarget?.componentIds ?? [],
    [highlightedWarning],
  )
  const highlightedPathIds = useMemo(
    () => highlightedWarning?.highlightTarget?.pathIds ?? [],
    [highlightedWarning],
  )
  const highlightedInteractionIds = useMemo(
    () => highlightedWarning?.highlightTarget?.interactionIds ?? [],
    [highlightedWarning],
  )
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
        title: 'Workspace Modes',
        selector: '[data-tour="workspace-modes"]',
        body: (
          <>
            <p>Switch between Board Focus for detail work and Table View for the broader optical-table layout without losing your place.</p>
          </>
        ),
      },
      {
        title: 'Component Library',
        selector: '[data-tour="component-library"]',
        body: (
          <>
            <p>Search the library, click a family to arm placement, then place it directly on the active surface.</p>
          </>
        ),
      },
      {
        title: 'Inspector Context',
        selector: '[data-tour="inspector"]',
        body: (
          <>
            <p>The inspector changes with the current selection so you can tune board settings, component variants, or annotation details in one place.</p>
          </>
        ),
      },
      {
        title: 'Start With a Setup',
        selector: '[data-tour="toolbar-help"]',
        body: (
          <>
            <p>Load the folded example setup when you want a real scene on the board immediately: a conditioned 800 nm beam, monitor pickoff, steering mirrors, sample holder, and detectors.</p>
          </>
        ),
      },
    ],
    [],
  )
  const isOgSceneLoaded = useMemo(
    () =>
      ogSceneVariant === 'tutorial'
        ? scene.metadata.name === 'Tutorial Example Setup'
        : scene.metadata.name === 'Schema-Lab OG Scene',
    [ogSceneVariant, scene.metadata.name],
  )
  useEffect(() => {
    if (typeof window !== 'undefined') {
      ;(window as Window & { __SCHEMA_LAB_STORE__?: typeof useEditorStore }).__SCHEMA_LAB_STORE__ =
        useEditorStore
    }
  }, [])

  useEffect(() => {
    if (isOgMode) {
      setIsOnboardingOpen(false)
      return
    }

    if (typeof window === 'undefined') {
      return
    }

    const shouldNeverShow = window.localStorage.getItem(ONBOARDING_NEVER_SHOW_KEY) === '1'
    const hasSeen = window.localStorage.getItem(ONBOARDING_SEEN_KEY) === '1'

    if (!shouldNeverShow && !hasSeen) {
      setIsOnboardingOpen(true)
    }
  }, [isOgMode])

  useEffect(() => {
    if (isOgMode || isOnboardingOpen || typeof window === 'undefined') {
      return
    }

    const hasDismissed = window.localStorage.getItem(MOBILE_NOTICE_DISMISSED_KEY) === '1'
    if (hasDismissed) {
      return
    }

    setIsMobileNoticeOpen(isMobilePhoneBrowser())
  }, [isOgMode, isOnboardingOpen])

  const handleDismissMobileNotice = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MOBILE_NOTICE_DISMISSED_KEY, '1')
    }

    setIsMobileNoticeOpen(false)
  }

  useEffect(() => {
    if (!isOgMode || isOgSceneLoaded) {
      return
    }

    const nextState = useEditorStore.getState()

    nextState.loadScene(
      ogSceneVariant === 'tutorial' ? createOgTutorialScene() : createOgScene(),
      { history: 'reset' },
    )
    nextState.setRenderMode('simple')
    nextState.setWorkspaceViewMode('board-focus')
    nextState.selectComponent(OG_SELECTED_COMPONENT_ID)
    nextState.setHelpOpen(false)
    nextState.setWarningsOpen(false)
    nextState.setOpenToolbarMenu(undefined)
    nextState.setShowBeamDetails(true)
    nextState.setShowGaussianEnvelope(false)
    nextState.setNotice(undefined)

    setIsOnboardingOpen(false)
    setIsTutorialModalOpen(false)
    setIsVersionHistoryOpen(false)
    setIsFullLibraryOpen(false)
    setPendingExportRequest(undefined)
    setExportOptionsFormat(undefined)
    setRasterExportRequest(undefined)
    setWorkspaceModalState(undefined)
    setClearModalState(undefined)
    setSvgImportOptionsState(undefined)
    setSvgCalibrationState(undefined)
    setContextMenuState(undefined)
    setIsJsonModalOpen(false)
    setJsonError(undefined)
    setJsonSeed('')
    setSvgImportNotice(undefined)
    setShowComponentLabels(true)
    setShowPostHolders(true)
    setOnboardingStep(0)
    setIsLibraryCollapsed(false)
    setIsInspectorCollapsed(false)
  }, [isOgMode, isOgSceneLoaded, ogSceneVariant])

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

  const markOnboardingSeen = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ONBOARDING_SEEN_KEY, '1')
    }
  }, [])

  const handleOpenOnboarding = () => {
    markOnboardingSeen()
    setOnboardingStep(0)
    setIsOnboardingOpen(true)
  }

  const handleCloseOnboarding = useCallback(() => {
    markOnboardingSeen()
    setIsOnboardingOpen(false)
  }, [markOnboardingSeen])

  const handleNeverShowOnboarding = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ONBOARDING_NEVER_SHOW_KEY, '1')
      window.localStorage.setItem(ONBOARDING_SEEN_KEY, '1')
    }

    setIsOnboardingOpen(false)
  }

  const handleAdvanceOnboarding = () => {
    if (onboardingStep >= guideSteps.length - 1) {
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
    setAsyncStatus('Scene JSON export downloaded.')
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
      const exportLabel = `${request.scope === 'breadboard-only' ? 'breadboard' : 'full scheme'} ${request.format.toUpperCase()}`
      setAsyncStatus(`Preparing ${exportLabel} export...`)

      if (request.format === 'svg' && request.svgPreset !== 'presentation') {
        try {
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
          downloadBlob(
            new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' }),
            request.scope === 'breadboard-only'
              ? 'schema-lab-breadboard-engineering.svg'
              : 'schema-lab-full-scheme-engineering.svg',
          )
          setAsyncStatus(`${exportLabel} export downloaded.`)
          return
        } catch (error) {
          setAsyncStatus(
            `Export failed: ${error instanceof Error ? error.message : 'unknown error'}`,
          )
          throw error
        }
      }

      if (request.format === 'dxf') {
        try {
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
          setAsyncStatus(`${exportLabel} export downloaded.`)
          return
        } catch (error) {
          setAsyncStatus(
            `Export failed: ${error instanceof Error ? error.message : 'unknown error'}`,
          )
          throw error
        }
      }

      setAsyncStatus(`Rendering ${exportLabel} export...`)
      setRasterExportRequest(request)
    },
    [
      beamTrace,
      exportBreadboardSurfaceId,
      gaussianTrace,
      setAsyncStatus,
      showGaussianEnvelope,
      simpleIconStyle,
      renderMode,
      scene,
    ],
  )

  const handleConfirmExportOptions = (options: ExportOptionsState) => {
    setExportOptionsFormat(undefined)

    let request: ExportRequestState

    try {
      request = {
        ...options,
        view: resolveExportView({
          requestedView: options.view,
          format: options.format,
          svgPreset: options.svgPreset,
          renderMode,
          workspaceViewMode,
          scene,
        }),
      }
    } catch (error) {
      setAsyncStatus(
        `Export failed: ${error instanceof Error ? error.message : 'invalid export view'}`,
      )
      return
    }

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
      setRenderMode('simple')
      return
    }

    if (!boardFocusAvailable) {
      return
    }

    setRenderMode('simple')
    setWorkspaceViewMode('board-focus')
  }

  const handleRequestTableView = () => {
    setRenderMode('realistic')

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
    setRenderMode('realistic')
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
      setRenderMode('realistic')
      loadScene(restoredScene, { history: 'record' })
    })

    setWorkspaceModalState(undefined)
  }

  const handleStartFreshTable = () => {
    dispatchClearLibraryRecents()
    setRenderMode('realistic')
    createFreshOpticalTable()
    setWorkspaceModalState(undefined)
  }

  const handleRequestStandaloneBoard = () => {
    if (scene.workspace.kind !== 'optical-table') {
      return
    }

    if (breadboardInstances.length === 1) {
      handleConvertToSingleBreadboard({
        breadboardId: breadboardInstances[0].id,
        createFresh: false,
        preserveSnapshot: true,
      })
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
    setRenderMode('simple')
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
    if (isOgMode) {
      return
    }

    setIsLibraryCollapsed((current) => {
      const next = !current
      writeStoredFlag(LEFT_PANEL_COLLAPSED_KEY, next)
      return next
    })
  }

  const handleToggleInspector = () => {
    if (isOgMode) {
      return
    }

    setIsInspectorCollapsed((current) => {
      const next = !current
      writeStoredFlag(RIGHT_PANEL_COLLAPSED_KEY, next)
      return next
    })
  }

  const handleCenterSelection = useCallback(() => {
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
  }, [
    breadboardInstances,
    highlightSelection,
    primaryBreadboard,
    scene,
    selectedAnnotation,
    selection,
  ])

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

  const loadExampleSetup = () => {
    const tutorialScene = createTutorialScene()

    setRenderMode('simple')
    loadScene(tutorialScene, { history: 'record' })
    selectComponent(TUTORIAL_FOCUS_COMPONENT_ID)
    setShowGaussianEnvelope(false)
    setShowBeamDetails(false)
    setOnboardingStep(0)
    setIsTutorialModalOpen(false)
    setIsOnboardingOpen(false)
  }

  const handleOpenTutorialFromGuide = () => {
    markOnboardingSeen()
    loadExampleSetup()
  }

  const handleLoadTutorial = () => {
    markOnboardingSeen()
    loadExampleSetup()
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
      const exportLabel = `${request.scope === 'breadboard-only' ? 'breadboard' : 'full scheme'} ${request.format.toUpperCase()}`

      try {
        await nextAnimationFrame()

        if (request.format === 'svg') {
          const svgMarkup = createPresentationSvg(stage, {
            title: scene.metadata.name,
          })

          downloadBlob(
            new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' }),
            request.scope === 'breadboard-only'
              ? `schema-lab-breadboard-presentation-${request.view}.svg`
              : `schema-lab-full-scheme-presentation-${request.view}.svg`,
          )
          setAsyncStatus(`${exportLabel} export downloaded.`)
          return
        }

        const pixelRatio = 2
        const dataUrl = stage.toDataURL({
          mimeType: request.format === 'pdf' ? 'image/jpeg' : 'image/png',
          pixelRatio,
          quality: 0.94,
        })

        if (request.format === 'png') {
          const response = await fetch(dataUrl)
          const blob = await response.blob()

          downloadBlob(
            blob,
            request.scope === 'breadboard-only'
              ? `schema-lab-breadboard-${request.view}.png`
              : `schema-lab-full-scheme-${request.view}.png`,
          )
        } else if (request.format === 'pdf') {
          const { createSingleImagePdfBlob } = await import('./domain/pdfExport')
          const pdfBlob = createSingleImagePdfBlob({
            jpegDataUrl: dataUrl,
            widthPx: EXPORT_CANVAS_WIDTH_PX,
            heightPx: EXPORT_CANVAS_HEIGHT_PX,
            imageWidthPx: stage.width() * pixelRatio,
            imageHeightPx: stage.height() * pixelRatio,
          })

          downloadBlob(
            pdfBlob,
            request.scope === 'breadboard-only'
              ? `schema-lab-breadboard-${request.view}.pdf`
              : `schema-lab-full-scheme-${request.view}.pdf`,
          )
        } else {
          const { createSingleImagePptxBlob } = await import('./domain/pptxExport')
          const pptxBlob = await createSingleImagePptxBlob(dataUrl)

          downloadBlob(
            pptxBlob,
            request.scope === 'breadboard-only'
              ? `schema-lab-breadboard-${request.view}.pptx`
              : `schema-lab-full-scheme-${request.view}.pptx`,
          )
        }

        setAsyncStatus(`${exportLabel} export downloaded.`)
      } catch (error) {
        setAsyncStatus(
          `Export failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        )
      } finally {
        setRasterExportRequest(undefined)
      }
    },
    [scene.metadata.name, setAsyncStatus],
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
    handleCloseOnboarding,
    isClearModalOpen,
    contextMenuState,
    editingTextAnnotationId,
    isOnboardingOpen,
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
      appendBreadboardCenterMm?: { x: number; y: number }
      document: SvgImportDocument
      actionIntent: ImportConfirmAction
      mode: SvgImportMode
      previewItems: ImportPreviewItem[]
      workspaceConfig: SvgImportWorkspaceConfig
    }) => {
      const result = applySvgImportToScene({
        analysis:
          args.actionIntent === 'board-only'
            ? {
                ambiguous: [],
                annotationSegments: [],
                recognized: [],
                reviewItems: [],
                warnings: [],
                workspaceDetection: args.analysis.workspaceDetection,
              }
            : args.analysis,
        appendBreadboardCenterMm: args.appendBreadboardCenterMm,
        document: args.document,
        hostSurfaceId: activeHostSurfaceId,
        millimetersPerUnit: resolveSvgImportScaleMmPerUnit({
          document: args.document,
          workspaceConfig: args.workspaceConfig,
        }),
        actionIntent: args.actionIntent,
        mode: args.mode,
        previewItems: args.previewItems,
        scene,
        workspaceConfig: args.workspaceConfig,
      })

      startTransition(() => {
        loadScene(result.scene, { history: 'record' })
      })

      const summary = `Imported ${result.importedComponents} components and ${result.importedAnnotations} annotation lines from SVG.`
      setSvgImportNotice(result.warnings[0] ?? summary)
      setAsyncStatus(result.warnings[0] ? `Drawing import finished with warning: ${result.warnings[0]}` : summary)
      setSvgCalibrationState(undefined)
      setSvgImportOptionsState(undefined)
    },
    [activeHostSurfaceId, loadScene, scene],
  )

  const finalizeRasterImport = useCallback(
    (args: {
      appendBreadboardCenterMm?: { x: number; y: number }
      detection: SvgImportWorkspaceDetection
      document: RasterImportDocument
      actionIntent: ImportConfirmAction
      mode: SvgImportMode
      previewItems: ImportPreviewItem[]
      workspaceConfig: SvgImportWorkspaceConfig
    }) => {
      const documentShim = createSurfaceOnlyImportShim(args.document)
      const result = applySvgImportToScene({
        analysis: {
          ambiguous: [],
          annotationSegments: [],
          recognized: [],
          reviewItems: [],
          warnings: [],
          workspaceDetection: args.detection,
        },
        appendBreadboardCenterMm: args.appendBreadboardCenterMm,
        document: documentShim,
        hostSurfaceId: activeHostSurfaceId,
        millimetersPerUnit: resolveSvgImportScaleMmPerUnit({
          document: documentShim,
          workspaceConfig: args.workspaceConfig,
        }),
        actionIntent: args.actionIntent,
        mode: args.mode,
        previewItems: args.previewItems,
        scene,
        workspaceConfig: args.workspaceConfig,
      })

      startTransition(() => {
        loadScene(result.scene, { history: 'record' })
      })

      setSvgImportNotice(result.warnings[0])
      setAsyncStatus(
        result.warnings[0]
          ? `Raster import finished with warning: ${result.warnings[0]}`
          : 'Raster import applied.',
      )
      setSvgCalibrationState(undefined)
      setSvgImportOptionsState(undefined)
    },
    [activeHostSurfaceId, loadScene, scene],
  )

  const buildSvgImportPreviewSession = useCallback(
    (args: {
      document: SvgImportDocument
      detection: SvgImportWorkspaceDetection
      workspaceConfig: SvgImportWorkspaceConfig
    }) => {
      const analysis = analyzeSvgImportDocument({
        document: args.document,
        millimetersPerUnit: resolveSvgImportScaleMmPerUnit({
          document: args.document,
          workspaceConfig: args.workspaceConfig,
        }),
        profile: 'guided',
        workspaceDetection: args.detection,
      })

      return {
        analysis,
        previewItems: createImportPreviewItemsFromSvgAnalysis({
          analysis,
          document: args.document,
        }),
      }
    },
    [],
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

      setAsyncStatus(notice)
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

    setAsyncStatus(`Loading scene JSON from ${nextFile.name}...`)
    const rawText = await nextFile.text()

    try {
      importSceneJson(rawText)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Scene JSON could not be loaded.'

      openJsonModal(rawText, message)
      setAsyncStatus(`Scene JSON import failed: ${message}`)
    } finally {
      event.target.value = ''
    }
  }

  const handleImportDrawingFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0]

    if (!nextFile) {
      return
    }

    setAsyncStatus(`Preparing drawing import for ${nextFile.name}...`)

    try {
      const isSvgFile =
        nextFile.type === 'image/svg+xml' ||
        nextFile.name.toLowerCase().endsWith('.svg')

      if (isSvgFile) {
        const rawText = await nextFile.text()
        const document = parseSvgImportDocument(rawText)
        const detection = detectSvgImportWorkspace(document)
        const initialWorkspaceConfig = createInitialSvgImportWorkspaceConfig({
          detection,
          document,
        })
        const autoCalibrationSuggestion = autoCalibrateSvgImport({
          detection,
          document,
          workspaceConfig: initialWorkspaceConfig,
        })
        const workspaceConfig = autoCalibrationSuggestion
          ? applyAutoCalibrationToWorkspaceConfig({
              result: autoCalibrationSuggestion,
              workspaceConfig: initialWorkspaceConfig,
            })
          : initialWorkspaceConfig
        const { analysis, previewItems } = buildSvgImportPreviewSession({
          detection,
          document,
          workspaceConfig,
        })

        setSvgImportNotice(undefined)
        setSvgImportOptionsState({
          analysis,
          autoCalibrationSuggestion,
          detection,
          document,
          fileName: nextFile.name,
          previewItems,
          workspaceConfig,
        })
        setAsyncStatus(`Drawing import preview ready for ${nextFile.name}.`)
      } else {
        const dataUrl = await readFileAsDataUrl(nextFile)
        const image = await loadImageElement(dataUrl)
        const maxDetectionEdgePx = 1200
        const detectionScale = Math.min(
          1,
          maxDetectionEdgePx /
            Math.max(image.naturalWidth, image.naturalHeight, 1),
        )
        const detectionWidth = Math.max(
          1,
          Math.round(image.naturalWidth * detectionScale),
        )
        const detectionHeight = Math.max(
          1,
          Math.round(image.naturalHeight * detectionScale),
        )
        const canvas = document.createElement('canvas')
        canvas.width = detectionWidth
        canvas.height = detectionHeight
        const context = canvas.getContext('2d')

        if (!context) {
          throw new Error('Raster drawing could not be prepared for auto-calibration.')
        }

        context.drawImage(image, 0, 0, detectionWidth, detectionHeight)
        const detectionDocument = createRasterImportDocument({
          imageDataUrl: dataUrl,
          imageHeightPx: detectionHeight,
          imageWidthPx: detectionWidth,
        })
        const imageData = context.getImageData(0, 0, detectionWidth, detectionHeight)
        const rasterDocument = createRasterImportDocument({
          imageDataUrl: dataUrl,
          imageHeightPx: image.naturalHeight,
          imageWidthPx: image.naturalWidth,
        })
        const autoCalibrationSuggestion = autoCalibrateRasterImport({
          document: detectionDocument,
          imageData,
        })
        const scaledAutoCalibration = autoCalibrationSuggestion
          ? rescaleAutoCalibrationResult(
              autoCalibrationSuggestion,
              detectionScale,
            )
          : undefined
        const detection = createRasterImportWorkspaceDetection({
          autoCalibration: scaledAutoCalibration,
          document: rasterDocument,
        })
        const workspaceConfig = createInitialRasterImportWorkspaceConfig({
          autoCalibration: scaledAutoCalibration,
          document: rasterDocument,
        })
        const previewItems = createImportPreviewItemsFromRasterCandidates({
          candidates: rescaleRasterImportCandidates(
            detectRasterImportCandidates({
              autoCalibration: autoCalibrationSuggestion,
              imageData,
            }),
            detectionScale,
          ),
        })

        setSvgImportNotice(undefined)
        setSvgImportOptionsState({
          autoCalibrationSuggestion: scaledAutoCalibration,
          detection,
          document: rasterDocument,
          fileName: nextFile.name,
          previewItems,
          workspaceConfig,
        })
        setAsyncStatus(`Raster import preview ready for ${nextFile.name}.`)
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Drawing could not be parsed and interpreted.'

      setSvgImportNotice(message)
      setAsyncStatus(`Import failed: ${message}`)
    } finally {
      event.target.value = ''
    }
  }

  const handleConfirmSvgImportOptions = (payload: {
    appendBreadboardCenterMm?: { x: number; y: number }
    actionIntent: ImportConfirmAction
    mode: SvgImportMode
    previewItems: ImportPreviewItem[]
    workspaceConfig: SvgImportWorkspaceConfig
  }) => {
    if (!svgImportOptionsState) {
      return
    }

    setSvgImportOptionsState(undefined)

    if (svgImportOptionsState.document.sourceKind === 'raster') {
      finalizeRasterImport({
        appendBreadboardCenterMm: payload.appendBreadboardCenterMm,
        detection: svgImportOptionsState.detection,
        document: svgImportOptionsState.document,
        actionIntent: payload.actionIntent,
        mode: payload.mode,
        previewItems: payload.previewItems,
        workspaceConfig: payload.workspaceConfig,
      })
      return
    }

    finalizeSvgImport({
      analysis:
        svgImportOptionsState.analysis ??
        buildSvgImportPreviewSession({
          detection: svgImportOptionsState.detection,
          document: svgImportOptionsState.document,
          workspaceConfig: payload.workspaceConfig,
        }).analysis,
      appendBreadboardCenterMm: payload.appendBreadboardCenterMm,
      document: svgImportOptionsState.document,
      actionIntent: payload.actionIntent,
      mode: payload.mode,
      previewItems: payload.previewItems,
      workspaceConfig: payload.workspaceConfig,
    })
  }

  const handleOpenSvgCalibration = (payload: {
    appendBreadboardCenterMm?: { x: number; y: number }
    mode: SvgImportMode
    previewItems: ImportPreviewItem[]
    workspaceConfig: SvgImportWorkspaceConfig
  }) => {
    if (!svgImportOptionsState) {
      return
    }

    setSvgImportOptionsState(undefined)
    setSvgCalibrationState({
      ...svgImportOptionsState,
      appendBreadboardCenterMm: payload.appendBreadboardCenterMm,
      mode: payload.mode,
      previewItems: payload.previewItems,
      workspaceConfig: payload.workspaceConfig,
    })
  }

  const handleConfirmSvgCalibration = (
    _calibration: SvgCalibrationRequest,
    millimetersPerUnit: number,
  ) => {
    if (!svgCalibrationState) {
      return
    }

    const nextWorkspaceConfig = applyScaleToWorkspaceConfig(
      svgCalibrationState.workspaceConfig,
      millimetersPerUnit,
    )

    setSvgCalibrationState(undefined)
    setSvgImportOptionsState({
      ...svgCalibrationState,
      workspaceConfig: nextWorkspaceConfig,
    })

    if (!Number.isFinite(millimetersPerUnit) || millimetersPerUnit <= 0) {
      setSvgImportNotice('Calibration failed. Falling back to inferred SVG scale.')
    }
  }

  const handleUseSuggestedAutoCalibration = useCallback(
    (result: ImportAutoCalibrationResult) => {
      if (!svgCalibrationState) {
        return
      }

      const nextWorkspaceConfig = applyAutoCalibrationToWorkspaceConfig({
        result,
        workspaceConfig: svgCalibrationState.workspaceConfig,
      })

      setSvgCalibrationState(undefined)

      setSvgImportOptionsState({
        ...svgCalibrationState,
        workspaceConfig: nextWorkspaceConfig,
      })
    },
    [svgCalibrationState],
  )

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
  const useProjectedSelectionBounds = useMemo(
    () =>
      shouldUseProjectedTableView(scene, renderMode, workspaceViewMode),
    [renderMode, scene, workspaceViewMode],
  )
  const selectionBoundsElevationMm = useMemo(() => {
    if (!useProjectedSelectionBounds) {
      return 0
    }

    if (highlightSelection) {
      return Math.max(
        0,
        ...highlightSelection.breadboardIds.map((surfaceId) =>
          getSurfaceMountPlaneOffsetMm(scene, surfaceId),
        ),
        ...highlightSelection.componentIds.map((componentId) =>
          getSurfaceMountPlaneOffsetMm(
            scene,
            scene.components.find((component) => component.id === componentId)?.hostSurfaceId,
          ),
        ),
      )
    }

    if (selection.type === 'component') {
      const selectedComponent = scene.components.find(
        (component) => component.id === selection.componentId,
      )

      return getSurfaceMountPlaneOffsetMm(scene, selectedComponent?.hostSurfaceId)
    }

    if (selection.type === 'breadboard') {
      return getSurfaceMountPlaneOffsetMm(scene, selection.surfaceId)
    }

    return 0
  }, [highlightSelection, scene, selection, useProjectedSelectionBounds])
  const selectionBoundsScreenAabb = useMemo(() => {
    if (!selectionBoundsMm) {
      return undefined
    }

    if (useProjectedSelectionBounds) {
      return getProjectedBoundsAabb(
        selectionBoundsMm,
        viewport,
        selectionBoundsElevationMm,
      )
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

    return {
      x: topLeftPx.x,
      y: topLeftPx.y,
      width: bottomRightPx.x - topLeftPx.x,
      height: bottomRightPx.y - topLeftPx.y,
    }
  }, [
    selectionBoundsElevationMm,
    selectionBoundsMm,
    useProjectedSelectionBounds,
    viewport,
  ])

  const canCenterSelection = useMemo(() => {
    if (
      !selectionBoundsMm ||
      !selectionBoundsScreenAabb ||
      viewport.canvasSizePx.width <= 0 ||
      viewport.canvasSizePx.height <= 0
    ) {
      return false
    }

    const offscreen =
      selectionBoundsScreenAabb.x < 48 ||
      selectionBoundsScreenAabb.y < 48 ||
      selectionBoundsScreenAabb.x + selectionBoundsScreenAabb.width >
        viewport.canvasSizePx.width - 48 ||
      selectionBoundsScreenAabb.y + selectionBoundsScreenAabb.height >
        viewport.canvasSizePx.height - 48
    const targetViewport = createTopBiasedViewportForBounds(selectionBoundsMm, viewport)
    const farFromTargetFrame =
      Math.abs(targetViewport.cameraCenterMm.x - viewport.cameraCenterMm.x) >
        Math.max(24, selectionBoundsMm.width * 0.08) ||
      Math.abs(targetViewport.cameraCenterMm.y - viewport.cameraCenterMm.y) >
        Math.max(24, selectionBoundsMm.height * 0.08) ||
      Math.abs(targetViewport.zoomPxPerMm - viewport.zoomPxPerMm) > 0.08

    return offscreen || farFromTargetFrame
  }, [selectionBoundsMm, selectionBoundsScreenAabb, viewport])

  const canShowSelectionToolbar =
    !pendingPlacement &&
    !pendingBreadboardPlacement &&
    selection.type === 'component' &&
    !!selectionBoundsMm

  const selectionToolbarStyle = useMemo(() => {
    if (!canShowSelectionToolbar || !selectionBoundsScreenAabb) {
      return undefined
    }

    const toolbarWidthPx = 224
    const toolbarHeightPx = 58
    const stageFrameWidthPx =
      stageShellRef.current?.clientWidth ?? viewport.canvasSizePx.width
    const stageFrameHeightPx =
      stageShellRef.current?.clientHeight ?? viewport.canvasSizePx.height
    const centerXPx =
      selectionBoundsScreenAabb.x + selectionBoundsScreenAabb.width / 2
    const fitsAbove = selectionBoundsScreenAabb.y >= toolbarHeightPx + 20
    const rawTopPx = fitsAbove
      ? selectionBoundsScreenAabb.y - toolbarHeightPx - 12
      : selectionBoundsScreenAabb.y + selectionBoundsScreenAabb.height + 12

    return {
      left: clamp(
        centerXPx - toolbarWidthPx / 2,
        12,
        Math.max(12, stageFrameWidthPx - toolbarWidthPx - 12),
      ),
      top: clamp(
        rawTopPx,
        12,
        Math.max(12, stageFrameHeightPx - toolbarHeightPx - 12),
      ),
    }
  }, [canShowSelectionToolbar, selectionBoundsScreenAabb, viewport])

  useEffect(() => {
    if (!isOgMode || !isOgSceneLoaded) {
      return
    }

    if (
      viewport.canvasSizePx.width <= 0 ||
      viewport.canvasSizePx.height <= 0
    ) {
      return
    }

    const breadboardBoundsMm =
      scene.workspace.kind === 'optical-table'
        ? (() => {
            const breadboard = scene.workspace.breadboards[0]
            return breadboard
              ? getBreadboardWorldBoundsMm(
                  breadboard.model,
                  breadboard.anchorMm,
                  breadboard.rotationQuarterTurns,
                )
              : undefined
          })()
        : getBreadboardWorldBoundsMm(scene.workspace.breadboard)
    if (!breadboardBoundsMm) {
      return
    }
    const focusBoundsMm =
      scene.workspace.kind === 'single-breadboard'
        ? {
            x: roundMm(breadboardBoundsMm.x - 2),
            y: roundMm(breadboardBoundsMm.y - 3),
            width: roundMm(breadboardBoundsMm.width + 6),
            height: roundMm(breadboardBoundsMm.height + 8),
          }
        : {
            x: roundMm(breadboardBoundsMm.x - 24),
            y: roundMm(breadboardBoundsMm.y - 34),
            width: roundMm(breadboardBoundsMm.width + 278),
            height: roundMm(breadboardBoundsMm.height + 58),
          }
    const nextViewport = createTopBiasedViewportForBounds(
      focusBoundsMm,
      viewport,
      scene.workspace.kind === 'single-breadboard'
        ? {
            bottomPaddingPx: OG_SOLO_BOARD_BOTTOM_PADDING_PX,
            sidePaddingPx: OG_SOLO_BOARD_SIDE_PADDING_PX,
            topPaddingPx: OG_SOLO_BOARD_TOP_PADDING_PX,
          }
        : {
            bottomPaddingPx: OG_CENTER_FRAME_BOTTOM_PADDING_PX,
            sidePaddingPx: OG_CENTER_FRAME_SIDE_PADDING_PX,
            topPaddingPx: OG_CENTER_FRAME_TOP_PADDING_PX,
          },
    )

    if (
      Math.abs(nextViewport.cameraCenterMm.x - viewport.cameraCenterMm.x) < 0.5 &&
      Math.abs(nextViewport.cameraCenterMm.y - viewport.cameraCenterMm.y) < 0.5 &&
      Math.abs(nextViewport.zoomPxPerMm - viewport.zoomPxPerMm) < 0.01
    ) {
      return
    }

    useEditorStore.getState().setViewport({
      ...viewport,
      ...nextViewport,
    })
  }, [isOgMode, isOgSceneLoaded, scene, viewport])

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
    <div className={`app-shell${isOgMode ? ' app-shell--og' : ''}`}>
      <Toolbar
        dismissedWarningCount={dismissedWarningIds.length}
        isBoardFocusAvailable={boardFocusAvailable}
        isOgMode={isOgMode}
        isWarningPulse={isWarningReviewOpen}
        onClearBreadboard={handleRequestClearBreadboard}
        onClearTable={handleRequestClearTable}
        onExportAction={handleExportAction}
        onImportRaster={() =>
          openDrawingImportPicker('.png,image/png,.jpg,.jpeg,image/jpeg')
        }
        onImportSceneJson={() => jsonFileInputRef.current?.click()}
        onImportSvg={() => openDrawingImportPicker('.svg,image/svg+xml')}
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

            {!isOgMode && selectionToolbarStyle ? (
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

          {!isOgMode ? (
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
              {asyncStatus ? (
                <span className="canvas-status__warning" role="status" aria-live="polite">
                  {asyncStatus}
                </span>
              ) : null}
              {notice ? (
                <span className="canvas-status__warning" role="status" aria-live="polite">
                  {notice}
                </span>
              ) : null}
              {svgImportNotice ? (
                <span className="canvas-status__warning" role="status" aria-live="polite">
                  {svgImportNotice}
                </span>
              ) : null}
            </div>
          ) : null}

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
        ref={drawingFileInputRef}
        accept=".svg,image/svg+xml,.png,image/png,.jpg,.jpeg,image/jpeg"
        data-testid="drawing-import-file-input"
        className="visually-hidden"
        onChange={handleImportDrawingFile}
        type="file"
      />

      <Suspense fallback={null}>
        {svgImportOptionsState ? (
          <SvgImportOptionsModal
            analysis={svgImportOptionsState.analysis}
            autoCalibrationSuggestion={svgImportOptionsState.autoCalibrationSuggestion}
            canAppendBreadboardToTable={
              scene.workspace.kind === 'optical-table' &&
              svgImportOptionsState.workspaceConfig.breadboards.length === 1
            }
            currentTablePlacement={currentImportTablePlacement}
            document={svgImportOptionsState.document}
            fileName={svgImportOptionsState.fileName}
            hostSurfaceId={activeHostSurfaceId}
            initialAppendBreadboardCenterMm={svgImportOptionsState.appendBreadboardCenterMm}
            initialMode={svgImportOptionsState.mode}
            initialPreviewItems={svgImportOptionsState.previewItems}
            initialWorkspaceConfig={svgImportOptionsState.workspaceConfig}
            isOpen={isSvgImportOptionsOpen}
            onCancel={() => setSvgImportOptionsState(undefined)}
            onConfirm={handleConfirmSvgImportOptions}
            onOpenCalibration={handleOpenSvgCalibration}
            scaleIsReliable={svgImportOptionsState.document.scale.isReliable}
            scaleReason={svgImportOptionsState.document.scale.reason}
            showLabels={showComponentLabels}
          />
        ) : null}

        {svgCalibrationState ? (
          <SvgCalibrationModal
            autoCalibrationSuggestion={svgCalibrationState.autoCalibrationSuggestion}
            baseMmPerUnit={svgCalibrationState.document.scale.baseMmPerUnit}
            document={svgCalibrationState.document}
            isOpen={isSvgCalibrationOpen}
            onBack={() => {
              setSvgImportOptionsState({
                analysis: svgCalibrationState.analysis,
                appendBreadboardCenterMm: svgCalibrationState.appendBreadboardCenterMm,
                autoCalibrationSuggestion: svgCalibrationState.autoCalibrationSuggestion,
                detection: svgCalibrationState.detection,
                document: svgCalibrationState.document,
                fileName: svgCalibrationState.fileName,
                mode: svgCalibrationState.mode,
                previewItems: svgCalibrationState.previewItems,
                workspaceConfig: svgCalibrationState.workspaceConfig,
              })
              setSvgCalibrationState(undefined)
            }}
            onCancel={() => setSvgCalibrationState(undefined)}
            onConfirm={handleConfirmSvgCalibration}
            onUseSuggestedAutoCalibration={handleUseSuggestedAutoCalibration}
          />
        ) : null}

        {exportOptionsFormat !== undefined ? (
          <ExportOptionsModal
            defaultScope={
              scene.workspace.kind === 'optical-table'
                ? 'breadboard-only'
                : 'full-scheme'
            }
            defaultSvgPreset={DEFAULT_SVG_PRESET}
            format={exportOptionsFormat}
            isAngledViewAvailable={isAngledExportAvailable(scene, renderMode)}
            isOpen={true}
            onCancel={() => setExportOptionsFormat(undefined)}
            onConfirm={handleConfirmExportOptions}
          />
        ) : null}

        {isJsonModalOpen ? (
          <JsonModal
            error={jsonError}
            initialValue={jsonSeed}
            isOpen={true}
            onClose={() => {
              setJsonError(undefined)
              setIsJsonModalOpen(false)
            }}
            onLoad={handleLoadFromJson}
            schemaVersion={SCENE_DOCUMENT_VERSION}
          />
        ) : null}
      </Suspense>

      {!isOgMode ? (
        <FullLibraryModal
          isOpen={isFullLibraryOpen}
          onArm={(type, variantId) => {
            setIsFullLibraryOpen(false)
            addComponent(type, variantId)
          }}
          onClose={() => setIsFullLibraryOpen(false)}
        />
      ) : null}

      {!isOgMode ? (
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
      ) : null}

      {!isOgMode ? (
        <TutorialModal
          isOpen={isTutorialModalOpen}
          onCancel={() => setIsTutorialModalOpen(false)}
          onConfirm={handleLoadTutorial}
        />
      ) : null}

      <Suspense fallback={null}>
        {!isOgMode && isVersionHistoryOpen ? (
          <VersionHistoryModal
            isOpen={true}
            onClose={() => setIsVersionHistoryOpen(false)}
          />
        ) : null}
      </Suspense>

      {!isOgMode ? (
        <OnboardingTour
          currentStep={onboardingStep}
          finalPrimaryLabel="Load example setup"
          isOpen={isOnboardingOpen}
          onClose={handleCloseOnboarding}
          onFinalPrimary={handleOpenTutorialFromGuide}
          onNeverShowAgain={handleNeverShowOnboarding}
          onNext={handleAdvanceOnboarding}
          onPrevious={handleRetreatOnboarding}
          steps={guideSteps}
        />
      ) : null}

      {!isOgMode && !isOnboardingOpen && isMobileNoticeOpen ? (
        <aside
          aria-label="Desktop recommended notice"
          className="mobile-desktop-notice"
          role="dialog"
        >
          <div>
            <strong>Desktop or tablet recommended</strong>
            <p>
              Schema-Lab works best with a wide canvas, keyboard, and pointer so
              you can inspect panels, boards, beam paths, and exports together.
            </p>
          </div>
          <button onClick={handleDismissMobileNotice} type="button">
            Continue
          </button>
        </aside>
      ) : null}

      <Suspense fallback={null}>
        {isWorkspaceModalOpen ? (
          <WorkspaceModeModal
            isOpen={true}
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
        ) : null}

        {isClearModalOpen ? (
          <ClearConfirmModal
            isOpen={true}
            onCancel={() => setClearModalState(undefined)}
            onConfirm={handleConfirmClearSurface}
            state={clearModalState}
          />
        ) : null}
      </Suspense>

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
          showPostHolders={showPostHolders}
          simpleGlyphAppearances={simpleGlyphAppearances}
          simpleIconStyle={simpleIconStyle}
          view={rasterExportRequest.view}
          viewport={exportViewport}
        />
      ) : null}
    </div>
  )
}

export default App

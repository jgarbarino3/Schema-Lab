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
import { traceSceneBeams } from './domain/beamTracing'
import { getBeamSelectionSnapshot } from './domain/beamSelection'
import { getEffectiveHolePitchMm } from './domain/breadboard'
import { createExportViewport, type ExportScope } from './domain/exportLayout'
import { analyzeGaussianPaths, getGaussianSegmentAnalysis } from './domain/gaussian'
import { createSingleImagePdfBlob } from './domain/pdfExport'
import { createSingleImagePptxBlob } from './domain/pptxExport'
import { deriveSceneWarnings } from './domain/sceneWarnings'
import { parseSceneDocument, serializeSceneDocument } from './domain/serialization'
import { createSceneSvg } from './domain/svgExport'
import { useEditorStore } from './state/editorStore'
import { ComponentLibrary } from './ui/ComponentLibrary'
import { InspectorPanel } from './ui/InspectorPanel'
import { JsonModal } from './ui/JsonModal'
import { OnboardingTour, type OnboardingStep } from './ui/OnboardingTour'
import { Toolbar, type ExportAction } from './ui/Toolbar'
import { WarningReviewModal } from './ui/WarningReviewModal'

const ONBOARDING_SEEN_KEY = 'schema-lab.onboarding.seen'
const ONBOARDING_NEVER_SHOW_KEY = 'schema-lab.onboarding.never-show'
const LEFT_PANEL_COLLAPSED_KEY = 'schema-lab.ui.left-panel-collapsed'
const RIGHT_PANEL_COLLAPSED_KEY = 'schema-lab.ui.right-panel-collapsed'
const EXPORT_CANVAS_WIDTH_PX = 1800
const EXPORT_CANVAS_HEIGHT_PX = 1200

interface ExportRequestState {
  action: ExportAction
  scope: ExportScope
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
  link.click()

  URL.revokeObjectURL(objectUrl)
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

function App() {
  const scene = useEditorStore((state) => state.scene)
  const selection = useEditorStore((state) => state.selection)
  const interaction = useEditorStore((state) => state.interaction)
  const renderMode = useEditorStore((state) => state.renderMode)
  const warningFilters = useEditorStore((state) => state.warningFilters)
  const openToolbarMenu = useEditorStore((state) => state.openToolbarMenu)
  const loadScene = useEditorStore((state) => state.loadScene)
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
  const rotateSelectedComponent = useEditorStore(
    (state) => state.rotateSelectedComponent,
  )
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false)
  const [jsonSeed, setJsonSeed] = useState('')
  const [jsonError, setJsonError] = useState<string | undefined>()
  const [pendingExportAction, setPendingExportAction] = useState<ExportAction>()
  const [exportRequest, setExportRequest] = useState<ExportRequestState>()
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState(0)
  const [isLibraryCollapsed, setIsLibraryCollapsed] = useState(() =>
    readStoredFlag(LEFT_PANEL_COLLAPSED_KEY),
  )
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(() =>
    readStoredFlag(RIGHT_PANEL_COLLAPSED_KEY),
  )
  const sceneJson = useMemo(() => serializeSceneDocument(scene), [scene])
  const beamTrace = useMemo(() => traceSceneBeams(scene), [scene])
  const gaussianTrace = useMemo(
    () => analyzeGaussianPaths(scene, beamTrace),
    [beamTrace, scene],
  )
  const sceneWarnings = useMemo(
    () => deriveSceneWarnings(scene, beamTrace, gaussianTrace),
    [beamTrace, gaussianTrace, scene],
  )
  const filteredSceneWarnings = useMemo(
    () =>
      sceneWarnings.filter((warning) =>
        warning.tier === 'simple'
          ? warningFilters.simple
          : warningFilters.advanced,
      ),
    [sceneWarnings, warningFilters.advanced, warningFilters.simple],
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
  const isWarningReviewOpen = pendingExportAction !== undefined
  const exportViewport = useMemo(() => {
    if (!exportRequest) {
      return undefined
    }

    return createExportViewport(
      scene,
      exportRequest.scope,
      {
        width: EXPORT_CANVAS_WIDTH_PX,
        height: EXPORT_CANVAS_HEIGHT_PX,
      },
    )
  }, [exportRequest, scene])
  const selectedComponent =
    selection.type === 'component'
      ? scene.components.find((component) => component.id === selection.componentId)
      : undefined
  const selectedWarning =
    filteredSceneWarnings.find(
      (warning) => warning.id === interaction.selectedWarningId,
    ) ??
    sceneWarnings.find(
    (warning) => warning.id === interaction.selectedWarningId,
  )
  const highlightedWarning =
    selectedWarning ??
    (interaction.isWarningsOpen ? filteredSceneWarnings[0] ?? sceneWarnings[0] : undefined)
  const highlightedComponentIds = highlightedWarning?.highlightTarget?.componentIds ?? []
  const highlightedPathIds = highlightedWarning?.highlightTarget?.pathIds ?? []
  const highlightedInteractionIds = highlightedWarning?.highlightTarget?.interactionIds ?? []

  const onboardingSteps = useMemo<OnboardingStep[]>(
    () => [
      {
        title: 'Welcome to Schema-Lab',
        selector: '[data-tour=\"toolbar-help\"]',
        body: (
          <>
            <p>
              The Help menu is your quick reference for controls, snap behavior, sources,
              realistic vs simple view modes, Gaussian overlays, side-panel collapse,
              and warning review.
            </p>
            <p>
              When the scene needs attention, warnings appear in the top toolbar near this area,
              and Guide can reopen the onboarding any time.
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
              Clicking a family now arms a pending placement instead of creating a real
              component immediately.
            </p>
            <p>
              A placement banner appears above the viewport. Move the pointer, rotate with
              <code>R</code>, then click or tap the board to commit.
            </p>
            <p>
              Use Realistic for mounted hardware silhouettes or Simple for cleaner symbolic
              optics while keeping the same mechanical footprint logic underneath.
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
              placement, or a selected component already on the board.
            </p>
            <p>
              This is also where variants, lens values, BBO thickness and phase matching,
              mount defaults, and recommended hardware appear.
            </p>
            <p>
              Collapse either side panel from the toolbar whenever you need more room in the
              central viewport without losing your current inspector or library state.
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
              Laser sources stay in the off-board source lanes. In the inspector, choose a
              first target and use Align to Target to aim the source.
            </p>
            <p>
              Once enabled, the Stage 2 beam path and Stage 3 Gaussian readouts update from
              that source.
            </p>
          </>
        ),
      },
      {
        title: 'Warnings and Export Review',
        selector: '[data-tour=\"toolbar-export\"]',
        body: (
          <>
            <p>
              Export will pause if critical scene warnings remain. Review them in the
              warning center, filter simple vs advanced warnings, or bypass intentionally when
              you are ready.
            </p>
            <p>
              Export menus now group JSON, PNG, PDF, SVG, and PPTX. Reopen this guide anytime
              from the blue Guide button in the top toolbar.
            </p>
          </>
        ),
      },
    ],
    [],
  )

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
    if (sceneWarnings.length === 0) {
      setSelectedWarningId(undefined)
      setWarningsOpen(false)
      return
    }

    if (
      interaction.selectedWarningId &&
      !sceneWarnings.some((warning) => warning.id === interaction.selectedWarningId)
    ) {
      setSelectedWarningId(filteredSceneWarnings[0]?.id ?? sceneWarnings[0]?.id)
    }
  }, [
    filteredSceneWarnings,
    interaction.selectedWarningId,
    sceneWarnings,
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
    if (sceneWarnings.length > 0) {
      setPendingExportAction(action)
      setSelectedWarningId(filteredSceneWarnings[0]?.id ?? sceneWarnings[0]?.id)
      return
    }

    if (action === 'scene-json') {
      downloadSceneJson()
      return
    }

    setExportRequest({
      action,
      scope: action.startsWith('breadboard')
        ? 'breadboard-only'
        : 'full-scheme',
    })
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

  const finalizeExport = useCallback(
    async (stage: Konva.Stage, request: ExportRequestState) => {
      await nextAnimationFrame()

      if (request.action.endsWith('svg')) {
        const svgMarkup = createSceneSvg({
          beamTrace,
          gaussianTrace,
          renderMode,
          scene,
          showGaussianEnvelope: interaction.showGaussianEnvelope,
          viewport: exportViewport!,
        })

        downloadBlob(
          new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' }),
          request.scope === 'breadboard-only'
            ? 'schema-lab-breadboard.svg'
            : 'schema-lab-full-scheme.svg',
        )
        setExportRequest(undefined)
        return
      }

      const dataUrl = stage.toDataURL({
        mimeType:
          request.action === 'full-scheme-pdf' || request.action === 'breadboard-pdf'
            ? 'image/jpeg'
            : 'image/png',
        pixelRatio: 2,
        quality: 0.94,
      })

      if (request.action.endsWith('png')) {
        const response = await fetch(dataUrl)
        const blob = await response.blob()

        downloadBlob(
          blob,
          request.scope === 'breadboard-only'
            ? 'schema-lab-breadboard.png'
            : 'schema-lab-full-scheme.png',
        )
      } else if (request.action.endsWith('pdf')) {
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
        const pptxBlob = await createSingleImagePptxBlob(dataUrl)

        downloadBlob(
          pptxBlob,
          request.scope === 'breadboard-only'
            ? 'schema-lab-breadboard.pptx'
            : 'schema-lab-full-scheme.pptx',
        )
      }

      setExportRequest(undefined)
    },
    [beamTrace, exportViewport, gaussianTrace, interaction.showGaussianEnvelope, renderMode, scene],
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === ' ' && !isJsonModalOpen && !isTypingTarget(event.target)) {
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

        if (isWarningReviewOpen) {
          event.preventDefault()
          setPendingExportAction(undefined)
          return
        }

        if (isOnboardingOpen) {
          event.preventDefault()
          handleCloseOnboarding()
          return
        }

        event.preventDefault()
        cancelActiveInteraction()
        return
      }

      if (isJsonModalOpen) {
        return
      }

      if (!selectedComponent && !pendingPlacement) {
        return
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedComponent) {
        event.preventDefault()
        deleteSelectedComponent()
        return
      }

      if (event.key.toLowerCase() === 'd' && selectedComponent) {
        event.preventDefault()
        duplicateSelectedComponent()
        return
      }

      if (event.key.toLowerCase() === 'r') {
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
    cancelActiveInteraction,
    deleteSelectedComponent,
    duplicateSelectedComponent,
    interaction.isHelpOpen,
    isOnboardingOpen,
    isJsonModalOpen,
    isWarningReviewOpen,
    openToolbarMenu,
    pendingPlacement,
    rotateSelectedComponent,
    selectedComponent,
    setHelpOpen,
    setOpenToolbarMenu,
    setSpacePanning,
  ])

  const openJsonModal = (rawText = sceneJson, error?: string) => {
    setJsonSeed(rawText)
    setJsonError(error)
    setIsJsonModalOpen(true)
  }

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0]

    if (!nextFile) {
      return
    }

    const rawText = await nextFile.text()

    try {
      const nextScene = parseSceneDocument(rawText)

      startTransition(() => {
        loadScene(nextScene)
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

  const handleLoadFromJson = (rawText: string) => {
    const nextScene = parseSceneDocument(rawText)

    startTransition(() => {
      loadScene(nextScene)
    })

    setJsonError(undefined)
    setIsJsonModalOpen(false)
  }

  return (
    <div className="app-shell">
      <Toolbar
        beamTrace={beamTrace}
        isInspectorCollapsed={isInspectorCollapsed}
        isLibraryCollapsed={isLibraryCollapsed}
        isWarningPulse={isWarningReviewOpen}
        onExportAction={handleExportAction}
        onImportSceneJson={() => fileInputRef.current?.click()}
        onOpenOnboarding={handleOpenOnboarding}
        onOpenJson={() => openJsonModal(sceneJson)}
        onToggleInspector={handleToggleInspector}
        onToggleLibrary={handleToggleLibrary}
        warnings={sceneWarnings}
      />

      <div
        className={`workspace${isLibraryCollapsed ? ' is-library-collapsed' : ''}${isInspectorCollapsed ? ' is-inspector-collapsed' : ''}`}
      >
        <div className="workspace__left-panel">
          {!isLibraryCollapsed ? <ComponentLibrary /> : null}
        </div>

        <section className="canvas-panel workspace__canvas" data-tour="canvas-panel">
          <div className="canvas-panel__header">
            <div>
              <h1>Schema-Lab</h1>
              <p>
                Millimeter-first optical layout editor with deterministic 2D beam
                tracing, source-lane placement, scalar power bookkeeping, and BBO
                SHG planning for FROG-style experiments.
              </p>
            </div>
            <div className="canvas-panel__hint">
              <span>Scroll to pan</span>
              <span>Ctrl/Cmd + scroll to zoom</span>
              <span>Space or Hand tool to drag-pan</span>
              <span>Sources stay in off-board lanes • R rotate • D duplicate</span>
            </div>
          </div>

          {pendingPlacement ? (
            <div className="placement-banner">
              <strong>Placing: {pendingPlacement.draft.label}</strong>
              <span>Click or tap the board to place</span>
              <span>R rotate • Esc cancel</span>
            </div>
          ) : null}

          <SchemaStage
            beamTrace={beamTrace}
            gaussianTrace={gaussianTrace}
            highlightedComponentIds={highlightedComponentIds}
            highlightedInteractionIds={highlightedInteractionIds}
            highlightedPathIds={highlightedPathIds}
          />

          <div className="canvas-status">
            <span>
              Board {scene.breadboard.widthMm.toFixed(0)} ×{' '}
              {scene.breadboard.heightMm.toFixed(0)} mm
            </span>
            <span>
              Pitch {getEffectiveHolePitchMm(scene.breadboard).toFixed(1)} mm
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
                  : scene.breadboard.label}
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
          </div>
        </section>

        <div className="workspace__right-panel">
          {!isInspectorCollapsed ? (
            <InspectorPanel beamTrace={beamTrace} gaussianTrace={gaussianTrace} />
          ) : null}
        </div>
      </div>

      <input
        ref={fileInputRef}
        accept=".json,application/json"
        className="visually-hidden"
        onChange={handleImportFile}
        type="file"
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
        onCancel={() => setPendingExportAction(undefined)}
        onExportAnyway={() => {
          const nextAction = pendingExportAction

          setPendingExportAction(undefined)

          if (!nextAction) {
            return
          }

          if (nextAction === 'scene-json') {
            downloadSceneJson()
            return
          }

          setExportRequest({
            action: nextAction,
            scope: nextAction.startsWith('breadboard')
              ? 'breadboard-only'
              : 'full-scheme',
          })
        }}
        onReviewWarnings={() => {
          setPendingExportAction(undefined)
          setWarningsOpen(true)
          setSelectedWarningId(filteredSceneWarnings[0]?.id ?? sceneWarnings[0]?.id)
        }}
        exportLabel={pendingExportAction}
        warnings={sceneWarnings}
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

      {exportRequest && exportViewport ? (
        <ExportStage
          beamTrace={beamTrace}
          gaussianTrace={gaussianTrace}
          onReady={(stage) => {
            if (stage && exportRequest) {
              void finalizeExport(stage, exportRequest)
            }
          }}
          renderMode={renderMode}
          scene={scene}
          showGaussianEnvelope={interaction.showGaussianEnvelope}
          viewport={exportViewport}
        />
      ) : null}
    </div>
  )
}

export default App

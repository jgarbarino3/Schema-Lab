import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { SchemaStage } from './canvas/SchemaStage'
import { traceSceneBeams } from './domain/beamTracing'
import { getBeamSelectionSnapshot } from './domain/beamSelection'
import { getEffectiveHolePitchMm } from './domain/breadboard'
import { analyzeGaussianPaths, getGaussianSegmentAnalysis } from './domain/gaussian'
import { deriveSceneWarnings } from './domain/sceneWarnings'
import { parseSceneDocument, serializeSceneDocument } from './domain/serialization'
import { useEditorStore } from './state/editorStore'
import { ComponentLibrary } from './ui/ComponentLibrary'
import { InspectorPanel } from './ui/InspectorPanel'
import { JsonModal } from './ui/JsonModal'
import { OnboardingTour, type OnboardingStep } from './ui/OnboardingTour'
import { Toolbar } from './ui/Toolbar'
import { WarningReviewModal } from './ui/WarningReviewModal'

const ONBOARDING_SEEN_KEY = 'schema-lab.onboarding.seen'
const ONBOARDING_NEVER_SHOW_KEY = 'schema-lab.onboarding.never-show'

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  )
}

function App() {
  const scene = useEditorStore((state) => state.scene)
  const selection = useEditorStore((state) => state.selection)
  const interaction = useEditorStore((state) => state.interaction)
  const loadScene = useEditorStore((state) => state.loadScene)
  const setSpacePanning = useEditorStore((state) => state.setSpacePanning)
  const setHelpOpen = useEditorStore((state) => state.setHelpOpen)
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
  const [isWarningReviewOpen, setIsWarningReviewOpen] = useState(false)
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState(0)
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
  const selectedComponent =
    selection.type === 'component'
      ? scene.components.find((component) => component.id === selection.componentId)
      : undefined
  const selectedWarning = sceneWarnings.find(
    (warning) => warning.id === interaction.selectedWarningId,
  )
  const highlightedWarning = selectedWarning ?? (interaction.isWarningsOpen ? sceneWarnings[0] : undefined)
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
              Gaussian overlays, and warning review.
            </p>
            <p>
              When the scene needs attention, warnings appear in the top toolbar near this
              area.
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
              and recommended hardware appear.
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
              warning center or bypass intentionally when you are ready.
            </p>
            <p>
              Reopen this guide anytime from the blue Guide button in the top toolbar.
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
      setSelectedWarningId(sceneWarnings[0]?.id)
    }
  }, [
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
    const objectUrl = URL.createObjectURL(jsonBlob)
    const link = document.createElement('a')

    link.href = objectUrl
    link.download = 'schema-lab-scene.json'
    link.click()

    URL.revokeObjectURL(objectUrl)
  }

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

        if (isWarningReviewOpen) {
          event.preventDefault()
          setIsWarningReviewOpen(false)
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
    pendingPlacement,
    rotateSelectedComponent,
    selectedComponent,
    setHelpOpen,
    setSpacePanning,
  ])

  const openJsonModal = (rawText = sceneJson, error?: string) => {
    setJsonSeed(rawText)
    setJsonError(error)
    setIsJsonModalOpen(true)
  }

  const handleExportJson = () => {
    if (sceneWarnings.length > 0) {
      setIsWarningReviewOpen(true)
      setSelectedWarningId(sceneWarnings[0]?.id)
      return
    }

    downloadSceneJson()
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
        isWarningPulse={isWarningReviewOpen}
        onExportJson={handleExportJson}
        onImportJson={() => fileInputRef.current?.click()}
        onOpenOnboarding={handleOpenOnboarding}
        onOpenJson={() => openJsonModal(sceneJson)}
        warnings={sceneWarnings}
      />

      <div className="workspace">
        <ComponentLibrary />

        <section className="canvas-panel" data-tour="canvas-panel">
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

        <InspectorPanel beamTrace={beamTrace} gaussianTrace={gaussianTrace} />
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
        onCancel={() => setIsWarningReviewOpen(false)}
        onExportAnyway={() => {
          setIsWarningReviewOpen(false)
          downloadSceneJson()
        }}
        onReviewWarnings={() => {
          setIsWarningReviewOpen(false)
          setWarningsOpen(true)
          setSelectedWarningId(sceneWarnings[0]?.id)
        }}
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
    </div>
  )
}

export default App

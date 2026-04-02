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
import { parseSceneDocument, serializeSceneDocument } from './domain/serialization'
import { useEditorStore } from './state/editorStore'
import { ComponentLibrary } from './ui/ComponentLibrary'
import { InspectorPanel } from './ui/InspectorPanel'
import { JsonModal } from './ui/JsonModal'
import { Toolbar } from './ui/Toolbar'

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
  const sceneJson = useMemo(() => serializeSceneDocument(scene), [scene])
  const beamTrace = useMemo(() => traceSceneBeams(scene), [scene])
  const gaussianTrace = useMemo(
    () => analyzeGaussianPaths(scene, beamTrace),
    [beamTrace, scene],
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
  const selectedComponent =
    selection.type === 'component'
      ? scene.components.find((component) => component.id === selection.componentId)
      : undefined

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

        event.preventDefault()
        cancelActiveInteraction()
        return
      }

      if (isJsonModalOpen) {
        return
      }

      if (selection.type !== 'component') {
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deleteSelectedComponent()
        return
      }

      if (event.key.toLowerCase() === 'd') {
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
    isJsonModalOpen,
    rotateSelectedComponent,
    selection.type,
    setHelpOpen,
    setSpacePanning,
  ])

  const openJsonModal = (rawText = sceneJson, error?: string) => {
    setJsonSeed(rawText)
    setJsonError(error)
    setIsJsonModalOpen(true)
  }

  const handleExportJson = () => {
    const jsonBlob = new Blob([sceneJson], { type: 'application/json' })
    const objectUrl = URL.createObjectURL(jsonBlob)
    const link = document.createElement('a')

    link.href = objectUrl
    link.download = 'schema-lab-scene.json'
    link.click()

    URL.revokeObjectURL(objectUrl)
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
        onExportJson={handleExportJson}
        onImportJson={() => fileInputRef.current?.click()}
        onOpenJson={() => openJsonModal(sceneJson)}
      />

      <div className="workspace">
        <ComponentLibrary />

        <section className="canvas-panel">
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

          <SchemaStage beamTrace={beamTrace} gaussianTrace={gaussianTrace} />

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
              {selectedComponent ? selectedComponent.label : scene.breadboard.label}
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
    </div>
  )
}

export default App

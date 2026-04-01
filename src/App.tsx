import { startTransition, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { SchemaStage } from './canvas/SchemaStage'
import { parseSceneDocument, serializeSceneDocument } from './domain/serialization'
import { useEditorStore } from './state/editorStore'
import { ComponentLibrary } from './ui/ComponentLibrary'
import { InspectorPanel } from './ui/InspectorPanel'
import { JsonModal } from './ui/JsonModal'
import { Toolbar } from './ui/Toolbar'

function App() {
  const scene = useEditorStore((state) => state.scene)
  const loadScene = useEditorStore((state) => state.loadScene)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false)
  const [jsonSeed, setJsonSeed] = useState('')
  const [jsonError, setJsonError] = useState<string | undefined>()
  const sceneJson = useMemo(() => serializeSceneDocument(scene), [scene])

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
                Stage 1 breadboard layout editor for ultrafast optics setups,
                scale studies, and optical bench planning.
              </p>
            </div>
            <div className="canvas-panel__hint">
              <span>Scroll to pan</span>
              <span>Ctrl/Cmd + scroll to zoom</span>
              <span>Drag components to place</span>
            </div>
          </div>

          <SchemaStage />
        </section>

        <InspectorPanel />
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

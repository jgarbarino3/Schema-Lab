import { useEditorStore } from '../state/editorStore'

interface ToolbarProps {
  onImportJson: () => void
  onExportJson: () => void
  onOpenJson: () => void
}

export function Toolbar({
  onImportJson,
  onExportJson,
  onOpenJson,
}: ToolbarProps) {
  const selection = useEditorStore((state) => state.selection)
  const snapMode = useEditorStore((state) => state.snapMode)
  const setSnapMode = useEditorStore((state) => state.setSnapMode)
  const rotateSelectedComponent = useEditorStore(
    (state) => state.rotateSelectedComponent,
  )
  const resetViewport = useEditorStore((state) => state.resetViewport)
  const zoomPxPerMm = useEditorStore((state) => state.viewport.zoomPxPerMm)

  return (
    <header className="toolbar">
      <div className="toolbar__identity">
        <span className="toolbar__kicker">Ultrafast Optics Layout</span>
        <strong>Schema-Lab Stage 1</strong>
      </div>

      <div className="toolbar__controls">
        <label className="toolbar__field">
          <span>Snap</span>
          <select
            onChange={(event) =>
              setSnapMode(event.target.value as typeof snapMode)
            }
            value={snapMode}
          >
            <option value="always">Always</option>
            <option value="onDrop">On drop</option>
          </select>
        </label>

        <button
          disabled={selection.type !== 'component'}
          onClick={() => rotateSelectedComponent(-1)}
          type="button"
        >
          Rotate -90°
        </button>

        <button
          disabled={selection.type !== 'component'}
          onClick={() => rotateSelectedComponent(1)}
          type="button"
        >
          Rotate +90°
        </button>

        <button onClick={resetViewport} type="button">
          Reset View
        </button>

        <button onClick={onImportJson} type="button">
          Import JSON
        </button>

        <button onClick={onExportJson} type="button">
          Export JSON
        </button>

        <button onClick={onOpenJson} type="button">
          Raw JSON
        </button>

        <span className="toolbar__zoom">{zoomPxPerMm.toFixed(2)} px/mm</span>
      </div>
    </header>
  )
}

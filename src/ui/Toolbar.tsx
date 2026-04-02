import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import type { BeamTraceResult } from '../domain/types'
import { useEditorStore } from '../state/editorStore'

interface ToolbarProps {
  beamTrace: BeamTraceResult
  onImportJson: () => void
  onExportJson: () => void
  onOpenJson: () => void
}

export function Toolbar({
  beamTrace,
  onImportJson,
  onExportJson,
  onOpenJson,
}: ToolbarProps) {
  const helpButtonRef = useRef<HTMLButtonElement | null>(null)
  const helpPopoverRef = useRef<HTMLDivElement | null>(null)
  const [helpStyle, setHelpStyle] = useState<CSSProperties>()
  const scene = useEditorStore((state) => state.scene)
  const selection = useEditorStore((state) => state.selection)
  const snapMode = useEditorStore((state) => state.snapMode)
  const setSnapMode = useEditorStore((state) => state.setSnapMode)
  const interaction = useEditorStore((state) => state.interaction)
  const setActiveTool = useEditorStore((state) => state.setActiveTool)
  const setShowBeamDetails = useEditorStore((state) => state.setShowBeamDetails)
  const setShowGaussianEnvelope = useEditorStore(
    (state) => state.setShowGaussianEnvelope,
  )
  const setHelpOpen = useEditorStore((state) => state.setHelpOpen)
  const rotateSelectedComponent = useEditorStore(
    (state) => state.rotateSelectedComponent,
  )
  const duplicateSelectedComponent = useEditorStore(
    (state) => state.duplicateSelectedComponent,
  )
  const deleteSelectedComponent = useEditorStore(
    (state) => state.deleteSelectedComponent,
  )
  const resetViewport = useEditorStore((state) => state.resetViewport)
  const zoomPxPerMm = useEditorStore((state) => state.viewport.zoomPxPerMm)
  const updateBeamSettings = useEditorStore((state) => state.updateBeamSettings)
  const activeSourceCount = scene.components.filter(
    (component) => component.config.source?.isEnabled,
  ).length

  useLayoutEffect(() => {
    if (!interaction.isHelpOpen) {
      return
    }

    const updateHelpPosition = () => {
      const button = helpButtonRef.current

      if (!button) {
        return
      }

      const rect = button.getBoundingClientRect()
      const width = Math.min(360, window.innerWidth - 24)
      const left = Math.min(
        Math.max(12, rect.right - width),
        window.innerWidth - width - 12,
      )
      const top = Math.min(rect.bottom + 10, window.innerHeight - 16)
      const maxHeight = Math.max(180, window.innerHeight - top - 12)

      setHelpStyle({
        left,
        maxHeight,
        top,
        width,
      })
    }

    updateHelpPosition()
    window.addEventListener('resize', updateHelpPosition)
    window.addEventListener('scroll', updateHelpPosition, true)

    return () => {
      window.removeEventListener('resize', updateHelpPosition)
      window.removeEventListener('scroll', updateHelpPosition, true)
    }
  }, [interaction.isHelpOpen])

  useEffect(() => {
    if (!interaction.isHelpOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target

      if (!(target instanceof Node)) {
        return
      }

      if (helpButtonRef.current?.contains(target)) {
        return
      }

      if (helpPopoverRef.current?.contains(target)) {
        return
      }

      setHelpOpen(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [interaction.isHelpOpen, setHelpOpen])

  const helpPopover =
    interaction.isHelpOpen && helpStyle
      ? createPortal(
          <div
            aria-label="Schema-Lab help"
            className="toolbar__help-popover"
            ref={helpPopoverRef}
            role="dialog"
            style={helpStyle}
          >
            <section>
              <h3>Navigate</h3>
              <p>
                Scroll to pan. Hold space or use Hand to drag-pan. Ctrl/Cmd +
                scroll zooms around the pointer.
              </p>
            </section>
            <section>
              <h3>Snap</h3>
              <p>
                Always snaps continuously, On drop resolves only when you
                release, and None keeps free placement where the mount model
                allows it.
              </p>
            </section>
            <section>
              <h3>Sources</h3>
              <p>
                Laser sources stay in off-board source lanes. Pick a first
                target in the inspector, then align the source toward that
                optic.
              </p>
            </section>
            <section>
              <h3>Inspector</h3>
              <p>
                Variants and tunables live on the right: beamsplitter ratios,
                detector captures, filters, and BBO PM angle, thickness, and
                polarization axis.
              </p>
            </section>
            <section>
              <h3>Beam Inspection</h3>
              <p>
                Click a beam segment to inspect its path, power, wavelength,
                polarization, and the optic interaction that produced it.
              </p>
            </section>
            <section>
              <h3>Gaussian Layer</h3>
              <p>
                Stage 3 Gaussian readouts are always available for enabled
                sources. Use Envelope to show the paraxial radius overlay
                without replacing the Stage 2 centerline.
              </p>
            </section>
            <section>
              <h3>Shortcuts</h3>
              <p>
                R rotate, D duplicate, Delete removes the selected component,
                Escape cancels drag/pan or closes transient UI.
              </p>
            </section>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <header className="toolbar">
        <div className="toolbar__identity">
          <span className="toolbar__kicker">Ultrafast Optics Beam Layout</span>
          <strong>Schema-Lab</strong>
          <span className="toolbar__subtitle">
            FROG-oriented layout, power tracing, polarization bookkeeping, and
            SHG planning
          </span>
        </div>

        <div className="toolbar__controls">
          <div className="toolbar__tool-group">
            <button
              aria-pressed={interaction.activeTool === 'select'}
              className={
                interaction.activeTool === 'select' ? 'is-active-tool' : undefined
              }
              onClick={() => setActiveTool('select')}
              type="button"
            >
              Select
            </button>
            <button
              aria-pressed={interaction.activeTool === 'pan'}
              className={
                interaction.activeTool === 'pan' ? 'is-active-tool' : undefined
              }
              onClick={() => setActiveTool('pan')}
              type="button"
            >
              Hand
            </button>
          </div>

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
              <option value="none">None</option>
            </select>
          </label>

          <label className="toolbar__field">
            <span>Beam mode</span>
            <select
              onChange={(event) =>
                updateBeamSettings({
                  beamFidelityMode:
                    event.target.value as typeof scene.beamSettings.beamFidelityMode,
                })
              }
              value={scene.beamSettings.beamFidelityMode}
            >
              <option value="geometric">Geometric</option>
              <option value="angle-sensitive">Angle-sensitive</option>
            </select>
          </label>

          <button
            aria-pressed={interaction.showBeamDetails}
            className={interaction.showBeamDetails ? 'is-active-tool' : undefined}
            onClick={() => setShowBeamDetails(!interaction.showBeamDetails)}
            type="button"
          >
            Beam Details
          </button>

          <button
            aria-pressed={interaction.showGaussianEnvelope}
            className={
              interaction.showGaussianEnvelope ? 'is-active-tool' : undefined
            }
            onClick={() =>
              setShowGaussianEnvelope(!interaction.showGaussianEnvelope)
            }
            type="button"
          >
            Envelope
          </button>

          <button
            disabled={selection.type !== 'component'}
            onClick={() => rotateSelectedComponent(1)}
            type="button"
          >
            Rotate +90°
          </button>

          <button
            disabled={selection.type !== 'component'}
            onClick={duplicateSelectedComponent}
            type="button"
          >
            Duplicate
          </button>

          <button
            disabled={selection.type !== 'component'}
            onClick={deleteSelectedComponent}
            type="button"
          >
            Delete
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

          <div className="toolbar__help">
            <button
              aria-expanded={interaction.isHelpOpen}
              aria-haspopup="dialog"
              className={interaction.isHelpOpen ? 'is-active-tool' : undefined}
              onClick={() => setHelpOpen(!interaction.isHelpOpen)}
              ref={helpButtonRef}
              type="button"
            >
              Help
            </button>
          </div>

          <span className="toolbar__pill">{activeSourceCount} live sources</span>
          <span className="toolbar__pill">{beamTrace.pathSummaries.length} paths</span>
          <span className="toolbar__zoom">{zoomPxPerMm.toFixed(2)} px/mm</span>
        </div>
      </header>

      {helpPopover}
    </>
  )
}

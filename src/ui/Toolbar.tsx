import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import type { BeamTraceResult, SceneWarning } from '../domain/types'
import { useEditorStore } from '../state/editorStore'

interface ToolbarProps {
  beamTrace: BeamTraceResult
  isWarningPulse: boolean
  onImportJson: () => void
  onOpenOnboarding: () => void
  onExportJson: () => void
  onOpenJson: () => void
  warnings: SceneWarning[]
}

export function Toolbar({
  beamTrace,
  isWarningPulse,
  onImportJson,
  onOpenOnboarding,
  onExportJson,
  onOpenJson,
  warnings,
}: ToolbarProps) {
  const helpButtonRef = useRef<HTMLButtonElement | null>(null)
  const helpPopoverRef = useRef<HTMLDivElement | null>(null)
  const warningButtonRef = useRef<HTMLButtonElement | null>(null)
  const warningPopoverRef = useRef<HTMLDivElement | null>(null)
  const [helpStyle, setHelpStyle] = useState<CSSProperties>()
  const [warningStyle, setWarningStyle] = useState<CSSProperties>()
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
  const setWarningsOpen = useEditorStore((state) => state.setWarningsOpen)
  const setSelectedWarningId = useEditorStore((state) => state.setSelectedWarningId)
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
  const warningCount = warnings.length
  const pendingPlacement = interaction.pendingPlacement

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

  useLayoutEffect(() => {
    if (!interaction.isWarningsOpen) {
      return
    }

    const updateWarningPosition = () => {
      const button = warningButtonRef.current

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

      setWarningStyle({
        left,
        maxHeight,
        top,
        width,
      })
    }

    updateWarningPosition()
    window.addEventListener('resize', updateWarningPosition)
    window.addEventListener('scroll', updateWarningPosition, true)

    return () => {
      window.removeEventListener('resize', updateWarningPosition)
      window.removeEventListener('scroll', updateWarningPosition, true)
    }
  }, [interaction.isWarningsOpen])

  useEffect(() => {
    if (!interaction.isHelpOpen && !interaction.isWarningsOpen) {
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

      if (warningButtonRef.current?.contains(target)) {
        return
      }

      if (warningPopoverRef.current?.contains(target)) {
        return
      }

      setHelpOpen(false)
      setWarningsOpen(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [interaction.isHelpOpen, interaction.isWarningsOpen, setHelpOpen, setWarningsOpen])

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
              <h3>Placement Mode</h3>
              <p>
                Clicking a family arms a pending placement. Move over the board,
                press R to rotate, click or tap to place, and Esc to cancel.
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
                The right panel now distinguishes breadboard settings, pending
                placements, selected components, and beam/path inspection.
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
              <h3>Warnings</h3>
              <p>
                Warnings appear only when the scene needs attention. Use the
                warning button to highlight off-hole mechanics, missed targets,
                or Gaussian overfill before export.
              </p>
            </section>
            <section>
              <h3>Guide</h3>
              <p>
                Use Guide to reopen the first-run onboarding any time and review
                placement, sources, BBO tunables, warning review, and export flow.
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

  const warningPopover =
    interaction.isWarningsOpen && warningStyle
      ? createPortal(
          <div
            aria-label="Schema-Lab warnings"
            className="toolbar__warning-popover"
            ref={warningPopoverRef}
            role="dialog"
            style={warningStyle}
          >
            <div className="toolbar__warning-popover-header">
              <strong>Scene Warnings</strong>
              <span>
                {warningCount} item{warningCount === 1 ? '' : 's'}
              </span>
            </div>

            {warnings.length === 0 ? (
              <p className="toolbar__warning-empty">No warnings remain.</p>
            ) : (
              <div className="toolbar__warning-list">
                {warnings.map((warning) => (
                  <button
                    className={`toolbar__warning-item${interaction.selectedWarningId === warning.id ? ' is-selected' : ''}`}
                    key={warning.id}
                    onClick={() => setSelectedWarningId(warning.id)}
                    type="button"
                  >
                    <span className="toolbar__warning-item-tag">
                      {warning.severity}
                    </span>
                    <strong>{warning.message}</strong>
                    <span>
                      {warning.category}
                      {warning.componentId ? ' • component' : ''}
                      {warning.pathId ? ' • path' : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
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

        <div className="toolbar__controls" data-tour="toolbar-controls">
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
            className="toolbar__guide-button"
            onClick={() => {
              setHelpOpen(false)
              setWarningsOpen(false)
              onOpenOnboarding()
            }}
            type="button"
          >
            Guide
          </button>

          <button
            disabled={selection.type !== 'component' && !pendingPlacement}
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

          <button data-tour="toolbar-export" onClick={onExportJson} type="button">
            Export JSON
          </button>

          <button onClick={onOpenJson} type="button">
            Raw JSON
          </button>

          {warningCount > 0 ? (
            <div className="toolbar__warning">
              <button
                aria-expanded={interaction.isWarningsOpen}
                aria-haspopup="dialog"
                className={`toolbar__warning-toggle${interaction.isWarningsOpen ? ' is-active-tool' : ''}${isWarningPulse ? ' is-pulsing' : ''}`}
                onClick={() => {
                  const nextIsOpen = !interaction.isWarningsOpen

                  setHelpOpen(false)
                  setWarningsOpen(nextIsOpen)

                  if (nextIsOpen && !interaction.selectedWarningId) {
                    setSelectedWarningId(warnings[0]?.id)
                  }
                }}
                ref={warningButtonRef}
                type="button"
              >
                Warnings {warningCount}
              </button>
            </div>
          ) : null}

          <div className="toolbar__help">
            <button
              aria-expanded={interaction.isHelpOpen}
              aria-haspopup="dialog"
              className={interaction.isHelpOpen ? 'is-active-tool' : undefined}
              data-tour="toolbar-help"
              onClick={() => {
                setWarningsOpen(false)
                setHelpOpen(!interaction.isHelpOpen)
              }}
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
      {warningPopover}
    </>
  )
}

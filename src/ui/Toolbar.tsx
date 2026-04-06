import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import type { ExportFormat } from '../domain/exportLayout'
import type { BeamTraceResult, SceneWarning, WorkspaceKind } from '../domain/types'
import { useEditorStore } from '../state/editorStore'

export type ExportAction = 'scene-json' | ExportFormat

interface ToolbarProps {
  beamTrace: BeamTraceResult
  dismissedWarningCount: number
  isWarningPulse: boolean
  onExportAction: (action: ExportAction) => void
  onImportSceneJson: () => void
  onOpenOnboarding: () => void
  onOpenJson: () => void
  onOpenTutorial: () => void
  onRequestWorkspaceKind: (workspaceKind: WorkspaceKind) => void
  warnings: SceneWarning[]
  workspaceKind: WorkspaceKind
}

function getFloatingStyle(button: HTMLButtonElement | null) {
  if (!button) {
    return undefined
  }

  const rect = button.getBoundingClientRect()
  const width = Math.min(360, window.innerWidth - 24)
  const left = Math.min(
    Math.max(12, rect.right - width),
    window.innerWidth - width - 12,
  )
  const top = Math.min(rect.bottom + 10, window.innerHeight - 16)
  const maxHeight = Math.max(180, window.innerHeight - top - 12)

  return {
    left,
    maxHeight,
    top,
    width,
  } satisfies CSSProperties
}

export function Toolbar({
  beamTrace,
  dismissedWarningCount,
  isWarningPulse,
  onExportAction,
  onImportSceneJson,
  onOpenOnboarding,
  onOpenJson,
  onOpenTutorial,
  onRequestWorkspaceKind,
  warnings,
  workspaceKind,
}: ToolbarProps) {
  const helpButtonRef = useRef<HTMLButtonElement | null>(null)
  const helpPopoverRef = useRef<HTMLDivElement | null>(null)
  const warningButtonRef = useRef<HTMLButtonElement | null>(null)
  const warningPopoverRef = useRef<HTMLDivElement | null>(null)
  const beamButtonRef = useRef<HTMLButtonElement | null>(null)
  const importButtonRef = useRef<HTMLButtonElement | null>(null)
  const exportButtonRef = useRef<HTMLButtonElement | null>(null)
  const menuPopoverRef = useRef<HTMLDivElement | null>(null)
  const [helpStyle, setHelpStyle] = useState<CSSProperties>()
  const [warningStyle, setWarningStyle] = useState<CSSProperties>()
  const [menuStyle, setMenuStyle] = useState<CSSProperties>()
  const scene = useEditorStore((state) => state.scene)
  const selection = useEditorStore((state) => state.selection)
  const snapMode = useEditorStore((state) => state.snapMode)
  const renderMode = useEditorStore((state) => state.renderMode)
  const warningFilters = useEditorStore((state) => state.warningFilters)
  const openToolbarMenu = useEditorStore((state) => state.openToolbarMenu)
  const mountVisibilityDefaults = useEditorStore(
    (state) => state.mountVisibilityDefaults,
  )
  const setSnapMode = useEditorStore((state) => state.setSnapMode)
  const setRenderMode = useEditorStore((state) => state.setRenderMode)
  const setWarningFilter = useEditorStore((state) => state.setWarningFilter)
  const setOpenToolbarMenu = useEditorStore((state) => state.setOpenToolbarMenu)
  const dismissWarning = useEditorStore((state) => state.dismissWarning)
  const dismissVisibleWarnings = useEditorStore(
    (state) => state.dismissVisibleWarnings,
  )
  const restoreDismissedWarnings = useEditorStore(
    (state) => state.restoreDismissedWarnings,
  )
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
  const filteredWarnings = warnings.filter((warning) =>
    warning.tier === 'simple' ? warningFilters.simple : warningFilters.advanced,
  )
  const pendingPlacement = interaction.pendingPlacement

  const toggleToolbarMenu = (
    menu: NonNullable<typeof openToolbarMenu>,
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    const nextMenu = openToolbarMenu === menu ? undefined : menu

    setHelpOpen(false)
    setWarningsOpen(false)
    setOpenToolbarMenu(nextMenu)
    setMenuStyle(nextMenu ? getFloatingStyle(event.currentTarget) : undefined)
  }

  const getMenuButtonRef = (menu: NonNullable<typeof openToolbarMenu>) => {
    switch (menu) {
      case 'beam':
        return beamButtonRef
      case 'export':
        return exportButtonRef
      case 'import':
        return importButtonRef
    }
  }
  const activeMenuStyle = openToolbarMenu
    ? menuStyle ??
      getFloatingStyle(getMenuButtonRef(openToolbarMenu).current) ?? {
        left: 12,
        maxHeight: Math.max(180, window.innerHeight - 96),
        top: 72,
        width: Math.min(360, window.innerWidth - 24),
      }
    : undefined

  useLayoutEffect(() => {
    if (!interaction.isHelpOpen) {
      return
    }

    const updateHelpPosition = () => {
      setHelpStyle(getFloatingStyle(helpButtonRef.current))
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
      setWarningStyle(getFloatingStyle(warningButtonRef.current))
    }

    updateWarningPosition()
    window.addEventListener('resize', updateWarningPosition)
    window.addEventListener('scroll', updateWarningPosition, true)

    return () => {
      window.removeEventListener('resize', updateWarningPosition)
      window.removeEventListener('scroll', updateWarningPosition, true)
    }
  }, [interaction.isWarningsOpen])

  useLayoutEffect(() => {
    if (!openToolbarMenu) {
      return
    }

    const updateMenuPosition = () => {
      setMenuStyle(getFloatingStyle(getMenuButtonRef(openToolbarMenu).current))
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)

    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [openToolbarMenu])

  useEffect(() => {
    if (!interaction.isHelpOpen && !interaction.isWarningsOpen && !openToolbarMenu) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target

      if (!(target instanceof Node)) {
        return
      }

      if (
        helpButtonRef.current?.contains(target) ||
        helpPopoverRef.current?.contains(target) ||
        warningButtonRef.current?.contains(target) ||
        warningPopoverRef.current?.contains(target) ||
        beamButtonRef.current?.contains(target) ||
        importButtonRef.current?.contains(target) ||
        exportButtonRef.current?.contains(target) ||
        menuPopoverRef.current?.contains(target)
      ) {
        return
      }

      setHelpOpen(false)
      setWarningsOpen(false)
      setOpenToolbarMenu(undefined)
    }

    window.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [
    interaction.isHelpOpen,
    interaction.isWarningsOpen,
    openToolbarMenu,
    setHelpOpen,
    setOpenToolbarMenu,
    setWarningsOpen,
  ])

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
                Select is for placing and editing components. Hand drags the viewport. Space temporarily activates hand-pan, and the collapse controls at the top of each side panel free more board space without changing the current scene.
              </p>
            </section>
            <section>
              <h3>Placement Mode</h3>
              <p>
                Clicking a family arms a pending placement. In optical-table mode, pick the active host surface first, then place onto the table or the selected breadboard. Press R to rotate, click or tap to place, and Esc to cancel.
              </p>
            </section>
            <section>
              <h3>Workspace</h3>
              <p>
                Board keeps a single breadboard scene. Table promotes the scene onto a 3600 × 1500 mm optical table where additional breadboards can be added and table-mounted hardware can live beside them.
              </p>
            </section>
            <section>
              <h3>Render Modes</h3>
              <p>
                Realistic shows mounted hardware silhouettes with integrated default mounts, while the footprint appears only on hover or selection. Simple uses cleaner symbolic optics while keeping the same mechanical support logic underneath.
              </p>
            </section>
            <section>
              <h3>Beam Menu</h3>
              <p>
                Beam settings groups the fidelity mode, detail labels, and the Envelope overlay. Envelope shows the Stage 3 paraxial beam radius around the deterministic centerline.
              </p>
            </section>
            <section>
              <h3>Focused Optics Physics</h3>
              <p>
                Curved mirrors, telescopes, attenuators, polarizers, waveplates, and delay lines now participate in the traced beam model. Delay lines add internal optical path and femtosecond delay without changing the drawn 2D centerline.
              </p>
            </section>
            <section>
              <h3>OPA Modules</h3>
              <p>
                White-light generators, pump or seed combiners, and OPA gain stages use block-level optics physics. Real coincident beam hits take priority, and inspector pump or seed links only fill any missing inputs as fallback.
              </p>
            </section>
            <section>
              <h3>Current Limits</h3>
              <p>
                Periscopes are still 2D relays in this pass, and SpectraPro readouts stay metadata-based. Full 3D beam height, grating dispersion, and nonlinear phase-matching internals are still deferred.
              </p>
            </section>
            <section>
              <h3>Sources</h3>
              <p>
                Standard laser sources stay in off-board source lanes. In optical-table mode, large laser-body variants can also sit directly on the table. Pick a first target in the inspector, then align the source when that model supports beam launch.
              </p>
            </section>
            <section>
              <h3>Warnings</h3>
              <p>
                Warning filters let you show or hide simple mechanical warnings and advanced optical warnings. You can dismiss individual warnings or all visible warnings for the current session, and export review only blocks on the warnings you have not dismissed.
              </p>
            </section>
            <section>
              <h3>Resize</h3>
              <p>
                Selected components expose resize handles so you can tune uncertain hardware footprints such as detectors, stages, or large laser bodies without changing the underlying beam model beyond the scaled geometry.
              </p>
            </section>
            <section>
              <h3>Files</h3>
              <p>
                Import loads scene JSON. Export now chooses a format family first, then scope and SVG preset in a compact dialog. Engineering SVG is the Inkscape-first mm-native vector output, DXF is the clean layout/CAD export, and Raw JSON opens the editable scene document directly.
              </p>
            </section>
            <section>
              <h3>Guide</h3>
              <p>
                Guide reopens the walkthrough for placement, workspace modes, realistic/simple, panel collapse, warnings, vector export, and the new tutorial flow.
              </p>
            </section>
            <section>
              <h3>Tutorial</h3>
              <p>
                Tutorial replaces the current scene with a deterministic example setup after confirmation, then walks through what Stage 2 and Stage 3 are modeling so you can see the delay stage, curved-mirror / telescope behavior, and Gaussian readouts in context.
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
            aria-label="Scene warnings"
            className="toolbar__warning-popover"
            ref={warningPopoverRef}
            role="dialog"
            style={warningStyle}
          >
            <div className="toolbar__warning-popover-header">
              <strong>Scene Warnings</strong>
              <span>
                Showing {filteredWarnings.length} of {warningCount}
              </span>
            </div>

            <div className="toolbar__warning-settings">
              <span>Warning settings</span>
              <div className="toolbar__warning-filter-group">
                <button
                  className={warningFilters.simple ? 'is-active-tool' : undefined}
                  onClick={() => setWarningFilter('simple', !warningFilters.simple)}
                  type="button"
                >
                  Simple
                </button>
                <button
                  className={warningFilters.advanced ? 'is-active-tool' : undefined}
                  onClick={() => setWarningFilter('advanced', !warningFilters.advanced)}
                  type="button"
                >
                  Advanced
                </button>
              </div>
              <div className="toolbar__warning-filter-group">
                <button
                  disabled={filteredWarnings.length === 0}
                  onClick={() =>
                    dismissVisibleWarnings(filteredWarnings.map((warning) => warning.id))
                  }
                  type="button"
                >
                  Dismiss visible
                </button>
                <button
                  disabled={dismissedWarningCount === 0}
                  onClick={restoreDismissedWarnings}
                  type="button"
                >
                  Restore dismissed
                </button>
              </div>
            </div>

            {filteredWarnings.length > 0 ? (
              <div className="toolbar__warning-list">
                {filteredWarnings.map((warning) => (
                  <div
                    className={`toolbar__warning-item${warning.id === interaction.selectedWarningId ? ' is-selected' : ''}`}
                    key={warning.id}
                  >
                    <button
                      className="toolbar__warning-item-main"
                      onClick={() => {
                        setSelectedWarningId(warning.id)
                      }}
                      type="button"
                    >
                      <span className="toolbar__warning-item-tag">
                        {warning.tier} • {warning.category}
                      </span>
                      <strong>{warning.message}</strong>
                      <span>{warning.severity}</span>
                    </button>
                    <div className="toolbar__warning-item-actions">
                      <button
                        onClick={(event) => {
                          event.stopPropagation()
                          dismissWarning(warning.id)
                        }}
                        type="button"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : dismissedWarningCount > 0 ? (
              <p className="toolbar__warning-empty">
                All current warnings are dismissed for this session. Use Restore dismissed
                to review them again.
              </p>
            ) : (
              <p className="toolbar__warning-empty">
                No warnings match the current filter settings.
              </p>
            )}
          </div>,
          document.body,
        )
      : null

  const menuPopover =
    openToolbarMenu && activeMenuStyle
      ? createPortal(
          <div
            className="toolbar__menu-popover"
            ref={menuPopoverRef}
            role="dialog"
            style={activeMenuStyle}
          >
            {openToolbarMenu === 'beam' ? (
              <>
                <div className="toolbar__menu-header">
                  <strong>Beam Settings</strong>
                </div>
                <label className="toolbar__menu-field">
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
                <div className="toolbar__menu-actions">
                  <button
                    className={interaction.showBeamDetails ? 'is-active-tool' : undefined}
                    onClick={() => setShowBeamDetails(!interaction.showBeamDetails)}
                    type="button"
                  >
                    Beam Details
                  </button>
                  <button
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
                </div>
              </>
            ) : null}

            {openToolbarMenu === 'import' ? (
              <>
                <div className="toolbar__menu-header">
                  <strong>Import</strong>
                </div>
                <button
                  onClick={() => {
                    setOpenToolbarMenu(undefined)
                    onImportSceneJson()
                  }}
                  type="button"
                >
                  Scene JSON
                </button>
              </>
            ) : null}

            {openToolbarMenu === 'export' ? (
              <>
                <div className="toolbar__menu-header">
                  <strong>Export</strong>
                </div>
                <button
                  onClick={() => {
                    setOpenToolbarMenu(undefined)
                    onExportAction('scene-json')
                  }}
                  type="button"
                >
                  Scene JSON
                </button>
                <button
                  onClick={() => {
                    setOpenToolbarMenu(undefined)
                    onExportAction('png')
                  }}
                  type="button"
                >
                  PNG
                </button>
                <button
                  onClick={() => {
                    setOpenToolbarMenu(undefined)
                    onExportAction('pdf')
                  }}
                  type="button"
                >
                  PDF
                </button>
                <button
                  onClick={() => {
                    setOpenToolbarMenu(undefined)
                    onExportAction('svg')
                  }}
                  type="button"
                >
                  SVG
                </button>
                <button
                  onClick={() => {
                    setOpenToolbarMenu(undefined)
                    onExportAction('dxf')
                  }}
                  type="button"
                >
                  DXF
                </button>
                <button
                  onClick={() => {
                    setOpenToolbarMenu(undefined)
                    onExportAction('pptx')
                  }}
                  type="button"
                >
                  PPTX
                </button>
              </>
            ) : null}
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <header className="toolbar">
        <div className="toolbar__row toolbar__row--primary">
          <div className="toolbar__identity">
            <span className="toolbar__kicker">Ultrafast Optics Beam Layout</span>
            <strong>Schema-Lab</strong>
            <span className="toolbar__subtitle">
              FROG-oriented layout, power tracing, polarization bookkeeping, and SHG planning
            </span>
          </div>

          <div className="toolbar__controls toolbar__controls--primary" data-tour="toolbar-controls">
            <div className="toolbar__tool-group">
              <button
                aria-pressed={interaction.activeTool === 'select'}
                className={interaction.activeTool === 'select' ? 'is-active-tool' : undefined}
                onClick={() => setActiveTool('select')}
                type="button"
              >
                Select
              </button>
              <button
                aria-pressed={interaction.activeTool === 'pan'}
                className={interaction.activeTool === 'pan' ? 'is-active-tool' : undefined}
                onClick={() => setActiveTool('pan')}
                type="button"
              >
                Hand
              </button>
            </div>

            <label className="toolbar__field">
              <span>Snap</span>
              <select
                onChange={(event) => setSnapMode(event.target.value as typeof snapMode)}
                value={snapMode}
              >
                <option value="always">Always</option>
                <option value="onDrop">On drop</option>
                <option value="none">None</option>
              </select>
            </label>

            <div className="toolbar__tool-group">
              <button
                className={workspaceKind === 'single-breadboard' ? 'is-active-tool' : undefined}
                onClick={() => onRequestWorkspaceKind('single-breadboard')}
                type="button"
              >
                Board
              </button>
              <button
                className={workspaceKind === 'optical-table' ? 'is-active-tool' : undefined}
                onClick={() => onRequestWorkspaceKind('optical-table')}
                type="button"
              >
                Table
              </button>
            </div>

            <div className="toolbar__tool-group">
              <button
                className={renderMode === 'realistic' ? 'is-active-tool' : undefined}
                onClick={() => setRenderMode('realistic')}
                type="button"
              >
                Realistic
              </button>
              <button
                className={renderMode === 'simple' ? 'is-active-tool' : undefined}
                onClick={() => setRenderMode('simple')}
                type="button"
              >
                Simple
              </button>
            </div>

            <button
              aria-expanded={openToolbarMenu === 'beam'}
              className={openToolbarMenu === 'beam' ? 'is-active-tool' : undefined}
              onClick={(event) => toggleToolbarMenu('beam', event)}
              ref={beamButtonRef}
              type="button"
            >
              Beam
            </button>

            {warningCount > 0 || dismissedWarningCount > 0 ? (
              <div className="toolbar__warning">
                <button
                  aria-expanded={interaction.isWarningsOpen}
                  aria-haspopup="dialog"
                  className={`toolbar__warning-toggle${interaction.isWarningsOpen ? ' is-active-tool' : ''}${isWarningPulse ? ' is-pulsing' : ''}`}
                  onClick={() => {
                    const nextIsOpen = !interaction.isWarningsOpen

                    setHelpOpen(false)
                    setOpenToolbarMenu(undefined)
                    setWarningsOpen(nextIsOpen)

                    if (nextIsOpen && !interaction.selectedWarningId) {
                      setSelectedWarningId(filteredWarnings[0]?.id ?? warnings[0]?.id)
                    }
                  }}
                  ref={warningButtonRef}
                  type="button"
                >
                  Warnings{warningCount > 0 ? ` ${warningCount}` : ''}
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
                  setOpenToolbarMenu(undefined)
                  setHelpOpen(!interaction.isHelpOpen)
                }}
                ref={helpButtonRef}
                type="button"
              >
                Help
              </button>
            </div>

            <button
              className="toolbar__guide-button"
              onClick={() => {
                setHelpOpen(false)
                setWarningsOpen(false)
                setOpenToolbarMenu(undefined)
                onOpenOnboarding()
              }}
              type="button"
            >
              Guide
            </button>

            <button
              className="toolbar__tutorial-button"
              data-tour="toolbar-tutorial"
              onClick={() => {
                setHelpOpen(false)
                setWarningsOpen(false)
                setOpenToolbarMenu(undefined)
                onOpenTutorial()
              }}
              type="button"
            >
              Tutorial
            </button>

            <span className="toolbar__pill">{activeSourceCount} live sources</span>
            <span className="toolbar__pill">{beamTrace.pathSummaries.length} paths</span>
            <span className="toolbar__zoom">{zoomPxPerMm.toFixed(2)} px/mm</span>
          </div>
        </div>

        <div className="toolbar__row toolbar__row--secondary">
          <div className="toolbar__controls toolbar__controls--secondary">
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

            <button
              aria-expanded={openToolbarMenu === 'import'}
              className={openToolbarMenu === 'import' ? 'is-active-tool' : undefined}
              onClick={(event) => toggleToolbarMenu('import', event)}
              ref={importButtonRef}
              type="button"
            >
              Import
            </button>

            <button
              aria-expanded={openToolbarMenu === 'export'}
              className={openToolbarMenu === 'export' ? 'is-active-tool' : undefined}
              data-tour="toolbar-export"
              onClick={(event) => toggleToolbarMenu('export', event)}
              ref={exportButtonRef}
              type="button"
            >
              Export
            </button>

            <button onClick={onOpenJson} type="button">
              Raw JSON
            </button>

            {Object.keys(mountVisibilityDefaults).length > 0 ? (
              <span className="toolbar__pill">Custom mount defaults</span>
            ) : null}
          </div>
        </div>
      </header>

      {helpPopover}
      {warningPopover}
      {menuPopover}
    </>
  )
}

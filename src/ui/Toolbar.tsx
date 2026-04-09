import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import type { ExportFormat } from '../domain/exportLayout'
import type { BeamTraceResult, SceneWarning, WorkspaceKind, WorkspaceViewMode } from '../domain/types'
import { useEditorStore } from '../state/editorStore'

export type ExportAction = 'scene-json' | ExportFormat

interface ToolbarProps {
  beamTrace: BeamTraceResult
  dismissedWarningCount: number
  isBoardFocusAvailable: boolean
  isWarningPulse: boolean
  onClearBreadboard: () => void
  onClearTable: () => void
  onExportAction: (action: ExportAction) => void
  onImportSceneJson: () => void
  onImportSvg: () => void
  onOpenOnboarding: () => void
  onOpenJson: () => void
  onOpenTutorial: () => void
  onOpenVersionHistory: () => void
  onRequestBoardFocus: () => void
  onRequestSingleBoard: () => void
  onRequestTableView: () => void
  onResetView: () => void
  onToggleLabels: () => void
  onTogglePostHolders: () => void
  selectionActions?: ReactNode
  showComponentLabels: boolean
  showPostHolders: boolean
  toolDock: ReactNode
  warnings: SceneWarning[]
  workspaceKind: WorkspaceKind
  workspaceViewMode: WorkspaceViewMode
}

interface ShortcutGroup {
  heading: string
  rows: Array<{ action: string; keys: string[] }>
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    heading: 'Tools',
    rows: [
      { action: 'Select tool', keys: ['V'] },
      { action: 'Hand tool', keys: ['H'] },
      { action: 'Line tool', keys: ['L'] },
      { action: 'Text tool', keys: ['T'] },
      { action: 'Shape tool', keys: ['S'] },
      { action: 'Highlight tool', keys: ['Q'] },
      { action: 'Hide labels', keys: ['Shift', 'L'] },
      { action: 'Reset view', keys: ['0'] },
      { action: 'Realistic mode', keys: ['1'] },
      { action: 'Simple mode', keys: ['2'] },
    ],
  },
  {
    heading: 'Canvas',
    rows: [
      { action: 'Pan temporarily', keys: ['Space'] },
      { action: 'Zoom', keys: ['Ctrl/Cmd', 'Scroll'] },
      { action: 'Cancel / clear active mode', keys: ['Esc'] },
    ],
  },
  {
    heading: 'Editing',
    rows: [
      { action: 'Rotate selection', keys: ['R'] },
      { action: 'Duplicate selection', keys: ['D'] },
      { action: 'Delete selection', keys: ['Del'] },
      { action: 'Cancel placement', keys: ['Esc'] },
    ],
  },
  {
    heading: 'History',
    rows: [
      { action: 'Undo', keys: ['Ctrl/Cmd', 'Z'] },
      { action: 'Redo', keys: ['Ctrl/Cmd', 'Shift', 'Z'] },
      { action: 'Open shortcuts', keys: ['Ctrl/Cmd', 'Shift', '?'] },
    ],
  },
]

const APPENDIX_SECTIONS = [
  {
    heading: 'Navigate',
    rows: [
      'Board Focus keeps one breadboard close.',
      'Table View keeps the whole table visible.',
      'Scroll pans. Ctrl/Cmd + scroll zooms.',
    ],
  },
  {
    heading: 'Place',
    rows: [
      'Pick from the library, then click the active surface.',
      'Press R to rotate before or during placement.',
      'Press Esc to cancel the current placement.',
    ],
  },
  {
    heading: 'Edit',
    rows: [
      'Select optics, boards, annotations, or a highlight bundle.',
      'Use the row-two action strip or right-click for quick edits.',
      'Hide Labels stays visible so dense layouts stay readable.',
    ],
  },
]

function getFloatingStyle(button: HTMLButtonElement | null) {
  if (!button) {
    return undefined
  }

  const rect = button.getBoundingClientRect()
  const width = Math.min(340, window.innerWidth - 24)
  const left = Math.min(Math.max(12, rect.right - width), window.innerWidth - width - 12)
  const top = Math.min(rect.bottom + 10, window.innerHeight - 16)
  const maxHeight = Math.max(180, window.innerHeight - top - 12)

  return {
    left,
    maxHeight,
    top,
    width,
  } satisfies CSSProperties
}

function ToolbarIcon({
  children,
  label,
  onClick,
  disabled,
}: {
  children: ReactNode
  disabled?: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      aria-label={label}
      className="toolbar__icon-button"
      data-tooltip={label}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

function ShortcutKey({ children }: { children: ReactNode }) {
  return <kbd className="toolbar__shortcut-key">{children}</kbd>
}

export function Toolbar({
  beamTrace: _beamTrace,
  dismissedWarningCount,
  isBoardFocusAvailable,
  isWarningPulse,
  onClearBreadboard,
  onClearTable,
  onExportAction,
  onImportSceneJson,
  onImportSvg,
  onOpenOnboarding,
  onOpenJson,
  onOpenTutorial,
  onOpenVersionHistory,
  onRequestBoardFocus,
  onRequestSingleBoard,
  onRequestTableView,
  onResetView,
  onToggleLabels,
  onTogglePostHolders,
  selectionActions,
  showComponentLabels,
  showPostHolders,
  toolDock,
  warnings,
  workspaceKind,
  workspaceViewMode,
}: ToolbarProps) {
  const helpButtonRef = useRef<HTMLButtonElement | null>(null)
  const helpModalCardRef = useRef<HTMLDivElement | null>(null)
  const appendixModalCardRef = useRef<HTMLDivElement | null>(null)
  const warningButtonRef = useRef<HTMLButtonElement | null>(null)
  const warningPopoverRef = useRef<HTMLDivElement | null>(null)
  const beamButtonRef = useRef<HTMLButtonElement | null>(null)
  const importButtonRef = useRef<HTMLButtonElement | null>(null)
  const exportButtonRef = useRef<HTMLButtonElement | null>(null)
  const learnButtonRef = useRef<HTMLButtonElement | null>(null)
  const moreButtonRef = useRef<HTMLButtonElement | null>(null)
  const canvasToolsButtonRef = useRef<HTMLButtonElement | null>(null)
  const menuPopoverRef = useRef<HTMLDivElement | null>(null)
  const [warningStyle, setWarningStyle] = useState<CSSProperties>()
  const [menuStyle, setMenuStyle] = useState<CSSProperties>()
  const [isAppendixOpen, setIsAppendixOpen] = useState(false)
  const [isBoardModeTrayOpen, setIsBoardModeTrayOpen] = useState(false)
  const scene = useEditorStore((state) => state.scene)
  const renderMode = useEditorStore((state) => state.renderMode)
  const warningFilters = useEditorStore((state) => state.warningFilters)
  const openToolbarMenu = useEditorStore((state) => state.openToolbarMenu)
  const interaction = useEditorStore((state) => state.interaction)
  const activeTool = useEditorStore((state) => state.interaction.activeTool)
  const setRenderMode = useEditorStore((state) => state.setRenderMode)
  const setWarningFilter = useEditorStore((state) => state.setWarningFilter)
  const setOpenToolbarMenu = useEditorStore((state) => state.setOpenToolbarMenu)
  const setActiveTool = useEditorStore((state) => state.setActiveTool)
  const dismissWarning = useEditorStore((state) => state.dismissWarning)
  const dismissVisibleWarnings = useEditorStore(
    (state) => state.dismissVisibleWarnings,
  )
  const restoreDismissedWarnings = useEditorStore(
    (state) => state.restoreDismissedWarnings,
  )
  const setShowBeamDetails = useEditorStore((state) => state.setShowBeamDetails)
  const setShowGaussianEnvelope = useEditorStore(
    (state) => state.setShowGaussianEnvelope,
  )
  const setHelpOpen = useEditorStore((state) => state.setHelpOpen)
  const setWarningsOpen = useEditorStore((state) => state.setWarningsOpen)
  const setSelectedWarningId = useEditorStore((state) => state.setSelectedWarningId)
  const canUndo = useEditorStore((state) => state.canUndo)
  const canRedo = useEditorStore((state) => state.canRedo)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const updateBeamSettings = useEditorStore((state) => state.updateBeamSettings)
  const warningCount = warnings.length
  const filteredWarnings = warnings.filter((warning) =>
    warning.tier === 'simple' ? warningFilters.simple : warningFilters.advanced,
  )
  const hasBreadboards =
    scene.workspace.kind !== 'optical-table' || scene.workspace.breadboards.length > 0
  const boardModePrimaryLabel =
    workspaceKind === 'optical-table' && !hasBreadboards ? 'Solo Board' : 'Board Focus'
  const showBoardModeTray =
    workspaceKind === 'optical-table' && hasBreadboards && isBoardModeTrayOpen

  const toggleToolbarMenu = (
    menu: NonNullable<typeof openToolbarMenu>,
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    const nextMenu = openToolbarMenu === menu ? undefined : menu

    setHelpOpen(false)
    setWarningsOpen(false)
    setIsAppendixOpen(false)
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
      case 'learn':
        return learnButtonRef
      case 'more':
        return moreButtonRef
      case 'canvas-tools':
        return canvasToolsButtonRef
      default:
        return moreButtonRef
    }
  }

  const activeMenuStyle = openToolbarMenu
    ? menuStyle ??
      getFloatingStyle(getMenuButtonRef(openToolbarMenu)?.current ?? null) ?? {
        left: 12,
        maxHeight: Math.max(180, window.innerHeight - 96),
        top: 72,
        width: Math.min(340, window.innerWidth - 24),
      }
    : undefined

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
      setMenuStyle(getFloatingStyle(getMenuButtonRef(openToolbarMenu)?.current ?? null))
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
    if (
      !interaction.isHelpOpen &&
      !interaction.isWarningsOpen &&
      !openToolbarMenu &&
      !isAppendixOpen
    ) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target

      if (!(target instanceof Node)) {
        return
      }

      if (
        helpButtonRef.current?.contains(target) ||
        helpModalCardRef.current?.contains(target) ||
        appendixModalCardRef.current?.contains(target) ||
        warningButtonRef.current?.contains(target) ||
        warningPopoverRef.current?.contains(target) ||
        beamButtonRef.current?.contains(target) ||
        importButtonRef.current?.contains(target) ||
        exportButtonRef.current?.contains(target) ||
        learnButtonRef.current?.contains(target) ||
        moreButtonRef.current?.contains(target) ||
        canvasToolsButtonRef.current?.contains(target) ||
        menuPopoverRef.current?.contains(target)
      ) {
        return
      }

      setHelpOpen(false)
      setWarningsOpen(false)
      setIsAppendixOpen(false)
      setOpenToolbarMenu(undefined)
    }

    window.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [
    interaction.isHelpOpen,
    interaction.isWarningsOpen,
    isAppendixOpen,
    openToolbarMenu,
    setHelpOpen,
    setOpenToolbarMenu,
    setWarningsOpen,
  ])

  useEffect(() => {
    if (workspaceKind !== 'optical-table' || !hasBreadboards || !isBoardFocusAvailable) {
      setIsBoardModeTrayOpen(false)
    }
  }, [hasBreadboards, isBoardFocusAvailable, workspaceKind, workspaceViewMode])

  const helpModal = interaction.isHelpOpen
    ? createPortal(
        <div
          aria-label="Keyboard shortcuts"
          className="toolbar__shortcuts-shell"
          role="dialog"
        >
          <div
            className="toolbar__shortcuts-backdrop"
            onClick={() => setHelpOpen(false)}
          />
          <div className="toolbar__shortcuts-card" ref={helpModalCardRef}>
            <div className="toolbar__shortcuts-header">
              <div>
                <span className="toolbar__modal-kicker">Keyboard shortcuts</span>
                <h2>Work faster on the canvas</h2>
                <p>Keep the canvas clean and rely on direct actions when you need them.</p>
              </div>
              <button onClick={() => setHelpOpen(false)} type="button">
                Close
              </button>
            </div>

            <div className="toolbar__shortcuts-grid">
              {SHORTCUT_GROUPS.map((group) => (
                <section key={group.heading}>
                  <h3>{group.heading}</h3>
                  <div className="toolbar__shortcuts-list">
                    {group.rows.map((row) => (
                      <div className="toolbar__shortcuts-row" key={row.action}>
                        <span>{row.action}</span>
                        <div className="toolbar__shortcuts-keys">
                          {row.keys.map((key) => (
                            <ShortcutKey key={`${row.action}-${key}`}>{key}</ShortcutKey>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null

  const appendixModal = isAppendixOpen
    ? createPortal(
        <div aria-label="Schema-Lab appendix" className="toolbar__shortcuts-shell" role="dialog">
          <div className="toolbar__shortcuts-backdrop" onClick={() => setIsAppendixOpen(false)} />
          <div
            className="toolbar__shortcuts-card toolbar__shortcuts-card--appendix"
            ref={appendixModalCardRef}
          >
            <div className="toolbar__shortcuts-header">
              <div>
                <span className="toolbar__modal-kicker">Appendix</span>
                <h2>Quick reference</h2>
                <p>Short reminders for the editor surfaces that still need a little explanation.</p>
              </div>
              <button onClick={() => setIsAppendixOpen(false)} type="button">
                Close
              </button>
            </div>

            <div className="toolbar__appendix-grid">
              {APPENDIX_SECTIONS.map((section) => (
                <section key={section.heading}>
                  <h3>{section.heading}</h3>
                  <div className="toolbar__appendix-list">
                    {section.rows.map((row) => (
                      <p key={row}>{row}</p>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
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
            data-testid="warnings-popover"
            ref={warningPopoverRef}
            role="dialog"
            style={warningStyle}
          >
            <div className="toolbar__warning-popover-header">
              <strong>Scene warnings</strong>
              <span>
                Showing {filteredWarnings.length} of {warningCount}
              </span>
            </div>

            <div className="toolbar__warning-settings">
              <span>Warning filters</span>
              <div className="toolbar__warning-filter-group">
                <button
                  aria-pressed={warningFilters.simple}
                  className={warningFilters.simple ? 'is-active-tool' : undefined}
                  onClick={() => setWarningFilter('simple', !warningFilters.simple)}
                  type="button"
                >
                  Simple
                </button>
                <button
                  aria-pressed={warningFilters.advanced}
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
                        {warning.tier} · {warning.category}
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
                All current warnings are dismissed for this session.
              </p>
            ) : (
              <p className="toolbar__warning-empty">
                No warnings match the current filters.
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
            data-testid={`toolbar-menu-${openToolbarMenu}`}
            ref={menuPopoverRef}
            role="dialog"
            style={activeMenuStyle}
          >
            {openToolbarMenu === 'beam' ? (
              <>
                <div className="toolbar__menu-header">
                  <strong>Beam settings</strong>
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
                    aria-pressed={interaction.showBeamDetails}
                    className={interaction.showBeamDetails ? 'is-active-tool' : undefined}
                    onClick={() => setShowBeamDetails(!interaction.showBeamDetails)}
                    type="button"
                  >
                    Beam details
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
                <button
                  onClick={() => {
                    setOpenToolbarMenu(undefined)
                    onImportSvg()
                  }}
                  type="button"
                >
                  Interpreted SVG
                </button>
              </>
            ) : null}

            {openToolbarMenu === 'export' ? (
              <>
                <div className="toolbar__menu-header">
                  <strong>Export</strong>
                </div>
                {(['png', 'pdf', 'svg', 'dxf', 'pptx'] as const).map((format) => (
                  <button
                    key={format}
                    onClick={() => {
                      setOpenToolbarMenu(undefined)
                      onExportAction(format)
                    }}
                    type="button"
                  >
                    {format.toUpperCase()}
                  </button>
                ))}
              </>
            ) : null}

            {openToolbarMenu === 'learn' ? (
              <>
                <div className="toolbar__menu-header">
                  <strong>Learn</strong>
                </div>
                <button
                  onClick={() => {
                    setOpenToolbarMenu(undefined)
                    setHelpOpen(false)
                    setWarningsOpen(false)
                    setIsAppendixOpen(true)
                  }}
                  type="button"
                >
                  Appendix
                </button>
                <button
                  onClick={() => {
                    setOpenToolbarMenu(undefined)
                    onOpenOnboarding()
                  }}
                  type="button"
                >
                  Guide
                </button>
                <button
                  onClick={() => {
                    setOpenToolbarMenu(undefined)
                    onOpenTutorial()
                  }}
                  type="button"
                >
                  Tutorial
                </button>
                <button
                  onClick={() => {
                    setOpenToolbarMenu(undefined)
                    onOpenVersionHistory()
                  }}
                  type="button"
                >
                  What’s New
                </button>
              </>
            ) : null}

            {openToolbarMenu === 'more' ? (
              <>
                <div className="toolbar__menu-header">
                  <strong>More</strong>
                </div>
                <button
                  onClick={() => {
                    setOpenToolbarMenu(undefined)
                    onOpenJson()
                  }}
                  type="button"
                >
                  Raw JSON
                </button>
                {workspaceKind === 'optical-table' ? (
                  <button
                    onClick={() => {
                      setOpenToolbarMenu(undefined)
                      onRequestSingleBoard()
                    }}
                    type="button"
                  >
                    Make Standalone Board
                  </button>
                ) : null}
              </>
            ) : null}

            {openToolbarMenu === 'canvas-tools' ? (
              <>
                <div className="toolbar__menu-header">
                  <strong>Canvas tools</strong>
                </div>
                <button
                  onClick={() => {
                    setOpenToolbarMenu(undefined)
                    onTogglePostHolders()
                  }}
                  type="button"
                >
                  {showPostHolders ? 'Hide Post Holders' : 'Show Post Holders'}
                </button>
                <button
                  onClick={() => {
                    setOpenToolbarMenu(undefined)
                    onClearBreadboard()
                  }}
                  type="button"
                >
                  Clear Board
                </button>
                {workspaceKind === 'optical-table' ? (
                  <button
                    onClick={() => {
                      setOpenToolbarMenu(undefined)
                      onClearTable()
                    }}
                    type="button"
                  >
                    Clear Table
                  </button>
                ) : null}
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
          <div className="toolbar__brand" translate="no">
            <span aria-hidden="true" className="toolbar__brand-mark">
              <span className="toolbar__brand-mark-core" />
              <span className="toolbar__brand-mark-orbit" />
            </span>
            <strong>
              <span>Schema</span>
              <span className="toolbar__brand-divider">-</span>
              <span>Lab</span>
            </strong>
          </div>

          <div
            className="toolbar__controls toolbar__controls--primary"
            data-tour="toolbar-controls"
          >
            <div
              className="toolbar__workspace-mode-wrap"
              data-tour="workspace-modes"
              onMouseEnter={() => {
                if (
                  workspaceKind === 'optical-table' &&
                  hasBreadboards &&
                  isBoardFocusAvailable
                ) {
                  setIsBoardModeTrayOpen(true)
                }
              }}
              onMouseLeave={() => setIsBoardModeTrayOpen(false)}
            >
              <div className="toolbar__tool-group toolbar__tool-group--segmented">
                <button
                  className={
                    workspaceViewMode === 'board-focus' && hasBreadboards
                      ? 'is-active-tool'
                      : undefined
                  }
                  data-testid="toolbar-board-focus"
                  disabled={!isBoardFocusAvailable && hasBreadboards}
                  onClick={() => {
                    if (workspaceKind === 'optical-table' && !hasBreadboards) {
                      onRequestSingleBoard()
                      return
                    }

                    const prefersHoverlessUi =
                      typeof window !== 'undefined' &&
                      window.matchMedia('(hover: none)').matches &&
                      workspaceKind === 'optical-table' &&
                      hasBreadboards

                    if (prefersHoverlessUi) {
                      setIsBoardModeTrayOpen((current) => !current)
                      return
                    }

                    onRequestBoardFocus()
                  }}
                  onFocus={() => {
                    if (
                      workspaceKind === 'optical-table' &&
                      hasBreadboards &&
                      isBoardFocusAvailable
                    ) {
                      setIsBoardModeTrayOpen(true)
                    }
                  }}
                  type="button"
                >
                  {boardModePrimaryLabel}
                </button>
                <button
                  className={workspaceViewMode === 'table-view' ? 'is-active-tool' : undefined}
                  data-testid="toolbar-table-view"
                  onClick={onRequestTableView}
                  type="button"
                >
                  Table View
                </button>
              </div>

              {showBoardModeTray ? (
                <div className="toolbar__workspace-flyout">
                  <button
                    onClick={() => {
                      setIsBoardModeTrayOpen(false)
                      onRequestSingleBoard()
                    }}
                    type="button"
                  >
                    Solo Board
                  </button>
                </div>
              ) : null}
            </div>

            <button
              aria-expanded={openToolbarMenu === 'beam'}
              className={openToolbarMenu === 'beam' ? 'is-active-tool' : undefined}
              data-testid="toolbar-beam"
              onClick={(event) => toggleToolbarMenu('beam', event)}
              ref={beamButtonRef}
              type="button"
            >
              Beam
            </button>

            <button
              aria-expanded={openToolbarMenu === 'import'}
              className={openToolbarMenu === 'import' ? 'is-active-tool' : undefined}
              data-testid="toolbar-import"
              onClick={(event) => toggleToolbarMenu('import', event)}
              ref={importButtonRef}
              type="button"
            >
              Import
            </button>

            <button
              aria-expanded={openToolbarMenu === 'export'}
              className={openToolbarMenu === 'export' ? 'is-active-tool' : undefined}
              data-testid="toolbar-export"
              data-tour="toolbar-export"
              onClick={(event) => toggleToolbarMenu('export', event)}
              ref={exportButtonRef}
              type="button"
            >
              Export
            </button>

            <button
              aria-expanded={openToolbarMenu === 'learn'}
              className={openToolbarMenu === 'learn' ? 'is-active-tool' : undefined}
              data-testid="toolbar-learn"
              data-tour="toolbar-learn"
              onClick={(event) => toggleToolbarMenu('learn', event)}
              ref={learnButtonRef}
              type="button"
            >
              Learn
            </button>

            <button
              aria-expanded={openToolbarMenu === 'more'}
              className={openToolbarMenu === 'more' ? 'is-active-tool' : undefined}
              data-testid="toolbar-more"
              onClick={(event) => toggleToolbarMenu('more', event)}
              ref={moreButtonRef}
              type="button"
            >
              ⋯
            </button>

            <button
              aria-expanded={interaction.isWarningsOpen}
              aria-haspopup="dialog"
              className={`toolbar__warning-toggle${interaction.isWarningsOpen ? ' is-active-tool' : ''}${isWarningPulse ? ' is-pulsing' : ''}`}
              data-testid="toolbar-warnings"
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
              Warnings {warningCount}
            </button>

            <button
              aria-expanded={interaction.isHelpOpen}
              aria-haspopup="dialog"
              className={`toolbar__help-button${interaction.isHelpOpen ? ' is-active-tool' : ''}`}
              data-testid="toolbar-shortcuts"
              data-tour="toolbar-help"
              onClick={() => {
                setWarningsOpen(false)
                setOpenToolbarMenu(undefined)
                setHelpOpen(!interaction.isHelpOpen)
              }}
              ref={helpButtonRef}
              type="button"
            >
              ?
            </button>
          </div>
        </div>

        <div className="toolbar__row toolbar__row--secondary">
          <div className="toolbar__selection-slot">{selectionActions}</div>

          <div className="toolbar__tool-dock" data-testid="toolbar-tool-dock">
            <div className="toolbar__tool-dock-cluster">
              {toolDock}
              <button
                aria-label="Highlight"
                aria-pressed={activeTool === 'highlight'}
                className={`toolbar__icon-button toolbar__icon-button--highlight${activeTool === 'highlight' ? ' is-active' : ''}`}
                data-tooltip="Highlight"
                onClick={() => {
                  setHelpOpen(false)
                  setWarningsOpen(false)
                  setOpenToolbarMenu(undefined)
                  setActiveTool(activeTool === 'highlight' ? 'select' : 'highlight')
                }}
                type="button"
              >
                <svg fill="none" viewBox="0 0 24 24">
                  <rect
                    height="12"
                    rx="1.8"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    width="12"
                    x="6"
                    y="6"
                  />
                  <path
                    d="M4 9.5V4h5.5"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M20 14.5V20h-5.5"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div className="toolbar__controls toolbar__controls--secondary">
            <div className="toolbar__tool-group toolbar__tool-group--compact toolbar__tool-group--canvas-actions">
              <ToolbarIcon
                label={showComponentLabels ? 'Hide labels' : 'Show labels'}
                onClick={onToggleLabels}
              >
                <svg fill="none" viewBox="0 0 24 24">
                  <path
                    d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.7"
                  />
                  <circle cx="12" cy="12" fill="currentColor" r="2.2" />
                </svg>
              </ToolbarIcon>

              <ToolbarIcon label="Reset view" onClick={onResetView}>
                <svg fill="none" viewBox="0 0 24 24">
                  <path
                    d="M12 5a7 7 0 1 0 7 7"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M15 5h4v4"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </svg>
              </ToolbarIcon>

              <button
                aria-expanded={openToolbarMenu === 'canvas-tools'}
                className={`toolbar__icon-button${openToolbarMenu === 'canvas-tools' ? ' is-active' : ''}`}
                data-tooltip="Canvas tools"
                onClick={(event) => toggleToolbarMenu('canvas-tools', event)}
                ref={canvasToolsButtonRef}
                type="button"
              >
                <svg fill="none" viewBox="0 0 24 24">
                  <circle cx="5" cy="12" fill="currentColor" r="1.7" />
                  <circle cx="12" cy="12" fill="currentColor" r="1.7" />
                  <circle cx="19" cy="12" fill="currentColor" r="1.7" />
                </svg>
              </button>
            </div>

            <div className="toolbar__tool-group toolbar__tool-group--segmented toolbar__tool-group--render-mode">
              <button
                aria-pressed={renderMode === 'realistic'}
                className={renderMode === 'realistic' ? 'is-active-tool' : undefined}
                onClick={() => setRenderMode('realistic')}
                type="button"
              >
                Realistic
              </button>
              <button
                aria-pressed={renderMode === 'simple'}
                className={renderMode === 'simple' ? 'is-active-tool' : undefined}
                onClick={() => setRenderMode('simple')}
                type="button"
              >
                Simple
              </button>
            </div>

            <div className="toolbar__tool-group toolbar__tool-group--compact">
              <ToolbarIcon disabled={!canUndo} label="Undo" onClick={undo}>
                <svg fill="none" viewBox="0 0 24 24">
                  <path
                    d="M9 7 4 12l5 5"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M20 17a7 7 0 0 0-7-7H4"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </svg>
              </ToolbarIcon>
              <ToolbarIcon disabled={!canRedo} label="Redo" onClick={redo}>
                <svg fill="none" viewBox="0 0 24 24">
                  <path
                    d="m15 7 5 5-5 5"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M4 17a7 7 0 0 1 7-7h9"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </svg>
              </ToolbarIcon>
            </div>
          </div>
        </div>
      </header>

      {helpModal}
      {appendixModal}
      {warningPopover}
      {menuPopover}
    </>
  )
}

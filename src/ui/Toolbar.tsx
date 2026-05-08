import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import type { ExportFormat } from '../domain/exportLayout'
import type { BeamTraceResult, SceneWarning, WorkspaceKind, WorkspaceViewMode } from '../domain/types'
import { useEditorStore } from '../state/editorStore'
import {
  useToolbarInteractionState,
  useToolbarWorkspaceState,
} from '../state/editorSelectors'
import {
  FloatingToolbarTooltip,
  SuggestionBoxModal,
} from './ToolbarOverlays'

export type ExportAction = 'scene-json' | ExportFormat

interface ToolbarProps {
  beamTrace: BeamTraceResult
  dismissedWarningCount: number
  isBoardFocusAvailable: boolean
  isOgMode?: boolean
  isWarningPulse: boolean
  onClearBreadboard: () => void
  onClearTable: () => void
  onExportAction: (action: ExportAction) => void
  onImportRaster: () => void
  onImportSceneJson: () => void
  onImportSvg: () => void
  onOpenOnboarding: () => void
  onOpenJson: () => void
  onRestoreSavedTable: () => void
  onOpenTutorial: () => void
  onOpenVersionHistory: () => void
  onRequestBoardFocus: () => void
  onRequestSingleBoard: () => void
  onRequestTableView: () => void
  onResetView: () => void
  onStartFreshTable: () => void
  onToggleLabels: () => void
  onTogglePostHolders: () => void
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
      'Solo Board returns from the optical table to one working board.',
    ],
  },
  {
    heading: 'Place',
    rows: [
      'Pick from the library, then click the active surface.',
      'Press R to rotate before or during placement.',
      'Press Esc to cancel the current placement.',
      'The inspector follows the current board, component, or annotation selection.',
    ],
  },
  {
    heading: 'Edit',
    rows: [
      'Select optics, boards, annotations, or a highlight bundle.',
      'Use the pinned selection strip or right-click for quick edits.',
      'Hide Labels stays visible so dense layouts stay readable.',
    ],
  },
  {
    heading: 'View modes',
    rows: [
      'Realistic shows hardware bodies and mounts.',
      'Enhanced keeps the 2D view readable while using richer hardware silhouettes.',
      'Classic optics swaps Simple symbols to a more conventional lab-style drawing set.',
    ],
  },
  {
    heading: 'Beam controls',
    rows: [
      'Beam settings now live in the inspector instead of the top bar.',
      'Board and table selections expose shared beam defaults.',
      'Source selections expose launch, polarization, and beam readouts.',
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

function getAnnotationDockTooltipButton(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null
  }

  const button = target.closest('.annotation-dock__tools .toolbar__icon-button[aria-label]')
  return button instanceof HTMLButtonElement ? button : null
}

function ToolbarIcon({
  children,
  label,
  onBlur,
  onClick,
  disabled,
  onFocus,
  onMouseEnter,
  onMouseLeave,
}: {
  children: ReactNode
  disabled?: boolean
  label: string
  onClick: () => void
  onBlur?: (event: FocusEvent<HTMLButtonElement>) => void
  onFocus?: (event: FocusEvent<HTMLButtonElement>) => void
  onMouseEnter?: (event: MouseEvent<HTMLButtonElement>) => void
  onMouseLeave?: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      aria-label={label}
      className="toolbar__icon-button"
      disabled={disabled}
      onBlur={onBlur}
      onClick={onClick}
      onFocus={onFocus}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
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
  isOgMode = false,
  isWarningPulse,
  onClearBreadboard,
  onClearTable,
  onExportAction,
  onImportRaster,
  onImportSceneJson,
  onImportSvg,
  onOpenOnboarding,
  onOpenJson,
  onRestoreSavedTable,
  onOpenTutorial,
  onOpenVersionHistory,
  onRequestBoardFocus,
  onRequestSingleBoard,
  onRequestTableView,
  onResetView,
  onStartFreshTable,
  onToggleLabels,
  onTogglePostHolders,
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
  const exportButtonRef = useRef<HTMLButtonElement | null>(null)
  const moreButtonRef = useRef<HTMLButtonElement | null>(null)
  const canvasToolsButtonRef = useRef<HTMLButtonElement | null>(null)
  const menuPopoverRef = useRef<HTMLDivElement | null>(null)
  const [warningStyle, setWarningStyle] = useState<CSSProperties>()
  const [menuStyle, setMenuStyle] = useState<CSSProperties>()
  const [tooltipTarget, setTooltipTarget] = useState<{
    label: string
    element: HTMLButtonElement | null
  } | null>(null)
  const [isAppendixOpen, setIsAppendixOpen] = useState(false)
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false)
  const [isBoardModeTrayOpen, setIsBoardModeTrayOpen] = useState(false)
  const boardModeTrayCloseTimeoutRef = useRef<number | undefined>(undefined)
  const { hasBreadboards } = useToolbarWorkspaceState()
  const renderMode = useEditorStore((state) => state.renderMode)
  const simpleIconStyle = useEditorStore((state) => state.simpleIconStyle)
  const warningFilters = useEditorStore((state) => state.warningFilters)
  const openToolbarMenu = useEditorStore((state) => state.openToolbarMenu)
  const {
    activeTool,
    isHelpOpen,
    isWarningsOpen,
    selectedWarningId,
  } = useToolbarInteractionState()
  const setRenderMode = useEditorStore((state) => state.setRenderMode)
  const setSimpleIconStyle = useEditorStore((state) => state.setSimpleIconStyle)
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
  const setHelpOpen = useEditorStore((state) => state.setHelpOpen)
  const setWarningsOpen = useEditorStore((state) => state.setWarningsOpen)
  const setSelectedWarningId = useEditorStore((state) => state.setSelectedWarningId)
  const canUndo = useEditorStore((state) => state.canUndo)
  const canRedo = useEditorStore((state) => state.canRedo)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const warningCount = warnings.length
  const filteredWarnings = warnings.filter((warning) =>
    warning.tier === 'simple' ? warningFilters.simple : warningFilters.advanced,
  )
  const boardModePrimaryLabel =
    workspaceKind === 'optical-table' && !hasBreadboards ? 'Solo Board' : 'Board Focus'
  const showBoardModeTray =
    workspaceKind === 'optical-table' && hasBreadboards && isBoardModeTrayOpen

  const clearBoardModeTrayCloseTimeout = () => {
    if (boardModeTrayCloseTimeoutRef.current === undefined) {
      return
    }

    window.clearTimeout(boardModeTrayCloseTimeoutRef.current)
    boardModeTrayCloseTimeoutRef.current = undefined
  }

  const openBoardModeTray = () => {
    clearBoardModeTrayCloseTimeout()

    if (
      workspaceKind === 'optical-table' &&
      hasBreadboards &&
      isBoardFocusAvailable
    ) {
      setIsBoardModeTrayOpen(true)
    }
  }

  const closeBoardModeTraySoon = () => {
    clearBoardModeTrayCloseTimeout()
    boardModeTrayCloseTimeoutRef.current = window.setTimeout(() => {
      setIsBoardModeTrayOpen(false)
      boardModeTrayCloseTimeoutRef.current = undefined
    }, 160)
  }

  const toggleToolbarMenu = (
    menu: NonNullable<typeof openToolbarMenu>,
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    const nextMenu = openToolbarMenu === menu ? undefined : menu

    setHelpOpen(false)
    setWarningsOpen(false)
    setIsAppendixOpen(false)
    setIsSuggestionsOpen(false)
    setTooltipTarget(null)
    setOpenToolbarMenu(nextMenu)
    setMenuStyle(nextMenu ? getFloatingStyle(event.currentTarget) : undefined)
  }

  const showToolbarTooltip = (
    label: string,
    element: HTMLButtonElement | null,
  ) => {
    if (isOgMode) {
      return
    }

    if (
      !element ||
      isHelpOpen ||
      isWarningsOpen ||
      isSuggestionsOpen ||
      Boolean(openToolbarMenu)
    ) {
      return
    }

    setTooltipTarget({ label, element })
  }

  const hideToolbarTooltip = (element: HTMLButtonElement | null) => {
    setTooltipTarget((current) => {
      if (!current) {
        return null
      }

      if (current.element !== element) {
        return current
      }

      return null
    })
  }

  const bindToolbarTooltip = (label: string) => ({
    onBlur: (event: FocusEvent<HTMLButtonElement>) => {
      hideToolbarTooltip(event.currentTarget)
    },
    onFocus: (event: FocusEvent<HTMLButtonElement>) => {
      showToolbarTooltip(label, event.currentTarget)
    },
    onMouseEnter: (event: MouseEvent<HTMLButtonElement>) => {
      showToolbarTooltip(label, event.currentTarget)
    },
    onMouseLeave: (event: MouseEvent<HTMLButtonElement>) => {
      hideToolbarTooltip(event.currentTarget)
    },
  })

  const labelsTooltip = bindToolbarTooltip(showComponentLabels ? 'Hide labels' : 'Show labels')
  const filesTooltip = bindToolbarTooltip('Files')
  const resetViewTooltip = bindToolbarTooltip('Reset view')
  const undoTooltip = bindToolbarTooltip('Undo')
  const redoTooltip = bindToolbarTooltip('Redo')
  const moreTooltip = bindToolbarTooltip('More')
  const suggestionsTooltip = bindToolbarTooltip('Suggestions')
  const highlightTooltip = bindToolbarTooltip('Highlight')
  const canvasToolsTooltip = bindToolbarTooltip('Canvas tools')

  const getMenuButtonRef = (menu: NonNullable<typeof openToolbarMenu>) => {
    switch (menu) {
      case 'export':
        return exportButtonRef
      case 'more':
        return moreButtonRef
      case 'canvas-tools':
        return canvasToolsButtonRef
      default:
        return exportButtonRef
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
    if (!isWarningsOpen) {
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
  }, [isWarningsOpen])

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
      !isHelpOpen &&
      !isWarningsOpen &&
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
        exportButtonRef.current?.contains(target) ||
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
  }, [isAppendixOpen, isHelpOpen, isWarningsOpen, openToolbarMenu, setHelpOpen, setOpenToolbarMenu, setWarningsOpen])

  useEffect(() => {
    if (isHelpOpen || isWarningsOpen || openToolbarMenu || isAppendixOpen || isSuggestionsOpen) {
      setTooltipTarget(null)
    }
  }, [isAppendixOpen, isHelpOpen, isSuggestionsOpen, isWarningsOpen, openToolbarMenu])

  useEffect(() => {
    if (workspaceKind !== 'optical-table' || !hasBreadboards || !isBoardFocusAvailable) {
      setIsBoardModeTrayOpen(false)
    }
  }, [hasBreadboards, isBoardFocusAvailable, workspaceKind, workspaceViewMode])

  useEffect(() => {
    return () => {
      clearBoardModeTrayCloseTimeout()
    }
  }, [])

  const helpModal = !isOgMode && isHelpOpen
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
                <span className="toolbar__modal-kicker">Help &amp; shortcuts</span>
                <h2>Work faster on the canvas</h2>
                <p>Shortcuts, quick reminders, onboarding, and release notes stay here.</p>
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

            <div className="toolbar__menu-actions toolbar__shortcuts-actions">
              <button
                onClick={() => {
                  setHelpOpen(false)
                  onOpenOnboarding()
                }}
                type="button"
              >
                Guide
              </button>
              <button
                onClick={() => {
                  setHelpOpen(false)
                  setIsAppendixOpen(true)
                }}
                type="button"
              >
                Appendix
              </button>
              <button
                onClick={() => {
                  setHelpOpen(false)
                  onOpenTutorial()
                }}
                type="button"
              >
                Tutorial
              </button>
              <button
                onClick={() => {
                  setHelpOpen(false)
                  onOpenVersionHistory()
                }}
                type="button"
              >
                What’s New
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null

  const appendixModal = !isOgMode && isAppendixOpen
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
    !isOgMode && isWarningsOpen && warningStyle
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
                    className={`toolbar__warning-item${warning.id === selectedWarningId ? ' is-selected' : ''}`}
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
    !isOgMode && openToolbarMenu && activeMenuStyle
      ? createPortal(
        <div
            className="toolbar__menu-popover"
            data-testid={`toolbar-menu-${openToolbarMenu}`}
            ref={menuPopoverRef}
            role="dialog"
            style={activeMenuStyle}
          >
            {openToolbarMenu === 'export' ? (
              <>
                <div className="toolbar__menu-header">
                  <strong>Files</strong>
                </div>
                <section>
                  <h3>Import</h3>
                  <button
                    onClick={() => {
                      setOpenToolbarMenu(undefined)
                      onImportSceneJson()
                    }}
                    type="button"
                  >
                    Import Scene JSON
                  </button>
                  <button
                    onClick={() => {
                      setOpenToolbarMenu(undefined)
                      onImportRaster()
                    }}
                    type="button"
                  >
                    Import PNG
                  </button>
                  <button
                    onClick={() => {
                      setOpenToolbarMenu(undefined)
                      onImportSvg()
                    }}
                    type="button"
                  >
                    Import SVG
                  </button>
                </section>

                <section>
                  <h3>Export</h3>
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
                </section>
              </>
            ) : null}

            {openToolbarMenu === 'more' ? (
              <>
                <div className="toolbar__menu-header">
                  <strong>More</strong>
                </div>
                <section>
                  <h3>Scene</h3>
                  <button
                    onClick={() => {
                      setOpenToolbarMenu(undefined)
                      onOpenJson()
                    }}
                    type="button"
                  >
                    Raw JSON
                  </button>
                </section>
                {workspaceKind === 'single-breadboard' ? (
                  <section>
                    <h3>Table</h3>
                    <button
                      onClick={() => {
                        setOpenToolbarMenu(undefined)
                        onRestoreSavedTable()
                      }}
                      type="button"
                    >
                      Restore Saved Table
                    </button>
                    <button
                      onClick={() => {
                        setOpenToolbarMenu(undefined)
                        onStartFreshTable()
                      }}
                      type="button"
                    >
                      Start Fresh Table
                    </button>
                  </section>
                ) : null}
                {workspaceKind === 'optical-table' ? (
                  <section>
                    <h3>Workspace</h3>
                    <button
                      onClick={() => {
                        setOpenToolbarMenu(undefined)
                        onRequestSingleBoard()
                      }}
                      type="button"
                    >
                      Make Standalone Board
                    </button>
                  </section>
                ) : null}
                <section>
                  <h3>Simple icon default</h3>
                  <div className="toolbar__menu-actions">
                    <button
                      aria-pressed={simpleIconStyle === 'enhanced'}
                      className={simpleIconStyle === 'enhanced' ? 'is-active-tool' : undefined}
                      onClick={() => {
                        setSimpleIconStyle('enhanced')
                        setOpenToolbarMenu(undefined)
                      }}
                      type="button"
                    >
                      Enhanced
                    </button>
                    <button
                      aria-pressed={simpleIconStyle === 'classic'}
                      className={simpleIconStyle === 'classic' ? 'is-active-tool' : undefined}
                      onClick={() => {
                        setSimpleIconStyle('classic')
                        setOpenToolbarMenu(undefined)
                      }}
                      type="button"
                    >
                      Classic optics
                    </button>
                  </div>
                </section>
              </>
            ) : null}

            {openToolbarMenu === 'canvas-tools' ? (
              <>
                <div className="toolbar__menu-header">
                  <strong>Canvas tools</strong>
                </div>
                {renderMode === 'simple' ? (
                  <button
                    onClick={() => {
                      setOpenToolbarMenu(undefined)
                      onTogglePostHolders()
                    }}
                    type="button"
                  >
                    {showPostHolders ? 'Hide Post Holders' : 'Show Post Holders'}
                  </button>
                ) : (
                  <div className="toolbar__menu-header">
                    Supports are automatic in realistic mode.
                  </div>
                )}
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

  const tooltipPortal = isOgMode ? null : <FloatingToolbarTooltip target={tooltipTarget} />
  const suggestionsModal = isOgMode ? null : (
    <SuggestionBoxModal
      isOpen={isSuggestionsOpen}
      onClose={() => {
        setIsSuggestionsOpen(false)
        setTooltipTarget(null)
      }}
    />
  )

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
              onBlur={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  return
                }

                setIsBoardModeTrayOpen(false)
              }}
              onMouseEnter={openBoardModeTray}
              onMouseLeave={closeBoardModeTraySoon}
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
                  onFocus={openBoardModeTray}
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
                <div
                  className="toolbar__workspace-flyout"
                  onMouseEnter={openBoardModeTray}
                  onMouseLeave={closeBoardModeTraySoon}
                >
                  <button
                    onClick={() => {
                      clearBoardModeTrayCloseTimeout()
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
              aria-expanded={openToolbarMenu === 'export'}
              aria-label="Files"
              className={`toolbar__icon-button toolbar__icon-button--primary${openToolbarMenu === 'export' ? ' is-active' : ''}`}
              data-testid="toolbar-export"
              data-tour="toolbar-export"
              {...filesTooltip}
              onClick={(event) => toggleToolbarMenu('export', event)}
              ref={exportButtonRef}
              type="button"
            >
              <svg fill="none" viewBox="0 0 24 24">
                <path
                  d="M8.4 5.6h6.2l3.2 3.2v9.6a1.8 1.8 0 0 1-1.8 1.8H8.4a1.8 1.8 0 0 1-1.8-1.8V7.4a1.8 1.8 0 0 1 1.8-1.8Z"
                  stroke="currentColor"
                  strokeLinejoin="round"
                  strokeWidth="1.7"
                />
                <path
                  d="M14.6 5.6v3.3h3.2"
                  stroke="currentColor"
                  strokeLinejoin="round"
                  strokeWidth="1.7"
                />
                <path
                  d="M9.2 11.2h5.6"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.7"
                />
                <path
                  d="M9.2 14.4h5.6"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.7"
                />
              </svg>
            </button>

            <button
              aria-expanded={openToolbarMenu === 'more'}
              aria-label="More"
              className={`toolbar__icon-button toolbar__icon-button--primary${openToolbarMenu === 'more' ? ' is-active' : ''}`}
              data-testid="toolbar-more"
              {...moreTooltip}
              onClick={(event) => toggleToolbarMenu('more', event)}
              ref={moreButtonRef}
              type="button"
            >
              <svg fill="none" viewBox="0 0 24 24">
                <circle cx="5" cy="12" fill="currentColor" r="1.7" />
                <circle cx="12" cy="12" fill="currentColor" r="1.7" />
                <circle cx="19" cy="12" fill="currentColor" r="1.7" />
              </svg>
            </button>

            {!isOgMode ? (
              <button
                aria-label="Suggestions"
                className="toolbar__icon-button toolbar__icon-button--primary toolbar__icon-button--suggestions"
                data-testid="toolbar-suggestions"
                {...suggestionsTooltip}
                onClick={() => {
                  setHelpOpen(false)
                  setWarningsOpen(false)
                  setOpenToolbarMenu(undefined)
                  setIsAppendixOpen(false)
                  setIsSuggestionsOpen(true)
                  setTooltipTarget(null)
                }}
                type="button"
              >
                <svg fill="none" viewBox="0 0 24 24">
                  <path
                    d="M4.5 6.8c0-1.21.98-2.2 2.2-2.2h10.6c1.21 0 2.2.99 2.2 2.2v7.15c0 1.22-.99 2.2-2.2 2.2H10.1l-3.95 2.7v-2.7H6.7c-1.21 0-2.2-.98-2.2-2.2V6.8Z"
                    stroke="currentColor"
                    strokeLinejoin="round"
                    strokeWidth="1.7"
                  />
                  <path
                    d="M7.2 8.5h9.6"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="1.7"
                  />
                  <path
                    d="M7.2 11.7h6.2"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="1.7"
                  />
                </svg>
              </button>
            ) : null}

            {!isOgMode ? (
              <button
                aria-expanded={isWarningsOpen}
                aria-haspopup="dialog"
                className={`toolbar__warning-toggle${warningCount === 0 ? ' is-quiet' : ''}${isWarningsOpen ? ' is-active-tool' : ''}${isWarningPulse ? ' is-pulsing' : ''}`}
                data-testid="toolbar-warnings"
                onClick={() => {
                  const nextIsOpen = !isWarningsOpen

                  setHelpOpen(false)
                  setOpenToolbarMenu(undefined)
                  setWarningsOpen(nextIsOpen)

                  if (nextIsOpen && !selectedWarningId) {
                    setSelectedWarningId(filteredWarnings[0]?.id ?? warnings[0]?.id)
                  }
                }}
                ref={warningButtonRef}
                type="button"
              >
                Warnings {warningCount}
              </button>
            ) : null}

            {!isOgMode ? (
              <button
                aria-expanded={isHelpOpen}
                aria-haspopup="dialog"
                className={`toolbar__help-button${isHelpOpen ? ' is-active-tool' : ''}`}
                data-testid="toolbar-shortcuts"
                data-tour="toolbar-help"
                onClick={() => {
                  setWarningsOpen(false)
                  setOpenToolbarMenu(undefined)
                  setHelpOpen(!isHelpOpen)
                }}
                ref={helpButtonRef}
                type="button"
              >
                ?
              </button>
            ) : null}
          </div>
        </div>

        <div className="toolbar__row toolbar__row--secondary">
          <div className="toolbar__tool-dock" data-testid="toolbar-tool-dock">
            <div className="toolbar__tool-dock-cluster">
              <div
                onBlurCapture={(event) => {
                  const button = getAnnotationDockTooltipButton(event.target)

                  if (button) {
                    hideToolbarTooltip(button)
                  }
                }}
                onFocusCapture={(event) => {
                  const button = getAnnotationDockTooltipButton(event.target)
                  const label = button?.getAttribute('aria-label')

                  if (button && label) {
                    showToolbarTooltip(label, button)
                  }
                }}
                onMouseOut={(event) => {
                  const button = getAnnotationDockTooltipButton(event.target)
                  const nextButton = getAnnotationDockTooltipButton(event.relatedTarget)

                  if (button && button !== nextButton) {
                    hideToolbarTooltip(button)
                  }
                }}
                onMouseOver={(event) => {
                  const button = getAnnotationDockTooltipButton(event.target)
                  const label = button?.getAttribute('aria-label')

                  if (button && label) {
                    showToolbarTooltip(label, button)
                  }
                }}
              >
                {toolDock}
              </div>
              <button
                aria-label="Highlight"
                aria-pressed={activeTool === 'highlight'}
                className={`toolbar__icon-button toolbar__icon-button--highlight${activeTool === 'highlight' ? ' is-active' : ''}`}
                {...highlightTooltip}
                onClick={() => {
                  setHelpOpen(false)
                  setWarningsOpen(false)
                  setOpenToolbarMenu(undefined)
                  setTooltipTarget(null)
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
                {...labelsTooltip}
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

              <ToolbarIcon
                label="Reset view"
                {...resetViewTooltip}
                onClick={onResetView}
              >
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
                onClick={(event) => toggleToolbarMenu('canvas-tools', event)}
                {...canvasToolsTooltip}
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
              <ToolbarIcon
                disabled={!canUndo}
                label="Undo"
                {...undoTooltip}
                onClick={undo}
              >
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
              <ToolbarIcon
                disabled={!canRedo}
                label="Redo"
                {...redoTooltip}
                onClick={redo}
              >
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
      {suggestionsModal}
      {warningPopover}
      {menuPopover}
      {tooltipPortal}
    </>
  )
}

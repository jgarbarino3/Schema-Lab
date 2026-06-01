import { useEffect, useId, useMemo, useState } from 'react'
import { ModalShell } from './ModalShell'

interface BreadboardChoice {
  id: string
  label: string
  dimensionsLabel: string
}

interface ClearScopeSelection {
  clearComponents: boolean
  clearLines: boolean
  clearShapes: boolean
  clearText: boolean
}

interface ClearModalBaseState {
  confirmLabel: string
  description: string
  title: string
}

export type ClearModalState =
  | (ClearModalBaseState & {
      mode: 'single-breadboard'
      surfaceId: string
    })
  | (ClearModalBaseState & {
      mode: 'optical-table'
      surfaceId: string
    })
  | (ClearModalBaseState & {
      mode: 'select-breadboard'
      breadboards: BreadboardChoice[]
    })

interface ClearConfirmModalProps {
  isOpen: boolean
  onCancel: () => void
  onConfirm: (payload: ClearScopeSelection & { surfaceId: string }) => void
  state?: ClearModalState
}

const DEFAULT_CLEAR_SELECTION: ClearScopeSelection = {
  clearComponents: true,
  clearLines: true,
  clearShapes: true,
  clearText: true,
}

function ToggleButton({
  isActive,
  label,
  onClick,
}: {
  isActive: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      aria-pressed={isActive}
      className={isActive ? 'modal-shell__toggle is-active' : 'modal-shell__toggle'}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  )
}

export function ClearConfirmModal({
  isOpen,
  onCancel,
  onConfirm,
  state,
}: ClearConfirmModalProps) {
  const titleId = useId()
  const [selectedBreadboardId, setSelectedBreadboardId] = useState<string>()
  const [selection, setSelection] = useState<ClearScopeSelection>(DEFAULT_CLEAR_SELECTION)

  useEffect(() => {
    if (!isOpen || !state) {
      return
    }

    setSelection(DEFAULT_CLEAR_SELECTION)
    setSelectedBreadboardId(
      state.mode === 'select-breadboard' ? state.breadboards[0]?.id : undefined,
    )
  }, [isOpen, state])

  const resolvedSurfaceId = useMemo(() => {
    if (!state) {
      return undefined
    }

    if (state.mode === 'select-breadboard') {
      return selectedBreadboardId
    }

    return state.surfaceId
  }, [selectedBreadboardId, state])

  const selectedCount = Object.values(selection).filter(Boolean).length

  if (!isOpen || !state) {
    return null
  }

  return (
    <ModalShell ariaLabel={state.title} onClose={onCancel} titleId={titleId}>
        <div className="modal-shell__header">
          <h2 id={titleId}>{state.title}</h2>
          <p>{state.description}</p>
        </div>

        {state.mode === 'select-breadboard' ? (
          <div className="modal-shell__list">
            {state.breadboards.map((breadboard) => (
              <label className="modal-shell__list-item" key={breadboard.id}>
                <input
                  checked={selectedBreadboardId === breadboard.id}
                  name="clear-breadboard-choice"
                  onChange={() => setSelectedBreadboardId(breadboard.id)}
                  type="radio"
                />
                <span>
                  <strong>{breadboard.label}</strong>
                  <span>{breadboard.dimensionsLabel}</span>
                </span>
              </label>
            ))}
          </div>
        ) : null}

        <div className="modal-shell__subsection">
          <div className="modal-shell__subsection-head">
            <strong>Remove from this surface</strong>
            <div className="modal-shell__toggle-row">
              <button
                className="modal-shell__ghost"
                onClick={() => setSelection(DEFAULT_CLEAR_SELECTION)}
                type="button"
              >
                All
              </button>
              <button
                className="modal-shell__ghost"
                onClick={() =>
                  setSelection({
                    clearComponents: false,
                    clearLines: false,
                    clearShapes: false,
                    clearText: false,
                  })
                }
                type="button"
              >
                None
              </button>
            </div>
          </div>

          <div className="modal-shell__toggle-grid">
            <ToggleButton
              isActive={selection.clearComponents}
              label="Components"
              onClick={() =>
                setSelection((current) => ({
                  ...current,
                  clearComponents: !current.clearComponents,
                }))
              }
            />
            <ToggleButton
              isActive={selection.clearShapes}
              label="Shapes"
              onClick={() =>
                setSelection((current) => ({
                  ...current,
                  clearShapes: !current.clearShapes,
                }))
              }
            />
            <ToggleButton
              isActive={selection.clearText}
              label="Text"
              onClick={() =>
                setSelection((current) => ({
                  ...current,
                  clearText: !current.clearText,
                }))
              }
            />
            <ToggleButton
              isActive={selection.clearLines}
              label="Lines"
              onClick={() =>
                setSelection((current) => ({
                  ...current,
                  clearLines: !current.clearLines,
                }))
              }
            />
          </div>
        </div>

        <div className="modal-shell__actions">
          <button onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className="modal-shell__primary"
            disabled={!resolvedSurfaceId || selectedCount === 0}
            onClick={() => {
              if (!resolvedSurfaceId || selectedCount === 0) {
                return
              }

              onConfirm({
                surfaceId: resolvedSurfaceId,
                ...selection,
              })
            }}
            type="button"
          >
            {state.confirmLabel}
          </button>
        </div>
    </ModalShell>
  )
}

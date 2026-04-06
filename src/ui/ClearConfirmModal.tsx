import { useEffect, useState } from 'react'

interface BreadboardChoice {
  id: string
  label: string
  dimensionsLabel: string
}

export type ClearModalState =
  | { mode: 'confirm-clear-breadboard' }
  | { mode: 'select-breadboard'; breadboards: BreadboardChoice[] }
  | { mode: 'confirm-clear-table' }

interface ClearConfirmModalProps {
  isOpen: boolean
  state?: ClearModalState
  onCancel: () => void
  onClearBreadboard: (breadboardId?: string) => void
  onClearTable: () => void
}

export function ClearConfirmModal({
  isOpen,
  state,
  onCancel,
  onClearBreadboard,
  onClearTable,
}: ClearConfirmModalProps) {
  const [selectedBreadboardId, setSelectedBreadboardId] = useState<string>()

  useEffect(() => {
    if (!isOpen || !state || state.mode !== 'select-breadboard') {
      return
    }

    setSelectedBreadboardId(state.breadboards[0]?.id)
  }, [isOpen, state])

  if (!isOpen || !state) {
    return null
  }

  if (state.mode === 'confirm-clear-breadboard') {
    return (
      <div className="modal-shell" role="dialog" aria-modal="true" aria-label="Clear breadboard">
        <div className="modal-shell__backdrop" onClick={onCancel} />

        <div className="modal-shell__card">
          <div className="modal-shell__header">
            <h2>Clear Breadboard</h2>
            <p>
              This will remove all components from the breadboard. You can undo this action
              afterwards if needed.
            </p>
          </div>

          <div className="modal-shell__actions">
            <button onClick={onCancel} type="button">
              Cancel
            </button>
            <button
              className="modal-shell__primary"
              onClick={() => onClearBreadboard()}
              type="button"
            >
              Clear all components
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (state.mode === 'confirm-clear-table') {
    return (
      <div className="modal-shell" role="dialog" aria-modal="true" aria-label="Clear optical table">
        <div className="modal-shell__backdrop" onClick={onCancel} />

        <div className="modal-shell__card">
          <div className="modal-shell__header">
            <h2>Clear Optical Table</h2>
            <p>
              This will remove all components mounted directly on the optical table surface.
              Breadboard-mounted components will not be affected. You can undo this action
              afterwards if needed.
            </p>
          </div>

          <div className="modal-shell__actions">
            <button onClick={onCancel} type="button">
              Cancel
            </button>
            <button
              className="modal-shell__primary"
              onClick={onClearTable}
              type="button"
            >
              Clear table components
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true" aria-label="Clear breadboard">
      <div className="modal-shell__backdrop" onClick={onCancel} />

      <div className="modal-shell__card">
        <div className="modal-shell__header">
          <h2>Clear Breadboard</h2>
          <p>
            Select which breadboard to clear. All components on the chosen breadboard will
            be removed. You can undo this action afterwards if needed.
          </p>
        </div>

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

        <div className="modal-shell__actions">
          <button onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className="modal-shell__primary"
            disabled={!selectedBreadboardId}
            onClick={() => onClearBreadboard(selectedBreadboardId)}
            type="button"
          >
            Clear selected breadboard
          </button>
        </div>
      </div>
    </div>
  )
}

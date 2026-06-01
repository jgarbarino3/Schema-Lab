import { useEffect, useId, useState } from 'react'
import { ModalShell } from './ModalShell'

interface BreadboardChoice {
  id: string
  label: string
  dimensionsLabel: string
}

type WorkspaceModeModalState =
  {
      mode: 'to-single-breadboard'
      breadboards: BreadboardChoice[]
    }

interface WorkspaceModeModalProps {
  isOpen: boolean
  state?: WorkspaceModeModalState
  onCancel: () => void
  onConvertToSingleBreadboard: (args: {
    breadboardId?: string
    createFresh: boolean
    preserveSnapshot: boolean
  }) => void
}

export function WorkspaceModeModal({
  isOpen,
  state,
  onCancel,
  onConvertToSingleBreadboard,
}: WorkspaceModeModalProps) {
  const titleId = useId()
  const [selectedBreadboardId, setSelectedBreadboardId] = useState<string>()
  const [createFresh, setCreateFresh] = useState(false)
  const [preserveSnapshot, setPreserveSnapshot] = useState(true)

  useEffect(() => {
    if (!isOpen || !state || state.mode !== 'to-single-breadboard') {
      return
    }

    setSelectedBreadboardId(state.breadboards[0]?.id)
    setCreateFresh(false)
    setPreserveSnapshot(true)
  }, [isOpen, state])

  if (!isOpen || !state) {
    return null
  }

  return (
    <ModalShell
      ariaLabel="Switch to single breadboard mode"
      onClose={onCancel}
      titleId={titleId}
    >
        <div className="modal-shell__header">
          <h2 id={titleId}>Switch to Single Breadboard</h2>
          <p>
            Pick which breadboard to promote into the single-board workspace, or start from a
            fresh board. You can also keep the current optical-table workspace in this browser
            so you can restore it later.
          </p>
        </div>

        <div className="modal-shell__list">
          {state.breadboards.map((breadboard) => (
            <label className="modal-shell__list-item" key={breadboard.id}>
              <input
                checked={!createFresh && selectedBreadboardId === breadboard.id}
                name="breadboard-choice"
                onChange={() => {
                  setCreateFresh(false)
                  setSelectedBreadboardId(breadboard.id)
                }}
                type="radio"
              />
              <span>
                <strong>{breadboard.label}</strong>
                <span>{breadboard.dimensionsLabel}</span>
              </span>
            </label>
          ))}

          <label className="modal-shell__list-item">
            <input
              checked={createFresh}
              name="breadboard-choice"
              onChange={() => {
                setCreateFresh(true)
              }}
              type="radio"
            />
            <span>
              <strong>Create fresh breadboard</strong>
              <span>Start from the default board and leave table-mounted hardware behind.</span>
            </span>
          </label>

          <label className="modal-shell__list-item">
            <input
              checked={preserveSnapshot}
              onChange={(event) => setPreserveSnapshot(event.target.checked)}
              type="checkbox"
            />
            <span>
              <strong>Preserve current optical-table workspace</strong>
              <span>Save a browser-local snapshot so Table View can restore this layout later.</span>
            </span>
          </label>
        </div>

        <div className="modal-shell__actions">
          <button onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className="modal-shell__primary"
            onClick={() =>
              onConvertToSingleBreadboard({
                breadboardId: createFresh ? undefined : selectedBreadboardId,
                createFresh,
                preserveSnapshot,
              })
            }
            type="button"
          >
            Switch to single breadboard
          </button>
        </div>
    </ModalShell>
  )
}

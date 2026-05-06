interface TutorialModalProps {
  isOpen: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function TutorialModal({
  isOpen,
  onCancel,
  onConfirm,
}: TutorialModalProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true" aria-label="Load tutorial scene">
      <div className="modal-shell__backdrop" onClick={onCancel} />

      <div className="modal-shell__card modal-shell__card--tutorial">
        <div className="modal-shell__header">
          <h2>Load Tutorial Example</h2>
          <p>
            This replaces the current scene with a curated single-breadboard example that
            demonstrates a folded 800 nm sample line with attenuation, polarization control,
            a diagnostic pickoff, steering mirrors, cleanup optics, a mounted sample, and detector readout.
          </p>
        </div>

        <div className="modal-shell__list">
          <div className="modal-shell__list-item">
            <strong>What it adds</strong>
            <span>
              One active source, variable ND, half-wave plate, polarizer, diagnostic
              pickoff, two steering mirrors, a 150 mm lens, iris, sample holder with chip,
              and detectors.
            </span>
          </div>
          <div className="modal-shell__list-item">
            <strong>What it shows</strong>
            <span>
              A practical stepped breadboard path with a low-power monitor branch,
              deterministic beam routing, and readable power readouts.
            </span>
          </div>
        </div>

        <div className="modal-shell__actions">
          <button onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="modal-shell__primary" onClick={onConfirm} type="button">
            Replace with tutorial
          </button>
        </div>
      </div>
    </div>
  )
}

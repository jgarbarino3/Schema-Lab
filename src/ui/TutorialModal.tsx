import { useId } from 'react'
import { ModalShell } from './ModalShell'

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
  const titleId = useId()

  if (!isOpen) {
    return null
  }

  return (
    <ModalShell
      ariaLabel="Load tutorial scene"
      cardClassName="modal-shell__card modal-shell__card--tutorial"
      onClose={onCancel}
      titleId={titleId}
    >
        <div className="modal-shell__header">
          <h2 id={titleId}>Load Tutorial Example</h2>
          <p>
            This replaces the current scene with a curated single-breadboard example that
            demonstrates beam routing, attenuation, polarization control, delay scanning,
            curved-mirror / telescope Gaussian behavior, and BBO planning.
          </p>
        </div>

        <div className="modal-shell__list">
          <div className="modal-shell__list-item">
            <strong>What it adds</strong>
            <span>
              Two active sources, steering mirrors, a curved mirror, an attenuator,
              waveplate, polarizer, compact delay stage, reflective telescope, BBO crystal,
              and detectors.
            </span>
          </div>
          <div className="modal-shell__list-item">
            <strong>What it shows</strong>
            <span>
              Stage 2 deterministic geometry and power routing plus Stage 3 Gaussian
              beam evolution and delay-dependent path timing.
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
    </ModalShell>
  )
}

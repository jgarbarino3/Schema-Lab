import { useState } from 'react'
import type { SvgImportMode, SvgImportProfile } from '../domain/svgImport'

interface ConfirmPayload {
  mode: SvgImportMode
  profile: SvgImportProfile
  requireCalibration: boolean
}

interface SvgImportOptionsModalProps {
  fileName: string
  isOpen: boolean
  onCancel: () => void
  onConfirm: (payload: ConfirmPayload) => void
  scaleIsReliable: boolean
  scaleReason?: string
}

export function SvgImportOptionsModal(props: SvgImportOptionsModalProps) {
  const { fileName, isOpen, onCancel, onConfirm, scaleIsReliable, scaleReason } = props
  const [mode, setMode] = useState<SvgImportMode>('merge')
  const [profile, setProfile] = useState<SvgImportProfile>('guided')
  const [requireCalibration, setRequireCalibration] = useState(!scaleIsReliable)

  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true" aria-label="SVG import options">
      <button className="modal-shell__backdrop" onClick={onCancel} type="button" />
      <div className="modal-shell__card modal-shell__card--export svg-import-options">
        <header className="modal-shell__header">
          <h2>Import SVG</h2>
          <p>{fileName}</p>
        </header>

        <form className="modal-shell__form" onSubmit={(event) => event.preventDefault()}>
          <fieldset className="modal-shell__fieldset">
            <legend>Scene Action</legend>
            <label className="modal-shell__choice">
              <input
                checked={mode === 'merge'}
                name="svg-import-mode"
                onChange={() => setMode('merge')}
                type="radio"
              />
              <span>Merge into current scene</span>
            </label>
            <label className="modal-shell__choice">
              <input
                checked={mode === 'replace'}
                name="svg-import-mode"
                onChange={() => setMode('replace')}
                type="radio"
              />
              <span>Replace current scene</span>
            </label>
          </fieldset>

          <fieldset className="modal-shell__fieldset">
            <legend>Interpretation Profile</legend>
            <label className="modal-shell__choice">
              <input
                checked={profile === 'guided'}
                name="svg-import-profile"
                onChange={() => setProfile('guided')}
                type="radio"
              />
              <span>Guided mode (heuristics + review)</span>
            </label>
            <label className="modal-shell__choice">
              <input
                checked={profile === 'strict'}
                name="svg-import-profile"
                onChange={() => setProfile('strict')}
                type="radio"
              />
              <span>Strict mode (deterministic only)</span>
            </label>
          </fieldset>

          <fieldset className="modal-shell__fieldset">
            <legend>Scale Calibration</legend>
            <p className="modal-shell__hint">
              {scaleIsReliable
                ? 'Physical SVG units look reliable. Calibration is optional.'
                : scaleReason ?? 'SVG units are ambiguous. Calibration is strongly recommended.'}
            </p>
            <label className="modal-shell__choice">
              <input
                checked={requireCalibration}
                onChange={(event) => setRequireCalibration(event.target.checked)}
                type="checkbox"
              />
              <span>Run calibration before import</span>
            </label>
          </fieldset>
        </form>

        <footer className="modal-shell__actions">
          <button onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className="modal-shell__primary"
            onClick={() => onConfirm({ mode, profile, requireCalibration })}
            type="button"
          >
            Continue
          </button>
        </footer>
      </div>
    </div>
  )
}

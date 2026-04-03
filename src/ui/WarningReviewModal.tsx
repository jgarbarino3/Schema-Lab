import type { SceneWarning } from '../domain/types'

interface WarningReviewModalProps {
  exportLabel?: string
  isOpen: boolean
  onCancel: () => void
  onExportAnyway: () => void
  onReviewWarnings: () => void
  warnings: SceneWarning[]
}

function formatExportLabel(exportLabel?: string) {
  switch (exportLabel) {
    case 'scene-json':
      return 'Scene JSON'
    case 'full-scheme-png':
      return 'Full Scheme PNG'
    case 'full-scheme-pdf':
      return 'Full Scheme PDF'
    case 'breadboard-png':
      return 'Breadboard PNG'
    case 'breadboard-pdf':
      return 'Breadboard PDF'
    default:
      return 'Export'
  }
}

export function WarningReviewModal({
  exportLabel,
  isOpen,
  onCancel,
  onExportAnyway,
  onReviewWarnings,
  warnings,
}: WarningReviewModalProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true" aria-label="Review scene warnings">
      <div className="modal-shell__backdrop" onClick={onCancel} />

      <div className="modal-shell__card modal-shell__card--warning">
        <div className="modal-shell__header">
          <h2>
            Review Warnings Before {formatExportLabel(exportLabel)}
          </h2>
          <p>
            This scene still has {warnings.length} warning{warnings.length === 1 ? '' : 's'}.
            You can review them first or export anyway.
          </p>
        </div>

        <div className="modal-shell__list">
          {warnings.slice(0, 4).map((warning) => (
            <div className="modal-shell__list-item" key={warning.id}>
              <strong>{warning.message}</strong>
              <span>
                {warning.category} • {warning.severity}
              </span>
            </div>
          ))}
          {warnings.length > 4 ? (
            <p className="modal-shell__hint">
              {warnings.length - 4} more warning{warnings.length - 4 === 1 ? '' : 's'} in the warning center.
            </p>
          ) : null}
        </div>

        <div className="modal-shell__actions">
          <button onClick={onCancel} type="button">
            Cancel
          </button>
          <button onClick={onReviewWarnings} type="button">
            Review warnings
          </button>
          <button className="modal-shell__primary" onClick={onExportAnyway} type="button">
            Export anyway
          </button>
        </div>
      </div>
    </div>
  )
}

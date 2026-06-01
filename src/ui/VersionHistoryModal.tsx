import { useId } from 'react'
import {
  CURRENT_VERSION,
  VERSION_HISTORY,
} from '../content/versionHistory'
import { ModalShell } from './ModalShell'

interface VersionHistoryModalProps {
  isOpen: boolean
  onClose: () => void
}

export function VersionHistoryModal({
  isOpen,
  onClose,
}: VersionHistoryModalProps) {
  const titleId = useId()

  if (!isOpen) {
    return null
  }

  return (
    <ModalShell
      ariaLabel="Schema-Lab version history"
      cardClassName="modal-shell__card modal-shell__card--version-history"
      onClose={onClose}
      titleId={titleId}
    >
        <div className="modal-shell__header">
          <h2 id={titleId}>Schema-Lab Release History</h2>
        </div>

        <div className="version-history">
          {VERSION_HISTORY.map((entry) => {
            const isCurrent = entry.version === CURRENT_VERSION

            return (
              <article
                className={`version-history__entry${isCurrent ? ' is-current' : ''}`}
                key={entry.version}
              >
                <div className="version-history__entry-header">
                  <strong>{entry.version}</strong>
                  {isCurrent ? <span className="version-history__current-badge">Current</span> : null}
                </div>
                <p>{entry.summary}</p>
                {entry.highlights?.length ? (
                  <div className="version-history__highlights" aria-label={`${entry.version} highlights`}>
                    {entry.highlights.map((highlight) => (
                      <span className="version-history__highlight" key={highlight}>
                        {highlight}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>

        <div className="modal-shell__actions">
          <button className="modal-shell__primary" onClick={onClose} type="button">
            Close
          </button>
        </div>
    </ModalShell>
  )
}

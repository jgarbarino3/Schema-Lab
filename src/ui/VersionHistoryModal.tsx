import {
  CURRENT_VERSION,
  VERSION_HISTORY,
} from '../content/versionHistory'

interface VersionHistoryModalProps {
  isOpen: boolean
  onClose: () => void
}

export function VersionHistoryModal({
  isOpen,
  onClose,
}: VersionHistoryModalProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true" aria-label="Schema-Lab version history">
      <button
        aria-label="Close version history"
        className="modal-shell__backdrop"
        onClick={onClose}
        type="button"
      />

      <div className="modal-shell__card modal-shell__card--version-history">
        <div className="modal-shell__header">
          <h2>Schema-Lab Release History</h2>
          <p>
            Versions track meaningful milestones instead of every Git push. Most entries stay
            concise, while major releases can spell out the bigger workflow changes.
          </p>
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
      </div>
    </div>
  )
}

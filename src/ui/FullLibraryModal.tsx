import { useMemo, useState } from 'react'
import type { ComponentType } from '../domain/types'
import { ComponentCatalogPreview } from './ComponentCatalogPreview'
import {
  DISPLAY_GROUPS,
  FULL_LIBRARY_COMPONENT_ENTRIES,
  matchesLibraryQuery,
} from './componentLibraryCatalog'

interface FullLibraryModalProps {
  isOpen: boolean
  onArm: (type: ComponentType, variantId: string) => void
  onClose: () => void
}

export function FullLibraryModal({
  isOpen,
  onArm,
  onClose,
}: FullLibraryModalProps) {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()

  const groupedEntries = useMemo(() => {
    return DISPLAY_GROUPS.map((group) => ({
      ...group,
      entries: FULL_LIBRARY_COMPONENT_ENTRIES.filter((entry) => {
        if (!group.categories.includes(entry.category)) {
          return false
        }

        if (!normalizedQuery) {
          return true
        }

        return matchesLibraryQuery(entry.searchText, normalizedQuery)
      }),
    })).filter((group) => group.entries.length > 0)
  }, [normalizedQuery])

  if (!isOpen) {
    return null
  }

  return (
    <div
      className="modal-shell"
      data-testid="full-library-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Full component library"
    >
      <button className="modal-shell__backdrop" onClick={onClose} type="button" />
      <div className="modal-shell__card modal-shell__card--full-library">
        <div className="modal-shell__header">
          <div>
            <h2>Full Library</h2>
            <p>
              Browse every concrete component variant and compare Classic optics,
              Enhanced, and Realistic previews before arming placement.
            </p>
          </div>
        </div>

        <label className="full-library-modal__search">
          <span className="visually-hidden">Search full library</span>
          <input
            autoComplete="off"
            data-testid="full-library-search"
            name="full-library-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search variants, vendors, SKUs, mounts, and descriptions…"
            type="search"
            value={query}
          />
        </label>

        <div className="full-library-modal__legend" aria-hidden="true">
          <span>Classic optics</span>
          <span>Enhanced</span>
          <span>Realistic</span>
        </div>

        <div className="full-library-modal__content">
          {groupedEntries.length === 0 ? (
            <div className="full-library-modal__empty">No matching components.</div>
          ) : (
            groupedEntries.map((group) => (
              <section className="full-library-modal__group" key={group.key}>
                <div className="full-library-modal__group-header">
                  <h3>{group.label}</h3>
                  <span>{group.entries.length}</span>
                </div>
                <div className="full-library-modal__group-body">
                  {group.entries.map((entry) => (
                    <article
                      className="full-library-modal__row"
                      data-testid={entry.testId}
                      key={entry.key}
                    >
                      <div className="full-library-modal__copy">
                        <div className="full-library-modal__copy-top">
                          <strong>{entry.title}</strong>
                          <span>{entry.familyLabel}</span>
                        </div>
                        {(entry.vendor || entry.sku) ? (
                          <p className="full-library-modal__meta">
                            {[entry.vendor, entry.sku].filter(Boolean).join(' • ')}
                          </p>
                        ) : null}
                        {entry.description ? (
                          <p className="full-library-modal__description">
                            {entry.description}
                          </p>
                        ) : null}
                      </div>

                      <div className="full-library-modal__previews">
                        <div
                          className="full-library-modal__preview-cell"
                          data-testid={`${entry.testId}-preview-classic`}
                        >
                          <ComponentCatalogPreview
                            className="full-library-modal__preview"
                            renderMode="simple"
                            simpleIconStyle="classic"
                            type={entry.type}
                            variantId={entry.variantId ?? entry.key}
                          />
                        </div>
                        <div
                          className="full-library-modal__preview-cell"
                          data-testid={`${entry.testId}-preview-enhanced`}
                        >
                          <ComponentCatalogPreview
                            className="full-library-modal__preview"
                            renderMode="simple"
                            simpleIconStyle="enhanced"
                            type={entry.type}
                            variantId={entry.variantId ?? entry.key}
                          />
                        </div>
                        <div
                          className="full-library-modal__preview-cell"
                          data-testid={`${entry.testId}-preview-realistic`}
                        >
                          <ComponentCatalogPreview
                            className="full-library-modal__preview"
                            renderMode="realistic"
                            type={entry.type}
                            variantId={entry.variantId ?? entry.key}
                          />
                        </div>
                      </div>

                      <div className="full-library-modal__actions">
                        <button
                          className="modal-shell__primary"
                          data-testid={`${entry.testId}-arm`}
                          onClick={() => onArm(entry.type, entry.variantId ?? entry.key)}
                          type="button"
                        >
                          Arm
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        <div className="modal-shell__actions">
          <button
            className="modal-shell__ghost"
            data-testid="full-library-close"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

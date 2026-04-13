import { useMemo, useState } from 'react'
import type { ComponentType } from '../domain/types'
import {
  DISPLAY_GROUPS,
  FULL_LIBRARY_COMPONENT_ENTRIES,
  getDisplayGroupForCategory,
  matchesLibraryQuery,
} from './componentLibraryCatalog'

interface SvgImportVariantChooserProps {
  onSelect: (selection: { componentType: ComponentType; variantId?: string }) => void
  selectedComponentType?: ComponentType
  selectedVariantId?: string
}

export function SvgImportVariantChooser(props: SvgImportVariantChooserProps) {
  const { onSelect, selectedComponentType, selectedVariantId } = props
  const [query, setQuery] = useState('')
  const groupedEntries = useMemo(() => {
    const filtered = FULL_LIBRARY_COMPONENT_ENTRIES.filter((entry) => {
      if (!query.trim()) {
        return true
      }

      return (
        matchesLibraryQuery(entry.searchText, query) ||
        matchesLibraryQuery(entry.title, query) ||
        matchesLibraryQuery(entry.familyLabel, query)
      )
    })

    return DISPLAY_GROUPS.map((group) => ({
      ...group,
      entries: filtered.filter((entry) => getDisplayGroupForCategory(entry.category) === group.key),
    })).filter((group) => group.entries.length > 0)
  }, [query])

  return (
    <fieldset className="modal-shell__fieldset">
      <legend>Exact Variant</legend>
      <label className="svg-import-field">
        Search variants
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search family, SKU, or variant"
          type="search"
          value={query}
        />
      </label>
      <div style={{ display: 'grid', gap: 8, marginTop: 8, maxHeight: 280, overflowY: 'auto' }}>
        {groupedEntries.map((group) => (
          <details key={group.key} open>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{group.label}</summary>
            <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
              {group.entries.map((entry) => {
                const isActive =
                  entry.type === selectedComponentType &&
                  (entry.variantId ?? '') === (selectedVariantId ?? '')

                return (
                  <button
                    className={isActive ? 'is-active-tool' : undefined}
                    key={entry.key}
                    onClick={() =>
                      onSelect({
                        componentType: entry.type,
                        variantId: entry.variantId,
                      })
                    }
                    style={{ justifyContent: 'space-between', textAlign: 'left' }}
                    type="button"
                  >
                    <span>{entry.title}</span>
                    <span style={{ opacity: 0.72 }}>{entry.familyLabel}</span>
                  </button>
                )
              })}
            </div>
          </details>
        ))}
      </div>
    </fieldset>
  )
}

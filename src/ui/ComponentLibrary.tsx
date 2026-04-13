import { useEffect, useMemo, useState } from 'react'
import { BREADBOARD_PRESETS } from '../domain/breadboardPresets'
import { COMPONENT_DEFINITIONS } from '../domain/componentCatalog'
import { useEditorStore } from '../state/editorStore'
import { LibraryGlyphPreview } from './LibraryGlyphPreview'
import {
  buildCompactLibraryComponentEntries,
  DISPLAY_GROUPS,
  getDisplayGroupForCategory,
  type LibraryComponentEntry,
  matchesLibraryQuery,
} from './componentLibraryCatalog'
import {
  LIBRARY_RECENTS_CLEAR_EVENT,
  MAX_RECENT_ITEMS,
  RECENT_PREVIEW_COUNT,
  readRecentEntries,
  type RecentEntry,
  writeRecentEntries,
} from './libraryRecents'

interface ComponentLibraryProps {
  onCollapse: () => void
  onOpenFullLibrary: () => void
}

export function ComponentLibrary({
  onCollapse,
  onOpenFullLibrary,
}: ComponentLibraryProps) {
  const addComponent = useEditorStore((state) => state.addComponent)
  const addBreadboardInstance = useEditorStore((state) => state.addBreadboardInstance)
  const simpleIconStyle = useEditorStore((state) => state.simpleIconStyle)
  const workspaceKind = useEditorStore((state) => state.scene.workspace.kind)
  const pendingPlacementType = useEditorStore(
    (state) => state.interaction.pendingPlacement?.draft.type,
  )
  const pendingPlacementVariantId = useEditorStore(
    (state) => state.interaction.pendingPlacement?.draft.variantId,
  )
  const pendingBreadboardPresetId = useEditorStore(
    (state) => state.interaction.pendingBreadboardPlacement?.presetId,
  )
  const [query, setQuery] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set())
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>(() => readRecentEntries())
  const [isRecentExpanded, setIsRecentExpanded] = useState(false)

  const allComponentEntries = useMemo(
    () => COMPONENT_DEFINITIONS.flatMap(buildCompactLibraryComponentEntries),
    [],
  )
  const groupedDefinitions = useMemo(() => {
    const map = new Map<string, LibraryComponentEntry[]>()
    for (const group of DISPLAY_GROUPS) {
      const definitions = allComponentEntries.filter((entry) =>
        group.categories.includes(entry.category),
      )
      if (definitions.length > 0) {
        map.set(group.key, definitions)
      }
    }
    return map
  }, [allComponentEntries])

  const armedGroupKey = pendingPlacementType
    ? getDisplayGroupForCategory(
        COMPONENT_DEFINITIONS.find((definition) => definition.type === pendingPlacementType)
          ?.category!,
      )
    : undefined
  const normalizedQuery = query.trim().toLowerCase()
  const isSearchActive = normalizedQuery.length > 0

  useEffect(() => {
    if (armedGroupKey && !expandedGroups.has(armedGroupKey)) {
      setExpandedGroups((previous) => new Set([...previous, armedGroupKey]))
    }
  }, [armedGroupKey, expandedGroups])

  useEffect(() => {
    if (pendingBreadboardPresetId && !expandedGroups.has('__breadboards')) {
      setExpandedGroups((previous) => new Set([...previous, '__breadboards']))
    }
  }, [expandedGroups, pendingBreadboardPresetId])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const handleClear = () => {
      setRecentEntries(readRecentEntries())
      setIsRecentExpanded(false)
    }

    window.addEventListener(LIBRARY_RECENTS_CLEAR_EVENT, handleClear)

    return () => {
      window.removeEventListener(LIBRARY_RECENTS_CLEAR_EVENT, handleClear)
    }
  }, [])

  const isComponentEntryArmed = (entry: LibraryComponentEntry) => {
    if (pendingPlacementType !== entry.type) {
      return false
    }

    if (entry.variantId) {
      return pendingPlacementVariantId === entry.variantId
    }

    return entry.type !== 'mirror' || pendingPlacementVariantId !== 'flip-mirror'
  }

  const rememberRecent = (entry: RecentEntry) => {
    setRecentEntries((previous) => {
      const next = [
        entry,
        ...previous.filter((item) => {
          if (item.kind !== entry.kind || item.id !== entry.id) {
            return true
          }

          return item.kind !== 'component' || entry.kind !== 'component'
            ? false
            : item.variantId !== entry.variantId
        }),
      ].slice(0, MAX_RECENT_ITEMS)
      writeRecentEntries(next)
      return next
    })
  }

  const toggleGroup = (key: string) => {
    setExpandedGroups((previous) => {
      const next = new Set(previous)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const recentCards = useMemo(() => {
    const breadboardCatalogPreset = BREADBOARD_PRESETS[0]

    return recentEntries
      .map((entry) => {
        if (entry.kind === 'breadboard') {
          if (!breadboardCatalogPreset) {
            return undefined
          }

          return {
            armed: Boolean(pendingBreadboardPresetId),
            id: `breadboard-${breadboardCatalogPreset.id}`,
            label: 'Customizable Breadboard',
            meta: `${breadboardCatalogPreset.breadboard.widthMm.toFixed(0)} × ${breadboardCatalogPreset.breadboard.heightMm.toFixed(0)}`,
            onClick: () => {
              rememberRecent({ kind: 'breadboard', id: breadboardCatalogPreset.id })
              addBreadboardInstance(breadboardCatalogPreset.id)
            },
            preview: (
              <LibraryGlyphPreview
                breadboard={breadboardCatalogPreset.breadboard}
                className="component-library__preview component-library__preview--compact"
                kind="breadboard"
                style={simpleIconStyle}
              />
            ),
            testId: `library-recent-breadboard-${breadboardCatalogPreset.id}`,
          }
        }

        const definition = COMPONENT_DEFINITIONS.find(
          (candidate) => candidate.type === entry.id,
        )
        if (!definition) {
          return undefined
        }

        const componentEntry = allComponentEntries.find(
          (candidate) =>
            candidate.type === definition.type &&
            candidate.variantId === entry.variantId,
        ) ??
          allComponentEntries.find(
            (candidate) =>
              candidate.type === definition.type && candidate.variantId === undefined,
          )
        if (!componentEntry) {
          return undefined
        }

        return {
          armed: isComponentEntryArmed(componentEntry),
          id: `component-${componentEntry.key}`,
          label: componentEntry.recentLabel,
          meta: undefined,
          onClick: () => {
            rememberRecent({
              kind: 'component',
              id: componentEntry.type,
              variantId: componentEntry.variantId,
            })
            addComponent(componentEntry.type, componentEntry.variantId)
          },
          preview: (
            <LibraryGlyphPreview
              className="component-library__preview component-library__preview--compact"
              fill={componentEntry.previewFill}
              glyph={componentEntry.previewGlyph}
              isConvex={componentEntry.previewIsConvex}
              kind="component"
              stroke={componentEntry.previewStroke}
              style={simpleIconStyle}
            />
          ),
          testId:
            componentEntry.variantId === 'flip-mirror'
              ? 'library-recent-component-flip-mirror'
              : `library-recent-component-${componentEntry.type}`,
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => !!entry)
  }, [
    allComponentEntries,
    addBreadboardInstance,
    addComponent,
    pendingBreadboardPresetId,
    pendingPlacementType,
    pendingPlacementVariantId,
    recentEntries,
    simpleIconStyle,
  ])
  const visibleRecentCards = isRecentExpanded
    ? recentCards
    : recentCards.slice(0, RECENT_PREVIEW_COUNT)
  const hasOverflowRecentCards = recentCards.length > RECENT_PREVIEW_COUNT
  const breadboardCatalogPreset = BREADBOARD_PRESETS[0]
  const breadboardCatalogLabel = breadboardCatalogPreset
    ? `Customizable Breadboard · ${breadboardCatalogPreset.breadboard.widthMm.toFixed(0)} × ${breadboardCatalogPreset.breadboard.heightMm.toFixed(0)}`
    : 'Customizable Breadboard'

  return (
    <aside className="panel component-library" data-tour="component-library">
      <div className="panel__header">
        <div className="panel__header-top">
          <div>
            <h2>Component library</h2>
          </div>
          <button
            aria-label="Collapse library"
            className="panel__collapse-chevron panel__collapse-chevron--left"
            data-tour="panel-library-toggle"
            onClick={onCollapse}
            type="button"
          >
            <svg fill="none" viewBox="0 0 24 24">
              <path
                d="M15 6l-6 6 6 6"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
          </button>
        </div>
        <label className="component-library__search">
          <span className="visually-hidden">Search components</span>
          <input
            autoComplete="off"
            data-testid="library-search"
            name="library-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search optics, mounts, breadboards…"
            type="search"
            value={query}
          />
        </label>
      </div>

      <div className="component-library__groups">
        {recentCards.length > 0 ? (
          <section className="component-library__group component-library__group--recent">
            <div className="component-library__group-header is-static">
              <h3>Recent</h3>
            </div>
            <div className="component-library__group-body is-open">
              {visibleRecentCards.map((entry) => (
                <button
                  className={`component-library__item component-library__item--recent${entry.armed ? ' is-armed' : ''}`}
                  data-testid={entry.testId}
                  key={entry.id}
                  onClick={entry.onClick}
                  type="button"
                >
                  {entry.preview}
                  <span className="component-library__item-copy">
                    <span className="component-library__item-title">{entry.label}</span>
                    {entry.meta ? (
                      <span className="component-library__item-meta">{entry.meta}</span>
                    ) : null}
                  </span>
                  {entry.armed ? (
                    <span className="component-library__item-state">Armed</span>
                  ) : null}
                </button>
              ))}
              {hasOverflowRecentCards ? (
                <button
                  className="component-library__recent-toggle"
                  data-testid="library-recent-toggle"
                  onClick={() => setIsRecentExpanded((current) => !current)}
                  type="button"
                >
                  {isRecentExpanded ? 'Show less' : `Show ${recentCards.length - RECENT_PREVIEW_COUNT} more`}
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {workspaceKind === 'optical-table' ? (
          <section className="component-library__group" data-testid="library-group-breadboards">
            <button
              className="component-library__group-header"
              onClick={() => toggleGroup('__breadboards')}
              type="button"
            >
              <span className="component-library__chevron">
                {isSearchActive || expandedGroups.has('__breadboards') ? '\u25BE' : '\u25B8'}
              </span>
              <h3>Breadboards</h3>
              <span className="component-library__badge">1</span>
            </button>

            {(isSearchActive || expandedGroups.has('__breadboards')) && breadboardCatalogPreset ? (
              <div className="component-library__group-body is-open">
                {(!isSearchActive ||
                  matchesLibraryQuery(
                    `${breadboardCatalogLabel} breadboard preset optical table custom`,
                    normalizedQuery,
                  ) ||
                  Boolean(pendingBreadboardPresetId)) ? (
                  <button
                    className={`component-library__item${pendingBreadboardPresetId ? ' is-armed' : ''}`}
                    data-testid={`library-item-breadboard-${breadboardCatalogPreset.id}`}
                    onClick={() => {
                      rememberRecent({ kind: 'breadboard', id: breadboardCatalogPreset.id })
                      addBreadboardInstance(breadboardCatalogPreset.id)
                    }}
                    type="button"
                  >
                    <LibraryGlyphPreview
                      breadboard={breadboardCatalogPreset.breadboard}
                      className="component-library__preview"
                      kind="breadboard"
                      style={simpleIconStyle}
                    />
                    <span className="component-library__item-copy">
                      <span className="component-library__item-title">{breadboardCatalogLabel}</span>
                    </span>
                    {pendingBreadboardPresetId ? (
                      <span className="component-library__item-state">Armed</span>
                    ) : null}
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {DISPLAY_GROUPS.map((group) => {
          const entries = groupedDefinitions.get(group.key)
          if (!entries) {
            return null
          }

          const visibleDefinitions = entries.filter((entry) => {
            if (!isSearchActive) {
              return true
            }

            return (
              matchesLibraryQuery(entry.searchText, normalizedQuery) ||
              isComponentEntryArmed(entry)
            )
          })

          if (isSearchActive && visibleDefinitions.length === 0) {
            return null
          }

          const isExpanded = isSearchActive || expandedGroups.has(group.key)

          return (
            <section
              className="component-library__group"
              data-testid={`library-group-${group.key}`}
              key={group.key}
            >
              <button
                className="component-library__group-header"
                onClick={() => toggleGroup(group.key)}
                type="button"
              >
                <span className="component-library__chevron">
                  {isExpanded ? '\u25BE' : '\u25B8'}
                </span>
                <h3>{group.label}</h3>
                <span className="component-library__badge">
                  {visibleDefinitions.length}
                </span>
              </button>

              {isExpanded ? (
                <div className="component-library__group-body is-open">
                  {visibleDefinitions.map((entry) => (
                    <button
                      className={`component-library__item${isComponentEntryArmed(entry) ? ' is-armed' : ''}`}
                      data-testid={entry.testId}
                      key={entry.key}
                      onClick={() => {
                        rememberRecent({
                          kind: 'component',
                          id: entry.type,
                          variantId: entry.variantId,
                        })
                        addComponent(entry.type, entry.variantId)
                      }}
                      type="button"
                    >
                      <LibraryGlyphPreview
                        className="component-library__preview"
                        fill={entry.previewFill}
                        glyph={entry.previewGlyph}
                        isConvex={entry.previewIsConvex}
                        kind="component"
                        stroke={entry.previewStroke}
                        style={simpleIconStyle}
                      />
                      <span className="component-library__item-copy">
                        <span className="component-library__item-title">
                          {entry.familyLabel}
                          <span className="component-library__item-title-meta">
                            {' '}
                            · {entry.variantCount} var.
                          </span>
                        </span>
                      </span>
                      {isComponentEntryArmed(entry) ? (
                        <span className="component-library__item-state">Armed</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          )
        })}

        {isSearchActive &&
        recentCards.length === 0 &&
        !matchesLibraryQuery(breadboardCatalogLabel, normalizedQuery) &&
        !allComponentEntries.some((entry) =>
          matchesLibraryQuery(entry.searchText, normalizedQuery),
        ) ? (
          <div className="component-library__empty">
            No matching components.
          </div>
        ) : null}
      </div>
      <div className="component-library__footer">
        <button
          className="component-library__footer-button"
          data-testid="library-open-full"
          onClick={onOpenFullLibrary}
          type="button"
        >
          Full Library
        </button>
      </div>
    </aside>
  )
}

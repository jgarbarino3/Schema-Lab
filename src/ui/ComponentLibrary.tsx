import { useEffect, useMemo, useState } from 'react'
import { BREADBOARD_PRESETS } from '../domain/breadboardPresets'
import { COMPONENT_DEFINITIONS } from '../domain/componentCatalog'
import type { ComponentCategory, ComponentDefinition } from '../domain/types'
import { useEditorStore } from '../state/editorStore'

const RECENT_LIBRARY_KEY = 'schema-lab.ui.library-recent'
const MAX_RECENT_ITEMS = 6
const RECENT_PREVIEW_COUNT = 3

interface ComponentLibraryProps {
  onCollapse: () => void
}

interface DisplayGroup {
  key: string
  label: string
  categories: ComponentCategory[]
}

type RecentEntry =
  | { kind: 'breadboard'; id: string }
  | { kind: 'component'; id: string }

const DISPLAY_GROUPS: DisplayGroup[] = [
  { key: 'sources', label: 'Sources', categories: ['source'] },
  { key: 'beam-steering', label: 'Beam steering', categories: ['steering', 'splitting'] },
  { key: 'beam-control', label: 'Beam control', categories: ['attenuation', 'conditioning', 'aperture'] },
  { key: 'focusing-shaping', label: 'Focusing & shaping', categories: ['focusing', 'nonlinear', 'coupling'] },
  { key: 'sample-delay', label: 'Sample & delay', categories: ['sample'] },
  { key: 'measurement', label: 'Measurement', categories: ['measurement', 'termination'] },
  { key: 'mounting', label: 'Mounting', categories: ['mounting'] },
]

function describeMountMode(mode: string) {
  switch (mode) {
    case 'external-source':
      return 'launch edge'
    case 'hole-mounted':
      return 'hole mounted'
    case 'clamp-capable':
      return 'clamp capable'
    default:
      return mode
  }
}

function getDisplayGroupForCategory(category: ComponentCategory): string | undefined {
  return DISPLAY_GROUPS.find((group) => group.categories.includes(category))?.key
}

function readRecentEntries() {
  if (typeof window === 'undefined') {
    return [] as RecentEntry[]
  }

  try {
    const rawValue = window.localStorage.getItem(RECENT_LIBRARY_KEY)
    if (!rawValue) {
      return [] as RecentEntry[]
    }

    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) {
      return [] as RecentEntry[]
    }

    return parsed.filter(
      (entry): entry is RecentEntry =>
        !!entry &&
        typeof entry === 'object' &&
        ((entry.kind === 'breadboard' && typeof entry.id === 'string') ||
          (entry.kind === 'component' && typeof entry.id === 'string')),
    )
  } catch {
    return [] as RecentEntry[]
  }
}

function writeRecentEntries(entries: RecentEntry[]) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(RECENT_LIBRARY_KEY, JSON.stringify(entries))
}

function matchesQuery(value: string, query: string) {
  return value.toLowerCase().includes(query.toLowerCase())
}

function getRecentComponentLabel(definition: ComponentDefinition) {
  return definition.defaultLabel
}

export function ComponentLibrary({ onCollapse }: ComponentLibraryProps) {
  const addComponent = useEditorStore((state) => state.addComponent)
  const addBreadboardInstance = useEditorStore((state) => state.addBreadboardInstance)
  const workspaceKind = useEditorStore((state) => state.scene.workspace.kind)
  const pendingPlacementType = useEditorStore(
    (state) => state.interaction.pendingPlacement?.draft.type,
  )
  const pendingBreadboardPresetId = useEditorStore(
    (state) => state.interaction.pendingBreadboardPlacement?.presetId,
  )
  const [query, setQuery] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set())
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>(() => readRecentEntries())
  const [isRecentExpanded, setIsRecentExpanded] = useState(false)

  const groupedDefinitions = useMemo(() => {
    const map = new Map<string, ComponentDefinition[]>()
    for (const group of DISPLAY_GROUPS) {
      const definitions = COMPONENT_DEFINITIONS.filter((definition) =>
        group.categories.includes(definition.category),
      )
      if (definitions.length > 0) {
        map.set(group.key, definitions)
      }
    }
    return map
  }, [])

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

  const rememberRecent = (entry: RecentEntry) => {
    setRecentEntries((previous) => {
      const next = [entry, ...previous.filter((item) => item.kind !== entry.kind || item.id !== entry.id)].slice(
        0,
        MAX_RECENT_ITEMS,
      )
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
    return recentEntries
      .map((entry) => {
        if (entry.kind === 'breadboard') {
          const preset = BREADBOARD_PRESETS.find((candidate) => candidate.id === entry.id)
          if (!preset) {
            return undefined
          }

          return {
            armed: pendingBreadboardPresetId === preset.id,
            id: `breadboard-${preset.id}`,
            label: preset.label,
            meta: 'Breadboard preset · optical table',
            onClick: () => {
              rememberRecent({ kind: 'breadboard', id: preset.id })
              addBreadboardInstance(preset.id)
            },
            testId: `library-recent-breadboard-${preset.id}`,
          }
        }

        const definition = COMPONENT_DEFINITIONS.find(
          (candidate) => candidate.type === entry.id,
        )
        if (!definition) {
          return undefined
        }

        return {
          armed: pendingPlacementType === definition.type,
          id: `component-${definition.type}`,
          label: getRecentComponentLabel(definition),
          meta: undefined,
          onClick: () => {
            rememberRecent({ kind: 'component', id: definition.type })
            addComponent(definition.type)
          },
          testId: `library-recent-component-${definition.type}`,
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => !!entry)
  }, [
    addBreadboardInstance,
    addComponent,
    pendingBreadboardPresetId,
    pendingPlacementType,
    recentEntries,
  ])
  const visibleRecentCards = isRecentExpanded
    ? recentCards
    : recentCards.slice(0, RECENT_PREVIEW_COUNT)
  const hasOverflowRecentCards = recentCards.length > RECENT_PREVIEW_COUNT

  return (
    <aside className="panel component-library" data-tour="component-library">
      <div className="panel__header">
        <div className="panel__header-top">
          <div>
            <h2>Component library</h2>
          </div>
          <button
            className="panel__collapse-button"
            data-tour="panel-library-toggle"
            onClick={onCollapse}
            type="button"
          >
            Collapse
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
                  <span className="component-library__item-title">{entry.label}</span>
                  {entry.meta ? (
                    <span className="component-library__item-meta">{entry.meta}</span>
                  ) : null}
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
              <span className="component-library__badge">{BREADBOARD_PRESETS.length}</span>
            </button>

            {isSearchActive || expandedGroups.has('__breadboards') ? (
              <div className="component-library__group-body is-open">
                <p className="component-library__group-note">
                  Every breadboard preset can be customized after placement.
                </p>
                {BREADBOARD_PRESETS.filter((preset) => {
                  if (!isSearchActive) {
                    return true
                  }

                  const haystack = `${preset.label} breadboard preset optical table`
                  return (
                    matchesQuery(haystack, normalizedQuery) ||
                    pendingBreadboardPresetId === preset.id
                  )
                }).map((preset) => (
                  <button
                    className={`component-library__item${pendingBreadboardPresetId === preset.id ? ' is-armed' : ''}`}
                    data-testid={`library-item-breadboard-${preset.id}`}
                    key={preset.id}
                    onClick={() => {
                      rememberRecent({ kind: 'breadboard', id: preset.id })
                      addBreadboardInstance(preset.id)
                    }}
                    type="button"
                  >
                    <span className="component-library__item-title">{preset.label}</span>
                    <span className="component-library__item-meta">
                      Breadboard preset · optical table
                    </span>
                    {pendingBreadboardPresetId === preset.id ? (
                      <span className="component-library__item-state">Armed</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {DISPLAY_GROUPS.map((group) => {
          const definitions = groupedDefinitions.get(group.key)
          if (!definitions) {
            return null
          }

          const visibleDefinitions = definitions.filter((definition) => {
            if (!isSearchActive) {
              return true
            }

            const haystack = [
              definition.familyLabel,
              definition.category,
              describeMountMode(definition.mount.mode),
            ].join(' ')

            return (
              matchesQuery(haystack, normalizedQuery) ||
              pendingPlacementType === definition.type
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
                  {visibleDefinitions.map((definition) => (
                    <button
                      className={`component-library__item${pendingPlacementType === definition.type ? ' is-armed' : ''}`}
                      data-testid={`library-item-${definition.type}`}
                      key={definition.type}
                      onClick={() => {
                        rememberRecent({ kind: 'component', id: definition.type })
                        addComponent(definition.type)
                      }}
                      type="button"
                    >
                      <span className="component-library__item-title">
                        {definition.familyLabel}
                      </span>
                      <span className="component-library__item-meta">
                        {definition.variants.length} variant
                        {definition.variants.length === 1 ? '' : 's'} ·{' '}
                        {describeMountMode(definition.mount.mode)}
                      </span>
                      {pendingPlacementType === definition.type ? (
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
        !BREADBOARD_PRESETS.some((preset) =>
          matchesQuery(`${preset.label} breadboard`, normalizedQuery),
        ) &&
        !COMPONENT_DEFINITIONS.some((definition) =>
          matchesQuery(
            `${definition.familyLabel} ${definition.category} ${describeMountMode(definition.mount.mode)}`,
            normalizedQuery,
          ),
        ) ? (
          <div className="component-library__empty">
            No matching components.
          </div>
        ) : null}
      </div>
    </aside>
  )
}

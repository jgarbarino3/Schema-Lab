import { useState, useEffect, useMemo } from 'react'
import {
  COMPONENT_DEFINITIONS,
} from '../domain/componentCatalog'
import type { ComponentCategory, ComponentDefinition } from '../domain/types'
import { BREADBOARD_PRESETS } from '../domain/breadboardPresets'
import { useEditorStore } from '../state/editorStore'

const LINE_COLOR_PRESETS = [
  { color: '#ff0000', label: 'Red' },
  { color: '#00ff00', label: 'Green' },
  { color: '#0088ff', label: 'Blue' },
  { color: '#ffee00', label: 'Yellow' },
  { color: '#ff00ff', label: 'Magenta' },
  { color: '#00eeff', label: 'Cyan' },
  { color: '#ff8800', label: 'Orange' },
  { color: '#ffffff', label: 'White' },
]

interface ComponentLibraryProps {
  onCollapse: () => void
}

interface DisplayGroup {
  key: string
  label: string
  categories: ComponentCategory[]
}

const DISPLAY_GROUPS: DisplayGroup[] = [
  { key: 'sources', label: 'Sources', categories: ['source'] },
  { key: 'beam-steering', label: 'Beam Steering', categories: ['steering', 'splitting'] },
  { key: 'beam-control', label: 'Beam Control', categories: ['attenuation', 'conditioning', 'aperture'] },
  { key: 'focusing-shaping', label: 'Focusing & Shaping', categories: ['focusing', 'nonlinear', 'coupling'] },
  { key: 'sample-delay', label: 'Sample & Delay', categories: ['sample'] },
  { key: 'measurement', label: 'Measurement', categories: ['measurement', 'termination'] },
  { key: 'mounting', label: 'Mounting', categories: ['mounting'] },
]

function describeMountMode(mode: string) {
  switch (mode) {
    case 'external-source':
      return 'source lane'
    case 'hole-mounted':
      return 'hole mounted'
    case 'clamp-capable':
      return 'clamp capable'
    default:
      return mode
  }
}

function getDisplayGroupForCategory(category: ComponentCategory): string | undefined {
  return DISPLAY_GROUPS.find((g) => g.categories.includes(category))?.key
}

export function ComponentLibrary({ onCollapse }: ComponentLibraryProps) {
  const addComponent = useEditorStore((state) => state.addComponent)
  const addBreadboardInstance = useEditorStore((state) => state.addBreadboardInstance)
  const workspaceKind = useEditorStore((state) => state.scene.workspace.kind)
  const activeTool = useEditorStore((state) => state.interaction.activeTool)
  const lineColor = useEditorStore((state) => state.interaction.lineColor)
  const setActiveTool = useEditorStore((state) => state.setActiveTool)
  const setLineColor = useEditorStore((state) => state.setLineColor)
  const pendingPlacementType = useEditorStore(
    (state) => state.interaction.pendingPlacement?.draft.type,
  )
  const pendingBreadboardPresetId = useEditorStore(
    (state) => state.interaction.pendingBreadboardPlacement?.presetId,
  )

  const groupedDefinitions = useMemo(() => {
    const map = new Map<string, ComponentDefinition[]>()
    for (const group of DISPLAY_GROUPS) {
      const defs = COMPONENT_DEFINITIONS.filter((d) =>
        group.categories.includes(d.category),
      )
      if (defs.length > 0) {
        map.set(group.key, defs)
      }
    }
    return map
  }, [])

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set<string>(),
  )

  const armedGroupKey = pendingPlacementType
    ? getDisplayGroupForCategory(
        COMPONENT_DEFINITIONS.find((d) => d.type === pendingPlacementType)?.category!,
      )
    : undefined

  useEffect(() => {
    if (armedGroupKey && !expandedGroups.has(armedGroupKey)) {
      setExpandedGroups((prev) => new Set([...prev, armedGroupKey]))
    }
  }, [armedGroupKey])

  useEffect(() => {
    if (pendingBreadboardPresetId && !expandedGroups.has('__breadboards')) {
      setExpandedGroups((prev) => new Set([...prev, '__breadboards']))
    }
  }, [pendingBreadboardPresetId])

  useEffect(() => {
    if (activeTool === 'line' && !expandedGroups.has('__beam-lines')) {
      setExpandedGroups((prev) => new Set([...prev, '__beam-lines']))
    }
  }, [activeTool])

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`)
    e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`)
  }

  return (
    <aside 
      className="panel component-library" 
      data-tour="component-library"
      onMouseMove={handleMouseMove}
    >
      <div className="panel__header">
        <div className="panel__header-top">
          <h2>Component Families</h2>
          <button
            className="panel__collapse-button"
            data-tour="panel-library-toggle"
            onClick={onCollapse}
            type="button"
          >
            Collapse
          </button>
        </div>
        <p>
          Choose a family to arm placement, then edit variants and tunable
          properties in the inspector before you place it on the board.
        </p>
      </div>

      <div className="component-library__groups">
        {workspaceKind === 'optical-table' ? (
          <section className="component-library__group">
            <button
              className="component-library__group-header"
              onClick={() => toggleGroup('__breadboards')}
              type="button"
            >
              <span className="component-library__chevron">
                {expandedGroups.has('__breadboards') ? '\u25BE' : '\u25B8'}
              </span>
              <h3>Breadboards</h3>
              <span className="component-library__badge">
                {BREADBOARD_PRESETS.length}
              </span>
            </button>

            {expandedGroups.has('__breadboards') ? (
              <div className="component-library__group-body">
                {BREADBOARD_PRESETS.map((preset) => (
                  <button
                    className={`component-library__item${pendingBreadboardPresetId === preset.id ? ' is-armed' : ''}`}
                    key={preset.id}
                    onClick={() => addBreadboardInstance(preset.id)}
                    type="button"
                  >
                    <span className="component-library__item-title">{preset.label}</span>
                    <span className="component-library__item-meta">
                      Arm breadboard placement on the optical table
                    </span>
                    {pendingBreadboardPresetId === preset.id ? (
                      <span className="component-library__item-state">
                        Pending placement
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="component-library__group">
          <button
            className="component-library__group-header"
            onClick={() => toggleGroup('__beam-lines')}
            type="button"
          >
            <span className="component-library__chevron">
              {expandedGroups.has('__beam-lines') ? '\u25BE' : '\u25B8'}
            </span>
            <h3>Beam Lines</h3>
          </button>

          {expandedGroups.has('__beam-lines') ? (
            <div className="component-library__group-body">
              <button
                className={`component-library__item${activeTool === 'line' ? ' is-armed' : ''}`}
                onClick={() => setActiveTool(activeTool === 'line' ? 'select' : 'line')}
                type="button"
              >
                <span className="component-library__item-title">Line Tool</span>
                <span className="component-library__item-meta">
                  Click two points on the canvas to draw a straight beam line
                </span>
                {activeTool === 'line' ? (
                  <span className="component-library__item-state">Active</span>
                ) : null}
              </button>

              {activeTool === 'line' ? (
                <div className="component-library__line-colors">
                  <span className="component-library__color-label">Line color</span>
                  <div className="component-library__color-grid">
                    {LINE_COLOR_PRESETS.map(({ color, label }) => (
                      <button
                        aria-label={label}
                        aria-pressed={lineColor === color}
                        className={`component-library__color-swatch${lineColor === color ? ' is-active-swatch' : ''}`}
                        key={color}
                        onClick={() => setLineColor(color)}
                        style={{ backgroundColor: color }}
                        title={label}
                        type="button"
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {DISPLAY_GROUPS.map((group) => {
          const definitions = groupedDefinitions.get(group.key)

          if (!definitions) {
            return null
          }

          const isExpanded = expandedGroups.has(group.key)

          return (
            <section className="component-library__group" key={group.key}>
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
                  {definitions.length}
                </span>
              </button>

              {isExpanded ? (
                <div className="component-library__group-body">
                  {definitions.map((definition) => (
                    <button
                      className={`component-library__item${pendingPlacementType === definition.type ? ' is-armed' : ''}`}
                      key={definition.type}
                      onClick={() => addComponent(definition.type)}
                      type="button"
                    >
                      <span className="component-library__item-title">
                        {definition.familyLabel}
                      </span>
                      <span className="component-library__item-meta">
                        {definition.variants.length} variant
                        {definition.variants.length === 1 ? '' : 's'} •{' '}
                        {describeMountMode(definition.mount.mode)}
                      </span>
                      {pendingPlacementType === definition.type ? (
                        <span className="component-library__item-state">
                          Pending placement
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          )
        })}
      </div>
    </aside>
  )
}

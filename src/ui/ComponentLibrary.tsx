import {
  COMPONENT_CATEGORY_LABELS,
  COMPONENT_CATEGORY_ORDER,
  COMPONENT_DEFINITIONS,
} from '../domain/componentCatalog'
import { BREADBOARD_PRESETS } from '../domain/breadboardPresets'
import { useEditorStore } from '../state/editorStore'

interface ComponentLibraryProps {
  onCollapse: () => void
}

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

  return (
    <aside className="panel component-library" data-tour="component-library">
      <div className="panel__header">
        <div className="panel__header-top">
          <div>
            <h2>Component Families</h2>
            <p>
              Choose a family to arm placement, then edit variants and tunable
              properties in the inspector before you place it on the board.
            </p>
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
      </div>

      <div className="component-library__groups">
        {workspaceKind === 'optical-table' ? (
          <section className="component-library__group">
            <h3>Breadboards</h3>

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
          </section>
        ) : null}

        {COMPONENT_CATEGORY_ORDER.map((category) => {
          const definitions = COMPONENT_DEFINITIONS.filter(
            (definition) => definition.category === category,
          )

          if (definitions.length === 0) {
            return null
          }

          return (
            <section className="component-library__group" key={category}>
              <h3>{COMPONENT_CATEGORY_LABELS[category]}</h3>

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
            </section>
          )
        })}
      </div>
    </aside>
  )
}

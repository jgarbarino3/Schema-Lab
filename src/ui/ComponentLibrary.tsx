import {
  COMPONENT_CATEGORY_LABELS,
  COMPONENT_CATEGORY_ORDER,
  COMPONENT_DEFINITIONS,
} from '../domain/componentCatalog'
import { useEditorStore } from '../state/editorStore'

export function ComponentLibrary() {
  const addComponent = useEditorStore((state) => state.addComponent)

  return (
    <aside className="panel component-library">
      <div className="panel__header">
        <h2>Component Library</h2>
        <p>Starter Thorlabs-style footprints for Stage 1 layout studies.</p>
      </div>

      <div className="component-library__groups">
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
                  className="component-library__item"
                  key={definition.type}
                  onClick={() => addComponent(definition.type)}
                  type="button"
                >
                  <span className="component-library__item-title">
                    {definition.defaultLabel}
                  </span>
                  <span className="component-library__item-meta">
                    {definition.footprintBoundsMm.width.toFixed(1)} ×{' '}
                    {definition.footprintBoundsMm.height.toFixed(1)} mm
                  </span>
                </button>
              ))}
            </section>
          )
        })}
      </div>
    </aside>
  )
}

import type { ReactNode } from 'react'
import {
  getBreadboardHoleCounts,
  getEffectiveHolePitchMm,
} from '../domain/breadboard'
import { BREADBOARD_PRESETS } from '../domain/breadboardPresets'
import { getComponentDefinition } from '../domain/componentCatalog'
import {
  getRotatedFootprintBoundsMm,
  getWorldPortsForComponent,
} from '../domain/ports'
import type { QuarterTurn } from '../domain/types'
import { useEditorStore } from '../state/editorStore'

interface FieldProps {
  children: ReactNode
  label: string
}

function Field({ children, label }: FieldProps) {
  return (
    <label className="inspector__field">
      <span>{label}</span>
      {children}
    </label>
  )
}

interface NumberFieldProps {
  label: string
  onChange: (value: number) => void
  step?: number
  value: number
}

function NumberField({
  label,
  onChange,
  step = 0.1,
  value,
}: NumberFieldProps) {
  return (
    <Field label={label}>
      <input
        onChange={(event) => {
          if (event.target.value === '') {
            return
          }

          const nextValue = Number(event.target.value)

          if (Number.isFinite(nextValue)) {
            onChange(nextValue)
          }
        }}
        step={step}
        type="number"
        value={value}
      />
    </Field>
  )
}

export function InspectorPanel() {
  const scene = useEditorStore((state) => state.scene)
  const selection = useEditorStore((state) => state.selection)
  const snapMode = useEditorStore((state) => state.snapMode)
  const updateBreadboard = useEditorStore((state) => state.updateBreadboard)
  const applyBreadboardPreset = useEditorStore(
    (state) => state.applyBreadboardPreset,
  )
  const updateSelectedComponent = useEditorStore(
    (state) => state.updateSelectedComponent,
  )

  const selectedComponent =
    selection.type === 'component'
      ? scene.components.find(
          (component) => component.id === selection.componentId,
        ) ?? null
      : null

  if (!selectedComponent) {
    const holeCounts = getBreadboardHoleCounts(scene.breadboard)
    const effectivePitchMm = getEffectiveHolePitchMm(scene.breadboard)

    return (
      <aside className="panel inspector">
        <div className="panel__header">
          <h2>Breadboard Inspector</h2>
          <p>Board geometry, density, finish, and preset metadata.</p>
        </div>

        <div className="inspector__content">
          <Field label="Preset">
            <select
              onChange={(event) => {
                if (event.target.value !== 'custom') {
                  applyBreadboardPreset(event.target.value)
                }
              }}
              value={scene.breadboard.presetId ?? 'custom'}
            >
              {BREADBOARD_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </Field>

          <Field label="Label">
            <input
              onChange={(event) =>
                updateBreadboard({
                  label: event.target.value,
                })
              }
              type="text"
              value={scene.breadboard.label}
            />
          </Field>

          <NumberField
            label="Width (mm)"
            onChange={(widthMm) => updateBreadboard({ widthMm })}
            step={1}
            value={scene.breadboard.widthMm}
          />
          <NumberField
            label="Height (mm)"
            onChange={(heightMm) => updateBreadboard({ heightMm })}
            step={1}
            value={scene.breadboard.heightMm}
          />
          <NumberField
            label="Hole spacing (mm)"
            onChange={(holeSpacingMm) => updateBreadboard({ holeSpacingMm })}
            step={0.5}
            value={scene.breadboard.holeSpacingMm}
          />
          <NumberField
            label="Edge margin (mm)"
            onChange={(edgeMarginMm) => updateBreadboard({ edgeMarginMm })}
            step={0.5}
            value={scene.breadboard.edgeMarginMm}
          />
          <NumberField
            label="Thickness (mm)"
            onChange={(thicknessMm) => updateBreadboard({ thicknessMm })}
            step={0.1}
            value={scene.breadboard.thicknessMm}
          />

          <Field label="Finish">
            <select
              onChange={(event) =>
                updateBreadboard({
                  finish: event.target.value as typeof scene.breadboard.finish,
                })
              }
              value={scene.breadboard.finish}
            >
              <option value="black-anodized">Black anodized</option>
              <option value="clear-anodized">Clear anodized</option>
            </select>
          </Field>

          <Field label="Hole density">
            <select
              onChange={(event) =>
                updateBreadboard({
                  holeDensity: event.target.value as typeof scene.breadboard.holeDensity,
                })
              }
              value={scene.breadboard.holeDensity}
            >
              <option value="single">Single density</option>
              <option value="double">Double density</option>
            </select>
          </Field>

          <Field label="Counterbores">
            <select
              onChange={(event) =>
                updateBreadboard({
                  counterborePattern:
                    event.target.value as typeof scene.breadboard.counterborePattern,
                })
              }
              value={scene.breadboard.counterborePattern}
            >
              <option value="corner-25mm">Corner 25 mm inset</option>
              <option value="none">None</option>
            </select>
          </Field>

          <div className="inspector__readout">
            <div>
              <span>Hole field</span>
              <strong>
                {holeCounts.xCount} × {holeCounts.yCount}
              </strong>
            </div>
            <div>
              <span>Total holes</span>
              <strong>{holeCounts.totalCount}</strong>
            </div>
            <div>
              <span>Effective pitch</span>
              <strong>{effectivePitchMm.toFixed(1)} mm</strong>
            </div>
            <div>
              <span>Snap mode</span>
              <strong>{snapMode === 'always' ? 'Always' : 'On drop'}</strong>
            </div>
          </div>
        </div>
      </aside>
    )
  }

  const definition = getComponentDefinition(selectedComponent.type)
  const worldPorts = getWorldPortsForComponent(selectedComponent, definition)
  const rotatedFootprint = getRotatedFootprintBoundsMm(selectedComponent, definition)

  return (
    <aside className="panel inspector">
      <div className="panel__header">
        <h2>Component Inspector</h2>
        <p>Anchor position, rotation, and derived world ports.</p>
      </div>

      <div className="inspector__content">
        <div className="inspector__readout">
          <div>
            <span>Type</span>
            <strong>{definition.defaultLabel}</strong>
          </div>
          <div>
            <span>Category</span>
            <strong>{definition.category}</strong>
          </div>
          <div>
            <span>Footprint</span>
            <strong>
              {definition.footprintBoundsMm.width.toFixed(1)} ×{' '}
              {definition.footprintBoundsMm.height.toFixed(1)} mm
            </strong>
          </div>
          <div>
            <span>Rotated bounds</span>
            <strong>
              {rotatedFootprint.width.toFixed(1)} ×{' '}
              {rotatedFootprint.height.toFixed(1)} mm
            </strong>
          </div>
        </div>

        <Field label="Label">
          <input
            onChange={(event) =>
              updateSelectedComponent({
                label: event.target.value,
              })
            }
            type="text"
            value={selectedComponent.label}
          />
        </Field>

        <NumberField
          label="Anchor X (mm)"
          onChange={(x) =>
            updateSelectedComponent({
              anchorMm: { x, y: selectedComponent.anchorMm.y },
            })
          }
          step={0.5}
          value={selectedComponent.anchorMm.x}
        />
        <NumberField
          label="Anchor Y (mm)"
          onChange={(y) =>
            updateSelectedComponent({
              anchorMm: { x: selectedComponent.anchorMm.x, y },
            })
          }
          step={0.5}
          value={selectedComponent.anchorMm.y}
        />

        <Field label="Rotation">
          <select
            onChange={(event) =>
              updateSelectedComponent({
                rotationQuarterTurns: Number(
                  event.target.value,
                ) as QuarterTurn,
              })
            }
            value={selectedComponent.rotationQuarterTurns}
          >
            <option value={0}>0°</option>
            <option value={1}>90°</option>
            <option value={2}>180°</option>
            <option value={3}>270°</option>
          </select>
        </Field>

        <div className="inspector__subsection">
          <h3>World Ports</h3>

          <div className="port-list">
            {worldPorts.map((port) => (
              <div className="port-list__item" key={port.id}>
                <div>
                  <strong>{port.label}</strong>
                  <span>{port.kind}</span>
                </div>
                <div>
                  <span>
                    ({port.worldPositionMm.x.toFixed(1)},{' '}
                    {port.worldPositionMm.y.toFixed(1)}) mm
                  </span>
                  <span>{port.worldDirection}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}

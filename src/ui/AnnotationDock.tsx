import {
  ANNOTATION_SHAPE_OPTIONS,
  ANNOTATION_TEXT_VARIANT_OPTIONS,
} from '../domain/annotations'
import type { AnnotationText, ShapeAnnotation } from '../domain/types'
import { useEditorStore } from '../state/editorStore'
import { AnnotationToolbar } from './AnnotationToolbar'

interface AnnotationDockProps {
  selectedAnnotation?: AnnotationText | ShapeAnnotation
  onDone: () => void
}

const LINE_COLORS = [
  '#ff0000',
  '#00ff00',
  '#0088ff',
  '#ffee00',
  '#ff00ff',
  '#00eeff',
  '#ff8800',
  '#ffffff',
] as const

export function AnnotationDock({
  selectedAnnotation,
  onDone,
}: AnnotationDockProps) {
  const interaction = useEditorStore((state) => state.interaction)
  const setActiveTool = useEditorStore((state) => state.setActiveTool)
  const setLineColor = useEditorStore((state) => state.setLineColor)
  const setShapeToolKind = useEditorStore((state) => state.setShapeToolKind)
  const setTextToolVariant = useEditorStore((state) => state.setTextToolVariant)

  const handleActivateTool = (
    tool: 'select' | 'pan' | 'line' | 'text' | 'shape',
  ) => {
    onDone()
    setActiveTool(tool)
  }

  const highlightedTool =
    interaction.activeTool === 'select' || interaction.activeTool === 'pan'
      ? interaction.activeTool
      : selectedAnnotation?.kind === 'text'
      ? 'text'
      : selectedAnnotation?.kind === 'shape'
        ? 'shape'
        : interaction.activeTool === 'line' || interaction.activeTool === 'text' || interaction.activeTool === 'shape'
          ? interaction.activeTool
          : undefined

  return (
    <div className="annotation-dock">
      <div className="annotation-dock__tools">
        <button
          aria-label="Select"
          aria-pressed={highlightedTool === 'select'}
          className={`toolbar__icon-button${highlightedTool === 'select' ? ' is-active' : ''}`}
          data-tooltip="Select"
          onClick={() => handleActivateTool('select')}
          type="button"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
            <path d="M13 13l6 6" />
          </svg>
        </button>
        <button
          aria-label="Hand"
          aria-pressed={highlightedTool === 'pan'}
          className={`toolbar__icon-button${highlightedTool === 'pan' ? ' is-active' : ''}`}
          data-tooltip="Hand"
          onClick={() => handleActivateTool('pan')}
          type="button"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
            <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
            <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
            <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
          </svg>
        </button>
        <button
          aria-label="Line"
          aria-pressed={highlightedTool === 'line'}
          className={`toolbar__icon-button${highlightedTool === 'line' ? ' is-active' : ''}`}
          data-tooltip="Line"
          onClick={() => handleActivateTool('line')}
          type="button"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="5" cy="19" r="2" />
            <circle cx="19" cy="5" r="2" />
            <line x1="6.4" y1="17.6" x2="17.6" y2="6.4" />
          </svg>
        </button>
        <button
          aria-label="Text"
          aria-pressed={highlightedTool === 'text'}
          className={`toolbar__icon-button${highlightedTool === 'text' ? ' is-active' : ''}`}
          data-tooltip="Text"
          onClick={() => handleActivateTool('text')}
          type="button"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5h16" />
            <path d="M12 5v14" />
            <path d="M8 19h8" />
          </svg>
        </button>
        <button
          aria-label="Shape"
          aria-pressed={highlightedTool === 'shape'}
          className={`toolbar__icon-button${highlightedTool === 'shape' ? ' is-active' : ''}`}
          data-tooltip="Shape"
          onClick={() => handleActivateTool('shape')}
          type="button"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="8" height="8" rx="1.2" />
            <circle cx="17.5" cy="17.5" r="3.5" />
          </svg>
        </button>
      </div>

      <div className="annotation-dock__panel">
        {selectedAnnotation ? (
          <AnnotationToolbar
            annotation={selectedAnnotation}
            onDone={onDone}
          />
        ) : interaction.activeTool === 'line' ? (
          <div className="annotation-dock__inline-panel">
            <span className="annotation-dock__label">Line color</span>
            <div className="toolbar__color-swatches">
              {LINE_COLORS.map((color) => (
                <button
                  aria-label={`Line color ${color}`}
                  aria-pressed={interaction.lineColor === color}
                  className={`toolbar__swatch${interaction.lineColor === color ? ' is-active-swatch' : ''}`}
                  key={color}
                  onClick={() => setLineColor(color)}
                  style={{ backgroundColor: color }}
                  type="button"
                />
              ))}
            </div>
          </div>
        ) : interaction.activeTool === 'text' ? (
          <div className="annotation-dock__inline-panel">
            <label className="annotation-dock__field">
              <span>Text type</span>
              <select
                onChange={(event) =>
                  setTextToolVariant(event.target.value as AnnotationText['variant'])
                }
                value={interaction.textToolVariant}
              >
                {ANNOTATION_TEXT_VARIANT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : interaction.activeTool === 'shape' ? (
          <div className="annotation-dock__inline-panel">
            <label className="annotation-dock__field">
              <span>Shape kind</span>
              <select
                onChange={(event) =>
                  setShapeToolKind(event.target.value as ShapeAnnotation['shapeKind'])
                }
                value={interaction.shapeToolKind}
              >
                {ANNOTATION_SHAPE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </div>
    </div>
  )
}

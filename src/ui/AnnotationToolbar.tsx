import {
  ANNOTATION_FONT_OPTIONS,
  ANNOTATION_SHAPE_OPTIONS,
} from '../domain/annotations'
import type { AnnotationText, ShapeAnnotation } from '../domain/types'
import { useEditorStore } from '../state/editorStore'

interface AnnotationToolbarProps {
  annotation: AnnotationText | ShapeAnnotation
  leftPx: number
  topPx: number
}

function ToggleButton({
  isActive,
  label,
  onClick,
}: {
  isActive: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={`annotation-toolbar__toggle${isActive ? ' is-active' : ''}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  )
}

export function AnnotationToolbar({
  annotation,
  leftPx,
  topPx,
}: AnnotationToolbarProps) {
  const updateSelectedShapeStyle = useEditorStore(
    (state) => state.updateSelectedShapeStyle,
  )
  const updateSelectedTextStyle = useEditorStore(
    (state) => state.updateSelectedTextStyle,
  )

  return (
    <div
      className="annotation-toolbar"
      style={{
        left: leftPx,
        top: topPx,
      }}
    >
      {annotation.kind === 'text' ? (
        <>
          <label className="annotation-toolbar__field">
            <span>Font</span>
            <select
              onChange={(event) =>
                updateSelectedTextStyle({
                  fontFamily: event.target.value as AnnotationText['style']['fontFamily'],
                })
              }
              value={annotation.style.fontFamily}
            >
              {ANNOTATION_FONT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="annotation-toolbar__field annotation-toolbar__field--compact">
            <span>Size</span>
            <input
              min={3.2}
              onChange={(event) =>
                updateSelectedTextStyle({
                  fontSizeMm: Number(event.target.value),
                })
              }
              step={0.2}
              type="number"
              value={annotation.style.fontSizeMm}
            />
          </label>

          <label className="annotation-toolbar__field annotation-toolbar__field--compact">
            <span>Color</span>
            <input
              onChange={(event) =>
                updateSelectedTextStyle({ color: event.target.value })
              }
              type="color"
              value={annotation.style.color}
            />
          </label>

          <div className="annotation-toolbar__button-row">
            <ToggleButton
              isActive={annotation.style.bold}
              label="B"
              onClick={() =>
                updateSelectedTextStyle({ bold: !annotation.style.bold })
              }
            />
            <ToggleButton
              isActive={annotation.style.italic}
              label="I"
              onClick={() =>
                updateSelectedTextStyle({ italic: !annotation.style.italic })
              }
            />
            <ToggleButton
              isActive={annotation.style.underline}
              label="U"
              onClick={() =>
                updateSelectedTextStyle({
                  underline: !annotation.style.underline,
                })
              }
            />
          </div>

          <div className="annotation-toolbar__button-row">
            <ToggleButton
              isActive={annotation.style.align === 'left'}
              label="Left"
              onClick={() => updateSelectedTextStyle({ align: 'left' })}
            />
            <ToggleButton
              isActive={annotation.style.align === 'center'}
              label="Center"
              onClick={() => updateSelectedTextStyle({ align: 'center' })}
            />
            <ToggleButton
              isActive={annotation.style.align === 'right'}
              label="Right"
              onClick={() => updateSelectedTextStyle({ align: 'right' })}
            />
          </div>
        </>
      ) : (
        <>
          <label className="annotation-toolbar__field">
            <span>Shape</span>
            <select
              onChange={(event) =>
                updateSelectedShapeStyle({
                  shapeKind: event.target.value as ShapeAnnotation['shapeKind'],
                })
              }
              value={annotation.shapeKind}
            >
              {ANNOTATION_SHAPE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="annotation-toolbar__field annotation-toolbar__field--compact">
            <span>Stroke</span>
            <input
              onChange={(event) =>
                updateSelectedShapeStyle({
                  strokeColor: event.target.value,
                })
              }
              type="color"
              value={annotation.strokeColor}
            />
          </label>

          <label className="annotation-toolbar__field annotation-toolbar__field--compact">
            <span>Fill</span>
            <input
              onChange={(event) =>
                updateSelectedShapeStyle({
                  fillColor: event.target.value,
                })
              }
              type="color"
              value={
                annotation.fillColor.startsWith('#')
                  ? annotation.fillColor
                  : '#61b4da'
              }
            />
          </label>

          <label className="annotation-toolbar__field annotation-toolbar__field--compact">
            <span>Width</span>
            <input
              min={0.2}
              onChange={(event) =>
                updateSelectedShapeStyle({
                  strokeWidthMm: Number(event.target.value),
                })
              }
              step={0.1}
              type="number"
              value={annotation.strokeWidthMm}
            />
          </label>

          <button
            className="annotation-toolbar__ghost"
            onClick={() => updateSelectedShapeStyle({ fillColor: 'transparent' })}
            type="button"
          >
            No fill
          </button>
        </>
      )}
    </div>
  )
}

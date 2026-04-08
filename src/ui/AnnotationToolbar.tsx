import { useEffect, useRef } from 'react'
import {
  ANNOTATION_FONT_OPTIONS,
  ANNOTATION_SHAPE_OPTIONS,
  ANNOTATION_TEXT_VARIANT_OPTIONS,
} from '../domain/annotations'
import type { AnnotationText, ShapeAnnotation } from '../domain/types'
import { useEditorStore } from '../state/editorStore'

interface AnnotationToolbarProps {
  annotation: AnnotationText | ShapeAnnotation
  onDone: () => void
}

function ToggleButton({
  isActive,
  label,
  title,
  onClick,
}: {
  isActive: boolean
  label: string
  title?: string
  onClick: () => void
}) {
  return (
    <button
      aria-label={title ?? label}
      className={`annotation-toolbar__toggle${isActive ? ' is-active' : ''}`}
      onClick={onClick}
      title={title}
      type="button"
    >
      {label}
    </button>
  )
}

function StepperButton({
  direction,
  label,
  onStep,
}: {
  direction: 1 | -1
  label: string
  onStep: (direction: 1 | -1) => void
}) {
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        window.clearInterval(timerRef.current)
      }
    }
  }, [])

  const stop = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const start = () => {
    onStep(direction)
    stop()

    const timeout = window.setTimeout(() => {
      timerRef.current = window.setInterval(() => {
        onStep(direction)
      }, 80)
    }, 360)

    timerRef.current = timeout
  }

  return (
    <button
      className="annotation-toolbar__stepper"
      onMouseDown={start}
      onMouseLeave={stop}
      onMouseUp={stop}
      onTouchEnd={stop}
      onTouchStart={start}
      type="button"
    >
      {label}
    </button>
  )
}

export function AnnotationToolbar({
  annotation,
  onDone,
}: AnnotationToolbarProps) {
  const updateSelectedShapeStyle = useEditorStore(
    (state) => state.updateSelectedShapeStyle,
  )
  const updateSelectedTextAnnotation = useEditorStore(
    (state) => state.updateSelectedTextAnnotation,
  )
  const updateSelectedTextStyle = useEditorStore(
    (state) => state.updateSelectedTextStyle,
  )
  const stepSelectedAnnotationSize = useEditorStore(
    (state) => state.stepSelectedAnnotationSize,
  )

  return (
    <div className="annotation-toolbar annotation-toolbar--dock">
      {annotation.kind === 'text' ? (
        <>
          <label className="annotation-toolbar__field annotation-toolbar__field--select">
            <span>Type</span>
            <select
              onChange={(event) =>
                updateSelectedTextAnnotation({
                  variant: event.target.value as AnnotationText['variant'],
                })
              }
              value={annotation.variant}
            >
              {ANNOTATION_TEXT_VARIANT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="annotation-toolbar__field annotation-toolbar__field--select">
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

          <label className="annotation-toolbar__field annotation-toolbar__field--swatch">
            <span>Text</span>
            <input
              onChange={(event) =>
                updateSelectedTextStyle({ color: event.target.value })
              }
              type="color"
              value={annotation.style.color}
            />
          </label>

          {annotation.variant !== 'plain' ? (
            <label className="annotation-toolbar__field annotation-toolbar__field--swatch">
              <span>Paper</span>
              <input
                onChange={(event) =>
                  updateSelectedTextAnnotation({
                    backgroundColor: event.target.value,
                  })
                }
                type="color"
                value={
                  annotation.backgroundColor.startsWith('#')
                    ? annotation.backgroundColor
                    : '#1f3c4d'
                }
              />
            </label>
          ) : null}

          <label className="annotation-toolbar__field annotation-toolbar__field--number">
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

          <div className="annotation-toolbar__field annotation-toolbar__field--stepper">
            <span>Box</span>
            <div className="annotation-toolbar__stepper-row">
              <StepperButton direction={-1} label="-" onStep={stepSelectedAnnotationSize} />
              <StepperButton direction={1} label="+" onStep={stepSelectedAnnotationSize} />
            </div>
          </div>

          <div className="annotation-toolbar__button-row">
            <ToggleButton
              isActive={annotation.style.bold}
              label="B"
              title="Bold"
              onClick={() =>
                updateSelectedTextStyle({ bold: !annotation.style.bold })
              }
            />
            <ToggleButton
              isActive={annotation.style.italic}
              label="I"
              title="Italic"
              onClick={() =>
                updateSelectedTextStyle({ italic: !annotation.style.italic })
              }
            />
            <ToggleButton
              isActive={annotation.style.underline}
              label="U"
              title="Underline"
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
              label="L"
              title="Align left"
              onClick={() => updateSelectedTextStyle({ align: 'left' })}
            />
            <ToggleButton
              isActive={annotation.style.align === 'center'}
              label="C"
              title="Align center"
              onClick={() => updateSelectedTextStyle({ align: 'center' })}
            />
            <ToggleButton
              isActive={annotation.style.align === 'right'}
              label="R"
              title="Align right"
              onClick={() => updateSelectedTextStyle({ align: 'right' })}
            />
          </div>
        </>
      ) : (
        <>
          <label className="annotation-toolbar__field annotation-toolbar__field--select">
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

          <label className="annotation-toolbar__field annotation-toolbar__field--swatch">
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

          <label className="annotation-toolbar__field annotation-toolbar__field--swatch">
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

          <label className="annotation-toolbar__field annotation-toolbar__field--number">
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

          <div className="annotation-toolbar__field annotation-toolbar__field--stepper">
            <span>Size</span>
            <div className="annotation-toolbar__stepper-row">
              <StepperButton direction={-1} label="-" onStep={stepSelectedAnnotationSize} />
              <StepperButton direction={1} label="+" onStep={stepSelectedAnnotationSize} />
            </div>
          </div>

          <button
            className="annotation-toolbar__ghost"
            onClick={() => updateSelectedShapeStyle({ fillColor: 'transparent' })}
            type="button"
          >
            No fill
          </button>
        </>
      )}

      <button
        className="annotation-toolbar__done"
        onClick={onDone}
        type="button"
      >
        Done
      </button>
    </div>
  )
}

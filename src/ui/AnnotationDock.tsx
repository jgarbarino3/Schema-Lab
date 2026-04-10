import {
  useEffect,
  useState,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  ANNOTATION_SHAPE_OPTIONS,
  ANNOTATION_TEXT_VARIANT_OPTIONS,
} from '../domain/annotations'
import type { ActiveTool, AnnotationText, ShapeAnnotation } from '../domain/types'
import { useEditorStore } from '../state/editorStore'
import { useAnnotationToolState } from '../state/editorSelectors'
import { AnnotationToolbar } from './AnnotationToolbar'

interface AnnotationDockProps {
  selectedAnnotation?: AnnotationText | ShapeAnnotation
  onDone: () => void
}

type PopoverTool = Extract<ActiveTool, 'line' | 'shape' | 'text'>

const LINE_COLORS = [
  { color: '#ff0000', id: 'red', label: 'Red' },
  { color: '#00ff00', id: 'green', label: 'Green' },
  { color: '#0088ff', id: 'blue', label: 'Blue' },
  { color: '#ffee00', id: 'yellow', label: 'Yellow' },
  { color: '#ff00ff', id: 'magenta', label: 'Magenta' },
  { color: '#00eeff', id: 'cyan', label: 'Cyan' },
  { color: '#ff8800', id: 'orange', label: 'Orange' },
  { color: '#ffffff', id: 'white', label: 'White' },
] as const

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function getDockPopoverStyle(button: HTMLButtonElement | null) {
  if (!button) {
    return undefined
  }

  const rect = button.getBoundingClientRect()
  const width = Math.min(332, window.innerWidth - 24)
  const left = clamp(
    rect.left + rect.width / 2 - width / 2,
    12,
    window.innerWidth - width - 12,
  )
  const top = Math.min(rect.bottom + 12, window.innerHeight - 20)

  return {
    left,
    top,
    width,
  } satisfies CSSProperties
}

function ShapeIcon({ kind }: { kind: ShapeAnnotation['shapeKind'] }) {
  switch (kind) {
    case 'rectangle':
      return (
        <svg viewBox="0 0 24 24">
          <rect
            height="12"
            rx="1.8"
            width="16"
            x="4"
            y="6"
          />
        </svg>
      )
    case 'rounded-rectangle':
      return (
        <svg viewBox="0 0 24 24">
          <rect
            height="12"
            rx="4.4"
            width="16"
            x="4"
            y="6"
          />
        </svg>
      )
    case 'ellipse':
      return (
        <svg viewBox="0 0 24 24">
          <ellipse cx="12" cy="12" rx="8" ry="6" />
        </svg>
      )
    case 'diamond':
      return (
        <svg viewBox="0 0 24 24">
          <path d="M12 4 20 12 12 20 4 12Z" />
        </svg>
      )
    case 'arrow':
      return (
        <svg viewBox="0 0 24 24">
          <path
            d="M5 12h10"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
          <path
            d="m12 7 5 5-5 5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      )
  }
}

function TextVariantPreview({ variant }: { variant: AnnotationText['variant'] }) {
  switch (variant) {
    case 'sticky-note':
      return <span className="annotation-dock__option-preview is-note">Aa</span>
    case 'note-card':
      return <span className="annotation-dock__option-preview is-card">Card</span>
    case 'callout-bubble':
      return <span className="annotation-dock__option-preview is-callout">Callout</span>
    case 'plain':
    default:
      return <span className="annotation-dock__option-preview">Text</span>
  }
}

function getShapeBadgeLabel(shapeKind: ShapeAnnotation['shapeKind']) {
  switch (shapeKind) {
    case 'rectangle':
      return 'Rect'
    case 'rounded-rectangle':
      return 'Round'
    case 'ellipse':
      return 'Oval'
    case 'diamond':
      return 'Dia'
    case 'arrow':
      return 'Arrow'
  }
}

function getTextBadgeLabel(variant: AnnotationText['variant']) {
  switch (variant) {
    case 'sticky-note':
      return 'Note'
    case 'note-card':
      return 'Card'
    case 'callout-bubble':
      return 'Callout'
    case 'plain':
    default:
      return 'Text'
  }
}

function AnnotationToolPopover({
  anchor,
  children,
  label,
  onClose,
  testId,
}: {
  anchor: HTMLButtonElement | null
  children: ReactNode
  label: string
  onClose: () => void
  testId: string
}) {
  const popoverRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        (popoverRef.current?.contains(event.target) || anchor?.contains(event.target))
      ) {
        return
      }

      onClose()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [anchor, onClose])

  const style = getDockPopoverStyle(anchor)

  if (!anchor || !style) {
    return null
  }

  return createPortal(
    <div
      aria-label={`${label} options`}
      className="annotation-dock__popover"
      data-testid={testId}
      ref={popoverRef}
      role="dialog"
      style={style}
    >
      {children}
    </div>,
    document.body,
  )
}

export function AnnotationDock({
  selectedAnnotation,
  onDone,
}: AnnotationDockProps) {
  const { activeTool, lineColor, shapeToolKind, textToolVariant } = useAnnotationToolState()
  const setActiveTool = useEditorStore((state) => state.setActiveTool)
  const setLineColor = useEditorStore((state) => state.setLineColor)
  const setShapeToolKind = useEditorStore((state) => state.setShapeToolKind)
  const setTextToolVariant = useEditorStore((state) => state.setTextToolVariant)
  const lineButtonRef = useRef<HTMLButtonElement | null>(null)
  const textButtonRef = useRef<HTMLButtonElement | null>(null)
  const shapeButtonRef = useRef<HTMLButtonElement | null>(null)
  const [openPopover, setOpenPopover] = useState<PopoverTool | undefined>()

  useEffect(() => {
    if (
      selectedAnnotation ||
      (openPopover && activeTool !== openPopover)
    ) {
      setOpenPopover(undefined)
    }
  }, [activeTool, openPopover, selectedAnnotation])

  const handleActivateTool = (tool: ActiveTool) => {
    onDone()

    if (tool === 'select' || tool === 'pan' || tool === 'highlight') {
      setOpenPopover(undefined)
      setActiveTool(tool)
      return
    }

    const shouldToggleClosed = activeTool === tool && openPopover === tool
    setActiveTool(tool)
    setOpenPopover(shouldToggleClosed ? undefined : tool)
  }

  const handleLineColorSelect = (color: string) => {
    setLineColor(color)
    setOpenPopover(undefined)
  }

  const handleTextVariantSelect = (variant: AnnotationText['variant']) => {
    setTextToolVariant(variant)
    setOpenPopover(undefined)
  }

  const handleShapeKindSelect = (shapeKind: ShapeAnnotation['shapeKind']) => {
    setShapeToolKind(shapeKind)
    setOpenPopover(undefined)
  }

  const highlightedTool =
    activeTool === 'select' || activeTool === 'pan'
      ? activeTool
      : activeTool === 'line' || activeTool === 'text' || activeTool === 'shape'
        ? activeTool
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
          <svg
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
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
          <svg
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
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
          data-popover-open={openPopover === 'line' ? 'true' : undefined}
          onClick={() => handleActivateTool('line')}
          ref={lineButtonRef}
          type="button"
        >
          <svg
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <circle cx="5" cy="19" r="2" />
            <circle cx="19" cy="5" r="2" />
            <line x1="6.4" x2="17.6" y1="17.6" y2="6.4" />
          </svg>
          {highlightedTool === 'line' ? (
            <span
              aria-hidden="true"
              className="annotation-dock__tool-badge annotation-dock__tool-badge--swatch"
              style={{ '--annotation-badge-color': lineColor } as CSSProperties}
            />
          ) : null}
        </button>

        <button
          aria-label="Text"
          aria-pressed={highlightedTool === 'text'}
          className={`toolbar__icon-button${highlightedTool === 'text' ? ' is-active' : ''}`}
          data-tooltip="Text"
          data-popover-open={openPopover === 'text' ? 'true' : undefined}
          onClick={() => handleActivateTool('text')}
          ref={textButtonRef}
          type="button"
        >
          <svg
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M4 5h16" />
            <path d="M12 5v14" />
            <path d="M8 19h8" />
          </svg>
          {highlightedTool === 'text' ? (
            <span aria-hidden="true" className="annotation-dock__tool-badge">
              {getTextBadgeLabel(textToolVariant)}
            </span>
          ) : null}
        </button>

        <button
          aria-label="Shape"
          aria-pressed={highlightedTool === 'shape'}
          className={`toolbar__icon-button${highlightedTool === 'shape' ? ' is-active' : ''}`}
          data-tooltip="Shape"
          data-popover-open={openPopover === 'shape' ? 'true' : undefined}
          onClick={() => handleActivateTool('shape')}
          ref={shapeButtonRef}
          type="button"
        >
          <svg
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <rect height="8" rx="1.2" width="8" x="4" y="4" />
            <circle cx="17.5" cy="17.5" r="3.5" />
          </svg>
          {highlightedTool === 'shape' ? (
            <span aria-hidden="true" className="annotation-dock__tool-badge">
              {getShapeBadgeLabel(shapeToolKind)}
            </span>
          ) : null}
        </button>
      </div>

      <div className="annotation-dock__panel">
        {selectedAnnotation ? (
          <AnnotationToolbar annotation={selectedAnnotation} onDone={onDone} />
        ) : null}
      </div>

      {openPopover === 'line' && !selectedAnnotation ? (
        <AnnotationToolPopover
          anchor={lineButtonRef.current}
          label="Line"
          onClose={() => setOpenPopover(undefined)}
          testId="annotation-tool-popover-line"
        >
          <div className="annotation-dock__popover-header">
            <span>Line color</span>
          </div>
          <div className="annotation-dock__swatch-grid">
            {LINE_COLORS.map((entry) => (
              <button
                aria-label={`${entry.label} line color`}
                aria-pressed={lineColor === entry.color}
                className={`toolbar__swatch${lineColor === entry.color ? ' is-active-swatch' : ''}`}
                data-testid={`annotation-line-color-${entry.id}`}
                key={entry.id}
                onClick={() => handleLineColorSelect(entry.color)}
                style={{ backgroundColor: entry.color }}
                type="button"
              />
            ))}
          </div>
        </AnnotationToolPopover>
      ) : null}

      {openPopover === 'text' && !selectedAnnotation ? (
        <AnnotationToolPopover
          anchor={textButtonRef.current}
          label="Text"
          onClose={() => setOpenPopover(undefined)}
          testId="annotation-tool-popover-text"
        >
          <div className="annotation-dock__popover-header">
            <span>Text type</span>
          </div>
          <div className="annotation-dock__option-grid annotation-dock__option-grid--text">
            {ANNOTATION_TEXT_VARIANT_OPTIONS.map((option) => (
              <button
                aria-pressed={textToolVariant === option.id}
                className={`annotation-dock__option-button${textToolVariant === option.id ? ' is-active' : ''}`}
                data-testid={`annotation-text-variant-${option.id}`}
                key={option.id}
                onClick={() => handleTextVariantSelect(option.id)}
                type="button"
              >
                <TextVariantPreview variant={option.id} />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </AnnotationToolPopover>
      ) : null}

      {openPopover === 'shape' && !selectedAnnotation ? (
        <AnnotationToolPopover
          anchor={shapeButtonRef.current}
          label="Shape"
          onClose={() => setOpenPopover(undefined)}
          testId="annotation-tool-popover-shape"
        >
          <div className="annotation-dock__popover-header">
            <span>Shape picker</span>
          </div>
          <div className="annotation-dock__option-grid annotation-dock__option-grid--shape">
            {ANNOTATION_SHAPE_OPTIONS.map((option) => (
              <button
                aria-pressed={shapeToolKind === option.id}
                className={`annotation-dock__option-button annotation-dock__option-button--shape${shapeToolKind === option.id ? ' is-active' : ''}`}
                data-testid={`annotation-shape-kind-${option.id}`}
                key={option.id}
                onClick={() => handleShapeKindSelect(option.id)}
                type="button"
              >
                <ShapeIcon kind={option.id} />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </AnnotationToolPopover>
      ) : null}
    </div>
  )
}

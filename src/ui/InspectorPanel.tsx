import { useEffect, useState, useMemo, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import {
  ANNOTATION_FONT_OPTIONS,
  ANNOTATION_SHAPE_OPTIONS,
  ANNOTATION_TEXT_VARIANT_OPTIONS,
  getAnnotationKindLabel,
  sortAnnotationsByZIndex,
} from '../domain/annotations'
import {
  getBreadboardHoleCounts,
  getEffectiveHolePitchMm,
} from '../domain/breadboard'
import { deriveBboMetrics, deriveBboPolarizationSummary } from '../domain/bbo'
import { getBeamSelectionSnapshot } from '../domain/beamSelection'
import { getFilterTransmissionEstimate } from '../domain/beamTracing'
import {
  getGaussianInteractionAnalysis,
  getGaussianPathAnalysis,
  getGaussianPathTableRows,
  getGaussianSegmentAnalysis,
  getGaussianSourceSummary,
} from '../domain/gaussian'
import { BREADBOARD_PRESETS } from '../domain/breadboardPresets'
import {
  COMPONENT_CATEGORY_LABELS,
  getComponentDefinition,
  getComponentVariants,
  getResolvedComponentSpecForInstance,
  isOpticalTarget,
  isPostMountedType,
  DEFAULT_POST_HOLDER_DIAMETER_MM,
  supportsSimpleGlyphAppearance,
  supportsMountToggle,
} from '../domain/componentCatalog'
import { inspectSceneComponentPlacement } from '../domain/placement'
import {
  applyPolarizationPreset,
  createDefaultPolarizationConfig,
  createPolarizationSnapshot,
} from '../domain/polarization'
import { getRotatedFootprintBoundsMm, getWorldPortsForComponent } from '../domain/ports'
import { SOURCE_PRESETS } from '../domain/sourcePresets'
import {
  getBreadboardInstances,
  getOpticalTable,
  getSingleBreadboard,
  getWorkspacePrimaryBreadboard,
} from '../domain/workspace'
import type {
  AnnotationLayerBand,
  AnnotationText,
  BeamInteractionEvent,
  BeamTraceResult,
  FilterTransmissionClass,
  GaussianTraceResult,
  SceneAnnotation,
  ShapeAnnotation,
  PolarizationConfig,
  QuarterTurn,
  WorldPort,
} from '../domain/types'
import { useEditorStore } from '../state/editorStore'
import {
  useBeamInspectionState,
  useInspectorInteractionState,
} from '../state/editorSelectors'
const SIMPLE_APPEARANCE_SWATCHS = [
  '#f4fbff',
  '#ffc9b8',
  '#ffe08c',
  '#90f0d6',
  '#9dd2ff',
  '#f0b0ff',
] as const

const SIMPLE_APPEARANCE_SWATCH_OPTIONS = [
  { color: '#f4fbff', label: 'White' },
  { color: '#ffc9b8', label: 'Peach' },
  { color: '#ffe08c', label: 'Gold' },
  { color: '#90f0d6', label: 'Mint' },
  { color: '#9dd2ff', label: 'Blue' },
  { color: '#f0b0ff', label: 'Lilac' },
] as const

interface InspectorPanelProps {
  beamTrace: BeamTraceResult
  gaussianTrace: GaussianTraceResult
  onCollapse: () => void
}

interface FieldProps {
  children: ReactNode
  className?: string
  label: string
}

function Field({ children, className, label }: FieldProps) {
  return (
    <label className={`inspector__field${className ? ` ${className}` : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  )
}

interface NumberFieldProps {
  className?: string
  displayPrecision?: number
  label: string
  onChange: (value: number) => void
  suffix?: string
  value: number
}

function formatNumberFieldValue(value: number, displayPrecision?: number) {
  if (displayPrecision === undefined) {
    return String(value)
  }

  return value.toFixed(displayPrecision)
}

function NumberField({
  className,
  displayPrecision,
  label,
  onChange,
  suffix,
  value,
}: NumberFieldProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [draftValue, setDraftValue] = useState(String(value))

  useEffect(() => {
    if (!isFocused) {
      setDraftValue(String(value))
    }
  }, [isFocused, value])

  const commitValue = () => {
    if (draftValue.trim() === '') {
      setDraftValue(String(value))
      setIsFocused(false)
      return
    }

    const nextValue = Number(draftValue)

    if (Number.isFinite(nextValue)) {
      onChange(nextValue)
      setDraftValue(String(nextValue))
    } else {
      setDraftValue(String(value))
    }

    setIsFocused(false)
  }

  const input = (
    <input
      onChange={(event) => {
        setDraftValue(event.target.value)
      }}
      onBlur={() => {
        commitValue()
      }}
      onFocus={(event) => {
        setIsFocused(true)
        setDraftValue(String(value))
        window.requestAnimationFrame(() => {
          event.currentTarget.select()
        })
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          setDraftValue(String(value))
          event.currentTarget.blur()
        }
      }}
      inputMode="decimal"
      type="text"
      value={isFocused ? draftValue : formatNumberFieldValue(value, displayPrecision)}
    />
  )

  return (
    <Field className={className} label={label}>
      {suffix ? (
        <div className="inspector__input-with-suffix">
          {input}
          <span className="inspector__input-suffix">{suffix}</span>
        </div>
      ) : (
        input
      )}
    </Field>
  )
}

function normalizeIconStylePreviewGlyph(glyph: string) {
  switch (glyph) {
    case 'laser-fs-source':
    case 'laser-compact-table':
    case 'laser-libra':
    case 'laser-pharos':
    case 'laser-clark':
      return 'laser'
    case 'support-clamp-fork':
    case 'support-mounting-base':
    case 'support-pedestal-post':
    case 'support-post-holder':
    case 'support-pedestal-assembly':
    case 'support-linear-slide':
    case 'support-beam-block':
    case 'support-periscope':
    case 'support-white-light-cell':
    case 'support-pump-seed-combiner':
      return 'support'
    case 'mirror-flip':
      return 'mirror'
    case 'attenuator-horizontal':
    case 'attenuator-vertical':
      return 'attenuator'
    case 'waveplate-half':
    case 'waveplate-quarter':
      return 'waveplate'
    case 'iris-standard':
    case 'iris-zero':
    case 'iris-sm1-ring':
    case 'iris-sm1-graduated':
    case 'iris-sm1-zero':
      return 'iris'
    case 'telescope-transmission':
    case 'telescope-reflective':
      return 'telescope'
    case 'sample-generic':
    case 'sample-delay-stage':
    case 'sample-motorized-stage':
      return 'sample'
    case 'spectrometer-compact':
    case 'spectrometer-bench':
      return 'spectrometer'
    default:
      return glyph
  }
}

function renderIconStyleGlyph(glyph: string, isClassic: boolean) {
  const s = 'currentColor'
  switch (normalizeIconStylePreviewGlyph(glyph)) {
    case 'laser':
      return isClassic ? (
        <>
          <circle cx="8.2" cy="12" r="3" stroke={s} strokeWidth="1.1" fill="none" />
          <path d="M11.2 12 L17 12" stroke={s} strokeLinecap="round" strokeWidth="1.15" />
          <path d="M15 9.6 L17.8 12 L15 14.4" stroke={s} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" fill="none" />
        </>
      ) : (
        <>
          <rect x="6" y="8.4" width="6" height="7.2" rx="1.8" stroke={s} strokeWidth="1" fill="none" />
          <path d="M12.2 12 L18 12" stroke={s} strokeLinecap="round" strokeWidth="1.15" />
          <path d="M15 9.6 L17.8 12 L15 14.4" stroke={s} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" fill="none" />
        </>
      )
    case 'mount':
      return (
        <>
          <circle cx="12" cy="12" r="6" stroke={s} strokeWidth="1.15" fill="none" />
          <circle cx="12" cy="12" r="2.2" stroke={s} strokeWidth="0.9" fill="none" />
        </>
      )
    case 'support':
      return isClassic ? (
        <>
          <rect x="7" y="9" width="10" height="6" rx="1.2" stroke={s} strokeWidth="1.1" fill="none" />
          <path d="M8.5 16 L15.5 16" stroke={s} strokeLinecap="round" strokeWidth="1" />
        </>
      ) : (
        <rect x="7" y="9" width="10" height="6" rx="1.2" stroke={s} strokeWidth="1.1" fill="none" />
      )
    case 'mirror':
      return isClassic ? (
        <>
          <path d="M17 7 L7 17" stroke={s} strokeLinecap="round" strokeWidth="2" />
          <path d="M9 16 L7 18" stroke={s} strokeLinecap="round" strokeWidth="1.1" />
          <path d="M11 14 L9 16" stroke={s} strokeLinecap="round" strokeWidth="1.1" />
          <path d="M13 12 L11 14" stroke={s} strokeLinecap="round" strokeWidth="1.1" />
        </>
      ) : (
        <path d="M17 7 L7 17" stroke={s} strokeLinecap="round" strokeWidth="2" />
      )
    case 'curved-mirror':
      return isClassic ? (
        <>
          <path d="M17 7 Q10.5 10.5 7 17" stroke={s} strokeLinecap="round" fill="none" strokeWidth="2" />
          <path d="M9 16 L7 18" stroke={s} strokeLinecap="round" strokeWidth="1.1" />
          <path d="M10.5 14 L8.5 16" stroke={s} strokeLinecap="round" strokeWidth="1.1" />
        </>
      ) : (
        <path d="M17 7 Q10.5 10.5 7 17" stroke={s} strokeLinecap="round" fill="none" strokeWidth="2" />
      )
    case 'beamsplitter':
      return isClassic ? (
        <>
          <rect x="7.8" y="7.8" width="8.4" height="8.4" rx="0.5" transform="rotate(45 12 12)" stroke={s} strokeWidth="1.2" fill="none" />
          <path d="M8 16 L16 8" stroke={s} strokeLinecap="round" strokeWidth="1.3" />
          <path d="M9 9 L15 15" stroke={s} strokeLinecap="round" strokeWidth="0.9" opacity="0.6" />
        </>
      ) : (
        <>
          <rect x="7.8" y="7.8" width="8.4" height="8.4" rx="0.5" transform="rotate(45 12 12)" stroke={s} strokeWidth="1.2" fill="none" />
          <path d="M8 16 L16 8" stroke={s} strokeLinecap="round" strokeWidth="1.3" />
        </>
      )
    case 'lens':
      return isClassic ? (
        <>
          <ellipse cx="12" cy="12" rx="2.8" ry="6.5" stroke={s} strokeWidth="1.3" fill="none" />
          <path d="M12 5.5 L12 18.5" stroke={s} strokeLinecap="round" strokeWidth="0.9" />
        </>
      ) : (
        <ellipse cx="12" cy="12" rx="2.8" ry="6.5" stroke={s} strokeWidth="1.3" fill="none" />
      )
    case 'filter':
      return isClassic ? (
        <>
          <rect x="8.5" y="8.5" width="7" height="7" rx="0.5" transform="rotate(45 12 12)" stroke={s} strokeWidth="1.1" fill="none" />
          <path d="M8 16 L16 8" stroke={s} strokeLinecap="round" strokeWidth="1.2" />
          <path d="M15 10 L17.5 10.5" stroke={s} strokeLinecap="round" strokeWidth="1" />
        </>
      ) : (
        <>
          <rect x="8.5" y="8.5" width="7" height="7" rx="0.5" transform="rotate(45 12 12)" stroke={s} strokeWidth="1.1" fill="none" />
          <path d="M8 16 L16 8" stroke={s} strokeLinecap="round" strokeWidth="1.2" />
        </>
      )
    case 'attenuator':
      return isClassic ? (
        <>
          <path d="M8 17 L12 7 L16 17 Z" stroke={s} strokeLinejoin="round" strokeWidth="1.3" fill="none" />
          <path d="M5 13 L8.8 13" stroke={s} strokeLinecap="round" strokeWidth="1" />
          <path d="M15.2 13 L19 13" stroke={s} strokeLinecap="round" strokeWidth="1" />
        </>
      ) : (
        <path d="M8 17 L12 7 L16 17 Z" stroke={s} strokeLinejoin="round" strokeWidth="1.3" fill="none" />
      )
    case 'polarizer':
      return isClassic ? (
        <>
          <circle cx="12" cy="12" r="6" stroke={s} strokeWidth="1.2" fill="none" />
          <path d="M8 16 L16 8" stroke={s} strokeLinecap="round" strokeWidth="1.2" />
          <path d="M14.5 9.5 L14.5 6" stroke={s} strokeLinecap="round" strokeWidth="0.9" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="6" stroke={s} strokeWidth="1.2" fill="none" />
          <path d="M8 16 L16 8" stroke={s} strokeLinecap="round" strokeWidth="1.2" />
          <path d="M15 9.5 L16.5 8" stroke={s} strokeLinecap="round" strokeWidth="1" />
        </>
      )
    case 'waveplate':
      return isClassic ? (
        <>
          <circle cx="12" cy="12" r="6" stroke={s} strokeWidth="1.2" fill="none" />
          <path d="M8 16 L16 8" stroke={s} strokeLinecap="round" strokeWidth="1.1" />
          <path d="M8 8 L16 16" stroke={s} strokeLinecap="round" strokeWidth="1.1" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="6" stroke={s} strokeWidth="1.2" fill="none" />
          <path d="M8 16 L16 8" stroke={s} strokeLinecap="round" strokeWidth="1.1" />
          <path d="M10 10 L14 14" stroke={s} strokeLinecap="round" strokeWidth="0.9" />
        </>
      )
    case 'iris':
      return isClassic ? (
        <>
          <circle cx="12" cy="12" r="6" stroke={s} strokeWidth="1.2" fill="none" />
          <path d="M12 6 L12 9.5" stroke={s} strokeLinecap="round" strokeWidth="1.3" />
          <path d="M12 14.5 L12 18" stroke={s} strokeLinecap="round" strokeWidth="1.3" />
        </>
      ) : (
        <>
          <path d="M12 6 L12 9.5" stroke={s} strokeLinecap="round" strokeWidth="1.5" />
          <path d="M12 14.5 L12 18" stroke={s} strokeLinecap="round" strokeWidth="1.5" />
          <path d="M10 9.8 L12 10.8 L14 9.8" stroke={s} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" fill="none" />
        </>
      )
    case 'bbo':
      return isClassic ? (
        <>
          <path d="M5 12 L12 6 L19 12 L12 18 Z" stroke={s} strokeLinejoin="round" strokeWidth="1.2" fill="none" />
          <path d="M6 12 L18 12" stroke={s} strokeLinecap="round" strokeWidth="0.9" />
        </>
      ) : (
        <path d="M5 12 L12 6 L19 12 L12 18 Z" stroke={s} strokeLinejoin="round" strokeWidth="1.2" fill="none" />
      )
    case 'telescope':
      return isClassic ? (
        <>
          <rect x="6" y="9" width="12" height="6" rx="1" stroke={s} strokeWidth="1.1" fill="none" />
          <circle cx="8.5" cy="12" r="2.2" stroke={s} strokeWidth="1" fill="none" />
          <circle cx="15.5" cy="12" r="2.2" stroke={s} strokeWidth="1" fill="none" />
        </>
      ) : (
        <>
          <ellipse cx="9" cy="12" rx="2" ry="5" stroke={s} strokeWidth="1.2" fill="none" />
          <ellipse cx="15" cy="12" rx="2" ry="5" stroke={s} strokeWidth="1.2" fill="none" />
          <path d="M11 12 L13 12" stroke={s} strokeLinecap="round" strokeWidth="0.9" />
        </>
      )
    case 'opa':
      return isClassic ? (
        <>
          <rect x="7" y="8.5" width="10" height="7" rx="1.5" stroke={s} strokeWidth="1.1" fill="none" />
          <path d="M5 12 L7 12" stroke={s} strokeLinecap="round" strokeWidth="1" />
          <path d="M17 12 L19 12" stroke={s} strokeLinecap="round" strokeWidth="1" />
          <path d="M10 10.5 L12.5 12 L10 13.5" stroke={s} strokeLinecap="round" strokeLinejoin="round" strokeWidth="0.9" fill="none" />
        </>
      ) : (
        <>
          <rect x="7" y="8.5" width="10" height="7" rx="1.5" stroke={s} strokeWidth="1.1" fill="none" />
          <path d="M5 12 L7 12" stroke={s} strokeLinecap="round" strokeWidth="1" />
          <path d="M17 12 L19 12" stroke={s} strokeLinecap="round" strokeWidth="1" />
        </>
      )
    case 'sample':
      return isClassic ? (
        <>
          <rect x="7" y="8" width="10" height="8" rx="0.5" stroke={s} strokeWidth="1.2" fill="none" />
          <path d="M9 14 L15 10" stroke={s} strokeLinecap="round" strokeWidth="0.9" />
        </>
      ) : (
        <rect x="7" y="8" width="10" height="8" rx="0.5" stroke={s} strokeWidth="1.2" fill="none" />
      )
    case 'fiber':
      return isClassic ? (
        <>
          <circle cx="8" cy="12" r="2.8" stroke={s} strokeWidth="1.1" fill="none" />
          <circle cx="16" cy="12" r="2.8" stroke={s} strokeWidth="1.1" fill="none" />
          <path d="M10.8 12 L13.2 12" stroke={s} strokeLinecap="round" strokeWidth="1.1" />
        </>
      ) : (
        <>
          <circle cx="9" cy="12" r="2.8" stroke={s} strokeWidth="1.1" fill="none" />
          <path d="M11.8 12 L18 12" stroke={s} strokeLinecap="round" strokeWidth="1.2" />
        </>
      )
    case 'spectrometer':
      return isClassic ? (
        <>
          <rect x="6" y="7.5" width="12" height="9" rx="1" stroke={s} strokeWidth="1.1" fill="none" />
          <path d="M10 10.5 L12.5 12 L10 13.5" stroke={s} strokeLinecap="round" strokeLinejoin="round" strokeWidth="0.9" fill="none" />
          <path d="M15 10 L17 10.5" stroke={s} strokeLinecap="round" strokeWidth="0.9" />
        </>
      ) : (
        <>
          <rect x="6" y="7.5" width="12" height="9" rx="1" stroke={s} strokeWidth="1.1" fill="none" />
          <circle cx="10" cy="12" r="1.8" stroke={s} strokeWidth="0.9" fill="none" />
          <circle cx="14.5" cy="12" r="1.8" stroke={s} strokeWidth="0.9" fill="none" />
        </>
      )
    case 'detector':
      return isClassic ? (
        <>
          <path d="M14 6.5 A6 6 0 0 0 14 17.5" stroke={s} strokeWidth="1.3" fill="none" />
          <path d="M14 6.5 L14 17.5" stroke={s} strokeLinecap="round" strokeWidth="1.3" />
          <path d="M7 12 L10 12" stroke={s} strokeLinecap="round" strokeWidth="1" />
        </>
      ) : (
        <>
          <path d="M14 6.5 A6 6 0 0 0 14 17.5" stroke={s} strokeWidth="1.3" fill="none" />
          <path d="M14 6.5 L14 17.5" stroke={s} strokeLinecap="round" strokeWidth="1.3" />
        </>
      )
    case 'beam-dump':
      return isClassic ? (
        <>
          <rect x="7" y="8" width="10" height="8" rx="1" stroke={s} strokeWidth="1.1" fill="none" />
          <path d="M9 8 L11 16" stroke={s} strokeLinecap="round" strokeWidth="0.8" />
          <path d="M12 8 L14 16" stroke={s} strokeLinecap="round" strokeWidth="0.8" />
          <path d="M15 8 L17 16" stroke={s} strokeLinecap="round" strokeWidth="0.8" />
        </>
      ) : (
        <>
          <rect x="7" y="8" width="10" height="8" rx="1" stroke={s} strokeWidth="1.1" fill="none" />
          <path d="M10 8 L12 16" stroke={s} strokeLinecap="round" strokeWidth="0.8" opacity="0.6" />
          <path d="M13 8 L15 16" stroke={s} strokeLinecap="round" strokeWidth="0.8" opacity="0.6" />
        </>
      )
    default:
      return <path d="M17 7 L7 17" stroke={s} strokeLinecap="round" strokeWidth="2" />
  }
}

function SimpleIconStyleOptionCopy({
  glyph,
  style,
}: {
  glyph: string
  style: 'enhanced' | 'classic'
}) {
  const isClassic = style === 'classic'

  return (
    <span className="inspector__icon-style-copy">
      <span
        aria-hidden="true"
        className={`inspector__icon-style-bubble${isClassic ? ' inspector__icon-style-bubble--classic' : ' inspector__icon-style-bubble--enhanced'}`}
      >
        <svg
          aria-hidden="true"
          className="inspector__icon-style-bubble-icon"
          fill="none"
          viewBox="0 0 24 24"
        >
          {renderIconStyleGlyph(glyph, isClassic)}
        </svg>
      </span>
      <span className="inspector__icon-style-copy-text">
        <strong>{isClassic ? 'Classic optics' : 'Enhanced'}</strong>
      </span>
    </span>
  )
}

interface CollapsibleSectionProps {
  children: ReactNode
  className?: string
  defaultOpen?: boolean
  summary?: ReactNode
  title: string
}

function CollapsibleSection({
  children,
  className,
  defaultOpen = false,
  summary,
  title,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  return (
    <div className={`inspector__subsection${className ? ` ${className}` : ''}`}>
      <button
        className="inspector__section-toggle"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <div className="inspector__section-toggle-title">
          <span className="inspector__section-chevron">
            {isOpen ? '\u25BE' : '\u25B8'}
          </span>
          <h3>{title}</h3>
        </div>
        {!isOpen && summary ? <div className="inspector__section-summary">{summary}</div> : null}
      </button>
      {isOpen ? <div className="inspector__section-body">{children}</div> : null}
    </div>
  )
}

function StepperButton({
  label,
  onClick,
  size = 'default',
}: {
  label: string
  onClick: () => void
  size?: 'default' | 'mini'
}) {
  return (
    <button
      className={`inspector__stepper${size === 'mini' ? ' inspector__stepper--mini' : ''}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  )
}

function PanelTitleEditor({
  onChange,
  value,
}: {
  onChange: (value: string) => void
  value: string
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    if (textareaRef.current) {
      const resize = () => {
        if (textareaRef.current) {
          textareaRef.current.style.height = '0px'
          const scrollHeight = textareaRef.current.scrollHeight
          const maxHeight = 60
          textareaRef.current.style.height = Math.min(scrollHeight, maxHeight) + 'px'
        }
      }
      resize()
      requestAnimationFrame(resize)
    }
  }, [value])

  useEffect(() => {
    if (textareaRef.current) {
      const resize = () => {
        if (textareaRef.current) {
          textareaRef.current.style.height = '0px'
          const scrollHeight = textareaRef.current.scrollHeight
          const maxHeight = 60
          textareaRef.current.style.height = Math.min(scrollHeight, maxHeight) + 'px'
        }
      }
      resize()
      requestAnimationFrame(resize)
    }
  }, [])

  return (
    <label className="panel__title-editor">
      <textarea
        aria-label="Selection label"
        className="panel__title-editor-input"
        onChange={(event) => onChange(event.target.value)}
        ref={textareaRef}
        rows={1}
        value={value}
      />
      <span aria-hidden="true" className="panel__title-editor-icon">
        <svg fill="none" viewBox="0 0 24 24">
          <path
            d="m6.2 16.9-.7 2.9 2.9-.7 9.2-9.2-2.2-2.2-9.2 9.2Z"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
          <path
            d="m14.9 6.6 2.2 2.2"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
        </svg>
      </span>
    </label>
  )
}

function AnnotationStackSection({
  annotations,
  onMove,
  onSelect,
  onSetHidden,
  onSetLayerBand,
  onSetLocked,
  selectedAnnotationId,
}: {
  annotations: SceneAnnotation[]
  onMove: (direction: 'forward' | 'backward' | 'front' | 'back') => void
  onSelect: (annotationId: string) => void
  onSetHidden: (hidden: boolean) => void
  onSetLayerBand: (layerBand: AnnotationLayerBand) => void
  onSetLocked: (locked: boolean) => void
  selectedAnnotationId?: string
}) {
  const orderedAnnotations = useMemo(
    () => [...sortAnnotationsByZIndex(annotations)].reverse(),
    [annotations],
  )

  if (orderedAnnotations.length === 0) {
    return (
      <CollapsibleSection defaultOpen title="Annotation Stack">
        <p className="inspector__empty">No annotations on the canvas yet.</p>
      </CollapsibleSection>
    )
  }

  return (
    <CollapsibleSection defaultOpen title="Annotation Stack">
      <div className="inspector__stack">
        {orderedAnnotations.map((annotation) => {
          const isSelected = annotation.id === selectedAnnotationId
          return (
            <div
              className={`inspector__stack-row${isSelected ? ' is-selected' : ''}`}
              key={annotation.id}
            >
              <button
                className="inspector__stack-select"
                onClick={() => onSelect(annotation.id)}
                type="button"
              >
                <strong>{getAnnotationKindLabel(annotation)}</strong>
                <span>{annotation.id}</span>
              </button>
              <div className="inspector__stack-actions">
                <button
                  className={annotation.hidden ? 'is-active' : undefined}
                  onClick={() => {
                    if (isSelected) {
                      onSetHidden(!annotation.hidden)
                    } else {
                      onSelect(annotation.id)
                    }
                  }}
                  title={annotation.hidden ? 'Show' : 'Hide'}
                  type="button"
                >
                  {annotation.hidden ? 'Show' : 'Hide'}
                </button>
                <button
                  className={annotation.locked ? 'is-active' : undefined}
                  onClick={() => {
                    if (isSelected) {
                      onSetLocked(!annotation.locked)
                    } else {
                      onSelect(annotation.id)
                    }
                  }}
                  title={annotation.locked ? 'Unlock' : 'Lock'}
                  type="button"
                >
                  {annotation.locked ? 'Unlock' : 'Lock'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {selectedAnnotationId ? (
        <div className="inspector__annotation-controls">
          <div className="inspector__button-row">
            <button onClick={() => onMove('back')} type="button">
              Send to Back
            </button>
            <button onClick={() => onMove('backward')} type="button">
              Backward
            </button>
            <button onClick={() => onMove('forward')} type="button">
              Forward
            </button>
            <button onClick={() => onMove('front')} type="button">
              Bring to Front
            </button>
          </div>
          <div className="inspector__button-row">
            <button onClick={() => onSetLayerBand('below-components')} type="button">
              Below Components
            </button>
            <button onClick={() => onSetLayerBand('above-components')} type="button">
              Above Components
            </button>
          </div>
        </div>
      ) : null}
    </CollapsibleSection>
  )
}

function formatMountMode(mode: string) {
  switch (mode) {
    case 'hole-mounted':
      return 'Hole mounted'
    case 'clamp-capable':
      return 'Clamp capable'
    case 'external-source':
      return 'External source'
    default:
      return mode
  }
}

function formatDirection(port: WorldPort) {
  return port.worldDirection.charAt(0).toUpperCase() + port.worldDirection.slice(1)
}

function formatFilterClass(transmissionClass?: FilterTransmissionClass) {
  switch (transmissionClass) {
    case 'passband':
      return 'Passband'
    case 'partial':
      return 'Partial'
    case 'stopband':
      return 'Stopband'
    default:
      return 'n/a'
  }
}

function formatBranchKind(branchKind: string) {
  switch (branchKind) {
    case 'root':
      return 'Source'
    case 'continued':
      return 'Continued'
    case 'reflected':
      return 'Reflected'
    case 'transmitted':
      return 'Transmitted'
    case 'generated-shg':
      return 'Generated SHG'
    default:
      return branchKind
  }
}

function formatGaussianStatus(status?: string) {
  switch (status) {
    case 'clear':
      return 'Clear'
    case 'near-limit':
      return 'Near limit'
    case 'overfill':
      return 'Overfill'
    default:
      return 'n/a'
  }
}

function formatCurvature(radiusOfCurvatureMm?: number) {
  if (radiusOfCurvatureMm === undefined) {
    return 'Flat / collimated'
  }

  return `${radiusOfCurvatureMm.toFixed(2)} mm`
}

function describePlacementReason(reason: string) {
  switch (reason) {
    case 'off-hole':
      return 'hole-mounted component is off the breadboard hole field'
    case 'support-outside-board':
      return 'mount support extends outside the allowed placement region'
    case 'footprint-overhang':
      return 'component footprint extends outside the breadboard or launch edge'
    case 'occupied':
      return 'mount envelope overlaps another component'
    case 'outside-source-lane':
      return 'external sources must stay on the chosen launch edge'
    case 'snap-preview':
      return 'drop here to capture the highlighted snap location'
    default:
      return undefined
  }
}

function formatEventOutputs(event: BeamInteractionEvent) {
  const parts: string[] = []

  if (event.transmittedPowerMw !== undefined) {
    parts.push(`T ${event.transmittedPowerMw.toFixed(2)} mW`)
  }

  if (event.reflectedPowerMw !== undefined) {
    parts.push(`R ${event.reflectedPowerMw.toFixed(2)} mW`)
  }

  if (event.generatedPowerMw !== undefined) {
    parts.push(`SHG ${event.generatedPowerMw.toFixed(2)} mW`)
  }

  if (event.capturedPowerMw !== undefined) {
    parts.push(`Captured ${event.capturedPowerMw.toFixed(2)} mW`)
  }

  return parts.join(' • ') || 'No surviving output'
}

function BeamInspectionSection({
  beamTrace,
  defaultOpen = false,
  gaussianTrace,
}: {
  beamTrace: BeamTraceResult
  defaultOpen?: boolean
  gaussianTrace: GaussianTraceResult
}) {
  const {
    selectedBeamInteractionId,
    selectedBeamPathId,
    selectedBeamSegmentId,
  } = useBeamInspectionState()
  const beamSelection = useMemo(
    () =>
      getBeamSelectionSnapshot(beamTrace, {
        interactionId: selectedBeamInteractionId,
        pathId: selectedBeamPathId,
        segmentId: selectedBeamSegmentId,
      }),
    [
      beamTrace,
      selectedBeamInteractionId,
      selectedBeamPathId,
      selectedBeamSegmentId,
    ],
  )
  const gaussianPath = useMemo(
    () => getGaussianPathAnalysis(gaussianTrace, beamSelection.path?.pathId),
    [beamSelection.path?.pathId, gaussianTrace],
  )
  const gaussianSegment = useMemo(
    () => getGaussianSegmentAnalysis(gaussianTrace, beamSelection.segment?.id),
    [beamSelection.segment?.id, gaussianTrace],
  )
  const gaussianPathTableRows = useMemo(
    () =>
      getGaussianPathTableRows(
        beamTrace,
        gaussianTrace,
        beamSelection.path?.pathId ??
          beamSelection.segment?.pathId ??
          beamSelection.interaction?.pathId,
      ),
    [beamSelection.interaction?.pathId, beamSelection.path?.pathId, beamSelection.segment?.pathId, beamTrace, gaussianTrace],
  )
  const gaussianInteraction = useMemo(
    () =>
      getGaussianInteractionAnalysis(
        gaussianTrace,
        beamSelection.interaction?.id,
      ),
    [beamSelection.interaction?.id, gaussianTrace],
  )
  const activeGaussianReadout =
    gaussianInteraction?.local ?? gaussianSegment?.end ?? gaussianPath?.final

  if (!beamSelection.path && !beamSelection.segment && !beamSelection.interaction) {
    return null
  }

  return (
    <CollapsibleSection defaultOpen={defaultOpen} title="Beam Inspection">
      <div className="inspector__readout">
        <div>
          <span>Source</span>
          <strong>
            {beamSelection.path?.sourceLabel ??
              beamSelection.interaction?.sourceLabel ??
              'Beam path'}
          </strong>
        </div>
        <div>
          <span>Path</span>
          <strong>
            {beamSelection.path?.pathId ??
              beamSelection.segment?.pathId ??
              beamSelection.interaction?.pathId ??
              'n/a'}
          </strong>
        </div>
        <div>
          <span>Segment</span>
          <strong>
            {beamSelection.segment?.id ??
              beamSelection.interaction?.inputSegmentId ??
              'n/a'}
          </strong>
        </div>
        <div>
          <span>Role</span>
          <strong>
            {beamSelection.path?.pathRole ??
              beamSelection.segment?.pathRole ??
              'fundamental'}
          </strong>
        </div>
        <div>
          <span>Branch</span>
          <strong>
            {beamSelection.path
              ? formatBranchKind(beamSelection.path.branchKind)
              : beamSelection.segment?.branchKind ?? 'n/a'}
          </strong>
        </div>
        <div>
          <span>Polarization</span>
          <strong>
            {beamSelection.interaction?.polarization.tag ??
              beamSelection.segment?.polarization.tag ??
              'n/a'}
          </strong>
        </div>
        <div>
          <span>Wavelength</span>
          <strong>
            {(
              beamSelection.segment?.wavelengthNm ??
              beamSelection.interaction?.wavelengthNm ??
              beamSelection.path?.wavelengthNm ??
              0
            ).toFixed(1)}{' '}
            nm
          </strong>
        </div>
        <div>
          <span>Bandwidth</span>
          <strong>
            {(
              beamSelection.segment?.bandwidthNm ??
              beamSelection.interaction?.bandwidthNm ??
              beamSelection.path?.bandwidthNm ??
              0
            ).toFixed(2)}{' '}
            nm
          </strong>
        </div>
        <div>
          <span>Segment power</span>
          <strong>
            {beamSelection.segment
              ? `${beamSelection.segment.powerMw.toFixed(2)} mW`
              : 'n/a'}
          </strong>
        </div>
        <div>
          <span>Path final power</span>
          <strong>
            {beamSelection.path
              ? `${beamSelection.path.finalPowerMw.toFixed(2)} mW`
              : 'n/a'}
          </strong>
        </div>
        <div>
          <span>Selected optic</span>
          <strong>{beamSelection.interaction?.componentLabel ?? 'n/a'}</strong>
        </div>
        <div>
          <span>Optical path</span>
          <strong>
            {beamSelection.segment
              ? `${beamSelection.segment.opticalPathMm.toFixed(2)} mm`
              : beamSelection.path
                ? `${beamSelection.path.totalOpticalPathMm.toFixed(2)} mm`
                : 'n/a'}
          </strong>
        </div>
        <div>
          <span>Delay</span>
          <strong>
            {beamSelection.segment
              ? `${beamSelection.segment.timeDelayFs.toFixed(1)} fs`
              : beamSelection.path
                ? `${beamSelection.path.finalTimeDelayFs.toFixed(1)} fs`
                : 'n/a'}
          </strong>
        </div>
        <div>
          <span>Outcome</span>
          <strong>
            {beamSelection.interaction?.outcomeClass ??
              beamSelection.path?.outcomeClass ??
              'n/a'}
          </strong>
        </div>
        <div>
          <span>Spot radius</span>
          <strong>
            {activeGaussianReadout
              ? `${activeGaussianReadout.spotRadiusMm.toFixed(3)} mm`
              : 'n/a'}
          </strong>
        </div>
        <div>
          <span>Waist radius</span>
          <strong>
            {activeGaussianReadout
              ? `${activeGaussianReadout.waistRadiusMm.toFixed(3)} mm`
              : 'n/a'}
          </strong>
        </div>
        <div>
          <span>Waist offset</span>
          <strong>
            {activeGaussianReadout
              ? `${activeGaussianReadout.waistOffsetMm.toFixed(2)} mm`
              : 'n/a'}
          </strong>
        </div>
        <div>
          <span>Rayleigh range</span>
          <strong>
            {activeGaussianReadout
              ? `${activeGaussianReadout.rayleighRangeMm.toFixed(2)} mm`
              : 'n/a'}
          </strong>
        </div>
        <div>
          <span>Curvature</span>
          <strong>
            {activeGaussianReadout
              ? formatCurvature(activeGaussianReadout.radiusOfCurvatureMm)
              : 'n/a'}
          </strong>
        </div>
        <div>
          <span>Aperture</span>
          <strong>{formatGaussianStatus(gaussianInteraction?.apertureStatus)}</strong>
        </div>
      </div>

      {beamSelection.interaction ? (
        <div className="inspector__card">
          <strong>{beamSelection.interaction.componentLabel}</strong>
          <span>
            {beamSelection.interaction.interactionKind} at (
            {beamSelection.interaction.hitPointMm.x.toFixed(1)},{' '}
            {beamSelection.interaction.hitPointMm.y.toFixed(1)}) mm
          </span>
          <span>{formatEventOutputs(beamSelection.interaction)}</span>
          <span>
            Loss {(beamSelection.interaction.lostPowerMw ?? 0).toFixed(2)} mW
          </span>
          <span>
            {beamSelection.interaction.partialAcceptance
              ? 'Partial acceptance'
              : 'Full aperture'}
            {beamSelection.interaction.wasClipped ? ' • clipped' : ''}
          </span>
          {gaussianInteraction ? (
            <span>
              {gaussianInteraction.local.beamDiameterMm.toFixed(3)} mm beam •{' '}
              {formatGaussianStatus(gaussianInteraction.apertureStatus)}
            </span>
          ) : null}
          {beamSelection.interaction.note ? (
            <span>{beamSelection.interaction.note}</span>
          ) : null}
        </div>
      ) : null}

      {gaussianPathTableRows.length > 0 ? (
        <div className="inspector__table">
          <div className="inspector__table-row inspector__table-row--head">
            <span>Segment / Optic</span>
            <span>z</span>
            <span>Spot / Waist</span>
            <span>Curvature / Aperture</span>
          </div>

          {gaussianPathTableRows.map((row) => (
            <div className="inspector__table-row" key={row.id}>
              <div>
                <strong>{row.label}</strong>
                <span>{row.kind}</span>
              </div>
              <div>
                <strong>{row.zPositionMm.toFixed(2)} mm</strong>
                <span>waist @ {row.waistOffsetMm.toFixed(2)} mm</span>
                <span>{row.timeDelayFs.toFixed(1)} fs</span>
              </div>
              <div>
                <strong>{row.spotRadiusMm.toFixed(3)} mm r</strong>
                <span>{row.beamDiameterMm.toFixed(3)} mm dia</span>
                <span>{row.waistRadiusMm.toFixed(3)} mm waist</span>
              </div>
              <div>
                <strong>{formatCurvature(row.curvatureMm)}</strong>
                <span>zR {row.rayleighRangeMm.toFixed(2)} mm</span>
                <span>{formatGaussianStatus(row.apertureStatus)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </CollapsibleSection>
  )
}

function InteractionTable({ events }: { events: BeamInteractionEvent[] }) {
  if (events.length === 0) {
    return <p className="inspector__empty">No beam interactions recorded yet.</p>
  }

  return (
    <div className="inspector__table">
      <div className="inspector__table-row inspector__table-row--head">
        <span>Beam / Source</span>
        <span>λ / Pol</span>
        <span>In / Out / Loss</span>
        <span>Status</span>
      </div>

      {events.map((event) => (
        <div className="inspector__table-row" key={event.id}>
          <div>
            <strong>{event.pathId}</strong>
            <span>{event.sourceLabel}</span>
          </div>
          <div>
            <strong>{event.wavelengthNm.toFixed(1)} nm</strong>
            <span>{event.polarization.tag}</span>
          </div>
          <div>
            <strong>{event.incomingPowerMw.toFixed(2)} mW in</strong>
            <span>{formatEventOutputs(event)}</span>
            <span>Loss {(event.lostPowerMw ?? 0).toFixed(2)} mW</span>
          </div>
          <div>
            <strong>{event.outcomeClass}</strong>
            <span>
              {event.partialAcceptance ? 'Partial acceptance' : 'Full acceptance'}
              {event.wasClipped ? ' • clipped' : ''}
            </span>
            {event.filterTransmissionClass ? (
              <span>{formatFilterClass(event.filterTransmissionClass)}</span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

export function InspectorPanel({
  beamTrace,
  gaussianTrace,
  onCollapse,
}: InspectorPanelProps) {
  const scene = useEditorStore((state) => state.scene)
  const selection = useEditorStore((state) => state.selection)
  const {
    activeHostSurfaceId,
    notice: interactionNotice,
    pendingBreadboardPlacement,
    pendingPlacement,
  } = useInspectorInteractionState()
  const updateBreadboard = useEditorStore((state) => state.updateBreadboard)
  const applyBreadboardPreset = useEditorStore(
    (state) => state.applyBreadboardPreset,
  )
  const updateBreadboardPosition = useEditorStore((state) => state.updateBreadboardPosition)
  const updateOpticalTable = useEditorStore((state) => state.updateOpticalTable)
  const selectBreadboard = useEditorStore((state) => state.selectBreadboard)
  const selectOpticalTable = useEditorStore((state) => state.selectOpticalTable)
  const setActiveHostSurfaceId = useEditorStore(
    (state) => state.setActiveHostSurfaceId,
  )
  const updateBeamSettings = useEditorStore((state) => state.updateBeamSettings)
  const updateSelectedComponent = useEditorStore(
    (state) => state.updateSelectedComponent,
  )
  const updateSelectedVariant = useEditorStore(
    (state) => state.updateSelectedVariant,
  )
  const updateSelectedSource = useEditorStore((state) => state.updateSelectedSource)
  const applySelectedSourcePreset = useEditorStore(
    (state) => state.applySelectedSourcePreset,
  )
  const alignSelectedSourceToTarget = useEditorStore(
    (state) => state.alignSelectedSourceToTarget,
  )
  const updateSelectedBeamSplitter = useEditorStore(
    (state) => state.updateSelectedBeamSplitter,
  )
  const updateSelectedLens = useEditorStore((state) => state.updateSelectedLens)
  const updateSelectedCurvedMirror = useEditorStore(
    (state) => state.updateSelectedCurvedMirror,
  )
  const updateSelectedFlipMirror = useEditorStore(
    (state) => state.updateSelectedFlipMirror,
  )
  const updateSelectedAttenuator = useEditorStore(
    (state) => state.updateSelectedAttenuator,
  )
  const updateSelectedPolarizer = useEditorStore(
    (state) => state.updateSelectedPolarizer,
  )
  const updateSelectedWaveplate = useEditorStore(
    (state) => state.updateSelectedWaveplate,
  )
  const updateSelectedIris = useEditorStore((state) => state.updateSelectedIris)
  const updateSelectedBboCrystal = useEditorStore(
    (state) => state.updateSelectedBboCrystal,
  )
  const updateSelectedDelayLine = useEditorStore(
    (state) => state.updateSelectedDelayLine,
  )
  const updateSelectedTelescope = useEditorStore(
    (state) => state.updateSelectedTelescope,
  )
  const updateSelectedOpa = useEditorStore((state) => state.updateSelectedOpa)
  const updateSelectedSupport = useEditorStore(
    (state) => state.updateSelectedSupport,
  )
  const updateSelectedGeometryOverride = useEditorStore(
    (state) => state.updateSelectedGeometryOverride,
  )
  const updateSelectedTextAnnotation = useEditorStore(
    (state) => state.updateSelectedTextAnnotation,
  )
  const updateSelectedTextStyle = useEditorStore(
    (state) => state.updateSelectedTextStyle,
  )
  const updateSelectedShapeAnnotation = useEditorStore(
    (state) => state.updateSelectedShapeAnnotation,
  )
  const updateSelectedShapeStyle = useEditorStore(
    (state) => state.updateSelectedShapeStyle,
  )
  const updateSelectedAnnotationVisibility = useEditorStore(
    (state) => state.updateSelectedAnnotationVisibility,
  )
  const updateSelectedAnnotationLock = useEditorStore(
    (state) => state.updateSelectedAnnotationLock,
  )
  const updateSelectedAnnotationLayerBand = useEditorStore(
    (state) => state.updateSelectedAnnotationLayerBand,
  )
  const moveSelectedAnnotationInStack = useEditorStore(
    (state) => state.moveSelectedAnnotationInStack,
  )
  const stepSelectedAnnotationSize = useEditorStore(
    (state) => state.stepSelectedAnnotationSize,
  )
  const clearSelectedGeometryOverride = useEditorStore(
    (state) => state.clearSelectedGeometryOverride,
  )
  const updateSelectedPostHolderDiameter = useEditorStore(
    (state) => state.updateSelectedPostHolderDiameter,
  )
  const setSimpleGlyphAppearance = useEditorStore(
    (state) => state.setSimpleGlyphAppearance,
  )
  const setSelectedSimpleIconStyleOverride = useEditorStore(
    (state) => state.setSelectedSimpleIconStyleOverride,
  )
  const simpleGlyphAppearances = useEditorStore(
    (state) => state.simpleGlyphAppearances,
  )
  const simpleIconStyle = useEditorStore((state) => state.simpleIconStyle)
  const setShowBeamDetails = useEditorStore((state) => state.setShowBeamDetails)
  const setShowGaussianEnvelope = useEditorStore(
    (state) => state.setShowGaussianEnvelope,
  )
  const showBeamDetails = useEditorStore((state) => state.interaction.showBeamDetails)
  const showGaussianEnvelope = useEditorStore(
    (state) => state.interaction.showGaussianEnvelope,
  )
  const selectAnnotation = useEditorStore((state) => state.selectAnnotation)
  const applySupportToType = useEditorStore((state) => state.applySupportToType)
  const setMountDefaultForType = useEditorStore(
    (state) => state.setMountDefaultForType,
  )
  const mountVisibilityDefaults = useEditorStore(
    (state) => state.mountVisibilityDefaults,
  )
  const linkableSources = useMemo(
    () =>
      scene.components.filter(
        (component) =>
          component.id !==
            (selection.type === 'component' ? selection.componentId : undefined) &&
          component.config.source?.isEnabled,
      ),
    [scene.components, selection],
  )

  const selectedComponent =
    selection.type === 'component'
      ? scene.components.find(
          (component) => component.id === selection.componentId,
        ) ?? null
      : null
  const selectedAnnotation =
    selection.type === 'annotation'
      ? scene.annotations.find((annotation) => annotation.id === selection.annotationId) ?? null
      : null
  const inspectedComponent = pendingPlacement
    ? {
        ...pendingPlacement.draft,
        anchorMm: pendingPlacement.candidateAnchorMm,
      }
    : selectedComponent
  const inspectedComponentId = pendingPlacement?.draft.id ?? selectedComponent?.id
  const primaryBreadboard = getWorkspacePrimaryBreadboard(scene)
  const opticalTable = getOpticalTable(scene)
  const breadboardInstances = getBreadboardInstances(scene)
  const activeBreadboardInstance =
    scene.workspace.kind === 'optical-table'
      ? breadboardInstances.find((breadboard) => breadboard.id === activeHostSurfaceId) ??
        breadboardInstances[0]
      : undefined
  const activeBreadboard =
    pendingBreadboardPlacement?.model ??
    getSingleBreadboard(scene) ??
    activeBreadboardInstance?.model ??
    primaryBreadboard
  const boardLabel =
    pendingBreadboardPlacement?.label ??
    getSingleBreadboard(scene)?.label ??
    activeBreadboardInstance?.label ??
    activeBreadboard.label

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`)
    e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`)
  }

  if (selectedAnnotation) {
    return (
      <aside className="panel inspector" data-tour="inspector" onMouseMove={handleMouseMove}>
        <div className="panel__header">
          <div className="panel__header-top">
            <div>
              <h2>
                {selectedAnnotation.kind === 'text'
                  ? 'Text annotation'
                  : selectedAnnotation.kind === 'shape'
                    ? `${selectedAnnotation.shapeKind[0]!.toUpperCase()}${selectedAnnotation.shapeKind.slice(1)} annotation`
                    : 'Line annotation'}
              </h2>
              <span className="panel__meta-text">
                {selectedAnnotation.locked ? 'Locked' : 'Editable'} ·{' '}
                {selectedAnnotation.hidden ? 'Hidden' : 'Visible'}
              </span>
            </div>
            <button
              aria-label="Collapse inspector"
              className="panel__collapse-chevron"
              data-tour="panel-inspector-toggle"
              onClick={onCollapse}
              type="button"
            >
              <svg fill="none" viewBox="0 0 24 24">
                <path
                  d="M9 6l6 6-6 6"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="inspector__content">
          <div className="inspector__subsection">
            <h3>Selection</h3>
            <div className="inspector__button-row">
              <button
                className={selectedAnnotation.hidden ? 'is-active' : undefined}
                onClick={() =>
                  updateSelectedAnnotationVisibility(!selectedAnnotation.hidden)
                }
                type="button"
              >
                {selectedAnnotation.hidden ? 'Hidden' : 'Visible'}
              </button>
              <button
                className={selectedAnnotation.locked ? 'is-active' : undefined}
                onClick={() =>
                  updateSelectedAnnotationLock(!selectedAnnotation.locked)
                }
                type="button"
              >
                {selectedAnnotation.locked ? 'Locked' : 'Unlocked'}
              </button>
            </div>
            <div className="inspector__button-row">
              <button
                className={
                  selectedAnnotation.layerBand === 'below-components'
                    ? 'is-active'
                    : undefined
                }
                onClick={() => updateSelectedAnnotationLayerBand('below-components')}
                type="button"
              >
                Below Components
              </button>
              <button
                className={
                  selectedAnnotation.layerBand === 'above-components'
                    ? 'is-active'
                    : undefined
                }
                onClick={() => updateSelectedAnnotationLayerBand('above-components')}
                type="button"
              >
                Above Components
              </button>
            </div>
          </div>

          <AnnotationStackSection
            annotations={scene.annotations}
            onMove={moveSelectedAnnotationInStack}
            onSelect={selectAnnotation}
            onSetHidden={updateSelectedAnnotationVisibility}
            onSetLayerBand={updateSelectedAnnotationLayerBand}
            onSetLocked={updateSelectedAnnotationLock}
            selectedAnnotationId={selectedAnnotation.id}
          />

          {selectedAnnotation.kind === 'text' ? (
            <div className="inspector__subsection">
              <h3>Text</h3>
              <Field label="Variant">
                <select
                  onChange={(event) =>
                    updateSelectedTextAnnotation({
                      variant: event.target.value as AnnotationText['variant'],
                    })
                  }
                  value={selectedAnnotation.variant}
                >
                  {ANNOTATION_TEXT_VARIANT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Content">
                <textarea
                  className="inspector__textarea"
                  onChange={(event) =>
                    updateSelectedTextAnnotation({ text: event.target.value })
                  }
                  rows={5}
                  value={selectedAnnotation.text}
                />
              </Field>

              <div className="inspector__grid">
                <NumberField
                  label="X position"
                  onChange={(x) =>
                    updateSelectedTextAnnotation({
                      anchorMm: { x, y: selectedAnnotation.anchorMm.y },
                    })
                  }
                  suffix="mm"
                  value={selectedAnnotation.anchorMm.x}
                />
                <NumberField
                  label="Y position"
                  onChange={(y) =>
                    updateSelectedTextAnnotation({
                      anchorMm: { x: selectedAnnotation.anchorMm.x, y },
                    })
                  }
                  suffix="mm"
                  value={selectedAnnotation.anchorMm.y}
                />
                <NumberField
                  label="Width"
                  onChange={(widthMm) => updateSelectedTextAnnotation({ widthMm })}
                  suffix="mm"
                  value={selectedAnnotation.widthMm}
                />
                <NumberField
                  label="Font size"
                  onChange={(fontSizeMm) =>
                    updateSelectedTextStyle({ fontSizeMm })
                  }
                  suffix="mm"
                  value={selectedAnnotation.style.fontSizeMm}
                />
              </div>

              <div className="inspector__button-row inspector__button-row--compact">
                <StepperButton
                  label="-"
                  onClick={() => stepSelectedAnnotationSize(-1)}
                />
                <StepperButton
                  label="+"
                  onClick={() => stepSelectedAnnotationSize(1)}
                />
              </div>

              <Field label="Font">
                <select
                  onChange={(event) =>
                    updateSelectedTextStyle({
                      fontFamily: event.target.value as AnnotationText['style']['fontFamily'],
                    })
                  }
                  value={selectedAnnotation.style.fontFamily}
                >
                  {ANNOTATION_FONT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="inspector__grid">
                <Field label="Text color">
                  <input
                    onChange={(event) =>
                      updateSelectedTextStyle({ color: event.target.value })
                    }
                    type="color"
                    value={selectedAnnotation.style.color}
                  />
                </Field>
                <Field label="Paper">
                  <input
                    disabled={selectedAnnotation.variant === 'plain'}
                    onChange={(event) =>
                      updateSelectedTextAnnotation({
                        backgroundColor: event.target.value,
                      })
                    }
                    type="color"
                    value={
                      selectedAnnotation.backgroundColor.startsWith('#')
                        ? selectedAnnotation.backgroundColor
                        : '#1f3c4d'
                    }
                  />
                </Field>
              </div>

              <div className="inspector__grid">
                <Field label="Border">
                  <input
                    disabled={selectedAnnotation.variant === 'plain'}
                    onChange={(event) =>
                      updateSelectedTextAnnotation({
                        borderColor: event.target.value,
                      })
                    }
                    type="color"
                    value={
                      selectedAnnotation.borderColor.startsWith('#')
                        ? selectedAnnotation.borderColor
                        : '#75abc5'
                    }
                  />
                </Field>
                {selectedAnnotation.variant === 'callout-bubble' ? (
                  <NumberField
                    label="Tail X"
                    onChange={(x) =>
                      updateSelectedTextAnnotation({
                        tailMm: {
                          x,
                          y:
                            selectedAnnotation.tailMm?.y ??
                            selectedAnnotation.anchorMm.y + 46,
                        },
                      })
                    }
                    suffix="mm"
                    value={
                      selectedAnnotation.tailMm?.x ??
                      selectedAnnotation.anchorMm.x + 26
                    }
                  />
                ) : (
                  <div />
                )}
              </div>

              {selectedAnnotation.variant === 'callout-bubble' ? (
                <NumberField
                  label="Tail Y"
                  onChange={(y) =>
                    updateSelectedTextAnnotation({
                      tailMm: {
                        x:
                          selectedAnnotation.tailMm?.x ??
                          selectedAnnotation.anchorMm.x + 26,
                        y,
                      },
                    })
                  }
                  suffix="mm"
                  value={
                    selectedAnnotation.tailMm?.y ??
                    selectedAnnotation.anchorMm.y + 46
                  }
                />
              ) : null}

              <div className="inspector__button-row">
                <button
                  className={selectedAnnotation.style.bold ? 'is-active' : undefined}
                  onClick={() =>
                    updateSelectedTextStyle({
                      bold: !selectedAnnotation.style.bold,
                    })
                  }
                  type="button"
                >
                  Bold
                </button>
                <button
                  className={selectedAnnotation.style.italic ? 'is-active' : undefined}
                  onClick={() =>
                    updateSelectedTextStyle({
                      italic: !selectedAnnotation.style.italic,
                    })
                  }
                  type="button"
                >
                  Italic
                </button>
                <button
                  className={selectedAnnotation.style.underline ? 'is-active' : undefined}
                  onClick={() =>
                    updateSelectedTextStyle({
                      underline: !selectedAnnotation.style.underline,
                    })
                  }
                  type="button"
                >
                  Underline
                </button>
              </div>

              <div className="inspector__button-row">
                <button
                  className={
                    selectedAnnotation.style.align === 'left' ? 'is-active' : undefined
                  }
                  onClick={() => updateSelectedTextStyle({ align: 'left' })}
                  type="button"
                >
                  Left
                </button>
                <button
                  className={
                    selectedAnnotation.style.align === 'center'
                      ? 'is-active'
                      : undefined
                  }
                  onClick={() => updateSelectedTextStyle({ align: 'center' })}
                  type="button"
                >
                  Center
                </button>
                <button
                  className={
                    selectedAnnotation.style.align === 'right' ? 'is-active' : undefined
                  }
                  onClick={() => updateSelectedTextStyle({ align: 'right' })}
                  type="button"
                >
                  Right
                </button>
              </div>
            </div>
          ) : selectedAnnotation.kind === 'shape' ? (
            <div className="inspector__subsection">
              <h3>Shape</h3>
              <Field label="Kind">
                <select
                  onChange={(event) =>
                    updateSelectedShapeStyle({
                      shapeKind: event.target.value as ShapeAnnotation['shapeKind'],
                    })
                  }
                  value={selectedAnnotation.shapeKind}
                >
                  {ANNOTATION_SHAPE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>

              {selectedAnnotation.shapeKind === 'arrow' ? (
                <div className="inspector__grid">
                  <NumberField
                    label="Start X"
                    onChange={(x) =>
                      updateSelectedShapeAnnotation({
                        startMm: { x, y: selectedAnnotation.startMm.y },
                      })
                    }
                    suffix="mm"
                    value={selectedAnnotation.startMm.x}
                  />
                  <NumberField
                    label="Start Y"
                    onChange={(y) =>
                      updateSelectedShapeAnnotation({
                        startMm: { x: selectedAnnotation.startMm.x, y },
                      })
                    }
                    suffix="mm"
                    value={selectedAnnotation.startMm.y}
                  />
                  <NumberField
                    label="End X"
                    onChange={(x) =>
                      updateSelectedShapeAnnotation({
                        endMm: { x, y: selectedAnnotation.endMm.y },
                      })
                    }
                    suffix="mm"
                    value={selectedAnnotation.endMm.x}
                  />
                  <NumberField
                    label="End Y"
                    onChange={(y) =>
                      updateSelectedShapeAnnotation({
                        endMm: { x: selectedAnnotation.endMm.x, y },
                      })
                    }
                    suffix="mm"
                    value={selectedAnnotation.endMm.y}
                  />
                </div>
              ) : (
                <div className="inspector__grid">
                  <NumberField
                    label="X position"
                    onChange={(x) =>
                      updateSelectedShapeAnnotation({
                        boundsMm: { x },
                      })
                    }
                    suffix="mm"
                    value={selectedAnnotation.boundsMm.x}
                  />
                  <NumberField
                    label="Y position"
                    onChange={(y) =>
                      updateSelectedShapeAnnotation({
                        boundsMm: { y },
                      })
                    }
                    suffix="mm"
                    value={selectedAnnotation.boundsMm.y}
                  />
                  <NumberField
                    label="Width"
                    onChange={(width) =>
                      updateSelectedShapeAnnotation({
                        boundsMm: { width },
                      })
                    }
                    suffix="mm"
                    value={selectedAnnotation.boundsMm.width}
                  />
                  <NumberField
                    label="Height"
                    onChange={(height) =>
                      updateSelectedShapeAnnotation({
                        boundsMm: { height },
                      })
                    }
                    suffix="mm"
                    value={selectedAnnotation.boundsMm.height}
                  />
                </div>
              )}

              <div className="inspector__button-row inspector__button-row--compact">
                <StepperButton
                  label="-"
                  onClick={() => stepSelectedAnnotationSize(-1)}
                />
                <StepperButton
                  label="+"
                  onClick={() => stepSelectedAnnotationSize(1)}
                />
              </div>

              <div className="inspector__grid">
                <Field label="Stroke">
                  <input
                    onChange={(event) =>
                      updateSelectedShapeStyle({ strokeColor: event.target.value })
                    }
                    type="color"
                    value={selectedAnnotation.strokeColor}
                  />
                </Field>
                <Field label="Fill">
                  <input
                    onChange={(event) =>
                      updateSelectedShapeStyle({ fillColor: event.target.value })
                    }
                    type="color"
                    value={
                      selectedAnnotation.fillColor.startsWith('#')
                        ? selectedAnnotation.fillColor
                        : '#61b4da'
                    }
                  />
                </Field>
              </div>

              <NumberField
                label="Stroke width"
                onChange={(strokeWidthMm) =>
                  updateSelectedShapeStyle({ strokeWidthMm })
                }
                suffix="mm"
                value={selectedAnnotation.strokeWidthMm}
              />

              <div className="inspector__button-row">
                <button
                  onClick={() =>
                    updateSelectedShapeStyle({ fillColor: 'transparent' })
                  }
                  type="button"
                >
                  No Fill
                </button>
              </div>
            </div>
          ) : (
            <div className="inspector__subsection">
              <h3>Line</h3>
              <div className="inspector__grid">
                <NumberField
                  label="Start X"
                  onChange={() => undefined}
                  suffix="mm"
                  value={selectedAnnotation.startMm.x}
                />
                <NumberField
                  label="Start Y"
                  onChange={() => undefined}
                  suffix="mm"
                  value={selectedAnnotation.startMm.y}
                />
                <NumberField
                  label="End X"
                  onChange={() => undefined}
                  suffix="mm"
                  value={selectedAnnotation.endMm.x}
                />
                <NumberField
                  label="End Y"
                  onChange={() => undefined}
                  suffix="mm"
                  value={selectedAnnotation.endMm.y}
                />
              </div>
              <p className="inspector__hint">
                Beam lines can be selected from the stack for visibility, locking, and
                ordering. Geometry remains controlled directly by drawing and line tools.
              </p>
            </div>
          )}

          <p className="inspector__hint">
            Annotation objects live in world-space, so they stay free on the canvas
            instead of attaching to a specific breadboard surface.
          </p>
        </div>
      </aside>
    )
  }

  if (!inspectedComponent) {
    const holeCounts = getBreadboardHoleCounts(activeBreadboard)
    const effectivePitchMm = getEffectiveHolePitchMm(activeBreadboard)
    const activeSourceCount = scene.components.filter(
      (component) => component.config.source?.isEnabled,
    ).length

    return (
      <aside className="panel inspector" data-tour="inspector" onMouseMove={handleMouseMove}>
        <div className="panel__header">
          <div className="panel__header-top">
            <div>
              <PanelTitleEditor
                onChange={(value) => {
                  if (selection.type === 'optical-table' && opticalTable) {
                    updateOpticalTable({ label: value })
                    return
                  }

                  updateBreadboard({ label: value })
                }}
                value={
                  selection.type === 'optical-table' && opticalTable
                      ? opticalTable.label
                      : boardLabel
                }
              />
              {pendingBreadboardPlacement ? (
                <span className="panel__meta-text">
                  Adjust the preset and dimensions before placement.
                </span>
              ) : null}
            </div>
            <button
              aria-label="Collapse inspector"
              className="panel__collapse-chevron"
              data-tour="panel-inspector-toggle"
              onClick={onCollapse}
              type="button"
            >
              <svg fill="none" viewBox="0 0 24 24">
                <path
                  d="M9 6l6 6-6 6"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="inspector__content">
          <BeamInspectionSection beamTrace={beamTrace} gaussianTrace={gaussianTrace} />

          <div className="inspector__subsection">
            {opticalTable && selection.type === 'optical-table' ? (
              <CollapsibleSection title="Table settings">
                <div className="inspector__grid">
                  <NumberField
                    label="Table width"
                    suffix="mm"
                    onChange={(widthMm) => updateOpticalTable({ widthMm })}
                    value={opticalTable.widthMm}
                  />
                  <NumberField
                    label="Table height"
                    suffix="mm"
                    onChange={(heightMm) => updateOpticalTable({ heightMm })}
                    value={opticalTable.heightMm}
                  />
                  <NumberField
                    label="Hole spacing"
                    suffix="mm"
                    onChange={(holeSpacingMm) => updateOpticalTable({ holeSpacingMm })}
                    value={opticalTable.holeSpacingMm}
                  />
                  <NumberField
                    label="Edge margin"
                    suffix="mm"
                    onChange={(edgeMarginMm) => updateOpticalTable({ edgeMarginMm })}
                    value={opticalTable.edgeMarginMm}
                  />
                </div>

                <CollapsibleSection title="Table construction">
                  <div className="inspector__grid">
                    <NumberField
                      label="Thickness"
                      suffix="mm"
                      onChange={(thicknessMm) => updateOpticalTable({ thicknessMm })}
                      value={opticalTable.thicknessMm}
                    />
                    <Field label="Hole density">
                      <select
                        onChange={(event) =>
                          updateOpticalTable({
                            holeDensity:
                              event.target.value as typeof opticalTable.holeDensity,
                          })
                        }
                        value={opticalTable.holeDensity}
                      >
                        <option value="single">Single density</option>
                        <option value="double">Double density</option>
                      </select>
                    </Field>
                    <Field label="Counterbores">
                      <select
                        onChange={(event) =>
                          updateOpticalTable({
                            counterborePattern:
                              event.target.value as typeof opticalTable.counterborePattern,
                          })
                        }
                        value={opticalTable.counterborePattern}
                      >
                        <option value="corner-25mm">Corner 25 mm inset</option>
                        <option value="none">None</option>
                      </select>
                    </Field>
                  </div>
                </CollapsibleSection>
              </CollapsibleSection>
            ) : null}

            <div className="inspector__subsection inspector__subsection--preset">
              <Field label="Preset">
                <select
                  onChange={(event) => {
                    if (event.target.value !== 'custom') {
                      applyBreadboardPreset(event.target.value)
                    }
                  }}
                  value={activeBreadboard.presetId ?? 'custom'}
                >
                  {BREADBOARD_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label.replace(/\s+metric$/i, '')}
                    </option>
                  ))}
                  <option value="custom">Custom</option>
                </select>
              </Field>
            </div>

            <CollapsibleSection
              defaultOpen
              title="Board dimensions"
            >
              {activeBreadboardInstance && opticalTable ? (
                <div className="inspector__grid inspector__grid--compact">
                  <NumberField
                    label="X position"
                    suffix="mm"
                    onChange={(x) =>
                      updateBreadboardPosition(activeBreadboardInstance.id, {
                        x,
                        y: activeBreadboardInstance.anchorMm.y,
                      })
                    }
                    value={activeBreadboardInstance.anchorMm.x}
                  />
                  <NumberField
                    label="Y position"
                    suffix="mm"
                    onChange={(y) =>
                      updateBreadboardPosition(activeBreadboardInstance.id, {
                        x: activeBreadboardInstance.anchorMm.x,
                        y,
                      })
                    }
                    value={activeBreadboardInstance.anchorMm.y}
                  />
                </div>
              ) : null}

              <div className="inspector__grid inspector__grid--compact">
                <NumberField
                  label="Width"
                  suffix="mm"
                  onChange={(widthMm) => updateBreadboard({ widthMm })}
                  value={activeBreadboard.widthMm}
                />
                <NumberField
                  label="Height"
                  suffix="mm"
                  onChange={(heightMm) => updateBreadboard({ heightMm })}
                  value={activeBreadboard.heightMm}
                />
                <NumberField
                  label="Hole spacing"
                  suffix="mm"
                  onChange={(holeSpacingMm) => updateBreadboard({ holeSpacingMm })}
                  value={activeBreadboard.holeSpacingMm}
                />
                <NumberField
                  label="Edge margin"
                  suffix="mm"
                  onChange={(edgeMarginMm) => updateBreadboard({ edgeMarginMm })}
                  value={activeBreadboard.edgeMarginMm}
                />
              </div>

              <CollapsibleSection title="Board construction">
                <div className="inspector__grid inspector__grid--compact">
                  <NumberField
                    label="Thickness"
                    suffix="mm"
                    onChange={(thicknessMm) => updateBreadboard({ thicknessMm })}
                    value={activeBreadboard.thicknessMm}
                  />

                  <Field label="Finish">
                    <select
                      onChange={(event) =>
                        updateBreadboard({
                          finish: event.target.value as typeof activeBreadboard.finish,
                        })
                      }
                      value={activeBreadboard.finish}
                    >
                      <option value="black-anodized">Black anodized</option>
                      <option value="clear-anodized">Clear anodized</option>
                    </select>
                  </Field>

                  <Field label="Hole density">
                    <select
                      onChange={(event) =>
                        updateBreadboard({
                          holeDensity:
                            event.target.value as typeof activeBreadboard.holeDensity,
                        })
                      }
                      value={activeBreadboard.holeDensity}
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
                            event.target.value as typeof activeBreadboard.counterborePattern,
                        })
                      }
                      value={activeBreadboard.counterborePattern}
                    >
                      <option value="corner-25mm">Corner 25 inset</option>
                      <option value="none">None</option>
                    </select>
                  </Field>
                </div>
              </CollapsibleSection>
            </CollapsibleSection>

            {opticalTable ? (
              <CollapsibleSection title="Host surfaces">
                <div className="inspector__list">
                  <button
                    className={`inspector__list-item${activeHostSurfaceId === 'optical-table' ? ' is-active-host' : ''}`}
                    onClick={() => {
                      if (pendingPlacement) {
                        setActiveHostSurfaceId('optical-table')
                        return
                      }

                      selectOpticalTable()
                    }}
                    type="button"
                  >
                    <strong>{opticalTable.label}</strong>
                    <span>Optical table surface</span>
                  </button>
                  {breadboardInstances.map((breadboard) => (
                    <button
                      className={`inspector__list-item${activeHostSurfaceId === breadboard.id ? ' is-active-host' : ''}`}
                      key={breadboard.id}
                      onClick={() => {
                        if (pendingPlacement) {
                          setActiveHostSurfaceId(breadboard.id)
                          return
                        }

                        selectBreadboard(breadboard.id)
                      }}
                      type="button"
                    >
                      <strong>{breadboard.label}</strong>
                      <span>
                        {breadboard.model.widthMm.toFixed(0)} × {breadboard.model.heightMm.toFixed(0)} mm
                      </span>
                    </button>
                  ))}
                </div>
              </CollapsibleSection>
            ) : null}
          </div>

          <CollapsibleSection title="Board statistics">
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
                <span>Active sources</span>
                <strong>{activeSourceCount}</strong>
              </div>
              <div>
                <span>Beam paths</span>
                <strong>{beamTrace.pathSummaries.length}</strong>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Beam Scene">
            <div className="inspector__grid">
              <Field label="Fidelity">
                <select
                  onChange={(event) =>
                    updateBeamSettings({
                      beamFidelityMode:
                        event.target.value as typeof scene.beamSettings.beamFidelityMode,
                    })
                  }
                  value={scene.beamSettings.beamFidelityMode}
                >
                  <option value="geometric">Geometric</option>
                  <option value="angle-sensitive">Angle-sensitive</option>
                </select>
              </Field>

              <NumberField
                label="Shared beam height"
                    suffix="mm"
                onChange={(sharedBeamHeightMm) =>
                  updateBeamSettings({ sharedBeamHeightMm })
                }
                value={scene.beamSettings.sharedBeamHeightMm}
              />
              <NumberField
                label="Default diameter"
                    suffix="mm"
                onChange={(defaultBeamDiameterMm) =>
                  updateBeamSettings({ defaultBeamDiameterMm })
                }
                value={scene.beamSettings.defaultBeamDiameterMm}
              />
              <NumberField
                label="Default divergence (mrad)"
                onChange={(defaultDivergenceMrad) =>
                  updateBeamSettings({ defaultDivergenceMrad })
                }
                value={scene.beamSettings.defaultDivergenceMrad}
              />
            </div>
            <div className="inspector__button-row inspector__button-row--compact">
              <button
                className={showBeamDetails ? 'is-active' : undefined}
                onClick={() => setShowBeamDetails(!showBeamDetails)}
                type="button"
              >
                {showBeamDetails ? 'Beam details on' : 'Beam details off'}
              </button>
              <button
                className={showGaussianEnvelope ? 'is-active' : undefined}
                onClick={() => setShowGaussianEnvelope(!showGaussianEnvelope)}
                type="button"
              >
                {showGaussianEnvelope ? 'Gaussian envelope on' : 'Gaussian envelope off'}
              </button>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Active Source Summaries">
            {beamTrace.summaries.length === 0 ? (
              <p className="inspector__empty">No active beams are being traced.</p>
            ) : (
              <div className="inspector__list">
                {beamTrace.summaries.map((summary) => (
                  <div className="inspector__list-item" key={summary.sourceComponentId}>
                    <strong>{summary.sourceLabel}</strong>
                    <span>
                      {summary.wavelengthNm.toFixed(1)} nm • {summary.bandwidthNm.toFixed(2)} nm BW
                    </span>
                    <span>{summary.polarizationTag}</span>
                    <span>
                      {summary.powerMw.toFixed(2)} mW • SHG {summary.generatedShgPowerMw.toFixed(2)} mW
                    </span>
                    <span>Terminal hits {summary.terminalCount}</span>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          {interactionNotice ? (
            <p className="inspector__notice">{interactionNotice}</p>
          ) : null}
        </div>
      </aside>
    )
  }

  const definition = getComponentDefinition(inspectedComponent.type)
  const spec = getResolvedComponentSpecForInstance(inspectedComponent)
  const simpleGlyphAppearance = inspectedComponentId
    ? simpleGlyphAppearances[inspectedComponentId]
    : undefined
  const variants = getComponentVariants(inspectedComponent.type)
  const worldPorts = getWorldPortsForComponent(inspectedComponent, spec)
  const rotatedFootprint = getRotatedFootprintBoundsMm(inspectedComponent, spec)
  const footprintSizeLabel = `${spec.footprintBoundsMm.width.toFixed(1)} × ${spec.footprintBoundsMm.height.toFixed(1)} mm`
  const rotatedBoundsSizeLabel = `${rotatedFootprint.width.toFixed(1)} × ${rotatedFootprint.height.toFixed(1)} mm`
  const showRotatedBounds =
    Math.abs(rotatedFootprint.width - spec.footprintBoundsMm.width) > 0.05 ||
    Math.abs(rotatedFootprint.height - spec.footprintBoundsMm.height) > 0.05
  const placement = inspectSceneComponentPlacement(scene, inspectedComponent, spec)
  const placementNotice = describePlacementReason(placement.reason)
  const placementStateLabel =
    placement.status.charAt(0).toUpperCase() + placement.status.slice(1)
  const placementStatusLabel =
    placement.reason !== 'none'
      ? `${placement.status === 'warning' ? 'Warning' : placementStateLabel} (${placement.reason})`
      : placementStateLabel
  const showSimpleAppearanceStrip = supportsSimpleGlyphAppearance(spec)
  const effectiveSimpleGlyphAppearance = simpleGlyphAppearance ?? {
    color: SIMPLE_APPEARANCE_SWATCHS[0],
    scale: 1,
    weight: 1,
  }
  const effectiveSimpleIconStyle =
    inspectedComponent.simpleIconStyleOverride ?? simpleIconStyle
  const hasSimpleIconStyleOverride =
    inspectedComponent.simpleIconStyleOverride !== undefined
  const selectedSimpleGlyphColorLabel =
    SIMPLE_APPEARANCE_SWATCH_OPTIONS.find(
      (option) => option.color === effectiveSimpleGlyphAppearance.color,
    )?.label ?? 'Custom'
  const isAppearanceCustomized =
    effectiveSimpleGlyphAppearance.color !== SIMPLE_APPEARANCE_SWATCHS[0] ||
    Math.abs(effectiveSimpleGlyphAppearance.scale - 1) > 0.001 ||
    Math.abs(effectiveSimpleGlyphAppearance.weight - 1) > 0.001
  const beamEvents = beamTrace.events.filter(
    (event) => event.componentId === inspectedComponent.id,
  )
  const sourceSummary = beamTrace.summaries.find(
    (summary) => summary.sourceComponentId === inspectedComponent.id,
  )
  const gaussianSourceSummary = getGaussianSourceSummary(
    gaussianTrace,
    inspectedComponent.id,
  )
  const terminalCapture = beamTrace.terminalCaptures.find(
    (summary) => summary.componentId === inspectedComponent.id,
  )
  const strongestIncomingEvent = beamEvents.reduce<BeamInteractionEvent | undefined>(
    (strongest, event) =>
      !strongest || event.incomingPowerMw > strongest.incomingPowerMw
        ? event
        : strongest,
    undefined,
  )
  const incomingSource = strongestIncomingEvent
    ? scene.components.find(
        (component) => component.id === strongestIncomingEvent.sourceComponentId,
      )
    : undefined
  const incomingSourceConfig = incomingSource?.config.source
  const strongestGaussianInteraction = strongestIncomingEvent
    ? getGaussianInteractionAnalysis(gaussianTrace, strongestIncomingEvent.id)
    : undefined
  const gaussianComponentWarning = gaussianTrace.componentWarnings.find(
    (warning) => warning.componentId === inspectedComponent.id,
  )
  const incomingPolarization =
    strongestIncomingEvent?.polarization ??
    (incomingSourceConfig
      ? createPolarizationSnapshot(incomingSourceConfig.polarization)
      : createPolarizationSnapshot())
  const bboConfig = inspectedComponent.config.bboCrystal
  const bboMetrics =
    inspectedComponent.type === 'bbo-crystal' && bboConfig
      ? deriveBboMetrics({
          beamDiameterMm:
            incomingSourceConfig?.beamDiameterMm ??
            scene.beamSettings.defaultBeamDiameterMm,
          bandwidthNm:
            strongestIncomingEvent?.bandwidthNm ??
            incomingSourceConfig?.bandwidthNm ??
            10,
          interactionMode: bboConfig.interactionMode,
          phaseMatchingAngleDeg: bboConfig.phaseMatchingAngleDeg,
          thicknessUm: bboConfig.thicknessUm,
          wavelengthNm:
            strongestIncomingEvent?.wavelengthNm ??
            incomingSourceConfig?.wavelengthNm ??
            800,
        })
      : undefined
  const bboPolarizationSummary =
    inspectedComponent.type === 'bbo-crystal' && bboConfig
      ? deriveBboPolarizationSummary({
          axisLocalDeg: bboConfig.polarizationAxisLocalDeg,
          polarization: incomingPolarization,
        })
      : undefined
  const filterEstimateNm =
    strongestIncomingEvent?.wavelengthNm ?? incomingSourceConfig?.wavelengthNm ?? 800
  const filterReadout =
    inspectedComponent.type === 'filter'
      ? getFilterTransmissionEstimate(spec, filterEstimateNm)
      : undefined
  const sourcePolarization =
    inspectedComponent.config.source?.polarization ?? createDefaultPolarizationConfig()
  const opticalTargets = scene.components.filter(
    (component) =>
      component.id !== inspectedComponent.id && isOpticalTarget(component.type),
  )
  return (
    <aside className="panel inspector" data-tour="inspector" onMouseMove={handleMouseMove}>
      <div className="panel__header">
        <div className="panel__header-top">
          <div>
            <PanelTitleEditor
              onChange={(value) =>
                updateSelectedComponent({
                  label: value,
                })
              }
              value={inspectedComponent.label}
            />
            {placement.reason !== 'none' ? (
              <span className="panel__meta-text panel__meta-text--warning">
                Placement warning: {placementNotice ?? placement.reason}
              </span>
            ) : pendingPlacement ? (
              <span className="panel__meta-text">Pending placement draft</span>
            ) : null}
          </div>
          <button
            aria-label="Collapse inspector"
            className="panel__collapse-chevron"
            data-tour="panel-inspector-toggle"
            onClick={onCollapse}
            type="button"
          >
            <svg fill="none" viewBox="0 0 24 24">
              <path
                d="M9 6l6 6-6 6"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="inspector__content">
        <div className="inspector__subsection inspector__subsection--quick-edit">
          <div className="inspector__quick-edit-card">
              <Field className="inspector__field--compact inspector__field--compact-variant" label="Variant">
                <select
                  onChange={(event) => updateSelectedVariant(event.target.value)}
                  value={inspectedComponent.variantId}
              >
                {variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.vendor && variant.sku
                      ? `${variant.label} • ${variant.vendor} ${variant.sku}`
                      : variant.label}
                  </option>
                ))}
                </select>
              </Field>

            {showSimpleAppearanceStrip ? (
              <div className="inspector__appearance-card inspector__placement-card--full" style={{ paddingBottom: '0.2rem' }}>
                <div className="inspector__appearance-header">
                  <span>Appearance</span>
                  {isAppearanceCustomized ? (
                    <button
                      className="inspector__appearance-reset"
                      onClick={() =>
                        setSimpleGlyphAppearance(inspectedComponent.id, {
                          color: SIMPLE_APPEARANCE_SWATCHS[0],
                          scale: 1,
                          weight: 1,
                        })
                      }
                      type="button"
                    >
                      Reset
                    </button>
                  ) : null}
                </div>
                <div className="inspector__appearance-strip inspector__appearance-strip--stacked">
                  <div className="inspector__appearance-control-stack">
                    <div className="inspector__appearance-swatches-block">
                      <div className="inspector__appearance-step-header">
                        <span>Color</span>
                        <span className="inspector__field-note">
                          {selectedSimpleGlyphColorLabel}
                        </span>
                      </div>
                      <div className="inspector__appearance-swatches">
                        {SIMPLE_APPEARANCE_SWATCH_OPTIONS.map((option) => (
                          <button
                            aria-label={option.label}
                            aria-pressed={effectiveSimpleGlyphAppearance.color === option.color}
                            className={`inspector__appearance-swatch${effectiveSimpleGlyphAppearance.color === option.color ? ' is-active' : ''}`}
                            key={option.color}
                            onClick={() =>
                              setSimpleGlyphAppearance(inspectedComponent.id, {
                                color: option.color,
                              })
                            }
                            style={
                              {
                                '--appearance-swatch-color': option.color,
                              } as CSSProperties
                            }
                            type="button"
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="inspector__placement-card inspector__placement-card--full">
                <span>Placement</span>
                <strong>{placementStatusLabel}</strong>
              </div>
            )}

            <div className="inspector__quick-edit-stack">
              <NumberField
                className="inspector__field--compact inspector__field--compact-anchor"
                label="Anchor X"
                onChange={(x) =>
                  updateSelectedComponent({
                    anchorMm: { x, y: inspectedComponent.anchorMm.y },
                  })
                }
                displayPrecision={2}
                suffix="mm"
                value={inspectedComponent.anchorMm.x}
              />
              <NumberField
                className="inspector__field--compact inspector__field--compact-anchor"
                label="Anchor Y"
                onChange={(y) =>
                  updateSelectedComponent({
                    anchorMm: { x: inspectedComponent.anchorMm.x, y },
                  })
                }
                displayPrecision={2}
                suffix="mm"
                value={inspectedComponent.anchorMm.y}
              />
              {spec.mount.mode !== 'external-source' ? (
                <Field className="inspector__field--compact inspector__field--compact-rotation" label="Rotation">
                  <select
                    onChange={(event) =>
                      updateSelectedComponent({
                        rotationQuarterTurns: Number(event.target.value) as QuarterTurn,
                      })
                    }
                    value={inspectedComponent.rotationQuarterTurns}
                  >
                    <option value={0}>0°</option>
                    <option value={1}>90°</option>
                    <option value={2}>180°</option>
                    <option value={3}>270°</option>
                  </select>
                </Field>
              ) : (
                <Field label="Orientation" className="inspector__field--compact">
                  <input
                    className="inspector__field--compact-anchor"
                    readOnly
                    type="text"
                    value={`${inspectedComponent.config.source?.lane ?? 'left'} launch edge`}
                    style={{ width: '7rem', textAlign: 'left' }}
                  />
                </Field>
              )}
            </div>

            {showSimpleAppearanceStrip ? (
              <div className="inspector__appearance-card inspector__placement-card--full">
                <div className="inspector__appearance-strip inspector__appearance-strip--stacked">
                  <div className="inspector__appearance-control-stack">
                    <div className="inspector__appearance-control-stacked">
                      <div className="inspector__appearance-control-stacked-header">
                        <span className="inspector__appearance-control-label">Size</span>
                        <span className="inspector__appearance-value">
                          {effectiveSimpleGlyphAppearance.scale.toFixed(2)}×
                        </span>
                      </div>
                      <div className="inspector__button-row inspector__button-row--compact">
                        <StepperButton
                          label="-"
                          onClick={() =>
                            setSimpleGlyphAppearance(inspectedComponent.id, {
                              scale: effectiveSimpleGlyphAppearance.scale - 0.08,
                            })
                          }
                          size="mini"
                        />
                        <StepperButton
                          label="+"
                          onClick={() =>
                            setSimpleGlyphAppearance(inspectedComponent.id, {
                              scale: effectiveSimpleGlyphAppearance.scale + 0.08,
                            })
                          }
                          size="mini"
                        />
                      </div>
                    </div>
                    <div className="inspector__appearance-control-stacked">
                      <div className="inspector__appearance-control-stacked-header">
                        <span className="inspector__appearance-control-label">Weight</span>
                        <span className="inspector__appearance-value">
                          {effectiveSimpleGlyphAppearance.weight.toFixed(2)}×
                        </span>
                      </div>
                      <div className="inspector__button-row inspector__button-row--compact">
                        <StepperButton
                          label="-"
                          onClick={() =>
                            setSimpleGlyphAppearance(inspectedComponent.id, {
                              weight: effectiveSimpleGlyphAppearance.weight - 0.08,
                            })
                          }
                          size="mini"
                        />
                        <StepperButton
                          label="+"
                          onClick={() =>
                            setSimpleGlyphAppearance(inspectedComponent.id, {
                              weight: effectiveSimpleGlyphAppearance.weight + 0.08,
                            })
                          }
                          size="mini"
                        />
                      </div>
                    </div>
                    <div className="inspector__icon-style-block">
                      <div className="inspector__appearance-step-header">
                        <span>Simple icon</span>
                        {hasSimpleIconStyleOverride ? (
                          <button
                            className="inspector__appearance-reset"
                            onClick={() => setSelectedSimpleIconStyleOverride(undefined)}
                            type="button"
                          >
                            Use global
                          </button>
                        ) : null}
                      </div>
                      <div className="inspector__icon-style-options">
                        {(['enhanced', 'classic'] as const).map((iconStyleOption) => (
                          <button
                            aria-pressed={effectiveSimpleIconStyle === iconStyleOption}
                            className={`inspector__icon-style-option${effectiveSimpleIconStyle === iconStyleOption ? ' is-active' : ''}`}
                            key={iconStyleOption}
                            onClick={() => setSelectedSimpleIconStyleOverride(iconStyleOption)}
                            title={iconStyleOption === 'classic' ? 'Classic optics' : 'Enhanced'}
                            type="button"
                          >
                            <SimpleIconStyleOptionCopy glyph={spec.renderHint.glyph} style={iconStyleOption} />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {placementNotice ? (
              <p className="inspector__hint inspector__hint--quick-edit">{placementNotice}</p>
            ) : null}
          </div>
        </div>

        {spec.recommendedHardware && inspectedComponent.type !== 'beamsplitter' ? (
          <CollapsibleSection title="Recommended settings">
            <div className="inspector__readout inspector__readout--compact">
              <div>
                <span>Mount</span>
                <strong>{spec.recommendedHardware.mount ?? 'n/a'}</strong>
              </div>
              <div>
                <span>Post</span>
                <strong>{spec.recommendedHardware.post ?? 'n/a'}</strong>
              </div>
              <div>
                <span>Clamp</span>
                <strong>{spec.recommendedHardware.clamp ?? 'Optional'}</strong>
              </div>
            </div>
          </CollapsibleSection>
        ) : null}

        <CollapsibleSection title="Component details">
          <div className="inspector__readout inspector__readout--details inspector__readout--compact">
            <div>
              <span>Family</span>
              <strong>{definition.familyLabel}</strong>
            </div>
            <div>
              <span>Editing</span>
              <strong>{pendingPlacement ? 'Pending draft' : 'Placed component'}</strong>
            </div>
            <div>
              <span>Category</span>
              <strong>{COMPONENT_CATEGORY_LABELS[definition.category]}</strong>
            </div>
            <div>
              <span>Mount</span>
              <strong>{formatMountMode(spec.mount.mode)}</strong>
            </div>
            <div>
              <span>Footprint</span>
              <strong>{footprintSizeLabel}</strong>
            </div>
            {showRotatedBounds ? (
              <div>
                <span>Rotated bounds</span>
                <strong>{rotatedBoundsSizeLabel}</strong>
              </div>
            ) : null}
            <div>
              <span>Ports</span>
              <strong>{worldPorts.length}</strong>
            </div>
          </div>

          <div className="inspector__context">
            <p className="inspector__description">{spec.description}</p>
            {spec.vendor || spec.sku ? (
              <p className="inspector__meta">
                {spec.vendor ?? 'Generic'}
                {spec.sku ? ` • ${spec.sku}` : ''}
              </p>
            ) : null}
          </div>
        </CollapsibleSection>

        <BeamInspectionSection
          beamTrace={beamTrace}
          defaultOpen={
            Boolean(inspectedComponent.config.source) ||
            beamEvents.length > 0 ||
            placement.reason !== 'none'
          }
          gaussianTrace={gaussianTrace}
        />

        <CollapsibleSection title="Geometry Overrides">
          <div className="inspector__grid">
            <NumberField
              label="Footprint width"
              onChange={(widthMm) =>
                updateSelectedGeometryOverride({
                  widthMm,
                  heightMm:
                    inspectedComponent.geometryOverride?.heightMm ??
                    spec.footprintBoundsMm.height,
                })
              }
              suffix="mm"
              value={spec.footprintBoundsMm.width}
            />
            <NumberField
              label="Footprint height"
              onChange={(heightMm) =>
                updateSelectedGeometryOverride({
                  widthMm:
                    inspectedComponent.geometryOverride?.widthMm ??
                    spec.footprintBoundsMm.width,
                  heightMm,
                })
              }
              suffix="mm"
              value={spec.footprintBoundsMm.height}
            />
          </div>
          {inspectedComponent.geometryOverride ? (
            <div className="inspector__action-row">
              <button
                className="inspector__action-button"
                onClick={() => clearSelectedGeometryOverride()}
                type="button"
              >
                Revert to Default Sizing
              </button>
            </div>
          ) : null}
          <p className="inspector__hint">
            Canvas resize +/- buttons and these numeric fields update the same
            per-instance geometry override.
          </p>
        </CollapsibleSection>

        {isPostMountedType(inspectedComponent.type) ? (
          <CollapsibleSection title="Post Holder Override">
            <div className="inspector__grid">
              <NumberField
                label="Liquid glass post holder diameter"
                onChange={(diameterMm) =>
                  updateSelectedPostHolderDiameter(diameterMm)
                }
                suffix="mm"
                value={
                  inspectedComponent.config.postHolderDiameterMm ??
                  DEFAULT_POST_HOLDER_DIAMETER_MM
                }
              />
            </div>
            <p className="inspector__hint">
              Visible in canvas when simple mode is active and Show Post Holders is enabled from the More menu.
            </p>
          </CollapsibleSection>
        ) : null}
        {supportsMountToggle(inspectedComponent.type) ? (
          <CollapsibleSection title="Integrated Mount">
            <div className="inspector__button-row">
              <button
                className={
                  inspectedComponent.config.support?.includeMount !== false
                    ? 'is-active'
                    : undefined
                }
                onClick={() => updateSelectedSupport(true)}
                type="button"
              >
                Include mount
              </button>
              <button
                className={
                  inspectedComponent.config.support?.includeMount === false
                    ? 'is-active'
                    : undefined
                }
                onClick={() => updateSelectedSupport(false)}
                type="button"
              >
                Hide mount
              </button>
            </div>

            <div className="inspector__button-row">
              <button
                onClick={() => applySupportToType(inspectedComponent.type, true)}
                type="button"
              >
                Apply to all {definition.familyLabel.toLowerCase()}s
              </button>
              <button
                onClick={() => setMountDefaultForType(inspectedComponent.type, true)}
                type="button"
              >
                Use for new {definition.familyLabel.toLowerCase()}s
              </button>
            </div>

            <div className="inspector__button-row">
              <button
                onClick={() => applySupportToType(inspectedComponent.type, false)}
                type="button"
              >
                Hide on all {definition.familyLabel.toLowerCase()}s
              </button>
              <button
                onClick={() => setMountDefaultForType(inspectedComponent.type, false)}
                type="button"
              >
                New {definition.familyLabel.toLowerCase()}s start hidden
              </button>
            </div>

            <p className="inspector__hint">
              New {definition.familyLabel.toLowerCase()} placements currently default to{' '}
              {mountVisibilityDefaults[inspectedComponent.type as keyof typeof mountVisibilityDefaults] === false
                ? 'hidden mounts'
                : 'included mounts'}
              .
            </p>
          </CollapsibleSection>
        ) : null}
        {inspectedComponent.config.source ? (
          <div className="inspector__subsection">
            <h3>Laser Source</h3>

            <div className="inspector__grid">
              <Field label="Preset">
                <select
                  onChange={(event) =>
                    applySelectedSourcePreset(
                      event.target.value as typeof inspectedComponent.config.source.presetId,
                    )
                  }
                  value={inspectedComponent.config.source.presetId}
                >
                  {SOURCE_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </Field>

              {spec.mount.mode === 'external-source' ? (
                <Field label="Launch edge">
                  <select
                    onChange={(event) =>
                      updateSelectedSource({
                        lane: event.target.value as typeof inspectedComponent.config.source.lane,
                      })
                    }
                    value={inspectedComponent.config.source.lane}
                  >
                    <option value="left">Left</option>
                    <option value="top">Top</option>
                    <option value="right">Right</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </Field>
              ) : null}

              <Field label="First target">
                <select
                  onChange={(event) =>
                    updateSelectedSource({
                      firstTargetComponentId:
                        event.target.value === '' ? undefined : event.target.value,
                    })
                  }
                  value={inspectedComponent.config.source.firstTargetComponentId ?? ''}
                >
                  <option value="">None</option>
                  {opticalTargets.map((component) => (
                    <option key={component.id} value={component.id}>
                      {component.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="inspector__button-row">
              <button
                onClick={() =>
                  updateSelectedSource({
                    isEnabled: !inspectedComponent.config.source?.isEnabled,
                  })
                }
                type="button"
              >
                {inspectedComponent.config.source.isEnabled ? 'Turn Beam Off' : 'Turn Beam On'}
              </button>
              <button
                disabled={!inspectedComponent.config.source.firstTargetComponentId}
                onClick={alignSelectedSourceToTarget}
                type="button"
              >
                Align to Target
              </button>
            </div>

            <div className="inspector__grid">
              <NumberField
                label="Wavelength"
                    suffix="nm"
                onChange={(wavelengthNm) => updateSelectedSource({ wavelengthNm })}
                value={inspectedComponent.config.source.wavelengthNm}
              />
              <NumberField
                label="Bandwidth"
                    suffix="nm"
                onChange={(bandwidthNm) => updateSelectedSource({ bandwidthNm })}
                value={inspectedComponent.config.source.bandwidthNm}
              />
              <NumberField
                label="Absolute power"
                    suffix="mW"
                onChange={(powerMw) => updateSelectedSource({ powerMw })}
                value={inspectedComponent.config.source.powerMw}
              />
              <NumberField
                label="Normalized power (%)"
                onChange={(normalizedPowerPercent) =>
                  updateSelectedSource({ normalizedPowerPercent })
                }
                value={inspectedComponent.config.source.normalizedPowerPercent}
              />
              <NumberField
                label="Beam diameter"
                    suffix="mm"
                onChange={(beamDiameterMm) => updateSelectedSource({ beamDiameterMm })}
                value={inspectedComponent.config.source.beamDiameterMm}
              />
              <NumberField
                label="Divergence (mrad)"
                onChange={(divergenceMrad) => updateSelectedSource({ divergenceMrad })}
                value={inspectedComponent.config.source.divergenceMrad}
              />
            </div>

            <div className="inspector__subsection">
              <h3>Gaussian Launch</h3>

              <div className="inspector__grid">
                <Field label="Input mode">
                  <select
                    onChange={(event) =>
                      updateSelectedSource({
                        gaussianInputMode:
                          event.target.value as typeof inspectedComponent.config.source.gaussianInputMode,
                      })
                    }
                    value={inspectedComponent.config.source.gaussianInputMode}
                  >
                    <option value="derived">Derived from diameter/divergence</option>
                    <option value="explicit-waist">Explicit waist override</option>
                  </select>
                </Field>

                {inspectedComponent.config.source.gaussianInputMode === 'explicit-waist' ? (
                  <>
                    <NumberField
                      label="Waist radius"
                    suffix="mm"
                      onChange={(waistRadiusMm) =>
                        updateSelectedSource({ waistRadiusMm })
                      }
                      value={
                        inspectedComponent.config.source.waistRadiusMm ??
                        inspectedComponent.config.source.beamDiameterMm / 2
                      }
                    />
                    <NumberField
                      label="Waist offset"
                    suffix="mm"
                      onChange={(waistOffsetMm) =>
                        updateSelectedSource({ waistOffsetMm })
                      }
                      value={inspectedComponent.config.source.waistOffsetMm ?? 0}
                    />
                  </>
                ) : null}
              </div>

              {gaussianSourceSummary ? (
                <>
                  <div className="inspector__readout">
                    <div>
                      <span>Launch spot radius</span>
                      <strong>{gaussianSourceSummary.launch.spotRadiusMm.toFixed(3)} mm</strong>
                    </div>
                    <div>
                      <span>Waist radius</span>
                      <strong>{gaussianSourceSummary.launch.waistRadiusMm.toFixed(3)} mm</strong>
                    </div>
                    <div>
                      <span>Waist offset</span>
                      <strong>{gaussianSourceSummary.launch.waistOffsetMm.toFixed(2)} mm</strong>
                    </div>
                    <div>
                      <span>Rayleigh range</span>
                      <strong>{gaussianSourceSummary.launch.rayleighRangeMm.toFixed(2)} mm</strong>
                    </div>
                    <div>
                      <span>Curvature</span>
                      <strong>{formatCurvature(gaussianSourceSummary.launch.radiusOfCurvatureMm)}</strong>
                    </div>
                  </div>

                  {gaussianSourceSummary.warning ? (
                    <p className="inspector__hint">{gaussianSourceSummary.warning}</p>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="inspector__subsection">
              <h3>Polarization</h3>

              <div className="inspector__grid">
                <Field label="Preset">
                  <select
                    onChange={(event) =>
                      updateSelectedSource({
                        polarization: applyPolarizationPreset(
                          event.target.value as PolarizationConfig['presetId'],
                          sourcePolarization,
                        ),
                      })
                    }
                    value={sourcePolarization.presetId}
                  >
                    <option value="linear-in-plane">Linear in-plane</option>
                    <option value="linear-out-of-plane">Linear out-of-plane</option>
                    <option value="circular-right">Circular right-handed</option>
                    <option value="circular-left">Circular left-handed</option>
                    <option value="elliptical">Elliptical</option>
                  </select>
                </Field>
                <NumberField
                  label="In-plane amplitude"
                  onChange={(inPlaneAmplitude) =>
                    updateSelectedSource({
                      polarization: {
                        ...sourcePolarization,
                        presetId: 'elliptical',
                        inPlaneAmplitude,
                      },
                    })
                  }
                  value={sourcePolarization.inPlaneAmplitude}
                />
                <NumberField
                  label="Out-of-plane amplitude"
                  onChange={(outOfPlaneAmplitude) =>
                    updateSelectedSource({
                      polarization: {
                        ...sourcePolarization,
                        presetId: 'elliptical',
                        outOfPlaneAmplitude,
                      },
                    })
                  }
                  value={sourcePolarization.outOfPlaneAmplitude}
                />
                <NumberField
                  label="Relative phase"
                    suffix="deg"
                  onChange={(relativePhaseDeg) =>
                    updateSelectedSource({
                      polarization: {
                        ...sourcePolarization,
                        presetId: 'elliptical',
                        relativePhaseDeg,
                      },
                    })
                  }
                  value={sourcePolarization.relativePhaseDeg}
                />
              </div>

              <div className="inspector__readout">
                <div>
                  <span>Current state</span>
                  <strong>{createPolarizationSnapshot(sourcePolarization).tag}</strong>
                </div>
                <div>
                  <span>In-plane fraction</span>
                  <strong>
                    {(createPolarizationSnapshot(sourcePolarization).inPlaneFraction * 100).toFixed(1)}%
                  </strong>
                </div>
                <div>
                  <span>Out-of-plane fraction</span>
                  <strong>
                    {(createPolarizationSnapshot(sourcePolarization).outOfPlaneFraction * 100).toFixed(1)}%
                  </strong>
                </div>
              </div>
            </div>

            <div className="inspector__readout">
              <div>
                <span>Traced power</span>
                <strong>{sourceSummary ? `${sourceSummary.powerMw.toFixed(2)} mW` : 'Beam off'}</strong>
              </div>
              <div>
                <span>Generated SHG</span>
                <strong>
                  {sourceSummary ? `${sourceSummary.generatedShgPowerMw.toFixed(2)} mW` : '0.00 mW'}
                </strong>
              </div>
              <div>
                <span>Polarization tag</span>
                <strong>{createPolarizationSnapshot(sourcePolarization).tag}</strong>
              </div>
            </div>
          </div>
        ) : null}

        {inspectedComponent.type === 'lens' && inspectedComponent.config.lens ? (
          <div className="inspector__subsection">
            <h3>Lens</h3>

            <div className="inspector__grid">
              <NumberField
                label="Focal length"
                    suffix="mm"
                onChange={(focalLengthMm) => updateSelectedLens({ focalLengthMm })}
                value={inspectedComponent.config.lens.focalLengthMm}
              />
              <NumberField
                label="Clear aperture"
                    suffix="mm"
                onChange={(clearApertureMm) =>
                  updateSelectedLens({ clearApertureMm })
                }
                value={inspectedComponent.config.lens.clearApertureMm}
              />
            </div>

            <div className="inspector__readout">
              <div>
                <span>Input spot radius</span>
                <strong>
                  {strongestGaussianInteraction
                    ? `${strongestGaussianInteraction.local.spotRadiusMm.toFixed(3)} mm`
                    : 'n/a'}
                </strong>
              </div>
              <div>
                <span>Output spot radius</span>
                <strong>
                  {strongestGaussianInteraction?.outputLocal
                    ? `${strongestGaussianInteraction.outputLocal.spotRadiusMm.toFixed(3)} mm`
                    : 'n/a'}
                </strong>
              </div>
              <div>
                <span>Output waist offset</span>
                <strong>
                  {strongestGaussianInteraction?.outputLocal
                    ? `${strongestGaussianInteraction.outputLocal.waistOffsetMm.toFixed(2)} mm`
                    : 'n/a'}
                </strong>
              </div>
              <div>
                <span>Output Rayleigh</span>
                <strong>
                  {strongestGaussianInteraction?.outputLocal
                    ? `${strongestGaussianInteraction.outputLocal.rayleighRangeMm.toFixed(2)} mm`
                    : 'n/a'}
                </strong>
              </div>
              <div>
                <span>Aperture status</span>
                <strong>
                  {formatGaussianStatus(strongestGaussianInteraction?.apertureStatus)}
                </strong>
              </div>
            </div>
          </div>
        ) : null}

        {(inspectedComponent.type === 'mirror' || inspectedComponent.type === 'curved-mirror') && inspectedComponent.config.curvedMirror ? (
          <div className="inspector__subsection">
            <h3>Curved Mirror</h3>

            <div className="inspector__grid">
              <NumberField
                label="ROC"
                    suffix="mm"
                onChange={(radiusOfCurvatureMm) =>
                  updateSelectedCurvedMirror({ radiusOfCurvatureMm })
                }
                value={inspectedComponent.config.curvedMirror.radiusOfCurvatureMm}
              />
              <Field label="Shape">
                <select
                  onChange={(event) =>
                    updateSelectedCurvedMirror({
                      isConvex: event.target.value === 'convex',
                    })
                  }
                  value={inspectedComponent.config.curvedMirror.isConvex ? 'convex' : 'concave'}
                >
                  <option value="concave">Concave</option>
                  <option value="convex">Convex</option>
                </select>
              </Field>
            </div>

            <div className="inspector__readout">
              <div>
                <span>Effective focal length</span>
                <strong>
                  {(
                    inspectedComponent.config.curvedMirror.radiusOfCurvatureMm /
                    2
                  ).toFixed(2)}{' '}
                  mm
                </strong>
              </div>
              <div>
                <span>Output waist offset</span>
                <strong>
                  {strongestGaussianInteraction?.outputLocal
                    ? `${strongestGaussianInteraction.outputLocal.waistOffsetMm.toFixed(2)} mm`
                    : 'n/a'}
                </strong>
              </div>
            </div>
          </div>
        ) : null}

        {inspectedComponent.type === 'mirror' &&
        inspectedComponent.variantId === 'flip-mirror' &&
        inspectedComponent.config.flipMirror ? (
          <div className="inspector__subsection">
            <h3>Flip Mirror</h3>

            <Field label="State">
              <select
                onChange={(event) =>
                  updateSelectedFlipMirror({
                    isFlippedDown: event.target.value === 'down',
                  })
                }
                value={inspectedComponent.config.flipMirror.isFlippedDown ? 'down' : 'up'}
              >
                <option value="down">Down (reflect)</option>
                <option value="up">Up (pass-through)</option>
              </select>
            </Field>

            <div className="inspector__readout">
              <div>
                <span>Beam behavior</span>
                <strong>
                  {inspectedComponent.config.flipMirror.isFlippedDown
                    ? 'Reflect'
                    : 'Pass-through'}
                </strong>
              </div>
            </div>
          </div>
        ) : null}

        {inspectedComponent.type === 'beamsplitter' && inspectedComponent.config.beamSplitter ? (
          <div className="inspector__subsection">
            <h3>Beamsplitter</h3>

            <div className="inspector__grid">
              <NumberField
                label="Reflect (%)"
                onChange={(reflectPercent) =>
                  updateSelectedBeamSplitter({ reflectPercent })
                }
                value={inspectedComponent.config.beamSplitter.reflectPercent}
              />
              <NumberField
                label="Loss (%)"
                onChange={(lossPercent) => updateSelectedBeamSplitter({ lossPercent })}
                value={inspectedComponent.config.beamSplitter.lossPercent}
              />
            </div>

            <div className="inspector__readout">
              <div>
                <span>Transmit (%)</span>
                <strong>
                  {Math.max(
                    0,
                    100 -
                      inspectedComponent.config.beamSplitter.reflectPercent -
                      inspectedComponent.config.beamSplitter.lossPercent,
                  ).toFixed(1)}
                </strong>
              </div>
              <div>
                <span>Polarization bias</span>
                <strong>
                  {spec.physics.kind === 'beamsplitter'
                    ? `s ${spec.physics.sReflectBiasPercent >= 0 ? '+' : ''}${spec.physics.sReflectBiasPercent.toFixed(1)} / p ${spec.physics.pReflectBiasPercent >= 0 ? '+' : ''}${spec.physics.pReflectBiasPercent.toFixed(1)}`
                    : 'n/a'}
                </strong>
              </div>
            </div>
          </div>
        ) : null}

        {spec.recommendedHardware && inspectedComponent.type === 'beamsplitter' ? (
          <CollapsibleSection title="Recommended settings">
            <div className="inspector__readout">
              <div>
                <span>Mount</span>
                <strong>{spec.recommendedHardware.mount ?? 'n/a'}</strong>
              </div>
              <div>
                <span>Post</span>
                <strong>{spec.recommendedHardware.post ?? 'n/a'}</strong>
              </div>
              <div>
                <span>Clamp</span>
                <strong>{spec.recommendedHardware.clamp ?? 'Optional'}</strong>
              </div>
            </div>
          </CollapsibleSection>
        ) : null}

        {inspectedComponent.type === 'iris' && inspectedComponent.config.iris ? (
          <div className="inspector__subsection">
            <h3>Iris</h3>

            <NumberField
              label="Aperture"
                    suffix="mm"
              onChange={(apertureMm) => updateSelectedIris({ apertureMm })}
              value={inspectedComponent.config.iris.apertureMm}
            />
          </div>
        ) : null}

        {inspectedComponent.type === 'attenuator' && inspectedComponent.config.attenuator ? (
          <div className="inspector__subsection">
            <h3>Attenuator</h3>

            <div className="inspector__grid">
              <NumberField
                label="Transmission (%)"
                onChange={(transmissionPercent) =>
                  updateSelectedAttenuator({ transmissionPercent })
                }
                value={inspectedComponent.config.attenuator.transmissionPercent}
              />
              <Field label="Orientation">
                <select
                  onChange={(event) =>
                    updateSelectedAttenuator({
                      orientation: event.target.value as 'horizontal' | 'vertical',
                    })
                  }
                  value={inspectedComponent.config.attenuator.orientation}
                >
                  <option value="horizontal">Horizontal</option>
                  <option value="vertical">Vertical</option>
                </select>
              </Field>
            </div>

            <div className="inspector__readout">
              <div>
                <span>Incoming power</span>
                <strong>
                  {strongestIncomingEvent
                    ? `${strongestIncomingEvent.incomingPowerMw.toFixed(2)} mW`
                    : 'n/a'}
                </strong>
              </div>
              <div>
                <span>Output power</span>
                <strong>
                  {strongestIncomingEvent?.transmittedPowerMw !== undefined
                    ? `${strongestIncomingEvent.transmittedPowerMw.toFixed(2)} mW`
                    : 'n/a'}
                </strong>
              </div>
            </div>
          </div>
        ) : null}

        {inspectedComponent.type === 'polarizer' && inspectedComponent.config.polarizer ? (
          <div className="inspector__subsection">
            <h3>Polarizer</h3>

            <div className="inspector__grid">
              <NumberField
                label="Axis"
                    suffix="deg"
                onChange={(axisLocalDeg) => updateSelectedPolarizer({ axisLocalDeg })}
                value={inspectedComponent.config.polarizer.axisLocalDeg}
              />
              <NumberField
                label="Extinction ratio"
                onChange={(extinctionRatio) =>
                  updateSelectedPolarizer({ extinctionRatio })
                }
                value={inspectedComponent.config.polarizer.extinctionRatio}
              />
              <NumberField
                label="Insertion loss (%)"
                onChange={(insertionLossPercent) =>
                  updateSelectedPolarizer({ insertionLossPercent })
                }
                value={inspectedComponent.config.polarizer.insertionLossPercent}
              />
            </div>

            <div className="inspector__readout">
              <div>
                <span>Outgoing polarization</span>
                <strong>{strongestIncomingEvent?.outputPolarization?.tag ?? 'n/a'}</strong>
              </div>
            </div>
          </div>
        ) : null}

        {inspectedComponent.type === 'waveplate' && inspectedComponent.config.waveplate ? (
          <div className="inspector__subsection">
            <h3>Waveplate</h3>

            <div className="inspector__grid">
              <Field label="Kind">
                <select
                  onChange={(event) =>
                    updateSelectedWaveplate({
                      kind: event.target.value as 'quarter' | 'half' | 'custom',
                      retardanceDeg:
                        event.target.value === 'quarter'
                          ? 90
                          : event.target.value === 'half'
                            ? 180
                            : inspectedComponent.config.waveplate!.retardanceDeg,
                    })
                  }
                  value={inspectedComponent.config.waveplate.kind}
                >
                  <option value="quarter">Quarter</option>
                  <option value="half">Half</option>
                  <option value="custom">Custom</option>
                </select>
              </Field>
              <NumberField
                label="Axis"
                    suffix="deg"
                onChange={(axisLocalDeg) => updateSelectedWaveplate({ axisLocalDeg })}
                value={inspectedComponent.config.waveplate.axisLocalDeg}
              />
              <NumberField
                label="Retardance"
                    suffix="deg"
                onChange={(retardanceDeg) => updateSelectedWaveplate({ retardanceDeg })}
                value={inspectedComponent.config.waveplate.retardanceDeg}
              />
            </div>

            <div className="inspector__readout">
              <div>
                <span>Outgoing polarization</span>
                <strong>{strongestIncomingEvent?.outputPolarization?.tag ?? 'n/a'}</strong>
              </div>
            </div>
          </div>
        ) : null}

        {inspectedComponent.type === 'filter' && spec.physics.kind === 'filter' ? (
          <div className="inspector__subsection">
            <h3>Filter Response</h3>

            <div className="inspector__readout">
              <div>
                <span>Mode</span>
                <strong>{spec.physics.filterMode}</strong>
              </div>
              <div>
                <span>Reference λ</span>
                <strong>{filterEstimateNm.toFixed(1)} nm</strong>
              </div>
              <div>
                <span>Transmission</span>
                <strong>{filterReadout?.transmissionPercent.toFixed(1)}%</strong>
              </div>
              <div>
                <span>Classification</span>
                <strong>{formatFilterClass(filterReadout?.transmissionClass)}</strong>
              </div>
              <div>
                <span>Incoming power</span>
                <strong>
                  {strongestIncomingEvent
                    ? `${strongestIncomingEvent.incomingPowerMw.toFixed(2)} mW`
                    : 'n/a'}
                </strong>
              </div>
              <div>
                <span>Lost through filter</span>
                <strong>
                  {strongestIncomingEvent && filterReadout
                    ? `${(
                        strongestIncomingEvent.incomingPowerMw *
                        (1 - filterReadout.transmissionPercent / 100)
                      ).toFixed(2)} mW`
                    : 'n/a'}
                </strong>
              </div>
            </div>
          </div>
        ) : null}

        {inspectedComponent.type === 'bbo-crystal' && inspectedComponent.config.bboCrystal ? (
          <div className="inspector__subsection">
            <h3>BBO Crystal</h3>

            <div className="inspector__grid">
              <Field label="Mode">
                <select
                  onChange={(event) =>
                    updateSelectedBboCrystal({
                      interactionMode:
                        event.target.value as typeof inspectedComponent.config.bboCrystal.interactionMode,
                    })
                  }
                  value={inspectedComponent.config.bboCrystal.interactionMode}
                >
                  <option value="estimated">Estimated</option>
                  <option value="advanced">Advanced</option>
                </select>
              </Field>
              <NumberField
                label="Thickness (µm)"
                onChange={(thicknessUm) => updateSelectedBboCrystal({ thicknessUm })}
                value={inspectedComponent.config.bboCrystal.thicknessUm}
              />
              <NumberField
                label="Phase-matching angle"
                    suffix="deg"
                onChange={(phaseMatchingAngleDeg) =>
                  updateSelectedBboCrystal({ phaseMatchingAngleDeg })
                }
                value={inspectedComponent.config.bboCrystal.phaseMatchingAngleDeg}
              />
              <NumberField
                label="Polarization axis"
                    suffix="deg"
                onChange={(polarizationAxisLocalDeg) =>
                  updateSelectedBboCrystal({ polarizationAxisLocalDeg })
                }
                value={inspectedComponent.config.bboCrystal.polarizationAxisLocalDeg}
              />
            </div>

            {bboMetrics ? (
              <div className="inspector__readout">
                <div>
                  <span>Reference λ</span>
                  <strong>
                    {(
                      strongestIncomingEvent?.wavelengthNm ??
                      incomingSourceConfig?.wavelengthNm ??
                      800
                    ).toFixed(1)}{' '}
                    nm
                  </strong>
                </div>
                <div>
                  <span>PM bandwidth</span>
                  <strong>{bboMetrics.acceptanceBandwidthNm.toFixed(2)} nm</strong>
                </div>
                <div>
                  <span>Estimated SHG</span>
                  <strong>{bboMetrics.estimatedEfficiencyPercent.toFixed(2)}%</strong>
                </div>
                <div>
                  <span>Type I compatibility</span>
                  <strong>
                    {bboPolarizationSummary
                      ? `${bboPolarizationSummary.compatibilityPercent.toFixed(1)}%`
                      : 'n/a'}
                  </strong>
                </div>
                <div>
                  <span>Incoming polarization</span>
                  <strong>{incomingPolarization.tag}</strong>
                </div>
                <div>
                  <span>Compatibility note</span>
                  <strong>{bboPolarizationSummary?.explanation ?? 'n/a'}</strong>
                </div>
              </div>
            ) : (
              <p className="inspector__empty">
                No active source is reaching this crystal yet. Metrics fall back to the
                scene beam defaults.
              </p>
            )}
          </div>
        ) : null}

        {(inspectedComponent.type === 'sample-stage' ||
          inspectedComponent.type === 'support-hardware') &&
        inspectedComponent.config.delayLine ? (
          <div className="inspector__subsection">
            <h3>Delay Line</h3>

            <div className="inspector__grid">
              <Field label="Scan slider">
                <input
                  max={inspectedComponent.config.delayLine.travelMm}
                  min={0}
                  onChange={(event) =>
                    updateSelectedDelayLine({
                      positionMm: Number(event.target.value),
                    })
                  }
                  step={0.1}
                  type="range"
                  value={inspectedComponent.config.delayLine.positionMm}
                />
              </Field>
              <NumberField
                label="Position"
                    suffix="mm"
                onChange={(positionMm) => updateSelectedDelayLine({ positionMm })}
                value={inspectedComponent.config.delayLine.positionMm}
              />
              <NumberField
                label="Travel"
                    suffix="mm"
                onChange={(travelMm) => updateSelectedDelayLine({ travelMm })}
                value={inspectedComponent.config.delayLine.travelMm}
              />
              <NumberField
                label="Zero offset"
                    suffix="fs"
                onChange={(zeroDelayOffsetFs) =>
                  updateSelectedDelayLine({ zeroDelayOffsetFs })
                }
                value={inspectedComponent.config.delayLine.zeroDelayOffsetFs}
              />
              <Field label="Topology">
                <select
                  onChange={(event) =>
                    updateSelectedDelayLine({
                      topology: event.target.value as 'single-pass' | 'double-pass',
                    })
                  }
                  value={inspectedComponent.config.delayLine.topology}
                >
                  <option value="single-pass">Single-pass</option>
                  <option value="double-pass">Double-pass</option>
                </select>
              </Field>
            </div>

            <div className="inspector__readout">
              <div>
                <span>Internal path add</span>
                <strong>
                  {(
                    inspectedComponent.config.delayLine.positionMm *
                    (inspectedComponent.config.delayLine.topology === 'single-pass' ? 1 : 2)
                  ).toFixed(2)}{' '}
                  mm
                </strong>
              </div>
              <div>
                <span>Derived delay</span>
                <strong>
                  {(
                    inspectedComponent.config.delayLine.zeroDelayOffsetFs +
                    inspectedComponent.config.delayLine.positionMm *
                      (inspectedComponent.config.delayLine.topology === 'single-pass' ? 1 : 2) *
                      3335.6409519815
                  ).toFixed(1)}{' '}
                  fs
                </strong>
              </div>
              <div>
                <span>Latest traced delay</span>
                <strong>
                  {strongestIncomingEvent
                    ? `${strongestIncomingEvent.timeDelayFs.toFixed(1)} fs`
                    : 'n/a'}
                </strong>
              </div>
            </div>
          </div>
        ) : null}

        {inspectedComponent.type === 'telescope' && inspectedComponent.config.telescope ? (
          <div className="inspector__subsection">
            <h3>Telescope</h3>

            <div className="inspector__grid">
              <Field label="Mode">
                <select
                  onChange={(event) =>
                    updateSelectedTelescope({
                      mode: event.target.value as 'transmission' | 'reflection',
                    })
                  }
                  value={inspectedComponent.config.telescope.mode}
                >
                  <option value="transmission">Transmission</option>
                  <option value="reflection">Reflection</option>
                </select>
              </Field>
              <NumberField
                label={
                  inspectedComponent.config.telescope.mode === 'reflection'
                    ? 'Mirror 1 ROC (mm)'
                    : 'Lens 1 f (mm)'
                }
                onChange={(element1Mm) => updateSelectedTelescope({ element1Mm })}
                value={inspectedComponent.config.telescope.element1Mm}
              />
              <NumberField
                label={
                  inspectedComponent.config.telescope.mode === 'reflection'
                    ? 'Mirror 2 ROC (mm)'
                    : 'Lens 2 f (mm)'
                }
                onChange={(element2Mm) => updateSelectedTelescope({ element2Mm })}
                value={inspectedComponent.config.telescope.element2Mm}
              />
              <NumberField
                label="Separation"
                    suffix="mm"
                onChange={(separationMm) => updateSelectedTelescope({ separationMm })}
                value={inspectedComponent.config.telescope.separationMm}
              />
            </div>

            <div className="inspector__readout">
              <div>
                <span>Nominal magnification</span>
                <strong>
                  {(
                    inspectedComponent.config.telescope.element2Mm /
                    Math.max(0.1, inspectedComponent.config.telescope.element1Mm)
                  ).toFixed(2)}
                  x
                </strong>
              </div>
              <div>
                <span>Output waist offset</span>
                <strong>
                  {strongestGaussianInteraction?.outputLocal
                    ? `${strongestGaussianInteraction.outputLocal.waistOffsetMm.toFixed(2)} mm`
                    : 'n/a'}
                </strong>
              </div>
            </div>
          </div>
        ) : null}

        {inspectedComponent.type === 'opa-module' && inspectedComponent.config.opa ? (
          <div className="inspector__subsection">
            <h3>OPA Module</h3>

            <div className="inspector__grid">
              <Field label="Role">
                <select
                  onChange={(event) =>
                    updateSelectedOpa({
                      role: event.target.value as 'white-light' | 'combiner' | 'gain',
                    })
                  }
                  value={inspectedComponent.config.opa.role}
                >
                  <option value="white-light">White-light</option>
                  <option value="combiner">Combiner</option>
                  <option value="gain">Gain</option>
                </select>
              </Field>
              <NumberField
                label="Target λ"
                    suffix="nm"
                onChange={(targetWavelengthNm) =>
                  updateSelectedOpa({ targetWavelengthNm })
                }
                value={inspectedComponent.config.opa.targetWavelengthNm ?? 650}
              />
              <NumberField
                label="Bandwidth"
                    suffix="nm"
                onChange={(outputBandwidthNm) =>
                  updateSelectedOpa({ outputBandwidthNm })
                }
                value={inspectedComponent.config.opa.outputBandwidthNm ?? 45}
              />
              <NumberField
                label="Efficiency (%)"
                onChange={(conversionEfficiencyPercent) =>
                  updateSelectedOpa({ conversionEfficiencyPercent })
                }
                value={inspectedComponent.config.opa.conversionEfficiencyPercent ?? 10}
              />
              {inspectedComponent.config.opa.role === 'gain' ? (
                <Field label="Output mode">
                  <select
                    onChange={(event) =>
                      updateSelectedOpa({
                        outputMode: event.target.value as 'signal' | 'idler' | 'signal+idler',
                      })
                    }
                    value={inspectedComponent.config.opa.outputMode ?? 'signal+idler'}
                  >
                    <option value="signal">Signal</option>
                    <option value="idler">Idler</option>
                    <option value="signal+idler">Signal + idler</option>
                  </select>
                </Field>
              ) : null}
              {inspectedComponent.config.opa.role !== 'white-light' ? (
                <Field label="Pump link">
                  <select
                    onChange={(event) =>
                      updateSelectedOpa({
                        pumpLink: event.target.value
                          ? { sourceComponentId: event.target.value }
                          : undefined,
                      })
                    }
                    value={inspectedComponent.config.opa.pumpLink?.sourceComponentId ?? ''}
                  >
                    <option value="">None</option>
                    {linkableSources.map((component) => (
                      <option key={component.id} value={component.id}>
                        {component.label}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              {inspectedComponent.config.opa.role !== 'white-light' ? (
                <Field label="Seed link">
                  <select
                    onChange={(event) =>
                      updateSelectedOpa({
                        seedLink: event.target.value
                          ? { sourceComponentId: event.target.value }
                          : undefined,
                      })
                    }
                    value={inspectedComponent.config.opa.seedLink?.sourceComponentId ?? ''}
                  >
                    <option value="">None</option>
                    {linkableSources.map((component) => (
                      <option key={component.id} value={component.id}>
                        {component.label}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              {inspectedComponent.config.opa.role === 'gain' ? (
                <Field label="Signal link">
                  <select
                    onChange={(event) =>
                      updateSelectedOpa({
                        signalLink: event.target.value
                          ? { sourceComponentId: event.target.value }
                          : undefined,
                      })
                    }
                    value={inspectedComponent.config.opa.signalLink?.sourceComponentId ?? ''}
                  >
                    <option value="">None</option>
                    {linkableSources.map((component) => (
                      <option key={component.id} value={component.id}>
                        {component.label}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
            </div>

            <div className="inspector__readout">
              <div>
                <span>Readiness</span>
                <strong>{beamEvents.length > 0 ? 'Ready / traced' : 'Waiting for inputs'}</strong>
              </div>
              <div>
                <span>Pump link</span>
                <strong>{inspectedComponent.config.opa.pumpLink?.sourceComponentId ?? 'none'}</strong>
              </div>
              <div>
                <span>Seed link</span>
                <strong>
                  {inspectedComponent.config.opa.seedLink?.sourceComponentId ??
                    inspectedComponent.config.opa.signalLink?.sourceComponentId ??
                    'none'}
                </strong>
              </div>
              <div>
                <span>Input mode</span>
                <strong>Real beam hits override linked fallback</strong>
              </div>
              <div>
                <span>Latest output</span>
                <strong>
                  {beamEvents[0]?.outputWavelengthNm
                    ? `${beamEvents[0].outputWavelengthNm.toFixed(1)} nm`
                    : 'n/a'}
                </strong>
              </div>
            </div>
          </div>
        ) : null}

        {inspectedComponent.type !== 'laser-source' &&
        inspectedComponent.type !== 'lens' &&
        strongestGaussianInteraction ? (
          <CollapsibleSection title="Gaussian / Aperture">
            <div className="inspector__readout">
              <div>
                <span>Spot radius at optic</span>
                <strong>{strongestGaussianInteraction.local.spotRadiusMm.toFixed(3)} mm</strong>
              </div>
              <div>
                <span>Beam diameter</span>
                <strong>{strongestGaussianInteraction.local.beamDiameterMm.toFixed(3)} mm</strong>
              </div>
              <div>
                <span>Waist radius</span>
                <strong>{strongestGaussianInteraction.local.waistRadiusMm.toFixed(3)} mm</strong>
              </div>
              <div>
                <span>Waist offset</span>
                <strong>{strongestGaussianInteraction.local.waistOffsetMm.toFixed(2)} mm</strong>
              </div>
              <div>
                <span>Curvature</span>
                <strong>{formatCurvature(strongestGaussianInteraction.local.radiusOfCurvatureMm)}</strong>
              </div>
              <div>
                <span>Aperture status</span>
                <strong>{formatGaussianStatus(strongestGaussianInteraction.apertureStatus)}</strong>
              </div>
              <div>
                <span>Clear aperture</span>
                <strong>
                  {strongestGaussianInteraction.apertureMm !== undefined
                    ? `${strongestGaussianInteraction.apertureMm.toFixed(2)} mm`
                    : 'n/a'}
                </strong>
              </div>
            </div>

            {gaussianComponentWarning ? (
              <p className="inspector__hint inspector__hint--warning">
                Strongest paraxial warning: {formatGaussianStatus(gaussianComponentWarning.strongestStatus)}.
              </p>
            ) : null}
          </CollapsibleSection>
        ) : null}

        {terminalCapture ? (
          <CollapsibleSection title="Terminal Capture">
            <div className="inspector__readout">
              <div>
                <span>Total captured</span>
                <strong>{terminalCapture.totalCapturedPowerMw.toFixed(2)} mW</strong>
              </div>
              <div>
                <span>Fundamental</span>
                <strong>{terminalCapture.fundamentalCapturedPowerMw.toFixed(2)} mW</strong>
              </div>
              <div>
                <span>SHG</span>
                <strong>{terminalCapture.shgCapturedPowerMw.toFixed(2)} mW</strong>
              </div>
              <div>
                <span>Mixed content</span>
                <strong>{terminalCapture.mixedContent ? 'Yes' : 'No'}</strong>
              </div>
            </div>

            <div className="inspector__list">
              {terminalCapture.hits.map((hit) => (
                <div className="inspector__list-item" key={hit.interactionId}>
                  <strong>{hit.sourceLabel}</strong>
                  <span>
                    {hit.wavelengthNm.toFixed(1)} nm • {hit.bandwidthNm.toFixed(2)} nm BW
                  </span>
                  <span>
                    {hit.powerMw.toFixed(2)} mW captured • {hit.powerPercent.toFixed(1)}%
                  </span>
                  <span>
                    {hit.contentTag} • {hit.polarizationTag}
                  </span>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        ) : null}

        <CollapsibleSection title="World Ports">
          {worldPorts.length === 0 ? (
            <p className="inspector__empty">
              No optical ports are defined for this component family.
            </p>
          ) : (
            <div className="port-list">
              {worldPorts.map((port) => (
                <div className="port-list__item" key={port.id}>
                  <div>
                    <strong>{port.label}</strong>
                    <span>{port.kind}</span>
                  </div>
                  <div>
                    <span>
                      ({port.worldPositionMm.x.toFixed(1)}, {port.worldPositionMm.y.toFixed(1)}) mm
                    </span>
                    <span>{formatDirection(port)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Beam Interactions">
          <InteractionTable events={beamEvents} />
        </CollapsibleSection>

        {interactionNotice ? (
          <p className="inspector__notice">{interactionNotice}</p>
        ) : null}
      </div>
    </aside>
  )
}

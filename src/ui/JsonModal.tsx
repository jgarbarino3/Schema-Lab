import { useEffect, useId, useMemo, useState } from 'react'
import { ModalShell } from './ModalShell'

interface JsonModalProps {
  error?: string
  initialValue: string
  isOpen: boolean
  onClose: () => void
  onLoad: (rawText: string) => void
  schemaVersion: number
}

const SINGLE_BREADBOARD_TEMPLATE = JSON.stringify(
  {
    workspace: {
      kind: 'single-breadboard',
      breadboard: {
        label: 'Metric Breadboard 600 x 300',
        widthMm: 600,
        heightMm: 300,
        holeSpacingMm: 25,
        edgeMarginMm: 12.5,
        thicknessMm: 12.7,
        finish: 'black-anodized',
        holeDensity: 'single',
        counterborePattern: 'corner-25mm',
      },
    },
    components: [],
    annotations: [],
  },
  null,
  2,
)

const OPTICAL_TABLE_TEMPLATE = JSON.stringify(
  {
    workspace: {
      kind: 'optical-table',
      table: {
        label: 'Optical Table 3600 x 1500',
        widthMm: 3600,
        heightMm: 1500,
        holeSpacingMm: 25,
        edgeMarginMm: 25,
        thicknessMm: 120,
        holeDensity: 'single',
        counterborePattern: 'none',
      },
      breadboards: [
        {
          id: 'breadboard-1',
          label: 'Breadboard 1',
          model: {
            label: 'Metric Breadboard 600 x 300',
            widthMm: 600,
            heightMm: 300,
            holeSpacingMm: 25,
            edgeMarginMm: 12.5,
            thicknessMm: 12.7,
            finish: 'black-anodized',
            holeDensity: 'single',
            counterborePattern: 'corner-25mm',
          },
          anchorMm: {
            x: 1500,
            y: 600,
          },
          rotationQuarterTurns: 0,
          mountPlaneOffsetMm: 12.7,
        },
      ],
    },
    components: [],
    annotations: [],
  },
  null,
  2,
)

const MIXED_SURFACES_TEMPLATE = JSON.stringify(
  {
    workspace: {
      kind: 'optical-table',
      table: {
        label: 'Optical Table 3600 x 1500',
        widthMm: 3600,
        heightMm: 1500,
        holeSpacingMm: 25,
        edgeMarginMm: 25,
        thicknessMm: 120,
        holeDensity: 'single',
        counterborePattern: 'none',
      },
      breadboards: [
        {
          id: 'breadboard-1',
          label: 'Breadboard 1',
          model: {
            label: 'Metric Breadboard 600 x 300',
            widthMm: 600,
            heightMm: 300,
            holeSpacingMm: 25,
            edgeMarginMm: 12.5,
            thicknessMm: 12.7,
            finish: 'black-anodized',
            holeDensity: 'single',
            counterborePattern: 'corner-25mm',
          },
          anchorMm: {
            x: 1000,
            y: 600,
          },
          rotationQuarterTurns: 0,
          mountPlaneOffsetMm: 12.7,
        },
        {
          id: 'breadboard-2',
          label: 'Breadboard 2',
          model: {
            label: 'Metric Breadboard 600 x 300',
            widthMm: 600,
            heightMm: 300,
            holeSpacingMm: 25,
            edgeMarginMm: 12.5,
            thicknessMm: 12.7,
            finish: 'black-anodized',
            holeDensity: 'single',
            counterborePattern: 'corner-25mm',
          },
          anchorMm: {
            x: 1900,
            y: 600,
          },
          rotationQuarterTurns: 0,
          mountPlaneOffsetMm: 12.7,
        },
      ],
    },
    components: [],
    annotations: [],
  },
  null,
  2,
)

export function JsonModal({
  error,
  initialValue,
  isOpen,
  onClose,
  onLoad,
  schemaVersion,
}: JsonModalProps) {
  const titleId = useId()
  const [draft, setDraft] = useState(initialValue)
  const [isHelperOpen, setIsHelperOpen] = useState(false)
  const [localError, setLocalError] = useState<string | undefined>()
  const [helperStatus, setHelperStatus] = useState<string | undefined>()

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setDraft(initialValue)
    setIsHelperOpen(false)
    setHelperStatus(undefined)
    setLocalError(undefined)
  }, [initialValue, isOpen])

  const aiPrompt = useMemo(
    () =>
      [
        'Return JSON only for Schema-Lab Scene import.',
        'Output a top-level object with workspace plus optional components, annotations, beamSettings, metadata.',
        'Use millimeters for every coordinate.',
        'Use workspace.kind as single-breadboard or optical-table.',
        'For optical-table scenes, set each component hostSurfaceId to optical-table or a breadboard id.',
        'Keep type, variantId, rotationQuarterTurns, and config valid for Schema-Lab component entries.',
        'Do not include comments or markdown fences.',
      ].join(' '),
    [],
  )

  if (!isOpen) {
    return null
  }

  const handleInsertTemplate = (template: string) => {
    setDraft(template)
    setHelperStatus('Template inserted into the editor.')
    setLocalError(undefined)
  }

  const handleCopyAiPrompt = async () => {
    if (!navigator.clipboard?.writeText) {
      setLocalError('Clipboard is unavailable in this browser context.')
      return
    }

    try {
      await navigator.clipboard.writeText(aiPrompt)
      setHelperStatus('AI prompt copied to clipboard.')
      setLocalError(undefined)
    } catch {
      setLocalError('Could not copy the AI prompt. Please copy it manually.')
    }
  }

  return (
    <ModalShell
      ariaLabel="Scene JSON"
      cardClassName="json-modal__dialog"
      className="json-modal"
      onClose={onClose}
      titleId={titleId}
    >
        <div className="json-modal__header">
          <div>
            <h2 id={titleId}>Scene JSON</h2>
            <p>Load or edit the serialized scene document directly.</p>
            <p className="json-modal__hint">
              Import accepts shorthand JSON and auto-uses schema version {schemaVersion}.
            </p>
          </div>
          <button onClick={onClose} type="button">
            Close
          </button>
        </div>

        {error || localError ? (
          <p className="json-modal__error">{error ?? localError}</p>
        ) : null}

        <textarea
          onChange={(event) => {
            setHelperStatus(undefined)
            setLocalError(undefined)
            setDraft(event.target.value)
          }}
          spellCheck={false}
          value={draft}
        />

        {isHelperOpen ? (
          <section className="json-modal__helper" aria-label="JSON help">
            <div className="json-modal__helper-grid">
              <div>
                <h3>Quick Rules</h3>
                <ul>
                  <li>Use plain JSON only (no comments or markdown fences).</li>
                  <li>Coordinates are in millimeters.</li>
                  <li>
                    In optical-table scenes, component <code>hostSurfaceId</code> must be{' '}
                    <code>optical-table</code> or a breadboard id.
                  </li>
                  <li>
                    Safest workflow: export your current scene JSON, then edit only the values
                    you need.
                  </li>
                </ul>
              </div>
              <div>
                <h3>Starter Templates</h3>
                <div className="json-modal__helper-actions">
                  <button
                    onClick={() => {
                      handleInsertTemplate(SINGLE_BREADBOARD_TEMPLATE)
                    }}
                    type="button"
                  >
                    Single Board
                  </button>
                  <button
                    onClick={() => {
                      handleInsertTemplate(OPTICAL_TABLE_TEMPLATE)
                    }}
                    type="button"
                  >
                    Optical Table
                  </button>
                  <button
                    onClick={() => {
                      handleInsertTemplate(MIXED_SURFACES_TEMPLATE)
                    }}
                    type="button"
                  >
                    Mixed Surfaces
                  </button>
                </div>
                <h3>AI Assist</h3>
                <button onClick={handleCopyAiPrompt} type="button">
                  Copy AI Formatting Prompt
                </button>
              </div>
            </div>
            {helperStatus ? (
              <p className="json-modal__helper-status" role="status">
                {helperStatus}
              </p>
            ) : null}
          </section>
        ) : null}

        <div className="json-modal__actions">
          <button
            onClick={() => {
              setDraft(initialValue)
              setHelperStatus(undefined)
              setLocalError(undefined)
            }}
            type="button"
          >
            Reset Text
          </button>
          <button
            onClick={() => {
              try {
                const formatted = JSON.stringify(JSON.parse(draft), null, 2)
                setDraft(formatted)
                setHelperStatus(undefined)
              } catch {
                setLocalError('JSON formatting failed. Fix syntax first.')
              }
            }}
            type="button"
          >
            Format
          </button>
          <button
            onClick={() => {
              setIsHelperOpen((previous) => !previous)
              setHelperStatus(undefined)
              setLocalError(undefined)
            }}
            type="button"
          >
            {isHelperOpen ? 'Hide JSON Help' : 'JSON Help'}
          </button>
          <button
            onClick={() => {
              try {
                onLoad(draft)
              } catch (nextError) {
                setLocalError(
                  nextError instanceof Error
                    ? nextError.message
                    : 'Scene JSON could not be loaded.',
                )
              }
            }}
            type="button"
          >
            Load Scene
          </button>
        </div>
    </ModalShell>
  )
}

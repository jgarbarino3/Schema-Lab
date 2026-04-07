import { useMemo, useState } from 'react'
import type {
  SvgImportAmbiguousElement,
  SvgImportDocument,
  SvgImportManualResolution,
} from '../domain/svgImport'
import { listSvgImportComponentChoices } from '../domain/svgImport'
import type { ComponentType } from '../domain/types'
import { SvgImportPreview } from './SvgImportPreview'

interface SvgAmbiguityModalProps {
  ambiguous: SvgImportAmbiguousElement[]
  document: SvgImportDocument
  isOpen: boolean
  onCancel: () => void
  onConfirm: (resolutions: SvgImportManualResolution[]) => void
}

type ResolutionValue = ComponentType | '__skip__' | undefined
const AUTO_RESOLVE_GAP_THRESHOLD = 0.15

export function SvgAmbiguityModal(props: SvgAmbiguityModalProps) {
  const { ambiguous, document, isOpen, onCancel, onConfirm } = props
  const [index, setIndex] = useState(0)
  const [resolutions, setResolutions] = useState<Record<string, ResolutionValue>>({})
  const [autoResolveSummary, setAutoResolveSummary] = useState<string | undefined>()
  const [autoSelectUsed, setAutoSelectUsed] = useState(false)
  const choices = useMemo(
    () =>
      [...listSvgImportComponentChoices()].sort((left, right) =>
        left.label.localeCompare(right.label),
      ),
    [],
  )

  const current = ambiguous[index]

  if (!isOpen || !current) {
    return null
  }

  const currentResolution = resolutions[current.elementId]
  const canAdvance = currentResolution !== undefined
  const isLast = index === ambiguous.length - 1
  const unresolvedCount = ambiguous.filter(
    (item) => resolutions[item.elementId] === undefined,
  ).length
  const allResolved = unresolvedCount === 0

  const buildConfirmPayload = (nextResolutions: Record<string, ResolutionValue>) =>
    ambiguous.map((item) => {
      const value = nextResolutions[item.elementId]
      return {
        elementId: item.elementId,
        componentType:
          value && value !== '__skip__' ? (value as ComponentType) : undefined,
      }
    })

  const setResolution = (elementId: string, value: ResolutionValue, autoAdvance = false) => {
    const nextResolutions = { ...resolutions, [elementId]: value }
    const nextUnresolvedCount = ambiguous.filter(
      (item) => nextResolutions[item.elementId] === undefined,
    ).length

    setResolutions(nextResolutions)
    setAutoResolveSummary(undefined)

    if (nextUnresolvedCount === 0) {
      onConfirm(buildConfirmPayload(nextResolutions))
      return
    }

    if (autoAdvance && !isLast) {
      setIndex((previous) => Math.min(ambiguous.length - 1, previous + 1))
    }
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true" aria-label="Resolve SVG ambiguities">
      <button className="modal-shell__backdrop" onClick={onCancel} type="button" />
      <div className="modal-shell__card svg-ambiguity-modal">
        <header className="modal-shell__header">
          <h2>Resolve Ambiguous Symbols</h2>
          <p>
            {index + 1} of {ambiguous.length}: <strong>{current.label}</strong>
          </p>
        </header>

        <div className="svg-ambiguity-modal__layout">
          <SvgImportPreview
            className="svg-import-preview"
            document={document}
            highlightedElementIds={[current.elementId]}
          />

          <div className="svg-ambiguity-modal__controls">
            <fieldset className="modal-shell__fieldset">
              <legend>Top Suggestions</legend>
              <div className="svg-ambiguity-modal__suggestions">
                {current.suggestions.slice(0, 3).map((suggestion) => {
                  const familyLabel =
                    choices.find((choice) => choice.type === suggestion.componentType)?.label ??
                    suggestion.componentType

                  return (
                    <button
                      className={
                        currentResolution === suggestion.componentType ? 'is-active-tool' : undefined
                      }
                      key={`${current.elementId}-${suggestion.componentType}`}
                      onClick={() => {
                        setResolution(current.elementId, suggestion.componentType, true)
                      }}
                      type="button"
                    >
                      {familyLabel} ({Math.round(suggestion.confidence * 100)}%)
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <fieldset className="modal-shell__fieldset">
              <legend>All Component Families</legend>
              <label className="svg-import-field">
                Assign family
                <select
                  onChange={(event) => {
                    const value = event.target.value
                    setResolution(
                      current.elementId,
                      value === '__skip__' ? '__skip__' : (value as ComponentType),
                    )
                  }}
                  value={currentResolution ?? ''}
                >
                  <option value="">Select a family...</option>
                  <option value="__skip__">Skip this element</option>
                  {choices.map((choice) => (
                    <option key={choice.type} value={choice.type}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          </div>
        </div>

        {autoResolveSummary ? <p className="modal-shell__hint">{autoResolveSummary}</p> : null}

        <footer className="modal-shell__actions">
          <button
            disabled={index === 0}
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            type="button"
          >
            Previous
          </button>
          {!autoSelectUsed ? (
            <button
              onClick={() => {
                const nextResolutions = { ...resolutions }
                let autoAssignedCount = 0
                let requiresManualCount = 0

                for (const item of ambiguous) {
                  if (nextResolutions[item.elementId] !== undefined) {
                    continue
                  }

                  const topSuggestion = item.suggestions[0]
                  const secondSuggestion = item.suggestions[1]

                  if (!topSuggestion) {
                    requiresManualCount += 1
                    continue
                  }

                  if (
                    secondSuggestion &&
                    topSuggestion.confidence - secondSuggestion.confidence <=
                      AUTO_RESOLVE_GAP_THRESHOLD
                  ) {
                    requiresManualCount += 1
                    continue
                  }

                  nextResolutions[item.elementId] = topSuggestion.componentType
                  autoAssignedCount += 1
                }

                const nextUnresolvedCount = ambiguous.filter(
                  (item) => nextResolutions[item.elementId] === undefined,
                ).length

                setResolutions(nextResolutions)
                setAutoSelectUsed(true)

                if (nextUnresolvedCount === 0) {
                  onConfirm(buildConfirmPayload(nextResolutions))
                  return
                }

                const firstUnresolvedIndex = ambiguous.findIndex(
                  (item) => nextResolutions[item.elementId] === undefined,
                )

                setIndex(
                  firstUnresolvedIndex >= 0
                    ? firstUnresolvedIndex
                    : Math.max(0, ambiguous.length - 1),
                )
                setAutoResolveSummary(
                  `Auto-selected ${autoAssignedCount} symbol${autoAssignedCount === 1 ? '' : 's'}. ${requiresManualCount} still require manual choice.`,
                )
              }}
              type="button"
            >
              Auto-Select Clear Matches
            </button>
          ) : null}
          {!isLast ? (
            <button
              className="modal-shell__primary"
              disabled={!canAdvance}
              onClick={() => setIndex((value) => Math.min(ambiguous.length - 1, value + 1))}
              type="button"
            >
              Next
            </button>
          ) : (
            <button
              className="modal-shell__primary"
              disabled={!allResolved}
              onClick={() => onConfirm(buildConfirmPayload(resolutions))}
              type="button"
            >
              Finish Import
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

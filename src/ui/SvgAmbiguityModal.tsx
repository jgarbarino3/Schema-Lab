import { useId, useState } from 'react'
import { getComponentDefinition } from '../domain/componentCatalog'
import type {
  SvgImportDocument,
  SvgImportManualResolution,
  SvgImportReviewItem,
} from '../domain/svgImport'
import { SvgImportPreview } from './SvgImportPreview'
import { SvgImportVariantChooser } from './SvgImportVariantChooser'
import { ModalShell } from './ModalShell'

interface SvgAmbiguityModalProps {
  document: SvgImportDocument
  isOpen: boolean
  onCancel: () => void
  onConfirm: (resolutions: SvgImportManualResolution[]) => void
  reviewItems: SvgImportReviewItem[]
}

type ResolutionState =
  | {
      componentType?: SvgImportManualResolution['componentType']
      disposition: SvgImportManualResolution['disposition']
      variantId?: string
    }
  | undefined

const AUTO_RESOLVE_GAP_THRESHOLD = 0.15

function describeReviewItem(item: SvgImportReviewItem) {
  switch (item.kind) {
    case 'missing-junction':
      return 'Potential missing beam-turn optic'
    case 'linework-fragment':
      return 'Review thin line fragment'
    default:
      return 'Resolve SVG symbol'
  }
}

export function SvgAmbiguityModal(props: SvgAmbiguityModalProps) {
  const titleId = useId()
  const { document, isOpen, onCancel, onConfirm, reviewItems } = props
  const [index, setIndex] = useState(0)
  const [resolutions, setResolutions] = useState<Record<string, ResolutionState>>({})
  const [autoResolveSummary, setAutoResolveSummary] = useState<string | undefined>()
  const [autoSelectUsed, setAutoSelectUsed] = useState(false)
  const current = reviewItems[index]

  if (!isOpen || !current) {
    return null
  }

  const currentResolution = resolutions[current.id]
  const canAdvance =
    currentResolution !== undefined &&
    (currentResolution.disposition !== 'component' || currentResolution.componentType !== undefined)
  const isLast = index === reviewItems.length - 1
  const unresolvedCount = reviewItems.filter(
    (item) => resolutions[item.id] === undefined,
  ).length
  const allResolved = unresolvedCount === 0

  const buildConfirmPayload = (nextResolutions: Record<string, ResolutionState>) =>
    reviewItems.map((item) => {
      const resolution = nextResolutions[item.id]

      return {
        componentType: resolution?.componentType,
        disposition: resolution?.disposition ?? 'skip',
        elementId: item.elementId,
        reviewItemId: item.id,
        variantId: resolution?.variantId,
      } satisfies SvgImportManualResolution
    })

  const setResolution = (
    reviewItemId: string,
    value: Exclude<ResolutionState, undefined>,
    autoAdvance = false,
  ) => {
    const nextResolutions = { ...resolutions, [reviewItemId]: value }
    const nextUnresolvedCount = reviewItems.filter(
      (item) => nextResolutions[item.id] === undefined,
    ).length

    setResolutions(nextResolutions)
    setAutoResolveSummary(undefined)

    if (nextUnresolvedCount === 0) {
      onConfirm(buildConfirmPayload(nextResolutions))
      return
    }

    if (autoAdvance && !isLast) {
      setIndex((previous) => Math.min(reviewItems.length - 1, previous + 1))
    }
  }

  const selectedType =
    currentResolution?.disposition === 'component' ? currentResolution.componentType : undefined
  const selectedVariantId =
    currentResolution?.disposition === 'component' ? currentResolution.variantId : undefined

  return (
    <ModalShell
      ariaLabel="Resolve SVG import review"
      cardClassName="modal-shell__card svg-ambiguity-modal"
      onClose={onCancel}
      titleId={titleId}
    >
        <header className="modal-shell__header">
          <h2 id={titleId}>Review SVG Import</h2>
          <p>
            {index + 1} of {reviewItems.length}: <strong>{describeReviewItem(current)}</strong>
          </p>
        </header>

        <div className="svg-ambiguity-modal__layout">
          <SvgImportPreview
            className="svg-import-preview"
            document={document}
            focusOverlay={{
              bounds: current.bounds,
              center: current.center,
              label: current.kind === 'missing-junction' ? 'junction' : undefined,
            }}
            highlightedElementIds={current.sourceElementIds}
          />

          <div className="svg-ambiguity-modal__controls">
            <fieldset className="modal-shell__fieldset">
              <legend>Review Target</legend>
              <p className="modal-shell__hint">{current.label}</p>
              {current.kind === 'missing-junction' ? (
                <p className="modal-shell__hint">
                  These beam-like segments nearly meet, but no explicit optic was detected at the turn.
                </p>
              ) : null}
            </fieldset>

            {current.suggestions.length > 0 ? (
              <fieldset className="modal-shell__fieldset">
                <legend>Top Suggestions</legend>
                <div className="svg-ambiguity-modal__suggestions">
                  {current.suggestions.slice(0, 3).map((suggestion) => (
                    <button
                      className={
                        selectedType === suggestion.componentType ? 'is-active-tool' : undefined
                      }
                      key={`${current.id}-${suggestion.componentType}`}
                      onClick={() =>
                        setResolution(
                          current.id,
                          {
                            componentType: suggestion.componentType,
                            disposition: 'component',
                          },
                          true,
                        )
                      }
                      type="button"
                    >
                      {getComponentDefinition(suggestion.componentType).familyLabel} (
                      {Math.round(suggestion.confidence * 100)}%)
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <SvgImportVariantChooser
              onSelect={(selection) =>
                setResolution(current.id, {
                  componentType: selection.componentType,
                  disposition: 'component',
                  variantId: selection.variantId,
                })
              }
              selectedComponentType={selectedType}
              selectedVariantId={selectedVariantId}
            />

            <fieldset className="modal-shell__fieldset">
              <legend>Disposition</legend>
              {current.allowKeepAsLinework ? (
                <button
                  className={
                    currentResolution?.disposition === 'linework' ? 'is-active-tool' : undefined
                  }
                  onClick={() =>
                    setResolution(current.id, {
                      disposition: 'linework',
                    })
                  }
                  type="button"
                >
                  Keep as linework
                </button>
              ) : null}
              <button
                aria-pressed={currentResolution?.disposition === 'skip'}
                className={currentResolution?.disposition === 'skip' ? 'is-active-tool' : undefined}
                onClick={() =>
                  setResolution(current.id, {
                    disposition: 'skip',
                  })
                }
                type="button"
              >
                Skip this item
              </button>
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

                for (const item of reviewItems) {
                  if (nextResolutions[item.id] !== undefined) {
                    continue
                  }

                  if (item.kind !== 'ambiguous-symbol') {
                    requiresManualCount += 1
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

                  nextResolutions[item.id] = {
                    componentType: topSuggestion.componentType,
                    disposition: 'component',
                  }
                  autoAssignedCount += 1
                }

                const nextUnresolvedCount = reviewItems.filter(
                  (item) => nextResolutions[item.id] === undefined,
                ).length

                setResolutions(nextResolutions)
                setAutoSelectUsed(true)

                if (nextUnresolvedCount === 0) {
                  onConfirm(buildConfirmPayload(nextResolutions))
                  return
                }

                const firstUnresolvedIndex = reviewItems.findIndex(
                  (item) => nextResolutions[item.id] === undefined,
                )

                setIndex(
                  firstUnresolvedIndex >= 0
                    ? firstUnresolvedIndex
                    : Math.max(0, reviewItems.length - 1),
                )
                setAutoResolveSummary(
                  `Auto-selected ${autoAssignedCount} item${autoAssignedCount === 1 ? '' : 's'}. ${requiresManualCount} still require manual review.`,
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
              onClick={() => setIndex((value) => Math.min(reviewItems.length - 1, value + 1))}
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
    </ModalShell>
  )
}

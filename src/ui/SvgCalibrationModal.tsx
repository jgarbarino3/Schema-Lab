import { useId, useMemo, useState, type FocusEvent } from 'react'
import {
  DEFAULT_IMPORT_HOLE_PITCH_MM,
  type ImportAutoCalibrationResult,
} from '../domain/importAutoCalibration'
import type {
  ImportPreviewDocument,
  SvgCalibrationMode,
  SvgCalibrationRequest,
  SvgCalibrationSample,
} from '../domain/svgImport'
import type { Vector2Mm } from '../domain/types'
import { ModalShell } from './ModalShell'
import { SvgImportPreview } from './SvgImportPreview'

interface SvgCalibrationModalProps {
  autoCalibrationSuggestion?: ImportAutoCalibrationResult
  baseMmPerUnit: number
  document: ImportPreviewDocument
  isOpen: boolean
  onBack: () => void
  onCancel: () => void
  onConfirm: (request: SvgCalibrationRequest, mmPerUnit: number) => void
  onUseSuggestedAutoCalibration?: (result: ImportAutoCalibrationResult) => void
}

function distance(start: Vector2Mm, end: Vector2Mm) {
  return Math.hypot(end.x - start.x, end.y - start.y)
}

function averageScale(samples: SvgCalibrationSample[], fallbackScale: number) {
  const ratios = samples
    .map((sample) => {
      const units = distance(sample.start, sample.end)
      if (units <= 1e-9 || sample.distanceMm <= 0) {
        return undefined
      }
      return sample.distanceMm / units
    })
    .filter((value): value is number => value !== undefined)

  if (ratios.length === 0) {
    return fallbackScale
  }

  return ratios.reduce((sum, value) => sum + value, 0) / ratios.length
}

function parsePositiveNumberInput(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function formatNumericInput(value: number) {
  return Number.isFinite(value) ? `${value}` : ''
}

function selectAllText(event: FocusEvent<HTMLInputElement>) {
  event.currentTarget.select()
}

export function SvgCalibrationModal(props: SvgCalibrationModalProps) {
  const titleId = useId()
  const {
    autoCalibrationSuggestion,
    baseMmPerUnit,
    document,
    isOpen,
    onBack,
    onCancel,
    onConfirm,
    onUseSuggestedAutoCalibration,
  } = props
  const [mode, setMode] = useState<SvgCalibrationMode>('simple')
  const [activePoints, setActivePoints] = useState<Vector2Mm[]>([])
  const [distanceInput, setDistanceInput] = useState(
    `${DEFAULT_IMPORT_HOLE_PITCH_MM}`,
  )
  const [samples, setSamples] = useState<SvgCalibrationSample[]>([])

  const parsedDistanceMm = parsePositiveNumberInput(distanceInput)
  const currentSample = useMemo<SvgCalibrationSample | undefined>(
    () =>
      activePoints.length === 2 && parsedDistanceMm
        ? {
            start: activePoints[0],
            end: activePoints[1],
            distanceMm: parsedDistanceMm,
          }
        : undefined,
    [activePoints, parsedDistanceMm],
  )

  const simpleScale = useMemo(() => {
    if (!currentSample) {
      return undefined
    }

    return averageScale([currentSample], baseMmPerUnit)
  }, [baseMmPerUnit, currentSample])

  const advancedScale = useMemo(
    () => averageScale(samples, baseMmPerUnit),
    [baseMmPerUnit, samples],
  )

  const canConfirmSimple = mode === 'simple' && currentSample !== undefined
  const canConfirmAdvanced = mode === 'advanced' && samples.length >= 2

  if (!isOpen) {
    return null
  }

  return (
    <ModalShell
      ariaLabel="Drawing calibration"
      cardClassName="modal-shell__card svg-calibration-modal"
      onClose={onCancel}
      testId="drawing-calibration-modal"
      titleId={titleId}
    >
        <header className="modal-shell__header">
          <h2 id={titleId}>Calibrate Import Scale</h2>
          <p>Select points on the preview, then enter the known physical distance in mm.</p>
        </header>

        <div className="svg-calibration-modal__layout">
          <SvgImportPreview
            className="svg-import-preview"
            document={document}
            onSelectPoint={(point) => {
              setActivePoints((previous) =>
                previous.length < 2 ? [...previous, point] : [previous[1], point],
              )
            }}
            selectedPoints={activePoints}
          />

          <div className="svg-calibration-modal__controls">
            {autoCalibrationSuggestion ? (
              <fieldset className="modal-shell__fieldset">
                <legend>Auto-Calibrate</legend>
                <p className="modal-shell__hint">
                  Visible lattice: {autoCalibrationSuggestion.visibleGridColumnCount} ×{' '}
                  {autoCalibrationSuggestion.visibleGridRowCount} visible holes. Inferred board:{' '}
                  {autoCalibrationSuggestion.gridColumnCount} ×{' '}
                  {autoCalibrationSuggestion.gridRowCount} holes at{' '}
                  {autoCalibrationSuggestion.inferredMmPerUnit.toFixed(5)} mm per{' '}
                  {document.sourceKind === 'svg' ? 'SVG unit' : 'pixel'}.
                </p>
                <p className="modal-shell__hint">
                  {autoCalibrationSuggestion.note ??
                    `Using the standard ${DEFAULT_IMPORT_HOLE_PITCH_MM} mm breadboard pitch assumption and board-size inference from the fitted lattice.`}
                </p>
                <button
                  className="modal-shell__primary"
                  data-testid="drawing-calibration-apply-auto"
                  onClick={() => onUseSuggestedAutoCalibration?.(autoCalibrationSuggestion)}
                  type="button"
                >
                  Use Suggested Auto-Calibration
                </button>
              </fieldset>
            ) : null}

            <fieldset className="modal-shell__fieldset">
              <legend>Mode</legend>
              <label className="modal-shell__choice">
                <input
                  checked={mode === 'simple'}
                  name="svg-calibration-mode"
                  onChange={() => setMode('simple')}
                  type="radio"
                />
                <span>Simple (2-point)</span>
              </label>
              <label className="modal-shell__choice">
                <input
                  checked={mode === 'advanced'}
                  name="svg-calibration-mode"
                  onChange={() => setMode('advanced')}
                  type="radio"
                />
                <span>Advanced (multi-point)</span>
              </label>
            </fieldset>

            <fieldset className="modal-shell__fieldset">
              <legend>Current Pair</legend>
              <p className="modal-shell__hint">
                Pick two points, then enter known spacing in millimeters.
              </p>
              <label className="svg-import-field">
                Known distance (mm)
                <input
                  inputMode="decimal"
                  onBlur={() =>
                    setDistanceInput((previous) =>
                      parsePositiveNumberInput(previous) !== undefined
                        ? formatNumericInput(parsePositiveNumberInput(previous)!)
                        : previous,
                    )
                  }
                  onChange={(event) => setDistanceInput(event.target.value)}
                  onFocus={selectAllText}
                  type="text"
                  value={distanceInput}
                />
              </label>
              <div className="svg-calibration-modal__pair-actions">
                <button onClick={() => setActivePoints([])} type="button">
                  Clear Points
                </button>
                {mode === 'advanced' ? (
                  <button
                    className="modal-shell__primary"
                    disabled={!currentSample}
                    onClick={() => {
                      if (!currentSample) {
                        return
                      }

                      setSamples((previous) => [...previous, currentSample])
                      setActivePoints([])
                    }}
                    type="button"
                  >
                    Add Sample
                  </button>
                ) : null}
              </div>
            </fieldset>

            <fieldset className="modal-shell__fieldset">
              <legend>Scale Result</legend>
              {mode === 'simple' ? (
                <p className="modal-shell__hint">
                  {simpleScale
                    ? `Computed scale: ${simpleScale.toFixed(5)} mm per ${document.sourceKind === 'svg' ? 'SVG unit' : 'pixel'}`
                    : `Select 2 points to compute scale. Current default: ${baseMmPerUnit.toFixed(5)} mm/${document.sourceKind === 'svg' ? 'unit' : 'pixel'}`}
                </p>
              ) : (
                <>
                  <p className="modal-shell__hint">
                    Samples: {samples.length} · Average scale {advancedScale.toFixed(5)} mm per{' '}
                    {document.sourceKind === 'svg' ? 'SVG unit' : 'pixel'}
                  </p>
                  <ul className="svg-calibration-modal__sample-list">
                    {samples.map((sample, index) => (
                      <li key={`sample-${index}`}>
                        #{index + 1}: {sample.distanceMm.toFixed(2)} mm
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </fieldset>
          </div>
        </div>

        <footer className="modal-shell__actions">
          <button onClick={onBack} type="button">
            Back
          </button>
          <button onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className="modal-shell__primary"
            disabled={!(canConfirmSimple || canConfirmAdvanced)}
            onClick={() => {
              if (mode === 'simple' && currentSample) {
                onConfirm({ mode, samples: [currentSample] }, simpleScale ?? baseMmPerUnit)
                return
              }

              if (mode === 'advanced' && samples.length >= 2) {
                onConfirm({ mode, samples }, advancedScale)
              }
            }}
            type="button"
          >
            Use Calibration
          </button>
        </footer>
    </ModalShell>
  )
}

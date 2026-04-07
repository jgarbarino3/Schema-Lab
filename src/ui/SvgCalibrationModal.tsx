import { useMemo, useState } from 'react'
import type {
  SvgCalibrationMode,
  SvgCalibrationRequest,
  SvgCalibrationSample,
  SvgImportDocument,
} from '../domain/svgImport'
import type { Vector2Mm } from '../domain/types'
import { SvgImportPreview } from './SvgImportPreview'

interface SvgCalibrationModalProps {
  baseMmPerUnit: number
  document: SvgImportDocument
  isOpen: boolean
  onBack: () => void
  onCancel: () => void
  onConfirm: (request: SvgCalibrationRequest, mmPerUnit: number) => void
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

export function SvgCalibrationModal(props: SvgCalibrationModalProps) {
  const { baseMmPerUnit, document, isOpen, onBack, onCancel, onConfirm } = props
  const [mode, setMode] = useState<SvgCalibrationMode>('simple')
  const [activePoints, setActivePoints] = useState<Vector2Mm[]>([])
  const [distanceInput, setDistanceInput] = useState('25')
  const [samples, setSamples] = useState<SvgCalibrationSample[]>([])

  const parsedDistanceMm = Number.parseFloat(distanceInput)
  const currentSample = useMemo<SvgCalibrationSample | undefined>(
    () =>
      activePoints.length === 2 && Number.isFinite(parsedDistanceMm) && parsedDistanceMm > 0
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
    <div
      className="modal-shell"
      role="dialog"
      aria-modal="true"
      aria-label="SVG calibration"
    >
      <button className="modal-shell__backdrop" onClick={onCancel} type="button" />
      <div className="modal-shell__card svg-calibration-modal">
        <header className="modal-shell__header">
          <h2>Calibrate SVG Scale</h2>
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
                  min="0"
                  onChange={(event) => setDistanceInput(event.target.value)}
                  step="0.01"
                  type="number"
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
                    ? `Computed scale: ${simpleScale.toFixed(5)} mm per SVG unit`
                    : `Select 2 points to compute scale. Current default: ${baseMmPerUnit.toFixed(5)} mm/unit`}
                </p>
              ) : (
                <>
                  <p className="modal-shell__hint">
                    Samples: {samples.length} · Average scale {advancedScale.toFixed(5)} mm per SVG unit
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
      </div>
    </div>
  )
}

import { useEffect, useId, useState } from 'react'
import type {
  ExportFormat,
  ExportScope,
  ExportView,
  SvgExportPreset,
} from '../domain/exportLayout'
import { ModalShell } from './ModalShell'

interface ExportOptionsModalProps {
  defaultScope: ExportScope
  defaultSvgPreset: SvgExportPreset
  format?: ExportFormat
  isAngledViewAvailable: boolean
  isOpen: boolean
  onCancel: () => void
  onConfirm: (options: {
    format: ExportFormat
    scope: ExportScope
    svgPreset?: SvgExportPreset
    view: ExportView
  }) => void
}

function formatExportFormat(format?: ExportFormat) {
  switch (format) {
    case 'png':
      return 'PNG'
    case 'pdf':
      return 'PDF'
    case 'svg':
      return 'SVG'
    case 'dxf':
      return 'DXF'
    case 'pptx':
      return 'PPTX'
    default:
      return 'Export'
  }
}

export function ExportOptionsModal({
  defaultScope,
  defaultSvgPreset,
  format,
  isAngledViewAvailable,
  isOpen,
  onCancel,
  onConfirm,
}: ExportOptionsModalProps) {
  const titleId = useId()
  const [scope, setScope] = useState<ExportScope>(defaultScope)
  const [svgPreset, setSvgPreset] = useState<SvgExportPreset>(defaultSvgPreset)
  const [view, setView] = useState<ExportView>('current')

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setScope(defaultScope)
    setSvgPreset(defaultSvgPreset)
    setView('current')
  }, [defaultScope, defaultSvgPreset, format, isOpen])

  if (!isOpen || !format) {
    return null
  }

  const confirmLabel =
    format === 'svg'
      ? svgPreset === 'presentation'
        ? 'Export Presentation SVG'
        : 'Export Engineering SVG'
      : `Export ${formatExportFormat(format)}`
  const showViewOptions =
    format !== 'dxf' && (format !== 'svg' || svgPreset === 'presentation')

  return (
    <ModalShell
      ariaLabel="Export options"
      cardClassName="modal-shell__card modal-shell__card--export"
      onClose={onCancel}
      titleId={titleId}
    >
        <div className="modal-shell__header">
          <h2 id={titleId}>{formatExportFormat(format)} Export Options</h2>
          <p>
            Choose what portion of the scene to export. SVG also lets you choose between a
            clean engineering preset and a presentation-styled preset.
          </p>
        </div>

        <div className="modal-shell__form">
          <fieldset className="modal-shell__fieldset">
            <legend>Scope</legend>
            <label className="modal-shell__choice">
              <input
                checked={scope === 'breadboard-only'}
                name="export-scope"
                onChange={() => setScope('breadboard-only')}
                type="radio"
                value="breadboard-only"
              />
              <span>Breadboard Only</span>
            </label>
            <label className="modal-shell__choice">
              <input
                checked={scope === 'full-scheme'}
                name="export-scope"
                onChange={() => setScope('full-scheme')}
                type="radio"
                value="full-scheme"
              />
              <span>Full Scheme</span>
            </label>
          </fieldset>

          {format === 'svg' ? (
            <fieldset className="modal-shell__fieldset">
              <legend>SVG Preset</legend>
              <label className="modal-shell__choice">
                <input
                  checked={svgPreset === 'engineering'}
                  name="svg-preset"
                  onChange={() => setSvgPreset('engineering')}
                  type="radio"
                  value="engineering"
                />
                <span>Engineering SVG</span>
              </label>
              <label className="modal-shell__choice">
                <input
                  checked={svgPreset === 'presentation'}
                  name="svg-preset"
                  onChange={() => setSvgPreset('presentation')}
                  type="radio"
                  value="presentation"
                />
                <span>Presentation SVG</span>
              </label>
            </fieldset>
          ) : null}

          {showViewOptions ? (
            <fieldset className="modal-shell__fieldset">
              <legend>View</legend>
              <label className="modal-shell__choice">
                <input
                  checked={view === 'current'}
                  name="export-view"
                  onChange={() => setView('current')}
                  type="radio"
                  value="current"
                />
                <span>Current view</span>
              </label>
              <label className="modal-shell__choice">
                <input
                  checked={view === 'top-down'}
                  name="export-view"
                  onChange={() => setView('top-down')}
                  type="radio"
                  value="top-down"
                />
                <span>Top-down</span>
              </label>
              <label className="modal-shell__choice">
                <input
                  checked={view === 'angled'}
                  disabled={!isAngledViewAvailable}
                  name="export-view"
                  onChange={() => setView('angled')}
                  type="radio"
                  value="angled"
                />
                <span>
                  Angled
                  {!isAngledViewAvailable ? ' (Realistic optical-table scenes only)' : ''}
                </span>
              </label>
            </fieldset>
          ) : null}
        </div>

        <div className="modal-shell__actions">
          <button onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className="modal-shell__primary"
            onClick={() => {
              onConfirm({
                format,
                scope,
                svgPreset: format === 'svg' ? svgPreset : undefined,
                view,
              })
            }}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
    </ModalShell>
  )
}

import { useEffect, useState } from 'react'
import type { ExportFormat, ExportScope, SvgExportPreset } from '../domain/exportLayout'

interface ExportOptionsModalProps {
  defaultScope: ExportScope
  defaultSvgPreset: SvgExportPreset
  format?: ExportFormat
  isOpen: boolean
  onCancel: () => void
  onConfirm: (options: {
    format: ExportFormat
    scope: ExportScope
    svgPreset?: SvgExportPreset
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
  isOpen,
  onCancel,
  onConfirm,
}: ExportOptionsModalProps) {
  const [scope, setScope] = useState<ExportScope>(defaultScope)
  const [svgPreset, setSvgPreset] = useState<SvgExportPreset>(defaultSvgPreset)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setScope(defaultScope)
    setSvgPreset(defaultSvgPreset)
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

  return (
    <div className="modal-shell" role="dialog" aria-modal="true" aria-label="Export options">
      <div className="modal-shell__backdrop" onClick={onCancel} />

      <div className="modal-shell__card modal-shell__card--export">
        <div className="modal-shell__header">
          <h2>{formatExportFormat(format)} Export Options</h2>
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
              })
            }}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

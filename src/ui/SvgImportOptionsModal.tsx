import {
  useMemo,
  useRef,
  useState,
  type FocusEvent,
} from 'react'
import {
  DEFAULT_IMPORT_HOLE_PITCH_MM,
  applyAutoCalibrationToWorkspaceConfig,
  type ImportAutoCalibrationResult,
} from '../domain/importAutoCalibration'
import type {
  ImportPreviewDocument,
  SvgImportMode,
  SvgImportProfile,
  SvgImportWorkspaceConfig,
  SvgImportWorkspaceDetection,
  SvgImportWorkspaceSurfaceConfig,
} from '../domain/svgImport'
import { SvgImportPreview } from './SvgImportPreview'

interface ConfirmPayload {
  mode: SvgImportMode
  profile: SvgImportProfile
  requireCalibration: boolean
  workspaceConfig: SvgImportWorkspaceConfig
}

interface SvgImportOptionsModalProps {
  autoCalibrationSuggestion?: ImportAutoCalibrationResult
  detection: SvgImportWorkspaceDetection
  document: ImportPreviewDocument
  fileName: string
  initialWorkspaceConfig: SvgImportWorkspaceConfig
  isOpen: boolean
  onCancel: () => void
  onConfirm: (payload: ConfirmPayload) => void
  scaleIsReliable: boolean
  scaleReason?: string
}

interface WorkspaceInputState {
  breadboardCount: string
  breadboardHeights: string[]
  breadboardWidths: string[]
  breadboardX: string[]
  breadboardY: string[]
  breadboardBoundsHeights: string[]
  breadboardBoundsWidths: string[]
  tableHeight: string
  tableWidth: string
  tableX: string
  tableY: string
  tableBoundsHeight: string
  tableBoundsWidth: string
}

function cloneWorkspaceConfig(config: SvgImportWorkspaceConfig): SvgImportWorkspaceConfig {
  return JSON.parse(JSON.stringify(config)) as SvgImportWorkspaceConfig
}

function cloneSurface(surface: SvgImportWorkspaceSurfaceConfig): SvgImportWorkspaceSurfaceConfig {
  return JSON.parse(JSON.stringify(surface)) as SvgImportWorkspaceSurfaceConfig
}

function formatNumericInput(value: number) {
  return Number.isFinite(value) ? `${value}` : ''
}

function parsePositiveNumberInput(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function parseFiniteNumberInput(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parsePositiveIntegerInput(value: string) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function selectAllText(event: FocusEvent<HTMLInputElement>) {
  event.currentTarget.select()
}

function createWorkspaceInputState(config: SvgImportWorkspaceConfig): WorkspaceInputState {
  return {
    breadboardCount: `${config.breadboards.length}`,
    breadboardBoundsHeights: config.breadboards.map((surface) =>
      formatNumericInput(surface.boundsUnits.height),
    ),
    breadboardBoundsWidths: config.breadboards.map((surface) =>
      formatNumericInput(surface.boundsUnits.width),
    ),
    breadboardHeights: config.breadboards.map((surface) =>
      formatNumericInput(surface.physicalHeightMm),
    ),
    breadboardWidths: config.breadboards.map((surface) =>
      formatNumericInput(surface.physicalWidthMm),
    ),
    breadboardX: config.breadboards.map((surface) =>
      formatNumericInput(surface.boundsUnits.x),
    ),
    breadboardY: config.breadboards.map((surface) =>
      formatNumericInput(surface.boundsUnits.y),
    ),
    tableBoundsHeight: formatNumericInput(config.table?.boundsUnits.height ?? 0),
    tableBoundsWidth: formatNumericInput(config.table?.boundsUnits.width ?? 0),
    tableHeight: formatNumericInput(config.table?.physicalHeightMm ?? 0),
    tableWidth: formatNumericInput(config.table?.physicalWidthMm ?? 0),
    tableX: formatNumericInput(config.table?.boundsUnits.x ?? 0),
    tableY: formatNumericInput(config.table?.boundsUnits.y ?? 0),
  }
}

function createSyntheticBreadboard(args: {
  document: ImportPreviewDocument
  index: number
  tableBounds?: SvgImportWorkspaceSurfaceConfig['boundsUnits']
}): SvgImportWorkspaceSurfaceConfig {
  const baseBounds = args.tableBounds ?? args.document.bounds
  const offset = args.index * 18

  return {
    boundsUnits: {
      x: baseBounds.x + baseBounds.width * 0.2 + offset,
      y: baseBounds.y + baseBounds.height * 0.22 + offset,
      width: Math.max(24, baseBounds.width * 0.28),
      height: Math.max(24, baseBounds.height * 0.32),
    },
    id: `breadboard-${args.index + 1}`,
    kind: 'breadboard',
    label: `Breadboard ${args.index + 1}`,
    physicalHeightMm: 350,
    physicalWidthMm: 350,
  }
}

function formatScaleHint(args: {
  scaleIsReliable: boolean
  scaleReason?: string
  sourceKind: ImportPreviewDocument['sourceKind']
}) {
  if (args.sourceKind === 'raster') {
    return (
      args.scaleReason ??
      'Raster drawings do not carry reliable physical units. Use the suggested auto-calibration or enter exact sizes manually.'
    )
  }

  if (args.scaleIsReliable) {
    return 'Physical SVG units look reliable. Calibration is optional once you confirm the exact surface sizes.'
  }

  return args.scaleReason ?? 'SVG units are ambiguous. Exact surface sizing is required, and calibration is recommended.'
}

export function SvgImportOptionsModal(props: SvgImportOptionsModalProps) {
  const {
    autoCalibrationSuggestion,
    detection,
    document,
    fileName,
    initialWorkspaceConfig,
    isOpen,
    onCancel,
    onConfirm,
    scaleIsReliable,
    scaleReason,
  } = props
  const [mode, setMode] = useState<SvgImportMode>(() =>
    initialWorkspaceConfig.workspaceKind === 'optical-table' &&
    initialWorkspaceConfig.breadboards.length > 1
      ? 'replace'
      : 'merge',
  )
  const [profile, setProfile] = useState<SvgImportProfile>('guided')
  const [requireCalibration, setRequireCalibration] = useState(!scaleIsReliable)
  const [workspaceConfig, setWorkspaceConfig] = useState<SvgImportWorkspaceConfig>(() =>
    cloneWorkspaceConfig(initialWorkspaceConfig),
  )
  const [inputState, setInputState] = useState<WorkspaceInputState>(() =>
    createWorkspaceInputState(initialWorkspaceConfig),
  )
  const sceneActionRef = useRef<HTMLFieldSetElement | null>(null)
  const workspaceRef = useRef<HTMLFieldSetElement | null>(null)
  const sizesRef = useRef<HTMLFieldSetElement | null>(null)
  const autoCalibrationRef = useRef<HTMLFieldSetElement | null>(null)
  const regionsRef = useRef<HTMLFieldSetElement | null>(null)
  const regionsDetailsRef = useRef<HTMLDetailsElement | null>(null)
  const calibrationRef = useRef<HTMLFieldSetElement | null>(null)
  const [activeStep, setActiveStep] = useState<
    'scene' | 'workspace' | 'sizes' | 'auto' | 'regions' | 'calibration'
  >('sizes')

  const isMultiBreadboardTable =
    workspaceConfig.workspaceKind === 'optical-table' && workspaceConfig.breadboards.length > 1
  const isReplaceOnly = isMultiBreadboardTable || document.sourceKind === 'raster'
  const supportsInterpretationProfiles = document.sourceKind === 'svg'

  const surfaceOverlays = useMemo(
    () => [
      ...(workspaceConfig.table
        ? [
            {
              bounds: workspaceConfig.table.boundsUnits,
              id: workspaceConfig.table.id,
              kind: 'table' as const,
              label: workspaceConfig.table.label,
            },
          ]
        : []),
      ...workspaceConfig.breadboards.map((surface) => ({
        bounds: surface.boundsUnits,
        id: surface.id,
        kind: 'breadboard' as const,
        label: surface.label,
      })),
    ],
    [workspaceConfig],
  )

  const requiredItems = useMemo(() => {
    const items: string[] = []

    if (workspaceConfig.workspaceKind === 'optical-table') {
      if (!parsePositiveNumberInput(inputState.tableWidth)) {
        items.push('Table width')
      }
      if (!parsePositiveNumberInput(inputState.tableHeight)) {
        items.push('Table height')
      }
      if (!parsePositiveIntegerInput(inputState.breadboardCount)) {
        items.push('Breadboard count')
      }
      workspaceConfig.breadboards.forEach((_, index) => {
        if (!parsePositiveNumberInput(inputState.breadboardWidths[index] ?? '')) {
          items.push(`Breadboard ${index + 1} width`)
        }
        if (!parsePositiveNumberInput(inputState.breadboardHeights[index] ?? '')) {
          items.push(`Breadboard ${index + 1} height`)
        }
      })
    } else {
      if (!parsePositiveNumberInput(inputState.breadboardWidths[0] ?? '')) {
        items.push('Breadboard width')
      }
      if (!parsePositiveNumberInput(inputState.breadboardHeights[0] ?? '')) {
        items.push('Breadboard height')
      }
    }

    return items
  }, [inputState, workspaceConfig])

  const regionInputsAreValid = useMemo(() => {
    if (workspaceConfig.table) {
      if (
        parsePositiveNumberInput(inputState.tableBoundsWidth) === undefined ||
        parsePositiveNumberInput(inputState.tableBoundsHeight) === undefined ||
        parseFiniteNumberInput(inputState.tableX) === undefined ||
        parseFiniteNumberInput(inputState.tableY) === undefined
      ) {
        return false
      }
    }

    return workspaceConfig.breadboards.every((_, index) => {
      return (
        parsePositiveNumberInput(inputState.breadboardBoundsWidths[index] ?? '') !==
          undefined &&
        parsePositiveNumberInput(inputState.breadboardBoundsHeights[index] ?? '') !==
          undefined &&
        parseFiniteNumberInput(inputState.breadboardX[index] ?? '') !== undefined &&
        parseFiniteNumberInput(inputState.breadboardY[index] ?? '') !== undefined
      )
    })
  }, [inputState, workspaceConfig.breadboards, workspaceConfig.table])

  const configIsValid = requiredItems.length === 0 && regionInputsAreValid

  if (!isOpen) {
    return null
  }

  const commitWorkspaceConfig = (
    nextConfig: SvgImportWorkspaceConfig,
    syncInputs = false,
  ) => {
    setWorkspaceConfig(nextConfig)
    if (syncInputs) {
      setInputState(createWorkspaceInputState(nextConfig))
    }
  }

  const updateSurface = (
    kind: 'breadboard' | 'table',
    index: number,
    update: Partial<SvgImportWorkspaceSurfaceConfig>,
  ) => {
    const nextConfig = cloneWorkspaceConfig(workspaceConfig)

    if (kind === 'table' && nextConfig.table) {
      nextConfig.table = { ...nextConfig.table, ...update }
      commitWorkspaceConfig(nextConfig)
      return
    }

    nextConfig.breadboards[index] = {
      ...nextConfig.breadboards[index],
      ...update,
    }
    commitWorkspaceConfig(nextConfig)
  }

  const updateBreadboardInputField = (
    field:
      | 'breadboardHeights'
      | 'breadboardWidths'
      | 'breadboardX'
      | 'breadboardY'
      | 'breadboardBoundsHeights'
      | 'breadboardBoundsWidths',
    index: number,
    value: string,
  ) => {
    setInputState((previous) => {
      const nextValues = [...previous[field]]
      nextValues[index] = value
      return {
        ...previous,
        [field]: nextValues,
      }
    })
  }

  const updateSurfaceBoundsField = (
    kind: 'breadboard' | 'table',
    index: number,
    field: 'height' | 'width' | 'x' | 'y',
    value: string,
  ) => {
    if (kind === 'table') {
      setInputState((previous) => ({
        ...previous,
        tableBoundsHeight:
          field === 'height' ? value : previous.tableBoundsHeight,
        tableBoundsWidth:
          field === 'width' ? value : previous.tableBoundsWidth,
        tableX: field === 'x' ? value : previous.tableX,
        tableY: field === 'y' ? value : previous.tableY,
      }))
    } else {
      updateBreadboardInputField(
        field === 'height'
          ? 'breadboardBoundsHeights'
          : field === 'width'
            ? 'breadboardBoundsWidths'
            : field === 'x'
              ? 'breadboardX'
              : 'breadboardY',
        index,
        value,
      )
    }

    const parsed = field === 'x' || field === 'y'
      ? parseFiniteNumberInput(value)
      : parsePositiveNumberInput(value)

    if (parsed === undefined) {
      return
    }

    updateSurface(kind, index, {
      boundsUnits: {
        ...(kind === 'table'
          ? workspaceConfig.table?.boundsUnits ?? document.bounds
          : workspaceConfig.breadboards[index]?.boundsUnits ?? document.bounds),
        [field]: parsed,
      },
    })
  }

  const setWorkspaceKind = (nextKind: SvgImportWorkspaceConfig['workspaceKind']) => {
    if (nextKind === workspaceConfig.workspaceKind) {
      return
    }

    if (nextKind === 'single-breadboard') {
      const nextConfig: SvgImportWorkspaceConfig = {
        workspaceKind: 'single-breadboard',
        breadboards: [
          cloneSurface(
            workspaceConfig.breadboards[0] ??
              createSyntheticBreadboard({ document, index: 0 }),
          ),
        ],
      }
      commitWorkspaceConfig(nextConfig, true)
      return
    }

    const nextConfig: SvgImportWorkspaceConfig = {
      workspaceKind: 'optical-table',
      table:
        workspaceConfig.table ??
        {
          boundsUnits: document.bounds,
          id: 'table-primary',
          kind: 'table',
          label: 'Optical Table',
          physicalHeightMm: 1500,
          physicalWidthMm: 3600,
        },
      breadboards:
        workspaceConfig.breadboards.length > 0
          ? workspaceConfig.breadboards.map((surface, index) => ({
              ...surface,
              id: `breadboard-${index + 1}`,
              label: `Breadboard ${index + 1}`,
            }))
          : [createSyntheticBreadboard({ document, index: 0 })],
    }
    commitWorkspaceConfig(nextConfig, true)
  }

  const setBreadboardCount = (rawValue: string) => {
    setInputState((previous) => ({
      ...previous,
      breadboardCount: rawValue,
    }))

    const parsedCount = parsePositiveIntegerInput(rawValue)
    if (!parsedCount || workspaceConfig.workspaceKind !== 'optical-table') {
      return
    }

    const nextCount = Math.max(1, Math.min(8, parsedCount))
    const existingBoards = [...workspaceConfig.breadboards]

    while (existingBoards.length < nextCount) {
      existingBoards.push(
        createSyntheticBreadboard({
          document,
          index: existingBoards.length,
          tableBounds: workspaceConfig.table?.boundsUnits,
        }),
      )
    }

    const nextConfig: SvgImportWorkspaceConfig = {
      ...workspaceConfig,
      breadboards: existingBoards.slice(0, nextCount).map((surface, index) => ({
        ...surface,
        id: `breadboard-${index + 1}`,
        label: `Breadboard ${index + 1}`,
      })),
    }
    commitWorkspaceConfig(nextConfig, true)
  }

  const scrollToStep = (
    step: 'scene' | 'workspace' | 'sizes' | 'auto' | 'regions' | 'calibration',
  ) => {
    setActiveStep(step)
    const target =
      step === 'scene'
        ? sceneActionRef.current
        : step === 'workspace'
          ? workspaceRef.current
          : step === 'sizes'
            ? sizesRef.current
            : step === 'auto'
              ? autoCalibrationRef.current
              : step === 'regions'
                ? regionsRef.current
                : calibrationRef.current

    if (step === 'regions' && regionsDetailsRef.current) {
      regionsDetailsRef.current.open = true
    }

    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const applySuggestedAutoCalibration = () => {
    if (!autoCalibrationSuggestion) {
      return
    }

    commitWorkspaceConfig(
      applyAutoCalibrationToWorkspaceConfig({
        result: autoCalibrationSuggestion,
        workspaceConfig,
      }),
      true,
    )
    setRequireCalibration(false)
  }

  const sourceTitle =
    document.sourceKind === 'svg' ? 'Import Drawing' : 'Import Raster Drawing'
  const previewLabel =
    document.sourceKind === 'svg' ? 'Drawing preview' : 'Raster preview'

  return (
    <div className="modal-shell" role="dialog" aria-modal="true" aria-label="Drawing import options">
      <button className="modal-shell__backdrop" onClick={onCancel} type="button" />
      <div
        className="modal-shell__card modal-shell__card--export svg-import-options"
        data-testid="drawing-import-modal"
      >
        <header className="modal-shell__header">
          <h2>{sourceTitle}</h2>
          <p>{fileName}</p>
        </header>

        <div className="svg-import-options__layout">
          <aside className="svg-import-step-rail">
            <div className="svg-import-step-rail__eyebrow">Setup flow</div>
            <h3>{sourceTitle}</h3>
            <p className="svg-import-step-rail__summary-text">
              Confirm the scene, surface kind, exact sizes, then use the suggested calibration if it matches the drawing.
            </p>
            <nav className="svg-import-step-rail__steps" aria-label="Import steps">
              {[
                ['scene', 'Scene'],
                ['workspace', 'Workspace'],
                ['sizes', 'Exact Sizes'],
                ['auto', 'Auto-Calibrate'],
                ['regions', 'Surface Regions'],
                ['calibration', 'Calibration'],
              ].map(([step, label]) => (
                <button
                  aria-current={activeStep === step ? 'step' : undefined}
                  className={`svg-import-step-rail__step${activeStep === step ? ' is-active' : ''}`}
                  key={step}
                  onClick={() => scrollToStep(step as typeof activeStep)}
                  type="button"
                >
                  <span>{label}</span>
                  <span className="svg-import-step-rail__step-dot" />
                </button>
              ))}
            </nav>
            <section className="svg-import-summary-card" aria-label="Required inputs">
              <div className="svg-import-summary-card__eyebrow">Required inputs</div>
              <div className={`svg-import-summary-card__state${configIsValid ? ' is-ready' : ''}`}>
                {configIsValid ? 'Ready to continue' : `${requiredItems.length} field${requiredItems.length === 1 ? '' : 's'} left`}
              </div>
              {requiredItems.length > 0 ? (
                <ul className="svg-import-summary-card__list">
                  {requiredItems.slice(0, 4).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="svg-import-summary-card__note">Exact sizes and regions are already valid.</p>
              )}
            </section>
          </aside>

          <form
            className="modal-shell__form svg-ambiguity-modal__controls svg-import-options__controls"
            onSubmit={(event) => event.preventDefault()}
          >
            <fieldset className="modal-shell__fieldset" ref={sceneActionRef}>
              <legend>Scene</legend>
              <label className="modal-shell__choice">
                <input
                  checked={mode === 'merge'}
                  disabled={isReplaceOnly}
                  name="svg-import-mode"
                  onChange={() => setMode('merge')}
                  type="radio"
                />
                <span>Merge into current scene</span>
              </label>
              <label className="modal-shell__choice">
                <input
                  checked={mode === 'replace'}
                  name="svg-import-mode"
                  onChange={() => setMode('replace')}
                  type="radio"
                />
                <span>Replace current scene</span>
              </label>
              <label className="modal-shell__choice">
                <input
                  checked={profile === 'guided'}
                  disabled={!supportsInterpretationProfiles}
                  name="svg-import-profile"
                  onChange={() => setProfile('guided')}
                  type="radio"
                />
                <span>Guided mode (heuristics + review)</span>
              </label>
              <label className="modal-shell__choice">
                <input
                  checked={profile === 'strict'}
                  disabled={!supportsInterpretationProfiles}
                  name="svg-import-profile"
                  onChange={() => setProfile('strict')}
                  type="radio"
                />
                <span>Strict mode (deterministic only)</span>
              </label>
              <p className="modal-shell__hint svg-import-inline-hint">
                {document.sourceKind === 'raster'
                  ? 'Raster import is workspace-setup only in this pass, so it stays replace-only and skips component interpretation.'
                  : isMultiBreadboardTable
                    ? 'Multi-breadboard table imports stay replace-only.'
                    : 'Choose scene behavior and interpreter strictness first.'}
              </p>
            </fieldset>

            <fieldset className="modal-shell__fieldset" ref={workspaceRef}>
              <legend>Workspace</legend>
              <label className="modal-shell__choice">
                <input
                  checked={workspaceConfig.workspaceKind === 'single-breadboard'}
                  name="svg-workspace-kind"
                  onChange={() => setWorkspaceKind('single-breadboard')}
                  type="radio"
                />
                <span>Single breadboard</span>
              </label>
              <label className="modal-shell__choice">
                <input
                  checked={workspaceConfig.workspaceKind === 'optical-table'}
                  name="svg-workspace-kind"
                  onChange={() => setWorkspaceKind('optical-table')}
                  type="radio"
                />
                <span>Optical table with breadboards</span>
              </label>
              <p className="modal-shell__hint svg-import-inline-hint">
                {detection.warnings[0] ??
                  (workspaceConfig.workspaceKind === 'single-breadboard'
                    ? 'Single-board sizing enters below.'
                    : 'Table and breadboard sizing enter below.')}
              </p>
            </fieldset>

            <fieldset className="modal-shell__fieldset" ref={sizesRef}>
              <legend>Exact Surface Sizes</legend>
              {workspaceConfig.workspaceKind === 'optical-table' && workspaceConfig.table ? (
                <>
                  <label className="svg-import-field">
                    Table width (mm)
                    <input
                      inputMode="decimal"
                      onBlur={() =>
                        setInputState((previous) => ({
                          ...previous,
                          tableWidth:
                            parsePositiveNumberInput(previous.tableWidth) !== undefined
                              ? formatNumericInput(parsePositiveNumberInput(previous.tableWidth)!)
                              : previous.tableWidth,
                        }))
                      }
                      onChange={(event) => {
                        const nextValue = event.target.value
                        setInputState((previous) => ({
                          ...previous,
                          tableWidth: nextValue,
                        }))
                        const parsed = parsePositiveNumberInput(nextValue)
                        if (parsed !== undefined) {
                          updateSurface('table', 0, {
                            physicalWidthMm: parsed,
                          })
                        }
                      }}
                      onFocus={selectAllText}
                      type="text"
                      value={inputState.tableWidth}
                    />
                  </label>
                  <label className="svg-import-field">
                    Table height (mm)
                    <input
                      inputMode="decimal"
                      onBlur={() =>
                        setInputState((previous) => ({
                          ...previous,
                          tableHeight:
                            parsePositiveNumberInput(previous.tableHeight) !== undefined
                              ? formatNumericInput(parsePositiveNumberInput(previous.tableHeight)!)
                              : previous.tableHeight,
                        }))
                      }
                      onChange={(event) => {
                        const nextValue = event.target.value
                        setInputState((previous) => ({
                          ...previous,
                          tableHeight: nextValue,
                        }))
                        const parsed = parsePositiveNumberInput(nextValue)
                        if (parsed !== undefined) {
                          updateSurface('table', 0, {
                            physicalHeightMm: parsed,
                          })
                        }
                      }}
                      onFocus={selectAllText}
                      type="text"
                      value={inputState.tableHeight}
                    />
                  </label>
                  <label className="svg-import-field">
                    Breadboard count
                    <input
                      inputMode="numeric"
                      onBlur={() =>
                        setInputState((previous) => ({
                          ...previous,
                          breadboardCount:
                            parsePositiveIntegerInput(previous.breadboardCount) !== undefined
                              ? `${parsePositiveIntegerInput(previous.breadboardCount)}`
                              : previous.breadboardCount,
                        }))
                      }
                      onChange={(event) => setBreadboardCount(event.target.value)}
                      onFocus={selectAllText}
                      type="text"
                      value={inputState.breadboardCount}
                    />
                  </label>
                </>
              ) : null}

              {workspaceConfig.workspaceKind === 'single-breadboard' ? (
                <>
                  <label className="svg-import-field">
                    Breadboard width (mm)
                    <input
                      inputMode="decimal"
                      onBlur={() =>
                        updateBreadboardInputField(
                          'breadboardWidths',
                          0,
                          parsePositiveNumberInput(inputState.breadboardWidths[0] ?? '') !==
                            undefined
                            ? formatNumericInput(
                                parsePositiveNumberInput(
                                  inputState.breadboardWidths[0] ?? '',
                                )!,
                              )
                            : inputState.breadboardWidths[0] ?? '',
                        )
                      }
                      onChange={(event) => {
                        const nextValue = event.target.value
                        updateBreadboardInputField('breadboardWidths', 0, nextValue)
                        const parsed = parsePositiveNumberInput(nextValue)
                        if (parsed !== undefined) {
                          updateSurface('breadboard', 0, {
                            physicalWidthMm: parsed,
                          })
                        }
                      }}
                      onFocus={selectAllText}
                      type="text"
                      value={inputState.breadboardWidths[0] ?? ''}
                    />
                  </label>
                  <label className="svg-import-field">
                    Breadboard height (mm)
                    <input
                      inputMode="decimal"
                      onBlur={() =>
                        updateBreadboardInputField(
                          'breadboardHeights',
                          0,
                          parsePositiveNumberInput(inputState.breadboardHeights[0] ?? '') !==
                            undefined
                            ? formatNumericInput(
                                parsePositiveNumberInput(
                                  inputState.breadboardHeights[0] ?? '',
                                )!,
                              )
                            : inputState.breadboardHeights[0] ?? '',
                        )
                      }
                      onChange={(event) => {
                        const nextValue = event.target.value
                        updateBreadboardInputField('breadboardHeights', 0, nextValue)
                        const parsed = parsePositiveNumberInput(nextValue)
                        if (parsed !== undefined) {
                          updateSurface('breadboard', 0, {
                            physicalHeightMm: parsed,
                          })
                        }
                      }}
                      onFocus={selectAllText}
                      type="text"
                      value={inputState.breadboardHeights[0] ?? ''}
                    />
                  </label>
                </>
              ) : null}
            </fieldset>

            <fieldset className="modal-shell__fieldset" ref={autoCalibrationRef}>
              <legend>Auto-Calibrate</legend>
              {autoCalibrationSuggestion ? (
                <div
                  className="svg-import-summary-card"
                  data-testid="drawing-import-auto-calibration-card"
                >
                  <div className="svg-import-summary-card__eyebrow">Suggested hole-grid fit</div>
                  <div
                    className={`svg-import-summary-card__state${
                      autoCalibrationSuggestion.confidence >= 0.74 ? ' is-ready' : ''
                    }`}
                  >
                    {autoCalibrationSuggestion.confidence >= 0.74
                      ? 'Ready to apply'
                      : 'Review before applying'}
                  </div>
                  <ul className="svg-import-summary-card__list">
                    <li>
                      Pitch assumption: {DEFAULT_IMPORT_HOLE_PITCH_MM} mm
                    </li>
                    <li>
                      Grid fit: {autoCalibrationSuggestion.gridColumnCount} ×{' '}
                      {autoCalibrationSuggestion.gridRowCount} holes
                    </li>
                    <li>
                      Inferred scale:{' '}
                      {autoCalibrationSuggestion.inferredMmPerUnit.toFixed(5)} mm per{' '}
                      {document.sourceKind === 'svg' ? 'SVG unit' : 'pixel'}
                    </li>
                    <li>
                      Estimated size:{' '}
                      {autoCalibrationSuggestion.suggestedPhysicalWidthMm} ×{' '}
                      {autoCalibrationSuggestion.suggestedPhysicalHeightMm} mm
                    </li>
                  </ul>
                  <p className="svg-import-summary-card__note">
                    {autoCalibrationSuggestion.note ??
                      (document.sourceKind === 'svg'
                        ? 'The preview found a repeated breadboard hole lattice inside the detected board region.'
                        : 'The preview found a repeated breadboard hole lattice in the raster image.' )}
                  </p>
                  <button
                    className="modal-shell__primary"
                    data-testid="drawing-import-apply-auto-calibration"
                    onClick={applySuggestedAutoCalibration}
                    type="button"
                  >
                    Apply Suggested Auto-Calibration
                  </button>
                </div>
              ) : (
                <p className="modal-shell__hint svg-import-inline-hint">
                  No confident hole grid was detected automatically. You can still enter the exact sizes manually and use point calibration below if needed.
                </p>
              )}
            </fieldset>

            <fieldset className="modal-shell__fieldset" ref={regionsRef}>
              <legend>Detected Surface Regions</legend>
              <details className="svg-import-advanced" ref={regionsDetailsRef}>
                <summary>Advanced region editing</summary>
                <p className="modal-shell__hint svg-import-inline-hint">
                  Fine-tune only if the detected outlines need manual adjustment.
                </p>
                {workspaceConfig.table ? (
                  <details open>
                    <summary>Optical Table Region</summary>
                    <label className="svg-import-field">
                      X ({document.sourceKind === 'svg' ? 'SVG units' : 'pixels'})
                      <input
                        inputMode="decimal"
                        onBlur={() =>
                          setInputState((previous) => ({
                            ...previous,
                            tableX:
                              parseFiniteNumberInput(previous.tableX) !== undefined
                                ? formatNumericInput(parseFiniteNumberInput(previous.tableX)!)
                                : previous.tableX,
                          }))
                        }
                        onChange={(event) =>
                          updateSurfaceBoundsField('table', 0, 'x', event.target.value)
                        }
                        onFocus={selectAllText}
                        type="text"
                        value={inputState.tableX}
                      />
                    </label>
                    <label className="svg-import-field">
                      Y ({document.sourceKind === 'svg' ? 'SVG units' : 'pixels'})
                      <input
                        inputMode="decimal"
                        onBlur={() =>
                          setInputState((previous) => ({
                            ...previous,
                            tableY:
                              parseFiniteNumberInput(previous.tableY) !== undefined
                                ? formatNumericInput(parseFiniteNumberInput(previous.tableY)!)
                                : previous.tableY,
                          }))
                        }
                        onChange={(event) =>
                          updateSurfaceBoundsField('table', 0, 'y', event.target.value)
                        }
                        onFocus={selectAllText}
                        type="text"
                        value={inputState.tableY}
                      />
                    </label>
                    <label className="svg-import-field">
                      Width ({document.sourceKind === 'svg' ? 'SVG units' : 'pixels'})
                      <input
                        inputMode="decimal"
                        onBlur={() =>
                          setInputState((previous) => ({
                            ...previous,
                            tableBoundsWidth:
                              parsePositiveNumberInput(previous.tableBoundsWidth) !== undefined
                                ? formatNumericInput(
                                    parsePositiveNumberInput(previous.tableBoundsWidth)!,
                                  )
                                : previous.tableBoundsWidth,
                          }))
                        }
                        onChange={(event) =>
                          updateSurfaceBoundsField('table', 0, 'width', event.target.value)
                        }
                        onFocus={selectAllText}
                        type="text"
                        value={inputState.tableBoundsWidth}
                      />
                    </label>
                    <label className="svg-import-field">
                      Height ({document.sourceKind === 'svg' ? 'SVG units' : 'pixels'})
                      <input
                        inputMode="decimal"
                        onBlur={() =>
                          setInputState((previous) => ({
                            ...previous,
                            tableBoundsHeight:
                              parsePositiveNumberInput(previous.tableBoundsHeight) !== undefined
                                ? formatNumericInput(
                                    parsePositiveNumberInput(previous.tableBoundsHeight)!,
                                  )
                                : previous.tableBoundsHeight,
                          }))
                        }
                        onChange={(event) =>
                          updateSurfaceBoundsField('table', 0, 'height', event.target.value)
                        }
                        onFocus={selectAllText}
                        type="text"
                        value={inputState.tableBoundsHeight}
                      />
                    </label>
                  </details>
                ) : null}

                {workspaceConfig.breadboards.map((surface, index) => (
                  <details key={surface.id} open>
                    <summary>{surface.label}</summary>
                    <label className="svg-import-field">
                      X ({document.sourceKind === 'svg' ? 'SVG units' : 'pixels'})
                      <input
                        inputMode="decimal"
                        onBlur={() =>
                          updateBreadboardInputField(
                            'breadboardX',
                            index,
                            parseFiniteNumberInput(inputState.breadboardX[index] ?? '') !==
                              undefined
                              ? formatNumericInput(
                                  parseFiniteNumberInput(
                                    inputState.breadboardX[index] ?? '',
                                  )!,
                                )
                              : inputState.breadboardX[index] ?? '',
                          )
                        }
                        onChange={(event) =>
                          updateSurfaceBoundsField(
                            'breadboard',
                            index,
                            'x',
                            event.target.value,
                          )
                        }
                        onFocus={selectAllText}
                        type="text"
                        value={inputState.breadboardX[index] ?? ''}
                      />
                    </label>
                    <label className="svg-import-field">
                      Y ({document.sourceKind === 'svg' ? 'SVG units' : 'pixels'})
                      <input
                        inputMode="decimal"
                        onBlur={() =>
                          updateBreadboardInputField(
                            'breadboardY',
                            index,
                            parseFiniteNumberInput(inputState.breadboardY[index] ?? '') !==
                              undefined
                              ? formatNumericInput(
                                  parseFiniteNumberInput(
                                    inputState.breadboardY[index] ?? '',
                                  )!,
                                )
                              : inputState.breadboardY[index] ?? '',
                          )
                        }
                        onChange={(event) =>
                          updateSurfaceBoundsField(
                            'breadboard',
                            index,
                            'y',
                            event.target.value,
                          )
                        }
                        onFocus={selectAllText}
                        type="text"
                        value={inputState.breadboardY[index] ?? ''}
                      />
                    </label>
                    <label className="svg-import-field">
                      Width ({document.sourceKind === 'svg' ? 'SVG units' : 'pixels'})
                      <input
                        inputMode="decimal"
                        onBlur={() =>
                          updateBreadboardInputField(
                            'breadboardBoundsWidths',
                            index,
                            parsePositiveNumberInput(
                              inputState.breadboardBoundsWidths[index] ?? '',
                            ) !== undefined
                              ? formatNumericInput(
                                  parsePositiveNumberInput(
                                    inputState.breadboardBoundsWidths[index] ?? '',
                                  )!,
                                )
                              : inputState.breadboardBoundsWidths[index] ?? '',
                          )
                        }
                        onChange={(event) =>
                          updateSurfaceBoundsField(
                            'breadboard',
                            index,
                            'width',
                            event.target.value,
                          )
                        }
                        onFocus={selectAllText}
                        type="text"
                        value={inputState.breadboardBoundsWidths[index] ?? ''}
                      />
                    </label>
                    <label className="svg-import-field">
                      Height ({document.sourceKind === 'svg' ? 'SVG units' : 'pixels'})
                      <input
                        inputMode="decimal"
                        onBlur={() =>
                          updateBreadboardInputField(
                            'breadboardBoundsHeights',
                            index,
                            parsePositiveNumberInput(
                              inputState.breadboardBoundsHeights[index] ?? '',
                            ) !== undefined
                              ? formatNumericInput(
                                  parsePositiveNumberInput(
                                    inputState.breadboardBoundsHeights[index] ?? '',
                                  )!,
                                )
                              : inputState.breadboardBoundsHeights[index] ?? '',
                          )
                        }
                        onChange={(event) =>
                          updateSurfaceBoundsField(
                            'breadboard',
                            index,
                            'height',
                            event.target.value,
                          )
                        }
                        onFocus={selectAllText}
                        type="text"
                        value={inputState.breadboardBoundsHeights[index] ?? ''}
                      />
                    </label>
                    {workspaceConfig.workspaceKind === 'optical-table' ? (
                      <>
                        <label className="svg-import-field">
                          Physical width (mm)
                          <input
                            inputMode="decimal"
                            onBlur={() =>
                              updateBreadboardInputField(
                                'breadboardWidths',
                                index,
                                parsePositiveNumberInput(
                                  inputState.breadboardWidths[index] ?? '',
                                ) !== undefined
                                  ? formatNumericInput(
                                      parsePositiveNumberInput(
                                        inputState.breadboardWidths[index] ?? '',
                                      )!,
                                    )
                                  : inputState.breadboardWidths[index] ?? '',
                              )
                            }
                            onChange={(event) => {
                              const nextValue = event.target.value
                              updateBreadboardInputField(
                                'breadboardWidths',
                                index,
                                nextValue,
                              )
                              const parsed = parsePositiveNumberInput(nextValue)
                              if (parsed !== undefined) {
                                updateSurface('breadboard', index, {
                                  physicalWidthMm: parsed,
                                })
                              }
                            }}
                            onFocus={selectAllText}
                            type="text"
                            value={inputState.breadboardWidths[index] ?? ''}
                          />
                        </label>
                        <label className="svg-import-field">
                          Physical height (mm)
                          <input
                            inputMode="decimal"
                            onBlur={() =>
                              updateBreadboardInputField(
                                'breadboardHeights',
                                index,
                                parsePositiveNumberInput(
                                  inputState.breadboardHeights[index] ?? '',
                                ) !== undefined
                                  ? formatNumericInput(
                                      parsePositiveNumberInput(
                                        inputState.breadboardHeights[index] ?? '',
                                      )!,
                                    )
                                  : inputState.breadboardHeights[index] ?? '',
                              )
                            }
                            onChange={(event) => {
                              const nextValue = event.target.value
                              updateBreadboardInputField(
                                'breadboardHeights',
                                index,
                                nextValue,
                              )
                              const parsed = parsePositiveNumberInput(nextValue)
                              if (parsed !== undefined) {
                                updateSurface('breadboard', index, {
                                  physicalHeightMm: parsed,
                                })
                              }
                            }}
                            onFocus={selectAllText}
                            type="text"
                            value={inputState.breadboardHeights[index] ?? ''}
                          />
                        </label>
                      </>
                    ) : null}
                  </details>
                ))}
              </details>
            </fieldset>

            <fieldset className="modal-shell__fieldset" ref={calibrationRef}>
              <legend>Scale Calibration</legend>
              <p className="modal-shell__hint">
                {formatScaleHint({
                  scaleIsReliable,
                  scaleReason,
                  sourceKind: document.sourceKind,
                })}
              </p>
              <label className="modal-shell__choice">
                <input
                  checked={requireCalibration}
                  onChange={(event) => setRequireCalibration(event.target.checked)}
                  type="checkbox"
                />
                <span>Run calibration before import</span>
              </label>
            </fieldset>
          </form>

          <aside className="svg-import-preview-pane" aria-label={previewLabel}>
            <div className="svg-import-preview-pane__eyebrow">Preview</div>
            <SvgImportPreview
              className="svg-import-preview"
              document={document}
              surfaceOverlays={surfaceOverlays}
            />
          </aside>
        </div>

        <footer className="modal-shell__actions">
          <button onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className="modal-shell__primary"
            disabled={!configIsValid}
            onClick={() =>
              onConfirm({
                mode: isReplaceOnly ? 'replace' : mode,
                profile,
                requireCalibration,
                workspaceConfig,
              })
            }
            type="button"
          >
            Continue
          </button>
        </footer>
      </div>
    </div>
  )
}

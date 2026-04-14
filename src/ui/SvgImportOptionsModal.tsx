import {
  useEffect,
  useMemo,
  useState,
  type FocusEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import {
  applyAutoCalibrationToWorkspaceConfig,
  DEFAULT_IMPORT_HOLE_PITCH_MM,
  type ImportAutoCalibrationResult,
} from '../domain/importAutoCalibration'
import { getComponentDefinition } from '../domain/componentCatalog'
import type { BoundsMm, Vector2Mm } from '../domain/types'
import type {
  ImportPreviewDocument,
  ImportPreviewItem,
  SvgImportAnalysis,
  SvgImportMode,
  SvgImportWorkspaceConfig,
  SvgImportWorkspaceSurfaceConfig,
} from '../domain/svgImport'
import { resolveSvgImportScaleMmPerUnit } from '../domain/svgImport'
import { useEditorStore } from '../state/editorStore'
import { SvgImportBoardPreview } from './SvgImportBoardPreview'
import { SvgImportPreview } from './SvgImportPreview'
import { SvgImportVariantChooser } from './SvgImportVariantChooser'

interface ConfirmPayload {
  appendBreadboardCenterMm?: Vector2Mm
  actionIntent: 'board-only' | 'quick-import' | 'modified-import'
  mode: SvgImportMode
  previewItems: ImportPreviewItem[]
  workspaceConfig: SvgImportWorkspaceConfig
}

interface CalibrationPayload {
  appendBreadboardCenterMm?: Vector2Mm
  mode: SvgImportMode
  previewItems: ImportPreviewItem[]
  workspaceConfig: SvgImportWorkspaceConfig
}

interface TablePlacementPreviewData {
  breadboards: Array<{
    bounds: BoundsMm
    id: string
    label: string
  }>
  tableBounds: BoundsMm
}

interface SvgImportOptionsModalProps {
  analysis?: SvgImportAnalysis
  autoCalibrationSuggestion?: ImportAutoCalibrationResult
  canAppendBreadboardToTable: boolean
  currentTablePlacement?: TablePlacementPreviewData
  document: ImportPreviewDocument
  fileName: string
  hostSurfaceId?: string
  initialAppendBreadboardCenterMm?: Vector2Mm
  initialMode?: SvgImportMode
  initialPreviewItems: ImportPreviewItem[]
  initialWorkspaceConfig: SvgImportWorkspaceConfig
  isOpen: boolean
  onCancel: () => void
  onConfirm: (payload: ConfirmPayload) => void
  onOpenCalibration: (payload: CalibrationPayload) => void
  scaleIsReliable: boolean
  scaleReason?: string
  showLabels?: boolean
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
      'Raster drawings do not carry reliable physical units. Auto-calibration has been applied where possible, and manual calibration remains available in Advanced.'
    )
  }

  if (args.scaleIsReliable) {
    return 'Physical SVG units look usable. The preview is already using the inferred board size.'
  }

  return (
    args.scaleReason ??
    'SVG units were ambiguous, so the preview is using the detected board size and auto-calibration suggestion.'
  )
}

function shiftBounds(bounds: BoundsMm, nextCenter: Vector2Mm) {
  return {
    ...bounds,
    x: nextCenter.x - bounds.width / 2,
    y: nextCenter.y - bounds.height / 2,
  }
}

function normalizeQuarterTurn(value: number) {
  const normalized = value % 4
  return (normalized < 0 ? normalized + 4 : normalized) as 0 | 1 | 2 | 3
}

function serializePreviewItemsForDirtyCheck(items: ImportPreviewItem[]) {
  return JSON.stringify(
    [...items]
      .map((item) => ({
        bounds: item.bounds,
        center: item.center,
        componentType: item.componentType ?? null,
        disposition: item.disposition,
        id: item.id,
        rotationQuarterTurns: item.rotationQuarterTurns,
        variantId: item.variantId ?? null,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  )
}

function serializeWorkspaceConfigForDirtyCheck(config: SvgImportWorkspaceConfig) {
  return JSON.stringify(config)
}

function createDefaultMode(args: {
  canAppendBreadboardToTable: boolean
  document: ImportPreviewDocument
  initialMode?: SvgImportMode
}) {
  if (args.initialMode) {
    return args.initialMode
  }

  if (args.document.sourceKind === 'raster') {
    return 'replace'
  }

  if (args.canAppendBreadboardToTable) {
    return 'replace'
  }

  return 'replace'
}

function clampAppendCenter(
  center: Vector2Mm,
  boardSize: { width: number; height: number },
  tableBounds: BoundsMm,
) {
  const halfWidth = boardSize.width / 2
  const halfHeight = boardSize.height / 2

  return {
    x: Math.min(
      tableBounds.x + tableBounds.width - halfWidth,
      Math.max(tableBounds.x + halfWidth, center.x),
    ),
    y: Math.min(
      tableBounds.y + tableBounds.height - halfHeight,
      Math.max(tableBounds.y + halfHeight, center.y),
    ),
  }
}

function createDefaultAppendCenter(args: {
  boardHeight: number
  boardWidth: number
  currentTablePlacement?: TablePlacementPreviewData
  fallback?: Vector2Mm
}) {
  if (!args.currentTablePlacement) {
    return args.fallback
  }

  const { tableBounds, breadboards } = args.currentTablePlacement
  const rightMostBreadboard = breadboards.reduce<BoundsMm | undefined>((current, candidate) => {
    if (!current) {
      return candidate.bounds
    }

    return candidate.bounds.x + candidate.bounds.width > current.x + current.width
      ? candidate.bounds
      : current
  }, undefined)

  const desiredCenter = rightMostBreadboard
    ? {
        x:
          rightMostBreadboard.x +
          rightMostBreadboard.width +
          args.boardWidth / 2 +
          35,
        y: rightMostBreadboard.y + rightMostBreadboard.height / 2,
      }
    : {
        x: tableBounds.x + tableBounds.width / 2,
        y: tableBounds.y + tableBounds.height / 2,
      }

  return clampAppendCenter(
    desiredCenter,
    { width: args.boardWidth, height: args.boardHeight },
    tableBounds,
  )
}

function TablePlacementPreview(props: {
  boardHeight: number
  boardWidth: number
  center: Vector2Mm
  data: TablePlacementPreviewData
  onChange: (center: Vector2Mm) => void
}) {
  const { boardHeight, boardWidth, center, data, onChange } = props
  const margin = 40
  const viewBox = {
    x: data.tableBounds.x - margin,
    y: data.tableBounds.y - margin,
    width: data.tableBounds.width + margin * 2,
    height: data.tableBounds.height + margin * 2,
  }
  const ghostBounds = shiftBounds(
    { x: 0, y: 0, width: boardWidth, height: boardHeight },
    center,
  )

  const setFromPointer = (event: ReactMouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return
    }

    const xRatio = (event.clientX - rect.left) / rect.width
    const yRatio = (event.clientY - rect.top) / rect.height
    const rawCenter = {
      x: viewBox.x + xRatio * viewBox.width,
      y: viewBox.y + yRatio * viewBox.height,
    }

    onChange(
      clampAppendCenter(rawCenter, { width: boardWidth, height: boardHeight }, data.tableBounds),
    )
  }

  return (
    <div className="svg-import-table-placement">
      <div className="svg-import-panel__eyebrow">Table placement</div>
      <svg
        className="svg-import-table-placement__preview"
        onClick={setFromPointer}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      >
        <rect
          fill="rgba(46, 65, 84, 0.22)"
          height={data.tableBounds.height}
          rx={18}
          stroke="rgba(125, 167, 201, 0.5)"
          strokeWidth={8}
          width={data.tableBounds.width}
          x={data.tableBounds.x}
          y={data.tableBounds.y}
        />

        {data.breadboards.map((breadboard) => (
          <g key={breadboard.id}>
            <rect
              fill="rgba(105, 128, 148, 0.16)"
              height={breadboard.bounds.height}
              stroke="rgba(172, 197, 217, 0.7)"
              strokeDasharray="10 6"
              strokeWidth={4}
              width={breadboard.bounds.width}
              x={breadboard.bounds.x}
              y={breadboard.bounds.y}
            />
            <text
              fill="#dce8f2"
              fontSize="18"
              x={breadboard.bounds.x + 14}
              y={breadboard.bounds.y + 28}
            >
              {breadboard.label}
            </text>
          </g>
        ))}

        <rect
          fill="rgba(110, 216, 147, 0.16)"
          height={ghostBounds.height}
          rx={14}
          stroke="#7ef0a8"
          strokeDasharray="8 5"
          strokeWidth={4}
          width={ghostBounds.width}
          x={ghostBounds.x}
          y={ghostBounds.y}
        />
      </svg>
      <p className="modal-shell__hint">
        Click inside the table preview to place the new breadboard.
      </p>
    </div>
  )
}

export function SvgImportOptionsModal(props: SvgImportOptionsModalProps) {
  const {
    analysis,
    autoCalibrationSuggestion,
    canAppendBreadboardToTable,
    currentTablePlacement,
    document,
    fileName,
    hostSurfaceId,
    initialAppendBreadboardCenterMm,
    initialMode,
    initialPreviewItems,
    initialWorkspaceConfig,
    isOpen,
    onCancel,
    onConfirm,
    onOpenCalibration,
    scaleIsReliable,
    scaleReason,
    showLabels = true,
  } = props
  const defaultMode = useMemo(
    () => createDefaultMode({ canAppendBreadboardToTable, document, initialMode }),
    [canAppendBreadboardToTable, document, initialMode],
  )
  const [mode, setMode] = useState<SvgImportMode>(defaultMode)
  const [workspaceConfig, setWorkspaceConfig] = useState<SvgImportWorkspaceConfig>(() =>
    cloneWorkspaceConfig(initialWorkspaceConfig),
  )
  const [inputState, setInputState] = useState<WorkspaceInputState>(() =>
    createWorkspaceInputState(initialWorkspaceConfig),
  )
  const [previewItems, setPreviewItems] = useState<ImportPreviewItem[]>(initialPreviewItems)
  const [selectedPreviewItemId, setSelectedPreviewItemId] = useState<string | undefined>(
    initialPreviewItems.find((item) => item.disposition !== 'skip')?.id ?? initialPreviewItems[0]?.id,
  )
  const baselineAppendBreadboardCenterMm = useMemo(
    () =>
      initialAppendBreadboardCenterMm ??
      createDefaultAppendCenter({
        boardHeight: initialWorkspaceConfig.breadboards[0]?.physicalHeightMm ?? 300,
        boardWidth: initialWorkspaceConfig.breadboards[0]?.physicalWidthMm ?? 600,
        currentTablePlacement,
      }),
    [currentTablePlacement, initialAppendBreadboardCenterMm, initialWorkspaceConfig],
  )
  const [previewMode, setPreviewMode] = useState<'source' | 'live-board'>('source')
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const [appendBreadboardCenterMm, setAppendBreadboardCenterMm] = useState<Vector2Mm | undefined>(
    baselineAppendBreadboardCenterMm,
  )
  const appendModeAvailable =
    canAppendBreadboardToTable &&
    workspaceConfig.workspaceKind === 'single-breadboard' &&
    workspaceConfig.breadboards.length === 1
  const renderMode = useEditorStore((state) => state.renderMode)
  const simpleIconStyle = useEditorStore((state) => state.simpleIconStyle)
  useEffect(() => {
    setMode(defaultMode)
    setWorkspaceConfig(cloneWorkspaceConfig(initialWorkspaceConfig))
    setInputState(createWorkspaceInputState(initialWorkspaceConfig))
    setPreviewItems(initialPreviewItems)
    setSelectedPreviewItemId(
      initialPreviewItems.find((item) => item.disposition !== 'skip')?.id ?? initialPreviewItems[0]?.id,
    )
    setPreviewMode('source')
    setAppendBreadboardCenterMm(baselineAppendBreadboardCenterMm)
  }, [
    currentTablePlacement,
    defaultMode,
    initialAppendBreadboardCenterMm,
    initialPreviewItems,
    initialWorkspaceConfig,
    baselineAppendBreadboardCenterMm,
  ])

  useEffect(() => {
    if (mode === 'append-breadboard' && !appendModeAvailable) {
      setMode('replace')
    }
  }, [appendModeAvailable, mode])

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
  const hasManualChanges =
    serializePreviewItemsForDirtyCheck(previewItems) !==
      serializePreviewItemsForDirtyCheck(initialPreviewItems) ||
    serializeWorkspaceConfigForDirtyCheck(workspaceConfig) !==
      serializeWorkspaceConfigForDirtyCheck(initialWorkspaceConfig) ||
    JSON.stringify(appendBreadboardCenterMm ?? null) !==
      JSON.stringify(baselineAppendBreadboardCenterMm ?? null)
  const selectedPreviewItem = previewItems.find((item) => item.id === selectedPreviewItemId)
  const weakPreviewItemCount = previewItems.filter((item) => !item.isStrongMatch).length
  const strongPreviewItemCount = previewItems.filter((item) => item.isStrongMatch).length
  const boardWidthMm = workspaceConfig.breadboards[0]?.physicalWidthMm ?? 600
  const boardHeightMm = workspaceConfig.breadboards[0]?.physicalHeightMm ?? 300
  const millimetersPerUnit = resolveSvgImportScaleMmPerUnit({
    document,
    workspaceConfig,
  })
  const canFinish =
    configIsValid &&
    (mode !== 'append-breadboard' || appendBreadboardCenterMm !== undefined)
  if (!isOpen) {
    return null
  }

  const commitWorkspaceConfig = (nextConfig: SvgImportWorkspaceConfig, syncInputs = false) => {
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
        tableBoundsHeight: field === 'height' ? value : previous.tableBoundsHeight,
        tableBoundsWidth: field === 'width' ? value : previous.tableBoundsWidth,
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
  }

  const updatePreviewItem = (id: string, updater: (item: ImportPreviewItem) => ImportPreviewItem) => {
    setPreviewItems((current) =>
      current.map((item) => (item.id === id ? updater(item) : item)),
    )
  }

  const updatePreviewItemPosition = (id: string, nextCenter: Vector2Mm, nextBounds: BoundsMm) => {
    updatePreviewItem(id, (item) => ({
      ...item,
      bounds: nextBounds,
      center: nextCenter,
    }))
  }

  const sourceTitle =
    document.sourceKind === 'svg' ? 'Import Drawing' : 'Import Raster Drawing'

  return (
    <div className="modal-shell" role="dialog" aria-modal="true" aria-label="Drawing import">
      <button className="modal-shell__backdrop" onClick={onCancel} type="button" />
      <div
        className="modal-shell__card modal-shell__card--export svg-import-options svg-import-options--preview"
        data-testid="drawing-import-modal"
      >
        <header className="modal-shell__header">
          <div>
            <h2>{sourceTitle}</h2>
            <p>{fileName}</p>
          </div>
          <div className="svg-import-header__summary">
            <div className="svg-import-header__badge">
              {boardWidthMm} × {boardHeightMm} mm
            </div>
            <div className="svg-import-header__badge">
              {strongPreviewItemCount} auto, {weakPreviewItemCount} editable
            </div>
          </div>
        </header>

        <div className="svg-import-options__layout svg-import-options__layout--preview">
          <section className="svg-import-preview-pane svg-import-preview-pane--primary">
            <div className="svg-import-preview-pane__header">
              <div>
                <div className="svg-import-panel__eyebrow">Preview</div>
                <h3>
                  {previewMode === 'source'
                    ? 'Auto-calibrated source preview'
                    : 'Live board-result preview'}
                </h3>
              </div>
              <div className="svg-import-preview-pane__header-meta">
                <div className="svg-import-preview-toggle" role="tablist" aria-label="Import preview mode">
                  <button
                    aria-selected={previewMode === 'source'}
                    className={previewMode === 'source' ? 'is-active' : ''}
                    data-testid="drawing-import-preview-source"
                    onClick={() => setPreviewMode('source')}
                    role="tab"
                    type="button"
                  >
                    Source preview
                  </button>
                  <button
                    aria-selected={previewMode === 'live-board'}
                    className={previewMode === 'live-board' ? 'is-active' : ''}
                    data-testid="drawing-import-preview-board"
                    onClick={() => setPreviewMode('live-board')}
                    role="tab"
                    type="button"
                  >
                    Board preview
                  </button>
                </div>
                <p className="modal-shell__hint">
                  {previewMode === 'source'
                    ? 'Inspect the source drawing first, then switch to the rendered board result when you want to drag the actual imported components.'
                    : 'Review the actual imported board layout and drag components where they should land.'}
                </p>
              </div>
            </div>

            {previewMode === 'source' ? (
              <SvgImportPreview
                className="svg-import-preview svg-import-preview--interactive"
                document={document}
                onSelectPreviewItem={setSelectedPreviewItemId}
                onUpdatePreviewItem={updatePreviewItemPosition}
                previewItems={previewItems}
                selectedPreviewItemId={selectedPreviewItemId}
                surfaceOverlays={surfaceOverlays}
              />
            ) : (
              <SvgImportBoardPreview
                analysis={
                  analysis ?? {
                    ambiguous: [],
                    annotationSegments: [],
                    recognized: [],
                    reviewItems: [],
                    warnings: [],
                    workspaceDetection: {
                      breadboardCandidates: [],
                      orphanElementIds: [],
                      warnings: [],
                      workspaceKind: workspaceConfig.workspaceKind,
                    },
                  }
                }
                appendBreadboardCenterMm={appendBreadboardCenterMm}
                className="svg-import-preview svg-import-preview--board"
                document={document}
                hostSurfaceId={hostSurfaceId}
                millimetersPerUnit={millimetersPerUnit}
                mode={mode}
                onSelectPreviewItem={setSelectedPreviewItemId}
                onUpdatePreviewItem={updatePreviewItemPosition}
                previewItems={previewItems}
                renderMode={renderMode}
                selectedPreviewItemId={selectedPreviewItemId}
                simpleIconStyle={simpleIconStyle}
                showLabels={showLabels}
                workspaceConfig={workspaceConfig}
              />
            )}
          </section>

          <form
            className="modal-shell__form svg-import-options__controls svg-import-options__controls--preview"
            onSubmit={(event) => event.preventDefault()}
          >
            <section className="svg-import-summary-card svg-import-summary-card--inline" aria-label="Import summary">
              <div className="svg-import-summary-card__eyebrow">Ready state</div>
              <div className={`svg-import-summary-card__state${canFinish ? ' is-ready' : ''}`}>
                {canFinish ? 'Ready to finish' : `${requiredItems.length} required field${requiredItems.length === 1 ? '' : 's'} left`}
              </div>
              <p className="svg-import-summary-card__note">
                {formatScaleHint({
                  scaleIsReliable,
                  scaleReason,
                  sourceKind: document.sourceKind,
                })}
              </p>
            </section>

            <fieldset className="modal-shell__fieldset">
              <legend>Import target</legend>
              <label className="modal-shell__choice">
                <input
                  checked={mode === 'replace'}
                  name="svg-import-mode"
                  onChange={() => setMode('replace')}
                  type="radio"
                />
                <span>Replace current scene</span>
              </label>

              <details className="svg-import-advanced-toggle">
                <summary>Advanced targets</summary>
                {document.sourceKind === 'svg' ? (
                  <label className="modal-shell__choice">
                    <input
                      checked={mode === 'merge'}
                      name="svg-import-mode"
                      onChange={() => setMode('merge')}
                      type="radio"
                    />
                    <span>Merge into current scene</span>
                  </label>
                ) : null}
                {appendModeAvailable ? (
                  <label className="modal-shell__choice">
                    <input
                      checked={mode === 'append-breadboard'}
                      name="svg-import-mode"
                      onChange={() => setMode('append-breadboard')}
                      type="radio"
                    />
                    <span>Add as new breadboard to current table</span>
                  </label>
                ) : null}
              </details>
            </fieldset>

            <fieldset className="modal-shell__fieldset">
              <legend>Surface setup</legend>
              <label className="modal-shell__choice">
                <input
                  checked={workspaceConfig.workspaceKind === 'single-breadboard'}
                  name="svg-import-workspace"
                  onChange={() => setWorkspaceKind('single-breadboard')}
                  type="radio"
                />
                <span>Single breadboard</span>
              </label>
              <label className="modal-shell__choice">
                <input
                  checked={workspaceConfig.workspaceKind === 'optical-table'}
                  name="svg-import-workspace"
                  onChange={() => setWorkspaceKind('optical-table')}
                  type="radio"
                />
                <span>Optical table with breadboards</span>
              </label>

              <div className="svg-import-field-grid">
                {workspaceConfig.workspaceKind === 'optical-table' ? (
                  <>
                    <label className="svg-import-field">
                      Table width (mm)
                      <input
                        onBlur={(event) => {
                          const parsed = parsePositiveNumberInput(event.target.value)
                          if (parsed !== undefined && workspaceConfig.table) {
                            updateSurface('table', 0, { physicalWidthMm: parsed })
                          }
                        }}
                        onChange={(event) =>
                          setInputState((previous) => ({
                            ...previous,
                            tableWidth: event.target.value,
                          }))
                        }
                        onFocus={selectAllText}
                        type="text"
                        value={inputState.tableWidth}
                      />
                    </label>
                    <label className="svg-import-field">
                      Table height (mm)
                      <input
                        onBlur={(event) => {
                          const parsed = parsePositiveNumberInput(event.target.value)
                          if (parsed !== undefined && workspaceConfig.table) {
                            updateSurface('table', 0, { physicalHeightMm: parsed })
                          }
                        }}
                        onChange={(event) =>
                          setInputState((previous) => ({
                            ...previous,
                            tableHeight: event.target.value,
                          }))
                        }
                        onFocus={selectAllText}
                        type="text"
                        value={inputState.tableHeight}
                      />
                    </label>
                    <label className="svg-import-field">
                      Breadboard count
                      <input
                        onChange={(event) => setBreadboardCount(event.target.value)}
                        onFocus={selectAllText}
                        type="text"
                        value={inputState.breadboardCount}
                      />
                    </label>
                  </>
                ) : null}

                <label className="svg-import-field">
                  Breadboard width (mm)
                  <input
                    onBlur={(event) => {
                      const parsed = parsePositiveNumberInput(event.target.value)
                      if (parsed !== undefined && workspaceConfig.breadboards[0]) {
                        updateSurface('breadboard', 0, { physicalWidthMm: parsed })
                      }
                    }}
                    onChange={(event) =>
                      updateBreadboardInputField('breadboardWidths', 0, event.target.value)
                    }
                    onFocus={selectAllText}
                    type="text"
                    value={inputState.breadboardWidths[0] ?? ''}
                  />
                </label>
                <label className="svg-import-field">
                  Breadboard height (mm)
                  <input
                    onBlur={(event) => {
                      const parsed = parsePositiveNumberInput(event.target.value)
                      if (parsed !== undefined && workspaceConfig.breadboards[0]) {
                        updateSurface('breadboard', 0, { physicalHeightMm: parsed })
                      }
                    }}
                    onChange={(event) =>
                      updateBreadboardInputField('breadboardHeights', 0, event.target.value)
                    }
                    onFocus={selectAllText}
                    type="text"
                    value={inputState.breadboardHeights[0] ?? ''}
                  />
                </label>
              </div>

              {autoCalibrationSuggestion ? (
                <div className="svg-import-auto-card" data-testid="drawing-import-auto-calibration-card">
                  <div className="svg-import-panel__eyebrow">Auto-calibrate</div>
                  <h4>
                    {autoCalibrationSuggestion.visibleGridColumnCount} ×{' '}
                    {autoCalibrationSuggestion.visibleGridRowCount} visible,{' '}
                    {autoCalibrationSuggestion.gridColumnCount} ×{' '}
                    {autoCalibrationSuggestion.gridRowCount} inferred
                  </h4>
                  <p className="modal-shell__hint">
                    Assuming {DEFAULT_IMPORT_HOLE_PITCH_MM} mm pitch at{' '}
                    {autoCalibrationSuggestion.inferredMmPerUnit.toFixed(4)} mm/unit.
                  </p>
                  <button data-testid="drawing-import-apply-auto-calibration" onClick={applySuggestedAutoCalibration} type="button">
                    Apply suggested surface sizes
                  </button>
                </div>
              ) : null}
            </fieldset>

            {mode === 'append-breadboard' && currentTablePlacement && appendBreadboardCenterMm ? (
              <TablePlacementPreview
                boardHeight={boardHeightMm}
                boardWidth={boardWidthMm}
                center={appendBreadboardCenterMm}
                data={currentTablePlacement}
                onChange={setAppendBreadboardCenterMm}
              />
            ) : null}

            <fieldset className="modal-shell__fieldset">
              <legend>Selected item</legend>
              {selectedPreviewItem ? (
                <div className="svg-import-selected-item">
                  <div className="svg-import-selected-item__header">
                    <div>
                      <div className="svg-import-panel__eyebrow">{selectedPreviewItem.kind}</div>
                      <h4>{selectedPreviewItem.label}</h4>
                    </div>
                    <div className="svg-import-selected-item__status">
                      {selectedPreviewItem.disposition === 'component'
                        ? selectedPreviewItem.componentType
                          ? getComponentDefinition(selectedPreviewItem.componentType).familyLabel
                          : 'Assigned'
                        : selectedPreviewItem.disposition === 'linework'
                          ? 'Keep as linework'
                          : 'Skipped'}
                    </div>
                  </div>

                  {selectedPreviewItem.suggestions.length > 0 ? (
                    <div className="svg-import-suggestion-list">
                      {selectedPreviewItem.suggestions.slice(0, 3).map((suggestion) => (
                        <button
                          key={`${selectedPreviewItem.id}-${suggestion.componentType}`}
                          onClick={() =>
                            updatePreviewItem(selectedPreviewItem.id, (item) => ({
                              ...item,
                              componentType: suggestion.componentType,
                              disposition: 'component',
                            }))
                          }
                          type="button"
                        >
                          {getComponentDefinition(suggestion.componentType).familyLabel} (
                          {Math.round(suggestion.confidence * 100)}%)
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="modal-shell__hint">
                      No family guess yet. Use the chooser below if you want to import this marker as a component.
                    </p>
                  )}

                  <div className="svg-import-selected-item__actions">
                    <button
                      onClick={() =>
                        updatePreviewItem(selectedPreviewItem.id, (item) => ({
                          ...item,
                          disposition: 'component',
                        }))
                      }
                      type="button"
                    >
                      Import as component
                    </button>
                    {selectedPreviewItem.allowKeepAsLinework ? (
                      <button
                        onClick={() =>
                          updatePreviewItem(selectedPreviewItem.id, (item) => ({
                            ...item,
                            disposition: 'linework',
                          }))
                        }
                        type="button"
                      >
                        Keep as linework
                      </button>
                    ) : null}
                    <button
                      onClick={() =>
                        updatePreviewItem(selectedPreviewItem.id, (item) => ({
                          ...item,
                          disposition: 'skip',
                        }))
                      }
                      type="button"
                    >
                      Skip
                    </button>
                    <button
                      onClick={() =>
                        updatePreviewItem(selectedPreviewItem.id, (item) => ({
                          ...item,
                          rotationQuarterTurns: normalizeQuarterTurn(item.rotationQuarterTurns - 1),
                        }))
                      }
                      type="button"
                    >
                      Rotate left
                    </button>
                    <button
                      onClick={() =>
                        updatePreviewItem(selectedPreviewItem.id, (item) => ({
                          ...item,
                          rotationQuarterTurns: normalizeQuarterTurn(item.rotationQuarterTurns + 1),
                        }))
                      }
                      type="button"
                    >
                      Rotate right
                    </button>
                  </div>

                  {previewMode === 'live-board' &&
                  selectedPreviewItem.disposition !== 'component' ? (
                    <p className="modal-shell__hint">
                      This item is not currently being placed on the board preview. Reassign it or switch its disposition if you want it imported.
                    </p>
                  ) : null}

                  <SvgImportVariantChooser
                    onSelect={(selection) =>
                      updatePreviewItem(selectedPreviewItem.id, (item) => ({
                        ...item,
                        componentType: selection.componentType,
                        disposition: 'component',
                        variantId: selection.variantId,
                      }))
                    }
                    selectedComponentType={selectedPreviewItem.componentType}
                    selectedVariantId={selectedPreviewItem.variantId}
                  />
                </div>
              ) : (
                <p className="modal-shell__hint">
                  Click a highlighted item in the preview if you want to correct it before import.
                </p>
              )}
            </fieldset>

            <details
              className="svg-import-advanced-toggle"
              open={isAdvancedOpen}
              onToggle={(event) => setIsAdvancedOpen((event.target as HTMLDetailsElement).open)}
            >
              <summary>Advanced</summary>
              <fieldset className="modal-shell__fieldset">
                <legend>Detected surface regions</legend>
                {workspaceConfig.table ? (
                  <div className="svg-import-field-grid">
                    <label className="svg-import-field">
                      Table region X
                      <input
                        onChange={(event) =>
                          updateSurfaceBoundsField('table', 0, 'x', event.target.value)
                        }
                        onFocus={selectAllText}
                        type="text"
                        value={inputState.tableX}
                      />
                    </label>
                    <label className="svg-import-field">
                      Table region Y
                      <input
                        onChange={(event) =>
                          updateSurfaceBoundsField('table', 0, 'y', event.target.value)
                        }
                        onFocus={selectAllText}
                        type="text"
                        value={inputState.tableY}
                      />
                    </label>
                    <label className="svg-import-field">
                      Table region width
                      <input
                        onChange={(event) =>
                          updateSurfaceBoundsField('table', 0, 'width', event.target.value)
                        }
                        onFocus={selectAllText}
                        type="text"
                        value={inputState.tableBoundsWidth}
                      />
                    </label>
                    <label className="svg-import-field">
                      Table region height
                      <input
                        onChange={(event) =>
                          updateSurfaceBoundsField('table', 0, 'height', event.target.value)
                        }
                        onFocus={selectAllText}
                        type="text"
                        value={inputState.tableBoundsHeight}
                      />
                    </label>
                  </div>
                ) : null}

                <div className="svg-import-field-grid">
                  <label className="svg-import-field">
                    Breadboard region X
                    <input
                      onChange={(event) =>
                        updateSurfaceBoundsField('breadboard', 0, 'x', event.target.value)
                      }
                      onFocus={selectAllText}
                      type="text"
                      value={inputState.breadboardX[0] ?? ''}
                    />
                  </label>
                  <label className="svg-import-field">
                    Breadboard region Y
                    <input
                      onChange={(event) =>
                        updateSurfaceBoundsField('breadboard', 0, 'y', event.target.value)
                      }
                      onFocus={selectAllText}
                      type="text"
                      value={inputState.breadboardY[0] ?? ''}
                    />
                  </label>
                  <label className="svg-import-field">
                    Breadboard region width
                    <input
                      onChange={(event) =>
                        updateSurfaceBoundsField('breadboard', 0, 'width', event.target.value)
                      }
                      onFocus={selectAllText}
                      type="text"
                      value={inputState.breadboardBoundsWidths[0] ?? ''}
                    />
                  </label>
                  <label className="svg-import-field">
                    Breadboard region height
                    <input
                      onChange={(event) =>
                        updateSurfaceBoundsField('breadboard', 0, 'height', event.target.value)
                      }
                      onFocus={selectAllText}
                      type="text"
                      value={inputState.breadboardBoundsHeights[0] ?? ''}
                    />
                  </label>
                </div>

                <button
                  onClick={() =>
                    onOpenCalibration({
                      appendBreadboardCenterMm,
                      mode,
                      previewItems,
                      workspaceConfig,
                    })
                  }
                  type="button"
                >
                  Manual calibration
                </button>
              </fieldset>
            </details>
          </form>
        </div>

        <footer className="modal-shell__actions svg-import-options__actions">
          <button onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            disabled={!canFinish}
              onClick={() =>
                onConfirm({
                  appendBreadboardCenterMm,
                  actionIntent: 'board-only',
                  mode,
                  previewItems,
                  workspaceConfig,
                })
            }
            type="button"
          >
            Import board dimensions only
          </button>
          <button
            disabled={!canFinish}
              onClick={() =>
                onConfirm({
                  appendBreadboardCenterMm: baselineAppendBreadboardCenterMm,
                  actionIntent: 'quick-import',
                  mode,
                  previewItems: initialPreviewItems,
                  workspaceConfig: cloneWorkspaceConfig(initialWorkspaceConfig),
                })
            }
            type="button"
          >
            Quick import suggestions
          </button>
          {hasManualChanges ? (
            <button
              disabled={!canFinish}
              onClick={() =>
                onConfirm({
                  appendBreadboardCenterMm,
                  actionIntent: 'modified-import',
                  mode,
                  previewItems,
                  workspaceConfig,
                })
              }
              type="button"
            >
              Import modified setup
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  )
}

import { useState, useMemo, type ReactNode } from 'react'
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
  BeamInteractionEvent,
  BeamTraceResult,
  FilterTransmissionClass,
  GaussianTraceResult,
  PolarizationConfig,
  QuarterTurn,
  WorldPort,
} from '../domain/types'
import { useEditorStore } from '../state/editorStore'

interface InspectorPanelProps {
  beamTrace: BeamTraceResult
  gaussianTrace: GaussianTraceResult
  onCollapse: () => void
}

interface FieldProps {
  children: ReactNode
  label: string
}

function Field({ children, label }: FieldProps) {
  return (
    <label className="inspector__field">
      <span>{label}</span>
      {children}
    </label>
  )
}

interface NumberFieldProps {
  label: string
  onChange: (value: number) => void
  step?: number
  value: number
}

function NumberField({
  label,
  onChange,
  step = 0.1,
  value,
}: NumberFieldProps) {
  return (
    <Field label={label}>
      <input
        onChange={(event) => {
          if (event.target.value === '') {
            return
          }

          const nextValue = Number(event.target.value)

          if (Number.isFinite(nextValue)) {
            onChange(nextValue)
          }
        }}
        step={step}
        type="number"
        value={value}
      />
    </Field>
  )
}

interface CollapsibleSectionProps {
  children: ReactNode
  defaultOpen?: boolean
  title: string
}

function CollapsibleSection({ children, defaultOpen = false, title }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  return (
    <div className="inspector__subsection">
      <button
        className="inspector__section-toggle"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <span className="inspector__section-chevron">
          {isOpen ? '\u25BE' : '\u25B8'}
        </span>
        <h3>{title}</h3>
      </button>
      {isOpen ? <div className="inspector__section-body">{children}</div> : null}
    </div>
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

function formatPlacementStatus(status: string, reason: string) {
  if (reason === 'none') {
    return status
  }

  return `${status} • ${reason}`
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
      return 'component footprint extends outside the breadboard or source lane'
    case 'occupied':
      return 'mount envelope overlaps another component'
    case 'outside-source-lane':
      return 'external sources must stay on the source lane'
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
  gaussianTrace,
}: {
  beamTrace: BeamTraceResult
  gaussianTrace: GaussianTraceResult
}) {
  const interaction = useEditorStore((state) => state.interaction)
  const beamSelection = useMemo(
    () =>
      getBeamSelectionSnapshot(beamTrace, {
        interactionId: interaction.selectedBeamInteractionId,
        pathId: interaction.selectedBeamPathId,
        segmentId: interaction.selectedBeamSegmentId,
      }),
    [
      beamTrace,
      interaction.selectedBeamInteractionId,
      interaction.selectedBeamPathId,
      interaction.selectedBeamSegmentId,
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
    <div className="inspector__subsection">
      <h3>Beam Inspection</h3>

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
    </div>
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
  const snapMode = useEditorStore((state) => state.snapMode)
  const interactionNotice = useEditorStore((state) => state.interaction.notice)
  const activeHostSurfaceId = useEditorStore(
    (state) => state.interaction.activeHostSurfaceId,
  )
  const pendingPlacement = useEditorStore(
    (state) => state.interaction.pendingPlacement,
  )
  const pendingBreadboardPlacement = useEditorStore(
    (state) => state.interaction.pendingBreadboardPlacement,
  )
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
  const inspectedComponent = pendingPlacement
    ? {
        ...pendingPlacement.draft,
        anchorMm: pendingPlacement.candidateAnchorMm,
      }
    : selectedComponent
  const inspectorMode = pendingPlacement || pendingBreadboardPlacement
    ? 'Pending Placement'
    : inspectedComponent
      ? 'Selected Component'
      : selection.type === 'optical-table'
        ? 'Optical Table'
        : 'Breadboard'
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

  if (!inspectedComponent) {
    const holeCounts = getBreadboardHoleCounts(activeBreadboard)
    const effectivePitchMm = getEffectiveHolePitchMm(activeBreadboard)
    const activeSourceCount = scene.components.filter(
      (component) => component.config.source?.isEnabled,
    ).length

    return (
      <aside className="panel inspector" data-tour="inspector">
        <div className="panel__header">
          <span className="panel__eyebrow">{inspectorMode}</span>
          <div className="panel__header-top">
            <div>
              <h2>{pendingBreadboardPlacement ? 'Pending Breadboard' : 'Breadboard Inspector'}</h2>
              <p>
                {pendingBreadboardPlacement
                  ? 'Adjust the breadboard preset or dimensions before you place it on the optical table.'
                  : 'Board geometry, source-lane defaults, and deterministic beam-scene settings.'}
              </p>
            </div>
            <button
              className="panel__collapse-button"
              data-tour="panel-inspector-toggle"
              onClick={onCollapse}
              type="button"
            >
              Collapse
            </button>
          </div>
        </div>

        <div className="inspector__content">
          <BeamInspectionSection beamTrace={beamTrace} gaussianTrace={gaussianTrace} />

          <div className="inspector__subsection">
            <h3>{opticalTable && selection.type === 'optical-table' ? 'Optical Table' : 'Board'}</h3>

            {opticalTable ? (
              <div className="inspector__notice">
                {pendingBreadboardPlacement ? (
                  <>
                    Optical table mode is active. You are editing a pending breadboard preview for{' '}
                    <strong>{boardLabel}</strong>.
                  </>
                ) : (
                  <>
                    Optical table mode is active. You are editing{' '}
                    <strong>{boardLabel}</strong> as the current breadboard surface.
                  </>
                )}
              </div>
            ) : null}

            {opticalTable && selection.type === 'optical-table' ? (
              <>
                <div className="inspector__grid">
                  <NumberField
                    label="Table width (mm)"
                    onChange={(widthMm) => updateOpticalTable({ widthMm })}
                    step={10}
                    value={opticalTable.widthMm}
                  />
                  <NumberField
                    label="Table height (mm)"
                    onChange={(heightMm) => updateOpticalTable({ heightMm })}
                    step={10}
                    value={opticalTable.heightMm}
                  />
                  <NumberField
                    label="Hole spacing (mm)"
                    onChange={(holeSpacingMm) => updateOpticalTable({ holeSpacingMm })}
                    step={0.5}
                    value={opticalTable.holeSpacingMm}
                  />
                  <NumberField
                    label="Edge margin (mm)"
                    onChange={(edgeMarginMm) => updateOpticalTable({ edgeMarginMm })}
                    step={0.5}
                    value={opticalTable.edgeMarginMm}
                  />
                </div>

                <div className="inspector__grid">
                  <NumberField
                    label="Thickness (mm)"
                    onChange={(thicknessMm) => updateOpticalTable({ thicknessMm })}
                    step={0.5}
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
                </div>
              </>
            ) : null}

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
                    {preset.label}
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
            </Field>

            <Field label="Label">
              <input
                onChange={(event) =>
                  updateBreadboard({
                    label: event.target.value,
                  })
                }
                type="text"
                value={boardLabel}
              />
            </Field>

            {activeBreadboardInstance && opticalTable ? (
              <div className="inspector__grid">
                <NumberField
                  label="X position (mm)"
                  onChange={(x) =>
                    updateBreadboardPosition(activeBreadboardInstance.id, {
                      x,
                      y: activeBreadboardInstance.anchorMm.y,
                    })
                  }
                  step={1}
                  value={activeBreadboardInstance.anchorMm.x}
                />
                <NumberField
                  label="Y position (mm)"
                  onChange={(y) =>
                    updateBreadboardPosition(activeBreadboardInstance.id, {
                      x: activeBreadboardInstance.anchorMm.x,
                      y,
                    })
                  }
                  step={1}
                  value={activeBreadboardInstance.anchorMm.y}
                />
              </div>
            ) : null}

            <div className="inspector__grid">
              <NumberField
                label="Width (mm)"
                onChange={(widthMm) => updateBreadboard({ widthMm })}
                step={1}
                value={activeBreadboard.widthMm}
              />
              <NumberField
                label="Height (mm)"
                onChange={(heightMm) => updateBreadboard({ heightMm })}
                step={1}
                value={activeBreadboard.heightMm}
              />
              <NumberField
                label="Hole spacing (mm)"
                onChange={(holeSpacingMm) => updateBreadboard({ holeSpacingMm })}
                step={0.5}
                value={activeBreadboard.holeSpacingMm}
              />
              <NumberField
                label="Edge margin (mm)"
                onChange={(edgeMarginMm) => updateBreadboard({ edgeMarginMm })}
                step={0.5}
                value={activeBreadboard.edgeMarginMm}
              />
              <NumberField
                label="Thickness (mm)"
                onChange={(thicknessMm) => updateBreadboard({ thicknessMm })}
                step={0.1}
                value={activeBreadboard.thicknessMm}
              />
            </div>

            <div className="inspector__grid">
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
                  <option value="corner-25mm">Corner 25 mm inset</option>
                  <option value="none">None</option>
                </select>
              </Field>
            </div>

            {opticalTable ? (
              <div className="inspector__readout">
                <div>
                  <span>Table size</span>
                  <strong>
                    {opticalTable.widthMm.toFixed(0)} × {opticalTable.heightMm.toFixed(0)} mm
                  </strong>
                </div>
                <div>
                  <span>Breadboards on table</span>
                  <strong>{breadboardInstances.length}</strong>
                </div>
              </div>
            ) : null}

            {opticalTable ? (
              <div className="inspector__subsection">
                <h3>Host Surfaces</h3>
                <div className="inspector__list">
                  <button
                    className="inspector__list-item"
                    onClick={() => {
                      setActiveHostSurfaceId('optical-table')
                      selectOpticalTable()
                    }}
                    type="button"
                  >
                    <strong>{opticalTable.label}</strong>
                    <span>Optical table surface</span>
                  </button>
                  {breadboardInstances.map((breadboard) => (
                    <button
                      className="inspector__list-item"
                      key={breadboard.id}
                      onClick={() => {
                        setActiveHostSurfaceId(breadboard.id)
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
              </div>
            ) : null}
          </div>

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
              <span>Snap mode</span>
              <strong>
                {snapMode === 'always'
                  ? 'Always'
                  : snapMode === 'onDrop'
                    ? 'On drop'
                    : 'None'}
              </strong>
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
                label="Shared beam height (mm)"
                onChange={(sharedBeamHeightMm) =>
                  updateBeamSettings({ sharedBeamHeightMm })
                }
                step={0.5}
                value={scene.beamSettings.sharedBeamHeightMm}
              />
              <NumberField
                label="Default diameter (mm)"
                onChange={(defaultBeamDiameterMm) =>
                  updateBeamSettings({ defaultBeamDiameterMm })
                }
                step={0.1}
                value={scene.beamSettings.defaultBeamDiameterMm}
              />
              <NumberField
                label="Default divergence (mrad)"
                onChange={(defaultDivergenceMrad) =>
                  updateBeamSettings({ defaultDivergenceMrad })
                }
                step={0.1}
                value={scene.beamSettings.defaultDivergenceMrad}
              />
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
  const variants = getComponentVariants(inspectedComponent.type)
  const worldPorts = getWorldPortsForComponent(inspectedComponent, spec)
  const rotatedFootprint = getRotatedFootprintBoundsMm(inspectedComponent, spec)
  const placement = inspectSceneComponentPlacement(scene, inspectedComponent, spec)
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
    <aside className="panel inspector" data-tour="inspector">
      <div className="panel__header">
        <span className="panel__eyebrow">{inspectorMode}</span>
        <div className="panel__header-top">
          <div>
            <h2>{pendingPlacement ? 'Pending Placement' : 'Component Inspector'}</h2>
            <p>
              {pendingPlacement
                ? 'Edit the draft before you place it on the board.'
                : 'Family, variant, placement, and deterministic beam-domain controls for the selection.'}
            </p>
          </div>
          <button
            className="panel__collapse-button"
            data-tour="panel-inspector-toggle"
            onClick={onCollapse}
            type="button"
          >
            Collapse
          </button>
        </div>
      </div>

      <div className="inspector__content">
        <BeamInspectionSection beamTrace={beamTrace} gaussianTrace={gaussianTrace} />

        <div className="inspector__readout">
          <div>
            <span>Family</span>
            <strong>{definition.familyLabel}</strong>
          </div>
          <div>
            <span>Editing</span>
            <strong>{pendingPlacement ? 'Pending draft' : 'Placed component'}</strong>
          </div>
          <div>
            <span>Variant</span>
            <strong>{spec.variantLabel}</strong>
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
            <span>Placement</span>
            <strong>{formatPlacementStatus(placement.status, placement.reason)}</strong>
          </div>
          <div>
            <span>Footprint</span>
            <strong>
              {spec.footprintBoundsMm.width.toFixed(1)} × {spec.footprintBoundsMm.height.toFixed(1)} mm
            </strong>
          </div>
          <div>
            <span>Rotated bounds</span>
            <strong>
              {rotatedFootprint.width.toFixed(1)} × {rotatedFootprint.height.toFixed(1)} mm
            </strong>
          </div>
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

        <div className="inspector__subsection">
          <h3>Identity</h3>

          <Field label="Variant / SKU">
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

          <Field label="Label">
            <input
              onChange={(event) =>
                updateSelectedComponent({
                  label: event.target.value,
                })
              }
              type="text"
              value={inspectedComponent.label}
            />
          </Field>

          <div className="inspector__grid">
            <NumberField
              label="Anchor X (mm)"
              onChange={(x) =>
                updateSelectedComponent({
                  anchorMm: { x, y: inspectedComponent.anchorMm.y },
                })
              }
              step={0.5}
              value={inspectedComponent.anchorMm.x}
            />
            <NumberField
              label="Anchor Y (mm)"
              onChange={(y) =>
                updateSelectedComponent({
                  anchorMm: { x: inspectedComponent.anchorMm.x, y },
                })
              }
              step={0.5}
              value={inspectedComponent.anchorMm.y}
            />

            {spec.mount.mode !== 'external-source' ? (
              <Field label="Rotation">
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
              <Field label="Orientation">
                <input
                  readOnly
                  type="text"
                  value={`${inspectedComponent.config.source?.lane ?? 'left'} lane`}
                />
              </Field>
            )}
          </div>
          {spec.recommendedHardware ? (
            <div className="inspector__readout">
              <div>
                <span>Recommended mount</span>
                <strong>{spec.recommendedHardware.mount ?? 'n/a'}</strong>
              </div>
              <div>
                <span>Recommended post</span>
                <strong>{spec.recommendedHardware.post ?? 'n/a'}</strong>
              </div>
              <div>
                <span>Clamp</span>
                <strong>{spec.recommendedHardware.clamp ?? 'Optional'}</strong>
              </div>
            </div>
          ) : null}
          <CollapsibleSection title="Geometry Overrides">
            <div className="inspector__grid">
              <NumberField
                label="Footprint width (mm)"
                onChange={(widthMm) =>
                  updateSelectedGeometryOverride({
                    widthMm,
                    heightMm:
                      inspectedComponent.geometryOverride?.heightMm ??
                      spec.footprintBoundsMm.height,
                  })
                }
                step={0.5}
                value={spec.footprintBoundsMm.width}
              />
              <NumberField
                label="Footprint height (mm)"
                onChange={(heightMm) =>
                  updateSelectedGeometryOverride({
                    widthMm:
                      inspectedComponent.geometryOverride?.widthMm ??
                      spec.footprintBoundsMm.width,
                    heightMm,
                  })
                }
                step={0.5}
                value={spec.footprintBoundsMm.height}
              />
            </div>
            <p className="inspector__hint">
              Canvas resize handles and these numeric fields update the same
              per-instance geometry override.
            </p>
          </CollapsibleSection>
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
                {mountVisibilityDefaults[inspectedComponent.type] === false ? 'hidden mounts' : 'included mounts'}.
              </p>
            </CollapsibleSection>
          ) : null}
          {describePlacementReason(placement.reason) ? (
            <p className="inspector__hint">{describePlacementReason(placement.reason)}</p>
          ) : null}
        </div>

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

              <Field label="Source lane">
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
                label="Wavelength (nm)"
                onChange={(wavelengthNm) => updateSelectedSource({ wavelengthNm })}
                step={1}
                value={inspectedComponent.config.source.wavelengthNm}
              />
              <NumberField
                label="Bandwidth (nm)"
                onChange={(bandwidthNm) => updateSelectedSource({ bandwidthNm })}
                step={0.1}
                value={inspectedComponent.config.source.bandwidthNm}
              />
              <NumberField
                label="Absolute power (mW)"
                onChange={(powerMw) => updateSelectedSource({ powerMw })}
                step={1}
                value={inspectedComponent.config.source.powerMw}
              />
              <NumberField
                label="Normalized power (%)"
                onChange={(normalizedPowerPercent) =>
                  updateSelectedSource({ normalizedPowerPercent })
                }
                step={1}
                value={inspectedComponent.config.source.normalizedPowerPercent}
              />
              <NumberField
                label="Beam diameter (mm)"
                onChange={(beamDiameterMm) => updateSelectedSource({ beamDiameterMm })}
                step={0.1}
                value={inspectedComponent.config.source.beamDiameterMm}
              />
              <NumberField
                label="Divergence (mrad)"
                onChange={(divergenceMrad) => updateSelectedSource({ divergenceMrad })}
                step={0.1}
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
                      label="Waist radius (mm)"
                      onChange={(waistRadiusMm) =>
                        updateSelectedSource({ waistRadiusMm })
                      }
                      step={0.01}
                      value={
                        inspectedComponent.config.source.waistRadiusMm ??
                        inspectedComponent.config.source.beamDiameterMm / 2
                      }
                    />
                    <NumberField
                      label="Waist offset (mm)"
                      onChange={(waistOffsetMm) =>
                        updateSelectedSource({ waistOffsetMm })
                      }
                      step={0.1}
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
                  label="Relative phase (deg)"
                  onChange={(relativePhaseDeg) =>
                    updateSelectedSource({
                      polarization: {
                        ...sourcePolarization,
                        presetId: 'elliptical',
                        relativePhaseDeg,
                      },
                    })
                  }
                  step={1}
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
                label="Focal length (mm)"
                onChange={(focalLengthMm) => updateSelectedLens({ focalLengthMm })}
                step={1}
                value={inspectedComponent.config.lens.focalLengthMm}
              />
              <NumberField
                label="Clear aperture (mm)"
                onChange={(clearApertureMm) =>
                  updateSelectedLens({ clearApertureMm })
                }
                step={0.1}
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
                label="ROC (mm)"
                onChange={(radiusOfCurvatureMm) =>
                  updateSelectedCurvedMirror({ radiusOfCurvatureMm })
                }
                step={1}
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

        {inspectedComponent.type === 'beamsplitter' && inspectedComponent.config.beamSplitter ? (
          <div className="inspector__subsection">
            <h3>Beamsplitter</h3>

            <div className="inspector__grid">
              <NumberField
                label="Reflect (%)"
                onChange={(reflectPercent) =>
                  updateSelectedBeamSplitter({ reflectPercent })
                }
                step={1}
                value={inspectedComponent.config.beamSplitter.reflectPercent}
              />
              <NumberField
                label="Loss (%)"
                onChange={(lossPercent) => updateSelectedBeamSplitter({ lossPercent })}
                step={0.5}
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

        {inspectedComponent.type === 'iris' && inspectedComponent.config.iris ? (
          <div className="inspector__subsection">
            <h3>Iris</h3>

            <NumberField
              label="Aperture (mm)"
              onChange={(apertureMm) => updateSelectedIris({ apertureMm })}
              step={0.1}
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
                label="Axis (deg)"
                onChange={(axisLocalDeg) => updateSelectedPolarizer({ axisLocalDeg })}
                step={0.5}
                value={inspectedComponent.config.polarizer.axisLocalDeg}
              />
              <NumberField
                label="Extinction ratio"
                onChange={(extinctionRatio) =>
                  updateSelectedPolarizer({ extinctionRatio })
                }
                step={10}
                value={inspectedComponent.config.polarizer.extinctionRatio}
              />
              <NumberField
                label="Insertion loss (%)"
                onChange={(insertionLossPercent) =>
                  updateSelectedPolarizer({ insertionLossPercent })
                }
                step={0.1}
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
                label="Axis (deg)"
                onChange={(axisLocalDeg) => updateSelectedWaveplate({ axisLocalDeg })}
                step={0.5}
                value={inspectedComponent.config.waveplate.axisLocalDeg}
              />
              <NumberField
                label="Retardance (deg)"
                onChange={(retardanceDeg) => updateSelectedWaveplate({ retardanceDeg })}
                step={0.5}
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
                step={0.5}
                value={inspectedComponent.config.bboCrystal.thicknessUm}
              />
              <NumberField
                label="Phase-matching angle (deg)"
                onChange={(phaseMatchingAngleDeg) =>
                  updateSelectedBboCrystal({ phaseMatchingAngleDeg })
                }
                step={0.1}
                value={inspectedComponent.config.bboCrystal.phaseMatchingAngleDeg}
              />
              <NumberField
                label="Polarization axis (deg)"
                onChange={(polarizationAxisLocalDeg) =>
                  updateSelectedBboCrystal({ polarizationAxisLocalDeg })
                }
                step={0.5}
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
                label="Position (mm)"
                onChange={(positionMm) => updateSelectedDelayLine({ positionMm })}
                step={0.1}
                value={inspectedComponent.config.delayLine.positionMm}
              />
              <NumberField
                label="Travel (mm)"
                onChange={(travelMm) => updateSelectedDelayLine({ travelMm })}
                step={0.1}
                value={inspectedComponent.config.delayLine.travelMm}
              />
              <NumberField
                label="Zero offset (fs)"
                onChange={(zeroDelayOffsetFs) =>
                  updateSelectedDelayLine({ zeroDelayOffsetFs })
                }
                step={1}
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
                step={1}
                value={inspectedComponent.config.telescope.element1Mm}
              />
              <NumberField
                label={
                  inspectedComponent.config.telescope.mode === 'reflection'
                    ? 'Mirror 2 ROC (mm)'
                    : 'Lens 2 f (mm)'
                }
                onChange={(element2Mm) => updateSelectedTelescope({ element2Mm })}
                step={1}
                value={inspectedComponent.config.telescope.element2Mm}
              />
              <NumberField
                label="Separation (mm)"
                onChange={(separationMm) => updateSelectedTelescope({ separationMm })}
                step={1}
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
                label="Target λ (nm)"
                onChange={(targetWavelengthNm) =>
                  updateSelectedOpa({ targetWavelengthNm })
                }
                step={1}
                value={inspectedComponent.config.opa.targetWavelengthNm ?? 650}
              />
              <NumberField
                label="Bandwidth (nm)"
                onChange={(outputBandwidthNm) =>
                  updateSelectedOpa({ outputBandwidthNm })
                }
                step={1}
                value={inspectedComponent.config.opa.outputBandwidthNm ?? 45}
              />
              <NumberField
                label="Efficiency (%)"
                onChange={(conversionEfficiencyPercent) =>
                  updateSelectedOpa({ conversionEfficiencyPercent })
                }
                step={0.5}
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

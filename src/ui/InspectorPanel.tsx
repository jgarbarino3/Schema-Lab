import { useMemo, type ReactNode } from 'react'
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
  getResolvedComponentSpec,
  isOpticalTarget,
} from '../domain/componentCatalog'
import { inspectComponentPlacement } from '../domain/placement'
import {
  applyPolarizationPreset,
  createDefaultPolarizationConfig,
  createPolarizationSnapshot,
} from '../domain/polarization'
import { getRotatedFootprintBoundsMm, getWorldPortsForComponent } from '../domain/ports'
import { SOURCE_PRESETS } from '../domain/sourcePresets'
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

export function InspectorPanel({ beamTrace, gaussianTrace }: InspectorPanelProps) {
  const scene = useEditorStore((state) => state.scene)
  const selection = useEditorStore((state) => state.selection)
  const snapMode = useEditorStore((state) => state.snapMode)
  const interactionNotice = useEditorStore((state) => state.interaction.notice)
  const pendingPlacement = useEditorStore(
    (state) => state.interaction.pendingPlacement,
  )
  const updateBreadboard = useEditorStore((state) => state.updateBreadboard)
  const applyBreadboardPreset = useEditorStore(
    (state) => state.applyBreadboardPreset,
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
  const updateSelectedIris = useEditorStore((state) => state.updateSelectedIris)
  const updateSelectedBboCrystal = useEditorStore(
    (state) => state.updateSelectedBboCrystal,
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
  const inspectorMode = pendingPlacement
    ? 'Pending Placement'
    : inspectedComponent
      ? 'Selected Component'
      : 'Breadboard'

  if (!inspectedComponent) {
    const holeCounts = getBreadboardHoleCounts(scene.breadboard)
    const effectivePitchMm = getEffectiveHolePitchMm(scene.breadboard)
    const activeSourceCount = scene.components.filter(
      (component) => component.config.source?.isEnabled,
    ).length

    return (
      <aside className="panel inspector" data-tour="inspector">
        <div className="panel__header">
          <span className="panel__eyebrow">{inspectorMode}</span>
          <h2>Breadboard Inspector</h2>
          <p>Board geometry, source-lane defaults, and deterministic beam-scene settings.</p>
        </div>

        <div className="inspector__content">
          <BeamInspectionSection beamTrace={beamTrace} gaussianTrace={gaussianTrace} />

          <div className="inspector__subsection">
            <h3>Board</h3>

            <Field label="Preset">
              <select
                onChange={(event) => {
                  if (event.target.value !== 'custom') {
                    applyBreadboardPreset(event.target.value)
                  }
                }}
                value={scene.breadboard.presetId ?? 'custom'}
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
                value={scene.breadboard.label}
              />
            </Field>

            <div className="inspector__grid">
              <NumberField
                label="Width (mm)"
                onChange={(widthMm) => updateBreadboard({ widthMm })}
                step={1}
                value={scene.breadboard.widthMm}
              />
              <NumberField
                label="Height (mm)"
                onChange={(heightMm) => updateBreadboard({ heightMm })}
                step={1}
                value={scene.breadboard.heightMm}
              />
              <NumberField
                label="Hole spacing (mm)"
                onChange={(holeSpacingMm) => updateBreadboard({ holeSpacingMm })}
                step={0.5}
                value={scene.breadboard.holeSpacingMm}
              />
              <NumberField
                label="Edge margin (mm)"
                onChange={(edgeMarginMm) => updateBreadboard({ edgeMarginMm })}
                step={0.5}
                value={scene.breadboard.edgeMarginMm}
              />
              <NumberField
                label="Thickness (mm)"
                onChange={(thicknessMm) => updateBreadboard({ thicknessMm })}
                step={0.1}
                value={scene.breadboard.thicknessMm}
              />
            </div>

            <div className="inspector__grid">
              <Field label="Finish">
                <select
                  onChange={(event) =>
                    updateBreadboard({
                      finish: event.target.value as typeof scene.breadboard.finish,
                    })
                  }
                  value={scene.breadboard.finish}
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
                        event.target.value as typeof scene.breadboard.holeDensity,
                    })
                  }
                  value={scene.breadboard.holeDensity}
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
                        event.target.value as typeof scene.breadboard.counterborePattern,
                    })
                  }
                  value={scene.breadboard.counterborePattern}
                >
                  <option value="corner-25mm">Corner 25 mm inset</option>
                  <option value="none">None</option>
                </select>
              </Field>
            </div>
          </div>

          <div className="inspector__subsection">
            <h3>Beam Scene</h3>

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

          <div className="inspector__subsection">
            <h3>Active Source Summaries</h3>

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
          </div>

          {interactionNotice ? (
            <p className="inspector__notice">{interactionNotice}</p>
          ) : null}
        </div>
      </aside>
    )
  }

  const definition = getComponentDefinition(inspectedComponent.type)
  const spec = getResolvedComponentSpec(
    inspectedComponent.type,
    inspectedComponent.variantId,
  )
  const variants = getComponentVariants(inspectedComponent.type)
  const worldPorts = getWorldPortsForComponent(inspectedComponent, spec)
  const rotatedFootprint = getRotatedFootprintBoundsMm(inspectedComponent, spec)
  const placement = inspectComponentPlacement(scene.breadboard, inspectedComponent, spec)
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
        <h2>{pendingPlacement ? 'Pending Placement' : 'Component Inspector'}</h2>
        <p>
          {pendingPlacement
            ? 'Edit the draft before you place it on the board.'
            : 'Family, variant, placement, and deterministic beam-domain controls for the selection.'}
        </p>
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

          <p className="inspector__description">{spec.description}</p>
          {spec.vendor || spec.sku ? (
            <p className="inspector__meta">
              {spec.vendor ?? 'Generic'}
              {spec.sku ? ` • ${spec.sku}` : ''}
            </p>
          ) : null}
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

        {inspectedComponent.type !== 'laser-source' &&
        inspectedComponent.type !== 'lens' &&
        strongestGaussianInteraction ? (
          <div className="inspector__subsection">
            <h3>Gaussian / Aperture</h3>

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
          </div>
        ) : null}

        {terminalCapture ? (
          <div className="inspector__subsection">
            <h3>Terminal Capture</h3>

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
          </div>
        ) : null}

        <div className="inspector__subsection">
          <h3>World Ports</h3>

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
        </div>

        <div className="inspector__subsection">
          <h3>Beam Interactions</h3>
          <InteractionTable events={beamEvents} />
        </div>

        {interactionNotice ? (
          <p className="inspector__notice">{interactionNotice}</p>
        ) : null}
      </div>
    </aside>
  )
}

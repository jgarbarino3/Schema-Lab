export const SCENE_DOCUMENT_KIND = 'schema-lab.scene'
export const SCENE_DOCUMENT_VERSION = 7 as const
export const PREVIOUS_SCENE_DOCUMENT_VERSION = 6 as const
export const STAGE2_SCENE_DOCUMENT_VERSION = 3 as const
export const LEGACY_SCENE_DOCUMENT_VERSION = 2 as const
export const STAGE1_SCENE_DOCUMENT_VERSION = 1 as const

export type SceneDocumentVersion = typeof SCENE_DOCUMENT_VERSION
export const SINGLE_BREADBOARD_SURFACE_ID = 'single-breadboard' as const
export const OPTICAL_TABLE_SURFACE_ID = 'optical-table' as const

export interface Vector2Mm {
  x: number
  y: number
}

export interface ScreenPointPx {
  x: number
  y: number
}

export interface CanvasSizePx {
  width: number
  height: number
}

export interface BoundsMm {
  x: number
  y: number
  width: number
  height: number
}

export interface SpectralWindowNm {
  minNm: number
  maxNm: number
}

export type QuarterTurn = 0 | 1 | 2 | 3
export type BreadboardFinish = 'black-anodized' | 'clear-anodized'
export type HoleDensity = 'single' | 'double'
export type CounterborePattern = 'none' | 'corner-25mm'
export type WorkspaceKind = 'single-breadboard' | 'optical-table'
export type SnapMode = 'always' | 'onDrop' | 'none'
export type CardinalDirection = 'north' | 'east' | 'south' | 'west'
export type PortKind = 'beam-input' | 'beam-output' | 'beam-bidirectional'
export type MountMode = 'hole-mounted' | 'clamp-capable' | 'external-source'
export type PlacementPhase = 'inspect' | 'drag' | 'drop'
export type PlacementStatus = 'valid' | 'snapped' | 'warning'
export type PlacementReason =
  | 'none'
  | 'off-hole'
  | 'support-outside-board'
  | 'footprint-overhang'
  | 'occupied'
  | 'snap-preview'
  | 'outside-source-lane'
export type ActiveTool = 'select' | 'pan' | 'line'

export interface AnnotationLine {
  id: string
  startMm: Vector2Mm
  endMm: Vector2Mm
  color: string
  strokeWidthMm: number
}
export type BeamFidelityMode = 'geometric' | 'angle-sensitive'
export type GaussianInputMode = 'derived' | 'explicit-waist'
export type RenderMode = 'realistic' | 'simple'
export type ToolbarMenu = 'import' | 'export' | 'beam'
export type WorkspaceSurfaceKind = 'breadboard' | 'optical-table'
export type SourcePresetId =
  | 'ti-sapphire'
  | 'libra'
  | 'pharos'
  | 'clark-ti-sapphire'
  | 'opa-visible-passband'
  | 'opa-visible-broadband'
export type PolarizationPresetId =
  | 'linear-in-plane'
  | 'linear-out-of-plane'
  | 'circular-right'
  | 'circular-left'
  | 'elliptical'
export type SourceLane = 'left' | 'right' | 'top' | 'bottom'
export type BboInteractionMode = 'estimated' | 'advanced'
export type FilterMode = 'longpass' | 'shortpass' | 'bandpass'
export type BeamInteractionKind =
  | 'source'
  | 'mirror'
  | 'curved-mirror'
  | 'beamsplitter'
  | 'lens'
  | 'filter'
  | 'attenuator'
  | 'polarizer'
  | 'waveplate'
  | 'iris'
  | 'bbo'
  | 'delay-line'
  | 'telescope'
  | 'opa-white-light'
  | 'opa-combiner'
  | 'opa-gain'
  | 'relay'
  | 'pass-through'
  | 'terminal'
  | 'none'
export type BeamBranchKind =
  | 'root'
  | 'continued'
  | 'reflected'
  | 'transmitted'
  | 'generated-shg'
export type BeamAttenuationClass =
  | 'normal'
  | 'attenuated'
  | 'clipped'
  | 'blocked'
  | 'low-power'
export type BeamOutcomeClass =
  | 'reflected'
  | 'transmitted'
  | 'generated-shg'
  | 'attenuated'
  | 'clipped'
  | 'blocked'
  | 'escaped'
  | 'low-power'
export type BeamContentTag = 'fundamental' | 'shg' | 'mixed'
export type FilterTransmissionClass = 'passband' | 'partial' | 'stopband'
export type GaussianApertureStatus = 'clear' | 'near-limit' | 'overfill'
export type SceneWarningCategory = 'mechanical' | 'optical'
export type SceneWarningSeverity = 'warning' | 'critical'
export type SceneWarningTier = 'simple' | 'advanced'

export interface WarningHighlightTarget {
  componentIds?: string[]
  interactionIds?: string[]
  pathIds?: string[]
  sourceComponentIds?: string[]
}

export type ComponentType =
  | 'laser-source'
  | 'optic-mount'
  | 'support-hardware'
  | 'mirror'
  | 'curved-mirror'
  | 'beamsplitter'
  | 'lens'
  | 'filter'
  | 'attenuator'
  | 'polarizer'
  | 'waveplate'
  | 'iris'
  | 'bbo-crystal'
  | 'telescope'
  | 'opa-module'
  | 'sample-stage'
  | 'fiber-coupler'
  | 'spectrometer'
  | 'detector'
  | 'beam-dump'

export type ComponentCategory =
  | 'source'
  | 'steering'
  | 'splitting'
  | 'attenuation'
  | 'focusing'
  | 'conditioning'
  | 'aperture'
  | 'nonlinear'
  | 'sample'
  | 'coupling'
  | 'measurement'
  | 'termination'
  | 'mounting'

export type ComponentGlyph =
  | 'laser'
  | 'mount'
  | 'support'
  | 'mirror'
  | 'curved-mirror'
  | 'beamsplitter'
  | 'lens'
  | 'filter'
  | 'attenuator'
  | 'polarizer'
  | 'waveplate'
  | 'iris'
  | 'bbo'
  | 'telescope'
  | 'opa'
  | 'sample'
  | 'fiber'
  | 'spectrometer'
  | 'detector'
  | 'beam-dump'

export type ComponentFootprintShape = 'rect' | 'circle' | 'diamond' | 'capsule'

export interface BreadboardModel {
  label: string
  widthMm: number
  heightMm: number
  holeSpacingMm: number
  edgeMarginMm: number
  thicknessMm: number
  finish: BreadboardFinish
  holeDensity: HoleDensity
  counterborePattern: CounterborePattern
  presetId?: string
}

export interface OpticalTableModel {
  label: string
  widthMm: number
  heightMm: number
  holeSpacingMm: number
  edgeMarginMm: number
  thicknessMm: number
  finish: 'silver'
  holeDensity: HoleDensity
  counterborePattern: CounterborePattern
}

export interface BreadboardInstance {
  id: string
  label: string
  model: BreadboardModel
  anchorMm: Vector2Mm
  rotationQuarterTurns: QuarterTurn
}

export interface SingleBreadboardWorkspace {
  kind: 'single-breadboard'
  breadboard: BreadboardModel
}

export interface OpticalTableWorkspace {
  kind: 'optical-table'
  table: OpticalTableModel
  breadboards: BreadboardInstance[]
}

export type WorkspaceModel = SingleBreadboardWorkspace | OpticalTableWorkspace

export interface SceneBeamSettings {
  beamFidelityMode: BeamFidelityMode
  sharedBeamHeightMm: number
  defaultBeamDiameterMm: number
  defaultDivergenceMrad: number
}

export interface PortDefinition {
  id: string
  label: string
  kind: PortKind
  positionMm: Vector2Mm
  direction: CardinalDirection
}

export interface ComponentRenderHint {
  shape: ComponentFootprintShape
  fill: string
  stroke: string
  glyph: ComponentGlyph
}

export type RealisticVisualFamily =
  | 'mirror'
  | 'beamsplitter'
  | 'lens'
  | 'filter'
  | 'iris'
  | 'detector'
  | 'laser-source'

export type RealisticVisualFinish =
  | 'graphite'
  | 'cool-metal'
  | 'warm-metal'
  | 'rose-metal'
  | 'teal-anodized'
  | 'silver-machined'

export type RealisticMountVisual =
  | 'kinematic-round'
  | 'iris-body'
  | 'sensor-disc'
  | 'none'

export interface RealisticVisualPreset {
  family: RealisticVisualFamily
  finish: RealisticVisualFinish
  mountVisual: RealisticMountVisual
  glassTint?: string
  accentFill?: string
  accentStroke?: string
}

export interface ComponentRecommendedHardware {
  mount?: string
  post?: string
  clamp?: string
}

export interface ComponentMount {
  mode: MountMode
  supportBoundsMm: BoundsMm
}

export interface BeamPhysicsBase {
  kind: BeamInteractionKind
  opticalApertureMm?: number
}

export interface SourceBeamPhysics extends BeamPhysicsBase {
  kind: 'source'
  supportedWavelengthNm: SpectralWindowNm
}

export interface MirrorBeamPhysics extends BeamPhysicsBase {
  kind: 'mirror'
  supportedWavelengthNm: SpectralWindowNm
  reflectivityPercent: number
  designIncidenceDeg: number
  absorptionPercent: number
}

export interface CurvedMirrorBeamPhysics extends BeamPhysicsBase {
  kind: 'curved-mirror'
  supportedWavelengthNm: SpectralWindowNm
  reflectivityPercent: number
  designIncidenceDeg: number
  absorptionPercent: number
  defaultRadiusOfCurvatureMm: number
  isConvex: boolean
}

export interface BeamsplitterBeamPhysics extends BeamPhysicsBase {
  kind: 'beamsplitter'
  supportedWavelengthNm: SpectralWindowNm
  designIncidenceDeg: number
  designWavelengthNm: number
  defaultReflectPercent: number
  defaultLossPercent: number
  sReflectBiasPercent: number
  pReflectBiasPercent: number
}

export interface FilterBeamPhysics extends BeamPhysicsBase {
  kind: 'filter'
  filterMode: FilterMode
  peakTransmissionPercent: number
  stopbandTransmissionPercent: number
  cutoffNm?: number
  centerNm?: number
  fwhmNm?: number
}

export interface AttenuatorBeamPhysics extends BeamPhysicsBase {
  kind: 'attenuator'
  transmissionPercent: number
  supportedWavelengthNm?: SpectralWindowNm
  orientation: 'horizontal' | 'vertical'
}

export interface PolarizerBeamPhysics extends BeamPhysicsBase {
  kind: 'polarizer'
  transmissionPercent: number
  extinctionRatio: number
  supportedWavelengthNm?: SpectralWindowNm
}

export interface WaveplateBeamPhysics extends BeamPhysicsBase {
  kind: 'waveplate'
  transmissionPercent: number
  supportedWavelengthNm?: SpectralWindowNm
  defaultRetardanceDeg: number
}

export interface IrisBeamPhysics extends BeamPhysicsBase {
  kind: 'iris'
  maxApertureMm: number
  defaultApertureMm: number
}

export interface BboBeamPhysics extends BeamPhysicsBase {
  kind: 'bbo'
  crystalType: 'type-i'
  supportedFundamentalNm: SpectralWindowNm
  defaultThicknessUm: number
  defaultPhaseMatchingAngleDeg: number
}

export interface PassThroughBeamPhysics extends BeamPhysicsBase {
  kind: 'pass-through'
  supportedWavelengthNm?: SpectralWindowNm
  transmissionPercent: number
}

export interface LensBeamPhysics extends BeamPhysicsBase {
  kind: 'lens'
  supportedWavelengthNm: SpectralWindowNm
  transmissionPercent: number
  defaultFocalLengthMm: number
  defaultClearApertureMm: number
}

export interface DelayLineBeamPhysics extends BeamPhysicsBase {
  kind: 'delay-line'
  transmissionPercent: number
  supportedWavelengthNm?: SpectralWindowNm
  defaultTravelMm: number
  relayRole: 'manual-stage' | 'motorized-stage' | 'periscope'
}

export interface TelescopeBeamPhysics extends BeamPhysicsBase {
  kind: 'telescope'
  transmissionPercent: number
  supportedWavelengthNm?: SpectralWindowNm
  mode: 'transmission' | 'reflection'
  defaultElement1Mm: number
  defaultElement2Mm: number
  defaultSeparationMm: number
  defaultClearApertureMm: number
}

export interface OpaWhiteLightBeamPhysics extends BeamPhysicsBase {
  kind: 'opa-white-light'
  transmissionPercent: number
  supportedWavelengthNm?: SpectralWindowNm
  defaultOutputWavelengthNm: number
  defaultOutputBandwidthNm: number
  defaultConversionEfficiencyPercent: number
}

export interface OpaCombinerBeamPhysics extends BeamPhysicsBase {
  kind: 'opa-combiner'
  transmissionPercent: number
  supportedWavelengthNm?: SpectralWindowNm
}

export interface OpaGainBeamPhysics extends BeamPhysicsBase {
  kind: 'opa-gain'
  transmissionPercent: number
  supportedWavelengthNm?: SpectralWindowNm
  defaultSignalWavelengthNm: number
  defaultIdlerWavelengthNm: number
  defaultBandwidthNm: number
  defaultConversionEfficiencyPercent: number
}

export interface RelayBeamPhysics extends BeamPhysicsBase {
  kind: 'relay'
  transmissionPercent: number
  supportedWavelengthNm?: SpectralWindowNm
}

export interface TerminalBeamPhysics extends BeamPhysicsBase {
  kind: 'terminal'
  role: 'beam-dump' | 'detector' | 'spectrometer' | 'fiber-coupler'
  transmissionPercent: number
}

export interface NoneBeamPhysics extends BeamPhysicsBase {
  kind: 'none'
}

export type ComponentBeamPhysics =
  | SourceBeamPhysics
  | MirrorBeamPhysics
  | CurvedMirrorBeamPhysics
  | BeamsplitterBeamPhysics
  | LensBeamPhysics
  | FilterBeamPhysics
  | AttenuatorBeamPhysics
  | PolarizerBeamPhysics
  | WaveplateBeamPhysics
  | IrisBeamPhysics
  | BboBeamPhysics
  | DelayLineBeamPhysics
  | TelescopeBeamPhysics
  | OpaWhiteLightBeamPhysics
  | OpaCombinerBeamPhysics
  | OpaGainBeamPhysics
  | RelayBeamPhysics
  | PassThroughBeamPhysics
  | TerminalBeamPhysics
  | NoneBeamPhysics

export interface ComponentVariant {
  id: string
  label: string
  vendor?: string
  sku?: string
  description: string
  footprintBoundsMm?: BoundsMm
  visualBodyBoundsMm?: BoundsMm
  mountVisualBoundsMm?: BoundsMm
  hitBoundsMm?: BoundsMm
  mount?: ComponentMount
  opticalCenterMm?: Vector2Mm
  ports?: PortDefinition[]
  renderHint?: Partial<ComponentRenderHint>
  mountRenderHint?: Partial<ComponentRenderHint>
  realisticVisualPreset?: Partial<RealisticVisualPreset>
  physics?: ComponentBeamPhysics
  recommendedHardware?: ComponentRecommendedHardware
}

export interface ComponentDefinition {
  type: ComponentType
  category: ComponentCategory
  defaultLabel: string
  familyLabel: string
  defaultVariantId: string
  footprintBoundsMm: BoundsMm
  visualBodyBoundsMm?: BoundsMm
  hitBoundsMm?: BoundsMm
  mountVisualBoundsMm?: BoundsMm
  mount: ComponentMount
  opticalCenterMm?: Vector2Mm
  ports: PortDefinition[]
  renderHint: ComponentRenderHint
  mountRenderHint?: ComponentRenderHint
  realisticVisualPreset?: RealisticVisualPreset
  physics: ComponentBeamPhysics
  variants: ComponentVariant[]
  recommendedHardware?: ComponentRecommendedHardware
}

export interface SourceConfig {
  isEnabled: boolean
  presetId: SourcePresetId
  lane: SourceLane
  firstTargetComponentId?: string
  wavelengthNm: number
  bandwidthNm: number
  powerMw: number
  normalizedPowerPercent: number
  beamDiameterMm: number
  divergenceMrad: number
  gaussianInputMode: GaussianInputMode
  waistRadiusMm?: number
  waistOffsetMm?: number
  polarization: PolarizationConfig
}

export interface ComponentSupportConfig {
  includeMount: boolean
}

export interface LensConfig {
  focalLengthMm: number
  clearApertureMm: number
}

export interface BeamSplitterConfig {
  reflectPercent: number
  lossPercent: number
}

export interface IrisConfig {
  apertureMm: number
}

export interface CurvedMirrorConfig {
  radiusOfCurvatureMm: number
  isConvex: boolean
}

export interface PolarizerConfig {
  axisLocalDeg: number
  extinctionRatio: number
  insertionLossPercent: number
}

export interface WaveplateConfig {
  kind: 'quarter' | 'half' | 'custom'
  axisLocalDeg: number
  retardanceDeg: number
  insertionLossPercent: number
}

export interface DelayLineConfig {
  positionMm: number
  travelMm: number
  topology: 'single-pass' | 'double-pass'
  zeroDelayOffsetFs: number
}

export interface TelescopeConfig {
  mode: 'transmission' | 'reflection'
  element1Mm: number
  element2Mm: number
  separationMm: number
  clearApertureMm: number
}

export interface OpaInputLink {
  sourceComponentId?: string
  pathId?: string
}

export interface OpaConfig {
  role: 'white-light' | 'combiner' | 'gain'
  pumpLink?: OpaInputLink
  seedLink?: OpaInputLink
  signalLink?: OpaInputLink
  outputMode?: 'signal' | 'idler' | 'signal+idler'
  targetWavelengthNm?: number
  outputBandwidthNm?: number
  conversionEfficiencyPercent?: number
  bandwidthScale?: number
  pumpDepletionPercent?: number
  signalWavelengthNm?: number
  idlerWavelengthNm?: number
}

export interface BboCrystalConfig {
  crystalType: 'type-i'
  interactionMode: BboInteractionMode
  thicknessUm: number
  phaseMatchingAngleDeg: number
  polarizationAxisLocalDeg: number
}

export interface PolarizationConfig {
  basis: 'ray-local'
  presetId: PolarizationPresetId
  inPlaneAmplitude: number
  outOfPlaneAmplitude: number
  relativePhaseDeg: number
}

export interface PolarizationSnapshot extends PolarizationConfig {
  inPlaneFraction: number
  outOfPlaneFraction: number
  dominantAxis: 'in-plane' | 'out-of-plane' | 'balanced'
  tag: string
}

export interface ComponentConfig {
  source?: SourceConfig
  beamSplitter?: BeamSplitterConfig
  lens?: LensConfig
  curvedMirror?: CurvedMirrorConfig
  attenuator?: {
    transmissionPercent: number
    orientation: 'horizontal' | 'vertical'
  }
  polarizer?: PolarizerConfig
  waveplate?: WaveplateConfig
  iris?: IrisConfig
  bboCrystal?: BboCrystalConfig
  delayLine?: DelayLineConfig
  telescope?: TelescopeConfig
  opa?: OpaConfig
  support?: ComponentSupportConfig
}

export interface ComponentInstance {
  id: string
  type: ComponentType
  label: string
  variantId: string
  anchorMm: Vector2Mm
  hostSurfaceId?: string
  rotationQuarterTurns: QuarterTurn
  geometryOverride?: {
    widthMm?: number
    heightMm?: number
  }
  config: ComponentConfig
}

export interface SceneDocument {
  kind: typeof SCENE_DOCUMENT_KIND
  version: SceneDocumentVersion
  metadata: {
    name: string
  }
  workspace: WorkspaceModel
  beamSettings: SceneBeamSettings
  components: ComponentInstance[]
  annotations: AnnotationLine[]
}

export interface ViewportState {
  zoomPxPerMm: number
  cameraCenterMm: Vector2Mm
  canvasSizePx: CanvasSizePx
}

export interface ResolvedComponentSpec {
  type: ComponentType
  category: ComponentCategory
  familyLabel: string
  defaultLabel: string
  variantId: string
  variantLabel: string
  vendor?: string
  sku?: string
  description: string
  footprintBoundsMm: BoundsMm
  visualBodyBoundsMm: BoundsMm
  hitBoundsMm: BoundsMm
  mountVisualBoundsMm?: BoundsMm
  mount: ComponentMount
  opticalCenterMm?: Vector2Mm
  ports: PortDefinition[]
  renderHint: ComponentRenderHint
  mountRenderHint?: ComponentRenderHint
  realisticVisualPreset?: RealisticVisualPreset
  physics: ComponentBeamPhysics
  recommendedHardware?: ComponentRecommendedHardware
}

export interface PendingPlacementState {
  draft: ComponentInstance
  candidateAnchorMm: Vector2Mm
}

export interface PendingBreadboardPlacementState {
  presetId: string
  label: string
  model: BreadboardModel
  candidateAnchorMm: Vector2Mm
  rotationQuarterTurns: QuarterTurn
}

export interface SceneWarning {
  id: string
  category: SceneWarningCategory
  severity: SceneWarningSeverity
  tier: SceneWarningTier
  message: string
  componentId?: string
  pathId?: string
  interactionId?: string
  sourceComponentId?: string
  highlightTarget?: WarningHighlightTarget
}

export interface WorkspaceSurfaceSummary {
  id: string
  kind: WorkspaceSurfaceKind
  label: string
}

export interface WorldPort extends PortDefinition {
  worldPositionMm: Vector2Mm
  worldDirection: CardinalDirection
}

export interface PlacementResult {
  candidateAnchorMm: Vector2Mm
  resolvedAnchorMm: Vector2Mm
  nearestHoleMm: Vector2Mm
  snappedHoleMm?: Vector2Mm
  snapPreviewHoleMm?: Vector2Mm
  distanceToNearestHoleMm: number
  status: PlacementStatus
  reason: PlacementReason
  isOnHole: boolean
  isMountSupported: boolean
  isFootprintInsideBoard: boolean
  isOccupied: boolean
  sourceLane?: SourceLane
  footprintBoundsMm: BoundsMm
  supportBoundsMm: BoundsMm
}

export interface SourcePresetDefinition {
  id: SourcePresetId
  label: string
  description: string
  wavelengthNm: number
  bandwidthNm: number
  powerMw: number
  beamDiameterMm: number
  divergenceMrad: number
  supportedWavelengthNm: SpectralWindowNm
}

export interface BeamSegment {
  id: string
  beamId: string
  pathId: string
  sourceComponentId: string
  startMm: Vector2Mm
  endMm: Vector2Mm
  directionMm: Vector2Mm
  wavelengthNm: number
  bandwidthNm: number
  powerMw: number
  powerPercent: number
  beamDiameterMm: number
  generation: number
  status: 'escaped' | 'terminated' | 'blocked' | 'propagated'
  pathRole: 'fundamental' | 'shg'
  branchKind: BeamBranchKind
  attenuationClass: BeamAttenuationClass
  outcomeClass: BeamOutcomeClass
  polarization: PolarizationSnapshot
  parentEventId?: string
  parentInteractionId?: string
  geometricLengthMm: number
  internalOpticalPathMm: number
  effectiveOpticalLengthMm: number
  opticalPathMm: number
  timeDelayFs: number
}

export interface BeamBranchResult {
  beamId: string
  pathId: string
  branchKind: BeamBranchKind
  outcomeClass: BeamOutcomeClass
  pathRole: 'fundamental' | 'shg'
  powerMw: number
  powerPercent: number
  wavelengthNm: number
}

export interface BeamInteractionEvent {
  id: string
  pathId: string
  inputBeamId: string
  inputSegmentId: string
  sourceComponentId: string
  sourceLabel: string
  componentId: string
  componentType: ComponentType
  componentLabel: string
  hitPointMm: Vector2Mm
  incidenceAngleDeg: number
  interactionKind:
    | 'reflection'
    | 'split'
    | 'transmission'
    | 'terminal'
    | 'blocked'
    | 'shg'
  physicsKind: BeamInteractionKind
  outcomeClass: BeamOutcomeClass
  incomingPowerMw: number
  reflectedPowerMw?: number
  transmittedPowerMw?: number
  generatedPowerMw?: number
  lostPowerMw?: number
  wavelengthNm: number
  bandwidthNm: number
  outputWavelengthNm?: number
  branchResults: BeamBranchResult[]
  polarization: PolarizationSnapshot
  filterTransmissionClass?: FilterTransmissionClass
  capturedPowerMw?: number
  acceptanceFraction: number
  wasClipped: boolean
  partialAcceptance: boolean
  outputPolarization?: PolarizationSnapshot
  geometricLengthMm: number
  internalOpticalPathMm: number
  opticalPathMm: number
  timeDelayFs: number
  note?: string
}

export interface BeamSourceSummary {
  sourceComponentId: string
  sourceLabel: string
  wavelengthNm: number
  bandwidthNm: number
  powerMw: number
  generatedShgPowerMw: number
  terminalCount: number
  polarizationTag: string
}

export interface BeamPathSummary {
  pathId: string
  sourceComponentId: string
  sourceLabel: string
  wavelengthNm: number
  bandwidthNm: number
  startPowerMw: number
  finalPowerMw: number
  pathRole: 'fundamental' | 'shg'
  branchKind: BeamBranchKind
  segmentIds: string[]
  interactionIds: string[]
  outcomeClass: BeamOutcomeClass
  totalOpticalPathMm: number
  finalTimeDelayFs: number
}

export interface TerminalCaptureHit {
  interactionId: string
  pathId: string
  sourceComponentId: string
  sourceLabel: string
  beamId: string
  wavelengthNm: number
  bandwidthNm: number
  powerMw: number
  powerPercent: number
  contentTag: BeamContentTag
  polarizationTag: string
  note?: string
}

export interface TerminalCaptureSummary {
  componentId: string
  componentLabel: string
  componentType: ComponentType
  role: 'beam-dump' | 'detector' | 'spectrometer' | 'fiber-coupler'
  totalCapturedPowerMw: number
  fundamentalCapturedPowerMw: number
  shgCapturedPowerMw: number
  mixedContent: boolean
  hits: TerminalCaptureHit[]
}

export interface OpticInteractionSummary {
  componentId: string
  componentLabel: string
  componentType: ComponentType
  interactions: BeamInteractionEvent[]
}

export interface BeamTraceResult {
  segments: BeamSegment[]
  events: BeamInteractionEvent[]
  summaries: BeamSourceSummary[]
  pathSummaries: BeamPathSummary[]
  terminalCaptures: TerminalCaptureSummary[]
  opticInteractionSummaries: OpticInteractionSummary[]
}

export interface ComplexQMm {
  realMm: number
  imagMm: number
}

export interface GaussianLocalReadout {
  wavelengthNm: number
  q: ComplexQMm
  spotRadiusMm: number
  beamDiameterMm: number
  waistRadiusMm: number
  waistOffsetMm: number
  rayleighRangeMm: number
  radiusOfCurvatureMm?: number
}

export interface GaussianSourceSummary {
  sourceComponentId: string
  sourceLabel: string
  inputMode: GaussianInputMode
  launch: GaussianLocalReadout
  warning?: string
}

export interface GaussianSegmentAnalysis {
  segmentId: string
  pathId: string
  sourceComponentId: string
  lengthMm: number
  geometricLengthMm: number
  internalOpticalPathMm: number
  effectiveOpticalLengthMm: number
  startDistanceMm: number
  endDistanceMm: number
  startTimeDelayFs: number
  endTimeDelayFs: number
  start: GaussianLocalReadout
  end: GaussianLocalReadout
}

export interface GaussianInteractionAnalysis {
  interactionId: string
  pathId: string
  componentId: string
  componentLabel: string
  componentType: ComponentType
  pathRole: 'fundamental' | 'shg'
  branchKind: BeamBranchKind
  hitDistanceMm: number
  timeDelayFs: number
  local: GaussianLocalReadout
  outputLocal?: GaussianLocalReadout
  apertureMm?: number
  apertureStatus?: GaussianApertureStatus
  note?: string
}

export interface GaussianPathAnalysis {
  pathId: string
  sourceComponentId: string
  sourceLabel: string
  pathRole: 'fundamental' | 'shg'
  wavelengthNm: number
  launch: GaussianLocalReadout
  final: GaussianLocalReadout
  segmentIds: string[]
  interactionIds: string[]
  totalOpticalPathMm: number
  finalTimeDelayFs: number
}

export interface GaussianComponentWarning {
  componentId: string
  componentLabel: string
  componentType: ComponentType
  strongestStatus: GaussianApertureStatus
  interactions: GaussianInteractionAnalysis[]
}

export interface GaussianTraceResult {
  sources: GaussianSourceSummary[]
  pathAnalyses: GaussianPathAnalysis[]
  segmentAnalyses: GaussianSegmentAnalysis[]
  interactionAnalyses: GaussianInteractionAnalysis[]
  componentWarnings: GaussianComponentWarning[]
}

export interface GaussianPathTableRow {
  id: string
  apertureStatus?: GaussianApertureStatus
  beamDiameterMm: number
  curvatureMm?: number
  kind: 'segment' | 'interaction'
  label: string
  rayleighRangeMm: number
  spotRadiusMm: number
  waistOffsetMm: number
  waistRadiusMm: number
  zPositionMm: number
  timeDelayFs: number
}

export interface GaussianWaistMarker {
  pathId: string
  pointMm: Vector2Mm
  segmentId: string
  waistRadiusMm: number
  zPositionMm: number
}

export interface BboDerivedMetrics {
  idealPhaseMatchingAngleDeg: number
  angularDetuningDeg: number
  angularAcceptanceDeg: number
  acceptanceBandwidthNm: number
  estimatedEfficiencyPercent: number
  fundamentalTransmissionPercent: number
  shgWavelengthNm: number
}

export interface BboPolarizationSummary {
  axisLocalDeg: number
  compatibilityPercent: number
  dominantContribution: 'in-plane' | 'out-of-plane'
  explanation: string
}

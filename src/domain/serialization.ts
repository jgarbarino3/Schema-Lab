import {
  clampAnnotationFontSizeMm,
  DEFAULT_ANNOTATION_TEXT_STYLE,
  normalizeRectLikeBounds,
} from './annotations'
import { findBreadboardPresetId } from './breadboardPresets'
import { createDefaultPolarizationConfig } from './polarization'
import {
  createFreshSingleBreadboardWorkspace,
} from './workspace'
import {
  COMPONENT_DEFINITIONS_BY_TYPE,
  createDefaultComponentConfig,
  getComponentDefinition,
} from './componentCatalog'
import type {
  AnnotationLine,
  AnnotationShapeKind,
  AnnotationText,
  AnnotationTextStyle,
  SceneAnnotation,
  ShapeAnnotation,
  BreadboardFinish,
  BreadboardModel,
  BreadboardInstance,
  ComponentConfig,
  ComponentInstance,
  ComponentType,
  CounterborePattern,
  HoleDensity,
  OpticalTableModel,
  QuarterTurn,
  SceneBeamSettings,
  SceneDocument,
  PolarizationPresetId,
  SourceLane,
  Vector2Mm,
  WorkspaceModel,
} from './types'
import {
  LEGACY_SCENE_DOCUMENT_VERSION,
  PREVIOUS_SCENE_DOCUMENT_VERSION,
  SCENE_DOCUMENT_KIND,
  SCENE_DOCUMENT_VERSION,
  STAGE1_SCENE_DOCUMENT_VERSION,
  STAGE2_SCENE_DOCUMENT_VERSION,
  WORKSPACE_SCENE_DOCUMENT_VERSION,
} from './types'

const BREADBOARD_FINISH_VALUES: BreadboardFinish[] = [
  'black-anodized',
  'clear-anodized',
]
const HOLE_DENSITY_VALUES: HoleDensity[] = ['single', 'double']
const COUNTERBORE_PATTERN_VALUES: CounterborePattern[] = ['none', 'corner-25mm']
const SOURCE_LANE_VALUES: SourceLane[] = ['left', 'right', 'top', 'bottom']
const SOURCE_PRESET_VALUES = [
  'ti-sapphire',
  'libra',
  'pharos',
  'clark-ti-sapphire',
  'opa-visible-passband',
  'opa-visible-broadband',
] as const
const POLARIZATION_PRESET_VALUES: PolarizationPresetId[] = [
  'linear-in-plane',
  'linear-out-of-plane',
  'circular-right',
  'circular-left',
  'elliptical',
]
const GAUSSIAN_INPUT_MODE_VALUES = ['derived', 'explicit-waist'] as const
const DELAY_LINE_TOPOLOGY_VALUES = ['single-pass', 'double-pass'] as const
const WAVEPLATE_KIND_VALUES = ['quarter', 'half', 'custom'] as const
const TELESCOPE_MODE_VALUES = ['transmission', 'reflection'] as const
const OPA_ROLE_VALUES = ['white-light', 'combiner', 'gain'] as const
const OPA_OUTPUT_MODE_VALUES = ['signal', 'idler', 'signal+idler'] as const

const ANNOTATION_FONT_FAMILY_VALUES = [
  'clean-sans',
  'serif',
  'mono',
  'soft-display',
] as const
const ANNOTATION_TEXT_ALIGN_VALUES = ['left', 'center', 'right'] as const
const ANNOTATION_SHAPE_KIND_VALUES: AnnotationShapeKind[] = [
  'rectangle',
  'ellipse',
  'arrow',
]
const DEFAULT_BEAM_SETTINGS: SceneBeamSettings = {
  beamFidelityMode: 'geometric',
  sharedBeamHeightMm: 75,
  defaultBeamDiameterMm: 2.5,
  defaultDivergenceMrad: 1.1,
}

function cloneBeamSettings(settings: SceneBeamSettings = DEFAULT_BEAM_SETTINGS): SceneBeamSettings {
  return {
    ...settings,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function expectString(record: Record<string, unknown>, key: string) {
  const value = record[key]

  if (typeof value !== 'string') {
    throw new Error(`${key} must be a string.`)
  }

  return value
}

function expectNumber(record: Record<string, unknown>, key: string) {
  const value = record[key]

  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${key} must be a number.`)
  }

  return value
}

function expectEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  validValues: T[],
): T {
  const value = record[key]

  if (typeof value !== 'string' || !validValues.includes(value as T)) {
    throw new Error(`${key} must be one of: ${validValues.join(', ')}.`)
  }

  return value as T
}

function expectVector2(record: Record<string, unknown>, key: string): Vector2Mm {
  const value = record[key]

  if (!isRecord(value)) {
    throw new Error(`${key} must be an object with x and y.`)
  }

  return {
    x: expectNumber(value, 'x'),
    y: expectNumber(value, 'y'),
  }
}

function parseQuarterTurn(value: number): QuarterTurn {
  if (!Number.isInteger(value) || value < 0 || value > 3) {
    throw new Error('rotationQuarterTurns must be an integer between 0 and 3.')
  }

  return value as QuarterTurn
}

function parseBreadboard(value: unknown): BreadboardModel {
  if (!isRecord(value)) {
    throw new Error('breadboard must be an object.')
  }

  const breadboard: BreadboardModel = {
    label: expectString(value, 'label'),
    widthMm: expectNumber(value, 'widthMm'),
    heightMm: expectNumber(value, 'heightMm'),
    holeSpacingMm: expectNumber(value, 'holeSpacingMm'),
    edgeMarginMm: expectNumber(value, 'edgeMarginMm'),
    thicknessMm: expectNumber(value, 'thicknessMm'),
    finish: expectEnum(value, 'finish', BREADBOARD_FINISH_VALUES),
    holeDensity: expectEnum(value, 'holeDensity', HOLE_DENSITY_VALUES),
    counterborePattern: expectEnum(
      value,
      'counterborePattern',
      COUNTERBORE_PATTERN_VALUES,
    ),
    presetId: typeof value.presetId === 'string' ? value.presetId : undefined,
  }

  return {
    ...breadboard,
    presetId: findBreadboardPresetId(breadboard),
  }
}

function parseOpticalTable(value: unknown): OpticalTableModel {
  if (!isRecord(value)) {
    throw new Error('workspace.table must be an object.')
  }

  return {
    label: expectString(value, 'label'),
    widthMm: expectNumber(value, 'widthMm'),
    heightMm: expectNumber(value, 'heightMm'),
    holeSpacingMm: expectNumber(value, 'holeSpacingMm'),
    edgeMarginMm: expectNumber(value, 'edgeMarginMm'),
    thicknessMm: expectNumber(value, 'thicknessMm'),
    finish: 'silver',
    holeDensity: expectEnum(value, 'holeDensity', HOLE_DENSITY_VALUES),
    counterborePattern: expectEnum(
      value,
      'counterborePattern',
      COUNTERBORE_PATTERN_VALUES,
    ),
  }
}

function parseBreadboardInstance(value: unknown): BreadboardInstance {
  if (!isRecord(value)) {
    throw new Error('workspace.breadboards entries must be objects.')
  }

  const model = parseBreadboard(value.model)

  return {
    id: expectString(value, 'id'),
    label: expectString(value, 'label'),
    model,
    anchorMm: expectVector2(value, 'anchorMm'),
    rotationQuarterTurns: parseQuarterTurn(
      typeof value.rotationQuarterTurns === 'number'
        ? value.rotationQuarterTurns
        : 0,
    ),
    mountPlaneOffsetMm:
      typeof value.mountPlaneOffsetMm === 'number'
        ? expectNumber(value, 'mountPlaneOffsetMm')
        : model.thicknessMm,
  }
}

function parseWorkspace(
  parsedValue: Record<string, unknown>,
  version: number,
): WorkspaceModel {
  if (
    version === WORKSPACE_SCENE_DOCUMENT_VERSION ||
    version === STAGE2_SCENE_DOCUMENT_VERSION ||
    version === LEGACY_SCENE_DOCUMENT_VERSION ||
    version === STAGE1_SCENE_DOCUMENT_VERSION
  ) {
    return {
      kind: 'single-breadboard',
      breadboard: parseBreadboard(parsedValue.breadboard),
    }
  }

  const workspaceValue = parsedValue.workspace

  if (!isRecord(workspaceValue)) {
    throw new Error('workspace must be an object.')
  }

  const kind = expectEnum(workspaceValue, 'kind', [
    'single-breadboard',
    'optical-table',
  ])

  if (kind === 'single-breadboard') {
    return {
      kind,
      breadboard: parseBreadboard(workspaceValue.breadboard),
    }
  }

  const breadboardsValue = workspaceValue.breadboards

  if (!Array.isArray(breadboardsValue)) {
    throw new Error('workspace.breadboards must be an array.')
  }

  return {
    kind,
    table: parseOpticalTable(workspaceValue.table),
    breadboards: breadboardsValue.map((item) => parseBreadboardInstance(item)),
  }
}

function migrateLegacyType(type: string) {
  switch (type) {
    case 'edge-clamp':
      return {
        type: 'support-hardware' as const,
        variantId: 'cf125c-m',
      }
    case 'fork-clamp':
      return {
        type: 'support-hardware' as const,
        variantId: 'cf175c-m',
      }
    case 'right-angle-clamp':
      return {
        type: 'optic-mount' as const,
        variantId: 'rsp1-m',
      }
    case 'post-holder-support':
      return {
        type: 'support-hardware' as const,
        variantId: 'rsht1-5-m',
      }
    default:
      return {
        type: type as ComponentType,
        variantId: getComponentDefinition(type as ComponentType).defaultVariantId,
      }
  }
}

function parseSourceConfig(value: unknown, type: ComponentType) {
  if (!isRecord(value) || type !== 'laser-source') {
    return undefined
  }

  const polarizationValue = isRecord(value.polarization) ? value.polarization : undefined
  const defaultPolarization = createDefaultPolarizationConfig()

  return {
    isEnabled: typeof value.isEnabled === 'boolean' ? value.isEnabled : false,
    presetId:
      typeof value.presetId === 'string'
        ? expectEnum(value, 'presetId', [...SOURCE_PRESET_VALUES])
        : 'ti-sapphire',
    lane: expectEnum(value, 'lane', SOURCE_LANE_VALUES),
    firstTargetComponentId:
      typeof value.firstTargetComponentId === 'string'
        ? value.firstTargetComponentId
        : undefined,
    wavelengthNm: expectNumber(value, 'wavelengthNm'),
    bandwidthNm: expectNumber(value, 'bandwidthNm'),
    powerMw: expectNumber(value, 'powerMw'),
    normalizedPowerPercent: expectNumber(value, 'normalizedPowerPercent'),
    beamDiameterMm: expectNumber(value, 'beamDiameterMm'),
    divergenceMrad: expectNumber(value, 'divergenceMrad'),
    gaussianInputMode:
      typeof value.gaussianInputMode === 'string'
        ? expectEnum(value, 'gaussianInputMode', [...GAUSSIAN_INPUT_MODE_VALUES])
        : 'derived',
    waistRadiusMm:
      typeof value.waistRadiusMm === 'number'
        ? expectNumber(value, 'waistRadiusMm')
        : undefined,
    waistOffsetMm:
      typeof value.waistOffsetMm === 'number'
        ? expectNumber(value, 'waistOffsetMm')
        : undefined,
    polarization: {
      basis: 'ray-local' as const,
      presetId:
        polarizationValue && typeof polarizationValue.presetId === 'string'
          ? expectEnum(
              polarizationValue,
              'presetId',
              POLARIZATION_PRESET_VALUES,
            )
          : defaultPolarization.presetId,
      inPlaneAmplitude:
        polarizationValue && typeof polarizationValue.inPlaneAmplitude === 'number'
          ? expectNumber(polarizationValue, 'inPlaneAmplitude')
          : defaultPolarization.inPlaneAmplitude,
      outOfPlaneAmplitude:
        polarizationValue && typeof polarizationValue.outOfPlaneAmplitude === 'number'
          ? expectNumber(polarizationValue, 'outOfPlaneAmplitude')
          : defaultPolarization.outOfPlaneAmplitude,
      relativePhaseDeg:
        polarizationValue && typeof polarizationValue.relativePhaseDeg === 'number'
          ? expectNumber(polarizationValue, 'relativePhaseDeg')
          : defaultPolarization.relativePhaseDeg,
    },
  }
}

function parseComponentConfig(
  value: unknown,
  type: ComponentType,
  variantId: string,
): ComponentConfig {
  const defaults = createDefaultComponentConfig(type, variantId)

  if (!isRecord(value)) {
    return defaults
  }

  return {
    ...defaults,
    source: parseSourceConfig(value.source, type) ?? defaults.source,
    beamSplitter:
      isRecord(value.beamSplitter) && type === 'beamsplitter'
        ? {
            reflectPercent: expectNumber(value.beamSplitter, 'reflectPercent'),
            lossPercent: expectNumber(value.beamSplitter, 'lossPercent'),
          }
        : defaults.beamSplitter,
    lens:
      isRecord(value.lens) && type === 'lens'
        ? {
            focalLengthMm: expectNumber(value.lens, 'focalLengthMm'),
            clearApertureMm: expectNumber(value.lens, 'clearApertureMm'),
          }
        : defaults.lens,
    attenuator:
      isRecord(value.attenuator) && type === 'attenuator'
        ? {
            transmissionPercent: expectNumber(
              value.attenuator,
              'transmissionPercent',
            ),
            orientation:
              typeof value.attenuator.orientation === 'string' &&
              (value.attenuator.orientation === 'horizontal' ||
                value.attenuator.orientation === 'vertical')
                ? value.attenuator.orientation
                : 'horizontal',
          }
        : defaults.attenuator,
    curvedMirror:
      isRecord(value.curvedMirror) && (type === 'mirror' || type === 'curved-mirror')
        ? {
            radiusOfCurvatureMm: expectNumber(value.curvedMirror, 'radiusOfCurvatureMm'),
            isConvex:
              typeof value.curvedMirror.isConvex === 'boolean'
                ? value.curvedMirror.isConvex
                : false,
          }
        : defaults.curvedMirror,
    flipMirror:
      isRecord(value.flipMirror) &&
      type === 'mirror' &&
      variantId === 'flip-mirror'
        ? {
            isFlippedDown:
              typeof value.flipMirror.isFlippedDown === 'boolean'
                ? value.flipMirror.isFlippedDown
                : defaults.flipMirror?.isFlippedDown ?? true,
          }
        : defaults.flipMirror,
    polarizer:
      isRecord(value.polarizer) && type === 'polarizer'
        ? {
            axisLocalDeg: expectNumber(value.polarizer, 'axisLocalDeg'),
            extinctionRatio: expectNumber(value.polarizer, 'extinctionRatio'),
            insertionLossPercent:
              typeof value.polarizer.insertionLossPercent === 'number'
                ? expectNumber(value.polarizer, 'insertionLossPercent')
                : 0,
          }
        : defaults.polarizer,
    waveplate:
      isRecord(value.waveplate) && type === 'waveplate'
        ? {
            kind: expectEnum(value.waveplate, 'kind', [...WAVEPLATE_KIND_VALUES]),
            axisLocalDeg: expectNumber(value.waveplate, 'axisLocalDeg'),
            retardanceDeg: expectNumber(value.waveplate, 'retardanceDeg'),
            insertionLossPercent:
              typeof value.waveplate.insertionLossPercent === 'number'
                ? expectNumber(value.waveplate, 'insertionLossPercent')
                : 0,
          }
        : defaults.waveplate,
    iris:
      isRecord(value.iris) && type === 'iris'
        ? {
            apertureMm: expectNumber(value.iris, 'apertureMm'),
          }
        : defaults.iris,
    bboCrystal:
      isRecord(value.bboCrystal) && type === 'bbo-crystal'
        ? {
            crystalType: 'type-i',
            interactionMode: expectEnum(
              value.bboCrystal,
              'interactionMode',
              ['estimated', 'advanced'],
            ),
            thicknessUm: expectNumber(value.bboCrystal, 'thicknessUm'),
            phaseMatchingAngleDeg: expectNumber(
              value.bboCrystal,
              'phaseMatchingAngleDeg',
            ),
            polarizationAxisLocalDeg:
              typeof value.bboCrystal.polarizationAxisLocalDeg === 'number'
                ? expectNumber(value.bboCrystal, 'polarizationAxisLocalDeg')
                : 0,
          }
        : defaults.bboCrystal,
    delayLine:
      isRecord(value.delayLine) &&
      (type === 'sample-stage' || type === 'support-hardware')
        ? {
            positionMm:
              typeof value.delayLine.positionMm === 'number'
                ? expectNumber(value.delayLine, 'positionMm')
                : 0,
            travelMm: expectNumber(value.delayLine, 'travelMm'),
            topology: expectEnum(
              value.delayLine,
              'topology',
              [...DELAY_LINE_TOPOLOGY_VALUES],
            ),
            zeroDelayOffsetFs:
              typeof value.delayLine.zeroDelayOffsetFs === 'number'
                ? expectNumber(value.delayLine, 'zeroDelayOffsetFs')
                : 0,
          }
        : defaults.delayLine,
    telescope:
      isRecord(value.telescope) && type === 'telescope'
        ? {
            mode: expectEnum(value.telescope, 'mode', [...TELESCOPE_MODE_VALUES]),
            element1Mm: expectNumber(value.telescope, 'element1Mm'),
            element2Mm: expectNumber(value.telescope, 'element2Mm'),
            separationMm: expectNumber(value.telescope, 'separationMm'),
            clearApertureMm: expectNumber(value.telescope, 'clearApertureMm'),
          }
        : defaults.telescope,
    opa:
      isRecord(value.opa) && type === 'opa-module'
        ? {
            role: expectEnum(value.opa, 'role', [...OPA_ROLE_VALUES]),
            pumpLink: isRecord(value.opa.pumpLink)
              ? {
                  sourceComponentId:
                    typeof value.opa.pumpLink.sourceComponentId === 'string'
                      ? value.opa.pumpLink.sourceComponentId
                      : undefined,
                  pathId:
                    typeof value.opa.pumpLink.pathId === 'string'
                      ? value.opa.pumpLink.pathId
                      : undefined,
                }
              : undefined,
            seedLink: isRecord(value.opa.seedLink)
              ? {
                  sourceComponentId:
                    typeof value.opa.seedLink.sourceComponentId === 'string'
                      ? value.opa.seedLink.sourceComponentId
                      : undefined,
                  pathId:
                    typeof value.opa.seedLink.pathId === 'string'
                      ? value.opa.seedLink.pathId
                      : undefined,
                }
              : undefined,
            signalLink: isRecord(value.opa.signalLink)
              ? {
                  sourceComponentId:
                    typeof value.opa.signalLink.sourceComponentId === 'string'
                      ? value.opa.signalLink.sourceComponentId
                      : undefined,
                  pathId:
                    typeof value.opa.signalLink.pathId === 'string'
                      ? value.opa.signalLink.pathId
                      : undefined,
                }
              : undefined,
            outputMode:
              typeof value.opa.outputMode === 'string'
                ? expectEnum(value.opa, 'outputMode', [...OPA_OUTPUT_MODE_VALUES])
                : defaults.opa?.outputMode,
            targetWavelengthNm:
              typeof value.opa.targetWavelengthNm === 'number'
                ? expectNumber(value.opa, 'targetWavelengthNm')
                : defaults.opa?.targetWavelengthNm,
            outputBandwidthNm:
              typeof value.opa.outputBandwidthNm === 'number'
                ? expectNumber(value.opa, 'outputBandwidthNm')
                : defaults.opa?.outputBandwidthNm,
            conversionEfficiencyPercent:
              typeof value.opa.conversionEfficiencyPercent === 'number'
                ? expectNumber(value.opa, 'conversionEfficiencyPercent')
                : defaults.opa?.conversionEfficiencyPercent,
            bandwidthScale:
              typeof value.opa.bandwidthScale === 'number'
                ? expectNumber(value.opa, 'bandwidthScale')
                : defaults.opa?.bandwidthScale,
            pumpDepletionPercent:
              typeof value.opa.pumpDepletionPercent === 'number'
                ? expectNumber(value.opa, 'pumpDepletionPercent')
                : defaults.opa?.pumpDepletionPercent,
            signalWavelengthNm:
              typeof value.opa.signalWavelengthNm === 'number'
                ? expectNumber(value.opa, 'signalWavelengthNm')
                : defaults.opa?.signalWavelengthNm,
            idlerWavelengthNm:
              typeof value.opa.idlerWavelengthNm === 'number'
                ? expectNumber(value.opa, 'idlerWavelengthNm')
                : defaults.opa?.idlerWavelengthNm,
          }
        : defaults.opa,
    support:
      isRecord(value.support) && typeof value.support.includeMount === 'boolean'
        ? {
            includeMount: value.support.includeMount,
          }
        : defaults.support,
    postHolderDiameterMm:
      typeof value.postHolderDiameterMm === 'number'
        ? expectNumber(value, 'postHolderDiameterMm')
        : undefined,
  }
}

function parseComponent(value: unknown, version: number): ComponentInstance {
  if (!isRecord(value)) {
    throw new Error('Each component must be an object.')
  }

  const rawType = expectString(value, 'type')
  const migratedType = migrateLegacyType(rawType)
  let type = migratedType.type

  const rawVariantId = typeof value.variantId === 'string' ? value.variantId : undefined
  if (type === 'mirror' && (rawVariantId === 'concave-1in' || rawVariantId === 'convex-1in')) {
    type = 'curved-mirror'
  }

  if (!COMPONENT_DEFINITIONS_BY_TYPE[type]) {
    throw new Error(`Unknown component type: ${type}.`)
  }

  const variantId =
    version === LEGACY_SCENE_DOCUMENT_VERSION ||
    version === STAGE1_SCENE_DOCUMENT_VERSION
      ? migratedType.variantId
      : typeof value.variantId === 'string'
        ? value.variantId
        : getComponentDefinition(type).defaultVariantId

  return {
    id: expectString(value, 'id'),
    type,
    label: expectString(value, 'label'),
    variantId,
    anchorMm: expectVector2(value, 'anchorMm'),
    hostSurfaceId:
      typeof value.hostSurfaceId === 'string' ? value.hostSurfaceId : undefined,
    rotationQuarterTurns: parseQuarterTurn(
      expectNumber(value, 'rotationQuarterTurns'),
    ),
    geometryOverride:
      isRecord(value.geometryOverride) &&
      (typeof value.geometryOverride.widthMm === 'number' ||
        typeof value.geometryOverride.heightMm === 'number')
        ? {
            widthMm:
              typeof value.geometryOverride.widthMm === 'number'
                ? expectNumber(value.geometryOverride, 'widthMm')
                : undefined,
            heightMm:
              typeof value.geometryOverride.heightMm === 'number'
                ? expectNumber(value.geometryOverride, 'heightMm')
                : undefined,
          }
        : undefined,
    config:
      version === LEGACY_SCENE_DOCUMENT_VERSION ||
      version === STAGE1_SCENE_DOCUMENT_VERSION
        ? createDefaultComponentConfig(type, variantId)
        : parseComponentConfig(value.config, type, variantId),
  }
}

function parseBeamSettings(value: unknown): SceneBeamSettings {
  if (!isRecord(value)) {
    return cloneBeamSettings()
  }

  return {
    beamFidelityMode: expectEnum(value, 'beamFidelityMode', [
      'geometric',
      'angle-sensitive',
    ]),
    sharedBeamHeightMm: expectNumber(value, 'sharedBeamHeightMm'),
    defaultBeamDiameterMm: expectNumber(value, 'defaultBeamDiameterMm'),
    defaultDivergenceMrad: expectNumber(value, 'defaultDivergenceMrad'),
  }
}

export function createEmptyScene(): SceneDocument {
  return {
    kind: SCENE_DOCUMENT_KIND,
    version: SCENE_DOCUMENT_VERSION,
    metadata: {
      name: 'Untitled Schema-Lab Scene',
    },
    workspace: createFreshSingleBreadboardWorkspace(),
    beamSettings: cloneBeamSettings(),
    components: [],
    annotations: [],
  }
}

function parseAnnotationLine(value: Record<string, unknown>): AnnotationLine | undefined {
  const startMm = value.startMm
  const endMm = value.endMm

  if (!isRecord(startMm) || !isRecord(endMm)) {
    return undefined
  }

  return {
    id: expectString(value, 'id'),
    kind: 'line',
    startMm: {
      x: expectNumber(startMm, 'x'),
      y: expectNumber(startMm, 'y'),
    },
    endMm: {
      x: expectNumber(endMm, 'x'),
      y: expectNumber(endMm, 'y'),
    },
    color: expectString(value, 'color'),
    strokeWidthMm: expectNumber(value, 'strokeWidthMm'),
  }
}

function parseAnnotationTextStyle(value: unknown): AnnotationTextStyle {
  if (!isRecord(value)) {
    return { ...DEFAULT_ANNOTATION_TEXT_STYLE }
  }

  return {
    fontFamily:
      typeof value.fontFamily === 'string'
        ? expectEnum(value, 'fontFamily', [...ANNOTATION_FONT_FAMILY_VALUES])
        : DEFAULT_ANNOTATION_TEXT_STYLE.fontFamily,
    fontSizeMm:
      typeof value.fontSizeMm === 'number'
        ? clampAnnotationFontSizeMm(expectNumber(value, 'fontSizeMm'))
        : DEFAULT_ANNOTATION_TEXT_STYLE.fontSizeMm,
    color:
      typeof value.color === 'string'
        ? expectString(value, 'color')
        : DEFAULT_ANNOTATION_TEXT_STYLE.color,
    bold: typeof value.bold === 'boolean' ? value.bold : DEFAULT_ANNOTATION_TEXT_STYLE.bold,
    italic:
      typeof value.italic === 'boolean'
        ? value.italic
        : DEFAULT_ANNOTATION_TEXT_STYLE.italic,
    underline:
      typeof value.underline === 'boolean'
        ? value.underline
        : DEFAULT_ANNOTATION_TEXT_STYLE.underline,
    align:
      typeof value.align === 'string'
        ? expectEnum(value, 'align', [...ANNOTATION_TEXT_ALIGN_VALUES])
        : DEFAULT_ANNOTATION_TEXT_STYLE.align,
  }
}

function parseAnnotationText(value: Record<string, unknown>): AnnotationText | undefined {
  return {
    id: expectString(value, 'id'),
    kind: 'text',
    anchorMm: expectVector2(value, 'anchorMm'),
    widthMm: expectNumber(value, 'widthMm'),
    text: expectString(value, 'text'),
    style: parseAnnotationTextStyle(value.style),
  }
}

function parseShapeAnnotation(value: Record<string, unknown>): ShapeAnnotation | undefined {
  const shapeKind = expectEnum(value, 'shapeKind', ANNOTATION_SHAPE_KIND_VALUES)

  if (shapeKind === 'arrow') {
    return {
      id: expectString(value, 'id'),
      kind: 'shape',
      shapeKind,
      startMm: expectVector2(value, 'startMm'),
      endMm: expectVector2(value, 'endMm'),
      strokeColor: expectString(value, 'strokeColor'),
      fillColor: expectString(value, 'fillColor'),
      strokeWidthMm: expectNumber(value, 'strokeWidthMm'),
    }
  }

  const boundsMm = value.boundsMm
  if (!isRecord(boundsMm)) {
    return undefined
  }

  return {
    id: expectString(value, 'id'),
    kind: 'shape',
    shapeKind,
    boundsMm: normalizeRectLikeBounds({
      x: expectNumber(boundsMm, 'x'),
      y: expectNumber(boundsMm, 'y'),
      width: expectNumber(boundsMm, 'width'),
      height: expectNumber(boundsMm, 'height'),
    }),
    strokeColor: expectString(value, 'strokeColor'),
    fillColor: expectString(value, 'fillColor'),
    strokeWidthMm: expectNumber(value, 'strokeWidthMm'),
  }
}

function parseAnnotation(value: unknown): SceneAnnotation | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  try {
    if (typeof value.kind !== 'string') {
      return parseAnnotationLine(value)
    }

    switch (value.kind) {
      case 'line':
        return parseAnnotationLine(value)
      case 'text':
        return parseAnnotationText(value)
      case 'shape':
        return parseShapeAnnotation(value)
      default:
        return undefined
    }
  } catch {
    return undefined
  }
}

export function getDefaultBeamSettings() {
  return cloneBeamSettings()
}

export function serializeSceneDocument(scene: SceneDocument) {
  return JSON.stringify(scene, null, 2)
}

export function parseSceneDocument(rawText: string): SceneDocument {
  let parsedValue: unknown

  try {
    parsedValue = JSON.parse(rawText)
  } catch {
    throw new Error('Scene JSON could not be parsed.')
  }

  if (!isRecord(parsedValue)) {
    throw new Error('Scene JSON must be an object.')
  }

  const kind = expectString(parsedValue, 'kind')
  const version = expectNumber(parsedValue, 'version')

  if (kind !== SCENE_DOCUMENT_KIND) {
    throw new Error(`Unsupported scene kind: ${kind}.`)
  }

  if (
    version !== SCENE_DOCUMENT_VERSION &&
    version !== PREVIOUS_SCENE_DOCUMENT_VERSION &&
    version !== WORKSPACE_SCENE_DOCUMENT_VERSION &&
    version !== STAGE2_SCENE_DOCUMENT_VERSION &&
    version !== LEGACY_SCENE_DOCUMENT_VERSION &&
    version !== STAGE1_SCENE_DOCUMENT_VERSION
  ) {
    throw new Error(`Unsupported scene version: ${version}.`)
  }

  const metadataValue = parsedValue.metadata

  if (!isRecord(metadataValue)) {
    throw new Error('metadata must be an object.')
  }

  const componentsValue = parsedValue.components

  if (!Array.isArray(componentsValue)) {
    throw new Error('components must be an array.')
  }

  return {
    kind: SCENE_DOCUMENT_KIND,
    version: SCENE_DOCUMENT_VERSION,
    metadata: {
      name: expectString(metadataValue, 'name'),
    },
    workspace: parseWorkspace(parsedValue, version),
    beamSettings:
      version === LEGACY_SCENE_DOCUMENT_VERSION
        ? cloneBeamSettings()
        : parseBeamSettings(parsedValue.beamSettings),
    components: componentsValue.map((component) => {
      const nextComponent = parseComponent(component, version)

      if (version === WORKSPACE_SCENE_DOCUMENT_VERSION) {
        return {
          ...nextComponent,
          hostSurfaceId: undefined,
        }
      }

      return nextComponent
    }),
    annotations: Array.isArray(parsedValue.annotations)
      ? (parsedValue.annotations.map(parseAnnotation).filter(Boolean) as SceneAnnotation[])
      : [],
  }
}

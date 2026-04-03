import { findBreadboardPresetId, getDefaultBreadboard } from './breadboardPresets'
import { createDefaultPolarizationConfig } from './polarization'
import {
  COMPONENT_DEFINITIONS_BY_TYPE,
  createDefaultComponentConfig,
  getComponentDefinition,
} from './componentCatalog'
import type {
  BreadboardFinish,
  BreadboardModel,
  ComponentConfig,
  ComponentInstance,
  ComponentType,
  CounterborePattern,
  HoleDensity,
  QuarterTurn,
  SceneBeamSettings,
  SceneDocument,
  PolarizationPresetId,
  SourceLane,
  Vector2Mm,
} from './types'
import {
  LEGACY_SCENE_DOCUMENT_VERSION,
  PREVIOUS_SCENE_DOCUMENT_VERSION,
  SCENE_DOCUMENT_KIND,
  SCENE_DOCUMENT_VERSION,
  STAGE1_SCENE_DOCUMENT_VERSION,
  STAGE2_SCENE_DOCUMENT_VERSION,
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
  'pharos',
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
    support:
      isRecord(value.support) && typeof value.support.includeMount === 'boolean'
        ? {
            includeMount: value.support.includeMount,
          }
        : defaults.support,
  }
}

function parseComponent(value: unknown, version: number): ComponentInstance {
  if (!isRecord(value)) {
    throw new Error('Each component must be an object.')
  }

  const rawType = expectString(value, 'type')
  const migratedType = migrateLegacyType(rawType)
  const type = migratedType.type

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
    rotationQuarterTurns: parseQuarterTurn(
      expectNumber(value, 'rotationQuarterTurns'),
    ),
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
    breadboard: getDefaultBreadboard(),
    beamSettings: cloneBeamSettings(),
    components: [],
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
    breadboard: parseBreadboard(parsedValue.breadboard),
    beamSettings:
      version === LEGACY_SCENE_DOCUMENT_VERSION
        ? cloneBeamSettings()
        : parseBeamSettings(parsedValue.beamSettings),
    components: componentsValue.map((component) => parseComponent(component, version)),
  }
}

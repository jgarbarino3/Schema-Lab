import { findBreadboardPresetId, getDefaultBreadboard } from './breadboardPresets'
import { COMPONENT_DEFINITIONS_BY_TYPE } from './componentCatalog'
import type {
  BreadboardFinish,
  BreadboardModel,
  ComponentInstance,
  ComponentType,
  CounterborePattern,
  HoleDensity,
  QuarterTurn,
  SceneDocument,
  Vector2Mm,
} from './types'
import { SCENE_DOCUMENT_KIND, SCENE_DOCUMENT_VERSION } from './types'

const BREADBOARD_FINISH_VALUES: BreadboardFinish[] = [
  'black-anodized',
  'clear-anodized',
]
const HOLE_DENSITY_VALUES: HoleDensity[] = ['single', 'double']
const COUNTERBORE_PATTERN_VALUES: CounterborePattern[] = ['none', 'corner-25mm']

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

function parseComponent(value: unknown): ComponentInstance {
  if (!isRecord(value)) {
    throw new Error('Each component must be an object.')
  }

  const type = expectString(value, 'type') as ComponentType

  if (!COMPONENT_DEFINITIONS_BY_TYPE[type]) {
    throw new Error(`Unknown component type: ${type}.`)
  }

  return {
    id: expectString(value, 'id'),
    type,
    label: expectString(value, 'label'),
    anchorMm: expectVector2(value, 'anchorMm'),
    rotationQuarterTurns: parseQuarterTurn(
      expectNumber(value, 'rotationQuarterTurns'),
    ),
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
    components: [],
  }
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

  if (version !== SCENE_DOCUMENT_VERSION) {
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
    components: componentsValue.map(parseComponent),
  }
}

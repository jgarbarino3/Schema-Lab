import type {
  ComponentInstance,
  ComponentType,
  RealisticSymbolStyle,
  ResolvedComponentSpec,
} from './types'

export type RealisticSymbolFamilyKey =
  | 'planar-mirror'
  | 'curved-mirror'
  | 'lens'
  | 'beamsplitter'
  | 'iris'
  | 'filter'
  | 'polarization-control'
  | 'detector'
  | 'beam-dump'
  | 'source'
  | 'post-holder'

export type RealisticMaterialProfile = 'diagrammatic' | 'balanced' | 'catalog'

export const FINAL_REALISTIC_SYMBOL_FALLBACK_STYLE: RealisticSymbolStyle =
  'technical'

export const FINAL_REALISTIC_SUPPORT_POSTHOLDER_STYLE: RealisticSymbolStyle =
  'technical'

export const FINAL_REALISTIC_MATERIAL_PROFILE: RealisticMaterialProfile = 'catalog'

export const FINAL_REALISTIC_SYMBOL_STYLE_BY_FAMILY = {
  'planar-mirror': 'technical',
  'curved-mirror': 'technical',
  lens: 'technical',
  beamsplitter: 'technical',
  iris: 'schematic',
  filter: 'hardware',
  'polarization-control': 'technical',
  detector: 'hardware',
  'beam-dump': 'hardware',
  source: 'hardware',
  'post-holder': FINAL_REALISTIC_SUPPORT_POSTHOLDER_STYLE,
} as const satisfies Record<RealisticSymbolFamilyKey, RealisticSymbolStyle>

type RealisticDecisionComponent = Pick<ComponentInstance, 'type'> | ComponentType

function getComponentType(component: RealisticDecisionComponent): ComponentType {
  return typeof component === 'string' ? component : component.type
}

export function getRealisticSymbolFamilyKey(
  component: RealisticDecisionComponent,
  spec?: Pick<ResolvedComponentSpec, 'realisticVisualPreset'>,
): RealisticSymbolFamilyKey | undefined {
  void spec

  switch (getComponentType(component)) {
    case 'mirror':
      return 'planar-mirror'
    case 'curved-mirror':
      return 'curved-mirror'
    case 'lens':
      return 'lens'
    case 'beamsplitter':
      return 'beamsplitter'
    case 'iris':
      return 'iris'
    case 'filter':
      return 'filter'
    case 'polarizer':
    case 'waveplate':
      return 'polarization-control'
    case 'detector':
      return 'detector'
    case 'beam-dump':
      return 'beam-dump'
    case 'laser-source':
      return 'source'
    case 'optic-mount':
    case 'support-hardware':
      return 'post-holder'
    default:
      return undefined
  }
}

export function resolveRealisticSymbolStyle(
  component: RealisticDecisionComponent,
  spec?: Pick<ResolvedComponentSpec, 'realisticVisualPreset'>,
): RealisticSymbolStyle {
  const familyKey = getRealisticSymbolFamilyKey(component, spec)

  return familyKey
    ? FINAL_REALISTIC_SYMBOL_STYLE_BY_FAMILY[familyKey]
    : FINAL_REALISTIC_SYMBOL_FALLBACK_STYLE
}

export function resolveRealisticSupportPostholderStyle(): RealisticSymbolStyle {
  return FINAL_REALISTIC_SUPPORT_POSTHOLDER_STYLE
}

export function resolveRealisticMaterialProfile(): RealisticMaterialProfile {
  return FINAL_REALISTIC_MATERIAL_PROFILE
}

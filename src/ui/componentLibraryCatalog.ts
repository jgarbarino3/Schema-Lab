import {
  COMPONENT_DEFINITIONS,
  getResolvedComponentSpec,
} from '../domain/componentCatalog'
import type {
  ComponentCategory,
  ComponentDefinition,
  ComponentGlyph as ComponentGlyphType,
  ComponentType,
} from '../domain/types'

export interface DisplayGroup {
  key: string
  label: string
  categories: ComponentCategory[]
}

export interface LibraryComponentEntry {
  category: ComponentCategory
  description?: string
  familyLabel: string
  key: string
  previewFill: string
  previewGlyph: ComponentGlyphType
  previewIsConvex?: boolean
  previewStroke: string
  recentLabel: string
  searchText: string
  sku?: string
  testId: string
  title: string
  type: ComponentType
  variantCount: number
  variantId?: string
  vendor?: string
}

export const DISPLAY_GROUPS: DisplayGroup[] = [
  { key: 'sources', label: 'Sources', categories: ['source'] },
  { key: 'beam-steering', label: 'Beam steering', categories: ['steering', 'splitting'] },
  { key: 'beam-control', label: 'Beam control', categories: ['attenuation', 'conditioning', 'aperture'] },
  { key: 'focusing-shaping', label: 'Focusing & shaping', categories: ['focusing', 'nonlinear', 'coupling'] },
  { key: 'sample-delay', label: 'Sample & delay', categories: ['sample'] },
  { key: 'measurement', label: 'Measurement', categories: ['measurement', 'termination'] },
  { key: 'mounting', label: 'Mounting', categories: ['mounting'] },
]

function describeMountMode(mode: string) {
  switch (mode) {
    case 'external-source':
      return 'launch edge'
    case 'hole-mounted':
      return 'hole mounted'
    case 'clamp-capable':
      return 'clamp capable'
    default:
      return mode
  }
}

export function getDisplayGroupForCategory(category: ComponentCategory): string | undefined {
  return DISPLAY_GROUPS.find((group) => group.categories.includes(category))?.key
}

export function matchesLibraryQuery(value: string, query: string) {
  return value.toLowerCase().includes(query.toLowerCase())
}

function getRecentComponentLabel(
  definition: ComponentDefinition,
  variantId?: string,
) {
  if (definition.type === 'mirror' && variantId === 'flip-mirror') {
    return 'Flip Mirror'
  }

  return definition.defaultLabel
}

function createEntry(
  definition: ComponentDefinition,
  options: {
    familyLabel: string
    key: string
    recentLabel: string
    searchText: string
    specVariantId?: string
    testId: string
    title: string
    variantCount: number
    variantId?: string
  },
): LibraryComponentEntry {
  const spec = getResolvedComponentSpec(definition.type, options.specVariantId)

  return {
    category: definition.category,
    description: spec.description,
    familyLabel: options.familyLabel,
    key: options.key,
    previewFill: spec.renderHint.fill,
    previewGlyph: spec.renderHint.glyph,
    previewIsConvex:
      definition.type === 'curved-mirror' && spec.variantId.includes('convex')
        ? true
        : undefined,
    previewStroke: spec.renderHint.stroke,
    recentLabel: options.recentLabel,
    searchText: options.searchText,
    sku: spec.sku,
    testId: options.testId,
    title: options.title,
    type: definition.type,
    variantCount: options.variantCount,
    variantId: options.variantId,
    vendor: spec.vendor,
  }
}

export function buildCompactLibraryComponentEntries(
  definition: ComponentDefinition,
): LibraryComponentEntry[] {
  const variantLabels = definition.variants.map((variant) => variant.label).join(' ')

  if (definition.type !== 'mirror') {
    return [
      createEntry(definition, {
        familyLabel: definition.familyLabel,
        key: definition.type,
        recentLabel: getRecentComponentLabel(definition),
        searchText: [
          definition.familyLabel,
          definition.defaultLabel,
          definition.category,
          describeMountMode(definition.mount.mode),
          variantLabels,
        ].join(' '),
        testId: `library-item-${definition.type}`,
        title: definition.familyLabel,
        variantCount: definition.variants.length,
      }),
    ]
  }

  const planarVariants = definition.variants.filter((variant) => variant.id !== 'flip-mirror')
  const flipVariant = definition.variants.find((variant) => variant.id === 'flip-mirror')
  const entries: LibraryComponentEntry[] = [
    createEntry(definition, {
      familyLabel: 'Planar Mirror',
      key: definition.type,
      recentLabel: getRecentComponentLabel(definition),
      searchText: [
        'Planar Mirror',
        definition.familyLabel,
        definition.defaultLabel,
        definition.category,
        describeMountMode(definition.mount.mode),
        planarVariants.map((variant) => variant.label).join(' '),
      ].join(' '),
      testId: 'library-item-mirror',
      title: 'Planar Mirror',
      variantCount: planarVariants.length,
    }),
  ]

  if (flipVariant) {
    entries.push(
      createEntry(definition, {
        familyLabel: 'Flip Mirror',
        key: `${definition.type}-${flipVariant.id}`,
        recentLabel: getRecentComponentLabel(definition, flipVariant.id),
        searchText: [
          'Flip Mirror',
          flipVariant.label,
          definition.category,
          describeMountMode(definition.mount.mode),
        ].join(' '),
        specVariantId: flipVariant.id,
        testId: 'library-item-flip-mirror',
        title: 'Flip Mirror',
        variantCount: 1,
        variantId: flipVariant.id,
      }),
    )
  }

  return entries
}

export function buildFullLibraryComponentEntries(
  definition: ComponentDefinition,
): LibraryComponentEntry[] {
  return definition.variants.map((variant) =>
    createEntry(definition, {
      familyLabel: definition.familyLabel,
      key: `${definition.type}-${variant.id}`,
      recentLabel: getRecentComponentLabel(definition, variant.id),
      searchText: [
        definition.familyLabel,
        definition.defaultLabel,
        variant.label,
        variant.vendor ?? '',
        variant.sku ?? '',
        variant.description,
        definition.category,
        describeMountMode(definition.mount.mode),
      ].join(' '),
      specVariantId: variant.id,
      testId: `catalog-item-${definition.type}-${variant.id}`,
      title: variant.label,
      variantCount: 1,
      variantId: variant.id,
    }),
  )
}

export const FULL_LIBRARY_COMPONENT_ENTRIES = COMPONENT_DEFINITIONS.flatMap(
  buildFullLibraryComponentEntries,
)

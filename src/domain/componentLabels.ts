import { getComponentDefinition } from './componentCatalog'
import type { ComponentInstance, ComponentType } from './types'

const COMPONENT_LABEL_PREFIXES: Record<ComponentType, string> = {
  'attenuator': 'A',
  'bbo-crystal': 'BBO',
  'beam-dump': 'BD',
  'beamsplitter': 'BS',
  'curved-mirror': 'CM',
  'delay-stage': 'DS',
  'detector': 'D',
  'fiber-coupler': 'FC',
  'filter': 'F',
  'folded-mirror-pair': 'FMP',
  'iris': 'AP',
  'laser-source': 'LS',
  'lens': 'L',
  'mirror': 'M',
  'opa-module': 'OPA',
  'optic-mount': 'OM',
  'polarizer': 'P',
  'sample': 'S',
  'sample-holder': 'SH',
  'spectrometer': 'SP',
  'support-hardware': 'HW',
  'telescope': 'T',
  'translation-stage': 'TS',
  'waveplate': 'WP',
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function getComponentLabelPrefix(type: ComponentType, variantId?: string) {
  if (type === 'mirror' && variantId === 'flip-mirror') {
    return 'FM'
  }

  return COMPONENT_LABEL_PREFIXES[type]
}

function getLegacyBaseLabels(type: ComponentType, variantId?: string) {
  const definition = getComponentDefinition(type)
  const labels = [
    definition.defaultLabel,
    definition.familyLabel,
    type === 'mirror' && variantId === 'flip-mirror' ? 'Flip Mirror' : undefined,
  ].filter((label, index, allLabels): label is string =>
    Boolean(label) && allLabels.indexOf(label) === index,
  )

  return labels
}

function getLegacyOrdinal(componentLabel: string, baseLabel: string) {
  const pattern = new RegExp(`^${escapeRegExp(baseLabel)}(?:\\s+#?(\\d+))?$`)
  const match = componentLabel.match(pattern)

  if (!match) {
    return 0
  }

  return match[1] ? Number.parseInt(match[1], 10) : 1
}

export function createAutoNumberedComponentLabel(
  components: ComponentInstance[],
  type: ComponentType,
  variantId?: string,
) {
  const prefix = getComponentLabelPrefix(type, variantId)
  const compactPattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`, 'i')
  const legacyBaseLabels = getLegacyBaseLabels(type, variantId)
  let highestIndex = 0

  for (const component of components) {
    if (component.type !== type) {
      continue
    }

    const compactMatch = component.label.match(compactPattern)
    if (compactMatch) {
      highestIndex = Math.max(highestIndex, Number.parseInt(compactMatch[1] ?? '0', 10))
      continue
    }

    for (const baseLabel of legacyBaseLabels) {
      highestIndex = Math.max(highestIndex, getLegacyOrdinal(component.label, baseLabel))
    }
  }

  return `${prefix}${highestIndex + 1}`
}

import { describe, expect, it } from 'vitest'
import {
  createDefaultComponentConfig,
  getComponentDefinition,
  getResolvedComponentSpec,
} from '../domain/componentCatalog'
import { createRealisticAppearance } from '../domain/realisticAppearance'
import type { ComponentInstance, ComponentType, Vector2Mm } from '../domain/types'
import type { VectorNode } from '../domain/vectorExportScene'

const PILOT_TYPES = [
  'mirror',
  'lens',
  'beamsplitter',
  'bbo-crystal',
  'laser-source',
  'detector',
] as const satisfies ComponentType[]

function makeComponent(type: ComponentType, rotationQuarterTurns = 0): ComponentInstance {
  const definition = getComponentDefinition(type)

  return {
    id: `${type}-test`,
    type,
    label: definition.defaultLabel,
    variantId: definition.defaultVariantId,
    anchorMm: { x: 120, y: 85 },
    rotationQuarterTurns: rotationQuarterTurns as ComponentInstance['rotationQuarterTurns'],
    config: createDefaultComponentConfig(type, definition.defaultVariantId),
  }
}

function flattenNodes(nodes: VectorNode[]): VectorNode[] {
  return nodes.flatMap((node) =>
    node.kind === 'group' ? [node, ...flattenNodes(node.children)] : [node],
  )
}

function nodeNumbers(node: VectorNode): number[] {
  switch (node.kind) {
    case 'circle':
      return [node.centerMm.x, node.centerMm.y, node.radiusMm]
    case 'ellipse':
      return [node.centerMm.x, node.centerMm.y, node.radiusXMm, node.radiusYMm]
    case 'line':
      return [node.x1Mm, node.y1Mm, node.x2Mm, node.y2Mm]
    case 'polyline':
      return node.pointsMm.flatMap((point) => [point.x, point.y])
    case 'text':
      return [node.positionMm.x, node.positionMm.y]
    case 'group':
      return []
  }
}

function rotatedProjector(instance: ComponentInstance) {
  return (point: Vector2Mm, elevationMm = 0): Vector2Mm => {
    const turns = instance.rotationQuarterTurns
    const rotated =
      turns === 1
        ? { x: -point.y, y: point.x }
        : turns === 2
          ? { x: -point.x, y: -point.y }
          : turns === 3
            ? { x: point.y, y: -point.x }
            : point

    return {
      x: instance.anchorMm.x + rotated.x + elevationMm * 0.3,
      y: instance.anchorMm.y + rotated.y - elevationMm * 0.5,
    }
  }
}

describe('realistic appearance pilot recipes', () => {
  it('returns undefined for component families outside the approved pilot', () => {
    const instance = makeComponent('filter')

    expect(
      createRealisticAppearance({
        instance,
        spec: getResolvedComponentSpec(instance.type, instance.variantId),
        showMount: true,
        view: 'top-down',
        projectPoint: rotatedProjector(instance),
      }),
    ).toBeUndefined()
  })

  it('creates finite, distinguishable native vector recipes for all six pilot families', () => {
    const signatures = PILOT_TYPES.map((type) => {
      const instance = makeComponent(type)
      const nodes = createRealisticAppearance({
        instance,
        spec: getResolvedComponentSpec(type, instance.variantId),
        showMount: true,
        view: 'top-down',
        projectPoint: rotatedProjector(instance),
      })

      expect(nodes).toBeDefined()
      const flat = flattenNodes(nodes ?? [])
      expect(flat.some((node) => node.kind === 'polyline')).toBe(true)
      expect(flat.every((node) => nodeNumbers(node).every(Number.isFinite))).toBe(true)

      return flat
        .filter((node) => node.kind !== 'group')
        .map((node) => `${node.kind}:${node.id}`)
        .join('|')
    })

    expect(new Set(signatures).size).toBe(PILOT_TYPES.length)
  })

  it('projects recipe geometry through size-aware specs and quarter-turn projectors', () => {
    const baseInstance = makeComponent('lens', 0)
    const rotatedInstance = makeComponent('lens', 1)
    const baseSpec = getResolvedComponentSpec('lens', 'thin-lens-100mm')
    const largeSpec = getResolvedComponentSpec('lens', 'la4102-ab')

    const baseNodes = flattenNodes(
      createRealisticAppearance({
        instance: baseInstance,
        spec: baseSpec,
        showMount: false,
        view: 'angled',
        projectPoint: rotatedProjector(baseInstance),
      }) ?? [],
    )
    const rotatedNodes = flattenNodes(
      createRealisticAppearance({
        instance: rotatedInstance,
        spec: largeSpec,
        showMount: false,
        view: 'angled',
        projectPoint: rotatedProjector(rotatedInstance),
      }) ?? [],
    )
    const baseGlass = baseNodes.find((node) => node.id === 'lens-glass')
    const rotatedGlass = rotatedNodes.find((node) => node.id === 'lens-glass')

    expect(baseGlass?.kind).toBe('polyline')
    expect(rotatedGlass?.kind).toBe('polyline')
    if (baseGlass?.kind !== 'polyline' || rotatedGlass?.kind !== 'polyline') {
      throw new Error('Lens recipe did not emit projected glass polygons.')
    }

    const span = (points: Vector2Mm[], axis: 'x' | 'y') =>
      Math.max(...points.map((point) => point[axis])) -
      Math.min(...points.map((point) => point[axis]))

    expect(span(rotatedGlass.pointsMm, 'x')).toBeGreaterThan(span(baseGlass.pointsMm, 'x'))
    expect(span(rotatedGlass.pointsMm, 'y')).toBeGreaterThan(span(baseGlass.pointsMm, 'x'))
    expect(rotatedGlass.pointsMm).not.toEqual(baseGlass.pointsMm)
  })

  it('does not mutate component instances or resolved catalog specs', () => {
    const instance = makeComponent('laser-source', 3)
    const spec = getResolvedComponentSpec(instance.type, instance.variantId)
    const instanceBefore = structuredClone(instance)
    const specBefore = structuredClone(spec)

    createRealisticAppearance({
      instance,
      spec,
      showMount: true,
      view: 'angled',
      projectPoint: rotatedProjector(instance),
    })

    expect(instance).toEqual(instanceBefore)
    expect(spec).toEqual(specBefore)
  })

  it('uses catalog extrusion only for angled recipes', () => {
    const instance = makeComponent('detector')
    const spec = getResolvedComponentSpec(instance.type, instance.variantId)
    const elevations: number[] = []
    const projectPoint = (point: Vector2Mm, elevationMm = 0) => {
      elevations.push(elevationMm)
      return point
    }

    createRealisticAppearance({
      instance,
      spec,
      showMount: true,
      view: 'top-down',
      projectPoint,
    })
    expect(elevations.every((elevation) => elevation < 1)).toBe(true)

    elevations.length = 0
    createRealisticAppearance({
      instance,
      spec,
      showMount: true,
      view: 'angled',
      projectPoint,
    })
    expect(elevations.some((elevation) => elevation >= (spec.twoPointFiveDVisualPreset?.extrusionMm ?? 8))).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import {
  createDefaultComponentConfig,
  getComponentDefinition,
} from '../domain/componentCatalog'
import {
  createEmptyScene,
  parseSceneDocument,
  serializeSceneDocument,
} from '../domain/serialization'

describe('scene serialization', () => {
  it('round-trips a version 5 scene document through JSON', () => {
    const scene = createEmptyScene()
    const laserDefinition = getComponentDefinition('laser-source')
    const bboDefinition = getComponentDefinition('bbo-crystal')
    const lensDefinition = getComponentDefinition('lens')

    scene.beamSettings.beamFidelityMode = 'angle-sensitive'
    scene.components.push({
      id: 'laser-1',
      type: 'laser-source',
      label: 'Seed Laser',
      variantId: laserDefinition.defaultVariantId,
      anchorMm: { x: -60, y: 137.5 },
      rotationQuarterTurns: 0,
      config: {
        ...createDefaultComponentConfig(
          'laser-source',
          laserDefinition.defaultVariantId,
        ),
        source: {
          ...createDefaultComponentConfig(
            'laser-source',
            laserDefinition.defaultVariantId,
          ).source!,
          isEnabled: true,
          gaussianInputMode: 'explicit-waist',
          wavelengthNm: 800,
          powerMw: 120,
          firstTargetComponentId: 'bbo-1',
          waistRadiusMm: 0.45,
          waistOffsetMm: -18,
        },
      },
    })
    scene.components.push({
      id: 'lens-1',
      type: 'lens',
      label: 'Relay Lens',
      variantId: lensDefinition.defaultVariantId,
      anchorMm: { x: 110, y: 137.5 },
      rotationQuarterTurns: 0,
      config: {
        ...createDefaultComponentConfig('lens', lensDefinition.defaultVariantId),
        lens: {
          ...createDefaultComponentConfig('lens', lensDefinition.defaultVariantId)
            .lens!,
          focalLengthMm: 150,
          clearApertureMm: 23,
        },
      },
    })
    scene.components.push({
      id: 'bbo-1',
      type: 'bbo-crystal',
      label: 'Type I BBO',
      variantId: bboDefinition.defaultVariantId,
      anchorMm: { x: 150, y: 137.5 },
      rotationQuarterTurns: 0,
      config: {
        ...createDefaultComponentConfig(
          'bbo-crystal',
          bboDefinition.defaultVariantId,
        ),
        bboCrystal: {
          ...createDefaultComponentConfig(
            'bbo-crystal',
            bboDefinition.defaultVariantId,
          ).bboCrystal!,
          thicknessUm: 35,
          phaseMatchingAngleDeg: 28.9,
          interactionMode: 'advanced',
        },
      },
    })

    expect(parseSceneDocument(serializeSceneDocument(scene))).toEqual(scene)
  })

  it('migrates a version 1 scene into the version 5 family/variant model', () => {
    const legacyJson = JSON.stringify({
      kind: 'schema-lab.scene',
      version: 1,
      metadata: { name: 'Legacy Scene' },
      breadboard: createEmptyScene().breadboard,
      components: [
        {
          id: 'clamp-1',
          type: 'edge-clamp',
          label: 'Clamp',
          anchorMm: { x: 50, y: 50 },
          rotationQuarterTurns: 0,
        },
      ],
    })

    const migrated = parseSceneDocument(legacyJson)

    expect(migrated.version).toBe(5)
    expect(migrated.beamSettings.beamFidelityMode).toBe('geometric')
    expect(migrated.components[0]).toMatchObject({
      type: 'support-hardware',
      variantId: 'cf125c-m',
      label: 'Clamp',
    })
  })

  it('migrates a version 2 scene into version 5 with default polarization and Gaussian fields', () => {
    const v2Json = JSON.stringify({
      kind: 'schema-lab.scene',
      version: 2,
      metadata: { name: 'Version 2 Scene' },
      breadboard: createEmptyScene().breadboard,
      beamSettings: createEmptyScene().beamSettings,
      components: [
        {
          id: 'laser-1',
          type: 'laser-source',
          label: 'Seed',
          variantId: getComponentDefinition('laser-source').defaultVariantId,
          anchorMm: { x: -60, y: 137.5 },
          rotationQuarterTurns: 0,
          config: {
            source: {
              ...createDefaultComponentConfig('laser-source').source,
              isEnabled: true,
            },
          },
        },
        {
          id: 'bbo-1',
          type: 'bbo-crystal',
          label: 'BBO',
          variantId: getComponentDefinition('bbo-crystal').defaultVariantId,
          anchorMm: { x: 120, y: 137.5 },
          rotationQuarterTurns: 0,
          config: {
            bboCrystal: {
              ...createDefaultComponentConfig('bbo-crystal').bboCrystal,
            },
          },
        },
      ],
    })

    const migrated = parseSceneDocument(v2Json)
    const source = migrated.components.find((component) => component.id === 'laser-1')
    const bbo = migrated.components.find((component) => component.id === 'bbo-1')

    expect(migrated.version).toBe(5)
    expect(source?.config.source?.polarization).toMatchObject({
      basis: 'ray-local',
      presetId: 'linear-in-plane',
    })
    expect(source?.config.source?.gaussianInputMode).toBe('derived')
    expect(source?.config.source?.waistRadiusMm).toBeUndefined()
    expect(bbo?.config.bboCrystal?.polarizationAxisLocalDeg).toBe(0)
    expect(bbo?.config.support?.includeMount).toBe(true)
  })

  it('migrates a version 3 scene into version 5 with default Gaussian and lens fields', () => {
    const v3Json = JSON.stringify({
      kind: 'schema-lab.scene',
      version: 3,
      metadata: { name: 'Version 3 Scene' },
      breadboard: createEmptyScene().breadboard,
      beamSettings: createEmptyScene().beamSettings,
      components: [
        {
          id: 'laser-1',
          type: 'laser-source',
          label: 'Seed',
          variantId: getComponentDefinition('laser-source').defaultVariantId,
          anchorMm: { x: -60, y: 137.5 },
          rotationQuarterTurns: 0,
          config: {
            source: {
              ...createDefaultComponentConfig('laser-source').source,
              isEnabled: true,
            },
          },
        },
        {
          id: 'lens-1',
          type: 'lens',
          label: 'Lens',
          variantId: getComponentDefinition('lens').defaultVariantId,
          anchorMm: { x: 120, y: 137.5 },
          rotationQuarterTurns: 0,
          config: {},
        },
      ],
    })

    const migrated = parseSceneDocument(v3Json)
    const source = migrated.components.find((component) => component.id === 'laser-1')
    const lens = migrated.components.find((component) => component.id === 'lens-1')

    expect(migrated.version).toBe(5)
    expect(source?.config.source?.gaussianInputMode).toBe('derived')
    expect(lens?.config.lens).toMatchObject({
      focalLengthMm: 100,
      clearApertureMm: 22,
    })
    expect(lens?.config.support?.includeMount).toBe(true)
  })

  it('rejects unsupported scene versions', () => {
    const scene = createEmptyScene()
    const invalidJson = JSON.stringify({
      ...scene,
      version: 99,
    })

    expect(() => parseSceneDocument(invalidJson)).toThrow(
      'Unsupported scene version: 99.',
    )
  })
})

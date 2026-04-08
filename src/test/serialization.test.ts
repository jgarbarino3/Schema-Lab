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
import { convertSceneToOpticalTable } from '../domain/workspace'

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

  it('round-trips text, line, and shape annotations through JSON', () => {
    const scene = createEmptyScene()

    scene.annotations = [
      {
        id: 'line-1',
        kind: 'line',
        startMm: { x: 25, y: 40 },
        endMm: { x: 180, y: 40 },
        color: '#00eeff',
        strokeWidthMm: 0.8,
      },
      {
        id: 'text-1',
        kind: 'text',
        anchorMm: { x: 40, y: 62 },
        widthMm: 78,
        text: 'Pump path\nnotes',
        style: {
          fontFamily: 'mono',
          fontSizeMm: 5.2,
          color: '#ffeeaa',
          bold: true,
          italic: false,
          underline: true,
          align: 'center',
        },
      },
      {
        id: 'shape-1',
        kind: 'shape',
        shapeKind: 'ellipse',
        boundsMm: {
          x: 90,
          y: 90,
          width: 46,
          height: 22,
        },
        strokeColor: '#ff00ff',
        fillColor: 'transparent',
        strokeWidthMm: 1.2,
      },
    ]

    expect(parseSceneDocument(serializeSceneDocument(scene))).toEqual(scene)
  })

  it('migrates legacy line annotations without explicit kinds', () => {
    const scene = createEmptyScene()
    const legacyJson = JSON.stringify({
      ...scene,
      version: 7,
      annotations: [
        {
          id: 'legacy-line',
          startMm: { x: 10, y: 15 },
          endMm: { x: 90, y: 15 },
          color: '#ff0000',
          strokeWidthMm: 0.8,
        },
      ],
    })

    const migrated = parseSceneDocument(legacyJson)

    expect(migrated.version).toBe(8)
    expect(migrated.annotations[0]).toMatchObject({
      id: 'legacy-line',
      kind: 'line',
      color: '#ff0000',
    })
  })

  it('migrates a version 1 scene into the version 5 family/variant model', () => {
    const seedScene = createEmptyScene()
    const legacyJson = JSON.stringify({
      kind: 'schema-lab.scene',
      version: 1,
      metadata: { name: 'Legacy Scene' },
      breadboard:
        seedScene.workspace.kind === 'single-breadboard'
          ? seedScene.workspace.breadboard
          : undefined,
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

    expect(migrated.version).toBe(8)
    expect(migrated.beamSettings.beamFidelityMode).toBe('geometric')
    expect(migrated.components[0]).toMatchObject({
      type: 'support-hardware',
      variantId: 'cf125c-m',
      label: 'Clamp',
    })
  })

  it('migrates a version 2 scene into version 7 with default polarization and Gaussian fields', () => {
    const seedScene = createEmptyScene()
    const v2Json = JSON.stringify({
      kind: 'schema-lab.scene',
      version: 2,
      metadata: { name: 'Version 2 Scene' },
      breadboard:
        seedScene.workspace.kind === 'single-breadboard'
          ? seedScene.workspace.breadboard
          : undefined,
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

    expect(migrated.version).toBe(8)
    expect(source?.config.source?.polarization).toMatchObject({
      basis: 'ray-local',
      presetId: 'linear-in-plane',
    })
    expect(source?.config.source?.gaussianInputMode).toBe('derived')
    expect(source?.config.source?.waistRadiusMm).toBeUndefined()
    expect(bbo?.config.bboCrystal?.polarizationAxisLocalDeg).toBe(0)
    expect(bbo?.config.support?.includeMount).toBe(true)
  })

  it('migrates a version 3 scene into version 7 with default Gaussian and lens fields', () => {
    const seedScene = createEmptyScene()
    const v3Json = JSON.stringify({
      kind: 'schema-lab.scene',
      version: 3,
      metadata: { name: 'Version 3 Scene' },
      breadboard:
        seedScene.workspace.kind === 'single-breadboard'
          ? seedScene.workspace.breadboard
          : undefined,
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

    expect(migrated.version).toBe(8)
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

  it('defaults missing breadboard mount-plane metadata to the breadboard thickness', () => {
    const opticalTableScene = convertSceneToOpticalTable(createEmptyScene())

    if (opticalTableScene.workspace.kind !== 'optical-table') {
      throw new Error('expected optical-table workspace')
    }

    const legacyJson = JSON.stringify({
      ...opticalTableScene,
      workspace: {
        ...opticalTableScene.workspace,
        breadboards: opticalTableScene.workspace.breadboards.map(
          ({ mountPlaneOffsetMm: _mountPlaneOffsetMm, ...breadboard }) => breadboard,
        ),
      },
    })

    const parsed = parseSceneDocument(legacyJson)

    if (parsed.workspace.kind !== 'optical-table') {
      throw new Error('expected optical-table workspace')
    }

    expect(parsed.workspace.breadboards[0]?.mountPlaneOffsetMm).toBe(
      parsed.workspace.breadboards[0]?.model.thicknessMm,
    )
  })

  it('persists explicit breadboard mount-plane metadata through scene JSON', () => {
    const scene = convertSceneToOpticalTable(createEmptyScene())

    if (scene.workspace.kind !== 'optical-table') {
      throw new Error('expected optical-table workspace')
    }

    scene.workspace.breadboards[0]!.mountPlaneOffsetMm = 38

    const parsed = parseSceneDocument(serializeSceneDocument(scene))

    if (parsed.workspace.kind !== 'optical-table') {
      throw new Error('expected optical-table workspace')
    }

    expect(parsed.workspace.breadboards[0]?.mountPlaneOffsetMm).toBe(38)
  })
})

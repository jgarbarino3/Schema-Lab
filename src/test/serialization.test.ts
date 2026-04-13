import { describe, expect, it } from 'vitest'
import {
  createDefaultComponentConfig,
  getComponentDefinition,
} from '../domain/componentCatalog'
import {
  SCENE_DOCUMENT_VERSION,
} from '../domain/types'
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
    scene.components.push({
      id: 'flip-mirror-1',
      type: 'mirror',
      label: 'Main Flip',
      variantId: 'flip-mirror',
      anchorMm: { x: 90, y: 137.5 },
      rotationQuarterTurns: 0,
      config: {
        ...createDefaultComponentConfig('mirror', 'flip-mirror'),
        flipMirror: {
          isFlippedDown: false,
        },
      },
    })

    expect(parseSceneDocument(serializeSceneDocument(scene))).toEqual(scene)
  })

  it('round-trips mounted component attachment metadata and synced world anchors', () => {
    const scene = createEmptyScene()
    const stageVariantId = getComponentDefinition('sample-holder').defaultVariantId
    const irisVariantId = getComponentDefinition('iris').defaultVariantId

    scene.components.push(
      {
        id: 'stage-1',
        type: 'sample-holder',
        label: 'Sample / Stage 1',
        variantId: stageVariantId,
        anchorMm: { x: 150, y: 150 },
        rotationQuarterTurns: 0,
        config: createDefaultComponentConfig('sample-holder', stageVariantId),
      },
      {
        id: 'iris-1',
        type: 'iris',
        label: 'Iris 1',
        variantId: irisVariantId,
        anchorMm: { x: 0, y: 0 },
        rotationQuarterTurns: 0,
        attachment: {
          parentComponentId: 'stage-1',
          parentMountSiteId: 'optic-seat',
          localAnchorMm: { x: 6, y: -4 },
          localRotationQuarterTurns: 0,
        },
        config: createDefaultComponentConfig('iris', irisVariantId),
      },
    )

    const migrated = parseSceneDocument(serializeSceneDocument(scene))
    const mountedIris = migrated.components.find((component) => component.id === 'iris-1')

    expect(mountedIris?.attachment).toMatchObject({
      parentComponentId: 'stage-1',
      parentMountSiteId: 'optic-seat',
      localAnchorMm: { x: 6, y: -4 },
    })
    expect(mountedIris?.anchorMm).toEqual({ x: 156, y: 146 })
  })

  it('round-trips stage finishes and sample materials through scene JSON', () => {
    const scene = createEmptyScene()

    scene.components.push(
      {
        id: 'holder-1',
        type: 'sample-holder',
        label: 'Holder',
        variantId: 'slotted-silver-sample-holder',
        anchorMm: { x: 120, y: 120 },
        rotationQuarterTurns: 0,
        finishId: 'graphite',
        config: createDefaultComponentConfig('sample-holder', 'slotted-silver-sample-holder'),
      },
      {
        id: 'sample-1',
        type: 'sample',
        label: 'TiN Sample',
        variantId: 'tin-substrate',
        anchorMm: { x: 135, y: 120 },
        rotationQuarterTurns: 0,
        materialId: 'tin',
        config: createDefaultComponentConfig('sample', 'tin-substrate'),
      },
    )

    const parsed = parseSceneDocument(serializeSceneDocument(scene))

    expect(parsed.components.find((component) => component.id === 'holder-1')?.finishId).toBe(
      'graphite',
    )
    expect(parsed.components.find((component) => component.id === 'sample-1')?.materialId).toBe(
      'tin',
    )
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
        hidden: false,
        layerBand: 'below-components',
        locked: false,
        strokeWidthMm: 0.8,
        zIndex: 0,
      },
      {
        id: 'text-1',
        kind: 'text',
        anchorMm: { x: 40, y: 62 },
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        hidden: false,
        layerBand: 'above-components',
        locked: false,
        widthMm: 78,
        text: 'Pump path\nnotes',
        variant: 'plain',
        style: {
          fontFamily: 'mono',
          fontSizeMm: 5.2,
          color: '#ffeeaa',
          bold: true,
          italic: false,
          underline: true,
          align: 'center',
        },
        zIndex: 1,
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
        hidden: false,
        layerBand: 'above-components',
        locked: false,
        strokeWidthMm: 1.2,
        zIndex: 2,
      },
    ]

    expect(parseSceneDocument(serializeSceneDocument(scene))).toEqual(scene)
  })

  it('round-trips per-component simple icon style overrides through JSON', () => {
    const scene = createEmptyScene()
    const mirrorDefinition = getComponentDefinition('mirror')

    scene.components.push({
      id: 'mirror-1',
      type: 'mirror',
      label: 'Mirror 1',
      variantId: mirrorDefinition.defaultVariantId,
      anchorMm: { x: 125, y: 125 },
      rotationQuarterTurns: 0,
      simpleIconStyleOverride: 'classic',
      config: createDefaultComponentConfig('mirror', mirrorDefinition.defaultVariantId),
    })

    const parsed = parseSceneDocument(serializeSceneDocument(scene))

    expect(parsed.components[0]?.simpleIconStyleOverride).toBe('classic')
    expect(parsed).toEqual(scene)
  })

  it('round-trips enhanced simple icon overrides through JSON', () => {
    const scene = createEmptyScene()
    const lensDefinition = getComponentDefinition('lens')

    scene.components.push({
      id: 'lens-1',
      type: 'lens',
      label: 'Lens 1',
      variantId: lensDefinition.defaultVariantId,
      anchorMm: { x: 125, y: 125 },
      rotationQuarterTurns: 0,
      simpleIconStyleOverride: 'enhanced',
      config: createDefaultComponentConfig('lens', lensDefinition.defaultVariantId),
    })

    const parsed = parseSceneDocument(serializeSceneDocument(scene))

    expect(parsed.components[0]?.simpleIconStyleOverride).toBe('enhanced')
    expect(parsed).toEqual(scene)
  })

  it('maps legacy clean simple icon overrides onto enhanced', () => {
    const scene = createEmptyScene()
    const mirrorDefinition = getComponentDefinition('mirror')
    const legacyJson = JSON.stringify({
      ...scene,
      components: [
        {
          id: 'mirror-1',
          type: 'mirror',
          label: 'Mirror 1',
          variantId: mirrorDefinition.defaultVariantId,
          anchorMm: { x: 125, y: 125 },
          rotationQuarterTurns: 0,
          simpleIconStyleOverride: 'clean',
          config: createDefaultComponentConfig('mirror', mirrorDefinition.defaultVariantId),
        },
      ],
    })

    const parsed = parseSceneDocument(legacyJson)

    expect(parsed.components[0]?.simpleIconStyleOverride).toBe('enhanced')
  })

  it('maps legacy sample-stage components onto the compact slotted sample holder by default', () => {
    const scene = createEmptyScene()
    const legacyJson = JSON.stringify({
      ...scene,
      version: 11,
      components: [
        {
          id: 'stage-1',
          type: 'sample-stage',
          label: 'Legacy Stage',
          anchorMm: { x: 125, y: 125 },
          rotationQuarterTurns: 0,
          config: {},
        },
      ],
    })

    const parsed = parseSceneDocument(legacyJson)

    expect(parsed.components[0]).toMatchObject({
      type: 'sample-holder',
      variantId: 'compact-slotted-sample-holder',
      label: 'Legacy Stage',
    })
  })

  it('migrates legacy line annotations without explicit kinds', () => {
    const scene = createEmptyScene()
    const legacyJson = JSON.stringify({
      ...scene,
      version: 9,
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

    expect(migrated.version).toBe(SCENE_DOCUMENT_VERSION)
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

    expect(migrated.version).toBe(SCENE_DOCUMENT_VERSION)
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

    expect(migrated.version).toBe(SCENE_DOCUMENT_VERSION)
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

    expect(migrated.version).toBe(SCENE_DOCUMENT_VERSION)
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

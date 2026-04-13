import { createDefaultComponentConfig, getComponentDefinition } from './componentCatalog'
import { alignExternalSourceToTarget } from './placement'
import { createEmptyScene } from './serialization'
import type {
  ComponentConfig,
  ComponentInstance,
  ComponentType,
  QuarterTurn,
  SceneDocument,
  SourceConfig,
  Vector2Mm,
} from './types'

export const TUTORIAL_FOCUS_COMPONENT_ID = 'tutorial-delay-stage'

function cloneConfig<T extends ComponentConfig>(config: T): T {
  return JSON.parse(JSON.stringify(config)) as T
}

function createComponent(args: {
  anchorMm: Vector2Mm
  config?: ComponentConfig
  id: string
  label: string
  rotationQuarterTurns?: QuarterTurn
  type: ComponentType
  variantId?: string
}): ComponentInstance {
  const definition = getComponentDefinition(args.type)
  const variantId = args.variantId ?? definition.defaultVariantId

  return {
    id: args.id,
    type: args.type,
    label: args.label,
    variantId,
    anchorMm: args.anchorMm,
    rotationQuarterTurns: args.rotationQuarterTurns ?? 0,
    config: args.config ?? createDefaultComponentConfig(args.type, variantId),
  }
}

function createEnabledSource(
  id: string,
  label: string,
  targetId: string,
  yHintMm: number,
  overrides: Partial<SourceConfig>,
): ComponentInstance {
  const config = cloneConfig(createDefaultComponentConfig('laser-source'))
  const source = config.source!

  return createComponent({
    id,
    type: 'laser-source',
    label,
    anchorMm: { x: -60, y: yHintMm },
    config: {
      ...config,
      source: {
        ...source,
        isEnabled: true,
        firstTargetComponentId: targetId,
        gaussianInputMode: 'explicit-waist',
        waistRadiusMm: 0.35,
        waistOffsetMm: -45,
        ...overrides,
      },
    },
  })
}

function alignSource(scene: SceneDocument, source: ComponentInstance) {
  if (scene.workspace.kind !== 'single-breadboard') {
    return source
  }

  const sourceConfig = source.config.source

  if (!sourceConfig) {
    return source
  }

  const target = scene.components.find(
    (component) => component.id === sourceConfig.firstTargetComponentId,
  )
  const aligned = alignExternalSourceToTarget({
    breadboard: scene.workspace.breadboard,
    lane: sourceConfig.lane,
    source,
    target,
  })

  return {
    ...source,
    anchorMm: aligned.anchorMm,
    rotationQuarterTurns: aligned.rotationQuarterTurns,
  }
}

export function createTutorialScene(): SceneDocument {
  const scene = createEmptyScene()

  if (scene.workspace.kind !== 'single-breadboard') {
    return scene
  }

  scene.metadata.name = 'Tutorial Example Setup'
  scene.workspace.breadboard.label = 'Tutorial Breadboard 425 × 350'
  scene.workspace.breadboard.widthMm = 425
  scene.workspace.breadboard.heightMm = 350

  const steeringMirror = createComponent({
    id: 'tutorial-mirror-steering',
    type: 'mirror',
    label: 'Mirror 1',
    anchorMm: { x: 120, y: 95 },
  })
  const curvedMirror = createComponent({
    id: 'tutorial-curved-mirror',
    type: 'curved-mirror',
    variantId: 'concave-1in',
    label: 'Curved Mirror 1',
    anchorMm: { x: 120, y: 55 },
    rotationQuarterTurns: 3,
    config: {
      ...createDefaultComponentConfig('mirror', 'concave-1in'),
      curvedMirror: {
        radiusOfCurvatureMm: 180,
        isConvex: false,
      },
    },
  })
  const steeringDetector = createComponent({
    id: 'tutorial-steering-detector',
    type: 'detector',
    label: 'Detector 1',
    anchorMm: { x: 52, y: 55 },
    rotationQuarterTurns: 2,
  })

  const attenuator = createComponent({
    id: 'tutorial-attenuator',
    type: 'attenuator',
    label: 'Attenuator 1',
    anchorMm: { x: 82, y: 235 },
    config: {
      ...createDefaultComponentConfig('attenuator', 'variable-nd-horizontal'),
      attenuator: {
        transmissionPercent: 62,
        orientation: 'horizontal',
      },
    },
  })
  const waveplate = createComponent({
    id: 'tutorial-waveplate',
    type: 'waveplate',
    label: 'Waveplate 1',
    anchorMm: { x: 122, y: 235 },
    config: {
      ...createDefaultComponentConfig('waveplate', 'half-wave'),
      waveplate: {
        kind: 'half',
        axisLocalDeg: 22.5,
        retardanceDeg: 180,
        insertionLossPercent: 2,
      },
    },
  })
  const polarizer = createComponent({
    id: 'tutorial-polarizer',
    type: 'polarizer',
    label: 'Polarizer 1',
    anchorMm: { x: 162, y: 235 },
    config: {
      ...createDefaultComponentConfig('polarizer'),
      polarizer: {
        axisLocalDeg: 0,
        extinctionRatio: 1000,
        insertionLossPercent: 12,
      },
    },
  })
  const delayStage = createComponent({
    id: TUTORIAL_FOCUS_COMPONENT_ID,
    type: 'delay-stage',
    variantId: 'pi-m-112-1dg1',
    label: 'Delay Stage 1',
    anchorMm: { x: 222, y: 235 },
    config: {
      ...createDefaultComponentConfig('delay-stage', 'pi-m-112-1dg1'),
      delayLine: {
        positionMm: 7.5,
        travelMm: 25,
        topology: 'double-pass',
        zeroDelayOffsetFs: 0,
      },
    },
  })
  const telescope = createComponent({
    id: 'tutorial-telescope',
    type: 'telescope',
    variantId: 'reflective-compressor-2x',
    label: 'Telescope 1',
    anchorMm: { x: 295, y: 235 },
    config: {
      ...createDefaultComponentConfig('telescope', 'reflective-compressor-2x'),
      telescope: {
        mode: 'reflection',
        element1Mm: 200,
        element2Mm: 100,
        separationMm: 300,
        clearApertureMm: 25.4,
      },
    },
  })
  const bbo = createComponent({
    id: 'tutorial-bbo',
    type: 'bbo-crystal',
    label: 'BBO 1',
    anchorMm: { x: 358, y: 235 },
    config: {
      ...createDefaultComponentConfig('bbo-crystal'),
      bboCrystal: {
        crystalType: 'type-i',
        interactionMode: 'advanced',
        thicknessUm: 300,
        phaseMatchingAngleDeg: 29.2,
        polarizationAxisLocalDeg: 0,
      },
    },
  })
  const mainDetector = createComponent({
    id: 'tutorial-main-detector',
    type: 'detector',
    label: 'Detector 2',
    anchorMm: { x: 402, y: 235 },
  })

  const steeringSource = createEnabledSource(
    'tutorial-source-steering',
    'Laser Source 1',
    steeringMirror.id,
    steeringMirror.anchorMm.y,
    {
      lane: 'left',
      wavelengthNm: 515,
      bandwidthNm: 4,
      powerMw: 28,
      normalizedPowerPercent: 100,
      beamDiameterMm: 1.2,
      divergenceMrad: 1.1,
    },
  )

  const mainSource = createEnabledSource(
    'tutorial-source-main',
    'Laser Source 2',
    attenuator.id,
    attenuator.anchorMm.y,
    {
      lane: 'left',
      wavelengthNm: 800,
      bandwidthNm: 10,
      powerMw: 120,
      normalizedPowerPercent: 100,
      beamDiameterMm: 1.5,
      divergenceMrad: 1.3,
    },
  )

  scene.components = [
    steeringMirror,
    curvedMirror,
    steeringDetector,
    attenuator,
    waveplate,
    polarizer,
    delayStage,
    telescope,
    bbo,
    mainDetector,
  ]

  scene.components.push(alignSource(scene, steeringSource))
  scene.components.push(alignSource(scene, mainSource))

  return scene
}

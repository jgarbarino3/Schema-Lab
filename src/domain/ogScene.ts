import { createDefaultComponentConfig, getComponentDefinition } from './componentCatalog'
import { alignExternalSourceToTarget } from './placement'
import type {
  AnnotationText,
  ComponentConfig,
  ComponentInstance,
  ComponentType,
  QuarterTurn,
  SceneDocument,
  SourceConfig,
  Vector2Mm,
} from './types'
import { createEmptyScene } from './serialization'
import { syncAttachedComponentTransforms } from './workspace'

export const OG_SELECTED_COMPONENT_ID = 'tutorial-sample-holder'

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

function createOgCallout(): AnnotationText {
  return {
    id: 'og-callout',
    kind: 'text',
    anchorMm: { x: 344, y: 338 },
    backgroundColor: 'rgba(8, 15, 22, 0.9)',
    borderColor: '#71d0ff',
    hidden: false,
    layerBand: 'above-components',
    locked: true,
    widthMm: 170,
    text: 'Folded ultrafast sample line with diagnostic pickoff, steering mirrors, cleanup optics, and a BBO FROG gate.',
    variant: 'note-card',
    style: {
      fontFamily: 'clean-sans',
      fontSizeMm: 4.8,
      color: '#f3fbff',
      bold: true,
      italic: false,
      underline: false,
      align: 'left',
    },
    zIndex: 0,
  }
}

export function createOgTutorialScene(): SceneDocument {
  const scene = createEmptyScene()

  if (scene.workspace.kind !== 'single-breadboard') {
    return scene
  }

  scene.metadata.name = 'Tutorial Example Setup'
  scene.workspace.breadboard.label = 'Folded Sample-Line Breadboard 650 × 400'
  scene.workspace.breadboard.widthMm = 650
  scene.workspace.breadboard.heightMm = 400

  const attenuator = createComponent({
    id: 'tutorial-attenuator',
    type: 'attenuator',
    label: 'Variable ND',
    anchorMm: { x: 87.5, y: 312.5 },
    config: {
      ...createDefaultComponentConfig('attenuator', 'variable-nd-horizontal'),
      attenuator: {
        transmissionPercent: 68,
        orientation: 'horizontal',
      },
    },
  })
  const waveplate = createComponent({
    id: 'tutorial-waveplate',
    type: 'waveplate',
    label: 'Half-Wave Plate',
    anchorMm: { x: 162.5, y: 312.5 },
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
    label: 'Linear Polarizer',
    anchorMm: { x: 237.5, y: 312.5 },
    config: {
      ...createDefaultComponentConfig('polarizer'),
      polarizer: {
        axisLocalDeg: 0,
        extinctionRatio: 1000,
        insertionLossPercent: 12,
      },
    },
  })
  const pickoff = createComponent({
    id: 'tutorial-pickoff',
    type: 'beamsplitter',
    variantId: 'plate-1in',
    label: 'Diagnostic Pickoff',
    anchorMm: { x: 312.5, y: 312.5 },
    config: {
      ...createDefaultComponentConfig('beamsplitter', 'plate-1in'),
      beamSplitter: {
        reflectPercent: 18,
        lossPercent: 2,
      },
    },
  })
  const pickoffDetector = createComponent({
    id: 'tutorial-pickoff-detector',
    type: 'detector',
    label: 'Pickoff Detector',
    anchorMm: { x: 312.5, y: 212.5 },
    rotationQuarterTurns: 1,
  })
  const liftMirror = createComponent({
    id: 'tutorial-mirror-lift',
    type: 'mirror',
    variantId: 'pf10-03-p01',
    label: 'Mirror M1',
    anchorMm: { x: 387.5, y: 312.5 },
    config: createDefaultComponentConfig('mirror', 'pf10-03-p01'),
  })
  const sampleRailMirror = createComponent({
    id: 'tutorial-mirror-sample-rail',
    type: 'mirror',
    variantId: 'pf10-03-p01',
    label: 'Mirror M2',
    anchorMm: { x: 387.5, y: 112.5 },
    config: createDefaultComponentConfig('mirror', 'pf10-03-p01'),
  })
  const lens = createComponent({
    id: 'tutorial-lens',
    type: 'lens',
    variantId: 'thin-lens-150mm',
    label: '150 mm Lens',
    anchorMm: { x: 462.5, y: 112.5 },
    config: createDefaultComponentConfig('lens', 'thin-lens-150mm'),
  })
  const iris = createComponent({
    id: 'tutorial-iris',
    type: 'iris',
    label: 'Cleanup Iris',
    anchorMm: { x: 512.5, y: 112.5 },
    config: {
      ...createDefaultComponentConfig('iris'),
      iris: {
        apertureMm: 8,
      },
    },
  })
  const sampleHolder = createComponent({
    id: OG_SELECTED_COMPONENT_ID,
    type: 'sample-holder',
    variantId: 'thorlabs-km100b-m',
    label: 'Sample Holder',
    anchorMm: { x: 562.5, y: 112.5 },
    config: createDefaultComponentConfig('sample-holder', 'thorlabs-km100b-m'),
  })
  const sample = createComponent({
    id: 'tutorial-sample',
    type: 'sample',
    variantId: 'generic-sample-chip',
    label: 'Sample Chip',
    anchorMm: { x: 550.5, y: 102.5 },
    config: createDefaultComponentConfig('sample', 'generic-sample-chip'),
  })
  sample.attachment = {
    parentComponentId: sampleHolder.id,
    parentMountSiteId: 'sample-seat',
    localAnchorMm: { x: -4, y: -2 },
    localRotationQuarterTurns: 0,
  }
  const detector = createComponent({
    id: 'tutorial-detector',
    type: 'detector',
    label: 'Detector',
    anchorMm: { x: 612.5, y: 112.5 },
  })
  const source = createEnabledSource(
    'tutorial-source',
    '800 nm Source',
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
    attenuator,
    waveplate,
    polarizer,
    pickoff,
    pickoffDetector,
    liftMirror,
    sampleRailMirror,
    lens,
    iris,
    sampleHolder,
    sample,
    detector,
  ]
  scene.components.push(alignSource(scene, source))

  return syncAttachedComponentTransforms(scene)
}

export function createOgScene(): SceneDocument {
  const scene = createOgTutorialScene()

  if (scene.workspace.kind !== 'single-breadboard') {
    return scene
  }

  scene.metadata.name = 'Schema-Lab OG Scene'
  scene.workspace.breadboard.label = 'Ultrafast Diagnostics Breadboard 650 × 400'

  const sampleHolder = scene.components.find(
    (component) => component.id === OG_SELECTED_COMPONENT_ID,
  )
  if (sampleHolder) {
    sampleHolder.label = 'BBO FROG Gate'
  }

  const pickoffDetector = scene.components.find(
    (component) => component.id === 'tutorial-pickoff-detector',
  )
  if (pickoffDetector) {
    pickoffDetector.label = 'Reference PD'
  }

  const detector = scene.components.find((component) => component.id === 'tutorial-detector')
  if (detector) {
    detector.label = 'SHG Spectrometer'
  }

  const source = scene.components.find((component) => component.id === 'tutorial-source')
  if (source?.config.source) {
    source.label = 'Few-cycle source'
    source.config = {
      ...source.config,
      source: {
        ...source.config.source,
        beamDiameterMm: 2,
        normalizedPowerPercent: 100,
        powerMw: 160,
        waistOffsetMm: -55,
        waistRadiusMm: 0.42,
      },
    }
  }

  const attenuator = scene.components.find((component) => component.id === 'tutorial-attenuator')
  if (attenuator) {
    attenuator.label = 'Power trim'
  }

  const waveplate = scene.components.find((component) => component.id === 'tutorial-waveplate')
  if (waveplate) {
    waveplate.label = 'HWP'
  }

  const polarizer = scene.components.find((component) => component.id === 'tutorial-polarizer')
  if (polarizer) {
    polarizer.label = 'Thin-film polarizer'
  }

  const pickoff = scene.components.find((component) => component.id === 'tutorial-pickoff')
  if (pickoff) {
    pickoff.label = 'Reference pickoff'
  }

  const lens = scene.components.find((component) => component.id === 'tutorial-lens')
  if (lens) {
    lens.label = 'Focusing lens'
  }

  const iris = scene.components.find((component) => component.id === 'tutorial-iris')
  if (iris) {
    iris.label = 'Spatial cleanup iris'
  }

  const sample = scene.components.find((component) => component.id === 'tutorial-sample')
  if (sample) {
    sample.label = 'BBO crystal'
  }

  scene.annotations = [createOgCallout()]

  return syncAttachedComponentTransforms(scene)
}

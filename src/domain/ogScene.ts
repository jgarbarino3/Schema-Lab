import { createTutorialScene } from './tutorialScene'
import type { AnnotationText, SceneDocument } from './types'
import { syncAttachedComponentTransforms } from './workspace'

export const OG_SELECTED_COMPONENT_ID = 'tutorial-sample-holder'

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

export function createOgScene(): SceneDocument {
  const scene = createTutorialScene()

  if (scene.workspace.kind !== 'single-breadboard') {
    return scene
  }

  scene.metadata.name = 'Schema-Lab OG Scene'
  scene.workspace.breadboard.label = 'Ultrafast Diagnostics Breadboard 650 × 400'

  const sampleHolder = scene.components.find(
    (component) => component.id === 'tutorial-sample-holder',
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

  const attenuator = scene.components.find(
    (component) => component.id === 'tutorial-attenuator',
  )
  if (attenuator) {
    attenuator.label = 'Power trim'
  }

  const waveplate = scene.components.find(
    (component) => component.id === 'tutorial-waveplate',
  )
  if (waveplate) {
    waveplate.label = 'HWP'
  }

  const polarizer = scene.components.find(
    (component) => component.id === 'tutorial-polarizer',
  )
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

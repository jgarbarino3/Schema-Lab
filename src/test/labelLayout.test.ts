import { describe, expect, it } from 'vitest'
import {
  boundsIntersectPx,
  getComponentLabelPlacements,
  layoutFloatingLabels,
} from '../canvas/labelLayout'
import { createTutorialScene } from '../domain/tutorialScene'
import type { ViewportState } from '../domain/types'

const tutorialViewport: ViewportState = {
  cameraCenterMm: { x: 325, y: 200 },
  canvasSizePx: { width: 1800, height: 980 },
  zoomPxPerMm: 2.25,
}

describe('canvas label layout', () => {
  it('keeps folded tutorial component labels horizontal and non-overlapping', () => {
    const scene = createTutorialScene()
    const labels = getComponentLabelPlacements({
      components: scene.components,
      renderMode: 'simple',
      selectedComponentId: 'tutorial-sample-holder',
      viewport: tutorialViewport,
    })
    const pickoffDetectorLabel = labels.find(
      (label) => label.id === 'tutorial-pickoff-detector',
    )

    expect(pickoffDetectorLabel).toBeDefined()
    expect(pickoffDetectorLabel?.text).toBe('Pickoff Detector')
    expect(pickoffDetectorLabel?.bounds.width).toBeGreaterThan(50)

    for (let leftIndex = 0; leftIndex < labels.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < labels.length;
        rightIndex += 1
      ) {
        expect(
          boundsIntersectPx(labels[leftIndex].bounds, labels[rightIndex].bounds, 1),
        ).toBe(false)
      }
    }
  })

  it('moves dense floating readouts away from occupied label space', () => {
    const labels = layoutFloatingLabels({
      labels: [
        {
          anchorPx: { x: 240, y: 180 },
          fontSizePx: 9,
          id: 'first',
          lines: ['path-1 / 120 mW'],
          minWidthPx: 48,
        },
        {
          anchorPx: { x: 246, y: 181 },
          fontSizePx: 9,
          id: 'second',
          lines: ['path-1 / 83 mW'],
          minWidthPx: 48,
        },
      ],
      obstacles: [{ x: 248, y: 150, width: 110, height: 28 }],
      viewport: tutorialViewport,
    })

    expect(boundsIntersectPx(labels[0].bounds, labels[1].bounds, 1)).toBe(false)
    expect(boundsIntersectPx(labels[0].bounds, { x: 248, y: 150, width: 110, height: 28 }, 1)).toBe(false)
    expect(boundsIntersectPx(labels[1].bounds, { x: 248, y: 150, width: 110, height: 28 }, 1)).toBe(false)
  })
})

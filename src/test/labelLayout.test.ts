import { describe, expect, it } from 'vitest'
import {
  boundsIntersectPx,
  getComponentLabelPlacements,
  getProjectedComponentLabelPlacements,
  layoutFloatingLabels,
} from '../canvas/labelLayout'
import { createTutorialScene } from '../domain/tutorialScene'
import { convertSceneToOpticalTable } from '../domain/workspace'
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

  it('keeps projected realistic tutorial labels from colliding', () => {
    const scene = convertSceneToOpticalTable(createTutorialScene())
    const projectedViewports: ViewportState[] = [
      {
        cameraCenterMm: { x: 1800, y: 750 },
        canvasSizePx: { width: 1600, height: 980 },
        zoomPxPerMm: 0.44,
      },
      {
        cameraCenterMm: { x: 1800, y: 750 },
        canvasSizePx: { width: 1087, height: 762 },
        zoomPxPerMm: 0.93,
      },
    ]

    for (const projectedViewport of projectedViewports) {
      const labels = getProjectedComponentLabelPlacements({
        components: scene.components,
        scene,
        selectedComponentId: 'tutorial-sample-holder',
        viewport: projectedViewport,
      })

      expect(labels).toHaveLength(scene.components.length)

      for (let leftIndex = 0; leftIndex < labels.length; leftIndex += 1) {
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < labels.length;
          rightIndex += 1
        ) {
          expect(
            boundsIntersectPx(labels[leftIndex].bounds, labels[rightIndex].bounds, 1),
            `${labels[leftIndex].id} ${JSON.stringify(labels[leftIndex].bounds)} overlaps ${labels[rightIndex].id} ${JSON.stringify(labels[rightIndex].bounds)}`,
          ).toBe(false)
        }
      }
    }
  })
})

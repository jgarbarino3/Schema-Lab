import { describe, expect, it } from 'vitest'
import { getResolvedComponentSpec } from '../domain/componentCatalog'
import { worldToScreen } from '../domain/geometry'
import {
  createComponentCatalogPreviewViewport,
  getComponentCatalogPreviewBoundsMm,
} from '../ui/componentCatalogPreviewViewport'

const CANVAS_SIZE_PX = { width: 124, height: 86 }
const PADDING_PX = 10

function expectCatalogSpecContained(type: Parameters<typeof getResolvedComponentSpec>[0], variantId: string) {
  const spec = getResolvedComponentSpec(type, variantId)
  const bounds = getComponentCatalogPreviewBoundsMm(spec)
  const viewport = createComponentCatalogPreviewViewport(
    spec,
    CANVAS_SIZE_PX,
    PADDING_PX,
  )
  const topLeft = worldToScreen({ x: bounds.x, y: bounds.y }, viewport)
  const bottomRight = worldToScreen(
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    viewport,
  )

  expect(topLeft.x).toBeGreaterThanOrEqual(PADDING_PX - 1e-6)
  expect(topLeft.y).toBeGreaterThanOrEqual(PADDING_PX - 1e-6)
  expect(bottomRight.x).toBeLessThanOrEqual(CANVAS_SIZE_PX.width - PADDING_PX + 1e-6)
  expect(bottomRight.y).toBeLessThanOrEqual(CANVAS_SIZE_PX.height - PADDING_PX + 1e-6)
  expect(viewport.cameraCenterMm).toEqual({
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  })

  return viewport
}

describe('component catalog preview viewport', () => {
  it('contains the giant Libra source in the real thumbnail canvas', () => {
    const viewport = expectCatalogSpecContained('laser-source', 'libra')

    expect(viewport.zoomPxPerMm).toBeLessThan(0.4)
  })

  it('centers and contains a small catalog optic without applying editor fit limits', () => {
    const viewport = expectCatalogSpecContained('mirror', 'bb1-e02')

    expect(viewport.zoomPxPerMm).toBeGreaterThan(0.4)
  })

  it('fits a wide rectangular source without clipping either axis', () => {
    expectCatalogSpecContained('laser-source', 'compact-table-source')
  })
})

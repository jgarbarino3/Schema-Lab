import type { ResolvedComponentSpec, ViewportState } from '../domain/types'

interface ThumbnailCanvasSizePx {
  width: number
  height: number
}

export function getComponentCatalogPreviewBoundsMm(
  spec: Pick<ResolvedComponentSpec, 'hitBoundsMm' | 'visualBodyBoundsMm'>,
) {
  const minX = Math.min(spec.hitBoundsMm.x, spec.visualBodyBoundsMm.x)
  const minY = Math.min(spec.hitBoundsMm.y, spec.visualBodyBoundsMm.y)
  const maxX = Math.max(
    spec.hitBoundsMm.x + spec.hitBoundsMm.width,
    spec.visualBodyBoundsMm.x + spec.visualBodyBoundsMm.width,
  )
  const maxY = Math.max(
    spec.hitBoundsMm.y + spec.hitBoundsMm.height,
    spec.visualBodyBoundsMm.y + spec.visualBodyBoundsMm.height,
  )

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

export function createComponentCatalogPreviewViewport(
  spec: Pick<ResolvedComponentSpec, 'hitBoundsMm' | 'visualBodyBoundsMm'>,
  canvasSizePx: ThumbnailCanvasSizePx,
  paddingPx: number,
): ViewportState {
  const boundsMm = getComponentCatalogPreviewBoundsMm(spec)
  const safePaddingPx = Math.max(0, paddingPx)
  const availableWidthPx = Math.max(1, canvasSizePx.width - safePaddingPx * 2)
  const availableHeightPx = Math.max(1, canvasSizePx.height - safePaddingPx * 2)
  const zoomPxPerMm = Math.min(
    availableWidthPx / Math.max(boundsMm.width, Number.EPSILON),
    availableHeightPx / Math.max(boundsMm.height, Number.EPSILON),
  )

  return {
    zoomPxPerMm,
    cameraCenterMm: {
      x: boundsMm.x + boundsMm.width / 2,
      y: boundsMm.y + boundsMm.height / 2,
    },
    canvasSizePx,
  }
}

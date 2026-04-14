import { describe, expect, it } from 'vitest'
import { detectRasterImportCandidates } from '../domain/rasterImportRecognition'
import { createImportPreviewItemsFromRasterCandidates } from '../domain/svgImport'

function createImageData(args: { height: number; width: number }) {
  const data = new Uint8ClampedArray(args.width * args.height * 4)

  for (let y = 0; y < args.height; y += 1) {
    for (let x = 0; x < args.width; x += 1) {
      const offset = (y * args.width + x) * 4
      data[offset] = 22
      data[offset + 1] = 28
      data[offset + 2] = 35
      data[offset + 3] = 255
    }
  }

  return {
    data,
    height: args.height,
    width: args.width,
  } as ImageData
}

function paintRect(
  imageData: ImageData,
  bounds: { height: number; width: number; x: number; y: number },
  color: [number, number, number],
) {
  const { data, width } = imageData

  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const offset = (y * width + x) * 4
      data[offset] = color[0]
      data[offset + 1] = color[1]
      data[offset + 2] = color[2]
      data[offset + 3] = 255
    }
  }
}

describe('raster import recognition', () => {
  it('detects schematic-style colored clusters as raster candidates', () => {
    const imageData = createImageData({ height: 110, width: 180 })

    paintRect(imageData, { x: 26, y: 26, width: 12, height: 12 }, [64, 228, 255])
    paintRect(imageData, { x: 86, y: 42, width: 28, height: 12 }, [72, 214, 255])

    const candidates = detectRasterImportCandidates({ imageData })
    const previewItems = createImportPreviewItemsFromRasterCandidates({ candidates })

    expect(candidates.length).toBeGreaterThanOrEqual(2)
    expect(previewItems.every((item) => item.kind === 'raster-candidate')).toBe(true)
    expect(previewItems.every((item) => item.disposition === 'skip')).toBe(true)
    expect(previewItems.some((item) => item.suggestions.length > 0)).toBe(true)
  })
})

import { DOMParser, type Document } from '@xmldom/xmldom'
import Konva from 'konva'
import { describe, expect, it } from 'vitest'
import { createPresentationSvg } from '../canvas/presentationSvgExport'

function getElementById(document: Document, id: string) {
  return Array.from(document.getElementsByTagName('*')).find(
    (element) => element.getAttribute('id') === id,
  )
}

function parseSvg(svg: string) {
  const parseErrors: string[] = []
  const document = new DOMParser({
    onError: (level, message) => {
      parseErrors.push(`${level}: ${message}`)
    },
  }).parseFromString(svg, 'image/svg+xml')

  const svgElement = document.documentElement
  if (!svgElement) throw new Error('SVG export has no root element')
  expect(parseErrors).toEqual([])
  expect(svgElement.tagName).toBe('svg')
  expect(svgElement.namespaceURI).toBe('http://www.w3.org/2000/svg')

  return { document, svgElement }
}

describe('presentation SVG export', () => {
  it('preserves editable native geometry, styling, and nested presentation transforms', () => {
    const scene = new Konva.Group({ width: 320, height: 180, id: 'scene-root' })
    const nested = new Konva.Group({
      id: 'nested-layout',
      x: 24,
      y: 16,
      rotation: 12,
      scaleX: 1.15,
      scaleY: 0.9,
      opacity: 0.65,
    })
    const roundedGradient = new Konva.Rect({
      id: 'rounded-gradient',
      x: 8,
      y: 10,
      width: 80,
      height: 44,
      cornerRadius: [4, 8, 12, 16],
      fillPriority: 'linear-gradient',
      fillLinearGradientStartPoint: { x: 0, y: 0 },
      fillLinearGradientEndPoint: { x: 80, y: 0 },
      fillLinearGradientColorStops: [0, '#112233', 1, '#aabbcc'],
      stroke: '#f0f4f8',
      strokeWidth: 2,
      opacity: 0.8,
    })
    const curvedLine = new Konva.Line({
      id: 'curved-path',
      points: [0, 74, 42, 54, 86, 82, 132, 58],
      tension: 0.45,
      stroke: '#66ddff',
      strokeWidth: 3,
      lineCap: 'round',
    })
    const ellipse = new Konva.Ellipse({
      id: 'optic-ellipse',
      x: 146,
      y: 34,
      radiusX: 18,
      radiusY: 11,
      fill: '#d4e7ef',
    })
    const arrow = new Konva.Arrow({
      id: 'beam-arrow',
      points: [110, 92, 188, 108],
      pointerAtBeginning: true,
      pointerAtEnding: true,
      pointerLength: 12,
      pointerWidth: 10,
      fill: '#ffb85c',
      stroke: '#ffb85c',
      strokeWidth: 2,
    })
    const hidden = new Konva.Rect({
      id: 'hidden-editor-node',
      width: 200,
      height: 100,
      fill: '#ff00ff',
      visible: false,
    })

    nested.add(roundedGradient, curvedLine, ellipse, arrow, hidden)
    scene.add(nested)

    const svg = createPresentationSvg(scene, {
      title: 'R&D <layout> "A&B"',
    })
    const { document, svgElement } = parseSvg(svg)

    expect(svgElement.getAttribute('width')).toBe('320')
    expect(svgElement.getAttribute('height')).toBe('180')
    expect(document.getElementsByTagName('title')[0]?.textContent).toBe(
      'R&D <layout> "A&B" · Schema-Lab presentation',
    )
    expect(svg).not.toContain('<image')
    expect(getElementById(document, 'hidden-editor-node')).toBeUndefined()

    const nestedElement = getElementById(document, 'nested-layout')
    expect(nestedElement?.getAttribute('opacity')).toBe('0.65')
    expect(nestedElement?.getAttribute('transform')).toMatch(
      /^matrix\((?!1 0 0 1 0 0)[^)]+\)$/,
    )

    const roundedGroup = getElementById(document, 'rounded-gradient')
    const roundedPath = roundedGroup?.getElementsByTagName('path')[0]
    expect(roundedGroup?.getAttribute('opacity')).toBe('0.8')
    expect(roundedPath?.getAttribute('d')).toBe(
      'M 4 0 H 72 Q 80 0 80 8 V 32 Q 80 44 68 44 H 16 Q 0 44 0 28 V 4 Q 0 0 4 0 Z',
    )
    expect(roundedPath?.getAttribute('fill')).toMatch(/^url\(#paint-\d+\)$/)

    const gradients = document.getElementsByTagName('linearGradient')
    expect(gradients).toHaveLength(1)
    expect(gradients[0]?.getAttribute('gradientUnits')).toBe('userSpaceOnUse')
    expect(Array.from(gradients[0]?.getElementsByTagName('stop') ?? []).map((stop) => ({
      color: stop.getAttribute('stop-color'),
      offset: stop.getAttribute('offset'),
    }))).toEqual([
      { color: '#112233', offset: '0' },
      { color: '#aabbcc', offset: '1' },
    ])

    const curvedPath = getElementById(document, 'curved-path')
      ?.getElementsByTagName('path')[0]
    expect(curvedPath?.getAttribute('d')).toMatch(/^M .* Q .* C .* Q /)
    expect(curvedPath?.getAttribute('stroke-linecap')).toBe('round')

    const ellipseElement = getElementById(document, 'optic-ellipse')
      ?.getElementsByTagName('ellipse')[0]
    expect(ellipseElement?.getAttribute('rx')).toBe('18')
    expect(ellipseElement?.getAttribute('ry')).toBe('11')

    const arrowPaths = getElementById(document, 'beam-arrow')
      ?.getElementsByTagName('path')
    expect(arrowPaths?.length).toBe(3)
    const arrowheadTransforms = Array.from(arrowPaths ?? [])
      .slice(1)
      .map((path) => path.getAttribute('transform') ?? '')
    expect(arrowheadTransforms[0]).toMatch(/^translate\(110 92\) rotate\(-168\.4/)
    expect(arrowheadTransforms[1]).toMatch(/^translate\(188 108\) rotate\(11\.59/)
  })

  it('fails closed for unsupported primitives instead of embedding a raster fallback', () => {
    const scene = new Konva.Group({ width: 200, height: 120 })
    scene.add(new Konva.Star({
      id: 'unsupported-star',
      x: 30,
      y: 30,
      numPoints: 5,
      innerRadius: 8,
      outerRadius: 16,
      fill: '#ffffff',
    }))

    expect(() => createPresentationSvg(scene, { title: 'Unsupported' })).toThrow(
      'Unsupported presentation primitive: Star. Export was not rasterized.',
    )
  })
})

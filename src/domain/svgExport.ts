import { createVectorExportSceneGraph, type VectorNode, type VectorNodeStyle } from './vectorExportScene'
import type { ExportScope, SvgExportPreset } from './exportLayout'
import type {
  BeamTraceResult,
  GaussianTraceResult,
  RenderMode,
  SceneDocument,
} from './types'

interface CreateSceneSvgArgs {
  beamTrace: BeamTraceResult
  breadboardSurfaceId?: string
  gaussianTrace: GaussianTraceResult
  renderMode: RenderMode
  scene: SceneDocument
  scope: ExportScope
  showGaussianEnvelope: boolean
  svgPreset?: SvgExportPreset
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function normalizePoint(value: number, offset: number) {
  return Number((value - offset).toFixed(6))
}

function renderStyle(style?: VectorNodeStyle) {
  if (!style) {
    return ''
  }

  const parts: string[] = []

  if (style.fill) {
    parts.push(`fill="${style.fill}"`)
  } else {
    parts.push('fill="none"')
  }

  if (style.fillOpacity !== undefined) {
    parts.push(`fill-opacity="${style.fillOpacity}"`)
  }

  if (style.opacity !== undefined) {
    parts.push(`opacity="${style.opacity}"`)
  }

  if (style.stroke) {
    parts.push(`stroke="${style.stroke}"`)
  }

  if (style.strokeOpacity !== undefined) {
    parts.push(`stroke-opacity="${style.strokeOpacity}"`)
  }

  if (style.strokeWidthMm !== undefined) {
    parts.push(`stroke-width="${style.strokeWidthMm}"`)
  }

  if (style.dashMm && style.dashMm.length > 0) {
    parts.push(`stroke-dasharray="${style.dashMm.join(' ')}"`)
  }

  if (style.lineCap) {
    parts.push(`stroke-linecap="${style.lineCap}"`)
  }

  if (style.lineJoin) {
    parts.push(`stroke-linejoin="${style.lineJoin}"`)
  }

  if (style.fontSizeMm !== undefined) {
    parts.push(`font-size="${style.fontSizeMm}"`)
  }

  if (style.fontFamily) {
    parts.push(`font-family="${escapeXml(style.fontFamily)}"`)
  }

  if (style.fontWeight !== undefined) {
    parts.push(`font-weight="${style.fontWeight}"`)
  }

  if (style.fontStyle) {
    parts.push(`font-style="${style.fontStyle}"`)
  }

  if (style.textAnchor) {
    parts.push(`text-anchor="${style.textAnchor}"`)
  }

  return parts.join(' ')
}

function renderNode(node: VectorNode, offsetX: number, offsetY: number): string {
  switch (node.kind) {
    case 'group':
      return `<g${node.id ? ` id="${escapeXml(node.id)}"` : ''}${node.label ? ` inkscape:label="${escapeXml(node.label)}"` : ''}>${node.children
        .map((child) => renderNode(child, offsetX, offsetY))
        .join('')}</g>`
    case 'line':
      return `<line${node.id ? ` id="${escapeXml(node.id)}"` : ''} x1="${normalizePoint(node.x1Mm, offsetX)}" y1="${normalizePoint(node.y1Mm, offsetY)}" x2="${normalizePoint(node.x2Mm, offsetX)}" y2="${normalizePoint(node.y2Mm, offsetY)}" ${renderStyle(node.style)} />`
    case 'polyline':
      return `<${node.closed ? 'polygon' : 'polyline'}${node.id ? ` id="${escapeXml(node.id)}"` : ''} points="${node.pointsMm
        .map((point) => `${normalizePoint(point.x, offsetX)},${normalizePoint(point.y, offsetY)}`)
        .join(' ')}" ${renderStyle(node.style)} />`
    case 'circle':
      return `<circle${node.id ? ` id="${escapeXml(node.id)}"` : ''} cx="${normalizePoint(node.centerMm.x, offsetX)}" cy="${normalizePoint(node.centerMm.y, offsetY)}" r="${node.radiusMm}" ${renderStyle(node.style)} />`
    case 'ellipse': {
      const centerX = normalizePoint(node.centerMm.x, offsetX)
      const centerY = normalizePoint(node.centerMm.y, offsetY)
      const rotation =
        node.rotationDeg && node.rotationDeg % 360 !== 0
          ? ` transform="rotate(${node.rotationDeg} ${centerX} ${centerY})"`
          : ''

      return `<ellipse${node.id ? ` id="${escapeXml(node.id)}"` : ''} cx="${centerX}" cy="${centerY}" rx="${node.radiusXMm}" ry="${node.radiusYMm}"${rotation} ${renderStyle(node.style)} />`
    }
    case 'text':
      return `<text${node.id ? ` id="${escapeXml(node.id)}"` : ''} x="${normalizePoint(node.positionMm.x, offsetX)}" y="${normalizePoint(node.positionMm.y, offsetY)}" dominant-baseline="hanging" xml:space="preserve" ${renderStyle(node.style)}>${escapeXml(node.text)}</text>`
  }
}

export function createSceneSvg({
  beamTrace,
  breadboardSurfaceId,
  gaussianTrace,
  renderMode,
  scene,
  scope,
  showGaussianEnvelope,
  svgPreset = 'engineering',
}: CreateSceneSvgArgs) {
  const graph = createVectorExportSceneGraph({
    beamTrace,
    breadboardSurfaceId,
    gaussianTrace,
    renderMode,
    scene,
    scope,
    showGaussianEnvelope,
    svgPreset,
  })

  const layerMarkup = graph.layers
    .map(
      (layer) =>
        `<g id="${escapeXml(`${layer.id}-layer`)}" inkscape:groupmode="layer" inkscape:label="${escapeXml(layer.label)}">${layer.nodes
          .map((node) => renderNode(node, graph.boundsMm.x, graph.boundsMm.y))
          .join('')}</g>`,
    )
    .join('')

  const backgroundMarkup = graph.background
    ? `<rect id="export-background" x="0" y="0" width="${graph.boundsMm.width}" height="${graph.boundsMm.height}" fill="${graph.background}" />`
    : ''

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${graph.boundsMm.width}mm" height="${graph.boundsMm.height}mm" viewBox="0 0 ${graph.boundsMm.width} ${graph.boundsMm.height}" version="1.1">`,
    `<title>${escapeXml(scene.metadata.name)} • Schema-Lab ${svgPreset === 'engineering' ? 'Engineering SVG' : 'Presentation SVG'}</title>`,
    backgroundMarkup,
    layerMarkup,
    '</svg>',
  ].join('')
}

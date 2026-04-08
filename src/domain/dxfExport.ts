import { createVectorExportSceneGraph, type VectorEllipseNode, type VectorNode } from './vectorExportScene'
import type { ExportScope } from './exportLayout'
import type {
  BeamTraceResult,
  GaussianTraceResult,
  RenderMode,
  SceneDocument,
} from './types'

interface CreateSceneDxfArgs {
  beamTrace: BeamTraceResult
  breadboardSurfaceId?: string
  gaussianTrace: GaussianTraceResult
  renderMode: RenderMode
  scene: SceneDocument
  scope: ExportScope
  showGaussianEnvelope: boolean
}

const DXF_LAYER_NAMES = {
  table: 'TABLE',
  breadboards: 'BREADBOARD',
  holes: 'HOLES',
  mounts: 'MOUNTS',
  'annotations-below': 'ANNOTATIONS_BELOW',
  components: 'COMPONENTS',
  'annotations-above': 'ANNOTATIONS_ABOVE',
  labels: 'LABELS',
} as const

function pair(code: number | string, value: number | string) {
  return `${code}\n${value}\n`
}

function normalizeX(x: number, offsetX: number) {
  return Number((x - offsetX).toFixed(6))
}

function normalizeY(y: number, offsetY: number, height: number) {
  return Number((height - (y - offsetY)).toFixed(6))
}

function isSingleLineLabel(text: string) {
  return !text.includes('\n') && text.trim().length > 0
}

function flattenNodes(node: VectorNode, output: VectorNode[]) {
  if (node.kind === 'group') {
    for (const child of node.children) {
      flattenNodes(child, output)
    }

    return
  }

  output.push(node)
}

function createLayerTableMarkup() {
  const layers = Object.values(DXF_LAYER_NAMES)

  return [
    pair(0, 'SECTION'),
    pair(2, 'TABLES'),
    pair(0, 'TABLE'),
    pair(2, 'LAYER'),
    pair(70, layers.length),
    ...layers.flatMap((layer) => [
      pair(0, 'LAYER'),
      pair(2, layer),
      pair(70, 0),
      pair(62, 7),
      pair(6, 'CONTINUOUS'),
    ]),
    pair(0, 'ENDTAB'),
    pair(0, 'ENDSEC'),
  ].join('')
}

function polylineEntity(
  layer: string,
  points: Array<{ x: number; y: number }>,
  isClosed: boolean,
) {
  return [
    pair(0, 'LWPOLYLINE'),
    pair(8, layer),
    pair(90, points.length),
    pair(70, isClosed ? 1 : 0),
    ...points.flatMap((point) => [pair(10, point.x), pair(20, point.y)]),
  ].join('')
}

function ellipseEntity(layer: string, node: VectorEllipseNode, offsetX: number, offsetY: number, height: number) {
  const centerX = normalizeX(node.centerMm.x, offsetX)
  const centerY = normalizeY(node.centerMm.y, offsetY, height)
  const rotationRad = ((node.rotationDeg ?? 0) * Math.PI) / 180
  const majorRadius = Math.max(node.radiusXMm, node.radiusYMm)
  const minorRadius = Math.min(node.radiusXMm, node.radiusYMm)
  const ratio = majorRadius === 0 ? 1 : minorRadius / majorRadius
  const majorAngle =
    node.radiusXMm >= node.radiusYMm ? rotationRad : rotationRad + Math.PI / 2
  const majorAxisX = Number((Math.cos(majorAngle) * majorRadius).toFixed(6))
  const majorAxisY = Number((-Math.sin(majorAngle) * majorRadius).toFixed(6))

  return [
    pair(0, 'ELLIPSE'),
    pair(8, layer),
    pair(10, centerX),
    pair(20, centerY),
    pair(11, majorAxisX),
    pair(21, majorAxisY),
    pair(40, Number(ratio.toFixed(6))),
    pair(41, 0),
    pair(42, 6.283185307179586),
  ].join('')
}

function nodeToDxfEntity(
  layer: string,
  node: VectorNode,
  offsetX: number,
  offsetY: number,
  height: number,
) {
  switch (node.kind) {
    case 'group':
      return ''
    case 'line':
      return [
        pair(0, 'LINE'),
        pair(8, layer),
        pair(10, normalizeX(node.x1Mm, offsetX)),
        pair(20, normalizeY(node.y1Mm, offsetY, height)),
        pair(11, normalizeX(node.x2Mm, offsetX)),
        pair(21, normalizeY(node.y2Mm, offsetY, height)),
      ].join('')
    case 'polyline':
      return polylineEntity(
        layer,
        node.pointsMm.map((point) => ({
          x: normalizeX(point.x, offsetX),
          y: normalizeY(point.y, offsetY, height),
        })),
        Boolean(node.closed),
      )
    case 'circle':
      return [
        pair(0, 'CIRCLE'),
        pair(8, layer),
        pair(10, normalizeX(node.centerMm.x, offsetX)),
        pair(20, normalizeY(node.centerMm.y, offsetY, height)),
        pair(40, node.radiusMm),
      ].join('')
    case 'ellipse':
      return ellipseEntity(layer, node, offsetX, offsetY, height)
    case 'text':
      if (!isSingleLineLabel(node.text)) {
        return ''
      }

      return [
        pair(0, 'TEXT'),
        pair(8, layer),
        pair(10, normalizeX(node.positionMm.x, offsetX)),
        pair(20, normalizeY(node.positionMm.y, offsetY, height)),
        pair(40, Number((node.style?.fontSizeMm ?? 4.2).toFixed(6))),
        pair(1, node.text),
      ].join('')
  }
}

export function createSceneDxf({
  beamTrace,
  breadboardSurfaceId,
  gaussianTrace,
  renderMode,
  scene,
  scope,
  showGaussianEnvelope,
}: CreateSceneDxfArgs) {
  const graph = createVectorExportSceneGraph({
    beamTrace,
    breadboardSurfaceId,
    gaussianTrace,
    renderMode,
    scene,
    scope,
    showGaussianEnvelope,
    svgPreset: 'engineering',
  })
  const entities: string[] = []

  for (const layer of graph.layers) {
    if (!(layer.id in DXF_LAYER_NAMES)) {
      continue
    }

    const flattenedNodes: VectorNode[] = []
    for (const node of layer.nodes) {
      flattenNodes(node, flattenedNodes)
    }

    for (const node of flattenedNodes) {
      const entity = nodeToDxfEntity(
        DXF_LAYER_NAMES[layer.id as keyof typeof DXF_LAYER_NAMES],
        node,
        graph.boundsMm.x,
        graph.boundsMm.y,
        graph.boundsMm.height,
      )

      if (entity) {
        entities.push(entity)
      }
    }
  }

  return [
    pair(0, 'SECTION'),
    pair(2, 'HEADER'),
    pair(9, '$INSUNITS'),
    pair(70, 4),
    pair(9, '$MEASUREMENT'),
    pair(70, 1),
    pair(0, 'ENDSEC'),
    createLayerTableMarkup(),
    pair(0, 'SECTION'),
    pair(2, 'ENTITIES'),
    entities.join(''),
    pair(0, 'ENDSEC'),
    pair(0, 'EOF'),
  ].join('')
}

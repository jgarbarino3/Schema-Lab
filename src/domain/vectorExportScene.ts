import {
  getAnnotationFontStack,
  getAnnotationLineHeightMm,
  getDiamondPointsMm,
  getTextAnnotationBodyBoundsMm,
  getTextAnnotationTailPointsMm,
  getTextLineStartX,
  getUnderlineOffsetMm,
  measureTextLineWidthMm,
  wrapAnnotationText,
} from './annotations'
import { getBeamColor } from './beamTracing'
import {
  getBreadboardHoleAxesMm,
  getCounterboreCentersMm,
  getEffectiveHolePitchMm,
} from './breadboard'
import {
  getEffectiveSupportBoundsMm,
  getResolvedComponentSpecForInstance,
  shouldIncludeDefaultMount,
} from './componentCatalog'
import {
  quarterTurnsToDegrees,
  rotateBoundsQuarterTurns,
  rotatePointQuarterTurns,
  roundMm,
} from './geometry'
import { getExportWorldBoundsMm, type ExportScope, type SvgExportPreset } from './exportLayout'
import { getGaussianWaistMarkers } from './gaussian'
import {
  getBreadboardInstance,
  getBreadboardInstances,
  getHostSurfaceIdForComponent,
  getOpticalTable,
  getWorkspacePrimaryBreadboard,
} from './workspace'
import type {
  AnnotationText,
  BeamSegment,
  BeamTraceResult,
  BreadboardModel,
  BoundsMm,
  ComponentGlyph,
  ComponentInstance,
  GaussianTraceResult,
  OpticalTableModel,
  QuarterTurn,
  RenderMode,
  SceneDocument,
  ShapeAnnotation,
  SimpleIconStyle,
  Vector2Mm,
} from './types'

type VectorTextAnchor = 'start' | 'middle' | 'end'
type VectorLineCap = 'round' | 'butt' | 'square'
type VectorLineJoin = 'round' | 'bevel' | 'miter'

export type VectorExportLayerId =
  | 'table'
  | 'breadboards'
  | 'holes'
  | 'mounts'
  | 'annotations-below'
  | 'components'
  | 'annotations-above'
  | 'beams'
  | 'gaussian'
  | 'labels'

export interface VectorNodeStyle {
  dashMm?: number[]
  fill?: string
  fillOpacity?: number
  fontFamily?: string
  fontSizeMm?: number
  fontStyle?: string
  fontWeight?: number | string
  lineCap?: VectorLineCap
  lineJoin?: VectorLineJoin
  opacity?: number
  stroke?: string
  strokeOpacity?: number
  strokeWidthMm?: number
  textAnchor?: VectorTextAnchor
}

export interface VectorLineNode {
  kind: 'line'
  id?: string
  style?: VectorNodeStyle
  x1Mm: number
  x2Mm: number
  y1Mm: number
  y2Mm: number
}

export interface VectorPolylineNode {
  kind: 'polyline'
  closed?: boolean
  id?: string
  pointsMm: Vector2Mm[]
  style?: VectorNodeStyle
}

export interface VectorCircleNode {
  kind: 'circle'
  centerMm: Vector2Mm
  id?: string
  radiusMm: number
  style?: VectorNodeStyle
}

export interface VectorEllipseNode {
  kind: 'ellipse'
  centerMm: Vector2Mm
  id?: string
  rotationDeg?: number
  radiusXMm: number
  radiusYMm: number
  style?: VectorNodeStyle
}

export interface VectorTextNode {
  kind: 'text'
  id?: string
  positionMm: Vector2Mm
  style?: VectorNodeStyle
  text: string
}

export interface VectorGroupNode {
  children: VectorNode[]
  id?: string
  kind: 'group'
  label?: string
}

export type VectorNode =
  | VectorCircleNode
  | VectorEllipseNode
  | VectorGroupNode
  | VectorLineNode
  | VectorPolylineNode
  | VectorTextNode

export interface VectorExportLayer {
  id: VectorExportLayerId
  label: string
  nodes: VectorNode[]
}

export interface VectorExportSceneGraph {
  background?: string
  boundsMm: BoundsMm
  layers: VectorExportLayer[]
}

interface CreateVectorExportSceneGraphArgs {
  beamTrace: BeamTraceResult
  breadboardSurfaceId?: string
  gaussianTrace: GaussianTraceResult
  renderMode: RenderMode
  scene: SceneDocument
  scope: ExportScope
  showGaussianEnvelope: boolean
  simpleIconStyle: SimpleIconStyle
  svgPreset?: SvgExportPreset
}

interface ExportPalette {
  background?: string
  boardFill: string
  boardLabel: string
  boardStroke: string
  componentFill: string
  componentStroke: string
  holeFill: string
  label: string
  mountFill: string
  mountStroke: string
  supportStroke: string
}

const SVG_MONO_FONT = 'IBM Plex Mono, SFMono-Regular, monospace'
const SVG_SANS_FONT = 'IBM Plex Sans, Avenir Next, Segoe UI, sans-serif'

const LAYER_ORDER: Array<{ id: VectorExportLayerId; label: string }> = [
  { id: 'table', label: 'Optical Table' },
  { id: 'breadboards', label: 'Breadboards' },
  { id: 'holes', label: 'Hole Field' },
  { id: 'mounts', label: 'Mounts and Supports' },
  { id: 'beams', label: 'Beams' },
  { id: 'annotations-below', label: 'Annotations Below Components' },
  { id: 'components', label: 'Components' },
  { id: 'annotations-above', label: 'Annotations Above Components' },
  { id: 'gaussian', label: 'Gaussian Envelope' },
  { id: 'labels', label: 'Labels' },
]

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function defaultStyle(style: VectorNodeStyle): VectorNodeStyle {
  return style
}

function createLayerMap() {
  return new Map<VectorExportLayerId, VectorNode[]>(
    LAYER_ORDER.map((layer) => [layer.id, []]),
  )
}

function pushLayerNode(
  layerMap: Map<VectorExportLayerId, VectorNode[]>,
  layerId: VectorExportLayerId,
  node: VectorNode,
) {
  const target = layerMap.get(layerId)

  if (!target) {
    throw new Error(`Unknown vector export layer: ${layerId}`)
  }

  target.push(node)
}

function getTextAnchorForAlignment(
  align: AnnotationText['style']['align'],
): VectorTextAnchor {
  switch (align) {
    case 'center':
      return 'middle'
    case 'right':
      return 'end'
    case 'left':
    default:
      return 'start'
  }
}

function rectToPoints(boundsMm: BoundsMm): Vector2Mm[] {
  return [
    { x: boundsMm.x, y: boundsMm.y },
    { x: boundsMm.x + boundsMm.width, y: boundsMm.y },
    { x: boundsMm.x + boundsMm.width, y: boundsMm.y + boundsMm.height },
    { x: boundsMm.x, y: boundsMm.y + boundsMm.height },
  ]
}

function localPointToWorld(
  anchorMm: Vector2Mm,
  rotationQuarterTurns: QuarterTurn,
  pointMm: Vector2Mm,
): Vector2Mm {
  const rotated = rotatePointQuarterTurns(pointMm, rotationQuarterTurns)

  return {
    x: roundMm(anchorMm.x + rotated.x),
    y: roundMm(anchorMm.y + rotated.y),
  }
}

function localPointsToWorld(
  anchorMm: Vector2Mm,
  rotationQuarterTurns: QuarterTurn,
  pointsMm: Vector2Mm[],
) {
  return pointsMm.map((pointMm) =>
    localPointToWorld(anchorMm, rotationQuarterTurns, pointMm),
  )
}

function localBoundsToWorldPolyline(
  anchorMm: Vector2Mm,
  rotationQuarterTurns: QuarterTurn,
  boundsMm: BoundsMm,
) {
  return localPointsToWorld(anchorMm, rotationQuarterTurns, rectToPoints(boundsMm))
}

function localCircleToWorld(
  anchorMm: Vector2Mm,
  rotationQuarterTurns: QuarterTurn,
  centerMm: Vector2Mm,
  radiusMm: number,
  style?: VectorNodeStyle,
  id?: string,
): VectorCircleNode {
  return {
    kind: 'circle',
    id,
    centerMm: localPointToWorld(anchorMm, rotationQuarterTurns, centerMm),
    radiusMm: roundMm(radiusMm),
    style,
  }
}

function createTextAnnotationNodes(annotation: AnnotationText): VectorNode[] {
  const lines = wrapAnnotationText(
    annotation.text,
    annotation.style,
    annotation.widthMm,
  )
  const lineHeightMm = getAnnotationLineHeightMm(annotation.style)
  const nodes: VectorNode[] = []
  const bodyBounds = getTextAnnotationBodyBoundsMm(annotation)

  if (annotation.variant !== 'plain') {
    nodes.push({
      kind: 'polyline',
      closed: true,
      id: `${annotation.id}-body`,
      pointsMm: rectToPoints(bodyBounds),
      style: defaultStyle({
        fill: annotation.backgroundColor,
        stroke: annotation.borderColor,
        strokeWidthMm: 0.7,
      }),
    })

    if (annotation.variant === 'sticky-note') {
      nodes.push({
        kind: 'polyline',
        closed: true,
        id: `${annotation.id}-fold`,
        pointsMm: [
          { x: roundMm(bodyBounds.x + bodyBounds.width - 10), y: bodyBounds.y },
          { x: roundMm(bodyBounds.x + bodyBounds.width), y: bodyBounds.y },
          {
            x: roundMm(bodyBounds.x + bodyBounds.width),
            y: roundMm(bodyBounds.y + 10),
          },
        ],
        style: defaultStyle({
          fill: 'rgba(255,255,255,0.16)',
          stroke: 'rgba(0,0,0,0.08)',
          strokeWidthMm: 0.45,
        }),
      })
    }

    if (annotation.variant === 'note-card') {
      nodes.push({
        kind: 'polyline',
        closed: true,
        id: `${annotation.id}-header`,
        pointsMm: rectToPoints({
          x: bodyBounds.x,
          y: bodyBounds.y,
          width: bodyBounds.width,
          height: 4.2,
        }),
        style: defaultStyle({
          fill: 'rgba(255,255,255,0.03)',
          strokeWidthMm: 0,
        }),
      })
    }

    const tailPoints = getTextAnnotationTailPointsMm(annotation)
    if (tailPoints) {
      nodes.push({
        kind: 'polyline',
        closed: true,
        id: `${annotation.id}-tail`,
        pointsMm: tailPoints,
        style: defaultStyle({
          fill: annotation.backgroundColor,
          stroke: annotation.borderColor,
          strokeWidthMm: 0.7,
        }),
      })
    }
  }

  lines.forEach((line, index) => {
    const lineWidthMm = Math.min(
      bodyBounds.width,
      measureTextLineWidthMm(line, annotation.style),
    )
    const lineStartX = getTextLineStartX(annotation, lineWidthMm)
    const anchorX =
      annotation.style.align === 'center'
        ? lineStartX + lineWidthMm / 2
        : annotation.style.align === 'right'
          ? lineStartX + lineWidthMm
          : lineStartX
    const lineY = annotation.anchorMm.y + index * lineHeightMm

    nodes.push({
      kind: 'text',
      id: `${annotation.id}-line-${index}`,
      positionMm: {
        x: roundMm(anchorX),
        y: roundMm(lineY),
      },
      style: defaultStyle({
        fill: annotation.style.color,
        fontFamily: getAnnotationFontStack(annotation.style.fontFamily),
        fontSizeMm: annotation.style.fontSizeMm,
        fontStyle: annotation.style.italic ? 'italic' : 'normal',
        fontWeight: annotation.style.bold ? 700 : 400,
        textAnchor: getTextAnchorForAlignment(annotation.style.align),
      }),
      text: line,
    })

    if (annotation.style.underline && line) {
      const underlineY = roundMm(lineY + getUnderlineOffsetMm(annotation.style))
      nodes.push({
        kind: 'line',
        id: `${annotation.id}-underline-${index}`,
        x1Mm: roundMm(lineStartX),
        y1Mm: underlineY,
        x2Mm: roundMm(lineStartX + lineWidthMm),
        y2Mm: underlineY,
        style: defaultStyle({
          stroke: annotation.style.color,
          strokeWidthMm: Math.max(0.25, annotation.style.fontSizeMm * 0.08),
        }),
      })
    }
  })

  return nodes
}

function createShapeAnnotationNodes(annotation: ShapeAnnotation): VectorNode[] {
  if (
    annotation.shapeKind === 'rectangle' ||
    annotation.shapeKind === 'rounded-rectangle'
  ) {
    return [{
      kind: 'polyline',
      closed: true,
      id: annotation.id,
      pointsMm: rectToPoints(annotation.boundsMm),
      style: defaultStyle({
        fill: annotation.fillColor === 'transparent' ? undefined : annotation.fillColor,
        stroke: annotation.strokeColor,
        strokeWidthMm: annotation.strokeWidthMm,
      }),
    }]
  }

  if (annotation.shapeKind === 'ellipse') {
    return [{
      kind: 'ellipse',
      id: annotation.id,
      centerMm: {
        x: roundMm(annotation.boundsMm.x + annotation.boundsMm.width / 2),
        y: roundMm(annotation.boundsMm.y + annotation.boundsMm.height / 2),
      },
      radiusXMm: roundMm(annotation.boundsMm.width / 2),
      radiusYMm: roundMm(annotation.boundsMm.height / 2),
      style: defaultStyle({
        fill: annotation.fillColor === 'transparent' ? undefined : annotation.fillColor,
        stroke: annotation.strokeColor,
        strokeWidthMm: annotation.strokeWidthMm,
      }),
    }]
  }

  if (annotation.shapeKind === 'diamond') {
    return [{
      kind: 'polyline',
      closed: true,
      id: annotation.id,
      pointsMm: getDiamondPointsMm(annotation),
      style: defaultStyle({
        fill: annotation.fillColor === 'transparent' ? undefined : annotation.fillColor,
        stroke: annotation.strokeColor,
        strokeWidthMm: annotation.strokeWidthMm,
      }),
    }]
  }

  const dx = annotation.endMm.x - annotation.startMm.x
  const dy = annotation.endMm.y - annotation.startMm.y
  const lengthMm = Math.hypot(dx, dy) || 1
  const unitX = dx / lengthMm
  const unitY = dy / lengthMm
  const headLengthMm = Math.max(4, annotation.strokeWidthMm * 5)
  const headHalfWidthMm = Math.max(2.2, annotation.strokeWidthMm * 3)
  const baseX = annotation.endMm.x - unitX * headLengthMm
  const baseY = annotation.endMm.y - unitY * headLengthMm
  const normalX = -unitY
  const normalY = unitX

  return [
    {
      kind: 'line',
      id: `${annotation.id}-shaft`,
      x1Mm: annotation.startMm.x,
      y1Mm: annotation.startMm.y,
      x2Mm: baseX,
      y2Mm: baseY,
      style: defaultStyle({
        lineCap: 'round',
        stroke: annotation.strokeColor,
        strokeWidthMm: annotation.strokeWidthMm,
      }),
    },
    {
      kind: 'polyline',
      closed: true,
      id: `${annotation.id}-head`,
      pointsMm: [
        { x: annotation.endMm.x, y: annotation.endMm.y },
        {
          x: roundMm(baseX + normalX * headHalfWidthMm),
          y: roundMm(baseY + normalY * headHalfWidthMm),
        },
        {
          x: roundMm(baseX - normalX * headHalfWidthMm),
          y: roundMm(baseY - normalY * headHalfWidthMm),
        },
      ],
      style: defaultStyle({
        fill: annotation.fillColor === 'transparent' ? undefined : annotation.fillColor,
        lineJoin: 'round',
        stroke: annotation.strokeColor,
        strokeWidthMm: Math.max(0.2, annotation.strokeWidthMm * 0.6),
      }),
    },
  ]
}

function localEllipseToWorld(
  anchorMm: Vector2Mm,
  rotationQuarterTurns: QuarterTurn,
  centerMm: Vector2Mm,
  radiusXMm: number,
  radiusYMm: number,
  style?: VectorNodeStyle,
  id?: string,
): VectorEllipseNode {
  return {
    kind: 'ellipse',
    id,
    centerMm: localPointToWorld(anchorMm, rotationQuarterTurns, centerMm),
    radiusXMm: roundMm(radiusXMm),
    radiusYMm: roundMm(radiusYMm),
    rotationDeg: quarterTurnsToDegrees(rotationQuarterTurns),
    style,
  }
}

function localLineToWorld(
  anchorMm: Vector2Mm,
  rotationQuarterTurns: QuarterTurn,
  startMm: Vector2Mm,
  endMm: Vector2Mm,
  style?: VectorNodeStyle,
  id?: string,
): VectorLineNode {
  const worldStart = localPointToWorld(anchorMm, rotationQuarterTurns, startMm)
  const worldEnd = localPointToWorld(anchorMm, rotationQuarterTurns, endMm)

  return {
    kind: 'line',
    id,
    style,
    x1Mm: worldStart.x,
    y1Mm: worldStart.y,
    x2Mm: worldEnd.x,
    y2Mm: worldEnd.y,
  }
}

function getExportPalette(
  preset: SvgExportPreset,
  boardFinish: 'black-anodized' | 'clear-anodized' | 'silver',
): ExportPalette {
  if (preset === 'presentation') {
    return {
      background: '#0b1014',
      boardFill:
        boardFinish === 'silver'
          ? '#c6ced4'
          : boardFinish === 'clear-anodized'
            ? '#c9d1d8'
            : '#171d22',
      boardLabel: boardFinish === 'black-anodized' ? '#d5e2ec' : '#16202a',
      boardStroke:
        boardFinish === 'silver'
          ? '#edf3f8'
          : boardFinish === 'clear-anodized'
            ? '#7e8b95'
            : '#5a6974',
      componentFill: '#d9e8ef',
      componentStroke: '#f2f7fb',
      holeFill: boardFinish === 'black-anodized' ? '#0c1014' : '#64717a',
      label: '#d9e8ef',
      mountFill: 'rgba(53, 63, 72, 0.86)',
      mountStroke: '#8da0ad',
      supportStroke: 'rgba(140, 207, 223, 0.56)',
    }
  }

  return {
    boardFill:
      boardFinish === 'silver'
        ? '#edf1f4'
        : boardFinish === 'clear-anodized'
          ? '#f3f5f7'
          : '#f6f8fa',
    boardLabel: '#22303b',
    boardStroke: '#6d7b87',
    componentFill: '#f7fbfd',
    componentStroke: '#26424c',
    holeFill: '#7a8791',
    label: '#23313a',
    mountFill: '#eef2f5',
    mountStroke: '#53636e',
    supportStroke: '#6f95a5',
  }
}

function getComponentPalette(
  component: ComponentInstance,
  preset: SvgExportPreset,
) {
  const spec = getResolvedComponentSpecForInstance(component)

  if (preset === 'presentation') {
    return {
      bodyFill: spec.renderHint.fill,
      bodyStroke: spec.renderHint.stroke,
      mountFill: spec.mountRenderHint?.fill ?? '#dbe4ea',
      mountStroke: spec.mountRenderHint?.stroke ?? '#90a2ae',
      supportStroke: 'rgba(145, 202, 222, 0.58)',
      text: '#dcebf3',
    }
  }

  return {
    bodyFill: '#f8fbfc',
    bodyStroke: '#2b4048',
    mountFill: '#eef2f5',
    mountStroke: '#53636e',
    supportStroke: '#7d97a5',
    text: '#23313a',
  }
}

function renderSimpleLocalGlyph(
  glyph: ComponentGlyph,
  bodyBoundsMm: BoundsMm,
  style: {
    fill: string
    stroke: string
  },
  iconStyle: SimpleIconStyle,
): VectorNode[] {
  const resolvedGlyph = (() => {
    switch (glyph) {
      case 'laser-fs-source':
      case 'laser-compact-table':
      case 'laser-libra':
      case 'laser-pharos':
      case 'laser-clark':
        return 'laser'
      case 'support-clamp-fork':
      case 'support-mounting-base':
      case 'support-pedestal-post':
      case 'support-post-holder':
      case 'support-pedestal-assembly':
      case 'support-linear-slide':
      case 'support-beam-block':
      case 'support-periscope':
      case 'support-white-light-cell':
      case 'support-pump-seed-combiner':
        return 'support'
      case 'mirror-flip':
        return 'mirror'
      case 'attenuator-horizontal':
      case 'attenuator-vertical':
        return 'attenuator'
      case 'waveplate-half':
      case 'waveplate-quarter':
        return 'waveplate'
      case 'iris-standard':
      case 'iris-zero':
      case 'iris-sm1-ring':
      case 'iris-sm1-graduated':
      case 'iris-sm1-zero':
        return 'iris'
      case 'telescope-transmission':
      case 'telescope-reflective':
        return 'telescope'
      case 'sample-generic':
      case 'sample-delay-stage':
      case 'sample-motorized-stage':
        return 'sample'
      case 'spectrometer-compact':
      case 'spectrometer-bench':
        return 'spectrometer'
      default:
        return glyph
    }
  })()
  const centerX = bodyBoundsMm.x + bodyBoundsMm.width / 2
  const centerY = bodyBoundsMm.y + bodyBoundsMm.height / 2
  const opticRadius = Math.max(3.4, Math.min(bodyBoundsMm.width, bodyBoundsMm.height) * 0.28)
  const isClassic = iconStyle === 'classic'

  switch (resolvedGlyph) {
    case 'mirror':
    case 'curved-mirror':
      return [
        {
          kind: 'line',
          x1Mm: roundMm(bodyBoundsMm.x + bodyBoundsMm.width - 2.5),
          y1Mm: roundMm(bodyBoundsMm.y + 2.5),
          x2Mm: roundMm(bodyBoundsMm.x + 2.5),
          y2Mm: roundMm(bodyBoundsMm.y + bodyBoundsMm.height - 2.5),
          style: defaultStyle({
            lineCap: 'round',
            stroke: style.stroke,
            strokeWidthMm: isClassic ? 1.35 : 1.15,
          }),
        },
      ]
    case 'lens':
      return [
        {
          kind: 'ellipse',
          centerMm: { x: roundMm(centerX), y: roundMm(centerY) },
          radiusXMm: roundMm(Math.max(2.2, bodyBoundsMm.width * 0.12)),
          radiusYMm: roundMm(Math.max(5.4, bodyBoundsMm.height * 0.38)),
          style: defaultStyle({
            fill: style.fill,
            fillOpacity: 0.28,
            stroke: style.stroke,
            strokeWidthMm: 0.6,
          }),
        },
      ]
    case 'iris':
      return [
        {
          kind: 'circle',
          centerMm: { x: roundMm(centerX), y: roundMm(centerY) },
          radiusMm: roundMm(opticRadius),
          style: defaultStyle({
            stroke: style.stroke,
            strokeWidthMm: 0.8,
          }),
        },
      ]
    case 'beamsplitter':
      return [
        {
          kind: 'line',
          x1Mm: roundMm(bodyBoundsMm.x + 2.5),
          y1Mm: roundMm(bodyBoundsMm.y + bodyBoundsMm.height - 2.5),
          x2Mm: roundMm(bodyBoundsMm.x + bodyBoundsMm.width - 2.5),
          y2Mm: roundMm(bodyBoundsMm.y + 2.5),
          style: defaultStyle({
            dashMm: isClassic ? [0.8, 1.15] : [1.5, 1.5],
            lineCap: 'round',
            stroke: style.stroke,
            strokeWidthMm: 0.8,
          }),
        },
      ]
    case 'filter':
      return [
        {
          kind: 'polyline',
          closed: true,
          pointsMm: [
            { x: roundMm(centerX), y: roundMm(bodyBoundsMm.y + 1.6) },
            { x: roundMm(bodyBoundsMm.x + bodyBoundsMm.width - 1.6), y: roundMm(centerY) },
            { x: roundMm(centerX), y: roundMm(bodyBoundsMm.y + bodyBoundsMm.height - 1.6) },
            { x: roundMm(bodyBoundsMm.x + 1.6), y: roundMm(centerY) },
          ],
          style: defaultStyle({
            fill: style.fill,
            fillOpacity: 0.16,
            stroke: style.stroke,
            strokeWidthMm: 0.6,
          }),
        },
      ]
    default:
      return [
        {
          kind: 'polyline',
          closed: true,
          pointsMm: rectToPoints(bodyBoundsMm),
          style: defaultStyle({
            fill: style.fill,
            fillOpacity: 0.18,
            stroke: style.stroke,
            strokeWidthMm: 0.7,
          }),
        },
      ]
  }
}

function renderRealisticLocalHardware(
  component: ComponentInstance,
  bodyBoundsMm: BoundsMm,
  mountBoundsMm: BoundsMm,
  showMount: boolean,
  palette: {
    bodyFill: string
    bodyStroke: string
    mountFill: string
    mountStroke: string
  },
): VectorNode[] {
  const centerX = bodyBoundsMm.x + bodyBoundsMm.width / 2
  const centerY = bodyBoundsMm.y + bodyBoundsMm.height / 2
  const mountCenter = {
    x: mountBoundsMm.x + mountBoundsMm.width / 2,
    y: mountBoundsMm.y + mountBoundsMm.height / 2,
  }
  const mountRadius = Math.min(mountBoundsMm.width, mountBoundsMm.height) / 2
  const opticRadius = Math.max(4, Math.min(bodyBoundsMm.width, bodyBoundsMm.height) * 0.42)
  const screwRadius = Math.max(1.5, mountRadius * 0.14)
  const screwOffset = Math.max(6.8, mountRadius - 4.2)
  const mountNodes =
    showMount && component.type !== 'bbo-crystal'
      ? [
          {
            kind: 'circle' as const,
            centerMm: {
              x: roundMm(mountCenter.x),
              y: roundMm(mountCenter.y),
            },
            radiusMm: roundMm(mountRadius),
            style: defaultStyle({
              fill: palette.mountFill,
              stroke: palette.mountStroke,
              strokeWidthMm: 0.7,
            }),
          },
          {
            kind: 'circle' as const,
            centerMm: {
              x: roundMm(mountCenter.x),
              y: roundMm(mountCenter.y),
            },
            radiusMm: roundMm(Math.max(5.2, mountRadius - 4.1)),
            style: defaultStyle({
              fill: '#ffffff',
              fillOpacity: 0.06,
              stroke: palette.mountStroke,
              strokeOpacity: 0.18,
              strokeWidthMm: 0.35,
            }),
          },
          {
            kind: 'circle' as const,
            centerMm: { x: roundMm(centerX), y: roundMm(centerY - screwOffset) },
            radiusMm: roundMm(screwRadius),
            style: defaultStyle({
              fill: '#ead286',
              stroke: '#39444c',
              strokeWidthMm: 0.25,
            }),
          },
          {
            kind: 'circle' as const,
            centerMm: {
              x: roundMm(centerX - screwOffset * 0.86),
              y: roundMm(centerY + screwOffset * 0.5),
            },
            radiusMm: roundMm(screwRadius),
            style: defaultStyle({
              fill: '#ead286',
              stroke: '#39444c',
              strokeWidthMm: 0.25,
            }),
          },
          {
            kind: 'circle' as const,
            centerMm: {
              x: roundMm(centerX + screwOffset * 0.86),
              y: roundMm(centerY + screwOffset * 0.5),
            },
            radiusMm: roundMm(screwRadius),
            style: defaultStyle({
              fill: '#ead286',
              stroke: '#39444c',
              strokeWidthMm: 0.25,
            }),
          },
        ]
      : []

  switch (component.type) {
    case 'mirror':
    case 'curved-mirror':
      return [
        ...mountNodes,
        {
          kind: 'circle',
          centerMm: { x: roundMm(centerX), y: roundMm(centerY) },
          radiusMm: roundMm(opticRadius),
          style: defaultStyle({
            fill: palette.bodyFill,
            stroke: palette.bodyStroke,
            strokeWidthMm: 0.7,
          }),
        },
        {
          kind: 'line',
          x1Mm: roundMm(centerX + opticRadius * 0.72),
          y1Mm: roundMm(centerY - opticRadius * 0.72),
          x2Mm: roundMm(centerX - opticRadius * 0.72),
          y2Mm: roundMm(centerY + opticRadius * 0.72),
          style: defaultStyle({
            lineCap: 'round',
            stroke: palette.bodyStroke,
            strokeWidthMm: 0.8,
          }),
        },
      ]
    case 'beamsplitter':
      return [
        ...mountNodes,
        {
          kind: 'circle',
          centerMm: { x: roundMm(centerX), y: roundMm(centerY) },
          radiusMm: roundMm(opticRadius),
          style: defaultStyle({
            fill: palette.bodyFill,
            fillOpacity: 0.24,
            stroke: palette.bodyStroke,
            strokeWidthMm: 0.7,
          }),
        },
        {
          kind: 'line',
          x1Mm: roundMm(centerX - opticRadius * 0.75),
          y1Mm: roundMm(centerY + opticRadius * 0.75),
          x2Mm: roundMm(centerX + opticRadius * 0.75),
          y2Mm: roundMm(centerY - opticRadius * 0.75),
          style: defaultStyle({
            dashMm: [1.3, 1.3],
            lineCap: 'round',
            stroke: palette.bodyStroke,
            strokeWidthMm: 0.75,
          }),
        },
      ]
    case 'lens':
      return [
        ...mountNodes,
        {
          kind: 'ellipse',
          centerMm: { x: roundMm(centerX), y: roundMm(centerY) },
          radiusXMm: roundMm(Math.max(2.6, bodyBoundsMm.width * 0.18)),
          radiusYMm: roundMm(Math.max(7.4, bodyBoundsMm.height * 0.42)),
          style: defaultStyle({
            fill: palette.bodyFill,
            fillOpacity: 0.32,
            stroke: palette.bodyStroke,
            strokeWidthMm: 0.7,
          }),
        },
      ]
    case 'filter':
      return [
        ...mountNodes,
        {
          kind: 'polyline',
          closed: true,
          pointsMm: [
            { x: roundMm(centerX), y: roundMm(bodyBoundsMm.y + 1.4) },
            { x: roundMm(bodyBoundsMm.x + bodyBoundsMm.width - 1.4), y: roundMm(centerY) },
            { x: roundMm(centerX), y: roundMm(bodyBoundsMm.y + bodyBoundsMm.height - 1.4) },
            { x: roundMm(bodyBoundsMm.x + 1.4), y: roundMm(centerY) },
          ],
          style: defaultStyle({
            fill: palette.bodyFill,
            fillOpacity: 0.28,
            stroke: palette.bodyStroke,
            strokeWidthMm: 0.7,
          }),
        },
      ]
    case 'attenuator':
    case 'polarizer':
    case 'waveplate':
    case 'iris':
      return [
        ...mountNodes,
        {
          kind: 'circle',
          centerMm: { x: roundMm(centerX), y: roundMm(centerY) },
          radiusMm: roundMm(opticRadius),
          style: defaultStyle({
            fill: palette.bodyFill,
            fillOpacity: component.type === 'iris' ? 0 : 0.22,
            stroke: palette.bodyStroke,
            strokeWidthMm: 0.7,
          }),
        },
        ...(component.type === 'attenuator'
          ? [
              {
                kind: 'line' as const,
                x1Mm: roundMm(centerX - opticRadius * 0.72),
                y1Mm: roundMm(centerY - opticRadius * 0.72),
                x2Mm: roundMm(centerX + opticRadius * 0.72),
                y2Mm: roundMm(centerY + opticRadius * 0.72),
                style: defaultStyle({
                  lineCap: 'round',
                  stroke: palette.bodyStroke,
                  strokeWidthMm: 0.75,
                }),
              },
            ]
          : component.type === 'polarizer'
            ? [
                {
                  kind: 'line' as const,
                  x1Mm: roundMm(centerX),
                  y1Mm: roundMm(centerY - opticRadius * 0.9),
                  x2Mm: roundMm(centerX),
                  y2Mm: roundMm(centerY + opticRadius * 0.9),
                  style: defaultStyle({
                    lineCap: 'round',
                    stroke: palette.bodyStroke,
                    strokeWidthMm: 0.75,
                  }),
                },
              ]
            : component.type === 'waveplate'
              ? [
                  {
                    kind: 'line' as const,
                    x1Mm: roundMm(centerX - opticRadius * 0.78),
                    y1Mm: roundMm(centerY),
                    x2Mm: roundMm(centerX + opticRadius * 0.78),
                    y2Mm: roundMm(centerY),
                    style: defaultStyle({
                      lineCap: 'round',
                      stroke: palette.bodyStroke,
                      strokeWidthMm: 0.75,
                    }),
                  },
                ]
              : []),
      ]
    case 'bbo-crystal':
      return [
        {
          kind: 'polyline',
          closed: true,
          pointsMm: rectToPoints(mountBoundsMm),
          style: defaultStyle({
            fill: palette.mountFill,
            fillOpacity: 0.9,
            stroke: palette.mountStroke,
            strokeWidthMm: 0.7,
          }),
        },
        {
          kind: 'polyline',
          closed: true,
          pointsMm: rectToPoints(bodyBoundsMm),
          style: defaultStyle({
            fill: palette.bodyFill,
            fillOpacity: 0.34,
            stroke: palette.bodyStroke,
            strokeWidthMm: 0.7,
          }),
        },
      ]
    case 'telescope':
      return [
        {
          kind: 'polyline',
          closed: true,
          pointsMm: rectToPoints(mountBoundsMm),
          style: defaultStyle({
            fill: palette.mountFill,
            fillOpacity: 0.55,
            stroke: palette.mountStroke,
            strokeWidthMm: 0.7,
          }),
        },
        {
          kind: 'polyline',
          closed: true,
          pointsMm: rectToPoints(bodyBoundsMm),
          style: defaultStyle({
            fill: palette.bodyFill,
            fillOpacity: 0.42,
            stroke: palette.bodyStroke,
            strokeWidthMm: 0.7,
          }),
        },
        {
          kind: 'ellipse',
          centerMm: {
            x: roundMm(bodyBoundsMm.x + bodyBoundsMm.width * 0.25),
            y: roundMm(centerY),
          },
          radiusXMm: roundMm(Math.max(2.8, bodyBoundsMm.height * 0.16)),
          radiusYMm: roundMm(Math.max(5, bodyBoundsMm.height * 0.36)),
          style: defaultStyle({
            fill: palette.bodyFill,
            fillOpacity: 0.28,
            stroke: palette.bodyStroke,
            strokeWidthMm: 0.55,
          }),
        },
        {
          kind: 'ellipse',
          centerMm: {
            x: roundMm(bodyBoundsMm.x + bodyBoundsMm.width * 0.75),
            y: roundMm(centerY),
          },
          radiusXMm: roundMm(Math.max(2.8, bodyBoundsMm.height * 0.16)),
          radiusYMm: roundMm(Math.max(5, bodyBoundsMm.height * 0.36)),
          style: defaultStyle({
            fill: palette.bodyFill,
            fillOpacity: 0.28,
            stroke: palette.bodyStroke,
            strokeWidthMm: 0.55,
          }),
        },
      ]
    case 'sample-stage': {
      const bodyNodes: VectorNode[] = [
        {
          kind: 'polyline',
          closed: true,
          pointsMm: rectToPoints(bodyBoundsMm),
          style: defaultStyle({
            fill: palette.bodyFill,
            fillOpacity: 0.4,
            stroke: palette.bodyStroke,
            strokeWidthMm: 0.7,
          }),
        },
      ]

      if (component.variantId === 'pi-ls-180') {
        bodyNodes.push(
          {
            kind: 'polyline',
            closed: true,
            pointsMm: rectToPoints({
              x: bodyBoundsMm.x + 62,
              y: bodyBoundsMm.y + 15,
              width: bodyBoundsMm.width - 124,
              height: bodyBoundsMm.height - 30,
            }),
            style: defaultStyle({
              fill: palette.mountFill,
              fillOpacity: 0.75,
              stroke: palette.mountStroke,
              strokeWidthMm: 0.55,
            }),
          },
          {
            kind: 'polyline',
            closed: false,
            pointsMm: [
              { x: roundMm(bodyBoundsMm.x + bodyBoundsMm.width / 2 + 160), y: roundMm(bodyBoundsMm.y + 10) },
              { x: roundMm(bodyBoundsMm.x + bodyBoundsMm.width / 2 + 250), y: roundMm(bodyBoundsMm.y + 50) },
              { x: roundMm(bodyBoundsMm.x + bodyBoundsMm.width / 2 + 220), y: roundMm(bodyBoundsMm.y + 120) },
            ],
            style: defaultStyle({
              stroke: palette.mountStroke,
              strokeWidthMm: 10,
              lineCap: 'round',
            }),
          },
        )
      } else {
        bodyNodes.push({
          kind: 'polyline',
          closed: true,
          pointsMm: rectToPoints({
            x: bodyBoundsMm.x + 10,
            y: bodyBoundsMm.y + 6,
            width: bodyBoundsMm.width - 20,
            height: bodyBoundsMm.height - 12,
          }),
          style: defaultStyle({
            fill: palette.mountFill,
            fillOpacity: 0.72,
            stroke: palette.mountStroke,
            strokeWidthMm: 0.55,
          }),
        })
      }

      return bodyNodes
    }
    case 'spectrometer':
      return [
        {
          kind: 'polyline',
          closed: true,
          pointsMm: rectToPoints(bodyBoundsMm),
          style: defaultStyle({
            fill: palette.bodyFill,
            fillOpacity: 0.4,
            stroke: palette.bodyStroke,
            strokeWidthMm: 0.75,
          }),
        },
        {
          kind: 'polyline',
          closed: true,
          pointsMm: rectToPoints({
            x: bodyBoundsMm.x - 22,
            y: centerY - 20,
            width: 22,
            height: 40,
          }),
          style: defaultStyle({
            fill: palette.mountFill,
            fillOpacity: 0.72,
            stroke: palette.mountStroke,
            strokeWidthMm: 0.55,
          }),
        },
      ]
    default:
      return [
        ...(showMount
          ? [
              {
                kind: 'polyline' as const,
                closed: true,
                pointsMm: rectToPoints(mountBoundsMm),
                style: defaultStyle({
                  fill: palette.mountFill,
                  fillOpacity: 0.62,
                  stroke: palette.mountStroke,
                  strokeWidthMm: 0.65,
                }),
              },
            ]
          : []),
        {
          kind: 'polyline',
          closed: true,
          pointsMm: rectToPoints(bodyBoundsMm),
          style: defaultStyle({
            fill: palette.bodyFill,
            fillOpacity: 0.36,
            stroke: palette.bodyStroke,
            strokeWidthMm: 0.7,
          }),
        },
      ]
  }
}

function createComponentNodes(
  component: ComponentInstance,
  renderMode: RenderMode,
  simpleIconStyle: SimpleIconStyle,
  preset: SvgExportPreset,
): {
  componentGroup: VectorGroupNode
  label?: VectorTextNode
  mountGroup?: VectorGroupNode
} {
  const spec = getResolvedComponentSpecForInstance(component)
  const componentPalette = getComponentPalette(component, preset)
  const effectiveSupportBoundsMm = getEffectiveSupportBoundsMm(component, spec)
  const mountBoundsMm = spec.mountVisualBoundsMm ?? spec.mount.supportBoundsMm
  const showMount = shouldIncludeDefaultMount(component)
  const supportStyle = defaultStyle({
    dashMm: [1.8, 1.4],
    fill: preset === 'presentation' ? componentPalette.bodyFill : '#f7fbfd',
    fillOpacity: preset === 'presentation' ? 0.05 : 0.02,
    stroke: componentPalette.supportStroke,
    strokeWidthMm: 0.45,
  })
  const mountNodes =
    spec.mount.mode === 'external-source'
      ? undefined
      : {
          kind: 'group' as const,
          id: `mount-${component.id}`,
          label: `${component.label} Support`,
          children: [
            {
              kind: 'polyline' as const,
              closed: true,
              pointsMm: localBoundsToWorldPolyline(
                component.anchorMm,
                component.rotationQuarterTurns,
                effectiveSupportBoundsMm,
              ),
              style: supportStyle,
            },
          ],
        }

  const localNodes =
    renderMode === 'simple'
      ? renderSimpleLocalGlyph(
          spec.renderHint.glyph,
          spec.visualBodyBoundsMm,
          {
            fill: componentPalette.bodyFill,
            stroke: componentPalette.bodyStroke,
          },
          component.simpleIconStyleOverride ?? simpleIconStyle,
        )
      : renderRealisticLocalHardware(
          component,
          spec.visualBodyBoundsMm,
          mountBoundsMm,
          showMount,
          componentPalette,
        )

  const worldNodes = localNodes.map((node, index) =>
    transformNode(node, component.anchorMm, component.rotationQuarterTurns, `${component.id}-${index}`),
  )

  const rotatedSupportBoundsMm = rotateBoundsQuarterTurns(
    effectiveSupportBoundsMm,
    component.rotationQuarterTurns,
  )
  const label = {
    kind: 'text' as const,
    id: `label-${component.id}`,
    positionMm: {
      x: roundMm(component.anchorMm.x + rotatedSupportBoundsMm.x + rotatedSupportBoundsMm.width / 2),
      y: roundMm(component.anchorMm.y + rotatedSupportBoundsMm.y + rotatedSupportBoundsMm.height + 9),
    },
    text: component.label,
    style: defaultStyle({
      fill: componentPalette.text,
      fontFamily: SVG_SANS_FONT,
      fontSizeMm: 5.5,
      textAnchor: 'middle',
    }),
  }

  return {
    componentGroup: {
      kind: 'group',
      id: `component-${component.id}`,
      label: component.label,
      children: worldNodes,
    },
    label,
    mountGroup: mountNodes,
  }
}

function transformNode(
  node: VectorNode,
  anchorMm: Vector2Mm,
  rotationQuarterTurns: QuarterTurn,
  fallbackId: string,
): VectorNode {
  switch (node.kind) {
    case 'group':
      return {
        ...node,
        id: node.id ?? fallbackId,
        children: node.children.map((child, index) =>
          transformNode(child, anchorMm, rotationQuarterTurns, `${fallbackId}-${index}`),
        ),
      }
    case 'line':
      return localLineToWorld(
        anchorMm,
        rotationQuarterTurns,
        { x: node.x1Mm, y: node.y1Mm },
        { x: node.x2Mm, y: node.y2Mm },
        node.style,
        node.id ?? fallbackId,
      )
    case 'polyline':
      return {
        ...node,
        id: node.id ?? fallbackId,
        pointsMm: localPointsToWorld(anchorMm, rotationQuarterTurns, node.pointsMm),
      }
    case 'circle':
      return localCircleToWorld(
        anchorMm,
        rotationQuarterTurns,
        node.centerMm,
        node.radiusMm,
        node.style,
        node.id ?? fallbackId,
      )
    case 'ellipse':
      return localEllipseToWorld(
        anchorMm,
        rotationQuarterTurns,
        node.centerMm,
        node.radiusXMm,
        node.radiusYMm,
        node.style,
        node.id ?? fallbackId,
      )
    case 'text':
      return {
        ...node,
        id: node.id ?? fallbackId,
        positionMm: localPointToWorld(anchorMm, rotationQuarterTurns, node.positionMm),
      }
  }
}

function getSegmentDash(branchKind: string) {
  switch (branchKind) {
    case 'reflected':
      return [4, 2.8]
    case 'generated-shg':
      return [1.3, 2.2]
    default:
      return undefined
  }
}

function getSegmentStrokeWidthMm(segment: BeamSegment) {
  return roundMm(
    clamp(0.34 + segment.powerPercent / 320, 0.3, segment.pathRole === 'shg' ? 0.9 : 1.1),
  )
}

function getSegmentOpacity(segment: BeamSegment) {
  if (segment.outcomeClass === 'low-power') {
    return 0.28
  }

  if (segment.attenuationClass === 'attenuated') {
    return 0.5
  }

  if (segment.attenuationClass === 'clipped') {
    return 0.62
  }

  return segment.pathRole === 'shg' ? 0.94 : 0.78
}

function createBoardNodes(args: {
  board: BreadboardModel | OpticalTableModel
  groupId: string
  layerMap: Map<VectorExportLayerId, VectorNode[]>
  preset: SvgExportPreset
  rotationQuarterTurns: QuarterTurn
  surfaceAnchorMm: Vector2Mm
  surfaceKind: 'breadboard' | 'table'
}) {
  const {
    board,
    groupId,
    layerMap,
    preset,
    rotationQuarterTurns,
    surfaceAnchorMm,
    surfaceKind,
  } = args
  const palette = getExportPalette(preset, board.finish)
  const holeBoard: BreadboardModel = {
    ...board,
    finish: board.finish === 'silver' ? 'clear-anodized' : board.finish,
  }
  const holeAxes = getBreadboardHoleAxesMm(holeBoard)
  const counterboreCenters = getCounterboreCentersMm(holeBoard)
  const boardLabelText = `${board.label} • ${board.widthMm.toFixed(0)} × ${board.heightMm.toFixed(0)} mm • ${getEffectiveHolePitchMm(holeBoard).toFixed(1)} mm pitch`

  pushLayerNode(layerMap, surfaceKind === 'table' ? 'table' : 'breadboards', {
    kind: 'group',
    id: `${groupId}-outline`,
    label: board.label,
    children: [
      {
        kind: 'polyline',
        closed: true,
        id: `${groupId}-shape`,
        pointsMm: localBoundsToWorldPolyline(
          surfaceAnchorMm,
          rotationQuarterTurns,
          {
            x: 0,
            y: 0,
            width: board.widthMm,
            height: board.heightMm,
          },
        ),
        style: defaultStyle({
          fill: palette.boardFill,
          stroke: palette.boardStroke,
          strokeWidthMm: surfaceKind === 'table' ? 0.8 : 0.65,
        }),
      },
    ],
  })

  pushLayerNode(layerMap, 'labels', {
    kind: 'text',
    id: `${groupId}-label`,
    positionMm: localPointToWorld(surfaceAnchorMm, rotationQuarterTurns, {
      x: 2,
      y: -9,
    }),
    text: boardLabelText,
    style: defaultStyle({
      fill: palette.boardLabel,
      fontFamily: SVG_SANS_FONT,
      fontSizeMm: 4.7,
    }),
  })

  for (const centerMm of counterboreCenters) {
    pushLayerNode(layerMap, 'holes', localCircleToWorld(
      surfaceAnchorMm,
      rotationQuarterTurns,
      centerMm,
      6.2,
      defaultStyle({
        fill: surfaceKind === 'table' ? '#b7bec4' : '#2c343b',
        stroke: palette.boardStroke,
        strokeWidthMm: 0.3,
      }),
    ))
    pushLayerNode(layerMap, 'holes', localCircleToWorld(
      surfaceAnchorMm,
      rotationQuarterTurns,
      centerMm,
      2.1,
      defaultStyle({
        fill: palette.holeFill,
      }),
    ))
  }

  for (const xPositionMm of holeAxes.xPositionsMm) {
    for (const yPositionMm of holeAxes.yPositionsMm) {
      pushLayerNode(
        layerMap,
        'holes',
        localCircleToWorld(
          surfaceAnchorMm,
          rotationQuarterTurns,
          { x: xPositionMm, y: yPositionMm },
          1.5,
          defaultStyle({
            fill: palette.holeFill,
          }),
        ),
      )
    }
  }
}

function createGaussianEnvelopeNodes(
  beamTrace: BeamTraceResult,
  gaussianTrace: GaussianTraceResult,
): VectorNode[] {
  const segmentById = new Map(
    beamTrace.segments.map((segment) => [segment.id, segment] as const),
  )

  return gaussianTrace.segmentAnalyses.flatMap((analysis) => {
    const segment = segmentById.get(analysis.segmentId)

    if (!segment) {
      return []
    }

    const normalMm = {
      x: -segment.directionMm.y,
      y: segment.directionMm.x,
    }

    return [
      {
        kind: 'polyline',
        id: `gaussian-${analysis.segmentId}`,
        closed: true,
        pointsMm: [
          {
            x: roundMm(segment.startMm.x + normalMm.x * analysis.start.spotRadiusMm),
            y: roundMm(segment.startMm.y + normalMm.y * analysis.start.spotRadiusMm),
          },
          {
            x: roundMm(segment.endMm.x + normalMm.x * analysis.end.spotRadiusMm),
            y: roundMm(segment.endMm.y + normalMm.y * analysis.end.spotRadiusMm),
          },
          {
            x: roundMm(segment.endMm.x - normalMm.x * analysis.end.spotRadiusMm),
            y: roundMm(segment.endMm.y - normalMm.y * analysis.end.spotRadiusMm),
          },
          {
            x: roundMm(segment.startMm.x - normalMm.x * analysis.start.spotRadiusMm),
            y: roundMm(segment.startMm.y - normalMm.y * analysis.start.spotRadiusMm),
          },
        ],
        style: defaultStyle({
          fill: getBeamColor(segment.wavelengthNm, segment.pathRole),
          fillOpacity: 0.1,
          stroke: getBeamColor(segment.wavelengthNm, segment.pathRole),
          strokeOpacity: 0.22,
          strokeWidthMm: clamp(analysis.end.beamDiameterMm * 0.015, 0.2, 0.6),
        }),
      },
    ]
  })
}

function createWaistMarkerNodes(
  beamTrace: BeamTraceResult,
  gaussianTrace: GaussianTraceResult,
): VectorNode[] {
  return getGaussianWaistMarkers(beamTrace, gaussianTrace).flatMap((marker) => [
    {
      kind: 'circle' as const,
      id: `waist-marker-${marker.segmentId}`,
      centerMm: marker.pointMm,
      radiusMm: 2.2,
      style: defaultStyle({
        fill: '#ffffff',
        fillOpacity: 0.85,
        stroke: '#33505d',
        strokeWidthMm: 0.4,
      }),
    },
    {
      kind: 'text' as const,
      id: `waist-label-${marker.segmentId}`,
      positionMm: {
        x: roundMm(marker.pointMm.x + 4),
        y: roundMm(marker.pointMm.y - 4),
      },
      text: `w0 ${marker.waistRadiusMm.toFixed(3)} mm • z ${marker.zPositionMm.toFixed(1)} mm`,
      style: defaultStyle({
        fill: '#27414a',
        fontFamily: SVG_MONO_FONT,
        fontSizeMm: 3.8,
      }),
    },
  ])
}

export function createVectorExportSceneGraph({
  beamTrace,
  breadboardSurfaceId,
  gaussianTrace,
  renderMode,
  scene,
  scope,
  showGaussianEnvelope,
  simpleIconStyle,
  svgPreset = 'engineering',
}: CreateVectorExportSceneGraphArgs): VectorExportSceneGraph {
  const layerMap = createLayerMap()
  const boundsMm = getExportWorldBoundsMm(scene, scope, breadboardSurfaceId)
  const primaryBreadboard = getWorkspacePrimaryBreadboard(scene)
  const opticalTable = getOpticalTable(scene)
  const breadboardInstances = getBreadboardInstances(scene)
  const exportBreadboardInstance =
    scene.workspace.kind === 'optical-table'
      ? getBreadboardInstance(scene, breadboardSurfaceId) ?? breadboardInstances[0]
      : undefined
  const showTableSurface = !(
    scope === 'breadboard-only' && scene.workspace.kind === 'optical-table'
  )
  const breadboardsToRender =
    scene.workspace.kind === 'single-breadboard'
      ? []
      : scope === 'breadboard-only' && exportBreadboardInstance
        ? [exportBreadboardInstance]
        : breadboardInstances
  const componentsToRender =
    scope === 'breadboard-only' && exportBreadboardInstance
      ? scene.components.filter(
          (component) =>
            getHostSurfaceIdForComponent(scene, component) === exportBreadboardInstance.id,
        )
      : scene.components

  if (scene.workspace.kind === 'single-breadboard') {
    createBoardNodes({
      board: primaryBreadboard,
      groupId: 'single-breadboard',
      layerMap,
      preset: svgPreset,
      rotationQuarterTurns: 0,
      surfaceAnchorMm: { x: 0, y: 0 },
      surfaceKind: 'breadboard',
    })
  } else {
    if (opticalTable && showTableSurface) {
      createBoardNodes({
        board: opticalTable,
        groupId: 'optical-table',
        layerMap,
        preset: svgPreset,
        rotationQuarterTurns: 0,
        surfaceAnchorMm: { x: 0, y: 0 },
        surfaceKind: 'table',
      })
    }

    for (const breadboard of breadboardsToRender) {
      createBoardNodes({
        board: {
          ...breadboard.model,
          label: breadboard.label,
        },
        groupId: `breadboard-${breadboard.id}`,
        layerMap,
        preset: svgPreset,
        rotationQuarterTurns: breadboard.rotationQuarterTurns,
        surfaceAnchorMm: breadboard.anchorMm,
        surfaceKind: 'breadboard',
      })
    }
  }

  for (const component of componentsToRender) {
    const { componentGroup, label, mountGroup } = createComponentNodes(
      component,
      renderMode,
      simpleIconStyle,
      svgPreset,
    )

    if (mountGroup) {
      pushLayerNode(layerMap, 'mounts', mountGroup)
    }

    pushLayerNode(layerMap, 'components', componentGroup)

    if (label) {
      pushLayerNode(layerMap, 'labels', label)
    }
  }

  for (const segment of beamTrace.segments) {
    pushLayerNode(layerMap, 'beams', {
      kind: 'line',
      id: `beam-${segment.id}`,
      x1Mm: segment.startMm.x,
      y1Mm: segment.startMm.y,
      x2Mm: segment.endMm.x,
      y2Mm: segment.endMm.y,
      style: defaultStyle({
        dashMm: getSegmentDash(segment.branchKind),
        lineCap: 'round',
        opacity: getSegmentOpacity(segment),
        stroke: getBeamColor(segment.wavelengthNm, segment.pathRole),
        strokeWidthMm: getSegmentStrokeWidthMm(segment),
      }),
    })
  }

  for (const annotation of scene.annotations) {
    if (annotation.hidden) {
      continue
    }

    const annotationLayer: VectorExportLayerId =
      annotation.layerBand === 'below-components'
        ? 'annotations-below'
        : 'annotations-above'

    if (annotation.kind === 'line') {
      pushLayerNode(layerMap, annotationLayer, {
        kind: 'line',
        id: `annotation-${annotation.id}`,
        x1Mm: annotation.startMm.x,
        y1Mm: annotation.startMm.y,
        x2Mm: annotation.endMm.x,
        y2Mm: annotation.endMm.y,
        style: defaultStyle({
          lineCap: 'round',
          opacity: 1,
          stroke: annotation.color,
          strokeWidthMm: annotation.strokeWidthMm,
        }),
      })
      continue
    }

    const nodes =
      annotation.kind === 'text'
        ? createTextAnnotationNodes(annotation)
        : createShapeAnnotationNodes(annotation)

    for (const node of nodes) {
      pushLayerNode(layerMap, annotationLayer, node)
    }
  }

  if (showGaussianEnvelope) {
    for (const node of createGaussianEnvelopeNodes(beamTrace, gaussianTrace)) {
      pushLayerNode(layerMap, 'gaussian', node)
    }

    for (const node of createWaistMarkerNodes(beamTrace, gaussianTrace)) {
      pushLayerNode(layerMap, 'gaussian', node)
    }
  }

  return {
    background: getExportPalette(svgPreset, opticalTable?.finish ?? primaryBreadboard.finish).background,
    boundsMm,
    layers: LAYER_ORDER.map((layer) => ({
      ...layer,
      nodes: layerMap.get(layer.id) ?? [],
    })).filter((layer) => layer.nodes.length > 0),
  }
}

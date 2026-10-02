import type { VectorNode, VectorNodeStyle } from './vectorExportScene'
import type {
  BoundsMm,
  ComponentInstance,
  ComponentType,
  ResolvedComponentSpec,
  Vector2Mm,
} from './types'

export interface CreateRealisticAppearanceArgs {
  instance: ComponentInstance
  spec: ResolvedComponentSpec
  showMount: boolean
  view: 'top-down' | 'angled'
  projectPoint: (localPointMm: Vector2Mm, elevationMm?: number) => Vector2Mm
}

type PilotComponentType = Extract<
  ComponentType,
  'mirror' | 'lens' | 'beamsplitter' | 'bbo-crystal' | 'laser-source' | 'detector'
>

type GradientStyle = VectorNodeStyle & {
  fillLinearGradient: {
    startMm: Vector2Mm
    endMm: Vector2Mm
    stops: Array<{ offset: number; color: string }>
  }
}

interface RecipeContext extends CreateRealisticAppearanceArgs {
  extrusionMm: number
  type: PilotComponentType
}

const PILOT_TYPES = new Set<ComponentType>([
  'mirror',
  'lens',
  'beamsplitter',
  'bbo-crystal',
  'laser-source',
  'detector',
])

const PALETTE = {
  housing: '#111827',
  housingMid: '#263548',
  housingLight: '#4d6074',
  housingStroke: '#07101f',
  metal: '#8090a2',
  metalLight: '#e6edf3',
  glass: '#69d4eb',
  glassLight: '#e4fbff',
  crystal: '#d8ad55',
  crystalCool: '#79c7bf',
  crystalLight: '#fff4c7',
  detector: '#5b4050',
  detectorLight: '#eac5d9',
  shadow: '#07101f',
} as const

function centerOf(bounds: BoundsMm): Vector2Mm {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  }
}

function insetBounds(bounds: BoundsMm, xRatio: number, yRatio = xRatio): BoundsMm {
  const insetX = bounds.width * xRatio
  const insetY = bounds.height * yRatio

  return {
    x: bounds.x + insetX,
    y: bounds.y + insetY,
    width: Math.max(0.1, bounds.width - insetX * 2),
    height: Math.max(0.1, bounds.height - insetY * 2),
  }
}

function scaledBounds(bounds: BoundsMm, widthRatio: number, heightRatio: number): BoundsMm {
  const center = centerOf(bounds)
  const width = bounds.width * widthRatio
  const height = bounds.height * heightRatio

  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
  }
}

function rotatePoints(points: Vector2Mm[], center: Vector2Mm, degrees: number): Vector2Mm[] {
  const radians = (degrees * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)

  return points.map((point) => {
    const x = point.x - center.x
    const y = point.y - center.y

    return {
      x: center.x + x * cosine - y * sine,
      y: center.y + x * sine + y * cosine,
    }
  })
}

function ellipsePoints(bounds: BoundsMm, samples = 28): Vector2Mm[] {
  const center = centerOf(bounds)

  return Array.from({ length: samples }, (_, index) => {
    const angle = (index / samples) * Math.PI * 2

    return {
      x: center.x + Math.cos(angle) * bounds.width * 0.5,
      y: center.y + Math.sin(angle) * bounds.height * 0.5,
    }
  })
}

function roundedRectPoints(bounds: BoundsMm, radiusRatio = 0.16, steps = 4): Vector2Mm[] {
  const radius = Math.min(bounds.width, bounds.height) * radiusRatio
  const corners = [
    { x: bounds.x + bounds.width - radius, y: bounds.y + radius, start: -Math.PI / 2 },
    {
      x: bounds.x + bounds.width - radius,
      y: bounds.y + bounds.height - radius,
      start: 0,
    },
    { x: bounds.x + radius, y: bounds.y + bounds.height - radius, start: Math.PI / 2 },
    { x: bounds.x + radius, y: bounds.y + radius, start: Math.PI },
  ]

  return corners.flatMap((corner) =>
    Array.from({ length: steps + 1 }, (_, index) => {
      const angle = corner.start + (index / steps) * (Math.PI / 2)

      return {
        x: corner.x + Math.cos(angle) * radius,
        y: corner.y + Math.sin(angle) * radius,
      }
    }),
  )
}

function projectPoints(
  context: RecipeContext,
  points: Vector2Mm[],
  elevationMm = 0,
): Vector2Mm[] {
  return points.map((point) => context.projectPoint(point, elevationMm))
}

function polygon(
  context: RecipeContext,
  id: string,
  points: Vector2Mm[],
  style: VectorNodeStyle,
  elevationMm = 0,
): VectorNode {
  return {
    kind: 'polyline',
    id,
    closed: true,
    pointsMm: projectPoints(context, points, elevationMm),
    style,
  }
}

function line(
  context: RecipeContext,
  id: string,
  start: Vector2Mm,
  end: Vector2Mm,
  style: VectorNodeStyle,
  elevationMm = 0,
): VectorNode {
  const projectedStart = context.projectPoint(start, elevationMm)
  const projectedEnd = context.projectPoint(end, elevationMm)

  return {
    kind: 'line',
    id,
    x1Mm: projectedStart.x,
    y1Mm: projectedStart.y,
    x2Mm: projectedEnd.x,
    y2Mm: projectedEnd.y,
    style,
  }
}

function gradientStyle(
  context: RecipeContext,
  bounds: BoundsMm,
  colors: string[],
  elevationMm: number,
  base: VectorNodeStyle,
): GradientStyle {
  const startMm = context.projectPoint({ x: bounds.x, y: bounds.y }, elevationMm)
  const endMm = context.projectPoint(
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    elevationMm,
  )

  return {
    ...base,
    fillLinearGradient: {
      startMm,
      endMm,
      stops: colors.map((color, index) => ({
        offset: colors.length === 1 ? 0 : index / (colors.length - 1),
        color,
      })),
    },
  }
}

function group(id: string, children: VectorNode[]): VectorNode {
  return { kind: 'group', id, children }
}

function frontEdge(points: Vector2Mm[]): [Vector2Mm, Vector2Mm] {
  const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length
  const frontPoints = points.filter((point) => point.y >= centerY)
  const left = frontPoints.reduce((current, point) =>
    point.x < current.x ? point : current,
  )
  const right = frontPoints.reduce((current, point) =>
    point.x > current.x ? point : current,
  )

  return [left, right]
}

function extrudedSide(
  context: RecipeContext,
  id: string,
  lowerEdge: [Vector2Mm, Vector2Mm],
  elevationMm: number,
  fill: string = PALETTE.housingStroke,
): VectorNode | undefined {
  if (context.view !== 'angled' || elevationMm <= 0) {
    return undefined
  }

  return {
    kind: 'polyline',
    id,
    closed: true,
    pointsMm: [
      context.projectPoint(lowerEdge[0], 0),
      context.projectPoint(lowerEdge[1], 0),
      context.projectPoint(lowerEdge[1], elevationMm),
      context.projectPoint(lowerEdge[0], elevationMm),
    ],
    style: { fill, stroke: PALETTE.housingStroke, strokeWidthMm: 0.32, opacity: 0.94 },
  }
}

function shadowGroup(context: RecipeContext, bounds: BoundsMm): VectorNode {
  const shadowBounds = scaledBounds(bounds, 0.9, 0.86)

  return group(`${context.type}-shadow`, [
    polygon(context, 'soft-shadow', ellipsePoints(shadowBounds, 24), {
      fill: PALETTE.shadow,
      opacity: context.view === 'angled' ? 0.13 : 0.08,
    }),
  ])
}

function mountGroup(context: RecipeContext): VectorNode | undefined {
  if (!context.showMount || !context.spec.mountVisualBoundsMm) {
    return undefined
  }

  const bounds = scaledBounds(context.spec.mountVisualBoundsMm, 0.92, 0.78)
  const topElevation = context.view === 'angled' ? Math.min(3, context.extrusionMm * 0.35) : 0
  const side = extrudedSide(
    context,
    'mount-front-face',
    [
      { x: bounds.x, y: bounds.y + bounds.height },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    ],
    topElevation,
    '#101b2a',
  )
  const mountTop = polygon(
    context,
    'mount-top',
    roundedRectPoints(bounds, 0.18, 5),
    gradientStyle(
      context,
      bounds,
      [PALETTE.housing, PALETTE.housingMid, PALETTE.housing],
      topElevation,
      { fill: PALETTE.housing, stroke: PALETTE.housingStroke, strokeWidthMm: 0.55 },
    ),
    topElevation,
  )
  const center = centerOf(bounds)
  const inset = scaledBounds(bounds, 0.54, 0.62)

  return group(`${context.type}-mount`, [
    ...(side ? [side] : []),
    mountTop,
    polygon(context, 'mount-recess', ellipsePoints(inset, 24), {
      fill: '#26364a',
      stroke: '#65778a',
      strokeWidthMm: 0.35,
      opacity: 0.86,
    }, topElevation + 0.15),
    polygon(
      context,
      'mount-fastener-left',
      ellipsePoints({ x: center.x - bounds.width * 0.3, y: center.y - 1, width: 2, height: 2 }, 14),
      { fill: PALETTE.metal, stroke: PALETTE.metalLight, strokeWidthMm: 0.2 },
      topElevation + 0.25,
    ),
    polygon(
      context,
      'mount-fastener-right',
      ellipsePoints({ x: center.x + bounds.width * 0.3 - 2, y: center.y - 1, width: 2, height: 2 }, 14),
      { fill: PALETTE.metal, stroke: PALETTE.metalLight, strokeWidthMm: 0.2 },
      topElevation + 0.25,
    ),
  ])
}

function mirrorRecipe(context: RecipeContext): VectorNode[] {
  const body = context.spec.visualBodyBoundsMm
  const center = centerOf(body)
  const faceBounds = scaledBounds(body, 0.28, 0.94)
  const face = rotatePoints(roundedRectPoints(faceBounds, 0.3, 5), center, -42)
  const inner = rotatePoints(
    roundedRectPoints(scaledBounds(faceBounds, 0.42, 0.86), 0.38, 5),
    center,
    -42,
  )
  const elevation = context.view === 'angled' ? context.extrusionMm : 0
  const mount = mountGroup(context)
  const side = extrudedSide(context, 'mirror-edge', frontEdge(face), elevation, '#111b29')

  return [
    shadowGroup(
      context,
      context.showMount ? (context.spec.mountVisualBoundsMm ?? body) : body,
    ),
    ...(mount ? [mount] : []),
    group('mirror-body', [
      ...(side ? [side] : []),
      polygon(context, 'mirror-rim', face, {
        fill: PALETTE.housing,
        stroke: PALETTE.housingStroke,
        strokeWidthMm: 0.55,
      }, elevation),
      polygon(
        context,
        'mirror-face',
        inner,
        gradientStyle(
          context,
          body,
          [PALETTE.metal, PALETTE.metalLight, '#7799ac'],
          elevation + 0.2,
          { fill: PALETTE.metal, stroke: '#d9e8f0', strokeWidthMm: 0.3 },
        ),
        elevation + 0.2,
      ),
    ]),
  ]
}

function lensRecipe(context: RecipeContext): VectorNode[] {
  const body = context.spec.visualBodyBoundsMm
  const elevation = context.view === 'angled' ? context.extrusionMm : 0
  const rimBounds = scaledBounds(body, 0.72, 0.96)
  const glassBounds = insetBounds(rimBounds, 0.18, 0.09)
  const center = centerOf(glassBounds)
  const mount = mountGroup(context)
  const rim = ellipsePoints(rimBounds, 32)
  const side = extrudedSide(context, 'lens-edge', frontEdge(rim), elevation, '#142535')

  return [
    shadowGroup(
      context,
      context.showMount ? (context.spec.mountVisualBoundsMm ?? body) : body,
    ),
    ...(mount ? [mount] : []),
    group('lens-body', [
      ...(side ? [side] : []),
      polygon(context, 'lens-rim', rim, {
        fill: PALETTE.housingMid,
        stroke: PALETTE.housingStroke,
        strokeWidthMm: 0.5,
      }, elevation),
      polygon(
        context,
        'lens-glass',
        ellipsePoints(glassBounds, 32),
        gradientStyle(
          context,
          glassBounds,
          ['#2f7fa0', PALETTE.glass, PALETTE.glassLight, '#3a91b0'],
          elevation + 0.2,
          { fill: PALETTE.glass, fillOpacity: 0.72, stroke: '#c8f4ff', strokeWidthMm: 0.35 },
        ),
        elevation + 0.2,
      ),
      line(
        context,
        'lens-highlight',
        { x: center.x - glassBounds.width * 0.18, y: glassBounds.y + glassBounds.height * 0.15 },
        { x: center.x - glassBounds.width * 0.28, y: glassBounds.y + glassBounds.height * 0.78 },
        { stroke: '#f3fdff', strokeWidthMm: 0.55, opacity: 0.55, lineCap: 'round' },
        elevation + 0.35,
      ),
    ]),
  ]
}

function beamsplitterRecipe(context: RecipeContext): VectorNode[] {
  const body = context.spec.visualBodyBoundsMm
  const center = centerOf(body)
  const elevation = context.view === 'angled' ? context.extrusionMm : 0
  const plateBounds = scaledBounds(body, 0.72, 0.72)
  const plate = rotatePoints(roundedRectPoints(plateBounds, 0.12, 4), center, 45)
  const insetPlate = rotatePoints(
    roundedRectPoints(insetBounds(plateBounds, 0.14), 0.1, 4),
    center,
    45,
  )
  const mount = mountGroup(context)
  const side = extrudedSide(
    context,
    'beamsplitter-edge',
    frontEdge(plate),
    elevation,
    '#10263a',
  )
  const coating = rotatePoints(
    [
      { x: body.x + body.width * 0.24, y: center.y },
      { x: body.x + body.width * 0.76, y: center.y },
    ],
    center,
    45,
  )

  return [
    shadowGroup(
      context,
      context.showMount ? (context.spec.mountVisualBoundsMm ?? body) : body,
    ),
    ...(mount ? [mount] : []),
    group('beamsplitter-body', [
      ...(side ? [side] : []),
      polygon(context, 'beamsplitter-rim', plate, {
        fill: '#173248',
        stroke: PALETTE.housingStroke,
        strokeWidthMm: 0.5,
      }, elevation),
      polygon(
        context,
        'beamsplitter-glass',
        insetPlate,
        gradientStyle(
          context,
          body,
          ['rgba(69, 181, 207, 0.28)', 'rgba(216, 250, 255, 0.82)', 'rgba(54, 148, 175, 0.38)'],
          elevation + 0.2,
          { fill: PALETTE.glass, fillOpacity: 0.48, stroke: '#d9faff', strokeWidthMm: 0.34 },
        ),
        elevation + 0.2,
      ),
      line(
        context,
        'beamsplitter-coating',
        coating[0],
        coating[1],
        { stroke: '#ecfeff', strokeWidthMm: 0.4, opacity: 0.5 },
        elevation + 0.35,
      ),
    ]),
  ]
}

function crystalRecipe(context: RecipeContext): VectorNode[] {
  const body = context.spec.visualBodyBoundsMm
  const mountBounds = context.spec.mountVisualBoundsMm ?? body
  const elevation = context.view === 'angled' ? context.extrusionMm : 0
  const cradle = scaledBounds(mountBounds, 0.9, 0.8)
  const crystal = scaledBounds(body, 0.72, 0.82)
  const crystalCenter = centerOf(crystal)
  const rotatedCrystal = rotatePoints(roundedRectPoints(crystal, 0.14, 4), crystalCenter, -7)
  const crystalSide = extrudedSide(
    context,
    'crystal-edge',
    frontEdge(rotatedCrystal),
    elevation,
    '#52636c',
  )
  const cradleElevation = Math.max(0, elevation * 0.35)
  const cradleSide = context.showMount
    ? extrudedSide(
        context,
        'crystal-cradle-front-face',
        frontEdge(roundedRectPoints(cradle, 0.2, 5)),
        cradleElevation,
        '#111b29',
      )
    : undefined
  const support = context.showMount
    ? [
        ...(cradleSide ? [cradleSide] : []),
        polygon(context, 'crystal-cradle', roundedRectPoints(cradle, 0.2, 5), {
          fill: PALETTE.housing,
          stroke: PALETTE.housingStroke,
          strokeWidthMm: 0.5,
        }, cradleElevation),
        polygon(context, 'crystal-seat', ellipsePoints(scaledBounds(cradle, 0.58, 0.7), 24), {
          fill: PALETTE.housingMid,
          stroke: '#68798c',
          strokeWidthMm: 0.35,
        }, Math.max(0, elevation * 0.38)),
      ]
    : []

  return [
    shadowGroup(context, mountBounds),
    group('bbo-crystal-mount', support),
    group('bbo-crystal-body', [
      ...(crystalSide ? [crystalSide] : []),
      polygon(
        context,
        'crystal-optic',
        rotatedCrystal,
        gradientStyle(
          context,
          crystal,
          [PALETTE.crystal, PALETTE.crystalLight, PALETTE.crystalCool],
          elevation,
          { fill: PALETTE.crystal, fillOpacity: 0.9, stroke: '#fff6dc', strokeWidthMm: 0.45 },
        ),
        elevation,
      ),
      line(
        context,
        'crystal-highlight',
        { x: crystalCenter.x - crystal.width * 0.13, y: crystal.y + crystal.height * 0.12 },
        { x: crystalCenter.x - crystal.width * 0.18, y: crystal.y + crystal.height * 0.84 },
        { stroke: '#ffffff', strokeWidthMm: 0.45, opacity: 0.62, lineCap: 'round' },
        elevation + 0.15,
      ),
    ]),
  ]
}

function laserRecipe(context: RecipeContext): VectorNode[] {
  const body = context.spec.visualBodyBoundsMm
  const elevation = context.view === 'angled' ? context.extrusionMm : 0
  const lowerLeft = { x: body.x, y: body.y + body.height }
  const lowerRight = { x: body.x + body.width, y: body.y + body.height }
  const side = extrudedSide(context, 'laser-front-face', [lowerLeft, lowerRight], elevation)
  const topPlate = {
    x: body.x + body.width * 0.08,
    y: body.y + body.height * 0.1,
    width: body.width * 0.7,
    height: body.height * 0.24,
  }
  const apertureBounds = {
    x: body.x + body.width * 0.84,
    y: body.y + body.height * 0.31,
    width: body.height * 0.38,
    height: body.height * 0.38,
  }
  const ventStartX = body.x + body.width * 0.16
  const ventEndX = body.x + body.width * 0.48

  return [
    shadowGroup(context, body),
    group('laser-source-body', [
      ...(side ? [side] : []),
      polygon(
        context,
        'laser-housing',
        roundedRectPoints(body, 0.15, 6),
        gradientStyle(
          context,
          body,
          [PALETTE.housing, PALETTE.housingMid, '#0b1422'],
          elevation,
          { fill: PALETTE.housing, stroke: PALETTE.housingStroke, strokeWidthMm: 0.65 },
        ),
        elevation,
      ),
      polygon(context, 'laser-top-plate', roundedRectPoints(topPlate, 0.12, 4), {
        fill: PALETTE.housingLight,
        stroke: '#6f8397',
        strokeWidthMm: 0.28,
        opacity: 0.72,
      }, elevation + 0.18),
      ...[0.52, 0.65, 0.78].map((ratio, index) =>
        line(
          context,
          `laser-vent-${index + 1}`,
          { x: ventStartX, y: body.y + body.height * ratio },
          { x: ventEndX, y: body.y + body.height * ratio },
          { stroke: '#020617', strokeWidthMm: Math.max(0.45, body.height * 0.025), lineCap: 'round' },
          elevation + 0.2,
        ),
      ),
    ]),
    group('laser-source-details', [
      polygon(context, 'laser-aperture-rim', ellipsePoints(apertureBounds, 24), {
        fill: '#1e293b',
        stroke: PALETTE.metal,
        strokeWidthMm: 0.38,
      }, elevation + 0.3),
      polygon(context, 'laser-aperture', ellipsePoints(insetBounds(apertureBounds, 0.24), 24), {
        fill: '#d55e00',
        stroke: '#7c2d12',
        strokeWidthMm: 0.3,
      }, elevation + 0.42),
      polygon(
        context,
        'laser-status',
        ellipsePoints({
          x: body.x + body.width * 0.67,
          y: body.y + body.height * 0.65,
          width: body.height * 0.16,
          height: body.height * 0.16,
        }, 20),
        { fill: '#4ade80', stroke: '#14532d', strokeWidthMm: 0.35, opacity: 0.9 },
        elevation + 0.35,
      ),
    ]),
  ]
}

function detectorRecipe(context: RecipeContext): VectorNode[] {
  const body = context.spec.visualBodyBoundsMm
  const elevation = context.view === 'angled' ? context.extrusionMm : 0
  const side = extrudedSide(
    context,
    'detector-front-face',
    [
      { x: body.x, y: body.y + body.height },
      { x: body.x + body.width, y: body.y + body.height },
    ],
    elevation,
    '#16101a',
  )
  const sensorSize = Math.min(body.height * 0.58, body.width * 0.42)
  const sensorBounds = {
    x: body.x + body.width * 0.07,
    y: centerOf(body).y - sensorSize / 2,
    width: sensorSize,
    height: sensorSize,
  }
  const mount = mountGroup(context)

  return [
    shadowGroup(
      context,
      context.showMount ? (context.spec.mountVisualBoundsMm ?? body) : body,
    ),
    ...(mount ? [mount] : []),
    group('detector-body', [
      ...(side ? [side] : []),
      polygon(
        context,
        'detector-housing',
        roundedRectPoints(body, 0.18, 5),
        gradientStyle(
          context,
          body,
          [PALETTE.housing, PALETTE.detector, PALETTE.housing],
          elevation,
          { fill: PALETTE.housing, stroke: PALETTE.housingStroke, strokeWidthMm: 0.55 },
        ),
        elevation,
      ),
      polygon(context, 'detector-sensor-rim', ellipsePoints(sensorBounds, 28), {
        fill: '#17131a',
        stroke: PALETTE.detectorLight,
        strokeWidthMm: 0.38,
      }, elevation + 0.25),
      polygon(context, 'detector-sensor', ellipsePoints(insetBounds(sensorBounds, 0.22), 28), {
        fill: '#14384a',
        stroke: '#87c7d9',
        strokeWidthMm: 0.28,
      }, elevation + 0.38),
      ...[0.32, 0.5, 0.68].map((ratio, index) =>
        line(
          context,
          `detector-groove-${index + 1}`,
          { x: body.x + body.width * 0.56, y: body.y + body.height * ratio },
          { x: body.x + body.width * 0.88, y: body.y + body.height * ratio },
          { stroke: '#8190a0', strokeWidthMm: 0.32, opacity: 0.52, lineCap: 'round' },
          elevation + 0.2,
        ),
      ),
    ]),
  ]
}

export function createRealisticAppearance(
  args: CreateRealisticAppearanceArgs,
): VectorNode[] | undefined {
  if (!PILOT_TYPES.has(args.instance.type)) {
    return undefined
  }

  const context: RecipeContext = {
    ...args,
    type: args.instance.type as PilotComponentType,
    extrusionMm: args.spec.twoPointFiveDVisualPreset?.extrusionMm ?? 8,
  }

  switch (context.type) {
    case 'mirror':
      return mirrorRecipe(context)
    case 'lens':
      return lensRecipe(context)
    case 'beamsplitter':
      return beamsplitterRecipe(context)
    case 'bbo-crystal':
      return crystalRecipe(context)
    case 'laser-source':
      return laserRecipe(context)
    case 'detector':
      return detectorRecipe(context)
  }
}

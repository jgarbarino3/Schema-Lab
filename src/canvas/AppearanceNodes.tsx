import { Circle, Ellipse, Group, Line, Text } from 'react-konva'
import type { VectorNode } from '../domain/vectorExportScene'
import { applyAlpha } from './appearanceColor'

export function AppearanceNodes({ nodes }: { nodes: VectorNode[] }) {
  return nodes.map((node, index) => {
    const key = node.id ?? `${node.kind}-${index}`
    if (node.kind === 'group') {
      return <Group key={key}><AppearanceNodes nodes={node.children} /></Group>
    }
    const style = node.style ?? {}
    const gradient = style.fillLinearGradient
    const common = {
      dash: style.dashMm,
      fill: gradient ? undefined : style.fill && style.fillOpacity !== undefined ? applyAlpha(style.fill, style.fillOpacity) : style.fill,
      fillLinearGradientStartPoint: gradient?.startMm,
      fillLinearGradientEndPoint: gradient?.endMm,
      fillLinearGradientColorStops: gradient?.stops.flatMap(({ offset, color }) => [offset, color]),
      lineCap: style.lineCap,
      lineJoin: style.lineJoin,
      listening: false,
      opacity: style.opacity,
      stroke: style.stroke && style.strokeOpacity !== undefined ? applyAlpha(style.stroke, style.strokeOpacity) : style.stroke,
      strokeWidth: style.strokeWidthMm,
    }
    switch (node.kind) {
      case 'line':
        return <Line key={key} {...common} points={[node.x1Mm, node.y1Mm, node.x2Mm, node.y2Mm]} />
      case 'polyline':
        return <Line key={key} {...common} closed={node.closed} points={node.pointsMm.flatMap(p => [p.x, p.y])} />
      case 'circle':
        return <Circle key={key} {...common} radius={node.radiusMm} x={node.centerMm.x} y={node.centerMm.y} />
      case 'ellipse':
        return <Ellipse key={key} {...common} radiusX={node.radiusXMm} radiusY={node.radiusYMm} rotation={node.rotationDeg} x={node.centerMm.x} y={node.centerMm.y} />
      case 'text':
        return <Text key={key} {...common} text={node.text} x={node.positionMm.x} y={node.positionMm.y} fontSize={style.fontSizeMm} fontFamily={style.fontFamily} fontStyle={style.fontStyle} />
    }
  })
}

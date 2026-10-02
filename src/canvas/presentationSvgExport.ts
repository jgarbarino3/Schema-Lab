import Konva from 'konva'

function xml(value: unknown) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

function number(value: number) {
  if (!Number.isFinite(value)) throw new Error('Presentation contains non-finite geometry.')
  return Number(value.toFixed(6))
}

function linePath(line: Konva.Line) {
  const points = line.points()
  if (points.length < 2) return ''
  const parts = [`M ${number(points[0])} ${number(points[1])}`]
  if (line.tension() !== 0 && points.length > 4) {
    const controls = line.getTensionPoints()
    let index = line.closed() ? 0 : 4
    if (!line.closed()) parts.push(`Q ${controls.slice(0, 4).map(number).join(' ')}`)
    while (index < controls.length - 2) {
      parts.push(`C ${controls.slice(index, index + 6).map(number).join(' ')}`)
      index += 6
    }
    if (!line.closed()) parts.push(`Q ${controls.slice(-2).concat(points.slice(-2)).map(number).join(' ')}`)
  } else if (line.bezier()) {
    for (let index = 2; index < points.length; index += 6) {
      parts.push(`C ${points.slice(index, index + 6).map(number).join(' ')}`)
    }
  } else {
    for (let index = 2; index < points.length; index += 2) {
      parts.push(`L ${number(points[index])} ${number(points[index + 1])}`)
    }
  }
  if (line.closed()) parts.push('Z')
  return parts.join(' ')
}

function rectPath(rect: Konva.Rect) {
  const width = rect.width()
  const height = rect.height()
  const radius = rect.cornerRadius()
  const radii = Array.isArray(radius) ? radius : [radius, radius, radius, radius]
  const [tl, tr, br, bl] = radii.map(r => Math.max(0, Math.min(r ?? 0, width / 2, height / 2)))
  return `M ${tl} 0 H ${width - tr} Q ${width} 0 ${width} ${tr} V ${height - br} Q ${width} ${height} ${width - br} ${height} H ${bl} Q 0 ${height} 0 ${height - bl} V ${tl} Q 0 0 ${tl} 0 Z`
}

function renderText(text: Konva.Text, style: string) {
  const padding = text.padding()
  const fontSize = text.fontSize()
  const lineHeight = text.lineHeight() * fontSize
  const availableHeight = text.height() - padding * 2 - text.textArr.length * lineHeight
  const verticalOffset = text.verticalAlign() === 'middle' ? availableHeight / 2
    : text.verticalAlign() === 'bottom' ? availableHeight : 0
  const metrics = text.measureSize('M')
  const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent
  const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent
  const baseline = Konva.legacyTextRendering ? lineHeight / 2 : (ascent - descent) / 2 + lineHeight / 2
  const fontStyle = text.fontStyle()
  const attributes = `${style} font-family="${xml(text.fontFamily())}" font-size="${number(fontSize)}" font-weight="${/bold|[5-9]00/.test(fontStyle) ? 'bold' : 'normal'}" font-style="${fontStyle.includes('italic') ? 'italic' : 'normal'}" letter-spacing="${text.letterSpacing()}"${Konva.legacyTextRendering ? ' dominant-baseline="central"' : ''} xml:space="preserve"`
  return text.textArr.map((line, index) => {
    const remaining = text.width() - padding * 2 - line.width
    const x = padding + (text.align() === 'center' ? remaining / 2 : text.align() === 'right' ? remaining : 0)
    const y = padding + verticalOffset + baseline + index * lineHeight
    return `<text x="${number(x)}" y="${number(y)}" ${attributes}>${xml(line.text)}</text>`
  }).join('')
}

// Consume the isolated presentation stage, never the interactive editor stage.
// Every supported primitive remains editable SVG; unknown shapes fail loudly.
export function createPresentationSvg(stage: Konva.Container, { title }: { title: string }) {
  const definitions: string[] = []
  let sequence = 0

  function shapeStyle(shape: Konva.Shape) {
    const parts: string[] = []
    let fill = shape.fillEnabled() ? shape.fill() : undefined
    const stops = shape.fillLinearGradientColorStops()
    if (shape.fillEnabled() && stops?.length && (!fill || shape.fillPriority() === 'linear-gradient')) {
      const id = `paint-${sequence++}`
      const start = shape.fillLinearGradientStartPoint()
      const end = shape.fillLinearGradientEndPoint()
      definitions.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${number(start.x)}" y1="${number(start.y)}" x2="${number(end.x)}" y2="${number(end.y)}">${Array.from({ length: stops.length / 2 }, (_, i) => `<stop offset="${stops[i * 2]}" stop-color="${xml(stops[i * 2 + 1])}" />`).join('')}</linearGradient>`)
      fill = `url(#${id})`
    }
    parts.push(`fill="${xml(fill || 'none')}"`)
    if (shape.strokeEnabled() && shape.stroke()) {
      parts.push(`stroke="${xml(shape.stroke())}" stroke-width="${number(shape.strokeWidth())}"`)
      if (!shape.strokeScaleEnabled()) parts.push('vector-effect="non-scaling-stroke"')
      if (shape.dashEnabled() && shape.dash()?.length) parts.push(`stroke-dasharray="${shape.dash().map(number).join(' ')}"`)
      parts.push(`stroke-linecap="${shape.lineCap() || 'butt'}" stroke-linejoin="${shape.lineJoin() || 'miter'}"`)
    }
    if (shape.shadowEnabled() && shape.shadowColor() && shape.shadowOpacity() > 0 && (shape.shadowBlur() || shape.shadowOffsetX() || shape.shadowOffsetY())) {
      const id = `shadow-${sequence++}`
      definitions.push(`<filter id="${id}" x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB"><feDropShadow dx="${shape.shadowOffsetX()}" dy="${shape.shadowOffsetY()}" stdDeviation="${shape.shadowBlur() / 2}" flood-color="${xml(shape.shadowColor())}" flood-opacity="${shape.shadowOpacity()}" /></filter>`)
      parts.push(`filter="url(#${id})"`)
    }
    return parts.join(' ')
  }

  function render(node: Konva.Node): string {
    if (!node.visible() || node.opacity() === 0) return ''
    if (node.getAttr('clipFunc') || node.getAttr('clipWidth') || node.getAttr('clipHeight')) {
      throw new Error('Clipped presentation nodes cannot be exported as SVG yet.')
    }
    const className = node.getClassName()
    let content: string
    if (className === 'Stage' || className === 'Layer' || className === 'Group' || className === 'FastLayer') {
      content = (node as Konva.Container).getChildren().map(render).join('')
    } else {
      const shape = node as Konva.Shape
      const style = shapeStyle(shape)
      switch (className) {
        case 'Rect': content = `<path d="${rectPath(node as Konva.Rect)}" ${style} />`; break
        case 'Circle': content = `<circle r="${number((node as Konva.Circle).radius())}" ${style} />`; break
        case 'Ellipse': {
          const ellipse = node as Konva.Ellipse
          content = `<ellipse rx="${number(ellipse.radiusX())}" ry="${number(ellipse.radiusY())}" ${style} />`
          break
        }
        case 'Line': content = `<path d="${linePath(node as Konva.Line)}" ${style} />`; break
        case 'Arrow': {
          const arrow = node as Konva.Arrow
          const points = arrow.points()
          const head = (atStart: boolean) => {
            const end = atStart ? 0 : points.length - 2
            const before = atStart ? 2 : points.length - 4
            const angle = Math.atan2(points[end + 1] - points[before + 1], points[end] - points[before])
            const length = arrow.pointerLength()
            const half = arrow.pointerWidth() / 2
            return `<path d="M 0 0 L ${-length} ${half} L ${-length} ${-half} Z" transform="translate(${points[end]} ${points[end + 1]}) rotate(${angle * 180 / Math.PI})" ${style} />`
          }
          content = `<path d="${linePath(arrow)}" ${style} />${arrow.pointerAtBeginning() ? head(true) : ''}${arrow.pointerAtEnding() ? head(false) : ''}`
          break
        }
        case 'Text': content = renderText(node as Konva.Text, style); break
        default: throw new Error(`Unsupported presentation primitive: ${className}. Export was not rasterized.`)
      }
    }
    const transform = node.getTransform().getMatrix().map(number).join(' ')
    const id = node.id() ? ` id="${xml(node.id())}"` : ''
    return `<g${id} transform="matrix(${transform})" opacity="${node.opacity()}">${content}</g>`
  }

  const content = render(stage)
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${stage.width()}" height="${stage.height()}" viewBox="0 0 ${stage.width()} ${stage.height()}" version="1.1"><title>${xml(title)} · Schema-Lab presentation</title><defs>${definitions.join('')}</defs>${content}</svg>`
}

export function fitPresentationStage(stage: Konva.Stage, paddingPx = 48) {
  const layers = stage.getLayers().filter(layer => layer.name() !== 'export-background')
  for (const layer of layers) {
    layer.position({ x: 0, y: 0 })
    layer.scale({ x: 1, y: 1 })
  }
  const bounds = layers.map(layer => layer.getClientRect({ relativeTo: stage }))
    .filter(rect => rect.width > 0 && rect.height > 0)
  if (!bounds.length) return
  const minX = Math.min(...bounds.map(b => b.x))
  const minY = Math.min(...bounds.map(b => b.y))
  const width = Math.max(...bounds.map(b => b.x + b.width)) - minX
  const height = Math.max(...bounds.map(b => b.y + b.height)) - minY
  const scale = Math.min((stage.width() - paddingPx * 2) / width, (stage.height() - paddingPx * 2) / height)
  const offset = { x: (stage.width() - width * scale) / 2 - minX * scale, y: (stage.height() - height * scale) / 2 - minY * scale }
  for (const layer of layers) {
    layer.scale({ x: scale, y: scale })
    layer.position(offset)
  }
  stage.draw()
}

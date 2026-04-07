import { useMemo } from 'react'
import type { MouseEvent } from 'react'
import type { Vector2Mm } from '../domain/types'
import type { SvgImportDocument } from '../domain/svgImport'

interface SvgImportPreviewProps {
  className?: string
  document: SvgImportDocument
  highlightedElementIds?: string[]
  onSelectPoint?: (point: Vector2Mm) => void
  selectedPoints?: Vector2Mm[]
}

function formatPoints(points: Vector2Mm[]) {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

export function SvgImportPreview(props: SvgImportPreviewProps) {
  const {
    className,
    document,
    highlightedElementIds = [],
    onSelectPoint,
    selectedPoints = [],
  } = props
  const highlightedSet = useMemo(
    () => new Set(highlightedElementIds),
    [highlightedElementIds],
  )

  const handleClick = (event: MouseEvent<SVGSVGElement>) => {
    if (!onSelectPoint) {
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return
    }

    const xRatio = (event.clientX - rect.left) / rect.width
    const yRatio = (event.clientY - rect.top) / rect.height

    onSelectPoint({
      x: document.bounds.x + xRatio * document.bounds.width,
      y: document.bounds.y + yRatio * document.bounds.height,
    })
  }

  return (
    <svg
      className={className}
      onClick={handleClick}
      viewBox={`${document.bounds.x} ${document.bounds.y} ${document.bounds.width} ${document.bounds.height}`}
    >
      <rect
        fill="rgba(6, 9, 12, 0.42)"
        height={document.bounds.height}
        stroke="rgba(130, 166, 192, 0.32)"
        strokeWidth={0.8}
        width={document.bounds.width}
        x={document.bounds.x}
        y={document.bounds.y}
      />
      {document.elements.map((element) => {
        const points = formatPoints(element.points)
        const isHighlighted = highlightedSet.has(element.id)

        if (element.isClosed) {
          return (
            <polygon
              fill={isHighlighted ? 'rgba(236, 112, 99, 0.22)' : 'rgba(139, 169, 190, 0.12)'}
              key={element.id}
              points={points}
              stroke={isHighlighted ? '#ec705f' : 'rgba(170, 199, 219, 0.7)'}
              strokeWidth={isHighlighted ? 1.8 : 1}
            />
          )
        }

        return (
          <polyline
            fill="none"
            key={element.id}
            points={points}
            stroke={isHighlighted ? '#ec705f' : 'rgba(170, 199, 219, 0.74)'}
            strokeWidth={isHighlighted ? 1.8 : 1}
          />
        )
      })}

      {document.elements
        .filter((element) => highlightedSet.has(element.id))
        .map((element) => (
          <rect
            fill="none"
            height={element.bounds.height + 6}
            key={`box-${element.id}`}
            stroke="#ff9e80"
            strokeDasharray="2 2"
            strokeWidth={1.1}
            width={element.bounds.width + 6}
            x={element.bounds.x - 3}
            y={element.bounds.y - 3}
          />
        ))}

      {selectedPoints.map((point, index) => (
        <g key={`point-${index}`}>
          <circle cx={point.x} cy={point.y} fill="#f5d28c" r={2.3} />
          <circle
            cx={point.x}
            cy={point.y}
            fill="none"
            r={3.8}
            stroke="rgba(245, 210, 140, 0.72)"
            strokeWidth={0.8}
          />
        </g>
      ))}
    </svg>
  )
}

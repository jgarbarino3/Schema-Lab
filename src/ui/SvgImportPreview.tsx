import { useMemo } from 'react'
import type { MouseEvent } from 'react'
import type { BoundsMm, Vector2Mm } from '../domain/types'
import type { ImportPreviewDocument } from '../domain/svgImport'

interface SvgImportPreviewSurfaceOverlay {
  bounds: BoundsMm
  id: string
  kind: 'breadboard' | 'table'
  label: string
}

interface SvgImportPreviewFocusOverlay {
  bounds?: BoundsMm
  center?: Vector2Mm
  label?: string
}

interface SvgImportPreviewProps {
  className?: string
  document: ImportPreviewDocument
  focusOverlay?: SvgImportPreviewFocusOverlay
  highlightedElementIds?: string[]
  onSelectPoint?: (point: Vector2Mm) => void
  selectedPoints?: Vector2Mm[]
  surfaceOverlays?: SvgImportPreviewSurfaceOverlay[]
}

function formatPoints(points: Vector2Mm[]) {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

export function SvgImportPreview(props: SvgImportPreviewProps) {
  const {
    className,
    document,
    focusOverlay,
    highlightedElementIds = [],
    onSelectPoint,
    selectedPoints = [],
    surfaceOverlays = [],
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
      {document.sourceKind === 'raster' ? (
        <image
          height={document.bounds.height}
          href={document.imageDataUrl}
          preserveAspectRatio="xMidYMid meet"
          width={document.bounds.width}
          x={document.bounds.x}
          y={document.bounds.y}
        />
      ) : (
        document.elements.map((element) => {
          const isHighlighted = highlightedSet.has(element.id)

          return (
            <g key={element.id}>
              {element.polylines.map((polyline, index) =>
                element.isClosed ? (
                  <polygon
                    fill={isHighlighted ? 'rgba(236, 112, 99, 0.22)' : 'rgba(139, 169, 190, 0.12)'}
                    key={`${element.id}-${index}`}
                    points={formatPoints(polyline)}
                    stroke={isHighlighted ? '#ec705f' : 'rgba(170, 199, 219, 0.7)'}
                    strokeWidth={isHighlighted ? 1.8 : 1}
                  />
                ) : (
                  <polyline
                    fill="none"
                    key={`${element.id}-${index}`}
                    points={formatPoints(polyline)}
                    stroke={isHighlighted ? '#ec705f' : 'rgba(170, 199, 219, 0.74)'}
                    strokeWidth={isHighlighted ? 1.8 : 1}
                  />
                ),
              )}
            </g>
          )
        })
      )}

      {surfaceOverlays.map((overlay) => (
        <g key={overlay.id}>
          <rect
            fill={overlay.kind === 'table' ? 'rgba(59, 130, 246, 0.08)' : 'rgba(34, 197, 94, 0.08)'}
            height={overlay.bounds.height}
            stroke={overlay.kind === 'table' ? '#5aa7ff' : '#6edf93'}
            strokeDasharray="4 3"
            strokeWidth={1.25}
            width={overlay.bounds.width}
            x={overlay.bounds.x}
            y={overlay.bounds.y}
          />
          <text
            fill={overlay.kind === 'table' ? '#cbe3ff' : '#d6ffe4'}
            fontSize="5"
            x={overlay.bounds.x + 3}
            y={overlay.bounds.y + 7}
          >
            {overlay.label}
          </text>
        </g>
      ))}

      {document.sourceKind === 'svg'
        ? document.elements
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
            ))
        : null}

      {focusOverlay?.bounds ? (
        <rect
          fill="rgba(245, 210, 140, 0.08)"
          height={focusOverlay.bounds.height}
          stroke="#f5d28c"
          strokeDasharray="3 2"
          strokeWidth={1.2}
          width={focusOverlay.bounds.width}
          x={focusOverlay.bounds.x}
          y={focusOverlay.bounds.y}
        />
      ) : null}
      {focusOverlay?.center ? (
        <g>
          <circle cx={focusOverlay.center.x} cy={focusOverlay.center.y} fill="#f5d28c" r={2.2} />
          <circle
            cx={focusOverlay.center.x}
            cy={focusOverlay.center.y}
            fill="none"
            r={4.2}
            stroke="rgba(245, 210, 140, 0.72)"
            strokeWidth={0.9}
          />
          {focusOverlay.label ? (
            <text fill="#f5d28c" fontSize="5" x={focusOverlay.center.x + 4} y={focusOverlay.center.y - 5}>
              {focusOverlay.label}
            </text>
          ) : null}
        </g>
      ) : null}

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

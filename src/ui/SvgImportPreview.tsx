import { useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import type { BoundsMm, Vector2Mm } from '../domain/types'
import type { ImportPreviewDocument, ImportPreviewItem } from '../domain/svgImport'

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
  onSelectPreviewItem?: (itemId: string) => void
  onSelectPoint?: (point: Vector2Mm) => void
  onUpdatePreviewItem?: (itemId: string, center: Vector2Mm, bounds: BoundsMm) => void
  previewItems?: ImportPreviewItem[]
  selectedPreviewItemId?: string
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
    onSelectPreviewItem,
    onSelectPoint,
    onUpdatePreviewItem,
    previewItems = [],
    selectedPreviewItemId,
    selectedPoints = [],
    surfaceOverlays = [],
  } = props
  const svgRef = useRef<SVGSVGElement | null>(null)
  const highlightedSet = useMemo(
    () => new Set(highlightedElementIds),
    [highlightedElementIds],
  )
  const [dragState, setDragState] = useState<{
    bounds: BoundsMm
    center: Vector2Mm
    id: string
    pointerStart: Vector2Mm
  } | null>(null)

  const mapClientPointToViewBox = (clientX: number, clientY: number): Vector2Mm | undefined => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return undefined
    }

    const xRatio = (clientX - rect.left) / rect.width
    const yRatio = (clientY - rect.top) / rect.height

    return {
      x: document.bounds.x + xRatio * document.bounds.width,
      y: document.bounds.y + yRatio * document.bounds.height,
    }
  }

  const handleClick = (event: MouseEvent<SVGSVGElement>) => {
    if (!onSelectPoint) {
      return
    }

    const point = mapClientPointToViewBox(event.clientX, event.clientY)
    if (!point) {
      return
    }

    onSelectPoint(point)
  }

  const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    if (!dragState || !onUpdatePreviewItem) {
      return
    }

    const point = mapClientPointToViewBox(event.clientX, event.clientY)
    if (!point) {
      return
    }

    const deltaX = point.x - dragState.pointerStart.x
    const deltaY = point.y - dragState.pointerStart.y
    const nextCenter = {
      x: dragState.center.x + deltaX,
      y: dragState.center.y + deltaY,
    }
    const nextBounds = {
      ...dragState.bounds,
      x: dragState.bounds.x + deltaX,
      y: dragState.bounds.y + deltaY,
    }

    onUpdatePreviewItem(dragState.id, nextCenter, nextBounds)
  }

  const clearDragState = () => {
    setDragState(null)
  }

  return (
    <svg
      className={className}
      onClick={handleClick}
      onMouseLeave={clearDragState}
      onMouseMove={handleMouseMove}
      onMouseUp={clearDragState}
      ref={svgRef}
      viewBox={`${document.bounds.x} ${document.bounds.y} ${document.bounds.width} ${document.bounds.height}`}
    >
      <rect
        fill="rgba(6, 9, 12, 0.42)"
        height={document.bounds.height}
        pointerEvents="none"
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
          pointerEvents="none"
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
        <g key={overlay.id} pointerEvents="none">
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

      {previewItems.map((item) => {
        const isSelected = item.id === selectedPreviewItemId
        const isImported = item.disposition === 'component'
        const isLinework = item.disposition === 'linework'
        const stroke = isSelected
          ? '#f5d28c'
          : isImported
            ? item.isStrongMatch
              ? '#6edf93'
              : '#8fd6ff'
            : isLinework
              ? '#f5d28c'
              : 'rgba(203, 220, 236, 0.68)'
        const fill = isSelected
          ? 'rgba(245, 210, 140, 0.14)'
          : isImported
            ? item.isStrongMatch
              ? 'rgba(110, 223, 147, 0.12)'
              : 'rgba(143, 214, 255, 0.12)'
            : isLinework
              ? 'rgba(245, 210, 140, 0.08)'
              : 'rgba(203, 220, 236, 0.05)'

        return (
          <g key={item.id}>
            <rect
              data-testid={`import-preview-item-${item.id}`}
              fill={fill}
              height={item.bounds.height}
              onMouseDown={(event) => {
                event.stopPropagation()
                onSelectPreviewItem?.(item.id)

                if (!item.editability.canMove || !onUpdatePreviewItem) {
                  return
                }

                const point = mapClientPointToViewBox(event.clientX, event.clientY)
                if (!point) {
                  return
                }

                setDragState({
                  bounds: item.bounds,
                  center: item.center,
                  id: item.id,
                  pointerStart: point,
                })
              }}
              onClick={(event) => {
                event.stopPropagation()
                onSelectPreviewItem?.(item.id)
              }}
              rx={4}
              stroke={stroke}
              strokeDasharray={isImported ? undefined : '4 3'}
              strokeWidth={isSelected ? 1.8 : 1.1}
              style={{ cursor: item.editability.canMove ? 'move' : 'pointer' }}
              width={item.bounds.width}
              x={item.bounds.x}
              y={item.bounds.y}
            />
            <circle cx={item.center.x} cy={item.center.y} fill={stroke} pointerEvents="none" r={1.6} />
            <text
              fill={stroke}
              fontSize="4.5"
              pointerEvents="none"
              x={item.bounds.x}
              y={item.bounds.y - 3}
            >
              {item.label}
            </text>
          </g>
        )
      })}

      {focusOverlay?.bounds ? (
        <rect
          fill="rgba(245, 210, 140, 0.08)"
          height={focusOverlay.bounds.height}
          pointerEvents="none"
          stroke="#f5d28c"
          strokeDasharray="3 2"
          strokeWidth={1.2}
          width={focusOverlay.bounds.width}
          x={focusOverlay.bounds.x}
          y={focusOverlay.bounds.y}
        />
      ) : null}
      {focusOverlay?.center ? (
        <g pointerEvents="none">
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

import { Circle, Group, Layer, Rect, Text } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import {
  getBreadboardHoleAxesMm,
  getBreadboardHoleCounts,
  getCounterboreCentersMm,
  getEffectiveHolePitchMm,
} from '../domain/breadboard'
import { worldToScreen } from '../domain/geometry'
import type {
  BreadboardModel,
  QuarterTurn,
  ScreenPointPx,
  Vector2Mm,
  ViewportState,
} from '../domain/types'
import { quarterTurnsToDegrees } from '../domain/geometry'

interface BreadboardLayerProps {
  anchorMm?: Vector2Mm
  breadboard: BreadboardModel
  draggable?: boolean
  isFocused?: boolean
  isSelected: boolean
  onDragEnd?: (screenPointPx: ScreenPointPx) => void
  onDragMove?: (screenPointPx: ScreenPointPx) => void
  onDragStart?: () => void
  onSelect: (event: KonvaEventObject<MouseEvent | TouchEvent>) => void
  opacity?: number
  palette?: {
    boardFill: string
    boardStroke: string
    holeFill: string
    labelColor: string
  }
  renderInLayer?: boolean
  rotationQuarterTurns?: QuarterTurn
  showSourceLanes?: boolean
  showLabels?: boolean
  viewport: ViewportState
}

export function BreadboardLayer({
  anchorMm = { x: 0, y: 0 },
  breadboard,
  draggable = false,
  isFocused = false,
  isSelected,
  onDragEnd,
  onDragMove,
  onDragStart,
  onSelect,
  opacity = 1,
  palette,
  renderInLayer = true,
  rotationQuarterTurns = 0,
  showSourceLanes: _showSourceLanes = true,
  showLabels = true,
  viewport,
}: BreadboardLayerProps) {
  const boardOriginPx = worldToScreen(anchorMm, viewport)
  const holeAxes = getBreadboardHoleAxesMm(breadboard)
  const holeCounts = getBreadboardHoleCounts(breadboard)
  const effectivePitchMm = getEffectiveHolePitchMm(breadboard)
  const counterboreCentersMm = getCounterboreCentersMm(breadboard)
  const boardFill =
    palette?.boardFill ??
    (breadboard.finish === 'black-anodized' ? '#171d22' : '#c9d1d8')
  const boardStroke =
    palette?.boardStroke ??
    (breadboard.finish === 'black-anodized' ? '#5a6974' : '#7e8b95')
  const holeFill =
    palette?.holeFill ??
    (breadboard.finish === 'black-anodized' ? '#0c1014' : '#64717a')
  const labelColor =
    palette?.labelColor ??
    (breadboard.finish === 'black-anodized' ? '#d5e2ec' : '#16202a')
  const boardLabelText = `${breadboard.label}  •  ${breadboard.widthMm.toFixed(0)} × ${breadboard.heightMm.toFixed(0)} mm  •  ${holeCounts.xCount} × ${holeCounts.yCount} holes  •  ${effectivePitchMm.toFixed(1)} mm pitch`
  const boardAccentStroke = isSelected
    ? '#a9e8ff'
    : isFocused
      ? '#62c8eb'
      : boardStroke

  const content = (
    <Group
      draggable={draggable}
      dragDistance={2}
      name="breadboard-hit"
      listening
      onClick={(event) => {
        event.cancelBubble = true
        onSelect(event)
      }}
      onDragEnd={(event) => {
        if (!onDragEnd) {
          return
        }

        event.cancelBubble = true
        onDragEnd({ x: event.target.x(), y: event.target.y() })
      }}
      onDragMove={(event) => {
        if (!onDragMove) {
          return
        }

        event.cancelBubble = true
        onDragMove({ x: event.target.x(), y: event.target.y() })
      }}
      onDragStart={(event) => {
        if (!onDragStart) {
          return
        }

        event.cancelBubble = true
        onDragStart()
      }}
      onMouseDown={(event) => {
        if (draggable) {
          event.cancelBubble = true
        }
      }}
      onTap={(event) => {
        event.cancelBubble = true
        onSelect(event)
      }}
      opacity={opacity}
      scaleX={viewport.zoomPxPerMm}
      scaleY={viewport.zoomPxPerMm}
      rotation={quarterTurnsToDegrees(rotationQuarterTurns)}
      x={boardOriginPx.x}
      y={boardOriginPx.y}
    >
      {palette?.boardFill || breadboard.finish === 'black-anodized' ? (
        <Rect
          cornerRadius={4}
          fill={boardFill}
          height={breadboard.heightMm}
          name="breadboard-hit"
          shadowBlur={isSelected ? 14 : isFocused ? 10 : 6}
          shadowColor={isSelected || isFocused ? boardAccentStroke : '#000000'}
          shadowOpacity={isSelected ? 0.28 : isFocused ? 0.2 : 0.22}
          stroke={boardAccentStroke}
          strokeWidth={isSelected ? 1.7 : isFocused ? 1.2 : 0.8}
          width={breadboard.widthMm}
        />
      ) : (
        <Rect
          cornerRadius={4}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: breadboard.widthMm, y: 0 }}
          fillLinearGradientColorStops={[0, '#b8c2ca', 0.4, '#d0d8de', 0.7, '#c4cdd4', 1, '#bbc5cc']}
          height={breadboard.heightMm}
          name="breadboard-hit"
          shadowBlur={isSelected ? 14 : isFocused ? 10 : 6}
          shadowColor={isSelected || isFocused ? boardAccentStroke : '#000000'}
          shadowOpacity={isSelected ? 0.28 : isFocused ? 0.2 : 0.22}
          stroke={boardAccentStroke}
          strokeWidth={isSelected ? 1.7 : isFocused ? 1.2 : 0.8}
          width={breadboard.widthMm}
        />
      )}

      {counterboreCentersMm.map((counterbore, index) => (
        <Group
          key={`${counterbore.x}-${counterbore.y}-${index}`}
          listening={false}
        >
          <Circle
            fill="#2c343b"
            radius={6.2}
            shadowBlur={2}
            shadowColor="rgba(255,255,255,0.08)"
            stroke="#56616b"
            strokeWidth={0.6}
            x={counterbore.x}
            y={counterbore.y}
          />
          <Circle
            fill={holeFill}
            radius={2.1}
            x={counterbore.x}
            y={counterbore.y}
          />
        </Group>
      ))}

      {holeAxes.xPositionsMm.map((xPositionMm) =>
        holeAxes.yPositionsMm.map((yPositionMm) => (
          <Circle
            fill={holeFill}
            key={`${xPositionMm}-${yPositionMm}`}
            listening={false}
            radius={1.5}
            x={xPositionMm}
            y={yPositionMm}
          />
        )),
      )}

      {showLabels ? (
        <Text
          fill={labelColor}
          fontFamily="IBM Plex Sans, Avenir Next, Segoe UI, sans-serif"
          fontSize={6.4}
          listening={false}
          text={boardLabelText}
          x={2}
          y={-10}
        />
      ) : null}
    </Group>
  )

  if (!renderInLayer) {
    return content
  }

  return <Layer>{content}</Layer>
}

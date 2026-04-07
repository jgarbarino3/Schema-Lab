import { Circle, Group, Layer, Rect, Text } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import {
  getBreadboardHoleAxesMm,
  getBreadboardHoleCounts,
  getCounterboreCentersMm,
  getEffectiveHolePitchMm,
} from '../domain/breadboard'
import { worldToScreen } from '../domain/geometry'
import { getSourceLaneBoundsMm, SOURCE_LANE_OFFSET_MM } from '../domain/placement'
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
  isSelected,
  onDragEnd,
  onDragMove,
  onDragStart,
  onSelect,
  opacity = 1,
  palette,
  renderInLayer = true,
  rotationQuarterTurns = 0,
  showSourceLanes = true,
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
  const sourceLanes = showSourceLanes
    ? [
    { key: 'left', label: 'Source Lane', ...getSourceLaneBoundsMm(breadboard, 'left') },
    { key: 'right', label: 'Source Lane', ...getSourceLaneBoundsMm(breadboard, 'right') },
    { key: 'top', label: 'Source Lane', ...getSourceLaneBoundsMm(breadboard, 'top') },
    { key: 'bottom', label: 'Source Lane', ...getSourceLaneBoundsMm(breadboard, 'bottom') },
      ]
    : []
  const boardLabelText = `${breadboard.label}  •  ${breadboard.widthMm.toFixed(0)} × ${breadboard.heightMm.toFixed(0)} mm  •  ${holeCounts.xCount} × ${holeCounts.yCount} holes  •  ${effectivePitchMm.toFixed(1)} mm pitch${
    showSourceLanes ? `  •  sources at ±${SOURCE_LANE_OFFSET_MM.toFixed(0)} mm` : ''
  }`

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
      <Rect
        cornerRadius={4}
        fill={boardFill}
        height={breadboard.heightMm}
        name="breadboard-hit"
        shadowBlur={6}
        shadowColor="#000000"
        shadowOpacity={0.22}
        stroke={isSelected ? '#7ccce6' : boardStroke}
        strokeWidth={isSelected ? 1.25 : 0.8}
        width={breadboard.widthMm}
      />

      {sourceLanes.map((lane) => (
        <Group key={lane.key} listening={false}>
          <Rect
            cornerRadius={6}
            dash={[5, 4]}
            fill="rgba(56, 83, 97, 0.1)"
            height={lane.height}
            stroke="rgba(122, 193, 220, 0.28)"
            strokeWidth={0.8}
            width={lane.width}
            x={lane.x}
            y={lane.y}
          />
          {showLabels ? (
            lane.key === 'left' || lane.key === 'right' ? (
              <Text
                fill="rgba(165, 199, 214, 0.7)"
                fontFamily="IBM Plex Mono, SFMono-Regular, monospace"
                fontSize={6.5}
                rotation={-90}
                text={lane.label}
                x={lane.x + lane.width / 2 - 2}
                y={lane.y + lane.height / 2 + 18}
              />
            ) : (
              <Text
                fill="rgba(165, 199, 214, 0.7)"
                fontFamily="IBM Plex Mono, SFMono-Regular, monospace"
                fontSize={6.5}
                text={lane.label}
                x={lane.x + 6}
                y={lane.y + lane.height / 2 - 4}
              />
            )
          ) : null}
        </Group>
      ))}

      {counterboreCentersMm.map((counterbore, index) => (
        <Group
          key={`${counterbore.x}-${counterbore.y}-${index}`}
          listening={false}
        >
          <Circle
            fill="#2c343b"
            radius={6.2}
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

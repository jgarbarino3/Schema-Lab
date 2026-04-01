import { Circle, Group, Layer, Rect, Text } from 'react-konva'
import {
  getBreadboardHoleAxesMm,
  getBreadboardHoleCounts,
  getCounterboreCentersMm,
  getEffectiveHolePitchMm,
} from '../domain/breadboard'
import { worldToScreen } from '../domain/geometry'
import type { BreadboardModel, ViewportState } from '../domain/types'

interface BreadboardLayerProps {
  breadboard: BreadboardModel
  isSelected: boolean
  onSelect: () => void
  viewport: ViewportState
}

export function BreadboardLayer({
  breadboard,
  isSelected,
  onSelect,
  viewport,
}: BreadboardLayerProps) {
  const boardOriginPx = worldToScreen({ x: 0, y: 0 }, viewport)
  const holeAxes = getBreadboardHoleAxesMm(breadboard)
  const holeCounts = getBreadboardHoleCounts(breadboard)
  const effectivePitchMm = getEffectiveHolePitchMm(breadboard)
  const counterboreCentersMm = getCounterboreCentersMm(breadboard)
  const boardFill =
    breadboard.finish === 'black-anodized' ? '#171d22' : '#c9d1d8'
  const boardStroke =
    breadboard.finish === 'black-anodized' ? '#5a6974' : '#7e8b95'
  const holeFill =
    breadboard.finish === 'black-anodized' ? '#0c1014' : '#64717a'
  const labelColor =
    breadboard.finish === 'black-anodized' ? '#d5e2ec' : '#16202a'

  return (
    <Layer>
      <Group
        listening
        onClick={(event) => {
          event.cancelBubble = true
          onSelect()
        }}
        onTap={(event) => {
          event.cancelBubble = true
          onSelect()
        }}
        scaleX={viewport.zoomPxPerMm}
        scaleY={viewport.zoomPxPerMm}
        x={boardOriginPx.x}
        y={boardOriginPx.y}
      >
        <Rect
          cornerRadius={4}
          fill={boardFill}
          height={breadboard.heightMm}
          shadowBlur={6}
          shadowColor="#000000"
          shadowOpacity={0.22}
          stroke={isSelected ? '#7ccce6' : boardStroke}
          strokeWidth={isSelected ? 1.25 : 0.8}
          width={breadboard.widthMm}
        />

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

        <Text
          fill={labelColor}
          fontFamily="IBM Plex Sans, Avenir Next, Segoe UI, sans-serif"
          fontSize={7}
          listening={false}
          text={`${breadboard.label}  •  ${holeCounts.xCount} × ${holeCounts.yCount} holes  •  ${effectivePitchMm.toFixed(1)} mm pitch`}
          x={8}
          y={8}
        />
      </Group>
    </Layer>
  )
}

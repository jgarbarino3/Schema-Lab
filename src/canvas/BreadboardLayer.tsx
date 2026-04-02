import { Circle, Group, Layer, Rect, Text } from 'react-konva'
import {
  getBreadboardHoleAxesMm,
  getBreadboardHoleCounts,
  getCounterboreCentersMm,
  getEffectiveHolePitchMm,
} from '../domain/breadboard'
import { worldToScreen } from '../domain/geometry'
import { getSourceLaneBoundsMm, SOURCE_LANE_OFFSET_MM } from '../domain/placement'
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
  const sourceLanes = [
    { key: 'left', label: 'Source Lane', ...getSourceLaneBoundsMm(breadboard, 'left') },
    { key: 'right', label: 'Source Lane', ...getSourceLaneBoundsMm(breadboard, 'right') },
    { key: 'top', label: 'Source Lane', ...getSourceLaneBoundsMm(breadboard, 'top') },
    { key: 'bottom', label: 'Source Lane', ...getSourceLaneBoundsMm(breadboard, 'bottom') },
  ]

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
            {lane.key === 'left' || lane.key === 'right' ? (
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
            )}
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

        <Text
          fill={labelColor}
          fontFamily="IBM Plex Sans, Avenir Next, Segoe UI, sans-serif"
          fontSize={7}
          listening={false}
          text={`${breadboard.label}  •  ${breadboard.widthMm.toFixed(0)} × ${breadboard.heightMm.toFixed(0)} mm  •  ${holeCounts.xCount} × ${holeCounts.yCount} holes  •  ${effectivePitchMm.toFixed(1)} mm pitch  •  sources at ±${SOURCE_LANE_OFFSET_MM.toFixed(0)} mm`}
          x={8}
          y={8}
        />
      </Group>
    </Layer>
  )
}

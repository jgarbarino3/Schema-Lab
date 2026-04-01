import { Circle, Group, Line, Rect, Text } from 'react-konva'
import { getComponentDefinition } from '../domain/componentCatalog'
import { quarterTurnsToDegrees, worldToScreen } from '../domain/geometry'
import type {
  BoundsMm,
  ComponentFootprintShape,
  ComponentInstance,
  ScreenPointPx,
  ViewportState,
} from '../domain/types'
import { ComponentGlyph } from './ComponentGlyph'

interface ComponentNodeProps {
  instance: ComponentInstance
  isSelected: boolean
  onMove: (
    componentId: string,
    screenPointPx: ScreenPointPx,
    phase: 'drag' | 'drop',
  ) => void
  onSelect: (componentId: string) => void
  viewport: ViewportState
}

function renderFootprintShape(
  shape: ComponentFootprintShape,
  boundsMm: BoundsMm,
  fill: string,
  stroke: string,
  isSelected: boolean,
) {
  const strokeWidth = isSelected ? 1.2 : 0.8

  switch (shape) {
    case 'circle':
      return (
        <Circle
          fill={fill}
          radius={Math.min(boundsMm.width, boundsMm.height) / 2}
          stroke={stroke}
          strokeWidth={strokeWidth}
          x={boundsMm.x + boundsMm.width / 2}
          y={boundsMm.y + boundsMm.height / 2}
        />
      )
    case 'diamond':
      return (
        <Line
          closed
          fill={fill}
          lineJoin="round"
          points={[
            boundsMm.x + boundsMm.width / 2,
            boundsMm.y,
            boundsMm.x + boundsMm.width,
            boundsMm.y + boundsMm.height / 2,
            boundsMm.x + boundsMm.width / 2,
            boundsMm.y + boundsMm.height,
            boundsMm.x,
            boundsMm.y + boundsMm.height / 2,
          ]}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )
    case 'capsule':
      return (
        <Rect
          cornerRadius={Math.min(boundsMm.width, boundsMm.height) / 2}
          fill={fill}
          height={boundsMm.height}
          stroke={stroke}
          strokeWidth={strokeWidth}
          width={boundsMm.width}
          x={boundsMm.x}
          y={boundsMm.y}
        />
      )
    case 'rect':
      return (
        <Rect
          cornerRadius={2}
          fill={fill}
          height={boundsMm.height}
          stroke={stroke}
          strokeWidth={strokeWidth}
          width={boundsMm.width}
          x={boundsMm.x}
          y={boundsMm.y}
        />
      )
  }
}

export function ComponentNode({
  instance,
  isSelected,
  onMove,
  onSelect,
  viewport,
}: ComponentNodeProps) {
  const definition = getComponentDefinition(instance.type)
  const screenAnchorPx = worldToScreen(instance.anchorMm, viewport)
  const boundsMm = definition.footprintBoundsMm

  return (
    <Group
      draggable
      onClick={(event) => {
        event.cancelBubble = true
        onSelect(instance.id)
      }}
      onDragEnd={(event) => {
        event.cancelBubble = true
        onMove(
          instance.id,
          { x: event.target.x(), y: event.target.y() },
          'drop',
        )
      }}
      onDragMove={(event) => {
        event.cancelBubble = true
        onMove(
          instance.id,
          { x: event.target.x(), y: event.target.y() },
          'drag',
        )
      }}
      onDragStart={(event) => {
        event.cancelBubble = true
        onSelect(instance.id)
      }}
      onTap={(event) => {
        event.cancelBubble = true
        onSelect(instance.id)
      }}
      rotation={quarterTurnsToDegrees(instance.rotationQuarterTurns)}
      scaleX={viewport.zoomPxPerMm}
      scaleY={viewport.zoomPxPerMm}
      x={screenAnchorPx.x}
      y={screenAnchorPx.y}
    >
      {renderFootprintShape(
        definition.renderHint.shape,
        boundsMm,
        definition.renderHint.fill,
        isSelected ? '#d8eef5' : definition.renderHint.stroke,
        isSelected,
      )}

      <ComponentGlyph
        boundsMm={boundsMm}
        glyph={definition.renderHint.glyph}
        stroke={isSelected ? '#f0fafc' : definition.renderHint.stroke}
      />

      {definition.opticalCenterMm ? (
        <>
          <Line
            points={[
              definition.opticalCenterMm.x - 3,
              definition.opticalCenterMm.y,
              definition.opticalCenterMm.x + 3,
              definition.opticalCenterMm.y,
            ]}
            stroke="#ffffff"
            strokeWidth={0.5}
          />
          <Line
            points={[
              definition.opticalCenterMm.x,
              definition.opticalCenterMm.y - 3,
              definition.opticalCenterMm.x,
              definition.opticalCenterMm.y + 3,
            ]}
            stroke="#ffffff"
            strokeWidth={0.5}
          />
        </>
      ) : null}

      {isSelected
        ? definition.ports.map((port) => (
            <Circle
              fill="#fbf2a5"
              key={port.id}
              radius={2}
              stroke="#11161b"
              strokeWidth={0.5}
              x={port.positionMm.x}
              y={port.positionMm.y}
            />
          ))
        : null}

      <Text
        align="center"
        fill="#e6edf2"
        fontFamily="IBM Plex Sans, Avenir Next, Segoe UI, sans-serif"
        fontSize={6.5}
        listening={false}
        text={instance.label}
        width={Math.max(boundsMm.width, 34)}
        x={-Math.max(boundsMm.width, 34) / 2}
        y={boundsMm.y + boundsMm.height + 4}
      />
    </Group>
  )
}

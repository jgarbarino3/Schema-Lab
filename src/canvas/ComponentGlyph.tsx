import { Circle, Line, Rect } from 'react-konva'
import type { BoundsMm, ComponentGlyph as ComponentGlyphType } from '../domain/types'

interface ComponentGlyphProps {
  boundsMm: BoundsMm
  glyph: ComponentGlyphType
  stroke: string
}

export function ComponentGlyph({
  boundsMm,
  glyph,
  stroke,
}: ComponentGlyphProps) {
  const centerX = boundsMm.x + boundsMm.width / 2
  const centerY = boundsMm.y + boundsMm.height / 2
  const inset = 4

  switch (glyph) {
    case 'laser':
      return (
        <>
          <Line
            points={[
              boundsMm.x + inset,
              centerY,
              boundsMm.x + boundsMm.width - inset - 3,
              centerY,
            ]}
            stroke={stroke}
            strokeWidth={1.1}
          />
          <Line
            lineCap="round"
            lineJoin="round"
            points={[
              boundsMm.x + boundsMm.width - inset - 6,
              centerY - 3,
              boundsMm.x + boundsMm.width - inset,
              centerY,
              boundsMm.x + boundsMm.width - inset - 6,
              centerY + 3,
            ]}
            stroke={stroke}
            strokeWidth={1.1}
          />
          <Circle
            radius={2}
            stroke={stroke}
            strokeWidth={0.9}
            x={boundsMm.x + inset + 2}
            y={centerY}
          />
        </>
      )
    case 'mount':
      return (
        <>
          <Circle
            radius={Math.min(boundsMm.width, boundsMm.height) / 3.4}
            stroke={stroke}
            strokeWidth={1}
            x={centerX}
            y={centerY}
          />
          <Line
            points={[centerX - 7, centerY, centerX + 7, centerY]}
            stroke={stroke}
            strokeWidth={0.9}
          />
          <Line
            points={[centerX, centerY - 7, centerX, centerY + 7]}
            stroke={stroke}
            strokeWidth={0.9}
          />
        </>
      )
    case 'support':
      return (
        <>
          <Rect
            height={9}
            stroke={stroke}
            strokeWidth={1}
            width={14}
            x={centerX - 7}
            y={centerY - 4.5}
          />
          <Line
            points={[centerX, centerY - 8, centerX, centerY + 8]}
            stroke={stroke}
            strokeWidth={0.9}
          />
        </>
      )
    case 'mirror':
      return (
        <Line
          lineCap="round"
          points={[
            boundsMm.x + boundsMm.width - inset,
            boundsMm.y + inset,
            boundsMm.x + inset,
            boundsMm.y + boundsMm.height - inset,
          ]}
          stroke={stroke}
          strokeWidth={1.3}
        />
      )
    case 'beamsplitter':
      return (
        <>
          <Line
            dash={[2, 2]}
            points={[
              boundsMm.x + inset,
              boundsMm.y + boundsMm.height - inset,
              boundsMm.x + boundsMm.width - inset,
              boundsMm.y + inset,
            ]}
            stroke={stroke}
            strokeWidth={1.1}
          />
          <Line
            opacity={0.7}
            points={[
              centerX,
              boundsMm.y + inset,
              centerX,
              boundsMm.y + boundsMm.height - inset,
            ]}
            stroke={stroke}
            strokeWidth={0.8}
          />
        </>
      )
    case 'lens':
      return (
        <>
          <Line
            bezier
            points={[
              centerX - 7,
              boundsMm.y + inset,
              centerX - 2,
              centerY,
              centerX - 7,
              boundsMm.y + boundsMm.height - inset,
            ]}
            stroke={stroke}
            strokeWidth={1}
          />
          <Line
            bezier
            points={[
              centerX + 7,
              boundsMm.y + inset,
              centerX + 2,
              centerY,
              centerX + 7,
              boundsMm.y + boundsMm.height - inset,
            ]}
            stroke={stroke}
            strokeWidth={1}
          />
        </>
      )
    case 'filter':
      return (
        <>
          <Line
            points={[centerX - 8, centerY + 8, centerX + 8, centerY - 8]}
            stroke={stroke}
            strokeWidth={1.1}
          />
          <Rect
            height={12}
            stroke={stroke}
            strokeWidth={0.8}
            width={12}
            x={centerX - 6}
            y={centerY - 6}
          />
        </>
      )
    case 'iris':
      return (
        <>
          <Circle
            radius={Math.min(boundsMm.width, boundsMm.height) / 4}
            stroke={stroke}
            strokeWidth={1}
            x={centerX}
            y={centerY}
          />
          <Line
            points={[centerX - 5, centerY, centerX + 5, centerY]}
            stroke={stroke}
            strokeWidth={0.9}
          />
          <Line
            points={[centerX, centerY - 5, centerX, centerY + 5]}
            stroke={stroke}
            strokeWidth={0.9}
          />
        </>
      )
    case 'bbo':
      return (
        <>
          <Line
            closed
            fillEnabled={false}
            lineJoin="round"
            points={[
              centerX - 8,
              centerY,
              centerX,
              centerY - 7,
              centerX + 8,
              centerY,
              centerX,
              centerY + 7,
            ]}
            stroke={stroke}
            strokeWidth={1}
          />
          <Line
            dash={[2, 2]}
            points={[centerX - 8, centerY, centerX + 8, centerY]}
            stroke={stroke}
            strokeWidth={0.8}
          />
        </>
      )
    case 'sample':
      return (
        <>
          <Rect
            height={14}
            stroke={stroke}
            strokeWidth={1}
            width={14}
            x={centerX - 7}
            y={centerY - 7}
          />
          <Line
            dash={[2, 2]}
            points={[
              boundsMm.x + inset,
              centerY,
              boundsMm.x + boundsMm.width - inset,
              centerY,
            ]}
            stroke={stroke}
            strokeWidth={0.8}
          />
        </>
      )
    case 'fiber':
      return (
        <>
          <Line
            lineCap="round"
            points={[
              boundsMm.x + inset,
              centerY,
              centerX + 4,
              centerY,
              boundsMm.x + boundsMm.width - inset,
              centerY - 4,
            ]}
            stroke={stroke}
            strokeWidth={1}
          />
          <Circle
            radius={2.5}
            stroke={stroke}
            strokeWidth={1}
            x={boundsMm.x + boundsMm.width - inset - 1}
            y={centerY - 4}
          />
        </>
      )
    case 'spectrometer':
      return (
        <Line
          lineCap="round"
          lineJoin="round"
          points={[
            boundsMm.x + inset,
            centerY + 6,
            centerX - 6,
            centerY - 2,
            centerX,
            centerY + 4,
            centerX + 7,
            centerY - 5,
            boundsMm.x + boundsMm.width - inset,
            centerY + 1,
          ]}
          stroke={stroke}
          strokeWidth={1}
        />
      )
    case 'detector':
      return (
        <Line
          closed
          fillEnabled={false}
          lineJoin="round"
          points={[
            centerX - 8,
            centerY - 8,
            centerX + 9,
            centerY,
            centerX - 8,
            centerY + 8,
          ]}
          stroke={stroke}
          strokeWidth={1}
        />
      )
    case 'beam-dump':
      return (
        <>
          <Line
            points={[centerX - 7, centerY - 7, centerX + 7, centerY + 7]}
            stroke={stroke}
            strokeWidth={1.2}
          />
          <Line
            points={[centerX + 7, centerY - 7, centerX - 7, centerY + 7]}
            stroke={stroke}
            strokeWidth={1.2}
          />
        </>
      )
  }
}

import { Circle, Ellipse, Line, Rect } from 'react-konva'
import type { BoundsMm, ComponentGlyph as ComponentGlyphType } from '../domain/types'

interface ComponentGlyphProps {
  boundsMm: BoundsMm
  fill?: string
  glyph: ComponentGlyphType
  stroke: string
}

export function ComponentGlyph({
  boundsMm,
  fill,
  glyph,
  stroke,
}: ComponentGlyphProps) {
  const centerX = boundsMm.x + boundsMm.width / 2
  const centerY = boundsMm.y + boundsMm.height / 2
  const inset = 2.5
  const width = boundsMm.width
  const height = boundsMm.height
  const opticRadius = Math.max(2.8, Math.min(width, height) * 0.26)

  switch (glyph) {
    case 'laser':
      return (
        <>
          <Line
            lineCap="round"
            points={[
              boundsMm.x + inset,
              centerY,
              boundsMm.x + width - inset - 4,
              centerY,
            ]}
            stroke={stroke}
            strokeWidth={1.25}
          />
          <Line
            lineCap="round"
            lineJoin="round"
            points={[
              boundsMm.x + width - inset - 7,
              centerY - 3,
              boundsMm.x + width - inset,
              centerY,
              boundsMm.x + width - inset - 7,
              centerY + 3,
            ]}
            stroke={stroke}
            strokeWidth={1.2}
          />
        </>
      )
    case 'mirror':
      return (
        <Line
          lineCap="round"
          points={[
            boundsMm.x + width - inset,
            boundsMm.y + inset,
            boundsMm.x + inset,
            boundsMm.y + height - inset,
          ]}
          stroke={stroke}
          strokeWidth={1.75}
        />
      )
    case 'beamsplitter':
      return (
        <>
          <Line
            dash={[2.2, 2.2]}
            lineCap="round"
            points={[
              boundsMm.x + inset,
              boundsMm.y + height - inset,
              boundsMm.x + width - inset,
              boundsMm.y + inset,
            ]}
            stroke={stroke}
            strokeWidth={1.35}
          />
          <Line
            opacity={0.7}
            points={[centerX, boundsMm.y + inset, centerX, boundsMm.y + height - inset]}
            stroke={stroke}
            strokeWidth={0.85}
          />
        </>
      )
    case 'lens':
      return (
        <Ellipse
          fill={fill ?? 'rgba(131, 198, 233, 0.28)'}
          radiusX={Math.max(2.2, width * 0.12)}
          radiusY={Math.max(5, height * 0.38)}
          stroke={stroke}
          strokeWidth={1}
          x={centerX}
          y={centerY}
        />
      )
    case 'filter':
      return (
        <>
          <Rect
            fill={fill ?? 'rgba(150, 201, 205, 0.12)'}
            height={Math.max(8, height * 0.5)}
            rotation={45}
            stroke={stroke}
            strokeWidth={0.9}
            width={Math.max(8, width * 0.5)}
            x={centerX - Math.max(8, width * 0.5) / 2}
            y={centerY - Math.max(8, width * 0.5) / 2}
          />
          <Line
            lineCap="round"
            points={[
              boundsMm.x + width * 0.25,
              boundsMm.y + height * 0.72,
              boundsMm.x + width * 0.72,
              boundsMm.y + height * 0.25,
            ]}
            stroke={stroke}
            strokeWidth={1.1}
          />
        </>
      )
    case 'iris':
      return (
        <Circle
          radius={opticRadius}
          stroke={stroke}
          strokeWidth={1.2}
          x={centerX}
          y={centerY}
        />
      )
    case 'bbo':
      return (
        <Line
          closed
          fill={fill ?? 'rgba(207, 192, 239, 0.12)'}
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
      )
    case 'sample':
      return (
        <Rect
          height={Math.max(12, height * 0.5)}
          stroke={stroke}
          strokeWidth={1}
          width={Math.max(18, width * 0.56)}
          x={centerX - Math.max(18, width * 0.56) / 2}
          y={centerY - Math.max(12, height * 0.5) / 2}
        />
      )
    case 'fiber':
      return (
        <>
          <Circle
            radius={Math.max(3, Math.min(width, height) * 0.18)}
            stroke={stroke}
            strokeWidth={1}
            x={centerX - 5}
            y={centerY}
          />
          <Line
            points={[centerX - 2, centerY, centerX + 8, centerY]}
            stroke={stroke}
            strokeWidth={1.2}
          />
        </>
      )
    case 'spectrometer':
      return (
        <>
          <Rect
            cornerRadius={2}
            fill={fill ?? 'rgba(188, 214, 223, 0.1)'}
            height={Math.max(14, height * 0.42)}
            stroke={stroke}
            strokeWidth={0.9}
            width={Math.max(18, width * 0.58)}
            x={centerX - Math.max(18, width * 0.58) / 2}
            y={centerY - Math.max(14, height * 0.42) / 2}
          />
          <Circle
            radius={2.4}
            stroke={stroke}
            strokeWidth={0.8}
            x={centerX - 4}
            y={centerY}
          />
          <Circle
            radius={2.4}
            stroke={stroke}
            strokeWidth={0.8}
            x={centerX + 4}
            y={centerY}
          />
        </>
      )
    case 'detector':
      return (
        <>
          <Circle
            radius={Math.max(4, Math.min(width, height) * 0.22)}
            stroke={stroke}
            strokeWidth={1}
            x={centerX}
            y={centerY}
          />
          <Line
            points={[centerX - 6, centerY + 7, centerX + 6, centerY + 7]}
            stroke={stroke}
            strokeWidth={1}
          />
        </>
      )
    case 'beam-dump':
      return (
        <>
          <Rect
            cornerRadius={2}
            fill={fill ?? 'rgba(80, 64, 52, 0.18)'}
            height={Math.max(12, height * 0.44)}
            stroke={stroke}
            strokeWidth={1}
            width={Math.max(12, width * 0.44)}
            x={centerX - Math.max(12, width * 0.44) / 2}
            y={centerY - Math.max(12, height * 0.44) / 2}
          />
          <Line
            points={[
              centerX - 5,
              centerY - 5,
              centerX + 5,
              centerY + 5,
              centerX,
              centerY,
              centerX + 5,
              centerY - 5,
              centerX - 5,
              centerY + 5,
            ]}
            stroke={stroke}
            strokeWidth={1}
          />
        </>
      )
    case 'mount':
      return (
        <>
          <Circle
            radius={Math.max(6, Math.min(width, height) * 0.28)}
            stroke={stroke}
            strokeWidth={1}
            x={centerX}
            y={centerY}
          />
          <Circle
            fill={fill ?? 'rgba(255, 255, 255, 0.08)'}
            radius={2.8}
            stroke={stroke}
            strokeWidth={0.8}
            x={centerX}
            y={centerY}
          />
        </>
      )
    case 'support':
      return (
        <Rect
          cornerRadius={2}
          fill={fill ?? 'rgba(255, 255, 255, 0.06)'}
          height={Math.max(10, height * 0.32)}
          stroke={stroke}
          strokeWidth={1}
          width={Math.max(14, width * 0.45)}
          x={centerX - Math.max(14, width * 0.45) / 2}
          y={centerY - Math.max(10, height * 0.32) / 2}
        />
      )
  }
}

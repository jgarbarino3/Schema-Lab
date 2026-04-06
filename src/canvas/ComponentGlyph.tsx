import { Circle, Ellipse, Line, Rect } from 'react-konva'
import type { BoundsMm, ComponentGlyph as ComponentGlyphType } from '../domain/types'

interface ComponentGlyphProps {
  boundsMm: BoundsMm
  fill?: string
  glyph: ComponentGlyphType
  isConvex?: boolean
  stroke: string
}

export function ComponentGlyph({
  boundsMm,
  fill,
  glyph,
  isConvex,
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
    case 'curved-mirror': {
      const sign = isConvex ? 1 : -1
      const maxBow = Math.min(width, height) * 0.2 * sign
      const x0 = boundsMm.x + width - inset
      const y0 = boundsMm.y + inset
      const x1 = boundsMm.x + inset
      const y1 = boundsMm.y + height - inset
      const steps = 10
      const pts: number[] = []
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const parabola = 4 * t * (1 - t)
        const bx = x0 + (x1 - x0) * t + maxBow * parabola
        const by = y0 + (y1 - y0) * t + maxBow * parabola
        pts.push(bx, by)
      }
      return (
        <Line
          lineCap="round"
          points={pts}
          stroke={stroke}
          strokeWidth={1.75}
          tension={0.4}
        />
      )
    }
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
    case 'attenuator':
      return (
        <>
          <Circle
            radius={opticRadius}
            stroke={stroke}
            strokeWidth={1.2}
            x={centerX}
            y={centerY}
          />
          <Line
            lineCap="round"
            points={[centerX - opticRadius, centerY, centerX + opticRadius, centerY]}
            stroke={stroke}
            strokeWidth={0.9}
          />
        </>
      )
    case 'polarizer':
      return (
        <>
          <Circle
            radius={opticRadius}
            stroke={stroke}
            strokeWidth={1.1}
            x={centerX}
            y={centerY}
          />
          <Line
            lineCap="round"
            points={[
              centerX - opticRadius * 0.9,
              centerY + opticRadius * 0.9,
              centerX + opticRadius * 0.9,
              centerY - opticRadius * 0.9,
            ]}
            stroke={stroke}
            strokeWidth={1.05}
          />
        </>
      )
    case 'waveplate':
      return (
        <>
          <Circle
            radius={opticRadius}
            stroke={stroke}
            strokeWidth={1.1}
            x={centerX}
            y={centerY}
          />
          <Line
            lineCap="round"
            points={[centerX - opticRadius * 0.8, centerY, centerX + opticRadius * 0.8, centerY]}
            stroke={stroke}
            strokeWidth={1}
          />
          <Line
            lineCap="round"
            points={[centerX, centerY - opticRadius * 0.8, centerX, centerY + opticRadius * 0.8]}
            stroke={stroke}
            strokeWidth={0.85}
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
    case 'telescope':
      return (
        <>
          <Ellipse
            radiusX={Math.max(2.2, width * 0.08)}
            radiusY={Math.max(5, height * 0.28)}
            stroke={stroke}
            strokeWidth={1}
            x={centerX - width * 0.18}
            y={centerY}
          />
          <Ellipse
            radiusX={Math.max(2.2, width * 0.08)}
            radiusY={Math.max(5, height * 0.28)}
            stroke={stroke}
            strokeWidth={1}
            x={centerX + width * 0.18}
            y={centerY}
          />
          <Line
            points={[centerX - width * 0.08, centerY, centerX + width * 0.08, centerY]}
            stroke={stroke}
            strokeWidth={0.9}
          />
        </>
      )
    case 'opa':
      return (
        <>
          <Rect
            cornerRadius={3}
            fill={fill ?? 'rgba(255, 255, 255, 0.08)'}
            height={Math.max(10, height * 0.42)}
            stroke={stroke}
            strokeWidth={0.9}
            width={Math.max(18, width * 0.5)}
            x={centerX - Math.max(18, width * 0.5) / 2}
            y={centerY - Math.max(10, height * 0.42) / 2}
          />
          <Line
            points={[boundsMm.x + inset, centerY, centerX - width * 0.25, centerY]}
            stroke={stroke}
            strokeWidth={1}
          />
          <Line
            points={[centerX + width * 0.25, centerY, boundsMm.x + width - inset, centerY]}
            stroke={stroke}
            strokeWidth={1}
          />
        </>
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

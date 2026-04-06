import { Arc, Circle, Ellipse, Line, Rect } from 'react-konva'
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
      const maxBow = Math.min(width, height) * 0.12 * sign
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
    case 'beamsplitter': {
      const bsSize = Math.max(6, Math.min(width, height) * 0.38)
      return (
        <>
          <Rect
            fill={fill ?? 'rgba(157, 210, 216, 0.1)'}
            height={bsSize}
            rotation={45}
            stroke={stroke}
            strokeWidth={1}
            width={bsSize}
            x={centerX}
            y={centerY - bsSize * 0.707}
          />
          <Line
            lineCap="round"
            points={[
              centerX - bsSize * 0.5,
              centerY + bsSize * 0.5,
              centerX + bsSize * 0.5,
              centerY - bsSize * 0.5,
            ]}
            stroke={stroke}
            strokeWidth={1.1}
          />
        </>
      )
    }
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
    case 'attenuator': {
      const wedgeH = Math.max(8, Math.min(width, height) * 0.48)
      const wedgeW = wedgeH * 0.6
      return (
        <Line
          closed
          fill={fill ?? 'rgba(237, 216, 155, 0.2)'}
          lineJoin="round"
          points={[
            centerX - wedgeW * 0.5,
            centerY + wedgeH * 0.5,
            centerX,
            centerY - wedgeH * 0.5,
            centerX + wedgeW * 0.5,
            centerY + wedgeH * 0.5,
          ]}
          stroke={stroke}
          strokeWidth={1.1}
        />
      )
    }
    case 'polarizer': {
      const pr = opticRadius
      const ax = 0.707
      return (
        <>
          <Circle
            radius={pr}
            stroke={stroke}
            strokeWidth={1.1}
            x={centerX}
            y={centerY}
          />
          <Line
            lineCap="round"
            points={[
              centerX - pr * ax,
              centerY + pr * ax,
              centerX + pr * ax,
              centerY - pr * ax,
            ]}
            stroke={stroke}
            strokeWidth={1.05}
          />
          <Line
            lineCap="round"
            lineJoin="round"
            points={[
              centerX + pr * ax - pr * 0.3,
              centerY - pr * ax - pr * 0.15,
              centerX + pr * ax,
              centerY - pr * ax,
              centerX + pr * ax + pr * 0.15,
              centerY - pr * ax + pr * 0.3,
            ]}
            stroke={stroke}
            strokeWidth={0.9}
          />
        </>
      )
    }
    case 'waveplate': {
      const wr = opticRadius
      const wax = 0.707
      const tickLen = wr * 0.35
      return (
        <>
          <Circle
            radius={wr}
            stroke={stroke}
            strokeWidth={1.1}
            x={centerX}
            y={centerY}
          />
          <Line
            lineCap="round"
            points={[
              centerX - wr * wax,
              centerY + wr * wax,
              centerX + wr * wax,
              centerY - wr * wax,
            ]}
            stroke={stroke}
            strokeWidth={1}
          />
          <Line
            lineCap="round"
            points={[
              centerX - tickLen * wax,
              centerY - tickLen * wax,
              centerX + tickLen * wax,
              centerY + tickLen * wax,
            ]}
            stroke={stroke}
            strokeWidth={0.9}
          />
        </>
      )
    }
    case 'iris': {
      const irisHalf = Math.max(5, Math.min(width, height) * 0.32)
      const irisGap = irisHalf * 0.35
      return (
        <>
          <Line
            lineCap="round"
            points={[centerX, centerY - irisHalf, centerX, centerY - irisGap]}
            stroke={stroke}
            strokeWidth={1.4}
          />
          <Line
            lineCap="round"
            points={[centerX, centerY + irisGap, centerX, centerY + irisHalf]}
            stroke={stroke}
            strokeWidth={1.4}
          />
          <Line
            lineCap="round"
            lineJoin="round"
            points={[
              centerX - irisGap * 0.9,
              centerY - irisGap * 1.5,
              centerX,
              centerY - irisGap,
              centerX + irisGap * 0.9,
              centerY - irisGap * 1.5,
            ]}
            stroke={stroke}
            strokeWidth={1}
          />
          <Line
            lineCap="round"
            lineJoin="round"
            points={[
              centerX - irisGap * 0.9,
              centerY + irisGap * 1.5,
              centerX,
              centerY + irisGap,
              centerX + irisGap * 0.9,
              centerY + irisGap * 1.5,
            ]}
            stroke={stroke}
            strokeWidth={1}
          />
        </>
      )
    }
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
    case 'detector': {
      const dr = Math.max(4.5, Math.min(width, height) * 0.26)
      return (
        <>
          <Arc
            angle={180}
            innerRadius={0}
            outerRadius={dr}
            rotation={-90}
            stroke={stroke}
            strokeWidth={1.1}
            x={centerX + dr * 0.15}
            y={centerY}
          />
          <Line
            lineCap="round"
            points={[
              centerX + dr * 0.15,
              centerY - dr,
              centerX + dr * 0.15,
              centerY + dr,
            ]}
            stroke={stroke}
            strokeWidth={1.1}
          />
        </>
      )
    }
    case 'beam-dump': {
      const bdW = Math.max(10, width * 0.4)
      const bdH = Math.max(10, height * 0.42)
      const bdX = centerX - bdW / 2
      const bdY = centerY - bdH / 2
      return (
        <>
          <Rect
            cornerRadius={1.5}
            fill={fill ?? 'rgba(80, 64, 52, 0.18)'}
            height={bdH}
            stroke={stroke}
            strokeWidth={1}
            width={bdW}
            x={bdX}
            y={bdY}
          />
          {[0.25, 0.5, 0.75].map((f) => (
            <Line
              key={f}
              lineCap="round"
              points={[
                bdX + bdW * f - bdH * 0.15,
                bdY,
                bdX + bdW * f + bdH * 0.15,
                bdY + bdH,
              ]}
              opacity={0.7}
              stroke={stroke}
              strokeWidth={0.7}
            />
          ))}
        </>
      )
    }
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

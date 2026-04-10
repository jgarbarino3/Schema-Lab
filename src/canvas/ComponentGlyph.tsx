import { Arc, Circle, Ellipse, Line, Rect } from 'react-konva'
import type { BoundsMm, ComponentGlyph as ComponentGlyphType } from '../domain/types'

export type ComponentGlyphStyle = 'clean' | 'classic'

interface ComponentGlyphProps {
  boundsMm: BoundsMm
  fill?: string
  glyph: ComponentGlyphType
  isConvex?: boolean
  stroke: string
  strokeScale?: number
  style?: ComponentGlyphStyle
}

export function ComponentGlyph({
  boundsMm,
  fill,
  glyph,
  isConvex,
  stroke,
  strokeScale = 1,
  style = 'clean',
}: ComponentGlyphProps) {
  if (style === 'classic') {
    return renderClassicComponentGlyph({
      boundsMm,
      fill,
      glyph,
      isConvex,
      stroke,
      strokeScale,
    })
  }

  const centerX = boundsMm.x + boundsMm.width / 2
  const centerY = boundsMm.y + boundsMm.height / 2
  const inset = 2.5
  const width = boundsMm.width
  const height = boundsMm.height
  const opticRadius = Math.max(2.8, Math.min(width, height) * 0.26)
  const strokeWidth = (base: number) => base * strokeScale

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
            strokeWidth={strokeWidth(1.25)}
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
            strokeWidth={strokeWidth(1.2)}
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
          strokeWidth={strokeWidth(1.75)}
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
          strokeWidth={strokeWidth(1.75)}
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
            strokeWidth={strokeWidth(1)}
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
            strokeWidth={strokeWidth(1.1)}
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
          strokeWidth={strokeWidth(1)}
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
            strokeWidth={strokeWidth(0.9)}
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
            strokeWidth={strokeWidth(1.1)}
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
          strokeWidth={strokeWidth(1.1)}
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
            strokeWidth={strokeWidth(1.1)}
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
            strokeWidth={strokeWidth(1.05)}
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
            strokeWidth={strokeWidth(0.9)}
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
            strokeWidth={strokeWidth(1.1)}
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
            strokeWidth={strokeWidth(1)}
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
            strokeWidth={strokeWidth(0.9)}
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
            strokeWidth={strokeWidth(1.4)}
          />
          <Line
            lineCap="round"
            points={[centerX, centerY + irisGap, centerX, centerY + irisHalf]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.4)}
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
            strokeWidth={strokeWidth(1)}
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
            strokeWidth={strokeWidth(1)}
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
          strokeWidth={strokeWidth(1)}
        />
      )
    case 'telescope':
      return (
        <>
          <Ellipse
            radiusX={Math.max(2.2, width * 0.08)}
            radiusY={Math.max(5, height * 0.28)}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
            x={centerX - width * 0.18}
            y={centerY}
          />
          <Ellipse
            radiusX={Math.max(2.2, width * 0.08)}
            radiusY={Math.max(5, height * 0.28)}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
            x={centerX + width * 0.18}
            y={centerY}
          />
          <Line
            points={[centerX - width * 0.08, centerY, centerX + width * 0.08, centerY]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.9)}
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
            strokeWidth={strokeWidth(0.9)}
            width={Math.max(18, width * 0.5)}
            x={centerX - Math.max(18, width * 0.5) / 2}
            y={centerY - Math.max(10, height * 0.42) / 2}
          />
          <Line
            points={[boundsMm.x + inset, centerY, centerX - width * 0.25, centerY]}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
          />
          <Line
            points={[centerX + width * 0.25, centerY, boundsMm.x + width - inset, centerY]}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
          />
        </>
      )
    case 'sample':
      return (
        <Rect
          height={Math.max(12, height * 0.5)}
          stroke={stroke}
          strokeWidth={strokeWidth(1)}
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
            strokeWidth={strokeWidth(1)}
            x={centerX - 5}
            y={centerY}
          />
          <Line
            points={[centerX - 2, centerY, centerX + 8, centerY]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.2)}
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
            strokeWidth={strokeWidth(0.9)}
            width={Math.max(18, width * 0.58)}
            x={centerX - Math.max(18, width * 0.58) / 2}
            y={centerY - Math.max(14, height * 0.42) / 2}
          />
          <Circle
            radius={2.4}
            stroke={stroke}
            strokeWidth={strokeWidth(0.8)}
            x={centerX - 4}
            y={centerY}
          />
          <Circle
            radius={2.4}
            stroke={stroke}
            strokeWidth={strokeWidth(0.8)}
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
            strokeWidth={strokeWidth(1.1)}
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
            strokeWidth={strokeWidth(1.1)}
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
            strokeWidth={strokeWidth(1)}
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
              strokeWidth={strokeWidth(0.7)}
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
            strokeWidth={strokeWidth(1)}
            x={centerX}
            y={centerY}
          />
          <Circle
            fill={fill ?? 'rgba(255, 255, 255, 0.08)'}
            radius={2.8}
            stroke={stroke}
            strokeWidth={strokeWidth(0.8)}
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
          strokeWidth={strokeWidth(1)}
          width={Math.max(14, width * 0.45)}
          x={centerX - Math.max(14, width * 0.45) / 2}
          y={centerY - Math.max(10, height * 0.32) / 2}
        />
      )
  }
}

interface ComponentGlyphRenderArgs {
  boundsMm: BoundsMm
  fill?: string
  glyph: ComponentGlyphType
  isConvex?: boolean
  stroke: string
  strokeScale: number
}

function renderClassicComponentGlyph({
  boundsMm,
  fill,
  glyph,
  isConvex,
  stroke,
  strokeScale,
}: ComponentGlyphRenderArgs) {
  const centerX = boundsMm.x + boundsMm.width / 2
  const centerY = boundsMm.y + boundsMm.height / 2
  const inset = 2.5
  const width = boundsMm.width
  const height = boundsMm.height
  const strokeWidth = (base: number) => base * strokeScale
  const left = boundsMm.x + inset
  const right = boundsMm.x + width - inset
  const top = boundsMm.y + inset
  const bottom = boundsMm.y + height - inset
  const primaryFill = fill ?? 'rgba(255, 255, 255, 0.08)'

  switch (glyph) {
    case 'laser':
      return (
        <>
          <Circle
            radius={Math.max(3.2, Math.min(width, height) * 0.16)}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
            x={left + Math.max(3.2, Math.min(width, height) * 0.16)}
            y={centerY}
          />
          <Line
            lineCap="round"
            points={[left + Math.max(3.2, Math.min(width, height) * 0.3), centerY, right - 6, centerY]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.15)}
          />
          <Line
            lineCap="round"
            lineJoin="round"
            points={[right - 9, centerY - 3, right - 3, centerY, right - 9, centerY + 3]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.05)}
          />
        </>
      )
    case 'mirror':
      return (
        <>
          <Line
            lineCap="round"
            points={[right, top, left, bottom]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.65)}
          />
          <Line
            lineCap="round"
            points={[left + width * 0.12, bottom - height * 0.12, left + width * 0.24, bottom]}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
          />
        </>
      )
    case 'curved-mirror': {
      const sign = isConvex ? 1 : -1
      const bow = Math.min(width, height) * 0.08 * sign
      const x0 = right
      const y0 = top
      const x1 = left
      const y1 = bottom
      const steps = 12
      const pts: number[] = []
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps
        const curve = 4 * t * (1 - t)
        pts.push(x0 + (x1 - x0) * t + bow * curve, y0 + (y1 - y0) * t + bow * curve)
      }
      return (
        <>
          <Line
            lineCap="round"
            points={pts}
            stroke={stroke}
            strokeWidth={strokeWidth(1.65)}
            tension={0.2}
          />
          <Line
            lineCap="round"
            points={[left + width * 0.12, bottom - height * 0.12, left + width * 0.22, bottom]}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
          />
        </>
      )
    }
    case 'beamsplitter': {
      const bsSize = Math.max(8, Math.min(width, height) * 0.42)
      return (
        <>
          <Rect
            fill={primaryFill}
            height={bsSize}
            rotation={45}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
            width={bsSize}
            x={centerX}
            y={centerY - bsSize * 0.707}
          />
          <Line
            lineCap="round"
            points={[left + width * 0.22, bottom - height * 0.22, right - width * 0.22, top + height * 0.22]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.05)}
          />
          <Line
            lineCap="round"
            points={[centerX - width * 0.18, centerY + height * 0.18, centerX + width * 0.18, centerY - height * 0.18]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.95)}
          />
        </>
      )
    }
    case 'lens':
      return (
        <>
          <Ellipse
            fill={primaryFill}
            radiusX={Math.max(2.2, width * 0.09)}
            radiusY={Math.max(5, height * 0.38)}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
            x={centerX}
            y={centerY}
          />
          <Line
            lineCap="round"
            points={[centerX, top + height * 0.14, centerX, bottom - height * 0.14]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.85)}
          />
        </>
      )
    case 'filter':
      return (
        <>
          <Rect
            fill={primaryFill}
            height={Math.max(8, height * 0.46)}
            rotation={45}
            stroke={stroke}
            strokeWidth={strokeWidth(0.9)}
            width={Math.max(8, width * 0.46)}
            x={centerX - Math.max(8, width * 0.46) / 2}
            y={centerY - Math.max(8, width * 0.46) / 2}
          />
          <Line
            lineCap="round"
            points={[left + width * 0.18, bottom - height * 0.18, right - width * 0.18, top + height * 0.18]}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
          />
          <Line
            lineCap="round"
            points={[right - 8, centerY - 3, right - 2, centerY, right - 8, centerY + 3]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.95)}
          />
        </>
      )
    case 'attenuator':
      return (
        <>
          <Line
            closed
            fill={primaryFill}
            lineJoin="round"
            points={[
              centerX - width * 0.2,
              centerY + height * 0.22,
              centerX,
              centerY - height * 0.22,
              centerX + width * 0.2,
              centerY + height * 0.22,
            ]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.05)}
          />
          <Line
            lineCap="round"
            points={[left + width * 0.12, centerY, centerX - width * 0.2, centerY]}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
          />
          <Line
            lineCap="round"
            points={[centerX + width * 0.2, centerY, right - width * 0.12, centerY]}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
          />
        </>
      )
    case 'polarizer':
      return (
        <>
          <Circle
            radius={Math.max(4.5, Math.min(width, height) * 0.24)}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
            x={centerX}
            y={centerY}
          />
          <Line
            lineCap="round"
            points={[
              centerX - width * 0.18,
              centerY + height * 0.18,
              centerX + width * 0.18,
              centerY - height * 0.18,
            ]}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
          />
          <Line
            lineCap="round"
            points={[
              centerX + width * 0.1,
              centerY + height * 0.16,
              centerX + width * 0.1,
              centerY - height * 0.16,
            ]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.85)}
          />
        </>
      )
    case 'waveplate':
      return (
        <>
          <Circle
            radius={Math.max(4.5, Math.min(width, height) * 0.24)}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
            x={centerX}
            y={centerY}
          />
          <Line
            lineCap="round"
            points={[
              centerX - width * 0.17,
              centerY + height * 0.17,
              centerX + width * 0.17,
              centerY - height * 0.17,
            ]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.95)}
          />
          <Line
            lineCap="round"
            points={[
              centerX - width * 0.17,
              centerY - height * 0.17,
              centerX + width * 0.17,
              centerY + height * 0.17,
            ]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.95)}
          />
        </>
      )
    case 'iris':
      return (
        <>
          <Circle
            radius={Math.max(5, Math.min(width, height) * 0.28)}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
            x={centerX}
            y={centerY}
          />
          <Line
            lineCap="round"
            points={[centerX, top + height * 0.12, centerX, centerY - height * 0.14]}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
          />
          <Line
            lineCap="round"
            points={[centerX, centerY + height * 0.14, centerX, bottom - height * 0.12]}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
          />
          <Line
            lineCap="round"
            lineJoin="round"
            points={[
              centerX - width * 0.12,
              centerY - height * 0.12,
              centerX,
              centerY - height * 0.02,
              centerX + width * 0.12,
              centerY - height * 0.12,
            ]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.9)}
          />
          <Line
            lineCap="round"
            lineJoin="round"
            points={[
              centerX - width * 0.12,
              centerY + height * 0.12,
              centerX,
              centerY + height * 0.02,
              centerX + width * 0.12,
              centerY + height * 0.12,
            ]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.9)}
          />
        </>
      )
    case 'bbo':
      return (
        <>
          <Line
            closed
            fill={primaryFill}
            lineJoin="round"
            points={[
              centerX - width * 0.2,
              centerY,
              centerX,
              centerY - height * 0.22,
              centerX + width * 0.2,
              centerY,
              centerX,
              centerY + height * 0.22,
            ]}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
          />
          <Line
            lineCap="round"
            points={[left + width * 0.16, centerY, right - width * 0.16, centerY]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.9)}
          />
        </>
      )
    case 'telescope':
      return (
        <>
          <Rect
            fill={primaryFill}
            height={Math.max(8, height * 0.28)}
            stroke={stroke}
            strokeWidth={strokeWidth(0.95)}
            width={Math.max(16, width * 0.56)}
            x={centerX - Math.max(16, width * 0.56) / 2}
            y={centerY - Math.max(8, height * 0.28) / 2}
          />
          <Circle
            radius={Math.max(3, Math.min(width, height) * 0.16)}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
            x={left + Math.max(3, Math.min(width, height) * 0.16)}
            y={centerY}
          />
          <Circle
            radius={Math.max(3, Math.min(width, height) * 0.16)}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
            x={right - Math.max(3, Math.min(width, height) * 0.16)}
            y={centerY}
          />
        </>
      )
    case 'opa':
      return (
        <>
          <Rect
            cornerRadius={2.5}
            fill={primaryFill}
            height={Math.max(10, height * 0.42)}
            stroke={stroke}
            strokeWidth={strokeWidth(0.95)}
            width={Math.max(18, width * 0.54)}
            x={centerX - Math.max(18, width * 0.54) / 2}
            y={centerY - Math.max(10, height * 0.42) / 2}
          />
          <Line
            points={[left + 1, centerY, centerX - width * 0.22, centerY]}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
          />
          <Line
            points={[centerX + width * 0.22, centerY, right - 1, centerY]}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
          />
          <Line
            closed
            fill={fill ?? 'rgba(255, 255, 255, 0.16)'}
            lineJoin="round"
            points={[
              centerX - width * 0.08,
              centerY - height * 0.12,
              centerX + width * 0.08,
              centerY,
              centerX - width * 0.08,
              centerY + height * 0.12,
            ]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.9)}
          />
        </>
      )
    case 'sample':
      return (
        <>
          <Rect
            fill={primaryFill}
            height={Math.max(12, height * 0.46)}
            stroke={stroke}
            strokeWidth={strokeWidth(0.9)}
            width={Math.max(18, width * 0.56)}
            x={centerX - Math.max(18, width * 0.56) / 2}
            y={centerY - Math.max(12, height * 0.46) / 2}
          />
          <Line
            lineCap="round"
            points={[centerX - width * 0.18, centerY - height * 0.1, centerX + width * 0.18, centerY + height * 0.1]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.85)}
          />
        </>
      )
    case 'fiber':
      return (
        <>
          <Circle
            radius={Math.max(3, Math.min(width, height) * 0.16)}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
            x={left + Math.max(3, Math.min(width, height) * 0.16)}
            y={centerY}
          />
          <Circle
            radius={Math.max(3, Math.min(width, height) * 0.16)}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
            x={right - Math.max(3, Math.min(width, height) * 0.16)}
            y={centerY}
          />
          <Line
            lineCap="round"
            points={[
              left + Math.max(3, Math.min(width, height) * 0.32),
              centerY,
              right - Math.max(3, Math.min(width, height) * 0.32),
              centerY,
            ]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.05)}
          />
        </>
      )
    case 'spectrometer':
      return (
        <>
          <Rect
            cornerRadius={2}
            fill={primaryFill}
            height={Math.max(14, height * 0.42)}
            stroke={stroke}
            strokeWidth={strokeWidth(0.95)}
            width={Math.max(18, width * 0.56)}
            x={centerX - Math.max(18, width * 0.56) / 2}
            y={centerY - Math.max(14, height * 0.42) / 2}
          />
          <Line
            closed
            fill={fill ?? 'rgba(255, 255, 255, 0.16)'}
            lineJoin="round"
            points={[
              centerX - width * 0.08,
              centerY - height * 0.1,
              centerX,
              centerY + height * 0.12,
              centerX + width * 0.08,
              centerY - height * 0.1,
            ]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.9)}
          />
          <Line
            lineCap="round"
            points={[right - 7, centerY - 3, right - 1, centerY, right - 7, centerY + 3]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.85)}
          />
        </>
      )
    case 'detector':
      return (
        <>
          <Arc
            angle={180}
            innerRadius={0}
            outerRadius={Math.max(4.5, Math.min(width, height) * 0.24)}
            rotation={-90}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
            x={centerX + 2}
            y={centerY}
          />
          <Line
            lineCap="round"
            points={[centerX + 2, centerY - 8, centerX + 2, centerY + 8]}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
          />
          <Line
            lineCap="round"
            points={[left + width * 0.22, centerY, centerX - 4, centerY]}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
          />
        </>
      )
    case 'beam-dump': {
      const bdW = Math.max(10, width * 0.42)
      const bdH = Math.max(10, height * 0.42)
      const bdX = centerX - bdW / 2
      const bdY = centerY - bdH / 2
      return (
        <>
          <Rect
            cornerRadius={1.5}
            fill={fill ?? 'rgba(80, 64, 52, 0.24)'}
            height={bdH}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
            width={bdW}
            x={bdX}
            y={bdY}
          />
          {[0.2, 0.5, 0.8].map((fraction) => (
            <Line
              key={fraction}
              lineCap="round"
              points={[
                bdX + bdW * fraction - bdH * 0.16,
                bdY,
                bdX + bdW * fraction + bdH * 0.16,
                bdY + bdH,
              ]}
              opacity={0.75}
              stroke={stroke}
              strokeWidth={strokeWidth(0.75)}
            />
          ))}
        </>
      )
    }
    case 'mount':
      return (
        <>
          <Circle
            radius={Math.max(6, Math.min(width, height) * 0.3)}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
            x={centerX}
            y={centerY}
          />
          <Circle
            fill={fill ?? 'rgba(255, 255, 255, 0.08)'}
            radius={2.6}
            stroke={stroke}
            strokeWidth={strokeWidth(0.8)}
            x={centerX}
            y={centerY}
          />
          <Line
            lineCap="round"
            points={[centerX, top + height * 0.18, centerX, bottom - height * 0.18]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.85)}
          />
          <Line
            lineCap="round"
            points={[left + width * 0.18, centerY, right - width * 0.18, centerY]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.85)}
          />
        </>
      )
    case 'support':
      return (
        <>
          <Rect
            cornerRadius={2}
            fill={primaryFill}
            height={Math.max(10, height * 0.3)}
            stroke={stroke}
            strokeWidth={strokeWidth(0.95)}
            width={Math.max(14, width * 0.42)}
            x={centerX - Math.max(14, width * 0.42) / 2}
            y={centerY - Math.max(10, height * 0.3) / 2}
          />
          <Line
            lineCap="round"
            points={[
              centerX - width * 0.16,
              bottom - height * 0.12,
              centerX + width * 0.16,
              bottom - height * 0.12,
            ]}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
          />
        </>
      )
  }
}

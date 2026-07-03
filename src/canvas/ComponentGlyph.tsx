import { Circle, Ellipse, Line, Rect } from 'react-konva'
import type {
  BoundsMm,
  ComponentGlyph as ComponentGlyphType,
  SimpleIconStyle,
} from '../domain/types'

export type ComponentGlyphStyle = SimpleIconStyle

interface ComponentGlyphProps {
  boundsMm: BoundsMm
  fill?: string
  glyph: ComponentGlyphType
  isConvex?: boolean
  stroke: string
  strokeScale?: number
  style?: ComponentGlyphStyle
}

function normalizeClassicGlyph(glyph: ComponentGlyphType): ComponentGlyphType {
  switch (glyph) {
    case 'laser-fs-source':
    case 'laser-compact-table':
    case 'laser-libra':
    case 'laser-pharos':
    case 'laser-clark':
      return 'laser'
    case 'support-clamp-fork':
    case 'support-mounting-base':
    case 'support-pedestal-post':
    case 'support-post-holder':
    case 'support-pedestal-assembly':
    case 'support-linear-slide':
    case 'support-beam-block':
    case 'support-periscope':
    case 'support-white-light-cell':
    case 'support-pump-seed-combiner':
      return 'support'
    case 'filter-longpass':
    case 'filter-shortpass':
    case 'filter-bandpass':
    case 'filter-colored-glass':
      return 'filter'
    case 'attenuator-horizontal':
    case 'attenuator-vertical':
      return 'attenuator'
    case 'waveplate-half':
    case 'waveplate-quarter':
      return 'waveplate'
    case 'iris-standard':
    case 'iris-zero':
    case 'iris-sm1-ring':
    case 'iris-sm1-graduated':
    case 'iris-sm1-zero':
      return 'iris'
    case 'telescope-transmission':
    case 'telescope-reflective':
      return 'telescope'
    case 'opa-white-light':
    case 'opa-combiner':
    case 'opa-gain':
      return 'opa'
    case 'sample-holder-generic':
    case 'sample-holder-slotted':
    case 'sample-generic':
    case 'sample-xy-stage':
    case 'sample-xyz-stage':
    case 'sample-manual-xyz-stage':
    case 'sample-delay-stage':
    case 'sample-motorized-stage':
    case 'sample-chip':
    case 'sample-crystal':
    case 'sample-substrate':
      return 'sample'
    case 'spectrometer-compact':
    case 'spectrometer-bench':
      return 'spectrometer'
    default:
      return glyph
  }
}

export function ComponentGlyph({
  boundsMm,
  fill,
  glyph,
  isConvex,
  stroke,
  strokeScale = 1,
  style = 'enhanced',
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
    case 'laser-fs-source': {
      const bodyWidth = Math.max(10, width * 0.26)
      const bodyHeight = Math.max(8, height * 0.36)
      return (
        <>
          <Rect
            cornerRadius={bodyHeight * 0.28}
            fill={fill ?? 'rgba(138, 214, 255, 0.16)'}
            height={bodyHeight}
            stroke={stroke}
            strokeWidth={strokeWidth(1.1)}
            width={bodyWidth}
            x={boundsMm.x + inset}
            y={centerY - bodyHeight / 2}
          />
          <Line
            lineCap="round"
            points={[
              boundsMm.x + inset + bodyWidth,
              centerY,
              boundsMm.x + width - inset - 4,
              centerY,
            ]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.15)}
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
            strokeWidth={strokeWidth(1.1)}
          />
          <Line
            lineCap="round"
            points={[
              boundsMm.x + inset + bodyWidth * 0.32,
              centerY - bodyHeight * 0.22,
              boundsMm.x + inset + bodyWidth * 0.72,
              centerY - bodyHeight * 0.22,
            ]}
            opacity={0.7}
            stroke={stroke}
            strokeWidth={strokeWidth(0.85)}
          />
        </>
      )
    }
    case 'laser-compact-table': {
      const bodyHeight = Math.max(10, height * 0.46)
      const bodyWidth = Math.max(18, width * 0.42)
      const bodyX = centerX - bodyWidth * 0.58
      return (
        <>
          <Rect
            cornerRadius={3.4}
            fill={fill ?? 'rgba(138, 214, 255, 0.14)'}
            height={bodyHeight}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
            width={bodyWidth}
            x={bodyX}
            y={centerY - bodyHeight / 2}
          />
          <Rect
            cornerRadius={2}
            fill="rgba(255,255,255,0.04)"
            height={bodyHeight * 0.38}
            stroke={stroke}
            strokeWidth={strokeWidth(0.7)}
            width={bodyWidth * 0.22}
            x={bodyX + bodyWidth * 0.1}
            y={centerY - bodyHeight * 0.19}
          />
          <Line
            lineCap="round"
            points={[bodyX + bodyWidth, centerY, boundsMm.x + width - inset - 4, centerY]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.1)}
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
            strokeWidth={strokeWidth(1.05)}
          />
        </>
      )
    }
    case 'laser-libra':
    case 'laser-pharos':
    case 'laser-clark': {
      const bodyWidth =
        glyph === 'laser-libra'
          ? Math.max(24, width * 0.58)
          : glyph === 'laser-pharos'
            ? Math.max(22, width * 0.52)
            : Math.max(22, width * 0.48)
      const bodyHeight =
        glyph === 'laser-pharos'
          ? Math.max(12, height * 0.42)
          : Math.max(12, height * 0.4)
      const bodyX = centerX - bodyWidth / 2
      const bodyY = centerY - bodyHeight / 2
      return (
        <>
          <Rect
            cornerRadius={glyph === 'laser-libra' ? 2.4 : 3.2}
            fill={fill ?? 'rgba(222, 233, 239, 0.15)'}
            height={bodyHeight}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
            width={bodyWidth}
            x={bodyX}
            y={bodyY}
          />
          <Line
            lineCap="round"
            points={[
              bodyX + bodyWidth * 0.12,
              bodyY + bodyHeight * 0.22,
              bodyX + bodyWidth * 0.88,
              bodyY + bodyHeight * 0.22,
            ]}
            opacity={0.55}
            stroke={stroke}
            strokeWidth={strokeWidth(0.8)}
          />
          {glyph === 'laser-libra' ? (
            <Rect
              cornerRadius={1.6}
              fill="rgba(255,255,255,0.03)"
              height={bodyHeight * 0.38}
              stroke={stroke}
              strokeWidth={strokeWidth(0.7)}
              width={bodyWidth * 0.18}
              x={bodyX + bodyWidth * 0.08}
              y={centerY - bodyHeight * 0.19}
            />
          ) : null}
          {glyph === 'laser-pharos' ? (
            <Line
              lineCap="round"
              points={[
                bodyX + bodyWidth * 0.3,
                bodyY + bodyHeight * 0.78,
                bodyX + bodyWidth * 0.7,
                bodyY + bodyHeight * 0.78,
              ]}
              opacity={0.55}
              stroke={stroke}
              strokeWidth={strokeWidth(0.8)}
            />
          ) : null}
          {glyph === 'laser-clark' ? (
            <Rect
              cornerRadius={1.4}
              fill="rgba(255,255,255,0.03)"
              height={bodyHeight * 0.28}
              stroke={stroke}
              strokeWidth={strokeWidth(0.7)}
              width={bodyWidth * 0.24}
              x={bodyX + bodyWidth * 0.68}
              y={centerY - bodyHeight * 0.14}
            />
          ) : null}
          <Line
            lineCap="round"
            points={[bodyX + bodyWidth, centerY, boundsMm.x + width - inset - 4, centerY]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.05)}
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
            strokeWidth={strokeWidth(1)}
          />
        </>
      )
    }
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
    case 'mirror-flip': {
      const hingeX = centerX - width * 0.16
      const hingeY = centerY + height * 0.16
      return (
        <>
          <Circle
            fill={fill ?? 'rgba(255,255,255,0.08)'}
            radius={Math.max(2.4, Math.min(width, height) * 0.12)}
            stroke={stroke}
            strokeWidth={strokeWidth(0.9)}
            x={hingeX}
            y={hingeY}
          />
          <Line
            lineCap="round"
            points={[
              boundsMm.x + width - inset,
              boundsMm.y + inset + height * 0.06,
              boundsMm.x + inset + width * 0.12,
              boundsMm.y + height - inset - height * 0.08,
            ]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.6)}
          />
          <Line
            lineCap="round"
            points={[
              hingeX,
              hingeY,
              hingeX + width * 0.2,
              hingeY - height * 0.22,
            ]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.95)}
          />
        </>
      )
    }
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
    case 'folded-mirror-pair': {
      const baseWidth = Math.max(14, width * 0.64)
      const baseHeight = Math.max(10, height * 0.42)
      const baseX = centerX - baseWidth / 2
      const baseY = centerY - baseHeight / 2
      const mirrorInsetX = Math.max(3, baseWidth * 0.18)
      const mirrorInsetY = Math.max(2.8, baseHeight * 0.18)

      return (
        <>
          <Rect
            cornerRadius={2.4}
            fill={fill ?? 'rgba(255,255,255,0.06)'}
            height={baseHeight}
            stroke={stroke}
            strokeWidth={strokeWidth(0.82)}
            width={baseWidth}
            x={baseX}
            y={baseY}
          />
          <Line
            lineCap="round"
            points={[
              baseX + mirrorInsetX,
              baseY + baseHeight - mirrorInsetY,
              centerX,
              centerY,
            ]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.45)}
          />
          <Line
            lineCap="round"
            points={[
              centerX,
              centerY,
              baseX + baseWidth - mirrorInsetX,
              baseY + mirrorInsetY,
            ]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.45)}
          />
          <Line
            lineCap="round"
            points={[
              baseX + mirrorInsetX * 0.85,
              centerY,
              baseX + baseWidth - mirrorInsetX * 0.85,
              centerY,
            ]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.62)}
          />
        </>
      )
    }
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
      const coatingOffset = bsSize * 0.16
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
            strokeWidth={strokeWidth(1.15)}
          />
          <Line
            lineCap="round"
            points={[
              centerX - bsSize * 0.38 + coatingOffset,
              centerY + bsSize * 0.38,
              centerX + bsSize * 0.38 + coatingOffset,
              centerY - bsSize * 0.38,
            ]}
            opacity={0.5}
            stroke={stroke}
            strokeWidth={strokeWidth(0.8)}
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
    case 'filter-longpass':
    case 'filter-shortpass':
    case 'filter-bandpass':
    case 'filter-colored-glass':
      return (
        <>
          <Rect
            fill={
              glyph === 'filter-colored-glass'
                ? fill ?? 'rgba(232, 215, 182, 0.2)'
                : fill ?? 'rgba(150, 201, 205, 0.12)'
            }
            height={Math.max(glyph === 'filter-colored-glass' ? 9 : 8, height * 0.5)}
            rotation={45}
            stroke={stroke}
            strokeWidth={strokeWidth(glyph === 'filter-colored-glass' ? 0.95 : 0.9)}
            width={Math.max(glyph === 'filter-colored-glass' ? 9 : 8, width * 0.5)}
            x={centerX - Math.max(glyph === 'filter-colored-glass' ? 9 : 8, width * 0.5) / 2}
            y={centerY - Math.max(glyph === 'filter-colored-glass' ? 9 : 8, width * 0.5) / 2}
          />
          {glyph === 'filter-longpass' ? (
            <Line
              lineCap="round"
              lineJoin="round"
              points={[
                boundsMm.x + width * 0.27,
                boundsMm.y + height * 0.68,
                boundsMm.x + width * 0.4,
                boundsMm.y + height * 0.68,
                boundsMm.x + width * 0.62,
                boundsMm.y + height * 0.36,
                boundsMm.x + width * 0.74,
                boundsMm.y + height * 0.36,
              ]}
              stroke={stroke}
              strokeWidth={strokeWidth(1.05)}
            />
          ) : glyph === 'filter-shortpass' ? (
            <Line
              lineCap="round"
              lineJoin="round"
              points={[
                boundsMm.x + width * 0.27,
                boundsMm.y + height * 0.36,
                boundsMm.x + width * 0.4,
                boundsMm.y + height * 0.36,
                boundsMm.x + width * 0.62,
                boundsMm.y + height * 0.68,
                boundsMm.x + width * 0.74,
                boundsMm.y + height * 0.68,
              ]}
              stroke={stroke}
              strokeWidth={strokeWidth(1.05)}
            />
          ) : glyph === 'filter-bandpass' ? (
            <Line
              lineCap="round"
              lineJoin="round"
              points={[
                boundsMm.x + width * 0.24,
                centerY,
                boundsMm.x + width * 0.38,
                centerY,
                centerX,
                boundsMm.y + height * 0.34,
                boundsMm.x + width * 0.62,
                centerY,
                boundsMm.x + width * 0.76,
                centerY,
              ]}
              stroke={stroke}
              strokeWidth={strokeWidth(1.02)}
            />
          ) : glyph === 'filter-colored-glass' ? (
            <>
              <Line
                lineCap="round"
                points={[
                  boundsMm.x + width * 0.28,
                  boundsMm.y + height * 0.72,
                  boundsMm.x + width * 0.72,
                  boundsMm.y + height * 0.28,
                ]}
                opacity={0.75}
                stroke={stroke}
                strokeWidth={strokeWidth(1.05)}
              />
              <Line
                lineCap="round"
                points={[
                  boundsMm.x + width * 0.3,
                  boundsMm.y + height * 0.3,
                  boundsMm.x + width * 0.7,
                  boundsMm.y + height * 0.7,
                ]}
                opacity={0.45}
                stroke={stroke}
                strokeWidth={strokeWidth(0.8)}
              />
            </>
          ) : (
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
          )}
        </>
      )
    case 'attenuator-horizontal':
    case 'attenuator-vertical': {
      const wedgeH = Math.max(8, Math.min(width, height) * 0.48)
      const wedgeW = wedgeH * 0.62
      const isVertical = glyph === 'attenuator-vertical'
      return (
        <>
          <Line
            closed
            fill={fill ?? 'rgba(237, 216, 155, 0.2)'}
            lineJoin="round"
            points={
              isVertical
                ? [
                    centerX - wedgeH * 0.5,
                    centerY + wedgeW * 0.5,
                    centerX + wedgeH * 0.5,
                    centerY,
                    centerX - wedgeH * 0.5,
                    centerY - wedgeW * 0.5,
                  ]
                : [
                    centerX - wedgeW * 0.5,
                    centerY + wedgeH * 0.5,
                    centerX,
                    centerY - wedgeH * 0.5,
                    centerX + wedgeW * 0.5,
                    centerY + wedgeH * 0.5,
                  ]
            }
            stroke={stroke}
            strokeWidth={strokeWidth(1.1)}
          />
          <Line
            dash={isVertical ? [2.2, 1.8] : undefined}
            lineCap="round"
            points={
              isVertical
                ? [centerX, boundsMm.y + inset, centerX, boundsMm.y + height - inset]
                : [boundsMm.x + inset, centerY, boundsMm.x + width - inset, centerY]
            }
            opacity={0.55}
            stroke={stroke}
            strokeWidth={strokeWidth(0.75)}
          />
        </>
      )
    }
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
      const gridRadius = pr * 0.52
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
          {[-0.18, 0, 0.18].map((offset) => (
            <Line
              key={offset}
              lineCap="round"
              points={[
                centerX - gridRadius * 0.48 + pr * offset,
                centerY - gridRadius * 0.1 - pr * offset,
                centerX + gridRadius * 0.48 + pr * offset,
                centerY + gridRadius * 0.1 - pr * offset,
              ]}
              opacity={0.55}
              stroke={stroke}
              strokeWidth={strokeWidth(0.72)}
            />
          ))}
          <Line
            lineCap="round"
            lineJoin="round"
            points={[
              centerX + pr * ax - pr * 0.28,
              centerY - pr * ax - pr * 0.08,
              centerX + pr * ax,
              centerY - pr * ax,
              centerX + pr * ax - pr * 0.08,
              centerY - pr * ax + pr * 0.28,
            ]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.88)}
          />
        </>
      )
    }
    case 'waveplate-half':
    case 'waveplate-quarter': {
      const wr = opticRadius
      const wax = 0.707
      const tickLen = wr * 0.35
      const secondaryTickLen = wr * 0.2
      const isQuarter = glyph === 'waveplate-quarter'
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
          {isQuarter ? (
            <Line
              lineCap="round"
              points={[
                centerX - secondaryTickLen,
                centerY + secondaryTickLen * 1.1,
                centerX + secondaryTickLen,
                centerY + secondaryTickLen * 1.1,
              ]}
              stroke={stroke}
              strokeWidth={strokeWidth(0.9)}
            />
          ) : null}
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
    case 'iris-standard':
    case 'iris-zero':
    case 'iris-sm1-ring':
    case 'iris-sm1-graduated':
    case 'iris-sm1-zero': {
      const irisHalf = Math.max(5, Math.min(width, height) * 0.32)
      const irisGap =
        glyph === 'iris-zero' || glyph === 'iris-sm1-zero'
          ? irisHalf * 0.18
          : irisHalf * 0.35
      const isThreaded =
        glyph === 'iris-sm1-ring' ||
        glyph === 'iris-sm1-graduated' ||
        glyph === 'iris-sm1-zero'
      return (
        <>
          {isThreaded ? (
            <Circle
              radius={irisHalf + 2}
              stroke={stroke}
              strokeWidth={strokeWidth(0.75)}
              x={centerX}
              y={centerY}
            />
          ) : null}
          <Line
            lineCap="round"
            points={[centerX, centerY - irisHalf, centerX, centerY - irisGap]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.35)}
          />
          <Line
            lineCap="round"
            points={[centerX, centerY + irisGap, centerX, centerY + irisHalf]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.35)}
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
            strokeWidth={strokeWidth(0.95)}
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
            strokeWidth={strokeWidth(0.95)}
          />
          {glyph === 'iris-zero' || glyph === 'iris-sm1-zero' ? (
            <Circle
              fill={fill ?? 'rgba(255,255,255,0.08)'}
              radius={Math.max(1.5, irisGap * 0.5)}
              stroke={stroke}
              strokeWidth={strokeWidth(0.75)}
              x={centerX}
              y={centerY}
            />
          ) : null}
          {glyph === 'iris-sm1-ring' ? (
            <Circle
              radius={irisHalf + 4.2}
              stroke={stroke}
              strokeWidth={strokeWidth(0.7)}
              x={centerX + irisHalf * 0.2}
              y={centerY}
            />
          ) : null}
          {glyph === 'iris-sm1-graduated' ? (
            <Line
              dash={[1.4, 1.2]}
              points={[
                centerX - irisHalf - 1,
                centerY + irisHalf + 3,
                centerX + irisHalf + 1,
                centerY + irisHalf + 3,
              ]}
              stroke={stroke}
              strokeWidth={strokeWidth(0.75)}
            />
          ) : null}
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
    case 'telescope-transmission':
    case 'telescope-reflective': {
      const reflective = glyph === 'telescope-reflective'
      return reflective ? (
        <>
          <Line
            lineCap="round"
            points={[
              centerX - width * 0.24,
              centerY + height * 0.16,
              centerX - width * 0.06,
              centerY - height * 0.18,
            ]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.2)}
          />
          <Line
            lineCap="round"
            points={[
              centerX + width * 0.06,
              centerY + height * 0.18,
              centerX + width * 0.24,
              centerY - height * 0.16,
            ]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.2)}
          />
          <Line
            lineCap="round"
            points={[
              boundsMm.x + inset,
              centerY,
              centerX - width * 0.12,
              centerY,
              centerX + width * 0.12,
              centerY,
              boundsMm.x + width - inset,
              centerY,
            ]}
            opacity={0.65}
            stroke={stroke}
            strokeWidth={strokeWidth(0.8)}
          />
        </>
      ) : (
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
    }
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
    case 'opa-white-light':
    case 'opa-combiner':
    case 'opa-gain':
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
          {glyph === 'opa-white-light' ? (
            <>
              <Line
                points={[boundsMm.x + inset, centerY, centerX - width * 0.25, centerY]}
                stroke={stroke}
                strokeWidth={strokeWidth(1)}
              />
              <Line
                points={[centerX + width * 0.22, centerY, boundsMm.x + width - inset, centerY]}
                stroke={stroke}
                strokeWidth={strokeWidth(1)}
              />
              <Line
                lineCap="round"
                points={[centerX, centerY - height * 0.13, centerX, centerY + height * 0.13]}
                stroke={stroke}
                strokeWidth={strokeWidth(0.9)}
              />
              <Line
                lineCap="round"
                points={[centerX - width * 0.11, centerY, centerX + width * 0.11, centerY]}
                stroke={stroke}
                strokeWidth={strokeWidth(0.9)}
              />
              <Line
                lineCap="round"
                points={[
                  centerX - width * 0.08,
                  centerY - height * 0.08,
                  centerX + width * 0.08,
                  centerY + height * 0.08,
                ]}
                stroke={stroke}
                strokeWidth={strokeWidth(0.75)}
              />
              <Line
                lineCap="round"
                points={[
                  centerX - width * 0.08,
                  centerY + height * 0.08,
                  centerX + width * 0.08,
                  centerY - height * 0.08,
                ]}
                stroke={stroke}
                strokeWidth={strokeWidth(0.75)}
              />
            </>
          ) : glyph === 'opa-combiner' ? (
            <>
              <Line
                points={[boundsMm.x + inset, centerY, centerX - width * 0.12, centerY]}
                stroke={stroke}
                strokeWidth={strokeWidth(1)}
              />
              <Line
                points={[centerX + width * 0.18, centerY, boundsMm.x + width - inset, centerY]}
                stroke={stroke}
                strokeWidth={strokeWidth(1)}
              />
              <Line
                points={[centerX, boundsMm.y + inset, centerX, centerY - height * 0.16]}
                stroke={stroke}
                strokeWidth={strokeWidth(0.95)}
              />
              <Line
                points={[centerX, centerY + height * 0.16, centerX, boundsMm.y + height - inset]}
                stroke={stroke}
                strokeWidth={strokeWidth(0.95)}
              />
              <Line
                closed
                fill="rgba(255,255,255,0.04)"
                lineJoin="round"
                points={[
                  centerX - width * 0.08,
                  centerY,
                  centerX,
                  centerY - height * 0.1,
                  centerX + width * 0.08,
                  centerY,
                  centerX,
                  centerY + height * 0.1,
                ]}
                stroke={stroke}
                strokeWidth={strokeWidth(0.85)}
              />
            </>
          ) : glyph === 'opa-gain' ? (
            <>
              <Line
                points={[boundsMm.x + inset, centerY, centerX - width * 0.22, centerY]}
                stroke={stroke}
                strokeWidth={strokeWidth(1)}
              />
              <Line
                points={[centerX, boundsMm.y + inset, centerX, centerY - height * 0.16]}
                stroke={stroke}
                strokeWidth={strokeWidth(0.95)}
              />
              <Line
                points={[centerX + width * 0.15, centerY, boundsMm.x + width - inset, centerY]}
                stroke={stroke}
                strokeWidth={strokeWidth(1)}
              />
              <Line
                points={[
                  centerX + width * 0.05,
                  centerY + height * 0.04,
                  centerX + width * 0.18,
                  centerY + height * 0.16,
                ]}
                stroke={stroke}
                strokeWidth={strokeWidth(0.8)}
              />
              <Rect
                cornerRadius={1.4}
                fill="rgba(255,255,255,0.06)"
                height={Math.max(6, height * 0.22)}
                stroke={stroke}
                strokeWidth={strokeWidth(0.75)}
                width={Math.max(8, width * 0.18)}
                x={centerX - Math.max(8, width * 0.18) / 2}
                y={centerY - Math.max(6, height * 0.22) / 2}
              />
            </>
          ) : (
            <>
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
          )}
        </>
      )
    case 'sample-holder-generic':
    case 'sample-holder-slotted':
    case 'sample-generic':
    case 'sample-xy-stage':
    case 'sample-xyz-stage':
    case 'sample-manual-xyz-stage':
    case 'sample-delay-stage':
    case 'sample-motorized-stage': {
      const isSlottedHolder = glyph === 'sample-holder-slotted'
      const isGenericHolder = glyph === 'sample-holder-generic'
      const isMotorized = glyph === 'sample-motorized-stage'
      const isDelayStage = glyph === 'sample-delay-stage'
      const isXyStage = glyph === 'sample-xy-stage'
      const isXyzStage = glyph === 'sample-xyz-stage'
      const isManualXyzStage = glyph === 'sample-manual-xyz-stage'
      const showSeat =
        glyph !== 'sample-generic' || isXyStage || isXyzStage || isManualXyzStage || isGenericHolder || isSlottedHolder
      const showMicrometerKnob = isDelayStage || isManualXyzStage || isSlottedHolder
      const stageWidth = isMotorized
        ? Math.max(22, width * 0.72)
        : isSlottedHolder
          ? Math.max(24, width * 0.8)
        : isManualXyzStage
          ? Math.max(20, width * 0.66)
          : isXyzStage
            ? Math.max(20, width * 0.62)
            : isXyStage
              ? Math.max(19, width * 0.6)
              : isDelayStage
                ? Math.max(18, width * 0.62)
                : Math.max(18, width * 0.56)
      const stageHeight = isMotorized
        ? Math.max(12, height * 0.44)
        : isSlottedHolder
          ? Math.max(10, height * 0.42)
        : isManualXyzStage
          ? Math.max(14, height * 0.56)
          : isXyzStage
            ? Math.max(14, height * 0.54)
            : Math.max(12, height * 0.5)
      const stageX = centerX - stageWidth / 2
      const stageY = centerY - stageHeight / 2
      const seatWidth = Math.max(10, stageWidth * (isMotorized ? 0.22 : 0.3))
      const seatHeight = Math.max(8, stageHeight * (isMotorized ? 0.42 : 0.46))
      const seatX = centerX - seatWidth / 2
      const seatY = centerY - seatHeight / 2
      return (
        <>
          <Rect
            cornerRadius={2}
            fill={fill ?? 'rgba(255,255,255,0.04)'}
            height={stageHeight}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
            width={stageWidth}
            x={stageX}
            y={stageY}
          />
          {isSlottedHolder ? (
            <>
              <Rect
                cornerRadius={Math.max(3, stageHeight * 0.28)}
                fill="rgba(18, 23, 28, 0.52)"
                height={Math.max(8, stageHeight * 0.46)}
                stroke={stroke}
                strokeWidth={strokeWidth(0.72)}
                width={Math.max(10, stageWidth * 0.18)}
                x={stageX + stageWidth * 0.2}
                y={centerY - Math.max(8, stageHeight * 0.46) / 2}
              />
              <Rect
                cornerRadius={Math.max(2.8, stageHeight * 0.24)}
                fill="rgba(14, 18, 23, 0.26)"
                height={Math.max(6.8, stageHeight * 0.34)}
                stroke={stroke}
                strokeWidth={strokeWidth(0.62)}
                width={Math.max(16, stageWidth * 0.42)}
                x={stageX + stageWidth * 0.38}
                y={centerY - Math.max(6.8, stageHeight * 0.34) / 2}
              />
              <Rect
                cornerRadius={Math.max(2.2, stageHeight * 0.18)}
                fill="rgba(236, 241, 245, 0.16)"
                height={Math.max(3.4, stageHeight * 0.16)}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={strokeWidth(0.34)}
                width={Math.max(18, stageWidth * 0.48)}
                x={stageX + stageWidth * 0.22}
                y={stageY + Math.max(3, stageHeight * 0.12)}
              />
              <Circle
                fill="rgba(9, 12, 15, 0.72)"
                radius={Math.max(3.2, stageHeight * 0.26)}
                stroke={stroke}
                strokeWidth={strokeWidth(0.72)}
                x={stageX + stageWidth * 0.29}
                y={centerY}
              />
              <Circle
                fill="rgba(228, 236, 242, 0.22)"
                radius={Math.max(2.1, stageHeight * 0.14)}
                stroke={stroke}
                strokeWidth={strokeWidth(0.54)}
                x={stageX + stageWidth * 0.62}
                y={centerY}
              />
              <Circle
                fill="rgba(228, 236, 242, 0.24)"
                radius={Math.max(1.8, stageHeight * 0.12)}
                stroke={stroke}
                strokeWidth={strokeWidth(0.48)}
                x={stageX + stageWidth * 0.8}
                y={centerY}
              />
            </>
          ) : null}
          {(isXyStage || isXyzStage || isManualXyzStage) ? (
            <>
              <Line
                lineCap="round"
                points={[stageX + stageWidth * 0.18, centerY, stageX + stageWidth * 0.82, centerY]}
                opacity={0.65}
                stroke={stroke}
                strokeWidth={strokeWidth(0.82)}
              />
              <Line
                lineCap="round"
                points={[centerX, stageY + stageHeight * 0.18, centerX, stageY + stageHeight * 0.82]}
                opacity={0.55}
                stroke={stroke}
                strokeWidth={strokeWidth(0.78)}
              />
            </>
          ) : null}
          {showSeat ? (
            <Rect
              cornerRadius={1.6}
              fill="rgba(255,255,255,0.04)"
              height={seatHeight}
              stroke={stroke}
              strokeWidth={strokeWidth(0.75)}
              width={seatWidth}
              x={seatX}
              y={seatY}
            />
          ) : null}
          {showMicrometerKnob ? (
            <>
              <Rect
                cornerRadius={Math.max(1.8, stageHeight * 0.14)}
                fill="rgba(222, 231, 236, 0.22)"
                height={Math.max(5.2, stageHeight * 0.3)}
                stroke={stroke}
                strokeWidth={strokeWidth(0.72)}
                width={Math.max(10, stageWidth * 0.18)}
                x={stageX + stageWidth - Math.max(10, stageWidth * 0.18) * 0.56}
                y={centerY - Math.max(5.2, stageHeight * 0.3) / 2}
              />
              <Ellipse
                fill="rgba(244, 248, 251, 0.32)"
                radiusX={Math.max(2.6, stageHeight * 0.18)}
                radiusY={Math.max(4.2, stageHeight * 0.24)}
                stroke={stroke}
                strokeWidth={strokeWidth(0.72)}
                x={stageX + stageWidth + Math.max(2.6, stageHeight * 0.18) * 0.35}
                y={centerY}
              />
            </>
          ) : null}
          {isMotorized ? (
            <Line
              dash={[1.5, 1.2]}
              points={[
                stageX + stageWidth * 0.72,
                stageY + stageHeight * 0.2,
                stageX + stageWidth * 0.72,
                stageY + stageHeight * 0.8,
              ]}
              stroke={stroke}
              strokeWidth={strokeWidth(0.75)}
            />
          ) : null}
        </>
      )
    }
    case 'sample':
    case 'sample-chip':
    case 'sample-crystal':
    case 'sample-substrate':
      return (
        glyph === 'sample-crystal' ? (
          <Line
            closed
            fill={fill ?? 'rgba(255,255,255,0.12)'}
            lineJoin="round"
            points={[
              centerX - width * 0.18,
              centerY,
              centerX,
              centerY - height * 0.24,
              centerX + width * 0.18,
              centerY,
              centerX,
              centerY + height * 0.24,
            ]}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
          />
        ) : (
          <Rect
            height={Math.max(12, height * 0.5)}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
            width={Math.max(18, width * 0.56)}
            x={centerX - Math.max(18, width * 0.56) / 2}
            y={centerY - Math.max(12, height * 0.5) / 2}
          />
        )
      )
    case 'fiber':
      return (
        <>
          <Circle
            radius={Math.max(3, Math.min(width, height) * 0.18)}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
            x={boundsMm.x + width * 0.26}
            y={centerY}
          />
          <Line
            closed
            fill={fill ?? 'rgba(138, 217, 214, 0.12)'}
            lineJoin="round"
            points={[
              boundsMm.x + width * 0.34,
              centerY - height * 0.18,
              boundsMm.x + width * 0.58,
              centerY - height * 0.12,
              boundsMm.x + width * 0.58,
              centerY + height * 0.12,
              boundsMm.x + width * 0.34,
              centerY + height * 0.18,
            ]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.95)}
          />
          <Circle
            radius={Math.max(2.4, Math.min(width, height) * 0.11)}
            stroke={stroke}
            strokeWidth={strokeWidth(0.9)}
            x={boundsMm.x + width * 0.7}
            y={centerY}
          />
          <Line
            points={[boundsMm.x + width * 0.16, centerY, boundsMm.x + width * 0.84, centerY]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.2)}
          />
        </>
      )
    case 'spectrometer-compact':
    case 'spectrometer-bench': {
      const compact = glyph === 'spectrometer-compact'
      const bodyWidth = compact ? Math.max(18, width * 0.58) : Math.max(22, width * 0.68)
      const bodyHeight = compact ? Math.max(14, height * 0.42) : Math.max(16, height * 0.5)
      const bodyX = centerX - bodyWidth / 2
      const bodyY = centerY - bodyHeight / 2
      return (
        <>
          <Rect
            cornerRadius={compact ? 2 : 3}
            fill={fill ?? 'rgba(188, 214, 223, 0.1)'}
            height={bodyHeight}
            stroke={stroke}
            strokeWidth={strokeWidth(0.9)}
            width={bodyWidth}
            x={bodyX}
            y={bodyY}
          />
          {compact ? (
            <>
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
          ) : (
            <>
              <Circle
                radius={Math.max(3.6, Math.min(width, height) * 0.14)}
                stroke={stroke}
                strokeWidth={strokeWidth(0.85)}
                x={bodyX + bodyWidth * 0.28}
                y={centerY}
              />
              <Rect
                cornerRadius={1.2}
                fill="rgba(255,255,255,0.03)"
                height={bodyHeight * 0.26}
                stroke={stroke}
                strokeWidth={strokeWidth(0.7)}
                width={bodyWidth * 0.22}
                x={bodyX + bodyWidth * 0.72}
                y={centerY - bodyHeight * 0.13}
              />
            </>
          )}
        </>
      )
    }
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
      const bodyWidth = Math.max(10, width * 0.42)
      const bodyHeight = Math.max(12, height * 0.46)
      const bodyX = centerX - bodyWidth * 0.1
      const bodyY = centerY - bodyHeight / 2
      return (
        <>
          <Rect
            cornerRadius={Math.max(2.4, bodyHeight * 0.24)}
            fill={fill ?? 'rgba(240, 201, 221, 0.1)'}
            height={bodyHeight}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
            width={bodyWidth}
            x={bodyX}
            y={bodyY}
          />
          <Circle
            radius={Math.max(2.4, Math.min(width, height) * 0.1)}
            stroke={stroke}
            strokeWidth={strokeWidth(0.85)}
            x={bodyX + bodyWidth * 0.18}
            y={centerY}
          />
          <Rect
            cornerRadius={1}
            fill="rgba(255,255,255,0.04)"
            height={bodyHeight * 0.2}
            stroke={stroke}
            strokeWidth={strokeWidth(0.65)}
            width={bodyWidth * 0.28}
            x={bodyX + bodyWidth * 0.46}
            y={centerY - bodyHeight * 0.1}
          />
          <Line
            lineCap="round"
            points={[boundsMm.x + inset, centerY, bodyX, centerY]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.95)}
          />
        </>
      )
    }
    case 'beam-dump': {
      const bdW = Math.max(12, width * 0.46)
      const bdH = Math.max(12, height * 0.46)
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
          <Circle
            fill="rgba(0,0,0,0.12)"
            radius={Math.max(1.9, bdH * 0.11)}
            stroke={stroke}
            strokeWidth={strokeWidth(0.65)}
            x={bdX + bdW * 0.24}
            y={centerY}
          />
          {[0.46, 0.66].map((f) => (
            <Line
              key={f}
              lineCap="round"
              points={[
                bdX + bdW * 0.32,
                bdY + bdH * f,
                bdX + bdW * 0.72,
                centerY,
                bdX + bdW * 0.32,
                bdY + bdH * (1 - (f - 0.46)),
              ]}
              opacity={0.7}
              stroke={stroke}
              strokeWidth={strokeWidth(0.7)}
            />
          ))}
        </>
      )
    }
    case 'support-clamp-fork':
      return (
        <>
          <Line
            lineCap="round"
            points={[centerX - width * 0.22, centerY - height * 0.16, centerX - width * 0.22, centerY + height * 0.18]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.2)}
          />
          <Line
            lineCap="round"
            points={[centerX + width * 0.22, centerY - height * 0.16, centerX + width * 0.22, centerY + height * 0.18]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.2)}
          />
          <Line
            lineCap="round"
            points={[centerX - width * 0.22, centerY + height * 0.18, centerX + width * 0.22, centerY + height * 0.18]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.2)}
          />
        </>
      )
    case 'support-mounting-base':
      return (
        <>
          <Rect
            cornerRadius={2}
            fill={fill ?? 'rgba(255,255,255,0.06)'}
            height={Math.max(12, height * 0.44)}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
            width={Math.max(12, width * 0.44)}
            x={centerX - Math.max(12, width * 0.44) / 2}
            y={centerY - Math.max(12, height * 0.44) / 2}
          />
          <Circle
            radius={Math.max(2.2, Math.min(width, height) * 0.1)}
            stroke={stroke}
            strokeWidth={strokeWidth(0.8)}
            x={centerX}
            y={centerY}
          />
        </>
      )
    case 'support-pedestal-post':
      return (
        <>
          <Circle
            radius={Math.max(3.2, Math.min(width, height) * 0.16)}
            stroke={stroke}
            strokeWidth={strokeWidth(0.9)}
            x={centerX}
            y={centerY + height * 0.12}
          />
          <Line
            lineCap="round"
            points={[centerX, centerY + height * 0.12, centerX, centerY - height * 0.22]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.15)}
          />
        </>
      )
    case 'support-post-holder':
      return (
        <>
          <Rect
            cornerRadius={2}
            fill={fill ?? 'rgba(255,255,255,0.06)'}
            height={Math.max(12, height * 0.42)}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
            width={Math.max(12, width * 0.38)}
            x={centerX - Math.max(12, width * 0.38) / 2}
            y={centerY - Math.max(12, height * 0.42) / 2}
          />
          <Line
            lineCap="round"
            points={[centerX, centerY - height * 0.18, centerX, centerY + height * 0.18]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.85)}
          />
        </>
      )
    case 'support-pedestal-assembly':
      return (
        <>
          <Rect
            cornerRadius={2}
            fill={fill ?? 'rgba(255,255,255,0.04)'}
            height={Math.max(10, height * 0.2)}
            stroke={stroke}
            strokeWidth={strokeWidth(0.85)}
            width={Math.max(16, width * 0.42)}
            x={centerX - Math.max(16, width * 0.42) / 2}
            y={centerY + height * 0.14}
          />
          <Line
            lineCap="round"
            points={[centerX, centerY + height * 0.12, centerX, centerY - height * 0.18]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.1)}
          />
          <Rect
            cornerRadius={1.6}
            fill="rgba(255,255,255,0.04)"
            height={Math.max(10, height * 0.24)}
            stroke={stroke}
            strokeWidth={strokeWidth(0.75)}
            width={Math.max(10, width * 0.2)}
            x={centerX - Math.max(10, width * 0.2) / 2}
            y={centerY - height * 0.02}
          />
        </>
      )
    case 'support-linear-slide':
      return (
        <>
          <Rect
            cornerRadius={2.8}
            fill={fill ?? 'rgba(255,255,255,0.05)'}
            height={Math.max(10, height * 0.32)}
            stroke={stroke}
            strokeWidth={strokeWidth(0.95)}
            width={Math.max(18, width * 0.66)}
            x={centerX - Math.max(18, width * 0.66) / 2}
            y={centerY - Math.max(10, height * 0.32) / 2}
          />
          <Rect
            cornerRadius={1.8}
            fill="rgba(255,255,255,0.04)"
            height={Math.max(8, height * 0.2)}
            stroke={stroke}
            strokeWidth={strokeWidth(0.75)}
            width={Math.max(10, width * 0.18)}
            x={centerX - Math.max(10, width * 0.18) / 2}
            y={centerY - Math.max(8, height * 0.2) / 2}
          />
        </>
      )
    case 'support-beam-block':
      return (
        <>
          <Rect
            cornerRadius={1.8}
            fill={fill ?? 'rgba(255,255,255,0.05)'}
            height={Math.max(12, height * 0.4)}
            stroke={stroke}
            strokeWidth={strokeWidth(0.95)}
            width={Math.max(12, width * 0.34)}
            x={centerX - Math.max(12, width * 0.34) / 2}
            y={centerY - Math.max(12, height * 0.4) / 2}
          />
          <Line
            lineCap="round"
            points={[centerX - width * 0.14, centerY - height * 0.14, centerX + width * 0.14, centerY + height * 0.14]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.8)}
          />
        </>
      )
    case 'support-periscope':
      return (
        <>
          <Circle
            radius={Math.max(2.8, Math.min(width, height) * 0.11)}
            stroke={stroke}
            strokeWidth={strokeWidth(0.85)}
            x={centerX}
            y={centerY - height * 0.24}
          />
          <Circle
            radius={Math.max(2.8, Math.min(width, height) * 0.11)}
            stroke={stroke}
            strokeWidth={strokeWidth(0.85)}
            x={centerX}
            y={centerY + height * 0.24}
          />
          <Line
            lineCap="round"
            points={[centerX, centerY - height * 0.12, centerX, centerY + height * 0.12]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.15)}
          />
        </>
      )
    case 'support-white-light-cell':
      return (
        <>
          <Rect
            cornerRadius={2}
            fill={fill ?? 'rgba(255,255,255,0.05)'}
            height={Math.max(12, height * 0.4)}
            stroke={stroke}
            strokeWidth={strokeWidth(0.95)}
            width={Math.max(12, width * 0.4)}
            x={centerX - Math.max(12, width * 0.4) / 2}
            y={centerY - Math.max(12, height * 0.4) / 2}
          />
          <Line
            lineCap="round"
            points={[centerX, centerY - height * 0.12, centerX, centerY + height * 0.12]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.8)}
          />
          <Line
            lineCap="round"
            points={[centerX - width * 0.12, centerY, centerX + width * 0.12, centerY]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.8)}
          />
        </>
      )
    case 'support-pump-seed-combiner':
      return (
        <>
          <Rect
            cornerRadius={2.4}
            fill={fill ?? 'rgba(255,255,255,0.05)'}
            height={Math.max(10, height * 0.28)}
            stroke={stroke}
            strokeWidth={strokeWidth(0.95)}
            width={Math.max(18, width * 0.52)}
            x={centerX - Math.max(18, width * 0.52) / 2}
            y={centerY - Math.max(10, height * 0.28) / 2}
          />
          <Line
            lineCap="round"
            points={[centerX, centerY - height * 0.26, centerX, centerY - height * 0.08]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.85)}
          />
          <Line
            lineCap="round"
            points={[centerX, centerY + height * 0.08, centerX, centerY + height * 0.26]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.85)}
          />
        </>
      )
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
  const normalizedGlyph = normalizeClassicGlyph(glyph)

  switch (normalizedGlyph) {
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
    case 'mirror-flip':
      return (
        <>
          <Line
            lineCap="round"
            points={[right, top + height * 0.08, left + width * 0.1, bottom - height * 0.1]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.55)}
          />
          <Circle
            radius={Math.max(2.2, Math.min(width, height) * 0.1)}
            stroke={stroke}
            strokeWidth={strokeWidth(0.85)}
            x={centerX - width * 0.14}
            y={centerY + height * 0.14}
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
    case 'folded-mirror-pair': {
      const baseWidth = Math.max(13, width * 0.62)
      const baseHeight = Math.max(9, height * 0.38)
      const baseX = centerX - baseWidth / 2
      const baseY = centerY - baseHeight / 2

      return (
        <>
          <Rect
            cornerRadius={2}
            fill={fill ?? 'rgba(255, 255, 255, 0.06)'}
            height={baseHeight}
            stroke={stroke}
            strokeWidth={strokeWidth(0.85)}
            width={baseWidth}
            x={baseX}
            y={baseY}
          />
          <Line
            lineCap="round"
            points={[baseX + baseWidth * 0.18, baseY + baseHeight * 0.82, centerX, centerY]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.35)}
          />
          <Line
            lineCap="round"
            points={[centerX, centerY, baseX + baseWidth * 0.82, baseY + baseHeight * 0.18]}
            stroke={stroke}
            strokeWidth={strokeWidth(1.35)}
          />
        </>
      )
    }
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
            points={[centerX - width * 0.08, centerY + height * 0.1, centerX + width * 0.22, centerY - height * 0.2]}
            stroke={stroke}
            strokeWidth={strokeWidth(0.8)}
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
            lineJoin="round"
            points={[
              centerX - width * 0.16,
              centerY + height * 0.08,
              centerX,
              centerY - height * 0.08,
              centerX + width * 0.16,
              centerY - height * 0.08,
            ]}
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
              centerX - width * 0.03,
              centerY + height * 0.14,
              centerX + width * 0.12,
              centerY - height * 0.01,
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
              centerX - width * 0.09,
              centerY - height * 0.13,
              centerX + width * 0.08,
              centerY,
              centerX - width * 0.09,
              centerY + height * 0.13,
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
            radius={Math.max(2.6, Math.min(width, height) * 0.13)}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
            x={right - Math.max(2.8, Math.min(width, height) * 0.18)}
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
          <Rect
            cornerRadius={1.6}
            fill={primaryFill}
            height={Math.max(10, height * 0.4)}
            stroke={stroke}
            strokeWidth={strokeWidth(1)}
            width={Math.max(8, width * 0.34)}
            x={centerX - width * 0.02}
            y={centerY - Math.max(10, height * 0.4) / 2}
          />
          <Circle
            radius={Math.max(1.9, Math.min(width, height) * 0.08)}
            stroke={stroke}
            strokeWidth={strokeWidth(0.8)}
            x={centerX + width * 0.04}
            y={centerY}
          />
          <Line
            lineCap="round"
            points={[left + width * 0.18, centerY, centerX - width * 0.08, centerY]}
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
          <Circle
            radius={Math.max(1.8, bdH * 0.12)}
            stroke={stroke}
            strokeWidth={strokeWidth(0.7)}
            x={bdX + bdW * 0.24}
            y={centerY}
          />
          {[0.28, 0.5, 0.72].map((fraction) => (
            <Line
              key={fraction}
              lineCap="round"
              points={[
                bdX + bdW * 0.38,
                bdY + bdH * fraction,
                bdX + bdW * 0.78,
                centerY,
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

import { Circle, Layer, Rect, Stage } from 'react-konva'
import { getBreadboardHoleAxesMm, getBreadboardHoleCounts, getCounterboreCentersMm } from '../domain/breadboard'
import type { BreadboardModel, BoundsMm, ComponentGlyph as ComponentGlyphType } from '../domain/types'
import { ComponentGlyph, type ComponentGlyphStyle } from '../canvas/ComponentGlyph'

const PREVIEW_WIDTH = 96
const PREVIEW_HEIGHT = 64
const PREVIEW_PADDING_X = 8
const PREVIEW_PADDING_Y = 8

const componentPreviewBounds: BoundsMm = {
  x: 12,
  y: 9,
  width: 72,
  height: 46,
}

type LibraryGlyphPreviewKind =
  | {
      kind: 'breadboard'
      breadboard: BreadboardModel
    }
  | {
      kind: 'component'
      glyph: ComponentGlyphType
      isConvex?: boolean
    }

type LibraryGlyphPreviewProps = LibraryGlyphPreviewKind & {
  className?: string
  fill?: string
  stroke?: string
  style?: ComponentGlyphStyle
}

export function LibraryGlyphPreview({
  className,
  fill,
  stroke = '#26313a',
  style = 'clean',
  ...rest
}: LibraryGlyphPreviewProps) {
  return (
    <Stage className={className} height={PREVIEW_HEIGHT} width={PREVIEW_WIDTH}>
      <Layer listening={false}>
        {rest.kind === 'breadboard' ? (
          <BreadboardGlyphPreview
            breadboard={rest.breadboard}
            fill={fill}
            stroke={stroke}
            style={style}
          />
        ) : (
          <ComponentGlyph
            boundsMm={componentPreviewBounds}
            fill={fill ?? 'rgba(255, 255, 255, 0.08)'}
            glyph={rest.glyph}
            isConvex={rest.isConvex}
            stroke={stroke}
            strokeScale={0.84}
            style={style}
          />
        )}
      </Layer>
    </Stage>
  )
}

function BreadboardGlyphPreview({
  breadboard,
  fill,
  stroke,
  style,
}: {
  breadboard: BreadboardModel
  fill?: string
  stroke: string
  style: ComponentGlyphStyle
}) {
  const boardWidth = PREVIEW_WIDTH - PREVIEW_PADDING_X * 2
  const boardHeight = PREVIEW_HEIGHT - PREVIEW_PADDING_Y * 2
  const scale = Math.min(boardWidth / breadboard.widthMm, boardHeight / breadboard.heightMm)
  const renderedWidth = breadboard.widthMm * scale
  const renderedHeight = breadboard.heightMm * scale
  const originX = (PREVIEW_WIDTH - renderedWidth) / 2
  const originY = (PREVIEW_HEIGHT - renderedHeight) / 2
  const holeAxesMm = getBreadboardHoleAxesMm(breadboard)
  const holeCounts = getBreadboardHoleCounts(breadboard)
  const holeStepX = Math.max(1, Math.ceil(holeCounts.xCount / 12))
  const holeStepY = Math.max(1, Math.ceil(holeCounts.yCount / 8))
  const holeRadius = style === 'classic' ? 1.15 : 0.95
  const boardFill =
    fill ?? (breadboard.finish === 'black-anodized' ? '#1a2027' : 'rgba(218, 224, 229, 0.96)')
  const boardStroke = stroke || (breadboard.finish === 'black-anodized' ? '#73808a' : '#7d8790')
  const holeFill = breadboard.finish === 'black-anodized' ? '#0f1418' : '#b5bec6'
  const holeStroke = style === 'classic' ? boardStroke : 'rgba(0, 0, 0, 0)'

  return (
    <>
      <Rect
        cornerRadius={4}
        fill={boardFill}
        height={renderedHeight}
        stroke={boardStroke}
        strokeWidth={style === 'classic' ? 1.2 : 0.95}
        width={renderedWidth}
        x={originX}
        y={originY}
      />
      {holeAxesMm.xPositionsMm.filter((_, index) => index % holeStepX === 0).map((xMm) =>
        holeAxesMm.yPositionsMm.filter((_, index) => index % holeStepY === 0).map((yMm) => (
          <Circle
            fill={holeFill}
            key={`${xMm}-${yMm}`}
            radius={holeRadius}
            stroke={holeStroke}
            strokeWidth={0.35}
            x={originX + xMm * scale}
            y={originY + yMm * scale}
          />
        )),
      )}
      {getCounterboreCentersMm(breadboard).map((centerMm) => (
        <Circle
          fill={breadboard.finish === 'black-anodized' ? '#0e1317' : '#a8b2ba'}
          key={`${centerMm.x}-${centerMm.y}`}
          radius={2.35}
          stroke={boardStroke}
          strokeWidth={0.5}
          x={originX + centerMm.x * scale}
          y={originY + centerMm.y * scale}
        />
      ))}
    </>
  )
}

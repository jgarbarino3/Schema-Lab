import { Circle, Line, Rect } from 'react-konva'
import type { BoundsMm } from '../domain/types'

export interface RealisticPalette {
  accentFill: string
  apertureFill: string
  bodyBase: string
  bodyHighlight: string
  bodyShadow: string
  detailFill: string
  detailStroke: string
  fastenerFill: string
  glassHighlight: string
  glassTint: string
  mountBase: string
  mountHighlight: string
  mountShadow: string
}

interface KnurledKnobProps {
  centerX: number
  centerY: number
  palette: RealisticPalette
  radius: number
  tickCount?: number
}

export function KnurledKnob({
  centerX,
  centerY,
  palette,
  radius,
  tickCount = 18,
}: KnurledKnobProps) {
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const angle = (i * 2 * Math.PI) / tickCount
    const innerR = radius * 0.76
    const outerR = radius * 0.97
    return [
      centerX + Math.cos(angle) * innerR,
      centerY + Math.sin(angle) * innerR,
      centerX + Math.cos(angle) * outerR,
      centerY + Math.sin(angle) * outerR,
    ]
  })

  return (
    <>
      <Circle
        fill="rgba(0, 0, 0, 0.26)"
        radius={radius * 1.05}
        x={centerX + radius * 0.06}
        y={centerY + radius * 0.08}
      />
      <Circle
        fill={palette.detailFill}
        radius={radius}
        stroke={palette.detailStroke}
        strokeWidth={0.5}
        x={centerX}
        y={centerY}
      />
      {ticks.map((points, i) => (
        <Line
          key={i}
          lineCap="butt"
          opacity={0.7}
          points={points}
          stroke={palette.fastenerFill}
          strokeWidth={Math.max(0.28, radius * 0.07)}
        />
      ))}
      <Circle
        fill={palette.bodyShadow}
        radius={radius * 0.28}
        stroke={palette.detailStroke}
        strokeWidth={0.28}
        x={centerX}
        y={centerY}
      />
      <Line
        lineCap="round"
        opacity={0.55}
        points={[
          centerX - radius * 0.18,
          centerY,
          centerX + radius * 0.18,
          centerY,
        ]}
        stroke={palette.fastenerFill}
        strokeWidth={0.38}
      />
      <Circle
        fill="rgba(255, 255, 255, 0.15)"
        radius={radius * 0.46}
        x={centerX - radius * 0.2}
        y={centerY - radius * 0.22}
      />
    </>
  )
}

function getKM100Geometry(mountRadius: number) {
  const bodyWidth = Math.max(16, mountRadius * 1.32)
  const bodyHeight = Math.max(18, mountRadius * 1.52)
  const bodyCornerR = Math.max(3.6, mountRadius * 0.2)
  const shoulderRadius = Math.max(6.8, mountRadius * 0.52)
  const knobRadius = Math.max(2.6, mountRadius * 0.2)
  const knobDistance = mountRadius * 0.88 + knobRadius
  const shaftWidth = Math.max(2.2, mountRadius * 0.16)
  const springBallRadius = Math.max(1.4, mountRadius * 0.1)
  const postWidth = Math.max(5, mountRadius * 0.34)
  const postHeight = Math.max(4, mountRadius * 0.26)

  return {
    bodyCornerR,
    bodyHeight,
    bodyWidth,
    knobDistance,
    knobRadius,
    postHeight,
    postWidth,
    shaftWidth,
    shoulderRadius,
    springBallRadius,
  }
}

function renderKM100Body(
  centerX: number,
  centerY: number,
  mountRadius: number,
  palette: RealisticPalette,
  stroke: string,
) {
  const g = getKM100Geometry(mountRadius)
  const bodyTop = centerY - g.bodyHeight * 0.52
  const bodyLeft = centerX - g.bodyWidth / 2
  const springY = centerY - mountRadius * 0.86 - g.springBallRadius
  const postTop = centerY + g.bodyHeight * 0.48 - g.postHeight * 0.3
  const adjusters = [150, 30]

  return (
    <>
      <Rect
        cornerRadius={Math.max(1.6, g.postWidth * 0.16)}
        fill={palette.mountShadow}
        height={g.postHeight}
        stroke={palette.detailStroke}
        strokeWidth={0.4}
        width={g.postWidth}
        x={centerX - g.postWidth / 2}
        y={postTop}
      />
      {adjusters.map((angleDeg) => {
        const rad = (angleDeg * Math.PI) / 180
        const dx = Math.cos(rad)
        const dy = Math.sin(rad)
        return (
          <Line
            key={`shaft-${angleDeg}`}
            lineCap="round"
            opacity={0.88}
            points={[
              centerX + dx * (g.shoulderRadius + 1),
              centerY + dy * (g.shoulderRadius + 1),
              centerX + dx * (g.knobDistance - g.knobRadius * 0.4),
              centerY + dy * (g.knobDistance - g.knobRadius * 0.4),
            ]}
            stroke={palette.bodyShadow}
            strokeWidth={g.shaftWidth}
          />
        )
      })}
      <Line
        lineCap="round"
        opacity={0.82}
        points={[
          centerX,
          centerY - g.shoulderRadius - 0.8,
          centerX,
          springY + g.springBallRadius * 0.5,
        ]}
        stroke={palette.bodyShadow}
        strokeWidth={g.shaftWidth * 0.72}
      />
      <Rect
        cornerRadius={g.bodyCornerR}
        fill={palette.mountBase}
        height={g.bodyHeight}
        stroke={stroke}
        strokeWidth={0.95}
        width={g.bodyWidth}
        x={bodyLeft}
        y={bodyTop}
      />
      <Rect
        cornerRadius={Math.max(2.4, g.bodyCornerR - 1)}
        fill={palette.mountHighlight}
        height={g.bodyHeight * 0.3}
        opacity={0.3}
        width={g.bodyWidth * 0.76}
        x={centerX - g.bodyWidth * 0.38}
        y={bodyTop + g.bodyHeight * 0.06}
      />
      <Rect
        cornerRadius={Math.max(2, g.bodyCornerR - 1)}
        fill={palette.mountShadow}
        height={g.bodyHeight * 0.18}
        opacity={0.34}
        width={g.bodyWidth * 0.7}
        x={centerX - g.bodyWidth * 0.35}
        y={bodyTop + g.bodyHeight * 0.76}
      />
      <Line
        lineCap="round"
        opacity={0.18}
        points={[
          bodyLeft + g.bodyCornerR,
          bodyTop + g.bodyHeight * 0.42,
          bodyLeft + g.bodyCornerR,
          bodyTop + g.bodyHeight - g.bodyCornerR,
        ]}
        stroke="rgba(255, 255, 255, 0.4)"
        strokeWidth={0.3}
      />
      <Line
        lineCap="round"
        opacity={0.18}
        points={[
          bodyLeft + g.bodyWidth - g.bodyCornerR,
          bodyTop + g.bodyHeight * 0.42,
          bodyLeft + g.bodyWidth - g.bodyCornerR,
          bodyTop + g.bodyHeight - g.bodyCornerR,
        ]}
        stroke="rgba(255, 255, 255, 0.4)"
        strokeWidth={0.3}
      />
      <Circle
        fill={palette.mountShadow}
        radius={g.shoulderRadius}
        stroke="rgba(220, 230, 238, 0.18)"
        strokeWidth={0.48}
        x={centerX}
        y={centerY}
      />
      <Circle
        fill={palette.fastenerFill}
        radius={g.springBallRadius}
        stroke={palette.detailStroke}
        strokeWidth={0.35}
        x={centerX}
        y={springY}
      />
      <Circle
        fill="rgba(255, 255, 255, 0.26)"
        radius={g.springBallRadius * 0.36}
        x={centerX - g.springBallRadius * 0.18}
        y={springY - g.springBallRadius * 0.2}
      />
      {adjusters.map((angleDeg) => {
        const rad = (angleDeg * Math.PI) / 180
        const knobX = centerX + Math.cos(rad) * g.knobDistance
        const knobY = centerY + Math.sin(rad) * g.knobDistance
        return (
          <KnurledKnob
            centerX={knobX}
            centerY={knobY}
            key={`knob-${angleDeg}`}
            palette={palette}
            radius={g.knobRadius}
            tickCount={Math.max(12, Math.round(g.knobRadius * 5.5))}
          />
        )
      })}
    </>
  )
}

interface KinematicMountTopProps {
  boundsMm: BoundsMm
  centerX: number
  centerY: number
  palette: RealisticPalette
  stroke: string
}

export function KinematicMountTop({
  boundsMm,
  palette,
  stroke,
}: KinematicMountTopProps) {
  const cx = boundsMm.x + boundsMm.width / 2
  const cy = boundsMm.y + boundsMm.height / 2
  const mountRadius = Math.min(boundsMm.width, boundsMm.height) / 2

  return renderKM100Body(cx, cy, mountRadius, palette, stroke)
}

interface MirrorMountTopViewProps {
  boundsMm: BoundsMm
  palette: RealisticPalette
  stroke: string
}

export function MirrorMountTopView({
  boundsMm,
  palette,
  stroke,
}: MirrorMountTopViewProps) {
  const centerX = boundsMm.x + boundsMm.width / 2
  const centerY = boundsMm.y + boundsMm.height / 2
  const mountRadius = Math.min(boundsMm.width, boundsMm.height) / 2
  const g = getKM100Geometry(mountRadius)
  const retainerRadius = Math.max(5.4, g.shoulderRadius * 0.82)
  const substrateRadius = Math.max(4.2, retainerRadius * 0.82)

  return (
    <>
      {renderKM100Body(centerX, centerY, mountRadius, palette, stroke)}
      <Circle
        fill={palette.bodyBase}
        radius={retainerRadius}
        stroke={palette.detailStroke}
        strokeWidth={0.55}
        x={centerX}
        y={centerY}
      />
      <Circle
        fill="rgba(255, 255, 255, 0.08)"
        radius={retainerRadius * 0.9}
        x={centerX - retainerRadius * 0.08}
        y={centerY - retainerRadius * 0.08}
      />
      <Circle
        fill={palette.mountShadow}
        radius={Math.max(0.55, retainerRadius * 0.07)}
        x={centerX - retainerRadius * 0.86}
        y={centerY}
      />
      <Circle
        fill={palette.mountShadow}
        radius={Math.max(0.55, retainerRadius * 0.07)}
        x={centerX + retainerRadius * 0.86}
        y={centerY}
      />
      <Circle
        fill={palette.glassTint}
        opacity={0.2}
        radius={substrateRadius}
        stroke={palette.detailStroke}
        strokeWidth={0.32}
        x={centerX}
        y={centerY}
      />
      <Circle
        fill="rgba(255, 255, 255, 0.05)"
        radius={substrateRadius * 0.88}
        x={centerX - substrateRadius * 0.06}
        y={centerY - substrateRadius * 0.06}
      />
    </>
  )
}

interface MirrorOpticFaceProps {
  centerX: number
  centerY: number
  palette: RealisticPalette
  radius: number
  stroke: string
}

export function MirrorOpticFace({
  centerX,
  centerY,
  palette,
  radius,
  stroke,
}: MirrorOpticFaceProps) {
  const retainerRadius = radius + 1.4
  const substrateRadius = Math.max(4, radius * 0.82)

  return (
    <>
      <Circle
        fill={palette.bodyShadow}
        radius={retainerRadius}
        stroke={palette.detailStroke}
        strokeWidth={0.5}
        x={centerX}
        y={centerY}
      />
      <Circle
        fill={palette.bodyBase}
        radius={retainerRadius * 0.88}
        stroke={palette.detailStroke}
        strokeWidth={0.4}
        x={centerX}
        y={centerY}
      />
      <Circle
        fill="rgba(255, 255, 255, 0.08)"
        radius={retainerRadius * 0.76}
        x={centerX - retainerRadius * 0.08}
        y={centerY - retainerRadius * 0.08}
      />
      <Circle
        fill={palette.glassTint}
        opacity={0.2}
        radius={substrateRadius}
        stroke={stroke}
        strokeWidth={0.65}
        x={centerX}
        y={centerY}
      />
      <Circle
        fill="rgba(255, 255, 255, 0.05)"
        radius={substrateRadius * 0.86}
        x={centerX - substrateRadius * 0.06}
        y={centerY - substrateRadius * 0.06}
      />
    </>
  )
}

interface GlassDiscProps {
  centerX: number
  centerY: number
  palette: RealisticPalette
  radius: number
  stroke: string
  variant?: 'mirror' | 'beamsplitter'
}

export function GlassDisc({
  centerX,
  centerY,
  palette,
  radius,
  stroke,
  variant = 'mirror',
}: GlassDiscProps) {
  const lineDash = variant === 'beamsplitter' ? [2.2, 2.2] : undefined
  const lineStrokeWidth = variant === 'beamsplitter' ? 1.05 : 1.15

  return (
    <>
      <Circle
        fill={palette.glassTint}
        opacity={variant === 'beamsplitter' ? 0.42 : 0.94}
        radius={radius}
        stroke={stroke}
        strokeWidth={0.95}
        x={centerX}
        y={centerY}
      />
      <Circle
        fill={palette.glassHighlight}
        opacity={variant === 'beamsplitter' ? 0.22 : 0.32}
        radius={radius * 0.76}
        x={centerX - radius * 0.2}
        y={centerY - radius * 0.22}
      />
      <Circle
        fill="rgba(8, 14, 18, 0.18)"
        radius={radius * 0.92}
        x={centerX + radius * 0.08}
        y={centerY + radius * 0.08}
      />
      <Line
        dash={lineDash}
        lineCap="round"
        points={[
          centerX + radius * 0.72,
          centerY - radius * 0.72,
          centerX - radius * 0.72,
          centerY + radius * 0.72,
        ]}
        stroke={palette.detailStroke}
        strokeWidth={lineStrokeWidth}
      />
      <Line
        lineCap="round"
        opacity={0.7}
        points={[
          centerX - radius * 0.4,
          centerY - radius * 0.64,
          centerX + radius * 0.05,
          centerY - radius * 0.18,
        ]}
        stroke="rgba(255, 255, 255, 0.55)"
        strokeWidth={0.7}
      />
    </>
  )
}

interface BeamsplitterPlateProps {
  bodyBoundsMm: BoundsMm
  centerX: number
  centerY: number
  palette: RealisticPalette
  stroke: string
}

export function BeamsplitterPlate({
  bodyBoundsMm,
  centerX,
  centerY,
  palette,
  stroke,
}: BeamsplitterPlateProps) {
  const cellRadius = Math.max(5.6, Math.min(bodyBoundsMm.width, bodyBoundsMm.height) * 0.42)
  const plateLen = cellRadius * 1.26
  const plateThick = Math.max(1.6, plateLen * 0.12)
  const lugLen = Math.max(3.2, cellRadius * 0.36)
  const lugWidth = Math.max(2.4, cellRadius * 0.22)
  const screwR = Math.max(0.8, cellRadius * 0.08)
  const cos45 = 0.7071
  const sin45 = 0.7071

  return (
    <>
      <Circle
        fill={palette.bodyBase}
        radius={cellRadius}
        stroke={palette.detailStroke}
        strokeWidth={0.5}
        x={centerX}
        y={centerY}
      />
      <Circle
        fill="rgba(255, 255, 255, 0.06)"
        radius={cellRadius * 0.88}
        x={centerX - cellRadius * 0.06}
        y={centerY - cellRadius * 0.06}
      />
      <Line
        closed
        fill={palette.mountBase}
        opacity={0.9}
        points={[
          centerX - cos45 * cellRadius * 0.72 - sin45 * lugWidth * 0.5,
          centerY + sin45 * cellRadius * 0.72 - cos45 * lugWidth * 0.5,
          centerX - cos45 * (cellRadius * 0.72 + lugLen) - sin45 * lugWidth * 0.5,
          centerY + sin45 * (cellRadius * 0.72 + lugLen) - cos45 * lugWidth * 0.5,
          centerX - cos45 * (cellRadius * 0.72 + lugLen) + sin45 * lugWidth * 0.5,
          centerY + sin45 * (cellRadius * 0.72 + lugLen) + cos45 * lugWidth * 0.5,
          centerX - cos45 * cellRadius * 0.72 + sin45 * lugWidth * 0.5,
          centerY + sin45 * cellRadius * 0.72 + cos45 * lugWidth * 0.5,
        ]}
        stroke={stroke}
        strokeWidth={0.5}
      />
      <Rect
        cornerRadius={plateThick * 0.3}
        fill={palette.glassTint}
        height={plateLen}
        opacity={0.38}
        rotation={-45}
        stroke={stroke}
        strokeWidth={0.7}
        width={plateThick}
        x={centerX + cos45 * plateLen * 0.5 * 0 - sin45 * (-plateLen * 0.5) * 0 - plateThick / 2 * cos45}
        y={centerY - plateLen / 2 * cos45 - plateThick / 2 * sin45}
      />
      <Line
        dash={[1.8, 1.8]}
        lineCap="round"
        opacity={0.85}
        points={[
          centerX + cos45 * plateLen * 0.42,
          centerY - sin45 * plateLen * 0.42,
          centerX - cos45 * plateLen * 0.42,
          centerY + sin45 * plateLen * 0.42,
        ]}
        stroke={palette.detailStroke}
        strokeWidth={0.75}
      />
      <Rect
        cornerRadius={plateThick * 0.2}
        fill={palette.glassHighlight}
        height={plateLen * 0.38}
        opacity={0.2}
        rotation={-45}
        width={Math.max(0.8, plateThick * 0.4)}
        x={centerX - plateThick * 0.12 * cos45 + plateLen * 0.08 * sin45}
        y={centerY - plateLen * 0.3 * cos45 - plateThick * 0.12 * sin45}
      />
      <Circle
        fill={palette.fastenerFill}
        radius={screwR}
        stroke={palette.detailStroke}
        strokeWidth={0.28}
        x={centerX - cos45 * cellRadius * 0.52}
        y={centerY + sin45 * cellRadius * 0.52}
      />
      <Circle
        fill={palette.fastenerFill}
        radius={screwR}
        stroke={palette.detailStroke}
        strokeWidth={0.28}
        x={centerX + cos45 * cellRadius * 0.52}
        y={centerY - sin45 * cellRadius * 0.52}
      />
    </>
  )
}

interface LensGlassProps {
  centerX: number
  centerY: number
  palette: RealisticPalette
  radius: number
  stroke: string
}

export function LensGlass({
  centerX,
  centerY,
  palette,
  radius,
  stroke,
}: LensGlassProps) {
  const tubeRadius = radius
  const threadRadii = [0.92, 0.84, 0.76]
  const lensRadius = Math.max(3.4, tubeRadius * 0.68)

  return (
    <>
      <Circle
        fill={palette.bodyShadow}
        radius={tubeRadius + 1.2}
        stroke={palette.detailStroke}
        strokeWidth={0.55}
        x={centerX}
        y={centerY}
      />
      <Circle
        fill={palette.bodyBase}
        radius={tubeRadius}
        stroke="rgba(220, 230, 238, 0.22)"
        strokeWidth={0.4}
        x={centerX}
        y={centerY}
      />
      <Circle
        fill="rgba(255, 255, 255, 0.08)"
        radius={tubeRadius * 0.88}
        x={centerX - tubeRadius * 0.08}
        y={centerY - tubeRadius * 0.08}
      />
      {threadRadii.map((fraction, i) => (
        <Circle
          key={i}
          opacity={0.16 - i * 0.03}
          radius={tubeRadius * fraction}
          stroke={palette.detailStroke}
          strokeWidth={0.25}
          x={centerX}
          y={centerY}
        />
      ))}
      <Circle
        fill={palette.mountShadow}
        radius={lensRadius + 0.8}
        stroke={palette.detailStroke}
        strokeWidth={0.35}
        x={centerX}
        y={centerY}
      />
      <Circle
        fill={palette.glassTint}
        opacity={0.42}
        radius={lensRadius}
        stroke={stroke}
        strokeWidth={0.7}
        x={centerX}
        y={centerY}
      />
      <Circle
        fill={palette.glassHighlight}
        opacity={0.22}
        radius={lensRadius * 0.56}
        x={centerX - lensRadius * 0.14}
        y={centerY - lensRadius * 0.16}
      />
      <Circle
        fill="rgba(255, 255, 255, 0.06)"
        radius={lensRadius * 0.32}
        x={centerX - lensRadius * 0.08}
        y={centerY - lensRadius * 0.1}
      />
    </>
  )
}

interface GlassPlateProps {
  centerX: number
  centerY: number
  palette: RealisticPalette
  size: number
  stroke: string
}

export function GlassPlate({
  centerX,
  centerY,
  palette,
  size,
  stroke,
}: GlassPlateProps) {
  return (
    <>
      <Rect
        fill={palette.glassTint}
        height={size}
        opacity={0.34}
        rotation={45}
        stroke={stroke}
        strokeWidth={0.85}
        width={size}
        x={centerX - size / 2}
        y={centerY - size / 2}
      />
      <Rect
        fill={palette.glassHighlight}
        height={size * 0.56}
        opacity={0.22}
        rotation={45}
        width={size * 0.3}
        x={centerX - size * 0.22}
        y={centerY - size * 0.42}
      />
      <Line
        lineCap="round"
        points={[
          centerX - size * 0.45,
          centerY + size * 0.34,
          centerX + size * 0.42,
          centerY - size * 0.34,
        ]}
        stroke={palette.detailStroke}
        strokeWidth={1}
      />
    </>
  )
}

interface FilterAssemblyProps {
  bodyBoundsMm: BoundsMm
  centerX: number
  centerY: number
  palette: RealisticPalette
  stroke: string
}

export function FilterAssembly({
  bodyBoundsMm,
  centerX,
  centerY,
  palette,
  stroke,
}: FilterAssemblyProps) {
  const ringRadius = Math.max(5.2, Math.min(bodyBoundsMm.width, bodyBoundsMm.height) * 0.44)
  const plateWidth = Math.max(7.4, bodyBoundsMm.width * 0.3)
  const plateHeight = Math.max(11, bodyBoundsMm.height * 0.86)

  return (
    <>
      <Circle
        fill={palette.bodyShadow}
        radius={ringRadius + 1.5}
        stroke={palette.detailStroke}
        strokeWidth={0.6}
        x={centerX}
        y={centerY}
      />
      <Circle
        fill={palette.mountHighlight}
        opacity={0.16}
        radius={ringRadius}
        x={centerX - ringRadius * 0.16}
        y={centerY - ringRadius * 0.16}
      />
      <Rect
        cornerRadius={1.4}
        fill={palette.glassTint}
        height={plateHeight}
        opacity={0.42}
        stroke={stroke}
        strokeWidth={0.82}
        width={plateWidth}
        x={centerX - plateWidth / 2}
        y={centerY - plateHeight / 2}
      />
      <Rect
        cornerRadius={1}
        fill={palette.glassHighlight}
        height={plateHeight * 0.48}
        opacity={0.24}
        width={Math.max(1.8, plateWidth * 0.34)}
        x={centerX - plateWidth * 0.12}
        y={centerY - plateHeight * 0.38}
      />
      <Line
        lineCap="round"
        points={[
          centerX - plateWidth * 0.92,
          centerY + plateHeight * 0.36,
          centerX + plateWidth * 0.92,
          centerY - plateHeight * 0.36,
        ]}
        stroke={palette.detailStroke}
        strokeWidth={0.95}
      />
    </>
  )
}

interface BeveledHousingProps {
  boundsMm: BoundsMm
  cornerRadius: number
  endCapWidthMm?: number
  palette: RealisticPalette
  stroke: string
  topPlateHeightMm?: number
}

export function BeveledHousing({
  boundsMm,
  cornerRadius,
  endCapWidthMm,
  palette,
  stroke,
  topPlateHeightMm,
}: BeveledHousingProps) {
  const topPlateHeight = topPlateHeightMm ?? Math.max(8, boundsMm.height * 0.18)

  return (
    <>
      <Rect
        cornerRadius={cornerRadius}
        fill={palette.bodyBase}
        height={boundsMm.height}
        stroke={stroke}
        strokeWidth={1}
        width={boundsMm.width}
        x={boundsMm.x}
        y={boundsMm.y}
      />
      <Rect
        cornerRadius={Math.max(2, cornerRadius - 1)}
        fill={palette.bodyHighlight}
        height={topPlateHeight}
        opacity={0.35}
        stroke="rgba(255, 255, 255, 0.2)"
        strokeWidth={0.35}
        width={boundsMm.width * 0.72}
        x={boundsMm.x + boundsMm.width * 0.1}
        y={boundsMm.y + boundsMm.height * 0.08}
      />
      <Rect
        cornerRadius={Math.max(2, cornerRadius - 1)}
        fill={palette.bodyShadow}
        height={boundsMm.height * 0.74}
        opacity={0.75}
        stroke="rgba(222, 231, 235, 0.14)"
        strokeWidth={0.3}
        width={Math.max(12, endCapWidthMm ?? boundsMm.width * 0.14)}
        x={
          endCapWidthMm
            ? boundsMm.x + boundsMm.width - endCapWidthMm - 3
            : boundsMm.x + boundsMm.width - Math.max(12, boundsMm.width * 0.14) - 3
        }
        y={boundsMm.y + boundsMm.height * 0.12}
      />
    </>
  )
}

interface SensorPadProps {
  boundsMm: BoundsMm
  palette: RealisticPalette
  stroke: string
}

export function SensorPad({ boundsMm, palette, stroke }: SensorPadProps) {
  const sensorRadius = Math.max(3.8, Math.min(boundsMm.width, boundsMm.height) * 0.18)
  const centerX = boundsMm.x + boundsMm.width / 2
  const centerY = boundsMm.y + boundsMm.height / 2

  return (
    <>
      <Rect
        cornerRadius={Math.max(2, Math.min(boundsMm.width, boundsMm.height) * 0.12)}
        fill={palette.bodyBase}
        height={boundsMm.height}
        stroke={stroke}
        strokeWidth={0.95}
        width={boundsMm.width}
        x={boundsMm.x}
        y={boundsMm.y}
      />
      <Rect
        cornerRadius={Math.max(1.6, Math.min(boundsMm.width, boundsMm.height) * 0.08)}
        fill={palette.bodyHighlight}
        height={boundsMm.height * 0.28}
        opacity={0.34}
        width={boundsMm.width * 0.62}
        x={boundsMm.x + boundsMm.width * 0.12}
        y={boundsMm.y + boundsMm.height * 0.12}
      />
      <Circle
        fill={palette.detailFill}
        radius={sensorRadius}
        stroke={palette.detailStroke}
        strokeWidth={0.75}
        x={centerX}
        y={centerY}
      />
      <Circle
        fill={palette.apertureFill}
        radius={Math.max(1.4, sensorRadius * 0.38)}
        x={centerX}
        y={centerY}
      />
    </>
  )
}

interface OutputApertureProps {
  radius: number
  x: number
  y: number
  palette: RealisticPalette
}

export function OutputAperture({ radius, x, y, palette }: OutputApertureProps) {
  return (
    <>
      <Circle
        fill={palette.detailFill}
        radius={radius}
        stroke={palette.detailStroke}
        strokeWidth={0.4}
        x={x}
        y={y}
      />
      <Circle
        fill={palette.apertureFill}
        radius={Math.max(0.8, radius * 0.45)}
        x={x}
        y={y}
      />
    </>
  )
}

interface IrisHardwareProps {
  bodyBoundsMm: BoundsMm
  mountBoundsMm: BoundsMm
  apertureRadius: number
  palette: RealisticPalette
  showMount: boolean
  stroke: string
}

export function IrisHardware({
  bodyBoundsMm,
  mountBoundsMm,
  apertureRadius,
  palette,
  showMount,
  stroke,
}: IrisHardwareProps) {
  const centerX = bodyBoundsMm.x + bodyBoundsMm.width / 2
  const centerY = bodyBoundsMm.y + bodyBoundsMm.height / 2
  const bodyRadius = Math.max(6.8, Math.min(bodyBoundsMm.width, bodyBoundsMm.height) * 0.54)
  const housingRadius = showMount
    ? Math.max(bodyRadius + 1.8, Math.min(mountBoundsMm.width, mountBoundsMm.height) * 0.33)
    : bodyRadius
  const bladeOuterRadius = Math.max(apertureRadius + 2.8, bodyRadius * 0.72)
  const leverLength = Math.max(9, mountBoundsMm.width * 0.36)
  const leverWidth = Math.max(2.4, mountBoundsMm.height * 0.09)
  const pinWidth = Math.max(3.2, leverWidth * 1.6)
  const pinHeight = Math.max(2.2, leverWidth * 1.1)
  const postWidth = Math.max(4.2, housingRadius * 0.42)
  const postHeight = Math.max(3.6, housingRadius * 0.3)
  const bladeAngles = [-14, 52, 118, 184, 250, 316]
  const leverAngleDeg = -28
  const leverRad = (leverAngleDeg * Math.PI) / 180

  const leverStartX = centerX + Math.cos(leverRad) * (housingRadius * 0.48)
  const leverStartY = centerY + Math.sin(leverRad) * (housingRadius * 0.48)
  const leverEndX = centerX + Math.cos(leverRad) * (housingRadius + leverLength * 0.72)
  const leverEndY = centerY + Math.sin(leverRad) * (housingRadius + leverLength * 0.72)
  const pinX = leverEndX + Math.cos(leverRad) * (pinWidth * 0.3)
  const pinY = leverEndY + Math.sin(leverRad) * (pinWidth * 0.3)

  const trackArcPoints: number[] = []
  const trackArcSteps = 12
  const trackArcStartAngle = leverAngleDeg - 18
  const trackArcEndAngle = leverAngleDeg + 22

  for (let i = 0; i <= trackArcSteps; i++) {
    const a = ((trackArcStartAngle + (trackArcEndAngle - trackArcStartAngle) * (i / trackArcSteps)) * Math.PI) / 180
    trackArcPoints.push(
      centerX + Math.cos(a) * (housingRadius * 0.82),
      centerY + Math.sin(a) * (housingRadius * 0.82),
    )
  }

  return (
    <>
      <Rect
        cornerRadius={Math.max(1.2, postWidth * 0.14)}
        fill={palette.mountShadow}
        height={postHeight}
        stroke={palette.detailStroke}
        strokeWidth={0.35}
        width={postWidth}
        x={centerX - postWidth / 2}
        y={centerY + housingRadius * 0.86}
      />
      {showMount ? (
        <>
          <Circle
            fill={palette.mountBase}
            opacity={0.28}
            radius={housingRadius + 1.2}
            x={centerX}
            y={centerY}
          />
        </>
      ) : null}
      <Circle
        fill={palette.bodyBase}
        radius={housingRadius}
        stroke={stroke}
        strokeWidth={0.85}
        x={centerX}
        y={centerY}
      />
      <Circle
        fill="rgba(255, 255, 255, 0.06)"
        radius={housingRadius * 0.88}
        x={centerX - housingRadius * 0.08}
        y={centerY - housingRadius * 0.1}
      />
      <Circle
        opacity={0.14}
        radius={housingRadius * 0.92}
        stroke={palette.detailStroke}
        strokeWidth={0.3}
        x={centerX}
        y={centerY}
      />
      <Circle
        fill={palette.bodyShadow}
        radius={bodyRadius}
        stroke="rgba(220, 230, 218, 0.16)"
        strokeWidth={0.4}
        x={centerX}
        y={centerY}
      />
      <Line
        lineCap="round"
        opacity={0.14}
        points={trackArcPoints}
        stroke={palette.detailStroke}
        strokeWidth={Math.max(1.2, leverWidth * 0.5)}
      />
      {bladeAngles.map((angleDeg) => {
        const radians = (angleDeg * Math.PI) / 180
        const nextRad = ((angleDeg + 60) * Math.PI) / 180
        const innerX = centerX + Math.cos(radians) * apertureRadius * 0.82
        const innerY = centerY + Math.sin(radians) * apertureRadius * 0.82
        const outerX1 = centerX + Math.cos(radians + 0.22) * bladeOuterRadius
        const outerY1 = centerY + Math.sin(radians + 0.22) * bladeOuterRadius
        const outerX2 = centerX + Math.cos(nextRad - 0.38) * bladeOuterRadius * 0.86
        const outerY2 = centerY + Math.sin(nextRad - 0.38) * bladeOuterRadius * 0.86

        return (
          <Line
            closed
            fill={palette.detailFill}
            key={angleDeg}
            opacity={0.88}
            points={[innerX, innerY, outerX1, outerY1, outerX2, outerY2]}
            stroke="rgba(200, 215, 195, 0.14)"
            strokeWidth={0.3}
          />
        )
      })}
      <Circle
        fill={palette.apertureFill}
        radius={apertureRadius}
        stroke="rgba(200, 218, 190, 0.26)"
        strokeWidth={0.4}
        x={centerX}
        y={centerY}
      />
      <Line
        lineCap="round"
        points={[leverStartX, leverStartY, leverEndX, leverEndY]}
        stroke={palette.detailFill}
        strokeWidth={leverWidth}
      />
      <Line
        lineCap="round"
        opacity={0.4}
        points={[
          leverStartX + Math.cos(leverRad) * leverLength * 0.12,
          leverStartY + Math.sin(leverRad) * leverLength * 0.12,
          leverEndX - Math.cos(leverRad) * pinWidth * 0.4,
          leverEndY - Math.sin(leverRad) * pinWidth * 0.4,
        ]}
        stroke={palette.detailStroke}
        strokeWidth={Math.max(0.3, leverWidth * 0.15)}
      />
      <Rect
        cornerRadius={Math.max(0.8, pinHeight * 0.28)}
        fill={palette.fastenerFill}
        height={pinHeight}
        rotation={leverAngleDeg}
        stroke={palette.detailStroke}
        strokeWidth={0.32}
        width={pinWidth}
        x={pinX - (pinWidth * Math.cos(leverRad) - pinHeight * Math.sin(leverRad)) / 2}
        y={pinY - (pinWidth * Math.sin(leverRad) + pinHeight * Math.cos(leverRad)) / 2}
      />
      <Circle
        fill="rgba(255, 255, 255, 0.12)"
        radius={Math.max(0.5, pinHeight * 0.2)}
        x={pinX - pinWidth * 0.08}
        y={pinY - pinHeight * 0.12}
      />
    </>
  )
}

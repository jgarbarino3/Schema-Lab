import { Circle, Line, Rect } from 'react-konva'
import type { BoundsMm, ComponentInstance, ResolvedComponentSpec } from '../domain/types'
import { ComponentGlyph } from './ComponentGlyph'
import {
  BeamsplitterPlate,
  BeveledHousing,
  FilterAssembly,
  KinematicMountTop,
  IrisHardware,
  LensGlass,
  MirrorMountTopView,
  MirrorOpticFace,
  OutputAperture,
  SensorPad,
  type RealisticPalette,
} from './realisticPrimitives'

interface RenderRealisticHardwareArgs {
  bodyBoundsMm: BoundsMm
  instance: ComponentInstance
  mountBoundsMm: BoundsMm
  mountFill: string
  mountStroke: string
  opticFill: string
  opticStroke: string
  showMount: boolean
  spec: ResolvedComponentSpec
}

function specGlyphFallback(type: ComponentInstance['type']) {
  switch (type) {
    case 'optic-mount':
      return 'mount'
    case 'support-hardware':
      return 'support'
    case 'laser-source':
      return 'laser'
    case 'fiber-coupler':
      return 'fiber'
    case 'spectrometer':
      return 'spectrometer'
    case 'detector':
      return 'detector'
    case 'beam-dump':
      return 'beam-dump'
    case 'sample-stage':
      return 'sample'
    default:
      return 'mount'
  }
}

function createRealisticPalette({
  mountFill,
  opticFill,
  opticStroke,
  spec,
}: Pick<
  RenderRealisticHardwareArgs,
  'mountFill' | 'opticFill' | 'opticStroke' | 'spec'
>): RealisticPalette {
  const preset = spec.realisticVisualPreset
  const accentFill = preset?.accentFill ?? opticFill
  const accentStroke = preset?.accentStroke ?? opticStroke
  const glassTint = preset?.glassTint ?? opticFill

  switch (preset?.finish) {
    case 'warm-metal':
      return {
        accentFill,
        apertureFill: '#10151a',
        bodyBase: '#83613d',
        bodyHighlight: 'rgba(250, 225, 182, 0.38)',
        bodyShadow: 'rgba(33, 24, 15, 0.62)',
        detailFill: '#1a1612',
        detailStroke: accentStroke,
        fastenerFill: '#f0d88f',
        glassHighlight: 'rgba(255, 246, 230, 0.42)',
        glassTint,
        mountBase: mountFill,
        mountHighlight: 'rgba(250, 225, 182, 0.24)',
        mountShadow: 'rgba(19, 14, 8, 0.54)',
      }
    case 'rose-metal':
      return {
        accentFill,
        apertureFill: '#11161b',
        bodyBase: '#76505d',
        bodyHighlight: 'rgba(250, 230, 238, 0.34)',
        bodyShadow: 'rgba(29, 19, 24, 0.62)',
        detailFill: '#191316',
        detailStroke: accentStroke,
        fastenerFill: '#efd8e2',
        glassHighlight: 'rgba(255, 241, 248, 0.34)',
        glassTint,
        mountBase: mountFill,
        mountHighlight: 'rgba(250, 230, 238, 0.22)',
        mountShadow: 'rgba(23, 16, 18, 0.56)',
      }
    case 'teal-anodized':
      return {
        accentFill,
        apertureFill: '#08131a',
        bodyBase: '#1f5363',
        bodyHighlight: 'rgba(186, 233, 255, 0.28)',
        bodyShadow: 'rgba(8, 17, 24, 0.56)',
        detailFill: '#10191f',
        detailStroke: accentStroke,
        fastenerFill: '#d2e9ef',
        glassHighlight: 'rgba(225, 247, 255, 0.26)',
        glassTint,
        mountBase: mountFill,
        mountHighlight: 'rgba(186, 233, 255, 0.18)',
        mountShadow: 'rgba(9, 17, 22, 0.54)',
      }
    case 'silver-machined':
      return {
        accentFill,
        apertureFill: '#10161b',
        bodyBase: '#8d959c',
        bodyHighlight: 'rgba(255, 255, 255, 0.34)',
        bodyShadow: 'rgba(28, 34, 39, 0.48)',
        detailFill: '#161d22',
        detailStroke: accentStroke,
        fastenerFill: '#f1efe8',
        glassHighlight: 'rgba(255, 255, 255, 0.24)',
        glassTint,
        mountBase: mountFill,
        mountHighlight: 'rgba(255, 255, 255, 0.16)',
        mountShadow: 'rgba(18, 22, 26, 0.52)',
      }
    case 'graphite':
      return {
        accentFill,
        apertureFill: '#090d11',
        bodyBase: '#394149',
        bodyHighlight: 'rgba(233, 240, 245, 0.18)',
        bodyShadow: 'rgba(10, 14, 18, 0.64)',
        detailFill: '#12171c',
        detailStroke: accentStroke,
        fastenerFill: '#ddd4b0',
        glassHighlight: 'rgba(228, 239, 248, 0.26)',
        glassTint,
        mountBase: mountFill,
        mountHighlight: 'rgba(233, 240, 245, 0.15)',
        mountShadow: 'rgba(10, 14, 18, 0.56)',
      }
    case 'cool-metal':
    default:
      return {
        accentFill,
        apertureFill: '#091015',
        bodyBase: '#55626e',
        bodyHighlight: 'rgba(238, 246, 252, 0.26)',
        bodyShadow: 'rgba(10, 16, 22, 0.56)',
        detailFill: '#10161b',
        detailStroke: accentStroke,
        fastenerFill: '#b8c1c9',
        glassHighlight: 'rgba(248, 252, 255, 0.34)',
        glassTint,
        mountBase: mountFill,
        mountHighlight: 'rgba(238, 246, 252, 0.16)',
        mountShadow: 'rgba(10, 16, 22, 0.56)',
      }
  }
}

function renderHeroHardware(args: RenderRealisticHardwareArgs) {
  const { bodyBoundsMm, instance, mountBoundsMm, mountStroke, opticStroke, showMount, spec } = args
  const palette = createRealisticPalette(args)
  const centerX = bodyBoundsMm.x + bodyBoundsMm.width / 2
  const centerY = bodyBoundsMm.y + bodyBoundsMm.height / 2
  const opticRadius = Math.max(4, Math.min(bodyBoundsMm.width, bodyBoundsMm.height) * 0.42)

  switch (spec.realisticVisualPreset?.family) {
    case 'mirror':
      return showMount && spec.realisticVisualPreset.mountVisual === 'kinematic-round' ? (
        <MirrorMountTopView
          boundsMm={mountBoundsMm}
          palette={palette}
          stroke={mountStroke}
        />
      ) : (
        <MirrorOpticFace
          centerX={centerX}
          centerY={centerY}
          palette={palette}
          radius={opticRadius}
          stroke={opticStroke}
        />
      )
    case 'beamsplitter':
      return (
        <>
          {showMount && spec.realisticVisualPreset.mountVisual === 'kinematic-round' ? (
            <KinematicMountTop
              boundsMm={mountBoundsMm}
              centerX={centerX}
              centerY={centerY}
              palette={palette}
              stroke={mountStroke}
            />
          ) : null}
          <BeamsplitterPlate
            bodyBoundsMm={bodyBoundsMm}
            centerX={centerX}
            centerY={centerY}
            palette={palette}
            stroke={opticStroke}
          />
        </>
      )
    case 'lens':
      return (
        <>
          {showMount && spec.realisticVisualPreset.mountVisual === 'kinematic-round' ? (
            <KinematicMountTop
              boundsMm={mountBoundsMm}
              centerX={centerX}
              centerY={centerY}
              palette={palette}
              stroke={mountStroke}
            />
          ) : null}
          <LensGlass
            centerX={centerX}
            centerY={centerY}
            palette={palette}
            radius={Math.max(5, Math.min(bodyBoundsMm.width, bodyBoundsMm.height) * 0.46)}
            stroke={opticStroke}
          />
        </>
      )
    case 'filter':
      return (
        <>
          {showMount && spec.realisticVisualPreset.mountVisual === 'kinematic-round' ? (
            <KinematicMountTop
              boundsMm={mountBoundsMm}
              centerX={centerX}
              centerY={centerY}
              palette={palette}
              stroke={mountStroke}
            />
          ) : null}
          <FilterAssembly
            bodyBoundsMm={bodyBoundsMm}
            centerX={centerX}
            centerY={centerY}
            palette={palette}
            stroke={opticStroke}
          />
        </>
      )
    case 'iris': {
      const maxApertureMm =
        spec.physics.kind === 'iris' ? spec.physics.maxApertureMm : bodyBoundsMm.width
      const configuredApertureMm = instance.config.iris?.apertureMm ?? maxApertureMm * 0.6
      const apertureRatio = Math.min(1, configuredApertureMm / Math.max(1, maxApertureMm))
      const apertureRadius = Math.max(1.8, opticRadius * (0.24 + apertureRatio * 0.34))

      return (
        <IrisHardware
          apertureRadius={apertureRadius}
          bodyBoundsMm={bodyBoundsMm}
          mountBoundsMm={mountBoundsMm}
          palette={palette}
          showMount={showMount && spec.realisticVisualPreset.mountVisual === 'iris-body'}
          stroke={mountStroke}
        />
      )
    }
    case 'detector': {
      const mountCenterX = mountBoundsMm.x + mountBoundsMm.width / 2
      const mountCenterY = mountBoundsMm.y + mountBoundsMm.height / 2
      const mountRadius = Math.min(mountBoundsMm.width, mountBoundsMm.height) / 2
      const apertureX = bodyBoundsMm.x + Math.max(5, bodyBoundsMm.width * 0.14)

      return (
        <>
          {showMount && spec.realisticVisualPreset.mountVisual === 'sensor-disc' ? (
            <>
              <Circle
                fill={palette.mountBase}
                radius={mountRadius}
                stroke={mountStroke}
                strokeWidth={0.92}
                x={mountCenterX}
                y={mountCenterY}
              />
              <Circle
                fill={palette.mountHighlight}
                opacity={0.26}
                radius={mountRadius * 0.78}
                x={mountCenterX - mountRadius * 0.16}
                y={mountCenterY - mountRadius * 0.16}
              />
              <Circle
                fill={palette.mountShadow}
                radius={Math.max(4.6, mountRadius * 0.52)}
                x={mountCenterX}
                y={mountCenterY}
              />
            </>
          ) : null}
          <SensorPad boundsMm={bodyBoundsMm} palette={palette} stroke={opticStroke} />
          <Rect
            cornerRadius={1.5}
            fill={palette.bodyShadow}
            height={Math.max(4, bodyBoundsMm.height * 0.2)}
            opacity={0.9}
            width={Math.max(5, bodyBoundsMm.width * 0.18)}
            x={bodyBoundsMm.x - Math.max(2.2, bodyBoundsMm.width * 0.05)}
            y={centerY - Math.max(4, bodyBoundsMm.height * 0.2) / 2}
          />
          <OutputAperture
            palette={palette}
            radius={Math.max(2, Math.min(bodyBoundsMm.width, bodyBoundsMm.height) * 0.08)}
            x={apertureX}
            y={centerY}
          />
        </>
      )
    }
    case 'laser-source': {
      const ventCount = Math.max(3, Math.min(7, Math.floor(bodyBoundsMm.height / 6)))
      const ventSpacing = bodyBoundsMm.height / (ventCount + 1)
      const ventStartX = bodyBoundsMm.x + bodyBoundsMm.width * 0.2
      const ventEndX = bodyBoundsMm.x + bodyBoundsMm.width * 0.48
      const outputRadius = Math.max(2.2, Math.min(bodyBoundsMm.width, bodyBoundsMm.height) * 0.032)

      return (
        <>
          <BeveledHousing
            boundsMm={bodyBoundsMm}
            cornerRadius={Math.max(4, Math.min(bodyBoundsMm.width, bodyBoundsMm.height) * 0.08)}
            endCapWidthMm={Math.max(12, bodyBoundsMm.width * 0.12)}
            palette={palette}
            stroke={opticStroke}
            topPlateHeightMm={Math.max(8, bodyBoundsMm.height * 0.2)}
          />
          {Array.from({ length: ventCount }).map((_, index) => {
            const y = bodyBoundsMm.y + ventSpacing * (index + 1)

            return (
              <Line
                key={index}
                lineCap="round"
                opacity={0.6}
                points={[ventStartX, y, ventEndX, y]}
                stroke={palette.detailStroke}
                strokeWidth={Math.max(0.5, bodyBoundsMm.height * 0.02)}
              />
            )
          })}
          <Rect
            cornerRadius={2}
            fill={palette.accentFill}
            height={Math.max(6, bodyBoundsMm.height * 0.14)}
            opacity={0.42}
            width={Math.max(10, bodyBoundsMm.width * 0.16)}
            x={bodyBoundsMm.x + bodyBoundsMm.width * 0.62}
            y={bodyBoundsMm.y + bodyBoundsMm.height * 0.14}
          />
          <OutputAperture
            palette={palette}
            radius={outputRadius}
            x={bodyBoundsMm.x + bodyBoundsMm.width - Math.max(6, bodyBoundsMm.width * 0.035)}
            y={centerY}
          />
        </>
      )
    }
    default:
      return null
  }
}

function renderLegacyRealisticHardware({
  bodyBoundsMm,
  instance,
  mountBoundsMm,
  mountFill,
  mountStroke,
  opticFill,
  opticStroke,
  showMount,
}: Omit<RenderRealisticHardwareArgs, 'spec'>) {
  const centerX = bodyBoundsMm.x + bodyBoundsMm.width / 2
  const centerY = bodyBoundsMm.y + bodyBoundsMm.height / 2

  switch (instance.type) {
    case 'bbo-crystal':
      return (
        <>
          {showMount ? (
            <Rect
              cornerRadius={3}
              fill={mountFill}
              height={mountBoundsMm.height}
              stroke={mountStroke}
              strokeWidth={0.95}
              width={mountBoundsMm.width}
              x={mountBoundsMm.x}
              y={mountBoundsMm.y}
            />
          ) : null}
          <Line
            closed
            fill="rgba(207, 192, 239, 0.2)"
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
            stroke={opticStroke}
            strokeWidth={1}
          />
        </>
      )
    case 'sample-stage':
      if (instance.variantId === 'pi-ls-180') {
        const plateWidth = Math.min(210, bodyBoundsMm.width * 0.32)
        const plateHeight = Math.min(118, bodyBoundsMm.height * 0.78)
        const chainStartX = bodyBoundsMm.x + bodyBoundsMm.width * 0.4
        const chainEndX = bodyBoundsMm.x + bodyBoundsMm.width * 0.55

        return (
          <>
            <Rect
              cornerRadius={5}
              fill="#bfc4c7"
              height={bodyBoundsMm.height}
              stroke="#e7ecef"
              strokeWidth={1}
              width={bodyBoundsMm.width}
              x={bodyBoundsMm.x}
              y={bodyBoundsMm.y}
            />
            <Rect
              cornerRadius={4}
              fill="#181d22"
              height={plateHeight}
              stroke="#59626c"
              strokeWidth={0.9}
              width={plateWidth}
              x={centerX - plateWidth / 2}
              y={centerY - plateHeight / 2}
            />
            <Line
              lineCap="round"
              lineJoin="round"
              points={[
                chainStartX,
                bodyBoundsMm.y + bodyBoundsMm.height * 0.42,
                bodyBoundsMm.x + bodyBoundsMm.width * 0.72,
                bodyBoundsMm.y + bodyBoundsMm.height * 0.26,
                bodyBoundsMm.x + bodyBoundsMm.width * 0.92,
                centerY,
                bodyBoundsMm.x + bodyBoundsMm.width * 0.72,
                bodyBoundsMm.y + bodyBoundsMm.height * 0.74,
                chainEndX,
                bodyBoundsMm.y + bodyBoundsMm.height * 0.58,
              ]}
              stroke="#161b1f"
              strokeWidth={Math.max(4, bodyBoundsMm.height * 0.08)}
            />
            <Rect
              cornerRadius={3}
              fill="rgba(255, 255, 255, 0.1)"
              height={Math.max(10, bodyBoundsMm.height * 0.16)}
              stroke="rgba(255, 255, 255, 0.2)"
              strokeWidth={0.4}
              width={bodyBoundsMm.width * 0.22}
              x={bodyBoundsMm.x + bodyBoundsMm.width * 0.39}
              y={bodyBoundsMm.y + bodyBoundsMm.height * 0.07}
            />
          </>
        )
      }

      return (
        <>
          <Rect
            cornerRadius={4}
            fill={opticFill}
            height={bodyBoundsMm.height}
            stroke={opticStroke}
            strokeWidth={0.95}
            width={bodyBoundsMm.width}
            x={bodyBoundsMm.x}
            y={bodyBoundsMm.y}
          />
          <Rect
            cornerRadius={3}
            fill="rgba(255, 255, 255, 0.08)"
            height={bodyBoundsMm.height * 0.58}
            stroke="rgba(255, 255, 255, 0.18)"
            strokeWidth={0.4}
            width={bodyBoundsMm.width * 0.26}
            x={centerX - bodyBoundsMm.width * 0.13}
            y={centerY - bodyBoundsMm.height * 0.29}
          />
        </>
      )
    case 'spectrometer':
      return (
        <>
          <Rect
            cornerRadius={5}
            fill={opticFill}
            height={bodyBoundsMm.height}
            stroke={opticStroke}
            strokeWidth={1}
            width={bodyBoundsMm.width}
            x={bodyBoundsMm.x}
            y={bodyBoundsMm.y}
          />
          <Rect
            cornerRadius={3}
            fill="#14191e"
            height={Math.max(14, bodyBoundsMm.height * 0.28)}
            stroke="#48525d"
            strokeWidth={0.7}
            width={Math.max(18, bodyBoundsMm.width * 0.2)}
            x={bodyBoundsMm.x - Math.max(14, bodyBoundsMm.width * 0.16)}
            y={centerY - Math.max(14, bodyBoundsMm.height * 0.28) / 2}
          />
          <Rect
            cornerRadius={3}
            fill="rgba(255, 255, 255, 0.08)"
            height={Math.max(12, bodyBoundsMm.height * 0.16)}
            stroke="rgba(255, 255, 255, 0.18)"
            strokeWidth={0.4}
            width={bodyBoundsMm.width * 0.5}
            x={bodyBoundsMm.x + bodyBoundsMm.width * 0.18}
            y={bodyBoundsMm.y + bodyBoundsMm.height * 0.12}
          />
          <Circle
            fill="#11161b"
            radius={Math.max(4, Math.min(bodyBoundsMm.width, bodyBoundsMm.height) * 0.09)}
            stroke="#b6b0ff"
            strokeWidth={0.8}
            x={centerX}
            y={centerY}
          />
        </>
      )
    default:
      return (
        <>
          {showMount ? (
            <Circle
              fill={mountFill}
              opacity={0.94}
              radius={Math.min(mountBoundsMm.width, mountBoundsMm.height) / 2}
              stroke={mountStroke}
              strokeWidth={0.9}
              x={mountBoundsMm.x + mountBoundsMm.width / 2}
              y={mountBoundsMm.y + mountBoundsMm.height / 2}
            />
          ) : null}
          <Rect
            cornerRadius={Math.min(bodyBoundsMm.width, bodyBoundsMm.height) / 2}
            fill={opticFill}
            opacity={0.95}
            height={bodyBoundsMm.height}
            stroke={opticStroke}
            strokeWidth={0.9}
            width={bodyBoundsMm.width}
            x={bodyBoundsMm.x}
            y={bodyBoundsMm.y}
          />
          <ComponentGlyph
            boundsMm={bodyBoundsMm}
            fill="rgba(255, 255, 255, 0.1)"
            glyph={specGlyphFallback(instance.type)}
            stroke={opticStroke}
          />
        </>
      )
  }
}

export function renderRealisticHardware(args: RenderRealisticHardwareArgs) {
  return renderHeroHardware(args) ?? renderLegacyRealisticHardware(args)
}

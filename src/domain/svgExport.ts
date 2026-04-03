import { getBeamColor } from './beamTracing'
import {
  getBreadboardHoleAxesMm,
  getBreadboardHoleCounts,
  getCounterboreCentersMm,
  getEffectiveHolePitchMm,
} from './breadboard'
import {
  getEffectiveSupportBoundsMm,
  getResolvedComponentSpec,
  shouldIncludeDefaultMount,
} from './componentCatalog'
import { quarterTurnsToDegrees, worldToScreen } from './geometry'
import { getSourceLaneBoundsMm, SOURCE_LANE_OFFSET_MM } from './placement'
import type {
  BeamSegment,
  BeamTraceResult,
  BoundsMm,
  ComponentInstance,
  GaussianTraceResult,
  RenderMode,
  SceneDocument,
  ViewportState,
} from './types'

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function svgRect(bounds: BoundsMm, attributes: string) {
  return `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" ${attributes} />`
}

function svgCircle(cx: number, cy: number, radius: number, attributes: string) {
  return `<circle cx="${cx}" cy="${cy}" r="${radius}" ${attributes} />`
}

function svgLine(x1: number, y1: number, x2: number, y2: number, attributes: string) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${attributes} />`
}

function svgEllipse(
  cx: number,
  cy: number,
  radiusX: number,
  radiusY: number,
  attributes: string,
) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${radiusX}" ry="${radiusY}" ${attributes} />`
}

function svgPolygon(points: Array<{ x: number; y: number }>, attributes: string) {
  return `<polygon points="${points.map((point) => `${point.x},${point.y}`).join(' ')}" ${attributes} />`
}

function localX(valueMm: number, zoomPxPerMm: number) {
  return valueMm * zoomPxPerMm
}

function localBounds(boundsMm: BoundsMm, zoomPxPerMm: number): BoundsMm {
  return {
    x: localX(boundsMm.x, zoomPxPerMm),
    y: localX(boundsMm.y, zoomPxPerMm),
    width: localX(boundsMm.width, zoomPxPerMm),
    height: localX(boundsMm.height, zoomPxPerMm),
  }
}

function getSegmentDash(branchKind: string) {
  switch (branchKind) {
    case 'reflected':
      return '10 6'
    case 'generated-shg':
      return '2 4'
    default:
      return undefined
  }
}

function getSegmentStrokeWidth(segment: BeamSegment) {
  const strokeWidth = Math.min(
    Math.max(1.35 + segment.powerPercent / 45, 1.4),
    segment.pathRole === 'shg' ? 3.7 : 4.5,
  )

  return strokeWidth
}

function getSegmentOpacity(segment: BeamSegment) {
  if (segment.outcomeClass === 'low-power') {
    return 0.28
  }

  if (segment.attenuationClass === 'attenuated') {
    return 0.5
  }

  if (segment.attenuationClass === 'clipped') {
    return 0.62
  }

  return segment.pathRole === 'shg' ? 0.94 : 0.78
}

function renderSimpleGlyph(
  glyph: string,
  boundsMm: BoundsMm,
  zoomPxPerMm: number,
  stroke: string,
  fill: string,
) {
  const bounds = localBounds(boundsMm, zoomPxPerMm)
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  const opticRadius = Math.max(3.2, Math.min(bounds.width, bounds.height) * 0.26)

  switch (glyph) {
    case 'mirror':
      return svgLine(
        bounds.x + bounds.width - 4,
        bounds.y + 4,
        bounds.x + 4,
        bounds.y + bounds.height - 4,
        `stroke="${stroke}" stroke-width="1.9" stroke-linecap="round"`,
      )
    case 'lens':
      return svgEllipse(
        centerX,
        centerY,
        Math.max(2.4, bounds.width * 0.12),
        Math.max(5, bounds.height * 0.38),
        `fill="${fill}" fill-opacity="0.32" stroke="${stroke}" stroke-width="1"`,
      )
    case 'iris':
      return svgCircle(centerX, centerY, opticRadius, `fill="none" stroke="${stroke}" stroke-width="1.2"`)
    case 'beamsplitter':
      return [
        svgLine(
          bounds.x + 4,
          bounds.y + bounds.height - 4,
          bounds.x + bounds.width - 4,
          bounds.y + 4,
          `stroke="${stroke}" stroke-width="1.35" stroke-dasharray="2.2 2.2" stroke-linecap="round"`,
        ),
        svgLine(
          centerX,
          bounds.y + 4,
          centerX,
          bounds.y + bounds.height - 4,
          `stroke="${stroke}" stroke-opacity="0.7" stroke-width="0.85"`,
        ),
      ].join('')
    case 'filter':
      return [
        `<rect x="${centerX - 5}" y="${centerY - 5}" width="10" height="10" transform="rotate(45 ${centerX} ${centerY})" fill="${fill}" fill-opacity="0.12" stroke="${stroke}" stroke-width="0.9" />`,
        svgLine(
          bounds.x + bounds.width * 0.25,
          bounds.y + bounds.height * 0.72,
          bounds.x + bounds.width * 0.72,
          bounds.y + bounds.height * 0.25,
          `stroke="${stroke}" stroke-width="1.1" stroke-linecap="round"`,
        ),
      ].join('')
    default:
      return svgRect(bounds, `rx="4" fill="${fill}" fill-opacity="0.22" stroke="${stroke}" stroke-width="0.9"`)
  }
}

function renderRealisticHardware(
  component: ComponentInstance,
  zoomPxPerMm: number,
  stroke: string,
  fill: string,
  mountStroke: string,
  mountFill: string,
) {
  const spec = getResolvedComponentSpec(component.type, component.variantId)
  const bodyBounds = localBounds(spec.visualBodyBoundsMm, zoomPxPerMm)
  const mountBounds = localBounds(
    spec.mountVisualBoundsMm ?? spec.mount.supportBoundsMm,
    zoomPxPerMm,
  )
  const centerX = bodyBounds.x + bodyBounds.width / 2
  const centerY = bodyBounds.y + bodyBounds.height / 2
  const showMount =
    shouldIncludeDefaultMount(component) && spec.mountVisualBoundsMm && spec.mountRenderHint
  const mountRadius = Math.min(mountBounds.width, mountBounds.height) / 2
  const opticRadius = Math.max(5, Math.min(bodyBounds.width, bodyBounds.height) * 0.42)
  const screwRadius = Math.max(2, mountRadius * 0.14)
  const screwOffset = Math.max(9, mountRadius - 6)
  const mountMarkup =
    showMount && component.type !== 'bbo-crystal'
      ? [
          svgCircle(
            mountBounds.x + mountBounds.width / 2,
            mountBounds.y + mountBounds.height / 2,
            mountRadius,
            `fill="${mountFill}" stroke="${mountStroke}" stroke-width="1"`,
          ),
          svgCircle(
            mountBounds.x + mountBounds.width / 2,
            mountBounds.y + mountBounds.height / 2,
            Math.max(8, mountRadius - 4),
            `fill="rgba(13,17,22,0.52)" stroke="rgba(201,217,226,0.18)" stroke-width="0.6"`,
          ),
          svgCircle(centerX, centerY - screwOffset, screwRadius, `fill="#f2dc86" stroke="#10151b" stroke-width="0.5"`),
          svgCircle(centerX - screwOffset * 0.86, centerY + screwOffset * 0.5, screwRadius, `fill="#f2dc86" stroke="#10151b" stroke-width="0.5"`),
          svgCircle(centerX + screwOffset * 0.86, centerY + screwOffset * 0.5, screwRadius, `fill="#f2dc86" stroke="#10151b" stroke-width="0.5"`),
        ].join('')
      : ''

  switch (component.type) {
    case 'mirror':
      return [
        mountMarkup,
        svgCircle(centerX, centerY, opticRadius, `fill="${fill}" stroke="#f2f7fb" stroke-width="1"`),
        svgLine(
          centerX + opticRadius * 0.72,
          centerY - opticRadius * 0.72,
          centerX - opticRadius * 0.72,
          centerY + opticRadius * 0.72,
          `stroke="${stroke}" stroke-width="1.4" stroke-linecap="round"`,
        ),
      ].join('')
    case 'beamsplitter':
      return [
        mountMarkup,
        svgCircle(centerX, centerY, opticRadius, `fill="rgba(79,130,148,0.28)" stroke="#d4eef4" stroke-width="1"`),
        svgLine(
          centerX - opticRadius * 0.75,
          centerY + opticRadius * 0.75,
          centerX + opticRadius * 0.75,
          centerY - opticRadius * 0.75,
          `stroke="${stroke}" stroke-width="1.2" stroke-dasharray="2.2 2.2" stroke-linecap="round"`,
        ),
      ].join('')
    case 'lens':
      return [
        mountMarkup,
        svgEllipse(centerX, centerY, Math.max(3, bodyBounds.width * 0.18), Math.max(7, bodyBounds.height * 0.42), `fill="rgba(130,197,230,0.32)" stroke="#d9eef8" stroke-width="1"`),
      ].join('')
    case 'filter':
      return [
        mountMarkup,
        `<rect x="${centerX - 6}" y="${centerY - 6}" width="12" height="12" transform="rotate(45 ${centerX} ${centerY})" fill="rgba(148,214,214,0.14)" stroke="#d8f4f1" stroke-width="0.9" />`,
        svgLine(
          centerX - opticRadius * 0.8,
          centerY + opticRadius * 0.7,
          centerX + opticRadius * 0.8,
          centerY - opticRadius * 0.7,
          `stroke="${stroke}" stroke-width="1.15" stroke-linecap="round"`,
        ),
      ].join('')
    case 'iris':
      return [
        mountMarkup,
        svgCircle(centerX, centerY, opticRadius + 1, `fill="rgba(21,28,19,0.74)" stroke="#dcefd6" stroke-width="0.95"`),
        svgCircle(centerX, centerY, Math.max(3, opticRadius * 0.46), `fill="#0c1014" stroke="#aac39f" stroke-width="0.8"`),
      ].join('')
    case 'bbo-crystal':
      return [
        spec.mountVisualBoundsMm
          ? svgRect(
              mountBounds,
              `rx="6" fill="${mountFill}" stroke="${mountStroke}" stroke-width="1"`,
            )
          : '',
        svgPolygon(
          [
            { x: centerX - 9, y: centerY },
            { x: centerX, y: centerY - 8 },
            { x: centerX + 9, y: centerY },
            { x: centerX, y: centerY + 8 },
          ],
          `fill="rgba(207,192,239,0.2)" stroke="${stroke}" stroke-width="1"`,
        ),
      ].join('')
    default:
      return renderSimpleGlyph(spec.renderHint.glyph, spec.visualBodyBoundsMm, zoomPxPerMm, stroke, fill)
  }
}

function renderComponentSvg(
  component: ComponentInstance,
  viewport: ViewportState,
  renderMode: RenderMode,
) {
  const spec = getResolvedComponentSpec(component.type, component.variantId)
  const supportBounds = getEffectiveSupportBoundsMm(component, spec)
  const anchorPx = worldToScreen(component.anchorMm, viewport)
  const labelY = localX(supportBounds.y + supportBounds.height + 4.5, viewport.zoomPxPerMm)
  const labelWidth = Math.max(
    localX(supportBounds.width, viewport.zoomPxPerMm),
    localX(spec.visualBodyBoundsMm.width, viewport.zoomPxPerMm),
    42,
  )
  const mountStroke = spec.mountRenderHint?.stroke ?? '#9fb3bf'
  const mountFill = spec.mountRenderHint?.fill ?? '#29333d'
  const hardwareMarkup =
    renderMode === 'realistic'
      ? renderRealisticHardware(
          component,
          viewport.zoomPxPerMm,
          spec.renderHint.stroke,
          spec.renderHint.fill,
          mountStroke,
          mountFill,
        )
      : renderSimpleGlyph(
          spec.renderHint.glyph,
          spec.visualBodyBoundsMm,
          viewport.zoomPxPerMm,
          spec.renderHint.stroke,
          spec.renderHint.fill,
        )

  return `<g transform="translate(${anchorPx.x} ${anchorPx.y}) rotate(${quarterTurnsToDegrees(component.rotationQuarterTurns)})">
    ${hardwareMarkup}
    <text x="${-labelWidth / 2}" y="${labelY}" width="${labelWidth}" fill="rgba(230,237,242,0.88)" font-size="13" font-family="IBM Plex Sans, Avenir Next, Segoe UI, sans-serif" text-anchor="start">${escapeXml(component.label)}</text>
  </g>`
}

function renderGaussianEnvelopeSvg(
  beamTrace: BeamTraceResult,
  gaussianTrace: GaussianTraceResult,
  viewport: ViewportState,
) {
  const segmentById = new Map(
    beamTrace.segments.map((segment) => [segment.id, segment] as const),
  )

  return gaussianTrace.segmentAnalyses
    .map((analysis) => {
      const segment = segmentById.get(analysis.segmentId)

      if (!segment) {
        return ''
      }

      const normalMm = {
        x: -segment.directionMm.y,
        y: segment.directionMm.x,
      }
      const startPlus = worldToScreen(
        {
          x: segment.startMm.x + normalMm.x * analysis.start.spotRadiusMm,
          y: segment.startMm.y + normalMm.y * analysis.start.spotRadiusMm,
        },
        viewport,
      )
      const endPlus = worldToScreen(
        {
          x: segment.endMm.x + normalMm.x * analysis.end.spotRadiusMm,
          y: segment.endMm.y + normalMm.y * analysis.end.spotRadiusMm,
        },
        viewport,
      )
      const endMinus = worldToScreen(
        {
          x: segment.endMm.x - normalMm.x * analysis.end.spotRadiusMm,
          y: segment.endMm.y - normalMm.y * analysis.end.spotRadiusMm,
        },
        viewport,
      )
      const startMinus = worldToScreen(
        {
          x: segment.startMm.x - normalMm.x * analysis.start.spotRadiusMm,
          y: segment.startMm.y - normalMm.y * analysis.start.spotRadiusMm,
        },
        viewport,
      )
      const color = getBeamColor(segment.wavelengthNm, segment.pathRole)

      return svgPolygon(
        [startPlus, endPlus, endMinus, startMinus],
        `fill="${color}" fill-opacity="0.07" stroke="${color}" stroke-opacity="0.22" stroke-width="1"`,
      )
    })
    .join('')
}

function renderBeamSvg(beamTrace: BeamTraceResult, viewport: ViewportState) {
  const segments = beamTrace.segments
    .map((segment) => {
      const startPx = worldToScreen(segment.startMm, viewport)
      const endPx = worldToScreen(segment.endMm, viewport)
      const dash = getSegmentDash(segment.branchKind)
      const dashAttribute = dash ? ` stroke-dasharray="${dash}"` : ''

      return svgLine(
        startPx.x,
        startPx.y,
        endPx.x,
        endPx.y,
        `stroke="${getBeamColor(segment.wavelengthNm, segment.pathRole)}" stroke-width="${getSegmentStrokeWidth(segment)}" stroke-opacity="${getSegmentOpacity(segment)}"${dashAttribute}`,
      )
    })
    .join('')
  const events = beamTrace.events
    .map((event) => {
      const hitPx = worldToScreen(event.hitPointMm, viewport)

      return svgCircle(
        hitPx.x,
        hitPx.y,
        event.wasClipped || event.outcomeClass === 'blocked' ? 3.6 : 2.6,
        `fill="${event.wasClipped || event.outcomeClass === 'blocked' ? '#3f1d12' : '#0b1014'}" stroke="${getBeamColor(event.outputWavelengthNm ?? event.wavelengthNm, event.interactionKind === 'shg' ? 'shg' : 'fundamental')}" stroke-width="1.2"`,
      )
    })
    .join('')

  return segments + events
}

export function createSceneSvg(args: {
  beamTrace: BeamTraceResult
  gaussianTrace: GaussianTraceResult
  renderMode: RenderMode
  scene: SceneDocument
  showGaussianEnvelope: boolean
  viewport: ViewportState
}) {
  const { beamTrace, gaussianTrace, renderMode, scene, showGaussianEnvelope, viewport } = args
  const boardOriginPx = worldToScreen({ x: 0, y: 0 }, viewport)
  const holeAxes = getBreadboardHoleAxesMm(scene.breadboard)
  const holeCounts = getBreadboardHoleCounts(scene.breadboard)
  const counterboreCentersMm = getCounterboreCentersMm(scene.breadboard)
  const effectivePitchMm = getEffectiveHolePitchMm(scene.breadboard)
  const boardFill =
    scene.breadboard.finish === 'black-anodized' ? '#171d22' : '#c9d1d8'
  const boardStroke =
    scene.breadboard.finish === 'black-anodized' ? '#5a6974' : '#7e8b95'
  const holeFill =
    scene.breadboard.finish === 'black-anodized' ? '#0c1014' : '#64717a'
  const labelColor =
    scene.breadboard.finish === 'black-anodized' ? '#d5e2ec' : '#16202a'
  const sourceLanes = [
    { key: 'left', label: 'Source Lane', ...getSourceLaneBoundsMm(scene.breadboard, 'left') },
    { key: 'right', label: 'Source Lane', ...getSourceLaneBoundsMm(scene.breadboard, 'right') },
    { key: 'top', label: 'Source Lane', ...getSourceLaneBoundsMm(scene.breadboard, 'top') },
    { key: 'bottom', label: 'Source Lane', ...getSourceLaneBoundsMm(scene.breadboard, 'bottom') },
  ]

  const board = `<g transform="translate(${boardOriginPx.x} ${boardOriginPx.y})">
    ${svgRect(
      {
        x: 0,
        y: 0,
        width: localX(scene.breadboard.widthMm, viewport.zoomPxPerMm),
        height: localX(scene.breadboard.heightMm, viewport.zoomPxPerMm),
      },
      `rx="8" fill="${boardFill}" stroke="${boardStroke}" stroke-width="1.2"`,
    )}
    ${sourceLanes
      .map((lane) => {
        const laneBounds = localBounds(lane, viewport.zoomPxPerMm)

        return `${svgRect(
          laneBounds,
          `rx="8" fill="rgba(56,83,97,0.1)" stroke="rgba(122,193,220,0.28)" stroke-width="0.8" stroke-dasharray="5 4"`,
        )}<text x="${laneBounds.x + 6}" y="${laneBounds.y + laneBounds.height / 2 + 3}" fill="rgba(165,199,214,0.7)" font-family="IBM Plex Mono, SFMono-Regular, monospace" font-size="8">${escapeXml(lane.label)}</text>`
      })
      .join('')}
    ${counterboreCentersMm
      .map((counterbore) => {
        const pointPx = worldToScreen(counterbore, viewport)
        const localPoint = {
          x: pointPx.x - boardOriginPx.x,
          y: pointPx.y - boardOriginPx.y,
        }

        return `${svgCircle(localPoint.x, localPoint.y, 6.2 * viewport.zoomPxPerMm * 0.22, `fill="#2c343b" stroke="#56616b" stroke-width="0.6"`)}${svgCircle(localPoint.x, localPoint.y, 2.1 * viewport.zoomPxPerMm * 0.22, `fill="${holeFill}"`)}`
      })
      .join('')}
    ${holeAxes.xPositionsMm
      .flatMap((xPositionMm) =>
        holeAxes.yPositionsMm.map((yPositionMm) => {
          const pointPx = worldToScreen({ x: xPositionMm, y: yPositionMm }, viewport)
          const localPoint = {
            x: pointPx.x - boardOriginPx.x,
            y: pointPx.y - boardOriginPx.y,
          }

          return svgCircle(localPoint.x, localPoint.y, 1.5 * viewport.zoomPxPerMm * 0.3, `fill="${holeFill}"`)
        }),
      )
      .join('')}
    <text x="2" y="-14" fill="${labelColor}" font-family="IBM Plex Sans, Avenir Next, Segoe UI, sans-serif" font-size="12">${escapeXml(`${scene.breadboard.label} • ${scene.breadboard.widthMm.toFixed(0)} × ${scene.breadboard.heightMm.toFixed(0)} mm • ${holeCounts.xCount} × ${holeCounts.yCount} holes • ${effectivePitchMm.toFixed(1)} mm pitch • sources at ±${SOURCE_LANE_OFFSET_MM.toFixed(0)} mm`)}</text>
  </g>`

  const components = scene.components
    .map((component) => renderComponentSvg(component, viewport, renderMode))
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${viewport.canvasSizePx.width}" height="${viewport.canvasSizePx.height}" viewBox="0 0 ${viewport.canvasSizePx.width} ${viewport.canvasSizePx.height}">
  <rect x="0" y="0" width="${viewport.canvasSizePx.width}" height="${viewport.canvasSizePx.height}" fill="#0b1014" />
  <g id="breadboard-layer">${board}</g>
  ${
    showGaussianEnvelope
      ? `<g id="gaussian-layer">${renderGaussianEnvelopeSvg(beamTrace, gaussianTrace, viewport)}</g>`
      : ''
  }
  <g id="beam-layer">${renderBeamSvg(beamTrace, viewport)}</g>
  <g id="component-layer">${components}</g>
</svg>`
}

import { Fragment } from 'react'
import { Layer, Line, Rect, Text } from 'react-konva'
import { screenToWorld, worldToScreen } from '../domain/geometry'
import type { ViewportState } from '../domain/types'

const TOP_RULER_HEIGHT_PX = 24
const LEFT_RULER_WIDTH_PX = 48
const RULER_STEP_CANDIDATES_MM = [5, 10, 25, 50, 100, 250, 500]

function pickRulerStepMm(zoomPxPerMm: number) {
  return (
    RULER_STEP_CANDIDATES_MM.find((stepMm) => stepMm * zoomPxPerMm >= 56) ?? 500
  )
}

function getVisibleStepRange(
  startMm: number,
  endMm: number,
  stepMm: number,
) {
  const firstTickMm = Math.floor(startMm / stepMm) * stepMm
  const values: number[] = []

  for (let value = firstTickMm; value <= endMm + stepMm; value += stepMm) {
    values.push(value)
  }

  return values
}

interface RulerLayerProps {
  cursorScreenPx?: { x: number; y: number }
  renderInLayer?: boolean
  viewport: ViewportState
}

export function RulerLayer({
  cursorScreenPx,
  renderInLayer = true,
  viewport,
}: RulerLayerProps) {
  const stepMm = pickRulerStepMm(viewport.zoomPxPerMm)
  const visibleLeftMm = screenToWorld({ x: LEFT_RULER_WIDTH_PX, y: 0 }, viewport).x
  const visibleRightMm = screenToWorld(
    { x: viewport.canvasSizePx.width, y: 0 },
    viewport,
  ).x
  const visibleTopMm = screenToWorld({ x: 0, y: TOP_RULER_HEIGHT_PX }, viewport).y
  const visibleBottomMm = screenToWorld(
    { x: 0, y: viewport.canvasSizePx.height },
    viewport,
  ).y
  const tickValuesX = getVisibleStepRange(visibleLeftMm, visibleRightMm, stepMm)
  const tickValuesY = getVisibleStepRange(visibleTopMm, visibleBottomMm, stepMm)
  const content = (
    <>
      <Rect
        fill="rgba(7, 10, 14, 0.94)"
        height={TOP_RULER_HEIGHT_PX}
        width={viewport.canvasSizePx.width}
        x={0}
        y={0}
      />
      <Rect
        fill="rgba(7, 10, 14, 0.94)"
        height={viewport.canvasSizePx.height}
        width={LEFT_RULER_WIDTH_PX}
        x={0}
        y={0}
      />
      <Rect
        fill="rgba(10, 14, 18, 0.98)"
        height={TOP_RULER_HEIGHT_PX}
        stroke="rgba(136, 160, 174, 0.25)"
        strokeWidth={1}
        width={LEFT_RULER_WIDTH_PX}
        x={0}
        y={0}
      />

      {tickValuesX.map((valueMm) => {
        const screenX = worldToScreen({ x: valueMm, y: 0 }, viewport).x

        if (
          screenX < LEFT_RULER_WIDTH_PX - 1 ||
          screenX > viewport.canvasSizePx.width + 1
        ) {
          return null
        }

        return (
          <Line
            key={`x-${valueMm}`}
            points={[screenX, 0, screenX, TOP_RULER_HEIGHT_PX]}
            stroke="rgba(141, 201, 220, 0.28)"
            strokeWidth={1}
          />
        )
      })}

      {tickValuesY.map((valueMm) => {
        const screenY = worldToScreen({ x: 0, y: valueMm }, viewport).y

        if (
          screenY < TOP_RULER_HEIGHT_PX - 1 ||
          screenY > viewport.canvasSizePx.height + 1
        ) {
          return null
        }

        return (
          <Line
            key={`y-${valueMm}`}
            points={[0, screenY, LEFT_RULER_WIDTH_PX, screenY]}
            stroke="rgba(141, 201, 220, 0.28)"
            strokeWidth={1}
          />
        )
      })}

      {tickValuesX.map((valueMm) => {
        const screenX = worldToScreen({ x: valueMm, y: 0 }, viewport).x

        if (
          screenX < LEFT_RULER_WIDTH_PX + 2 ||
          screenX > viewport.canvasSizePx.width - 30
        ) {
          return null
        }

        return (
          <Text
            fill="#95aab6"
            fontFamily="IBM Plex Mono, SFMono-Regular, monospace"
            fontSize={9}
            key={`xlabel-${valueMm}`}
            text={`${Math.round(valueMm)} mm`}
            x={screenX + 4}
            y={7}
          />
        )
      })}

      {tickValuesY.map((valueMm) => {
        const screenY = worldToScreen({ x: 0, y: valueMm }, viewport).y

        if (
          screenY < TOP_RULER_HEIGHT_PX + 2 ||
          screenY > viewport.canvasSizePx.height - 10
        ) {
          return null
        }

        return (
          <Text
            fill="#95aab6"
            fontFamily="IBM Plex Mono, SFMono-Regular, monospace"
            fontSize={9}
            key={`ylabel-${valueMm}`}
            rotation={-90}
            text={`${Math.round(valueMm)} mm`}
            x={14}
            y={screenY + 2}
          />
        )
      })}

      {cursorScreenPx && cursorScreenPx.x >= LEFT_RULER_WIDTH_PX && cursorScreenPx.x <= viewport.canvasSizePx.width ? (
        <Line
          points={[cursorScreenPx.x, 0, cursorScreenPx.x, TOP_RULER_HEIGHT_PX]}
          stroke="rgba(141, 201, 220, 0.45)"
          strokeWidth={1}
        />
      ) : null}

      {cursorScreenPx && cursorScreenPx.y >= TOP_RULER_HEIGHT_PX && cursorScreenPx.y <= viewport.canvasSizePx.height ? (
        <Line
          points={[0, cursorScreenPx.y, LEFT_RULER_WIDTH_PX, cursorScreenPx.y]}
          stroke="rgba(141, 201, 220, 0.45)"
          strokeWidth={1}
        />
      ) : null}
    </>
  )

  return renderInLayer ? (
    <Layer listening={false}>{content}</Layer>
  ) : (
    <Fragment>{content}</Fragment>
  )
}

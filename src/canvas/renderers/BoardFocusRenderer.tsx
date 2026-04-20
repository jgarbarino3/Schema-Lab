import type { KonvaEventObject } from 'konva/lib/Node'
import { Layer, Rect } from 'react-konva'
import { SINGLE_BREADBOARD_SURFACE_ID } from '../../domain/types'
import { getWorkspacePrimaryBreadboard } from '../../domain/workspace'
import { createLiveBreadboardSurfaceDescriptor } from './surfaceDescriptors'
import { LiveSurfaceLayer } from './LiveSurfaceLayer'
import { LiveSceneLayers, type LiveSceneLayersProps } from './LiveSceneLayers'

interface BoardFocusRendererProps extends LiveSceneLayersProps {
  onBackgroundSelect: (
    event?: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => void
  onSelectBreadboard: (
    surfaceId: string,
    event?: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => void
}

export function BoardFocusRenderer({
  onBackgroundSelect,
  onSelectBreadboard,
  ...sceneLayersProps
}: BoardFocusRendererProps) {
  const primaryBreadboard = getWorkspacePrimaryBreadboard(sceneLayersProps.scene)
  const surface = createLiveBreadboardSurfaceDescriptor({
    anchorMm: { x: 0, y: 0 },
    breadboard: primaryBreadboard,
    id: SINGLE_BREADBOARD_SURFACE_ID,
    label: primaryBreadboard.label,
  })
  const isSelected =
    sceneLayersProps.selection.type === 'breadboard' &&
    sceneLayersProps.selection.surfaceId === SINGLE_BREADBOARD_SURFACE_ID

  return (
    <>
      <Layer>
        <Rect
          fillRadialGradientStartPoint={{
            x: sceneLayersProps.viewport.canvasSizePx.width / 2,
            y: sceneLayersProps.viewport.canvasSizePx.height / 2,
          }}
          fillRadialGradientStartRadius={0}
          fillRadialGradientEndPoint={{
            x: sceneLayersProps.viewport.canvasSizePx.width / 2,
            y: sceneLayersProps.viewport.canvasSizePx.height / 2,
          }}
          fillRadialGradientEndRadius={Math.max(
            sceneLayersProps.viewport.canvasSizePx.width,
            sceneLayersProps.viewport.canvasSizePx.height,
          )}
          fillRadialGradientColorStops={[0, '#111920', 1, '#0b1014']}
          height={sceneLayersProps.viewport.canvasSizePx.height}
          name="stage-background-hit"
          onClick={(event) => onBackgroundSelect(event)}
          onTap={(event) => onBackgroundSelect(event)}
          width={sceneLayersProps.viewport.canvasSizePx.width}
          x={0}
          y={0}
        />

        <LiveSurfaceLayer
          anchorMm={surface.anchorMm}
          isFocused
          isSelected={isSelected}
          onSelect={(event) => onSelectBreadboard(SINGLE_BREADBOARD_SURFACE_ID, event)}
          showLabels={sceneLayersProps.showLabels}
          surface={surface}
          viewport={sceneLayersProps.viewport}
        />
      </Layer>

      <LiveSceneLayers {...sceneLayersProps} />
    </>
  )
}

import type { KonvaEventObject } from 'konva/lib/Node'
import { Layer } from 'react-konva'
import { SINGLE_BREADBOARD_SURFACE_ID } from '../../domain/types'
import { getWorkspacePrimaryBreadboard } from '../../domain/workspace'
import { createLiveBreadboardSurfaceDescriptor } from './surfaceDescriptors'
import { LiveSurfaceLayer } from './LiveSurfaceLayer'
import { LiveSceneLayers, type LiveSceneLayersProps } from './LiveSceneLayers'

interface BoardFocusRendererProps extends LiveSceneLayersProps {
  onSelectBreadboard: (
    surfaceId: string,
    event?: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => void
}

export function BoardFocusRenderer({
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

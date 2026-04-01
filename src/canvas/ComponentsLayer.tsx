import { Layer } from 'react-konva'
import { screenToWorld } from '../domain/geometry'
import type { ComponentInstance, ViewportState } from '../domain/types'
import { ComponentNode } from './ComponentNode'

interface ComponentsLayerProps {
  components: ComponentInstance[]
  selectedComponentId?: string
  onMoveComponent: (
    componentId: string,
    anchorMm: { x: number; y: number },
    phase: 'drag' | 'drop',
  ) => void
  onSelectComponent: (componentId: string) => void
  viewport: ViewportState
}

export function ComponentsLayer({
  components,
  selectedComponentId,
  onMoveComponent,
  onSelectComponent,
  viewport,
}: ComponentsLayerProps) {
  return (
    <Layer>
      {components.map((component) => (
        <ComponentNode
          instance={component}
          isSelected={component.id === selectedComponentId}
          key={component.id}
          onMove={(componentId, screenPointPx, phase) => {
            onMoveComponent(
              componentId,
              screenToWorld(screenPointPx, viewport),
              phase,
            )
          }}
          onSelect={onSelectComponent}
          viewport={viewport}
        />
      ))}
    </Layer>
  )
}

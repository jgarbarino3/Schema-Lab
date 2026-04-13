import { useMemo } from 'react'
import { Layer, Stage } from 'react-konva'
import { ComponentNodeView } from '../canvas/ComponentNode'
import {
  createDefaultComponentConfig,
  getResolvedComponentSpec,
} from '../domain/componentCatalog'
import { createViewportForBounds, expandBoundsMm } from '../domain/geometry'
import type {
  ComponentType,
  RenderMode,
  SimpleIconStyle,
} from '../domain/types'

const PREVIEW_WIDTH = 124
const PREVIEW_HEIGHT = 86
const PREVIEW_PADDING_MM = 10

interface ComponentCatalogPreviewProps {
  className?: string
  renderMode: RenderMode
  simpleIconStyle?: SimpleIconStyle
  type: ComponentType
  variantId: string
}

export function ComponentCatalogPreview({
  className,
  renderMode,
  simpleIconStyle,
  type,
  variantId,
}: ComponentCatalogPreviewProps) {
  const instance = useMemo(() => {
    const spec = getResolvedComponentSpec(type, variantId)
    return {
      id: `catalog-preview-${type}-${variantId}-${renderMode}-${simpleIconStyle ?? 'default'}`,
      type,
      label: spec.shortVariantLabel,
      variantId,
      anchorMm: { x: 0, y: 0 },
      rotationQuarterTurns: 0 as const,
      simpleIconStyleOverride: simpleIconStyle,
      config: createDefaultComponentConfig(type, variantId),
    }
  }, [renderMode, simpleIconStyle, type, variantId])

  const viewport = useMemo(() => {
    const spec = getResolvedComponentSpec(type, variantId)
    const previewBounds = expandBoundsMm(spec.hitBoundsMm, PREVIEW_PADDING_MM)
    return createViewportForBounds(previewBounds, {
      width: PREVIEW_WIDTH,
      height: PREVIEW_HEIGHT,
    })
  }, [type, variantId])

  return (
    <Stage className={className} height={PREVIEW_HEIGHT} width={PREVIEW_WIDTH}>
      <Layer listening={false}>
        <ComponentNodeView
          instance={instance}
          isDragEnabled={false}
          isSelected={false}
          renderMode={renderMode}
          showLabels={false}
          simpleIconStyle={simpleIconStyle}
          viewport={viewport}
        />
      </Layer>
    </Stage>
  )
}

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Layer, Rect, Stage } from 'react-konva'
import { ComponentNodeView } from '../canvas/ComponentNode'
import { BreadboardLayer } from '../canvas/BreadboardLayer'
import { createExportViewport } from '../domain/exportLayout'
import { screenToWorld } from '../domain/geometry'
import { resolveScenePlacement } from '../domain/placement'
import { getSurfaceSupportCompensationMm } from '../domain/workspace'
import type {
  BoundsMm,
  RenderMode,
  SceneDocument,
  SimpleIconStyle,
  Vector2Mm,
} from '../domain/types'
import type {
  ImportPreviewDocument,
  ImportPreviewItem,
  SvgImportAnalysis,
  SvgImportMode,
  SvgImportWorkspaceConfig,
} from '../domain/svgImport'
import {
  buildImportDraftScene,
  updatePreviewItemFromWorldDelta,
} from './importPreviewSession'

interface SvgImportBoardPreviewProps {
  analysis: SvgImportAnalysis
  appendBreadboardCenterMm?: Vector2Mm
  className?: string
  document: ImportPreviewDocument
  hostSurfaceId?: string
  millimetersPerUnit: number
  mode: SvgImportMode
  onSelectPreviewItem?: (itemId: string) => void
  onUpdatePreviewItem?: (itemId: string, center: Vector2Mm, bounds: BoundsMm) => void
  previewItems: ImportPreviewItem[]
  renderMode: RenderMode
  selectedPreviewItemId?: string
  simpleIconStyle?: SimpleIconStyle
  showLabels?: boolean
  workspaceConfig: SvgImportWorkspaceConfig
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState({ height: 0, width: 0 })

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }

    const updateSize = () => {
      const rect = element.getBoundingClientRect()
      setSize({
        height: Math.max(0, Math.round(rect.height)),
        width: Math.max(0, Math.round(rect.width)),
      })
    }

    updateSize()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize)
      return () => window.removeEventListener('resize', updateSize)
    }

    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    window.addEventListener('resize', updateSize)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateSize)
    }
  }, [])

  return [ref, size] as const
}

function createPreviewSceneKindLabel(scene: SceneDocument) {
  return scene.workspace.kind === 'optical-table' ? 'Table result' : 'Board result'
}

export function SvgImportBoardPreview({
  analysis,
  appendBreadboardCenterMm,
  className,
  document,
  hostSurfaceId,
  millimetersPerUnit,
  mode,
  onSelectPreviewItem,
  onUpdatePreviewItem,
  previewItems,
  renderMode,
  selectedPreviewItemId,
  simpleIconStyle,
  showLabels = true,
  workspaceConfig,
}: SvgImportBoardPreviewProps) {
  const [containerRef, size] = useElementSize<HTMLDivElement>()
  const draft = useMemo(
    () =>
      buildImportDraftScene({
        analysis,
        appendBreadboardCenterMm,
        document,
        hostSurfaceId,
        millimetersPerUnit,
        mode,
        previewItems,
        workspaceConfig,
      }),
    [
      analysis,
      appendBreadboardCenterMm,
      document,
      hostSurfaceId,
      millimetersPerUnit,
      mode,
      previewItems,
      workspaceConfig,
    ],
  )
  const viewport = useMemo(() => {
    const canvasSizePx = {
      height: Math.max(320, size.height || 0),
      width: Math.max(320, size.width || 0),
    }

    return createExportViewport(draft.scene, 'full-scheme', canvasSizePx)
  }, [draft.scene, size.height, size.width])
  const componentPreviewItems = useMemo(
    () => previewItems.filter((item) => item.disposition === 'component'),
    [previewItems],
  )
  const componentPreviewItemIdsByDraftComponentId = useMemo(
    () =>
      new Map(
        draft.componentBindings.map(
          (binding) => [binding.componentId, binding.previewItemId] as const,
        ),
      ),
    [draft.componentBindings],
  )
  const [dragState, setDragState] = useState<{
    componentId: string
    previewItemId: string
    startSourceCenter: Vector2Mm
    startWorldAnchor: Vector2Mm
  } | null>(null)

  const selectPreviewItemForComponent = (componentId: string) => {
    const previewItemId = componentPreviewItemIdsByDraftComponentId.get(componentId)
    if (!previewItemId) {
      return
    }

    onSelectPreviewItem?.(previewItemId)
  }

  const getPreviewItemFromComponentId = (componentId: string) => {
    const previewItemId = componentPreviewItemIdsByDraftComponentId.get(componentId)
    if (!previewItemId) {
      return undefined
    }

    return previewItems.find((item) => item.id === previewItemId)
  }

  const updatePreviewItemForWorldAnchor = (args: {
    componentId: string
    worldAnchorMm: Vector2Mm
  }) => {
    const previewItem = getPreviewItemFromComponentId(args.componentId)
    if (!previewItem || !onUpdatePreviewItem) {
      return
    }

    const sourceDelta = dragState
      ? {
          x: args.worldAnchorMm.x - dragState.startWorldAnchor.x,
          y: args.worldAnchorMm.y - dragState.startWorldAnchor.y,
        }
      : { x: 0, y: 0 }
    const nextPreviewItem = updatePreviewItemFromWorldDelta({
      millimetersPerUnit,
      previewItem: {
        ...previewItem,
        center: dragState?.startSourceCenter ?? previewItem.center,
      },
      worldDeltaMm: sourceDelta,
    })

    onUpdatePreviewItem(args.componentId, nextPreviewItem.center, nextPreviewItem.bounds)
  }

  return (
    <div className={className} data-testid="drawing-import-board-preview" ref={containerRef}>
      <Stage height={size.height || 360} width={size.width || 640}>
        <Layer listening={false}>
          <Rect
            fill="rgba(6, 9, 12, 0.44)"
            height={viewport.canvasSizePx.height}
            width={viewport.canvasSizePx.width}
            x={0}
            y={0}
          />

          {draft.scene.workspace.kind === 'optical-table' ? (
            <>
              <BreadboardLayer
                anchorMm={{ x: 0, y: 0 }}
                breadboard={{
                  label: draft.scene.workspace.table.label,
                  widthMm: draft.scene.workspace.table.widthMm,
                  heightMm: draft.scene.workspace.table.heightMm,
                  holeSpacingMm: draft.scene.workspace.table.holeSpacingMm,
                  edgeMarginMm: draft.scene.workspace.table.edgeMarginMm,
                  thicknessMm: draft.scene.workspace.table.thicknessMm,
                  finish: 'clear-anodized',
                  holeDensity: draft.scene.workspace.table.holeDensity,
                  counterborePattern: draft.scene.workspace.table.counterborePattern,
                }}
                isSelected={false}
                onSelect={() => undefined}
                palette={{
                  boardFill: '#a8b0b6',
                  boardStroke: '#d4dae0',
                  holeFill: '#6f777f',
                  labelColor: '#16202a',
                }}
                renderInLayer={false}
                viewport={viewport}
              />

              {draft.scene.workspace.breadboards.map((breadboard) => (
                <BreadboardLayer
                  anchorMm={breadboard.anchorMm}
                  breadboard={{
                    ...breadboard.model,
                    label: breadboard.label,
                  }}
                  isSelected={false}
                  key={breadboard.id}
                  onSelect={() => undefined}
                  renderInLayer={false}
                  rotationQuarterTurns={breadboard.rotationQuarterTurns}
                  viewport={viewport}
                />
              ))}
            </>
          ) : (
            <BreadboardLayer
              anchorMm={{ x: 0, y: 0 }}
              breadboard={draft.scene.workspace.breadboard}
              isSelected={false}
              onSelect={() => undefined}
              renderInLayer={false}
              viewport={viewport}
            />
          )}
        </Layer>

        <Layer>
          {draft.componentBindings.map(({ component, previewItemId }) => {
            const previewItem = componentPreviewItems.find((item) => item.id === previewItemId)
            const isSelected = previewItemId === selectedPreviewItemId
            const canDrag = previewItem?.editability.canMove ?? false

            return (
              <ComponentNodeView
                instance={component}
                isDragEnabled={canDrag}
                isPreview={false}
                isSelected={isSelected}
                key={component.id}
                onDragEnd={(componentId, screenPointPx) => {
                  const worldAnchor = screenToWorld(screenPointPx, viewport)
                  const currentPreviewItem = getPreviewItemFromComponentId(componentId)
                  const draftComponent = draft.scene.components.find(
                    (candidate) => candidate.id === componentId,
                  )

                  if (!currentPreviewItem || !draftComponent) {
                    return
                  }

                  const placement = resolveScenePlacement({
                    candidateAnchorMm: worldAnchor,
                    component: draftComponent,
                    phase: 'drop',
                    scene: draft.scene,
                    snapMode: 'onDrop',
                  })

                  const anchorMm = placement.resolvedAnchorMm
                  const worldDelta = dragState
                    ? {
                        x: anchorMm.x - dragState.startWorldAnchor.x,
                        y: anchorMm.y - dragState.startWorldAnchor.y,
                      }
                    : { x: 0, y: 0 }

                  const nextPreviewItem = updatePreviewItemFromWorldDelta({
                    millimetersPerUnit,
                    previewItem: {
                      ...currentPreviewItem,
                      center: dragState?.startSourceCenter ?? currentPreviewItem.center,
                    },
                    worldDeltaMm: worldDelta,
                  })

                  onUpdatePreviewItem?.(
                    previewItemId,
                    nextPreviewItem.center,
                    nextPreviewItem.bounds,
                  )
                  setDragState(null)
                }}
                onDragMove={(componentId, screenPointPx) => {
                  const worldAnchor = screenToWorld(screenPointPx, viewport)
                  updatePreviewItemForWorldAnchor({
                    componentId,
                    worldAnchorMm: worldAnchor,
                  })
                }}
                onDragStart={(componentId) => {
                  const previewItem = getPreviewItemFromComponentId(componentId)
                  const draftComponent = draft.scene.components.find(
                    (candidate) => candidate.id === componentId,
                  )

                  if (!previewItem || !draftComponent) {
                    return
                  }

                  setDragState({
                    componentId,
                    previewItemId,
                    startSourceCenter: previewItem.center,
                    startWorldAnchor: draftComponent.anchorMm,
                  })
                  onSelectPreviewItem?.(previewItemId)
                }}
                onHoverChange={undefined}
                onSelect={(componentId) => {
                  selectPreviewItemForComponent(componentId)
                }}
                renderMode={renderMode}
                showLabels={showLabels}
                simpleIconStyle={simpleIconStyle}
                surfaceSupportCompensationMm={getSurfaceSupportCompensationMm(
                  draft.scene,
                  component.hostSurfaceId,
                )}
                viewport={viewport}
              />
            )
          })}
        </Layer>
      </Stage>

      <div className="svg-import-board-preview__caption">
        <span>{createPreviewSceneKindLabel(draft.scene)}</span>
        <span>
          {componentPreviewItems.length} component
          {componentPreviewItems.length === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  )
}
